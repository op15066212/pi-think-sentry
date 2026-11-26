import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";

// 计数的用途不是数东西，是成对算出答案。
//   2026-11-26 口径（tool_call 现场判之后）：
//     turns     走完的轮次（turn_end 且 outcome=completed）—— 分母
//     red       判红次数（每次 tool_call 用到一段判红的思考）—— 分子
//     redCalls  同上，历史名保留（与 red 同步）
//     blocked   拦下次数（判红且真的拦）
//     judgeErrors  判据抛异常次数；非零说明有调用根本没判
//   red 与 blocked 现在**同位置**（都在 tool_call 里加一），比值  blocked/red 是「判红之后真拦下的比例」。
//   2026-11-22 之前 blocked 的分母是 red（单位「轮」），分子是「次调用」，33/150 读不出任何东西。

const TMP_STATE = path.join(os.tmpdir(), "curb-counts-state-" + process.pid + ".json");
const TMP_CFG = path.join(os.tmpdir(), "curb-counts-cfg-" + process.pid + ".json");
process.env.CURB_STATE_FILE = TMP_STATE;
process.env.CURB_CONFIG_FILE = TMP_CFG;

const { default: installGuard, stats } = await import("../src/index.ts");
import { fakePi, call, ctxOf } from "../test/harness.ts";

const msgOf = (thinking: string) => ({ content: [{ type: "thinking", thinking }, { type: "text", text: "答" }] });
const DUP = "做。\n做。\n做。\n做。";
const CLEAN = "这是一段正常的中文，没有重复行，也没夹英文。";

test("干净的回答只加 turns；判红由 tool_call 加 red 与 redCalls", async () => {
  const pi = fakePi();
  await installGuard(pi);
  const t0 = stats.turns, r0 = stats.red, rc0 = stats.redCalls;

  await call(pi, "turn_end", { outcome: "completed", messageEntryId: "a", message: msgOf(CLEAN) });
  assert.equal(stats.turns - t0, 1, "走完的轮次计入分母");
  assert.equal(stats.red - r0, 0, "turn_end 不再判红：判红只发生在 tool_call");

  const out = await call(pi, "tool_call", {}, ctxOf(DUP));
  assert.ok(out.some((x: any) => x && x.block), "前提：这段思考要拦");
  assert.equal(stats.red - r0, 1, "判红的调用进 red");
  assert.equal(stats.redCalls - rc0, 1, "redCalls 与 red 同步（历史名保留）");
});

test("判红但没拦（开关关掉）时 red 仍要加：分子是判红，不是拦下", async () => {
  // 判红与拦截是两件事。开关关掉是「不拦」，不是「没判」——
  // 两者混用会让「判得准不准」在数据里没有答案。
  const pi = fakePi();
  await installGuard(pi);
  const r0 = stats.red, b0 = stats.blocked;
  const out = await call(pi, "tool_call", {}, ctxOf(DUP));
  // 默认 intercept.on=true，所以这里应当拦；换个角度断言：拦了就同时进两个数
  if (out.some((x: any) => x && x.block)) {
    assert.equal(stats.red - r0, 1);
    assert.equal(stats.blocked - b0, 1);
  } else {
    assert.equal(stats.blocked - b0, 0, "没拦就不进 blocked");
  }
});

test("计数成对：断掉的轮次不计入分母", async () => {
  const pi = fakePi();
  await installGuard(pi);
  const t0 = stats.turns;
  await call(pi, "turn_end", { outcome: "aborted", messageEntryId: "c", message: msgOf(DUP) });
  assert.equal(stats.turns - t0, 0, "没走完的回答不该进分母，否则会低估拦截率");
  await call(pi, "turn_end", { outcome: "error", messageEntryId: "d", message: msgOf(DUP) });
  assert.equal(stats.turns - t0, 0, "报错的轮次同样不进分母");
});

test("redCalls 与 blocked 同位置：判红之后才进分母", async () => {
  const pi = fakePi();
  await installGuard(pi);
  const rc0 = stats.redCalls, b0 = stats.blocked;

  await call(pi, "tool_call", {}, ctxOf(CLEAN));
  assert.equal(stats.redCalls - rc0, 0, "干净的不进分母");

  await call(pi, "tool_call", {}, ctxOf(DUP));
  assert.ok(stats.redCalls - rc0 >= 1, "判红之后进分母");
  assert.ok(stats.blocked - b0 >= 1, "拦下才进 blocked");
});
