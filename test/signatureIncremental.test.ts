// 增量清理的判据：它必须与全量版给出同一个结果，同时不再每轮重数历史。
//
// 为什么要有这一组（2026-11-25）：全量版在 26000 条 entry 的会话里单次 4.4ms，
// 而幂等修好后第二轮起产出恒为 0。省下来的只能是「扫描」这一次，
// 所以判据只能是等价性——快不是目的，快而不变才是。
import test from "node:test";
import assert from "node:assert/strict";
import { planSignatureCleanup, planSignatureCleanupIncremental } from "../src/algo/signature.ts";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const asst = (i, sig = "reasoning_content") => ({
  id: "a" + i,
  type: "message",
  message: { role: "assistant", content: [{ type: "thinking", thinking: "t" + i, thinkingSignature: sig }] },
});
const user = (i) => ({ id: "u" + i, type: "message", message: { role: "user", content: [{ type: "text", text: "q" + i }] } });

/** 造一段会话：n 轮，每轮 user + assistant。 */
function session(n) {
  const out = [];
  for (let i = 0; i < n; i++) { out.push(user(i)); out.push(asst(i)); }
  return out;
}

test("第一次调用等价全量（水位从 0 开始，不是「跳过」）", () => {
  const entries = session(40);
  const full = planSignatureCleanup(entries, 30).map((e) => e.targetId);
  const inc = planSignatureCleanupIncremental(entries, 30, { boundary: 0 });
  assert.deepEqual(inc.edits.map((e) => e.targetId), full);
});

test("逐轮累计 == 一次全量（模拟 pi 每轮追加后跑一次）", () => {
  const all = session(120);
  const grow = [];
  const got = [];
  let state = { boundary: 0 };
  for (const e of all) {
    grow.push(e);
    const r = planSignatureCleanupIncremental(grow, 30, state);
    state = r.state;
    for (const ed of r.edits) { got.push(ed.targetId); grow.push({ id: "e" + got.length, type: "context_edit", targetId: ed.targetId, replacement: ed.replacement }); }
  }
  const full = planSignatureCleanup(all, 30).map((e) => e.targetId);
  assert.deepEqual(got, full);
});

test("稳态：边界不动时第二轮产出 0（幂等的另一半）", () => {
  const entries = session(60);
  const r1 = planSignatureCleanupIncremental(entries, 30, { boundary: 0 });
  assert.ok(r1.edits.length > 0, "坏样本：第一轮必须真的清出东西");
  const r2 = planSignatureCleanupIncremental(entries, 30, r1.state);
  assert.equal(r2.edits.length, 0);
});

test("反例：keepTurns 调小后边界左移，左移出来的那段必须补清", () => {
  const entries = session(80);
  // 先在 keepTurns=60 下跑一遍：只清最前面 20 个
  const r1 = planSignatureCleanupIncremental(entries, 60, { boundary: 0 });
  assert.equal(r1.edits.length, 20);
  const grown = entries.concat(r1.edits.map((ed, i) => ({ id: "e" + i, type: "context_edit", targetId: ed.targetId, replacement: ed.replacement })));
  // 用户把 keepTurns 调到 30：过期区从 20 条扩到 50 条，新增的 a20..a49 都未清
  const r2 = planSignatureCleanupIncremental(grown, 30, r1.state);
  assert.equal(r2.edits.length, 30, "左移扩出来的 a20..a49 必须补清，已清的 a0..a19 不许重复清");
});

test("真实会话上等价：前 400 条逐条增长，增量累计 == 一次全量", () => {
  const BK = "C:/tmp/session-backup-all";
  if (!existsSync(BK)) return; // 备份不在就跳过（判据依赖真实数据，不造）
  const f = readdirSync(BK).filter((x) => x.endsWith(".jsonl")).sort((a, b) => readFileSync(join(BK, a)).length - readFileSync(join(BK, b)).length)[0];
  const all = [];
  for (const line of readFileSync(join(BK, f), "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { all.push(JSON.parse(line)); } catch { /* 坏行跳过 */ }
    if (all.length >= 400) break;
  }
  const grow = [];
  const got = [];
  let state = { boundary: 0 };
  for (const e of all) {
    grow.push(e);
    const r = planSignatureCleanupIncremental(grow, 30, state);
    state = r.state;
    for (const ed of r.edits) { got.push(ed.targetId); grow.push({ id: "x" + got.length, type: "context_edit", targetId: ed.targetId, replacement: ed.replacement }); }
  }
  const full = planSignatureCleanup(all, 30).map((e) => e.targetId).filter((id) => !got.includes(id));
  assert.deepEqual(full, [], "全量版还能清出增量版漏掉的条目");
});
