// 回边：我们对模型说的话，也要过一遍判它的判据。
//
// SAY_BLOCK / SAY_LANG 会被写进模型上下文，模型会读到。如果这两段本身就能被判红，
// 那就是在我们教模型写碎片——判据判模型的话，也判我们对模型说的话。
import test from "node:test";
import assert from "node:assert/strict";
import { judgeThinking } from "../src/judges.ts";
import { SAY_BLOCK, SAY_LANG } from "../src/index.ts";

const STRIP = {
  kind: "strip",
  rule: "dup",
  ev: { blk: "做。", reps: 3, why: "3次" },
};

test("提示文本自己不过判据", () => {
  const cases = [
    ["SAY_BLOCK", SAY_BLOCK(STRIP)],
    ["SAY_LANG-zh", SAY_LANG({ kind: "retract", rule: "lang", ev: { cjk: 0, lat: 90, lines: 3, dir: "zh" } })],
    ["SAY_LANG-en", SAY_LANG({ kind: "retract", rule: "lang", ev: { cjk: 9, lat: 0, lines: 3, dir: "en" } })],
  ];
  for (const [name, s] of cases) {
    const got = judgeThinking(s);
    assert.equal(got.kind, "none", name + " 被判红了，等于我们在教模型写碎片：" + String(s).slice(0, 60));
  }
});

test("提示文本里贴的那行复诵不构成新的复诵", () => {
  // SAY_BLOCK 会把 ev.blk 原样贴回去（模型要知道什么被拦了）。贴一次不算复诵。
  const s = SAY_BLOCK({ ...STRIP, ev: { blk: "（执行）done。", reps: 99, why: "99次" } });
  assert.equal(judgeThinking(s).kind, "none", "贴一次不该被判红");
  // 反向：真的贴三次就该红——证明这条判据不是靠「提示文本很短」蒙过去的。
  const EMPTY = { ...STRIP, ev: { ...STRIP.ev, blk: "" } };
  const bad = SAY_BLOCK(EMPTY) + "\n\n做。\n做。\n做。\n做。";
  const n = bad.split("\n").filter((l) => l.trim() === "做。").length;
  assert.equal(n, 4, "坏样本里「做。」应恰好四次，实际 " + n);
  assert.equal(judgeThinking(bad).kind, "strip", "贴三次应该红，否则判据没生效");
});
