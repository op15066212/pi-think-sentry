// inline 诊断：真实退化段到底有多少句、最长坍缩区间有多长。
//
// 为什么需要它（2026-11-24，用户要求「按真实数据重写 inline」）：
//   全量回放 50641 段里 inline 只命中 129 段（0.3%）。不查清楚是「判据太严」还是
//   「真实退化本来就不长成那个形状」，重写就是照我自己的想象改。
//
// 三个数分开报：
//   句数分布        —— 判据硬门槛 n >= 12 到底卡掉多少
//   最长坍缩区间    —— 在句数够的段里，确实存在满足 ratio 的连续区间吗
//   dup 命中的段    —— 用「行复诵」当金标准，看 inline 漏了其中多少
import fs from "node:fs";
import path from "node:path";
import { dupIn, partitionLines, voteOf, sentencesOf, collapseRange, COLLAPSE_MIN_LEN, COLLAPSE_RATIO } from "../src/judges.ts";

const ROOT = process.argv[2];
const MAX_LINES = 200000;

if (!ROOT || !fs.existsSync(ROOT)) {
  console.error("用法：node bin/diagnose-inline.mjs <会话目录>");
  process.exit(2);
}

function collect(dir, depth = 0, out = []) {
  if (depth > 3) return out;
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collect(p, depth + 1, out);
    else if (e.name.endsWith(".jsonl")) out.push(p);
  }
  return out;
}

const thunks = [];
let lines = 0;
for (const p of collect(ROOT)) {
  let raw;
  try { raw = fs.readFileSync(p, "utf8"); } catch { continue; }
  for (const line of raw.split("\n")) {
    if (++lines > MAX_LINES) break;
    if (!line.includes('"thinking"')) continue;
    try {
      const rec = JSON.parse(line);
      const content = rec?.message?.content ?? rec?.content;
      if (!Array.isArray(content)) continue;
      for (const b of content) {
        if (b?.type === "thinking" && typeof b.thinking === "string") {
          const t = b.thinking;
          if (t.length >= 40 && t.length <= 20000) thunks.push(t);
        }
      }
    } catch { /* 畸形行跳过 */ }
  }
}

// 分桶：句数 < 12 的直接被判据门槛卡掉，这一桶不该算「判据失效」，该算「门槛假设不对」
const buckets = { short: [], mid: [], long: [] };
for (const t of thunks) {
  const sents = sentencesOf(t, []);
  const n = sents.length;
  if (n < COLLAPSE_MIN_LEN) buckets.short.push(t);
  else if (n < 40) buckets.mid.push(t);
  else buckets.long.push(t);
}

console.log("思考段 " + thunks.length + " 个");
console.log("  句数 < 12（判据门槛之下）  " + buckets.short.length);
console.log("  12 <= 句数 < 40            " + buckets.mid.length);
console.log("  句数 >= 40                 " + buckets.long.length);
console.log("");

// 在句数够的两桶里，看有多少真能形成一个满足 ratio 的连续区间
const enough = [...buckets.mid, ...buckets.long];
let found = 0;
const lens = [];
for (const t of enough) {
  const c = collapseRange(t, COLLAPSE_RATIO, COLLAPSE_MIN_LEN, []);
  if (c) { found++; lens.push(c.len); }
}
console.log("句数够的 " + enough.length + " 段里，存在坍缩区间：" + found + " 段（" + (enough.length ? (found / enough.length * 100).toFixed(1) : "0") + "%）");
if (lens.length) {
  lens.sort((a, b) => a - b);
  console.log("  区间句数：最小 " + lens[0] + " / 中位 " + lens[Math.floor(lens.length / 2)] + " / 最大 " + lens[lens.length - 1]);
}
console.log("");

// 金标准：dup 命中的段（行复诵是确定的退化），inline 漏了其中多少
let dupTotal = 0;
let dupCaught = 0;
let dupShort = 0;
for (const t of thunks) {
  const d = dupIn(voteOf(partitionLines(t)), 4);
  if (!d || !d.length) continue;
  dupTotal++;
  const sents = sentencesOf(t, []);
  if (sents.length < COLLAPSE_MIN_LEN) { dupShort++; continue; }
  if (collapseRange(t, COLLAPSE_RATIO, COLLAPSE_MIN_LEN, [])) dupCaught++;
}
console.log("金标准（dup 命中）" + dupTotal + " 段");
console.log("  其中句数 < 12（inline 一开始就不可能看到）：" + dupShort);
console.log("  句数够且 inline 也命中：" + dupCaught);
console.log("  inline 漏掉：" + (dupTotal - dupShort - dupCaught) + "   ← 这才是判据本身的问题");
