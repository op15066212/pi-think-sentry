// R7 复核第二轮：网关类 provider 且后端未知时保守不改写；allowGateway 可显式放开。
import test from "node:test";
import assert from "node:assert/strict";
import { detectBinding } from "../src/features/binding.ts";
import bindingMod from "../src/features/binding.ts";

test("网关 + 后端未知：默认不改写（本机 magpie 就属于这一类）", () => {
  const b = detectBinding({ provider: "magpie", api: "openai-completions", id: "group/never-stuck" });
  assert.equal(b.capture, false);
  assert.match(b.reason, /gateway/);
});

test("同一个网关，配置 allowGateway=true 时放行", () => {
  const b = detectBinding({ provider: "magpie", api: "openai-completions", id: "group/never-stuck" }, { allowGateway: true });
  assert.equal(b.capture, true);
});

test("网关但模型名能看出族：按族判，不按网关保守", () => {
  const b = detectBinding({ provider: "openrouter", api: "openai-completions", id: "deepseek-v4" });
  assert.equal(b.capture, true, "看得出是 deepseek，就不该按未知处理");
});

test("非网关 provider 不受 allowGateway 影响", () => {
  assert.equal(detectBinding({ provider: "anthropic", api: "anthropic-messages" }, { allowGateway: true }).capture, false, "Anthropic 即使开了网关开关也不改");
});

test("binding 是模块：与其余五个同形状", () => {
  assert.equal(bindingMod.name, "binding");
  assert.deepEqual(bindingMod.defaults, { allowGateway: false });
  assert.deepEqual(bindingMod.configure(undefined), { allowGateway: false });
  assert.deepEqual(bindingMod.configure({ allowGateway: true }), { allowGateway: true });
});
