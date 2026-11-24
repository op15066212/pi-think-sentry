import fs from "node:fs";
import readline from "node:readline";
import { judgeThinking, judgeCfg } from "../src/judges.ts";
import { shapeOf } from "../src/algo/shape.ts";
import { readConfig } from "../src/config.ts";

const c = readConfig();
const mk = (prefixOn) => judgeCfg({
  dupOn: c.dup.on, dupMin: c.dup.min,
  inlineOn: c.inline.on, inlineMin: c.inline.min, inlineRatio: c.inline.ratio,
  runOn: c.run.on, runMinLen: c.run.minLen,
  prefixOn, prefixMin: c.prefix.min,
  unifiedOn: c.unified.on, unifiedMin: c.unified.min,
  langOn: c.lang.on, langDir: c.lang.dir,
} as any);
const ON = mk(true), OFF = mk(false);

const files = process.argv.slice(2);
const per = [];
const langSamples = [];
const dupSamples = [];
let shapeHitTotal = 0, shapeHitInline = 0;
const overlapByFile = {};

for (const f of files) {
  const name = f.split(/[\\/]/).pop().slice(0, 19);
  const row = { name, n: 0, dup: 0, inline: 0, lang: 0, shape: 0 };
  overlapByFile[name] = { shape: 0, inline: 0 };
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
      row.n++;
      const v = judgeThinking(t, ON);
      if (v.kind !== "none" && v.rule === "dup") { row.dup++; if (dupSamples.length < 10 && v.ev && v.ev.dups) dupSamples.push(v.ev.dups.map((d) => JSON.stringify(d[0]) + " x" + d[1]).join("  ")); }
      if (v.kind !== "none" && v.rule === "inline") row.inline++;
      if (v.kind !== "none" && v.rule === "lang") { row.lang++; if (langSamples.length < 20) langSamples.push(t.split("\n").filter((x) => x.trim()).slice(0, 2).map((x) => x.trim().slice(0, 70)).join(" / ")); }
      // shape 命中（用关 prefix 的配置拿不到 shape，所以单独算）
      const sh = shapeOf(t, { headMin: c.prefix.min });
      if (sh.votes >= 2) {
        row.shape++;
        shapeHitTotal++;
        const vOff = judgeThinking(t, OFF);
        if (vOff.kind !== "none" && vOff.rule === "inline") { shapeHitInline++; overlapByFile[name].inline++; }
        overlapByFile[name].shape++;
      }
    }
  }
  per.push(row);
}

console.log("=== 分会话明细（shape 用 votes>=2 单独算；dup/inline/lang 用出厂配置短路链）===");
console.log("文件".padEnd(21) + "段数".padStart(6) + "dup".padStart(6) + "inline".padStart(7) + "lang".padStart(5) + "shape>=2".padStart(9));
for (const r of per) {
  console.log(r.name.padEnd(21) + String(r.n).padStart(6) + String(r.dup).padStart(6) + String(r.inline).padStart(7) + String(r.lang).padStart(5) + String(r.shape).padStart(9));
}
const T = per.reduce((a, r) => ({ n: a.n + r.n, dup: a.dup + r.dup, inline: a.inline + r.inline, lang: a.lang + r.lang, shape: a.shape + r.shape }), { n: 0, dup: 0, inline: 0, lang: 0, shape: 0 });
console.log("合计".padEnd(21) + String(T.n).padStart(6) + String(T.dup).padStart(6) + String(T.inline).padStart(7) + String(T.lang).padStart(5) + String(T.shape).padStart(9));
console.log("");
console.log("shape 命中 " + shapeHitTotal + " 段，其中关掉 shape 后 inline 也判红的 " + shapeHitInline + " 段 = " + (100*shapeHitInline/shapeHitTotal).toFixed(1) + "%");
console.log("重叠分布：");
for (const [k, v] of Object.entries(overlapByFile)) if (v.shape) console.log("  " + k + "  shape " + v.shape + " / inline " + v.inline);
console.log("");
console.log("=== lang 判红前 20 段（看是否误报）===");
for (const s of langSamples) console.log("  | " + s.slice(0, 110));
console.log("");
console.log("=== dup 判红的实际重复串（前 10 段）===");
for (const s of dupSamples) console.log("  | " + s.slice(0, 110));
