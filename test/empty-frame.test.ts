import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// 「为什么没拦截」（2026-11-23 实测）：
// 模型退化之后要调工具，那一帧的 message 里 thinking 已经输出完、只剩工具调用，
// thinkingOf() 返回空串。旧代码拿空串去判，得 none，**覆盖掉上一帧的判红**——
// 于是 tool_call 时 lastV 是干净的，拦不到。
// 台账证据：某会话 red=790 / blocked=7。
//
// 修法：空 thinking 不更新判决；清空判决只在新一轮开始（before_agent_start）。

const TMP_STATE = path.join(os.tmpdir(), "curb-empty-state-" + process.pid + ".json");
const TMP_CFG = path.join(os.tmpdir(), "curb-empty-cfg-" + process.pid + ".json");
process.env.CURB_STATE_FILE = TMP_STATE;
process.env.CURB_CONFIG_FILE = TMP_CFG;

const { default: installGuard } = await import("../src/index.ts");
const { fakePi, call } = await import("../test/harness.ts");

const DEGEN = "做。\n做。\n做。\n做。\n做。";   // 5 行相同，dup.min=4 判红

test("空 thinking 帧不覆盖上一帧的判红，tool_call 仍然拦", async () => {
  fs.writeFileSync(TMP_CFG, JSON.stringify({}));
  const p = fakePi();
  await installGuard(p);
  await call(p, "before_agent_start", {});

  // 第一帧：退化，判红
  await call(p, "message_update", { message: { content: [{ type: "thinking", thinking: DEGEN }] } });

  // 第二帧：thinking 已结束，只剩工具调用（旧代码在这里把判决洗白）
  await call(p, "message_update", { message: { content: [{ type: "toolCall", id: "t1", name: "bash" }] } });

  const out = await call(p, "tool_call", { toolName: "bash", input: { command: "ls" } });
  const blocked = out.some((x: any) => x && x.block);
  assert.ok(blocked, "空 thinking 帧不该洗白判决，这次工具调用应被拦");
});

test("新一轮开始才清空判决", async () => {
  fs.writeFileSync(TMP_CFG, JSON.stringify({}));
  const p = fakePi();
  await installGuard(p);
  await call(p, "before_agent_start", {});

  await call(p, "message_update", { message: { content: [{ type: "thinking", thinking: DEGEN }] } });
  await call(p, "message_update", { message: { content: [{ type: "toolCall", id: "t1", name: "bash" }] } });
  const first = await call(p, "tool_call", { toolName: "bash", input: {} });
  assert.ok(first.some((x: any) => x && x.block), "同一轮内判红要保持");

  // 新一轮：清空，正常内容不该被上一轮的判决牵连
  await call(p, "before_agent_start", {});
  await call(p, "message_update", { message: { content: [{ type: "thinking", thinking: "这一轮只写一句正常的中文。" }] } });
  const second = await call(p, "tool_call", { toolName: "bash", input: {} });
  assert.ok(!second.some((x: any) => x && x.block), "新一轮不该沿用上一轮的判决");
});
