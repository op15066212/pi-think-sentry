// test/rpc-helper.mjs —— 两个 RPC 集成测试共用的子进程脚手架。
//
// 为什么有这一份（2026-11-18）：rpc.test.mjs 与 rpc-strip.test.mjs 各写一遍「起子进程、
// 收 stdout/stderr、等响应、汇总断言」，五段逐字相同——Ax9 实例轴上的同一套架子复制两份。
// 两份拷贝的坏处不是多打几个字：超时时间、响应判据、状态文件隔离这些参数改一处忘另一处时，
// 两条测试会对同一个插件给出不同结论。
//
// 只抽脚手架，不抽判定：每条测试验什么、trace 怎么解析、断言怎么写，留在各自文件里。

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * 起一个 pi 子进程。jsonl 流与响应标志放在返回的 s 上，由调用方读。
 * stateName 决定状态文件名——两条测试各用一个，避免互相影响。
 */
export function startPi({ args, env = {}, cwd = process.cwd(), stateName }) {
  const statePath = path.join(os.tmpdir(), "pi-think-sentry-" + stateName + "-state.json");
  try { fs.rmSync(statePath, { force: true }); } catch {}
  // shell: true 与 args 数组一起用会在 Node 22+ 打 DEP0190；Windows 下 pi 是 .cmd，
  // 又必须走 shell。两头分开：Windows 传拼好的命令行（args 为空，无警告），
  // 其它平台给 args 数组且 shell: false。
  const bin = process.env.PI_BIN || "pi";
  const childEnv = { ...process.env, CURB_TRACE: "1", CURB_STATE_FILE: statePath, ...env };
  const quote = (a) => (/\s/.test(a) ? "\"" + a + "\"" : a);
  const child = process.platform === "win32"
    ? spawn([bin, ...args].map(quote).join(" "), { cwd, shell: true, env: childEnv })
    : spawn(bin, args, { cwd, shell: false, env: childEnv });
  const s = { stdout: "", stderr: "", responded: false };
  child.stdout.on("data", (d) => { s.stdout += d.toString(); });
  child.stderr.on("data", (d) => { s.stderr += d.toString(); });
  return { child, s, statePath };
}

/** 启动后延迟发一条 prompt（太早发，pi 的 RPC 还没就绪）。 */
export function sendPrompt(child, message, delayMs = 2500) {
  setTimeout(() => child.stdin.write(JSON.stringify({ id: "p1", type: "prompt", message }) + "\n"), delayMs);
}

/** 等第一帧 response；响应后再留 8 秒收尾（trace 与事件常在响应之后才到）。 */
export function awaitResponse(child, s, timeoutMs = 90000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("timeout"), timeoutMs);
    child.stdout.on("data", () => {
      if (!s.responded && s.stdout.includes('"type":"response"') && s.stdout.includes('"command":"prompt"')) {
        s.responded = true;
        setTimeout(() => { clearTimeout(timer); resolve("responded"); }, 8000);
      }
    });
    child.on("exit", (code) => { clearTimeout(timer); resolve("exit:" + code); });
  });
}

/** 打断言与汇总，返回失败条数（调用方据此 exit）。 */
export function report(title, checks, started) {
  let bad = 0;
  for (const [name, ok, detail] of checks) {
    console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  → " + String(detail).slice(0, 200)));
    if (!ok) bad++;
  }
  console.log(title + ": " + (checks.length - bad) + "/" + checks.length +
    " 通过，耗时 " + Math.round((Date.now() - started) / 1000) + "s");
  return bad;
}
