// 场外手改配置之后，上一帧的判决不许继续用。
//
// 2026-11-22 第三版实测：dup.min 3 → 5 之后、没有新思考帧，tool_call 仍然拦。
// 原因是 refresh（在 tool_call 里跑）刷新了开关，而 lastV 是上一次 message_update
// 用旧配置算出来的——同一次调用里一半新一半旧。
//
// 修法是重算而不是清空：文本还在，用新配置再判一次。清空会造出「改配置即绕过拦截」的窗口。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CFG = path.join(os.tmpdir(), "curb-recfg-" + process.pid + ".json");
process.env.CURB_CONFIG_FILE = CFG;
process.env.CURB_STATE_FILE = path.join(os.tmpdir(), "curb-recfg-state-" + process.pid + ".json");
process.env.CURB_SESSION_KEY = "reconfig";
fs.rmSync(CFG, { force: true });

const { default: installGuard } = await import("../src/index.ts");
const msgOf = (t: string) => ({ content: [{ type: "thinking", thinking: t }, { type: "text", text: "答" }] });
const fakePi = () => {
  const h: any = {};
  return { h, on(n: string, f: any) { (h[n] ||= []).push(f); }, registerCommand() {} };
};
const call = async (p: any, n: string, e: any = {}) => {
  const o = [];
  for (const f of p.h[n] || []) o.push(await f(e));
  return o;
};
const REP = "做。\n做。\n做。\n做。";

test("手改门槛之后，旧判决被新配置重算：3 次重复在 min=5 下不该拦", async () => {
  fs.writeFileSync(CFG, JSON.stringify({ dup: { on: true, min: 3 } }));
  const p = fakePi();
  await installGuard(p);
  await call(p, "before_agent_start", {});
  await call(p, "message_update", { message: msgOf(REP) });
  const first = await call(p, "tool_call", {});
  assert.ok(first.some((x: any) => x && x.block), "前提：min=3 时这一段判红");

  // 场外手改：门槛抬到 5，并保证 mtime 变了
  fs.writeFileSync(CFG, JSON.stringify({ dup: { on: true, min: 5 } }));
  const t = new Date(Date.now() + 5000);
  fs.utimesSync(CFG, t, t);

  const second = await call(p, "tool_call", {});
  assert.ok(!second.some((x: any) => x && x.block), "配置已改成 min=5，同一段文本必须被重算成 clean，不该继续拦");
});

test("对照：配置没变时，旧判决照旧生效", async () => {
  fs.writeFileSync(CFG, JSON.stringify({ dup: { on: true, min: 3 } }));
  const p = fakePi();
  await installGuard(p);
  await call(p, "before_agent_start", {});
  await call(p, "message_update", { message: msgOf(REP) });
  await call(p, "tool_call", {});
  const before = (await import("../src/index.ts")).stats.redCalls;
  await call(p, "tool_call", {});
  assert.ok((await import("../src/index.ts")).stats.redCalls > before, "配置没动，判红状态该保持");
});
