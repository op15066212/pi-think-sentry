// R7：块绑定 / 签名检测。判据按 provider 与 api 判，不按模型名、不按读不到的内部字段。
import test from "node:test";
import assert from "node:assert/strict";
import { detectBinding, label } from "../src/features/binding.ts";

test("Anthropic 家族不改写：签名覆盖内容，改了会 400", () => {
  const b = detectBinding({ provider: "anthropic", api: "anthropic-messages", id: "claude-opus-4-7" });
  assert.equal(b.capture, false);
  assert.match(b.reason, /anthropic/);
});

test("Bedrock 也归 Anthropic 家族", () => {
  assert.equal(detectBinding({ provider: "bedrock", api: "bedrock-converse" }).capture, false);
});

test("OpenAI responses 不改写：会静默移除 reasoning item", () => {
  const b = detectBinding({ provider: "openai", api: "openai-responses", id: "gpt-6.2-sol" });
  assert.equal(b.capture, false);
  assert.match(b.reason, /responses/);
});

test("OpenAI completions 照旧改写（本机走这条）", () => {
  assert.equal(detectBinding({ provider: "openai", api: "openai-completions" }).capture, true);
});

test("未知模型：默认能改写（不知道就别拦）", () => {
  assert.equal(detectBinding(undefined).capture, true);
  assert.equal(detectBinding({}).capture, true);
});

test("label 里带 provider 与 api：命令第一行要能看出为什么关", () => {
  const s = label(detectBinding({ provider: "anthropic", api: "anthropic-messages" }));
  assert.match(s, /^off \(provider=anthropic, api=anthropic-messages, model=[^)]*, reason=/);
});
