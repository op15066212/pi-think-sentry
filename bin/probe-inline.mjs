// inline 判据候选量的实测：在真实数据上，哪几个数能把「退化」和「正常」分开。
//
// 背景（2026-11-24）：现有 collapseRange 是 O(n²) 连续区间搜索，在 3384 段金标准里
// 只命中 110 段，漏掉 3143 段——因为真实重复是**散落**的，连续区间凑不够长度。
//
// 这里不预设答案，先把三个候选量在真实数据上的分布打出来：
//   uniqRatio    不同句数 / 总句数        （原判据的意图，但去掉「连续」限制）
//   topShare     最高频那一句占全部句子的比例
//   repeatCover  出现 >= 2 次的句子覆盖的句子数 / 总句数
//
// 判据要从这三个数里选，选哪一个由这分布决定，不由我的偏好决定。
import fs from "node:fs";
import path from "node:path";
import { dupIn, partitionLines, voteOf, sentencesOf } from "../src/judges.ts";

const ROOT = process.argv[2];
const MAX_LINES = 200000;

if (!ROOT || !fs.existsSync(ROOT)) {
  console.error("用法：node bin/probe-inline.mjs <会话目录>");
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

const stats = (t) => {
  const sents = sentencesOf(t, []).map((s) => s.t);
  const n = sents.length;
  if (!n) return null;
  const cnt = new Map();
  for (const s of sents) cnt.set(s, (cnt.get(s) || 0) + 1);
  let top = 0;
  let repeated = 0;
  for (const c of cnt.values()) {
    if (c > top) top = c;
    if (c >= 2) repeated += c;
  }
  return { n, uniq: cnt.size, uniqRatio: cnt.size / n, topShare: top / n, repeatCover: repeated / n };
};

// 金标准：dup 命中的段当「确定退化」，其余当「未标记」。不是精确标注，但足够看分布。
const gold = [];
const rest = [];
for (const t of thunks) {
  const s = stats(t);
  if (!s || s.n < 6) continue;   // 少于 6 句统计没意义
  const d = dupIn(voteOf(partitionLines(t)), 4);
  (d && d.length ? gold : rest).push(s);
}

const pct = (arr, key, p) => {
  const v = arr.map((x) => x[key]).sort((a, b) => a - b);
  if (!v.length) return "—";
  return v[Math.min(v.length - 1, Math.floor(v.length * p))].toFixed(3);
};

console.log("样本：" + gold.length + " 段金标准退化，" + rest.length + " 段未标记");
console.log("");
console.log("量          金标准 p10 / p50 / p90      未标记 p10 / p50 / p90");
for (const k of ["uniqRatio", "topShare", "repeatCover"]) {
  const a = [0.1, 0.5, 0.9].map((p) => pct(gold, k, p)).join(" / ");
  const b = [0.1, 0.5, 0.9].map((p) => pct(rest, k, p)).join(" / ");
  console.log(k.padEnd(12) + a.padEnd(26) + b);
}

// 分界试探：取一个阈值，报「金标准命中率」与「未标记段的误报率」
console.log("");
console.log("阈值试探（越低越宽松）：");
for (const [k, th] of [["combo", 0.3], ["combo", 0.25], ["combo", 0.22]]) {
  // 组合：topShare 抓高频单句，repeatCover 抓「大半都是重复」。
  const yes = (x) => x.topShare >= th || x.repeatCover >= 0.5;
  const hit = gold.filter(yes).length;
  const fp = rest.filter(yes).length;
  console.log(
    "  " + k + " " + (k === "uniqRatio" ? "<=" : ">=") + " " + th +
    "   金标准命中 " + (gold.length ? (hit / gold.length * 100).toFixed(1) : "0") + "%" +
    "   未标记命中 " + (rest.length ? (fp / rest.length * 100).toFixed(1) : "0") + "%",
  );
}
