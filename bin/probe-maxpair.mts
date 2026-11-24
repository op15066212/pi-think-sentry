import fs from "node:fs";
import readline from "node:readline";
import { stripMdPrefix } from "../src/algo/shape.ts";
import { exciseInjectedForTest } from "../src/judges.ts";
import { readConfig } from "../src/config.ts";

const c = readConfig();
const skip = c.inject.on ? [c.inject.texts.dup, c.inject.texts.lang, c.inject.texts.clean].filter(Boolean).join(String.fromCharCode(10)) : "";

// 一行切成 3-gram 集合（去标点、去空白）
function grams3(line) {
  const s = String(line || "").replace(/[\s\p{P}]/gu, "");
  const ch = [...s];
  const out = new Set();
  for (let i = 0; i + 3 <= ch.length; i++) out.add(ch.slice(i, i + 3).join(""));
  return out;
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  for (const x of small) if (big.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

// 两行之间的最大相似度。不是平均——1500 字里 50 字重复，平均会稀释成 0.03，
// 但那 50 字恰恰是「同一件事说了两遍」的证据。
function maxPairSim(lines) {
  const gs = lines.map(grams3).filter((s) => s.size >= 4);
  if (gs.length < 2) return { max: 0, pair: null };
  let max = 0, pair = null;
  for (let i = 0; i < gs.length; i++) {
    for (let j = i + 1; j < gs.length; j++) {
      const v = jaccard(gs[i], gs[j]);
      if (v > max) { max = v; pair = [i, j]; }
    }
  }
  return { max, pair };
}

const files = process.argv.slice(2);
const rows = [];
for (const f of files) {
  const rl = readline.createInterface({ input: fs.createReadStream(f, "utf8"), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    const msg = o.message || o;
    if (!msg || msg.role !== "assistant") continue;
    const parts = msg.content || msg.parts || [];
    if (!Array.isArray(parts)) continue;
    for (const p of parts) {
      const t = p && p.type === "thinking" ? p.thinking : null;
      if (typeof t !== "string" || t.trim().length < 40 || t.length > 20000) continue;
      const body = exciseInjectedForTest(t, skip);
      const raw = body.split("\n").map(stripMdPrefix).filter((x) => x.length >= 8);
      const { max } = maxPairSim(raw);
      // 组标签：看首行前缀
      const first = raw[0] || "";
      const top = first.startsWith("务实：") || first.startsWith("務實：") ? "务实类"
        : first.startsWith("关键：") ? "关键类" : "(其他)";
      rows.push({ top, max, n: raw.length });
    }
  }
}

const q = (a, p) => { if (!a.length) return 0; const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * b.length))]; };
const groups = new Map();
for (const r of rows) { if (!groups.has(r.top)) groups.set(r.top, []); groups.get(r.top).push(r); }
console.log("总段 " + rows.length + "   两行最大相似度（3-gram Jaccard）的分布");
console.log("");
console.log("组".padEnd(12) + "段数".padStart(6) + "   p50    p75    p90    p99    max");
for (const [k, list] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const m = list.map((x) => x.max);
  console.log(
    k.padEnd(12) + String(list.length).padStart(6) + "   " +
    [0.5, 0.75, 0.9, 0.99, 1].map((p) => q(m, p).toFixed(3).padStart(6)).join(" ")
  );
}