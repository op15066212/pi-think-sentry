// RPC 模式集成测试：起一个真的 pi 子进程，用 -e 加载本扩展，发一条 prompt，
// 判定三件事：① 扩展被加载（启动不报错）② 钩子被真的调到（stderr 里的 trace）
// ③ 一轮对话跑完（stdout 里有 response 与事件）。
// 与单元测试的分工：单元测试验逻辑，这条验「pi 真的能加载并调用它」。
//
// 子进程脚手架在 rpc-helper.mjs（起进程、收流、等响应、汇总）——这四条此前与
// rpc-strip.test.mjs 逐字重复。下面只留这条测试特有的东西：加载模式的准备与判定。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { startPi, sendPrompt, awaitResponse, report } from "./rpc-helper.mjs";

// 两种模式：
//   默认      —— -e 直接加载文件，验「代码能跑」
//   --manifest —— 不带 -e，靠 pi 的自动发现（目录 + package.json 的 pi.extensions），
//                 验证清单真的能被 pi 认到。这条才是「能装进去」的证据。
const MANIFEST = process.argv.includes("--manifest");

// manifest 模式必须自己准备环境：把本包复制进 pi 的扩展目录，让自动发现去加载它。
// 不复制就等于依赖「目标机恰好装过」，干净仓库上必红（这就是上一版的问题）。
// 2026-11-16 事故：EXT_DIR 原来写死真实部署目录，manifest 模式先 rmSync 再 cpSync，
// exit 时 cleanup 又把它删了 —— 跑一次 --manifest 就把生产部署清空，下次 pi 启动静默无插件。
// 改为按 pid 命名的独立目录：自动发现只要求 extensions/<任意名>/package.json 带 pi.extensions，
// 名字不必与部署目录相同；cleanup 只删自己那份。
const EXT_DIR = MANIFEST
  ? path.join(os.homedir(), ".pi/agent/extensions", "pi-think-sentry-rpctest-" + process.pid)
  : path.join(os.homedir(), ".pi/agent/extensions/pi-think-sentry");
if (MANIFEST) {
  fs.rmSync(EXT_DIR, { recursive: true, force: true });
  fs.cpSync(process.cwd(), EXT_DIR, { recursive: true });
}
const cleanup = () => { if (MANIFEST) { try { fs.rmSync(EXT_DIR, { recursive: true, force: true }); } catch {} } };
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(130); });

const started = Date.now();
const args = MANIFEST
  ? ["--mode", "rpc", "--no-session"]
  : ["--mode", "rpc", "--no-session", "-e", "./src/index.ts"];

// 状态文件隔离（2026-11-16；冷却机制 2026-11-19 已删，接口名 2026-11-22 才跟上）：
// 插件按会话键写计数，rpc 子进程的会话键取决于 pi 是否设了 PI_SESSION_FILE。
// 真实状态文件里别的会话的计数不影响这条测试，但同一个键累加会让读数不可解释。
// 给它一个空的专用文件（由 helper 按 stateName 生成），测试只验链路，不验计数。
const { child, s, statePath } = startPi({
  args,
  env: { CURB_FORCE_RETRACT: "1" },
  stateName: "rpc",
});

const hooks = new Set();
const kinds = new Set(); // turn_end 的判据结论，用来判断介入链路是否真的走到删行/拦截
child.stderr.on("data", (d) => {
  for (const m of d.toString().matchAll(/\[pi-think-sentry\] hook \{"h":"([a-z_]+)"/g)) hooks.add(m[1]);
  for (const m of d.toString().matchAll(/\{"h":"turn_end","kind":"(\w+)"/g)) kinds.add(m[1]);
});

sendPrompt(child, "Read ./package.json and answer in English: name the test script and the entry field, in two sentences.");

const why = await awaitResponse(child, s);
try { child.kill(); } catch {}

// 介入是否真的发生：拦截会写状态文件（按会话键，rpc 环境没有 PIDECK_SESSION_ID -> "local"）。
let intervened = false;
try { intervened = fs.readFileSync(statePath, "utf8").includes('"local":'); } catch {}

const checks = [
  ["加载模式", MANIFEST ? "manifest（自动发现）" : "-e 直加载", MANIFEST ? "manifest" : "e"],
  ["pi 进程起得来并回了 prompt 响应", why === "responded" || why.startsWith("exit:0"), why],
  // 这条只看「没有模块解析错误」，单独不足以证明加载成功（什么都没加载也满足），
  // 所以加载成功由下面「钩子轨迹非空」来证明，两条一起才成立。
  ["无模块解析错误", !/ERR_MODULE_NOT_FOUND|Cannot find module|SyntaxError/.test(s.stderr), s.stderr.slice(0, 200)],
  ["钩子被真的调到（本扩展确实被加载）", hooks.has("message_update") && hooks.has("turn_end") && hooks.size > 0, [...hooks].join(",")],
  // 介入是否真的发生：turn_end 之后状态进 DONE（强制开关下必然如此）。
  // 不读 ledger：那条依赖「本会话键」与写入时机，实测不稳（5/6 那次就是它红）。
  ["介入真的发生（turn_end 判据判红）", kinds.has("strip") || kinds.has("retract"), [...kinds].join(",") || "无"],
  ["stdout 是 JSONL 协议帧", s.stdout.split("\n").filter(Boolean).every((l) => l.trim().startsWith("{")), String(s.stdout.split("\n").filter(Boolean).length)],
];

const bad = report("rpc", checks, started);
console.log("钩子轨迹: " + ([...hooks].join(", ") || "（无）"));
cleanup();
process.exit(bad ? 1 : 0);
