// R7 签核：判据必须对 provider、api、模型名三处对称。
// 两位复核各给了案例：聚合 provider 会把 Claude 模型按普通接口转发出去，只看 api 会漏。
import test from "node:test";
import assert from "node:assert/strict";
import { detectBinding } from "../src/features/binding.ts";

test("openrouter 转发 claude：provider 与 api 都看着普通，模型名认出是 Anthropic", () => {
  const b = detectBinding({ provider: "openrouter", api: "openai-completions", id: "anthropic/claude-opus-4.7" });
  assert.equal(b.capture, false, "聚合 provider 转发 Claude 也会 400");
  assert.match(b.reason, /relay/);
});

test("自建中转带 anthropic-messages 接口：api 认出", () => {
  const b = detectBinding({ provider: "my-relay", api: "anthropic-messages", id: "whatever" });
  assert.equal(b.capture, false);
  assert.match(b.reason, /api/);
});

test("provider 为空但接口是 anthropic-messages：仍然认出", () => {
  const b = detectBinding({ provider: "", api: "anthropic-messages", id: "" });
  assert.equal(b.capture, false);
});

test("模型名含 sonnet-5 也归同一族", () => {
  assert.equal(detectBinding({ provider: "relay", api: "openai-completions", id: "sonnet-5-x" }).capture, false);
});

test("真的普通模型仍然能改写：判据不能把所有人都拦了", () => {
  assert.equal(detectBinding({ provider: "openai", api: "openai-completions", id: "deepseek-v4" }).capture, true);
  assert.equal(detectBinding({ provider: "zuiapi-kimi", api: "openai-completions", id: "kimi-k2.7" }).capture, true);
});
