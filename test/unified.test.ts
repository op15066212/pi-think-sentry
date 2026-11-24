// 归一化整体判断的判据。
//
// 四个量全部天然在 [0,1]，几何平均成一个分，只需要一个门槛（0.60）。
// 好样本：三个退化形状各判红，两段正常文本判绿。
// 坏样本：四条，每条都指名「改哪一处会让哪条断言红」。
import test from "node:test";
import assert from "node:assert/strict";
import { unifiedScore, minPeriod } from "../src/algo/unified.ts";
import { judgeThinking } from "../src/judges.ts";

const SENT_TEXT = Array(31).fill("做。").join("\n");

const SCREEN = [
  "务实：把日志打出来看",
  "务实：先跑一次再改",
  "务实：别猜，先验",
  "务实：直接改",
  "务实：务实：务实：务实：",
  "务实：先跑一次再改",
  "务实：别猜，先验",
  "务实：直接改",
  "务实：把日志打出来看",
  "务实：先跑一次再改",
  "务实：别猜，先验",
  "务实：直接改",
  "务实：先跑一次再改",
  "务实：别猜，先验",
  "务实：直接改",
  "务实：把日志打出来看",
  "务实：先跑一次再改",
  "务实：别猜，先验",
].join("\n");

const ABAB = ["方案一", "方案二", "方案一", "方案二", "方案一", "方案二", "方案一", "方案二"].join("\n");

const NORMAL_1 = [
  "问题在 findReaders 的递归没有上限。",
  "目录一深就会挂住，而挂住的判据比红的判据更难发现。",
  "所以加了 MAX_DEPTH 和 MAX_DIRS 两个上限。",
  "超限时打印遍历被上限截断，让人知道结果不完整。",
  "这条判据的坏样本是：把 MAX_DEPTH 删掉，然后造一个十层深的目录，命令必须挂住。",
].join("\n");

const NORMAL_2 = [
  "export function periodOf(steps, tol = 0) {",
  "  const n = steps.length;",
  "  if (n < 2) return { p: n, blocks: 1 };",
  "  for (let p = 1; p <= n; p++) {",
  "    if (n % p !== 0) continue;",
  "  }",
  "  return { p: n, blocks: 1 };",
  "}",
].join("\n");

test("minPeriod：全同一符号 → 周期 1", () => {
  assert.equal(minPeriod(["a", "a", "a", "a"]), 1);
});

test("minPeriod：ABAB → 周期 2", () => {
  assert.equal(minPeriod(["a", "b", "a", "b"]), 2);
});

test("minPeriod：全不同 → 周期 = 长度", () => {
  assert.equal(minPeriod(["a", "b", "c", "d"]), 4);
});

test("minPeriod：长度 5 的 ABABA 不整除就不认周期，退到 5", () => {
  // 5 % 2 !== 0，|Aut| = 5/2 不是整数，所以不认周期 2。
  assert.equal(minPeriod(["a", "b", "a", "b", "a"]), 5);
});

test("做。×31：分数近乎 0，图只剩一个节点", () => {
  const u = unifiedScore(SENT_TEXT);
  assert.equal(u.red, true);
  assert.ok(u.score < 0.05);
  assert.equal(u.maxShare, 1);
  assert.ok(u.ngramRep > 0.9);
});

test("18 行务实：前三维都正常，只有 ngram 一维塌", () => {
  const u = unifiedScore(SCREEN);
  assert.equal(u.red, true);
  // 这三条就是原来漏掉它的原因：每一项单独看都不像退化
  assert.ok(u.maxShare < 0.35);
  assert.ok(u.entropy > 0.9);
  assert.ok(1 - u.symmetry > 0.9);
  // 只有子结构重复率高
  assert.ok(u.ngramRep > 0.7);
  assert.ok(u.score < 0.55);
});

test("ABAB 块重复：群论抓到周期 2", () => {
  const u = unifiedScore(ABAB);
  assert.equal(u.red, true);
  assert.ok(u.symmetry > 0.45);
  assert.ok(u.ngramRep > 0.7);
});

