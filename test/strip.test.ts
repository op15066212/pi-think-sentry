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
