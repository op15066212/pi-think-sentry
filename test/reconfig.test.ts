import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// 配置改动能不能真的走到判据上。
//
// 2026-11-26（tool_call 改现场判之后）：每条 tool_call 都读一次配置并重判，
// 所以「手改配置 → 下一次调用就用新门槛」变成结构上必然成立的事，
// 不再依赖「旧判决被新配置重算」那套机制。这两条钉的是这个性质。

const CFG = path.join(os.tmpdir(), "curb-reconfig-" + process.pid + ".json");
process.env.CURB_CONFIG_FILE = CFG;

const { default: installGuard } = await import("../src/index.ts");
import { fakePi, call, ctxOf } from "../test/harness.ts";

const msgOf = (thinking: string) => ({ content: [{ type: "thinking", thinking }, { type: "text", text: "答" }] });
const REP = "做。\n做。\n做。\n做。";

test("手改门槛之后，下一次调用就用新门槛：3 次重复在 min=5 下不该拦", async () => {
  fs.writeFileSync(CFG, JSON.stringify({ dup: { on: true, min: 3 } }));
  const p = fakePi();
  await installGuard(p);
  const first = await call(p, "tool_call", {}, ctxOf(REP));
  assert.ok(first.some((x: any) => x && x.block), "前提：min=3 时这一段判红");

  // 场外手改：门槛抬到 5，并保证 mtime 变了
  fs.writeFileSync(CFG, JSON.stringify({ dup: { on: true, min: 5 } }));
  const t = new Date(Date.now() + 5000);
  fs.utimesSync(CFG, t, t);

  const second = await call(p, "tool_call", {}, ctxOf(REP));
  assert.ok(!second.some((x: any) => x && x.block), "配置已改成 min=5，同一段文本必须重算成 clean");
  fs.rmSync(CFG, { force: true });
});

test("对照：配置没动时，同一段判红的思考两次都拦（判决不漂移）", async () => {
  fs.writeFileSync(CFG, JSON.stringify({ dup: { on: true, min: 3 } }));
  const p = fakePi();
  await installGuard(p);
  const a = await call(p, "tool_call", {}, ctxOf(REP));
  const b = await call(p, "tool_call", {}, ctxOf(REP));
  assert.ok(a.some((x: any) => x && x.block), "第一次该拦");
  assert.ok(b.some((x: any) => x && x.block), "配置没动，第二次同样该拦（现场判：同一输入同一结论）");
  fs.rmSync(CFG, { force: true });
});
