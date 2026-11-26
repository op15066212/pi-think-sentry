// 接线：配置文件 → readConfig → applyCfg 的投影 → 判据 → 拦截。
//
// 2026-11-22 之前这段链断成两截：dup / lang 的 configure 用副作用写 judges 的四个全局，
// strip / inject / intercept 走返回值。于是同一个值（dup.min）有两个像，而没有任何
// 东西比较它们；测试也只能靠 setDupMin 之类的全局 setter 改行为，那条路生产里不存在。
// 现在判据的配置由参数进，judges 没有模块级可变状态，投影只在 index.ts 的 applyCfg 一处。
//
// 这两条分别守两端：一端是「judges 里不许有全局」，另一端是「配置文件里的开关真的走到判据」。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CFG = path.join(os.tmpdir(), "curb-wire-cfg-" + process.pid + ".json");
process.env.CURB_CONFIG_FILE = CFG;
process.env.CURB_STATE_FILE = path.join(os.tmpdir(), "curb-wire-state-" + process.pid + ".json");
process.env.CURB_SESSION_KEY = "wire";
try { fs.rmSync(CFG, { force: true }); } catch {}

const { default: installGuard } = await import("../src/index.ts");
const msgOf = (t: string) => ({ content: [{ type: "thinking", thinking: t }, { type: "text", text: "答" }] });
const fakePi = () => {
  const h: any = {};
  return { h, on(n: string, f: any) { (h[n] ||= []).push(f); }, registerCommand() {} };
};
const call = async (p: any, n: string, e: any = {}, ctx: any = undefined) => {
  const o = [];
  for (const f of p.h[n] || []) o.push(await f(e, ctx));
  return o;
};
// tool_call 现在现场判：喂一份会话历史即可。
const ctxOf = (think: string) => ({
  sessionManager: {
    getEntries: () => [
      { type: "message", id: "u1", parentId: null, message: { role: "user", content: [{ type: "text", text: "问" }] } },
      { type: "message", id: "a1", parentId: "u1", message: { role: "assistant", content: [{ type: "thinking", thinking: think }] } },
    ],
  },
});

test("judges 没有模块级可变状态：配置只能从参数进", () => {
  const src = fs.readFileSync(path.join(ROOT, "src/judges.ts"), "utf8");
  const lets = src.split("\n").filter((l) => /^let\s/.test(l));
  assert.deepEqual(lets, [], "judges.ts 里不许有模块级 let：" + lets.join(" | "));
  assert.ok(!/export const set(Dup|Lang)/.test(src), "不许有写全局的 setter");
});

test("配置文件里的 on:false 真的走到判据：dup 关掉时工具调用不被拦", async () => {
  fs.writeFileSync(CFG, JSON.stringify({ dup: { on: false, min: 3 } }));
  const p = fakePi();
  await installGuard(p);
  const out = await call(p, "tool_call", {}, ctxOf("做。\n做。\n做。\n做。"));
  assert.ok(!out.some((x: any) => x && x.block), "dup 关掉，判据不判红，工具调用照常");
});

test("同一个开关打开时会被拦：这条是上一条的对照", async () => {
  fs.writeFileSync(CFG, JSON.stringify({ dup: { on: true, min: 3 } }));
  const p = fakePi();
  await installGuard(p);
  const out = await call(p, "tool_call", {}, ctxOf("做。\n做。\n做。\n做。"));
  assert.ok(out.some((x: any) => x && x.block), "dup 打开，重复行判红，工具调用被拦");
});

test("投影的每个字段都有边：langDir 决定守哪边", async () => {
  fs.writeFileSync(CFG, JSON.stringify({ lang: { on: true, dir: "en" } }));
  const p = fakePi();
  await installGuard(p);
  const out = await call(p, "tool_call", {}, ctxOf("这是一段纯中文的思考，没有任何拉丁字母。"));
  assert.ok(out.some((x: any) => x && x.block), "守英文时纯中文要判红");
});
