import fs from "node:fs";
import readline from "node:readline";
import { shapeOf, stripMdPrefix } from "../src/algo/shape.ts";
import { exciseInjectedForTest } from "../src/judges.ts";
import { readConfig } from "../src/config.ts";

const c = readConfig();
const skip = c.inject.on ? [c.inject.texts.dup, c.inject.texts.lang, c.inject.texts.clean].filter(Boolean).join(String.fromCharCode(10)) : "";

function tokensOf(line) {
  const out = new Set();
  for (const m of line.matchAll(/[A-Za-z0-9_./-]{2,}/g)) out.add("w:" + m[0].toLowerCase());
  const cn = line.replace(/[^\u4e00-\u9fff]/g, " ");
  for (const seg of cn.split(/\s+/)) {
    for (let i = 0; i + 2 <= seg.length; i++) out.add("c:" + seg.slice(i, i + 2));
  }
  return out;
}

function crossLineShare(lines) {
  if (lines.length < 3) return 0;
  const per = lines.map(tokensOf).filter((s) => s.size >= 3);
  if (per.length < 3) return 0;
  const freq = new Map();
  for (const s of per) for (const t of s) freq.set(t, (freq.get(t) || 0) + 1);
  const need = Math.max(3, Math.ceil(per.length * 0.5));
  let total = 0, shared = 0;
  for (const s of per) total += s.size;
  for (const s of per) for (const t of s) if (freq.get(t) >= need) shared++;
  return total ? shared / total : 0;
}

function rareShare(lines) {
  if (lines.length < 3) return 0;
  const per = lines.map((l) => new Set([...l.matchAll(/[A-Za-z0-9_./-]{4,}/g)].map((m) => m[0].toLowerCase())));
  const has = per.filter((s) => s.size > 0);
  if (has.length < 2) return 0;
  const freq = new Map();
  for (const s of has) for (const t of s) freq.set(t, (freq.get(t) || 0) + 1);
  let total = 0, rep = 0;
  for (const s of has) for (const t of s) { total++; if (freq.get(t) >= 2) rep++; }
  return total ? rep / total : 0;
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
      const sh = shapeOf(body, { headMin: c.prefix.min });
      const head = sh.dims.find((d) => d.name === "行首");
      const lines = body.split("\n").map(stripMdPrefix).filter((x) => x.length >= 6);
      rows.push({
        top: head && head.over ? head.top : "(无固定前缀)",
        votes: sh.votes,
        cross: crossLineShare(lines),
        rare: rareShare(lines),
      });
    }
  }
}

const q = (a, p) => { if (!a.length) return 0; const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * b.length))]; };
const groups = new Map();
for (const r of rows) {
  const k = r.top === "务实：" || r.top === "務實：" ? "务实类(11-21)" : r.top === "关键：" ? "关键类" : r.votes >= 2 ? "其他命中" : "未命中(正常)";
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}
console.log("总段 " + rows.length + "    p10/p50/p90");
console.log("");
console.log("组".padEnd(16) + "段数".padStart(6) + "   跨行共享度       罕见token重复");
for (const [k, list] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const cross = list.map((x) => x.cross);
  const rare = list.map((x) => x.rare);
  console.log(
    k.padEnd(16) + String(list.length).padStart(6) + "   " +
    [0.1, 0.5, 0.9].map((p) => q(cross, p).toFixed(2).padStart(5)).join(" ") + "    " +
    [0.1, 0.5, 0.9].map((p) => q(rare, p).toFixed(2).padStart(5)).join(" ")
  );
}
