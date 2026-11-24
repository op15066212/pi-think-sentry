// 跨会话探针：同一套判据在不同会话上的命中率一样吗？
//
// 为什么要有它（2026-11-24，我自己在复核请求里写下的缺口）：
//   2046 段样本只来自一个会话（2026-11-21 的 pideck pr）。换一个会话可能不一样，
//   而「不一样」有两种，后续动作完全不同：
//     · 命中率普遍低 → 门槛太严，真实退化在别的会话里漏掉
//     · 命中率普遍高 → 那些会话里有另一种退化形状，或者误报集中在某类文本
//   不跨会话量一次，这两件事分不开。
//
// 有界（Ax4）：命令行给几个文件就只跑几个；单段超过 MAX_LEN 跳过；最多 MAX_SEG 段。
//
// 用法：node --experimental-strip-types bin/probe-cross-session.mts <file.jsonl>...
// 输出：每个文件一行 + 汇总。纯观察，不判红绿。

import fs from "node:fs";
import readline from "node:readline";
import { judgeThinking } from "../src/judges.ts";
import { shapeOf } from "../src/algo/shape.ts";
import { unifiedScore } from "../src/algo/unified.ts";
import { readConfig } from "../src/config.ts";

const MAX_LEN = 20000;
const MAX_SEG = 3000;

const c = readConfig();
// 出厂配置：与 index.ts 里 applyCfg 逐字段传进 judgeCfg 的那套一致
const CFG = {
  dupOn: c.dup.on, dupMin: c.dup.min,
  inlineOn: c.inline.on, inlineMin: c.inline.min, inlineRatio: c.inline.ratio,
  runOn: c.run.on, runMinLen: c.run.minLen,
  prefixOn: c.prefix.on, prefixMin: c.prefix.min,
  unifiedOn: c.unified.on, unifiedMin: c.unified.min,
  langOn: c.lang.on, langDir: c.lang.dir,
};

type Row = { file: string; segs: number; red: Record<string, number>; shape2plus: number; scoreMin: number; samples: string[] };

async function scan(file: string): Promise<Row> {
  const rl = readline.createInterface({ input: fs.createReadStream(file, "utf8"), crlfDelay: Infinity });
  const row: Row = { file: file.split(/[\\/]/).pop() || file, segs: 0, red: {}, shape2plus: 0, scoreMin: 1, samples: [] };
  for await (const line of rl) {
    if (!line.trim()) continue;
    let o: any;
    try { o = JSON.parse(line); } catch { continue; }
    const msg = o.message || o;
    if (!msg || msg.role !== "assistant") continue;
    const parts = msg.content || msg.parts || [];
    if (!Array.isArray(parts)) continue;
    for (const p of parts) {
      const t = p && p.type === "thinking" ? (p.thinking ?? p.text) : null;
      if (typeof t !== "string" || t.trim().length < 40 || t.length > MAX_LEN) continue;
      if (row.segs >= MAX_SEG) break;
      row.segs++;
      const v = judgeThinking(t, CFG as any);
      const key = v.kind === "none" ? "none" : String(v.rule);
      row.red[key] = (row.red[key] || 0) + 1;
      const sh = shapeOf(t, { headMin: c.prefix.min });
      if (sh.votes >= 2) {
        row.shape2plus++;
        if (row.samples.length < 2) row.samples.push(sh.why);
      }
      const u = unifiedScore(t, c.unified.min);
      if (u.score < row.scoreMin) row.scoreMin = u.score;
    }
  }
  return row;
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error("用法：node --experimental-strip-types bin/probe-cross-session.mts <file.jsonl>...");
  process.exit(2);
}

const rows: Row[] = [];
for (const f of files) {
  try { rows.push(await scan(f)); }
  catch (e) { console.error("读失败 " + f + ": " + (e as Error).message); }
}

const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) : "0.0") + "%";

console.log("文件".padEnd(30) + "段数".padStart(6) + "  判红率    shape>=2   dup   shape  其他   unified最低分");
for (const r of rows) {
  const redTotal = r.segs - (r.red.none || 0);
  const other = Object.entries(r.red).filter(([k]) => !["none", "dup", "shape"].includes(k)).reduce((a, [, v]) => a + v, 0);
  console.log(
    r.file.slice(0, 29).padEnd(30) +
    String(r.segs).padStart(6) + "  " +
    pct(redTotal, r.segs).padStart(7) + "  " +
    pct(r.shape2plus, r.segs).padStart(8) + "  " +
    String(r.red.dup || 0).padStart(5) + "  " +
    String(r.red.shape || 0).padStart(6) + "  " +
    String(other).padStart(5) + "  " +
    r.scoreMin.toFixed(3).padStart(8),
  );
}

const totSegs = rows.reduce((a, r) => a + r.segs, 0);
const totRed = rows.reduce((a, r) => a + r.segs - (r.red.none || 0), 0);
const totShape = rows.reduce((a, r) => a + r.shape2plus, 0);
console.log("\n合计 " + totSegs + " 段：判红 " + pct(totRed, totSegs) + "，shape>=2 " + pct(totShape, totSegs));

console.log("\n各文件的 shape 命中样例（前 1 条）：");
for (const r of rows) if (r.samples.length) console.log("  " + r.file.slice(0, 24) + "  " + r.samples[0].slice(0, 90));
