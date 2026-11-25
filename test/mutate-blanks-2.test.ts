// 变异巡检第二轮（2026-11-22 第十三版）：全仓 8 处存活里 7 处是真空白。
//
// 判法变了：上一轮我第一次跑「全仓」时用的是 node --test test/（全目录，含 rpc），
// 与 npm test 的 test/*.test.ts 不是同一个集合——同一件事在两处算，而且每处多花 10 秒。
// 收成一处（读 package.json 的 scripts.test）之后一轮 68 秒跑完十个文件，才看得见全貌。
//
// 七条各对应一个「翻掉运算符测试仍全绿」的坐标。最狠的是 intercept.ts:22：
// 把 !on || !v || v.kind === "none" 翻成 &&，关掉拦截开关之后判红仍然拦。
import test from "node:test";
import assert from "node:assert/strict";
import { validThreshold } from "../src/threshold.ts";
import intercept, { SAY_BLOCK, SAY_LANG } from "../src/features/intercept.ts";

const stripV = { kind: "strip", rule: "dup", ev: { blk: "跑。", reps: 3, why: "3 次", dups: [["跑。", 3, [1, 2]]] } };
const langV = { kind: "retract", rule: "lang", ev: { cjk: 0, lat: 9, lines: 5, dir: "zh", sample: null } };

test("validThreshold 认数字本身，不是只认字符串（threshold.ts:28 的 || 翻成 && 必须红）", () => {
  assert.equal(validThreshold(4), 4, "number 输入要原样通过");
  assert.equal(validThreshold(0), null, "0 低于下限，仍是 null");
});

test("拦下时说清重复的是哪一行、重复几次（intercept.ts:4 / :7 的 || 翻成 && 必须红）", () => {
  assert.match(SAY_BLOCK(stripV), /跑。/, "重复行的原文要出现在理由里");
  assert.match(SAY_BLOCK(stripV), /3 次/, "重复次数要出现");
  assert.match(SAY_LANG(langV), /5/, "行数要出现，不能退化成「几」");
});

test("开关关掉就放行：判红也不拦（intercept.ts:22 的 || 翻成 && 必须红）", () => {
  assert.equal(intercept.reason(stripV, false), null, "on=false 必须返回 null");
  assert.equal(intercept.reason(null, true), null, "没有判决时放行");
  assert.equal(intercept.reason({ kind: "none" }, true), null, "判干净时放行");
  assert.ok(intercept.reason(stripV, true), "on=true 且判红要给理由");
});
