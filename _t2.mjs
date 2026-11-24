import fs from "node:fs";
const p = "test/unified.test.ts";
let s = fs.readFileSync(p, "utf8");
s = s.replace(
  'import { unifiedScore, minPeriod } from "../src/algo/unified.ts";',
  'import { unifiedScore, minPeriod } from "../src/algo/unified.ts";
import { judgeThinking } from "../src/judges.ts";'
);
s += `
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
`;
fs.writeFileSync(p, s, "utf8");
console.log("ok");
