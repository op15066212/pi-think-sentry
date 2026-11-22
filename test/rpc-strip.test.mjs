// RPC 模式：验 strip 判决真的能走到 block 这条链路。
// 与 rpc.test.mjs 的分工：那条验 retract（撤消息 + continue），这条验 strip 的拦截分支。
// 不设 CURB_FORCE_STRIP 就只能赌模型恰好写出退化思考。
//
// 子进程脚手架在 rpc-helper.mjs：起进程、收流、等响应、汇总断言四条此前与 rpc.test.mjs
// 逐字重复，改一处忘另一处时两条测试会对同一个插件给出不同结论。
import { startPi, sendPrompt, awaitResponse, report } from "./rpc-helper.mjs";

const started = Date.now();
const { child, s } = startPi({
  args: ["--mode", "rpc", "--no-session", "-e", "./src/index.ts"],
  // CURB_FORCE_EMPTY：让强制对空思考也生效。没有它，模型不发 thinking 时这条永远 SKIP，
  // 于是 strip 链路在真进程里从来没被验证过。
  env: { CURB_FORCE_STRIP: "1", CURB_FORCE_EMPTY: "1" },
  stateName: "rpcstrip",
});

// 读 stderr 必须等进程结束再整段解析（2026-11-18 实测）：原来在 data 回调里逐块做正则，
// 一行 JSON 被切成两块时永远匹配不到，于是「拦截没发生」是个假红——判据读的是分块边界，
// 不是被测行为。同一份 stderr 整段匹配就稳。
const blockedOf = (err) => {
  const out = [];
  for (const m of err.matchAll(/"h":"tool_call","kind":"(\w+)"/g)) {
    if (m[1] && m[1] !== "none") out.push(m[1]);
  }
  return out;
};

sendPrompt(
  child,
  // 提示必须把「调工具」写成硬要求（2026-11-18 实测）：原来只说「然后读它」，模型有时
  // 直接凭上下文答了 name 字段，一次工具都没调，于是「拦截没发生」是假红——判据读的是
  // 模型的选择，不是被测行为。要求「先调用 bash 再回答」之后，工具调用是必然的。
  "先用 bash 读 ./package.json，再告诉我 name 字段。在读之前不许回答。",
);

const why = await awaitResponse(child, s);
const blocked = blockedOf(s.stderr);
try { child.kill(); } catch {}

const checks = [
  ["pi 起得来并回了响应", why === "responded" || why.startsWith("exit:0"), why],
  ["无模块解析错误", !/ERR_MODULE_NOT_FOUND|Cannot find module|SyntaxError/.test(s.stderr), s.stderr.slice(0, 200)],
];

// 判不了就不判（篱笆）：FORCE_STRIP 需要模型真的写思考帧，那才有被判的对象。
// 2026-11-18 实测：rpc 模式下模型有时一个 thinking 块都不发（32 帧全 len=0），
// 于是 strip 一次都没判、工具调用照常执行。这不是拦截坏了，是这条判据没有输入；
// 判成红，等于把「模型这次没写思考」记成「插件失效」——两次读的是不同的东西。
// 2026-11-22：trace 的形状从 {h,kind} 改成 {h,phase,kind}，这里的正则没跟，
// 于是 stripFrames 恒为 0、测试恒走 SKIP 分支显示通过——与被修的 CURB_FORCE_STRIP
// 是同一个失效形状（「什么都没发生」与「发生了但结果是空」共用一个像）。
const inFrames = [...s.stderr.matchAll(/"h":"message_update","phase":"in","len":(\d+)"/g)]
  .filter((m) => Number(m[1]) > 0).length;
const stripFrames = (s.stderr.match(/"h":"message_update","phase":"out","kind":"strip"/g) || []).length;
// 三种收场分开（2026-11-22 第二版）：
//   既没有非空思考帧、也没有 strip 帧 → SKIP（判据没有产出任何判决，不是判据坏了）
//   有输入且判红了   → PASS
//   有输入却没判红   → FAIL（这才是插件坏了）
if (inFrames === 0 && stripFrames === 0) {
  console.log("SKIP 工具调用真的进了介入态 —— 这次模型一个思考帧都没写，判据不成立");
} else {
  checks.push(["判据产出了判决（非空思考帧 " + inFrames + "，strip 帧 " + stripFrames + "）", true, ""]);
  checks.push(["判据在帧上判红（force）", stripFrames > 0, "strip 帧数: " + stripFrames]);
  checks.push(["判红之后工具调用被拦", blocked.includes("strip") || blocked.includes("retract"), "tool_call 判据序列: " + (blocked.join(" -> ") || "（无）")]);
}

process.exit(report("rpc-strip", checks, started));
