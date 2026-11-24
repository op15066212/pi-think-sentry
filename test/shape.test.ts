// 六维结构判据：截图那段与三种退化形状都要判红，正常文本一票不投。
//
// 样本来自用户 2026-11-24 的截图（pideck pr 会话）：每行以「务实：」开头，
// 有的还是「务实：务实：」双层。前三条判据（dup/inline/run）在这段上一律不判。
import test from "node:test";
import assert from "node:assert/strict";
import { shapeOf } from "../src/algo/shape.ts";

const SCREENSHOT = Array.from({ length: 18 }, (_, i) =>
  [
    "务实：关键洞察：我上一轮把 resolveAnchoredTurnWindow 改成锚点在但没命中的分支。",
    "务实：这是我的改动引入的性能灾难。",
    "务实：务实：必须改掉：锚点未命中不能返回全量。",
    "务实：正确做法：用索引里的位置兜底选窗口。",
    "务实：务实：但渲染层没有索引位置。",
    "务实：更根本：用户问能不能只加载可视范围内的。",
  ][i % 6],
).join("\n");

const TAIL_FIXED = Array.from({ length: 14 }, (_, i) =>
  "第 " + (i + 1) + " 项检查完毕，结论是没有问题，记录一下。",
).join("\n");

const SAME_LEN = Array.from({ length: 12 }, (_, i) =>
  "甲" + String(i).padStart(2, "0") + "乙丙丁戊己庚辛壬癸子丑寅卯辰",
).join("\n");

const NORMAL_A = [
  "先看配置文件的默认值，确认三个门槛各自写在哪里。",
  "然后核对磁盘上的实际配置，看有没有人手工改过。",
  "如果两边不一致，说明改过之后没同步，要查是哪一次改动。",
  "最后跑一遍判据，确认改完之后行为没变。",
  "结论写进 HISTORY，不写进代码注释——注释会被下次重构删掉。",
].join("\n");

test("截图那段（行首固定）：判红，且至少两票", () => {
  const s = shapeOf(SCREENSHOT);
  assert.ok(s.votes >= 2, "应当至少两票，实际 " + s.votes + "：" + s.why);
  assert.equal(s.red, true);
});

test("截图那段：行首维度必须越线（那一项是 100%）", () => {
  const s = shapeOf(SCREENSHOT);
  const head = s.dims.find((d) => d.name === "行首");
  assert.ok(head.over, "行首应当越线，实际 " + head.share.toFixed(2));
});

test("行尾固定：判红（换一种形状也要抓得住）", () => {
  const s = shapeOf(TAIL_FIXED);
  assert.equal(s.red, true, "行尾固定应当判红：" + s.why);
  const tail = s.dims.find((d) => d.name === "行尾");
  assert.ok(tail.over, "行尾应当越线");
});

test("行长整齐：判红", () => {
  const s = shapeOf(SAME_LEN);
  assert.equal(s.red, true, "行长整齐应当判红：" + s.why);
});

test("正常散文 A：零票，不判", () => {
  const s = shapeOf(NORMAL_A);
  assert.equal(s.votes, 0, "正常文本不该投票：" + s.why);
  assert.equal(s.red, false);
});

test("整段无缩进不算退化（缩进维度被跳过）", () => {
  const s = shapeOf(NORMAL_A);
  const ind = s.dims.find((d) => d.name === "缩进");
  assert.equal(ind.top, "0", "正常文本确实没有缩进");
  assert.equal(ind.over, false, "无缩进不该算票");
});

test("行数太少不判：三行以内的比例没有统计意义", () => {
  const s = shapeOf("甲乙丙。\n丁戊己。\n庚辛壬。");
  assert.equal(s.red, false);
  assert.equal(s.n, 3);
});

test("同一输入两次结果一致（纯函数）", () => {
  const a = shapeOf(SCREENSHOT);
  const b = shapeOf(SCREENSHOT);
  assert.deepEqual(a.dims.map((d) => d.share), b.dims.map((d) => d.share));
  assert.equal(a.votes, b.votes);
});
