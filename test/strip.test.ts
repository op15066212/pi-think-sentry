import test from "node:test";
import assert from "node:assert/strict";
import strip from "../src/features/strip.ts";
import { judgeThinking, judgeCfg } from "../src/judges.ts";

// 2026-11-21：这一套在验「删行不自己判」。
//
// 改之前 strip 里有一份自己的重复行计数（dupLinesOf），等于第二条 dup 判据，
// 而它的门槛可以比判据低——判据说干净、它却动手，等于没判红就改历史。
// 上一版用 max(自己的 min, 判据门槛) 打补丁；现在改成只消费判据给的 dups。

const one = (thinking: string) => [{ type: "thinking", thinking }];
const textOf = (r: any) => r?.content?.[0]?.thinking ?? null;
// 默认 cfg 就是两条都开、门槛 3（2026-11-22：配置从参数进，不再有全局 setter）。
const gate = (t: string) => judgeThinking(t);

test("判据认定重复行：按门槛删掉", () => {
  const think = "甲\n甲\n甲\n甲\n乙";
  const v = gate(think);
  assert.equal(v.kind, "strip", "前提：判据红了");
  const r = strip.clean(one(think), v, 3);
  assert.equal(r.cleaned, true);
  assert.equal(textOf(r), "乙");
});

test("删行门槛更高：允许少删（这是使用者要的独立门槛）", () => {
  const think = "甲\n甲\n甲\n甲\n乙";
  const v = gate(think);
  const r = strip.clean(one(think), v, 5);
  assert.equal(r.cleaned, false, "够不着 5 就不动手");
  assert.equal(textOf(r), think);
});

test("判据说干净：门槛设到 2 也一格都不许动", () => {
  const think = "甲\n甲\n乙";          // 甲 出现 2 次，判据认为干净
  const v = gate(think);
  assert.equal(v.kind, "none", "前提：判据认为干净");
  const r = strip.clean(one(think), v, 2); // 门槛故意低于判据
  assert.equal(r.cleaned, false, "没有判据的许可，删行不许动手");
  assert.equal(textOf(r), think);
});

test("判据判的是语言错：不删（语言错不是删行的理由）", () => {
  const think = [
    "I should read the config file first.",
    "Then check whether the threshold is written in code.",
    "Or whether it is written in config instead.",
  ].join("\n");
  const v = gate(think);
  assert.equal(v.kind, "retract", "前提：判据判的是语言");
  const r = strip.clean(one(think), v, 3);
  assert.equal(r.cleaned, false);
});

test("没有判据结果就不删：dup 关掉时删行不工作（有意的代价）", () => {
  const think = "甲\n甲\n甲\n甲\n乙";
  const v = judgeThinking(think, judgeCfg({ dupOn: false }));
  assert.equal(v.kind, "none", "dup 关掉，判据不说重复行");
  const r = strip.clean(one(think), v, 3);
  assert.equal(r.cleaned, false, "以前能删是因为它自己偷偷判了一遍，那正是问题");
});

test("畸形判据：没有 dups 就当没有重复行", () => {
  const think = "甲\n甲\n甲\n甲";
  assert.equal(strip.clean(one(think), undefined, 3).cleaned, false);
  assert.equal(strip.clean(one(think), {}, 3).cleaned, false);
  assert.equal(strip.clean(one(think), { ev: {} }, 3).cleaned, false);
});

// ── 以下四条 2026-11-26 从 test/install.test.ts 迁来 ──
// 为什么迁：那四条原来通过 turn_end 返回的 entries 观察 strip 的产物，
// 而用户决定「插件不再注入任何内容」后，轮末一个字节都不写盘，观察点消失。
// 它们要证的性质本来就是 strip.clean 的输出，直接调纯函数更精确。
const FRAG = "读完配置后我把三个阈值都记下来，然后逐条核对它们是不是写在同一个文件里。\n（执行）done。\n（执行）done。\n（执行）done。\n（执行）done。";

test("碎片：按行剔除重复行，改后的文本不再含那句碎片", () => {
  const v = gate(FRAG);
  assert.equal(v.kind, "strip", "前提：判据红了");
  const r = strip.clean(one(FRAG), v, 3);
  assert.equal(r.cleaned, true);
  const thought = textOf(r);
  assert.ok(thought.length < FRAG.length, "剔除之后应当变短");
  assert.ok(!thought.includes("（执行）done。"), "重复行应当被删干净，实际：" + thought.slice(0, 80));
});

test("多块思考：只改有重复行的那一块，另一块逐字不变", () => {
  const B = "第二块思考写完整，不含碎片，用来验证不会被灌成同一段。";
  const v = gate(FRAG);
  const r = strip.clean([{ type: "thinking", thinking: FRAG }, { type: "text", text: "回答" }, { type: "thinking", thinking: B }], v, 3);
  const blocks = r.content.filter((c: any) => c.type === "thinking");
  assert.equal(blocks.length, 2, "两块都还在");
  assert.ok(blocks[0].thinking.length < FRAG.length, "第一块被改短");
  assert.equal(blocks[1].thinking, B, "第二块必须逐字不变");
});

test("多块思考：重复行在第二块时只改第二块，第一块逐字不变", () => {
  const A = "第一块是干净的完整句子，不含任何碎片，用来断言它逐字保留。";
  const v = gate(FRAG);
  const r = strip.clean([{ type: "thinking", thinking: A }, { type: "text", text: "回答" }, { type: "thinking", thinking: FRAG }], v, 3);
  const blocks = r.content.filter((c: any) => c.type === "thinking");
  assert.equal(blocks[0].thinking, A, "第一块必须逐字不变");
  assert.ok(blocks[1].thinking.length < FRAG.length, "第二块被改短");
});

test("整块都是碎片：有正文就删光；只剩思考时留占位，不回退原文", () => {
  const wall = Array.from({ length: 30 }, () => "做。").join("\n");
  const v = gate(wall);
  assert.equal(v.kind, "strip", "前提：判据红了");
  // 有正文：thinking 删空不留空白块，正文块原样
  const r1 = strip.clean([{ type: "thinking", thinking: wall }, { type: "text", text: "回答" }], v, 3);
  assert.ok(r1.content.some((c: any) => c.type === "text"), "正文块要留着");
  for (const b of r1.content.filter((c: any) => c.type === "thinking")) {
    assert.ok(String(b.thinking).trim().length > 0, "不该留下只有换行的空 thinking 块");
  }
  // 只有 thinking：留一句指针占位，不自造句子
  const r2 = strip.clean([{ type: "thinking", thinking: wall }], v, 3);
  const kept = String(r2.content.find((c: any) => c.type === "thinking")?.thinking || "");
  assert.ok(kept.trim().length > 0, "空守护：删空之后必须留一句，不能是空白");
  assert.ok(!kept.includes("做。"), "重复行已经删掉了，不该留原文");
  assert.match(kept, /\[原第 \d+-\d+ 行共 \d+ 行，全部重复已删\]/, "占位句要指得到行号");
});