test("正常：一段技术说明判绿", () => {
  const u = unifiedScore(NORMAL_1);
  assert.equal(u.red, false);
  assert.ok(u.score > 0.8);
});

test("正常：代码片段判绿", () => {
  const u = unifiedScore(NORMAL_2);
  assert.equal(u.red, false);
  assert.ok(u.score > 0.75);
});

test("坏样本 B1：群论一维若失效，ABAB 的周期信号就没了", () => {
  // 把 dims 里的 [1 - symmetry, 0.15] 删掉，ABAB 的对称度不再参与，
  // 这条断言就失去依托。反过来，这条断言绿着，说明群论那一维真的算出了 0.5。
  assert.ok(unifiedScore(ABAB).symmetry > 0.45);
});

test("坏样本 B2：把 ngram 一维摘掉，截图立刻越过门槛（漏）", () => {
  const u = unifiedScore(SCREEN);
  const without = Math.exp(
    0.15 * Math.log(1 - u.symmetry) +
    0.15 * Math.log(u.entropy) +
    0.3 * Math.log(1 - u.maxShare) +
    0.4 * Math.log(1),
  );
  assert.ok(without > 0.6, "摘掉 ngram 应当变绿");
  assert.ok(u.score < 0.55, "带着 ngram 应当判红");
});

test("坏样本 B3：几何平均严格低于加权和（否则就是加权和漏掉了它）", () => {
  const u = unifiedScore(SCREEN);
  const weightedSum =
    (1 - u.symmetry) * 0.15 + u.entropy * 0.15 + (1 - u.maxShare) * 0.3 + (1 - u.ngramRep) * 0.4;
  assert.ok(u.score < weightedSum);
});

test("坏样本 B4：门槛调低到 0.01，退化样本变绿（证明门槛在起作用）", () => {
  assert.equal(unifiedScore(SCREEN, 0.01).red, false);
  assert.equal(unifiedScore(SCREEN, 0.6).red, true);
});

test("句数少于 4 不判，避免短文本误伤", () => {
  const u = unifiedScore("做。\n做。\n做。");
  assert.equal(u.red, false);
  assert.ok(u.why.includes("太少"));

// ── 接线：算法在测试里绿，不等于它在生产里跑 ──
//
// 2026-11-24 查出的一类事故：run / shape 三条判据写了、测了、有 RULES 条目，
// 但 index.ts 的 judgeCfg 只传了 dupOn 与 langOn——开关永远是默认 false，
// 生产里从没跑过。下面这组断言专门挡这个形状：从 judgeThinking 入口进，
// 而不是直接调 unifiedScore。

test("接线：unifiedOn 打开时截图那段从入口判红", () => {
  const v = judgeThinking(SCREEN, { unifiedOn: true, unifiedMin: 0.6 });
  assert.equal(v.kind, "fold");
  assert.equal(v.rule, "unified");
});

test("接线：unifiedOn 关闭时同一段不判（开关真的在起作用）", () => {
  const v = judgeThinking(SCREEN, { unifiedOn: false });
  assert.notEqual(v.rule, "unified");
});

test("接线：正常文本从入口不判红", () => {
  const v = judgeThinking(NORMAL_1, { unifiedOn: true, unifiedMin: 0.6 });
  assert.notEqual(v.rule, "unified");
});

test("接线：门槛从入口生效，调到 0.99 时正常文本也判红", () => {
  const v = judgeThinking(NORMAL_1, { unifiedOn: true, unifiedMin: 0.99 });
  assert.equal(v.rule, "unified");
});

test("判决里能读出是哪一维拉低的（不是只有一句「退化了」）", () => {
  const v = judgeThinking(SCREEN, { unifiedOn: true });
  assert.ok(typeof v.ev.blk === "string" && v.ev.blk.length > 0, "blk 要有维度名，实际 " + String(v.ev.blk));
  assert.ok(v.ev.why.includes("ngram") || v.ev.why.includes("群论"), "why 要带四个量的读数：" + v.ev.why);
});
});
