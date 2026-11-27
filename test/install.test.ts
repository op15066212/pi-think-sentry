import test from "node:test";

import assert from "node:assert/strict";
import installGuard from "../src/index.ts";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

// 状态文件指向临时路径：否则测试之间共享同一份计数，读数互相污染。
const TMP_STATE = path.join(os.tmpdir(), "curb-test-state-" + process.pid + ".json");
process.env.CURB_STATE_FILE = TMP_STATE;
// 配置也要指向临时路径（那个文件不存在 = 全走 DEFAULTS）。原来只注入了状态路径，
// 于是测试读的是用户真实的 settings.json：用户只要定制一句结算文案，
// 「默认不追加结算段，不该有任何改写」就红——红的不是插件，是测试读了活配置。
process.env.CURB_CONFIG_FILE = path.join(os.tmpdir(), "curb-test-config-" + process.pid + ".json");
try { fs.rmSync(TMP_STATE, { force: true }); } catch {}

// 假 pi：只收集钩子，不发真事件。验的是「接线对不对」，不是 pi 内部行为。
function fakePi() {
  const hooks: Record<string, Function[]> = {};
  const commands: Record<string, any> = {};
  return {
    hooks, commands,
    on(name: string, fn: Function) { (hooks[name] ||= []).push(fn); },
    registerCommand(name: string, spec: any) { commands[name] = spec; },
  };
}
const msgOf = (thinking: string) => ({ content: [{ type: "thinking", thinking }, { type: "text", text: "回答" }] });
const resetCooldown = () => { try { fs.rmSync(TMP_STATE, { force: true }); } catch {} };
const call = async (pi: any, name: string, event: any = {}, ctx: any = undefined) => {
  const out = [];
  for (const fn of pi.hooks[name] || []) out.push(await fn(event, ctx));
  return out;
};

// 2026-11-26：tool_call 改成现场判（从会话历史取最后一条 assistant 的思考）。
// 所以这些用例给 tool_call 一份历史，不再先 message_update 推判决。
const ctxOf = (think: string) => ({
  sessionManager: {
    getEntries: () => [
      { type: "message", id: "u1", parentId: null, message: { role: "user", content: [{ type: "text", text: "问" }] } },
      { type: "message", id: "a1", parentId: "u1", message: { role: "assistant", content: [{ type: "thinking", thinking: think }] } },
    ],
  },
});

// 2026-11-26：「同一份思考不重复记账」这条随 message_update 一起删除。
// 它挡的是「流式几十帧各记一条 red」——同一段思考被记 5 次，计数虚高。
// 现在没有流式帧了：每次 tool_call 现场判一次，一段思考只可能记一条，问题形状消失。

const FRAG = "读完配置后我把三个阈值都记下来，然后逐条核对它们是不是写在同一个文件里。\n（执行）done。\n（执行）done。\n（执行）done。\n（执行）done。";
const EN = [
  "I think we should read the file first.",
  "Then check whether the threshold is in the config.",
  "So that we can change it and rerun the test.",
].join("\n");
const CN = "我刚发现阈值写在配置文件里而不是代码里，所以下一步应该改配置再跑一次测试，确认退出码是零，然后核对没有别处也写了这个值。";

test("接线：只注册 tool_call 与 turn_end 两个钩子", async () => {
  resetCooldown();
  const pi = fakePi();
  await installGuard(pi);
  // 2026-11-26 使用者把范围收到两个：tool_call 拒绝执行、turn_end 清 thinkingSignature。
  // before_agent_start 与 message_update 已删 —— 留着一条没人要的钩子，
  // 等于给以后的人一个「这里还该有逻辑」的暗示。
  assert.deepEqual(Object.keys(pi.hooks).sort(), ["tool_call", "turn_end"], "实际：" + JSON.stringify(Object.keys(pi.hooks)));
});

test("碎片：工具调用之前拦一次，原因含词与次数", async () => {
  resetCooldown();
  const pi = fakePi();
  await installGuard(pi);
  const [res] = await call(pi, "tool_call", { name: "bash" }, ctxOf(FRAG));
  assert.equal(res?.block, true);
  assert.match(res.reason, /短行|次/);          // 新提示只说事实：哪一行重复了几次，或有几行短行
  assert.match(res.reason, /\d+/);
});

test("语言：整段英文之后工具调用照样拦，给的是语言处方", async () => {
  // 2026-11-18 重启后实测：拦是拦了，理由却是「同一行出现了 ? 次」后面空白。
  // 原因是当时 STREAM 只把 strip 记进那份跨帧缓存，retract 没记，tool_call 处拿不到判据。
  // （那份缓存 lastV 已于 2026-11-27 随每帧预判一起删掉，改成 tool_call 现场判；这条留着说明当时形态。）
  resetCooldown();
  const pi = fakePi();
  await installGuard(pi);
  const [res] = await call(pi, "tool_call", { name: "bash" }, ctxOf(EN));
  assert.equal(res?.block, true, "英文思考之后的工具调用必须拦下");
  // 2026-11-20：处方文案改成覆盖首尾形态（judges.ts 的 edgeLangJudge），断言跟着事实走。
  assert.match(res.reason, /不是中文/, "实际：" + res?.reason);
});

