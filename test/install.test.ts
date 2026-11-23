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
const call = async (pi: any, name: string, event: any = {}) => {
  const out = [];
  for (const fn of pi.hooks[name] || []) out.push(await fn(event));
  return out;
};

// 流式去重（2026-11-23）：message_update 一段思考会来几十帧。每帧判红就记一条，
// 台账里的「红」于是成了帧数而不是次数——实测同一条 red 连记 5 次（时间戳与 head 全同）。
// 两条断言：同一文本 4 帧只记 1 条；文本变了才记第 2 条。
test("同一份思考不重复记账：流式多帧只记一条 red", async () => {
  const LEDGER = path.join(os.tmpdir(), "curb-test-ledger-" + process.pid + ".jsonl");
  process.env.PI_THINK_SENTRY_LEDGER = LEDGER;
  try { fs.rmSync(LEDGER, { force: true }); } catch {}
  try {
    resetCooldown();
    const pi = fakePi();
    await installGuard(pi);
    await call(pi, "before_agent_start");
    const reds = () => {
      try {
        return fs.readFileSync(LEDGER, "utf8").trim().split("\n").filter(Boolean)
          .map((l) => JSON.parse(l)).filter((j: any) => j.ev === "red");
      } catch { return []; }
    };
    // 同一段思考来 4 帧（流式）
    for (let i = 0; i < 4; i++) await call(pi, "message_update", { message: msgOf(FRAG) });
    assert.equal(reds().length, 1, "同一文本 4 帧应当只记 1 条 red，实际 " + reds().length);
    // 改了内容 → 那是新的一次判红，要记
    await call(pi, "message_update", { message: msgOf(FRAG + "\n（执行）done。") });
    assert.equal(reds().length, 2, "文本变了应当记第 2 条，实际 " + reds().length);
  } finally {
    delete process.env.PI_THINK_SENTRY_LEDGER;
    try { fs.rmSync(LEDGER, { force: true }); } catch {}
  }
});

const FRAG = "读完配置后我把三个阈值都记下来，然后逐条核对它们是不是写在同一个文件里。\n（执行）done。\n（执行）done。\n（执行）done。\n（执行）done。";
const EN = [
  "I think we should read the file first.",
  "Then check whether the threshold is in the config.",
  "So that we can change it and rerun the test.",
].join("\n");
const CN = "我刚发现阈值写在配置文件里而不是代码里，所以下一步应该改配置再跑一次测试，确认退出码是零，然后核对没有别处也写了这个值。";

test("接线：四个钩子都注册了", async () => {
  resetCooldown();
  const pi = fakePi();
  await installGuard(pi);
  for (const h of ["before_agent_start", "message_update", "tool_call", "turn_end"]) {
  assert.ok((pi.hooks[h] || []).length >= 1, h + " 没注册");
  }
});

test("碎片：工具调用之前拦一次，原因含词与次数", async () => {
  resetCooldown();
  const pi = fakePi();
  await installGuard(pi);
  await call(pi, "before_agent_start");
  await call(pi, "message_update", { message: msgOf(FRAG) });
  const [res] = await call(pi, "tool_call", { name: "bash" });
  assert.equal(res?.block, true);
  assert.match(res.reason, /短行|次/);          // 新提示只说事实：哪一行重复了几次，或有几行短行
  assert.match(res.reason, /\d+/);
});

test("语言：整段英文之后工具调用照样拦，给的是语言处方", async () => {
  // 2026-11-18 重启后实测：拦是拦了，理由却是「同一行出现了 ? 次」后面空白。
  // 原因是 STREAM 只把 strip 记进 lastV，retract 没记，tool_call 处拿不到判据。
  resetCooldown();
  const pi = fakePi();
  await installGuard(pi);
  await call(pi, "before_agent_start");
  await call(pi, "message_update", { message: msgOf(EN) });
  const [res] = await call(pi, "tool_call", { name: "bash" });
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
  await call(pi, "before_agent_start");
  await call(pi, "message_update", { message: msgOf(EN) });
  await call(pi, "message_update", { message: msgOf(CN) });
  const [res] = await call(pi, "tool_call", { name: "bash" });
  // 钩子「不拦」时返回 undefined（不是 {block:false}）。
  assert.notEqual(res?.block, true, "上一个 thinking 块是中文，不该拦；实际 " + JSON.stringify(res));
});

