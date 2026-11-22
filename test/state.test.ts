import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// state.json 的读失败保留「三合一」（损坏 = 空 = 不存在），与 config.ts 的两态不同。
// 判据是「写进去的东西是谁产生的」：配置是人手写的，丢了不可逆；state 是插件自己的计数，
// 丢了从 0 开始。这条测试锁住这个取舍的边界——丢掉计数可以，丢掉拦截不行。
//
// 2026-11-21 之前这条取舍只是注释里的一句话，没有判据。写在这里之后，谁把 state 改成
// 存「行为」而不是「观测」，这条会红。

const TMP_STATE = path.join(os.tmpdir(), "curb-state-test-" + process.pid + ".json");
const TMP_CFG = path.join(os.tmpdir(), "curb-cfg-test-" + process.pid + ".json");
process.env.CURB_STATE_FILE = TMP_STATE;
const readState = () => JSON.parse(fs.readFileSync(TMP_STATE, "utf8"));
process.env.CURB_CONFIG_FILE = TMP_CFG;

const { default: installGuard, stats } = await import("../src/index.ts");

function fakePi() {
  const hooks: Record<string, Function[]> = {};
  return { hooks, on(n: string, f: Function) { (hooks[n] ||= []).push(f); }, registerCommand() {} };
}
const call = async (pi: any, name: string, event: any = {}) => {
  const out = [];
  for (const fn of pi.hooks[name] || []) out.push(await fn(event));
  return out;
};
const msgOf = (thinking: string) => ({ content: [{ type: "thinking", thinking }] });

test("state.json 是坏 JSON：拦截照常发生，只有计数从头开始", async () => {
  fs.writeFileSync(TMP_STATE, "{ 坏掉 }");
  const pi = fakePi();
  await installGuard(pi);

  await call(pi, "message_update", { message: msgOf("做。\n做。\n做。\n做。") });
  const out = await call(pi, "tool_call", {});
  const blocked = out.some((x: any) => x && x.block);
  assert.equal(blocked, true, "读数失败不能把拦截一起关掉");
  assert.ok(stats.blocked >= 1, "计数从 0 起也算对，但拦下这件事必须被记上");
});

test("state.json 合法时，别的会话的计数会被保留", async () => {
  const now = Date.now();
  fs.writeFileSync(TMP_STATE, JSON.stringify({ other: { judgeCalls: 999, blocked: 7, at: now } }));
  const pi = fakePi();
  await installGuard(pi);
  await call(pi, "message_update", { message: msgOf("做。\n做。\n做。\n做。") });
  await call(pi, "tool_call", {});

  const back = readState();
  assert.ok(back.other, "文件合法时，写盘不许把别的会话冲掉");
  assert.equal(back.other.blocked, 7, "别的会话的计数逐字保留");
  assert.ok(back[Object.keys(back).find((k) => k !== "other")!].blocked >= 1, "当前会话的计数照常写进去");
});

test("同一条会话说清楚代价：只有文件损坏时才会丢别的会话", async () => {
  // 这不是缺陷，是取舍：state 是机器写的，可重建。这条测试把代价摆在明处，
  // 免得以后有人以为「三合一」在任何情况下都无损。
  fs.writeFileSync(TMP_STATE, "{ 坏掉 }");
  const pi = fakePi();
  await installGuard(pi);
  await call(pi, "message_update", { message: msgOf("做。\n做。\n做。\n做。") });
  await call(pi, "tool_call", {});
  const back = readState();
  assert.equal(back.other, undefined, "坏文件时别的会话确实会丢——已知代价");
});

test("两个会话键共用一个状态文件：各写各的，换会话不复位", async () => {
  // 2026-11-22：CURB_SESSION_KEY 之前不存在，PiDeck 跑着时 sessionKey 恒为
  // PIDECK_SESSION_ID，测试无法控制它，只能 find(k => k !== "other") 绕过去。
  // 一可控就抓到第二个缺陷：换会话时 stats 只回填不清零，BBB 继承了 AAA 的计数。
  fs.rmSync(TMP_STATE, { force: true });
  process.env.CURB_SESSION_KEY = "AAA";
  const pi1 = fakePi();
  await installGuard(pi1);
  await call(pi1, "before_agent_start", {});
  await call(pi1, "message_update", { message: msgOf("做。\n做。\n做。\n做。") });
  await call(pi1, "tool_call", {});

  process.env.CURB_SESSION_KEY = "BBB";
  const pi2 = fakePi();
  await installGuard(pi2);
  await call(pi2, "before_agent_start", {});
  await call(pi2, "message_update", { message: msgOf("做。\n做。\n做。\n做。") });
  await call(pi2, "tool_call", {});
  await call(pi2, "turn_end", { outcome: "completed", messageEntryId: "b1", message: msgOf("改好了。") });

  const back = readState();
  assert.ok(back.AAA, "AAA 的计数要在");
  assert.ok(back.BBB, "BBB 的计数要在");
  assert.equal(back.AAA.blocked, 1, "AAA 拦了一次");
  assert.equal(back.BBB.blocked, 1, "BBB 也拦了一次，不是 AAA 的 1 加 1");
  assert.ok(back.BBB.turns >= 1, "BBB 走了 turn_end");
  delete process.env.CURB_SESSION_KEY;
});
