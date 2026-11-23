import test from "node:test";
import assert from "node:assert/strict";

import { judgeThinking, collapseRange, sentencesOf } from "../src/judges.ts";
import { Verdict, templateKeyOf, KINDS, assertNever } from "../src/verdict.ts";
import strip from "../src/features/strip.ts";

// 判据二（尾部坍缩）的三次演化，用测试钉住形状：
//   v1 dup 按行计数 → 模型把重复压进一行 → 漏
//   v2 inline 连续相同 → 模型改交替 / 换词不换结构 → 漏
//   v3 最长坍缩区间：uniq/len ≤ 1/4 且 len ≥ 12
//
// 这些用例的用途不是「证明它好」，是「以后改坏了会红」：
// 三条坏样本各对应一次真实绕过，一条好样本对应最容易被误判的正常文本。

const DEGEN = {
  "v1 一行内连续 20 次 ok": "跑。快。" + "ok。".repeat(20),
  "v2 交替 AB 8 轮": ("跑。ok。\n").repeat(8),
  "v3 换词不换结构 40 句": Array.from({ length: 40 }, (_, i) =>
    ["执行。ok。", "跑。ok。", "好。执行。ok。", "简洁。ok。"][i % 4]).join("\n"),
};

const NORMAL = {
  "正常列举": "剩 7 条：\n1. DeepSeek Harness\n2. FlClash\n3. 技能\n4. DSH 插件 ×4\n跑完再核对台账。",
  "三步式短句（不足 12 句）": "做完。跑。看。",
  "正常强调": "好，很好。那就先跑判据，再补边集覆盖，最后看冷热面。",
  "长文但多样": Array.from({ length: 20 }, (_, i) =>
    `第 ${i} 步要检查 ${["边集", "桥", "冷热面", "写者", "副本数"][i % 5]} 的第 ${i} 个项目。`).join("\n"),
};

for (const [name, text] of Object.entries(DEGEN)) {
  test("退化必须判红：" + name, () => {
    const v = judgeThinking(text);
    assert.notEqual(v.kind, "none", "应判红，实际 none");
  });
}

for (const [name, text] of Object.entries(NORMAL)) {
  test("正常文本不得误判：" + name, () => {
    const v = judgeThinking(text);
    assert.equal(v.kind, "none", "不应判红，实际 " + v.kind + " " + (v.ev?.why ?? ""));
  });
}

test("坍缩判据：最长坍缩区间，位置不固定", () => {
  // 前 20 句正常、中间 30 句坍缩、后面又正常——「只扫尾部」的旧实现会漏
  const head = Array.from({ length: 20 }, (_, i) => `第 ${i} 句是正常内容，检查第 ${i} 项。`);
  const mid = Array.from({ length: 30 }, () => "跑。ok。");
  const tail = Array.from({ length: 20 }, (_, i) => `收尾第 ${i} 句，确认完成。`);
  const text = [...head, ...mid, ...tail].join("\n");
  const c = collapseRange(text, 0.25, 12);
  assert.ok(c, "应找到坍缩区间");
  assert.ok(c.len >= 30, "区间至少覆盖中段 30 句，实际 " + c.len);
  assert.ok(c.ratio <= 0.25, "区间内唯一性应达标，实际 " + c.ratio);
});

test("折叠：按行区间折叠，区间外内容原样保留", () => {
  const head = ["开头第一行，正常。", "开头第二行，正常。"];
  // 每行都不同（dup 不会命中），但整段只有 3 种句子 → 只有坍缩判据能抓
  const mid = Array.from({ length: 20 }, (_, i) => ["执行。ok。", "跑。ok。", "好。执行。ok。"][i % 3]);
  const tail = ["结尾第一行，正常。"];
  const text = [...head, ...mid, ...tail].join("\n");
  // 直接构造 fold 判决：这一条测的是「fold 的处置」，不是「谁先命中」。
  // dup 对整行重复也会判红（那是另一条路），两个判据谁先到不该影响折叠测试。
  const ev = collapseRange(text, 0.25, 12);
  assert.ok(ev, "应能找到坍缩区间");
  const v = Verdict.parse({ kind: "fold", rule: "inline", ev: { blk: ev.sample, reps: 6, why: "test", dups: [[ev.sample, ev.len, [ev.line - 1]]], line: ev.line, lineTo: ev.lineTo, len: ev.len, unique: ev.unique, ratio: ev.ratio } });
  const cfg = strip.configure({});
  const res = strip.clean([{ type: "thinking", thinking: text }], v, cfg.min);
  assert.equal(res.cleaned, true);
  const after = String(res.content[0].thinking);
  assert.ok(after.includes("开头第一行"), "区间前的内容要保留");
  assert.ok(after.includes("结尾第一行"), "区间后的内容要保留");
  assert.ok(/\[\d+ 句、共 \d+-\d+ 行坍缩成 \d+ 种，已折叠\]/.test(after), "要有折叠标记");
  assert.ok(after.length < text.length, "折叠后应更短");
  assert.equal(judgeThinking(after).kind, "none", "折叠后不应再判红同一段");
});

test("类型：Verdict 是依赖和类型，非法组合写不出来", () => {
  // strip 只允许 dup；fold 只允许 inline；retract 只允许 lang。
  assert.throws(() => Verdict.parse({ kind: "strip", rule: "inline", ev: { blk: "x", reps: 9, why: "9次", dups: [["x", 9, [0]]], line: 1 } }),
    /不准许|不允许|不允许 rule/, "strip×inline 在类型里不存在，parse 必须拒绝");
  assert.throws(() => Verdict.parse({ kind: "fold", rule: "dup", ev: { blk: "x", reps: 9, why: "9次", dups: [["x", 9, [0]]], line: 1 } }),
    /不允许/, "fold×dup 同样不存在");
});

test("穷尽性：每个 kind 都有模板键（加构造子时这里会红）", () => {
  for (const k of KINDS) {
    const key = templateKeyOf({ kind: k, rule: k === "strip" ? "dup" : k === "fold" ? "inline" : k === "retract" ? "lang" : "dup", ev: {} });
    assert.ok(["dup", "lang", "clean", "inline"].includes(key), k + " 的模板键不合法：" + key);
  }
  // assertNever 在类型上不可达，运行时必须抛（否则加 kind 漏改不会发现）
  assert.throws(() => assertNever("bogus" as never), /未穷尽的 kind/);
});