test("判据由红转干净后，工具调用不该被拦", async () => {
  // 2026-11-18 实测：帧1 纯英文判 retract 进预判，帧2 换成中文判 none，
  // 状态机当时没有「退出预判」的转移，工具调用照旧被拦，提示还说「整段是英文」。
  resetCooldown();
  const pi = fakePi();
  await installGuard(pi);
  const [res] = await call(pi, "tool_call", { name: "bash" }, ctxOf(CN));
  // 钩子「不拦」时返回 undefined（不是 {block:false}）。
  assert.notEqual(res?.block, true, "上一个 thinking 块是中文，不该拦；实际 " + JSON.stringify(res));
});


test("中文守护：整段英文不撤回，只在工具调用前拦", async () => {
  resetCooldown();
  const pi = fakePi();
  await installGuard(pi);
  const [enTurn] = await call(pi, "turn_end", { message: msgOf(EN), messageEntryId: "e2", outcome: "completed", toolResults: [] });
  assert.ok(!(enTurn?.entries || []).some((e: any) => e.type === "custom_message"), "不再发撤回提示");
  assert.ok(!enTurn?.continue, "不再续跑");
  const [res] = await call(pi, "tool_call", { name: "bash" }, ctxOf(EN));
  assert.equal(res?.block, true, "英文思考之后的工具调用必须拦下");
  assert.match(res.reason, /不是中文/);
  const pi2 = fakePi();
  await installGuard(pi2);
  const [ok] = await call(pi2, "tool_call", { name: "bash" }, ctxOf(CN));
  assert.notEqual(ok?.block, true, "中文思考不该拦");
});



test("manifest：pi.extensions 指向的文件真的存在", async () => {
  const { readFileSync, existsSync } = await import("node:fs");
  const path = await import("node:path");
  const pkgPath = path.resolve("package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const list = pkg?.pi?.extensions;
  assert.ok(Array.isArray(list) && list.length > 0, "package.json 必须有 pi.extensions");
  for (const rel of list) {
    const target = path.resolve(rel);
  assert.ok(existsSync(target), "pi.extensions 指向的文件不存在：" + rel);
  }
});


test("中断的轮次不介入：aborted 不改写、error 不撤回", async () => {
  resetCooldown();
  const pi = fakePi();
  await installGuard(pi);
  const [ab] = await call(pi, "turn_end", { message: msgOf(FRAG), messageEntryId: "e-ab", outcome: "aborted", toolResults: [] });
  assert.equal(ab, undefined, "用户中断的轮次不该被改写（实测：以前返回 context_edit + custom_message 两条）");
  const [er] = await call(pi, "turn_end", { message: msgOf(EN), messageEntryId: "e-er", outcome: "error", toolResults: [] });
  assert.equal(er, undefined, "报错的轮次不该被撤回");
  const [un] = await call(pi, "turn_end", { message: msgOf(FRAG), messageEntryId: "e-un", outcome: "unknown", toolResults: [] });
  assert.equal(un, undefined, "outcome 缺失或未知时按不介入处理");
});


test("观察面：拦过一次后 blocked 计数与命令输出都能看到", async () => {
  resetCooldown();
  const pi = fakePi();
  await installGuard(pi);
  await call(pi, "tool_call", { name: "bash" }, ctxOf(EN));
  const cmd = pi.commands["think-sentry"];
  assert.ok(cmd, "应当注册 think-sentry 命令");
  const out = await cmd.handler("", { ui: { notify() {} } });
  // 默认是给人读的 4 行短表（2026-11-23 用户反馈：一坨 JSON 又丑又溢出、没复制按钮）
  assert.ok(/^capture (on|off)\b/m.test(out), "第一行应当是 capture on|off，实际：" + out);
  assert.ok(/拦 [1-9]/.test(out), "要能看到拦过几次，实际：" + out);
  const rows = out.split("\n");
  assert.ok(rows.length <= 6, "行数应当 ≤ 6，实际 " + rows.length);
  for (const line of rows) {
    assert.ok(line.length <= 44, "每行 ≤ 44 字符（弹窗会溢出），实际 " + line.length + "：" + line);
  }
  // 机读走 json 参数：同一次调用，两种出口
  const j = JSON.parse(await cmd.handler("json", { ui: { notify() {} } }));
  assert.ok(j.blocked >= 1, "json 里 blocked 应当至少 1");
  assert.equal(typeof j.lang, "string", "json 里要有 lang");
});

// 2026-11-26 用户决定：**这个插件不再注入任何内容**。
// 原来这四条测试通过 turn_end 返回的 entries 观察 strip 的产物：
//   碎片剔除 / 多块思考只改命中的那块（两条）/ 整块都是碎片时的回退
// 现在轮末一个字节都不写盘，观察点消失。
// 它们要证的性质是 strip.clean 的输出（纯函数），已经原样迁到 test/strip.test.ts，
// 那几条直接调 strip.clean，比端到端更精确（P20：证明项精确到这一条）。
// 自环那条（同一 entry 不再改）随写入一起消失：没有写入就没有自环。