test("碎片：轮末按行剔除重复行，改后的文本不再含那句碎片", async () => {
  resetCooldown();
  const pi = fakePi();
  await installGuard(pi);
  await call(pi, "before_agent_start");
  const [res] = await call(pi, "turn_end", {
    message: msgOf(FRAG), messageEntryId: "e1", outcome: "completed", toolResults: [],
  });
  assert.ok(Array.isArray(res?.entries) && res.entries.length >= 1, "应当返回 entries");
  assert.equal(res.entries[0].type, "context_edit", "第一条应是 context_edit");
  const thought = res.entries[0].replacement.content.find((c: any) => c.type === "thinking").thinking;
  assert.ok((thought).length < FRAG.length, "剔除之后（去掉结算段）应当变短");
  assert.ok(!thought.includes("（执行）done。"), "重复行应当被删干净，实际：" + thought.slice(0, 80));
});

test("中文守护：整段英文不撤回，只在工具调用前拦", async () => {
  resetCooldown();
  const pi = fakePi();
  await installGuard(pi);
  await call(pi, "before_agent_start");
  const [enTurn] = await call(pi, "turn_end", { message: msgOf(EN), messageEntryId: "e2", outcome: "completed", toolResults: [] });
  assert.ok(!(enTurn?.entries || []).some((e: any) => e.type === "custom_message"), "不再发撤回提示");
  assert.ok(!enTurn?.continue, "不再续跑");
  await call(pi, "message_update", { message: msgOf(EN) });
  const [res] = await call(pi, "tool_call", { name: "bash" });
  assert.equal(res?.block, true, "英文思考之后的工具调用必须拦下");
  assert.match(res.reason, /不是中文/);
  const pi2 = fakePi();
  await installGuard(pi2);
  await call(pi2, "before_agent_start");
  await call(pi2, "message_update", { message: msgOf(CN) });
  const [ok] = await call(pi2, "tool_call", { name: "bash" });
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

test("自环按 entryId 判：同一条 entry 不再改，换 entry 是新介入", async () => {
  resetCooldown();
  const pi = fakePi();
  await installGuard(pi);
  await call(pi, "before_agent_start");
  const [c1] = await call(pi, "turn_end", { message: msgOf(FRAG), messageEntryId: "e3", outcome: "completed", toolResults: [] });
  assert.ok(c1?.entries, "第一次应改写");
  const [c1b] = await call(pi, "turn_end", { message: msgOf(FRAG), messageEntryId: "e3", outcome: "completed", toolResults: [] });
  assert.ok(!c1b, "同一条 entry 再来是自环，不该再改");
  const [c2] = await call(pi, "turn_end", { message: msgOf(FRAG), messageEntryId: "e4", outcome: "completed", toolResults: [] });
  assert.ok(c2?.entries, "换了 entry 是新介入，该改");
});

test("中断的轮次不介入：aborted 不改写、error 不撤回", async () => {
  resetCooldown();
  const pi = fakePi();
  await installGuard(pi);
  await call(pi, "before_agent_start");
  const [ab] = await call(pi, "turn_end", { message: msgOf(FRAG), messageEntryId: "e-ab", outcome: "aborted", toolResults: [] });
  assert.equal(ab, undefined, "用户中断的轮次不该被改写（实测：以前返回 context_edit + custom_message 两条）");
  const [er] = await call(pi, "turn_end", { message: msgOf(EN), messageEntryId: "e-er", outcome: "error", toolResults: [] });
  assert.equal(er, undefined, "报错的轮次不该被撤回");
  const [un] = await call(pi, "turn_end", { message: msgOf(FRAG), messageEntryId: "e-un", outcome: "unknown", toolResults: [] });
  assert.equal(un, undefined, "outcome 缺失或未知时按不介入处理");
});

test("多块思考：只改有重复行的那一块，另一块原样（防上下文膨胀）", async () => {
  resetCooldown();
  const pi = fakePi();
  await installGuard(pi);
  await call(pi, "before_agent_start");
  const B = "第二块思考写完整，不含碎片，用来验证不会被灌成同一段。";
  const msg = { content: [{ type: "thinking", thinking: FRAG }, { type: "text", text: "回答" }, { type: "thinking", thinking: B }] };
  const [res] = await call(pi, "turn_end", { message: msg, messageEntryId: "e-multi", outcome: "completed", toolResults: [] });
  const blocks = (res?.entries?.[0]?.replacement?.content || []).filter((c: any) => c.type === "thinking");
  assert.equal(blocks.length, 2, "两块都还在");
  assert.ok((blocks[0].thinking).length < FRAG.length, "第一块被改短（去掉结算段）");
  assert.equal((blocks[1].thinking), B, "第二块必须原样（结算段除外）");
});

test("多块思考：重复行在第二块时只改第二块，第一块逐字不变", async () => {
  resetCooldown();
  const pi = fakePi();
  await installGuard(pi);
  await call(pi, "before_agent_start");
  const A = "第一块是干净的完整句子，不含任何碎片，用来断言它逐字保留。";
  const msg = { content: [{ type: "thinking", thinking: A }, { type: "text", text: "回答" }, { type: "thinking", thinking: FRAG }] };
  const [res] = await call(pi, "turn_end", { message: msg, messageEntryId: "e-multi2", outcome: "completed", toolResults: [] });
  const blocks = (res?.entries?.[0]?.replacement?.content || []).filter((c: any) => c.type === "thinking");
  assert.equal((blocks[0].thinking), A, "第一块必须逐字不变（结算段除外）");
  assert.ok((blocks[1].thinking).length < FRAG.length, "第二块被改短（去掉结算段）");
});

test("观察面：拦过一次后 blocked 计数与命令输出都能看到", async () => {
  resetCooldown();
  const pi = fakePi();
  await installGuard(pi);
  await call(pi, "before_agent_start");
  await call(pi, "message_update", { message: msgOf(FRAG) });
  await call(pi, "tool_call", { name: "bash" });
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

test("整块都是碎片：有正文就删光，只剩思考才回退原文", async () => {
  resetCooldown();
  const pi = fakePi();
  await installGuard(pi);
  await call(pi, "before_agent_start");
  const wall = Array.from({ length: 30 }, () => "做。").join("\n");   // 历史形态：整块都是碎片
  const msg = { content: [{ type: "thinking", thinking: wall }, { type: "text", text: "回答" }] };
  const [res] = await call(pi, "turn_end", { message: msg, messageEntryId: "e-wall", outcome: "completed", toolResults: [] });
  const blocks1 = res?.entries?.[0]?.replacement?.content || [];
  assert.ok(blocks1.some((c: any) => c.type === "text"), "正文块要留着");
  for (const b of blocks1.filter((c: any) => c.type === "thinking")) {
    assert.ok(String(b.thinking).trim().length > 0, "不该留下只有换行的空 thinking 块");
  }
  const said1 = (res?.entries || []).find((x: any) => x.type === "custom_message")?.content || "";
  assert.ok(!/原文保留|已从上文删掉/.test(said1), "有正文时删干净了，不该说原文保留，实际：" + said1);

  // 只有 thinking 块、删光之后：留一句占位，不回退原文（使用者 2026-11-21：空守护）。
  resetCooldown();
  const pi2 = fakePi();
  await installGuard(pi2);
  await call(pi2, "before_agent_start");
  const msg2 = { content: [{ type: "thinking", thinking: wall }] };
  const [res2] = await call(pi2, "turn_end", { message: msg2, messageEntryId: "e-wall2", outcome: "completed", toolResults: [] });
  const kept = (res2?.entries || []).find((x: any) => x.type === "context_edit")?.replacement?.content?.find((c: any) => c.type === "thinking")?.thinking || "";
  assert.ok(kept.trim().length > 0, "空守护：删空之后必须留一句，不能是空白，实际：" + JSON.stringify(kept));
  assert.ok(!kept.includes("做。"), "重复行已经删掉了，不该留原文，实际：" + kept.slice(0, 40));
  // R6：占位句从固定句改成指针，判据要跟着变——指得到行号，且不自造句子。
  assert.match(kept, /\[原第 \d+-\d+ 行共 \d+ 行，全部重复已删\]/, "占位句要指得到行号，实际：" + kept.slice(0, 60));
});
