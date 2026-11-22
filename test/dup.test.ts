// dup 判据：同一行复诵。这是这个插件唯一的「碎片」判据。
//
// 口径来自使用者 2026-11-17 的定义：按 \n 拆行、排序、滑窗数重复，同一行 >= dup.min（默认 4）次即判。
// 实测命中 2475/21278（11.6%），最常见的重复行是
//   跑。971 / 做。388 / 接着执行。253 / **跑**。212 / 执行。197 / （执行）done。196
// 逐段读过原文，全是退化。
import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeThinking, dupJudge, DUP_MIN } from "../src/judges.ts";
import { stripDupLines } from "../src/cut.ts";

// 删行读的是判据的记录，测试也走同一条路：先判，再删。
// 判据给的是《行、次数、行号》，删行只吃行号。
const dupsOf = (t) => (dupJudge(t).ev.dups || []).flatMap((x) => x[2] || []);

const 长句 = "读完配置后我把三个阈值都记下来，然后逐条核对它们是不是写在同一个文件里，确认没有第二处也定义了这个值。";
const 复诵 = "（执行）done。";

test("同一行 >= dup.min 次判红，reps 与 blk 都对得上", () => {
  const t = Array(DUP_MIN).fill(复诵).join("\n");
  const v = dupJudge(t);
  assert.equal(v.kind, "strip");
  assert.equal(v.ev.reps, DUP_MIN);
  assert.equal(v.ev.blk, 复诵);
});

test("三次不判红：门槛是四次", () => {
  // 为 0.038% 的残余漏判把门槛降到 2 会让「两次同句」天天红，不划算。
  assert.equal(dupJudge(Array(2).fill(复诵).join("\n")).kind, "none");
});

test("短行复诵也要判红：行长不是理由", () => {
  const t = "读一下配置。\n" + Array(10).fill("**发**。").join("\n") + "\n然后跑测试看退出码。";
  const v = dupJudge(t);
  assert.equal(v.kind, "strip");
  assert.equal(v.ev.reps, 10);
  assert.equal(v.ev.blk, "**发**。");
});

test("长行复诵也判红：37 字一句重复 12 次", () => {
  const line = "这一句有三十七个汉字用来模拟真实会话里被复诵的长句子长度够不够";
  assert.equal(dupJudge(Array(12).fill(line).join("\n")).kind, "strip");
});

test("表格行重复也判红：判定只看次数，不分类别", () => {
  const t = Array(6).fill("| 大模型 | file |").join("\n") + "\n" + 长句;
  const v = dupJudge(t);
  assert.equal(v.kind, "strip");
  assert.equal(v.ev.reps, 6);
});

test("围栏里的重复行不判红：代码里的重复是正常的", () => {
  const code = ["\u0060\u0060\u0060js", "return 0;", "return 0;", "return 0;", "return 0;", "\u0060\u0060\u0060"].join("\n");
  assert.equal(dupJudge(长句 + "\n" + code).kind, "none");
});

test("缩进代码块里的重复行也不判红", () => {
  const code = ["    做。", "    做。", "    做。", "    做。"].join("\n");
  assert.equal(dupJudge(长句 + "\n" + code).kind, "none");
});

test("剔除：命中那条整行删掉，其余保留", () => {
  const t = 长句 + "\n" + Array(5).fill(复诵).join("\n") + "\n" + 长句;
  const out = stripDupLines(t, dupsOf(t));
  assert.ok(!out.includes(复诵), "复诵行必须消失");
  assert.ok(out.includes("读完配置后我把三个阈值都记下来"), "长句必须留着");
  assert.equal(out.split("\n").filter(Boolean).length, 2);
});

test("剔除：缩进代码块里的行不许删（与判据同一口径）", () => {
  // 同步组2 2026-11-17 报的缺陷：dupLinesOf 走 bodyLines 会跳缩进行，
  // stripDupLines 曾经只判 FENCE_RE，于是把代码块里的行一起删了。
  const t = "跑。\n跑。\n跑。\n跑。\n    跑。\n";
  const out = stripDupLines(t, dupsOf(t));
  assert.ok(out.includes("    跑。"), "缩进行必须留着，实际 " + JSON.stringify(out));
  assert.equal(out.trim(), "跑。", "只删围栏外的三条");
});

test("跨块复诵：合并判红之后，逐块剔除也要删得动", () => {
  // 第一块两条、第二块两条：单块都不到 dup.min（4），只有合并成一段才够，于是工具调用被拦；
  // 若 turn_end 逐块判，每块都不到四次，就会「拦了但不改」。
  const blocks = ["跑。\n跑。", "跑。\n跑。"];
  const merged = blocks.join("\n");
  const dup = dupsOf(merged);
  assert.equal(dupJudge(merged).kind, "strip", "合并判必须红");
  for (const b of blocks) {
    assert.equal(stripDupLines(b, dup).trim(), "", "块 " + JSON.stringify(b) + " 也要删干净");
  }
});

test("整段只有复诵时删成空串，由调用方决定是否整块删掉", () => {
  const t = Array(DUP_MIN).fill(复诵).join("\n");
  assert.equal(stripDupLines(t, dupsOf(t)).trim(), "");
});

test("judgeThinking 走 dup 分支，rule 是 dup", () => {
  const v = judgeThinking(Array(DUP_MIN).fill(复诵).join("\n"));
  assert.equal(v.kind, "strip");
  assert.equal(v.rule, "dup");
});

// 2026-11-21（复核 6e8dd769 R14）：门槛 3 → 4 之后，必须有一条测试守住「三次不再判红」。
// 没有这条，把 dup.min 改回 3 也能全绿——门槛退回时没人拦。
test("同一行三次不判红（守住 min=4 的下界）", () => {
  const t = "做。\n做。\n做。";
  assert.equal(dupJudge(t).kind, "none", "三次是动作标记的常见次数，min=4 下不该判红");
  // 对照：四次必须判红。缺这条，把 min 改成 99 也能绿。
  assert.equal(dupJudge("做。\n做。\n做。\n做。").kind, "strip", "四次必须判红");
});

// ---- 2026-11-21：删行改成「按行号、从后往前」（使用者要的两条） ----
test("按行号删：删的是行号，不是所有同内容的行", () => {
  const t = "甲\n甲\n甲\n乙";
  // 只给第 3 行（下标 2）——按内容删会把三行全删光。
  assert.equal(stripDupLines(t, [2]), "甲\n甲\n乙", "按行号，删一行就是一行");
});

test("从后往前删：多个行号连删不会错位", () => {
  const t = "a\nb\nc\nd\ne";
  // 删 b(1) d(3) e(4)。从前往后会错位，从后往前不会。
  assert.equal(stripDupLines(t, [4, 1, 3]), "a\nc");
  assert.equal(stripDupLines(t, [1, 3, 4]), "a\nc", "传进来的顺序不影响结果，内部按降序");
});

test("越界行号直接忽略，不抛不越删", () => {
  const t = "a\nb";
  assert.equal(stripDupLines(t, [5, -1, 99]), "a\nb");
});
