import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// 计数的用途不是数东西，是成对算出答案。
//   2026-11-21 之前只有 judgeCalls / blocked / cleaned / injected 四个，任取两个都配不成对：
//   judgeCalls 是流式帧数（每 token 一帧），blocked 是工具调用次数，cleaned 是回答条数——
//   三个不同的计数单位，比出来的商没有意义（0.0074% 那个数就是假精确）。
// 补 turns 与 red 之后，分母才存在：red/turns 是「每个回答被判红的概率」。

const TMP_STATE = path.join(os.tmpdir(), "curb-counts-state-" + process.pid + ".json");
const TMP_CFG = path.join(os.tmpdir(), "curb-counts-cfg-" + process.pid + ".json");
process.env.CURB_STATE_FILE = TMP_STATE;
process.env.CURB_CONFIG_FILE = TMP_CFG;

const { default: installGuard, stats } = await import("../src/index.ts");

import { fakePi, call } from "../test/harness.ts";const msgOf = (thinking: string) => ({ content: [{ type: "thinking", thinking }, { type: "text", text: "答" }] });

test("计数成对：干净的回答只加 turns，判红的回答两个都加", async () => {
  const pi = fakePi();
  await installGuard(pi);
  const t0 = stats.turns, r0 = stats.red;

  await call(pi, "turn_end", { outcome: "completed", messageEntryId: "a", message: msgOf("这是一段正常的中文，没有重复行，也没夹英文。") });
  assert.equal(stats.turns - t0, 1, "处理了一条回答");
  assert.equal(stats.red - r0, 0, "干净的回答不进 red");

  await call(pi, "turn_end", { outcome: "completed", messageEntryId: "b", message: msgOf("做。\n做。\n做。\n做。") });
  assert.equal(stats.turns - t0, 2, "又处理了一条");
  assert.equal(stats.red - r0, 1, "判红的回答才进 red");
});

test("red 记「中途判红过」：拦了、回答结束时判据已干净，red 仍要加", async () => {
  // 2026-11-21 的真实数据暴露的错：本会话 turns=6 red=0 blocked=2。
  // 不可能同时成立，除非两个计数记的不是同一个事件——判红发生在工具调用前（回答还没结束），
  // 到 turn_end 时模型已经改好，那时再看判决永远是 none。所以 red 必须记「曾经」，不能记「最后」。
  const pi = fakePi();
  await installGuard(pi);
  await call(pi, "before_agent_start", {});
  const r0 = stats.red;

  await call(pi, "message_update", { message: msgOf("做。\n做。\n做。\n做。") });   // 中途判红
  const blockedOut = await call(pi, "tool_call", {});
  assert.ok(blockedOut.some((x: any) => x && x.block), "前提：这次工具调用被拦了");

  await call(pi, "turn_end", {
    outcome: "completed",
    messageEntryId: "mid",
    message: msgOf("改好之后的一段中文，没有重复行。"),   // 结束时判据干净
  });
  assert.equal(stats.red - r0, 1, "中途判红过必须计入 red，否则 red 与 blocked 配不成对");
});

test("计数成对：断掉的轮次不计入分母", async () => {
  const pi = fakePi();
  await installGuard(pi);
  const t0 = stats.turns;
  await call(pi, "turn_end", { outcome: "aborted", messageEntryId: "c", message: msgOf("做。\n做。\n做。\n做。") });
  assert.equal(stats.turns - t0, 0, "没走完的回答不该进分母，否则会低估拦截率");
});
test("redCalls 与 blocked 同位置：判红之后才进分母", async () => {
  // 2026-11-22：此前 blocked 的分母是 red（单位是「轮」），分子是「次调用」，
  // 33/150 = 22% 这个数读不出任何东西。两个计数现在都在 tool_call 里各加一。
  const pi = fakePi();
  await installGuard(pi);
  await call(pi, "before_agent_start", {});
  const rc0 = stats.redCalls, b0 = stats.blocked;

  await call(pi, "message_update", { message: msgOf("这是一段正常的中文，没有重复行，也没夹英文。") });
  await call(pi, "tool_call", {});
  assert.equal(stats.redCalls - rc0, 0, "判干净时不进分母");
  assert.equal(stats.blocked - b0, 0, "也不进分子");

  await call(pi, "message_update", { message: msgOf("做。\n做。\n做。\n做。") });
  await call(pi, "tool_call", {});
  assert.equal(stats.redCalls - rc0, 1, "判红的那次调用进分母");
  assert.equal(stats.blocked - b0, 1, "同一次调用进分子");
});
