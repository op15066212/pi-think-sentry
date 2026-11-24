import fs from "node:fs";
import readline from "node:readline";
import { judgeThinking, judgeCfg } from "../src/judges.ts";
import { readConfig } from "../src/config.ts";

const c = readConfig();
const CFG = judgeCfg({
  dupOn: c.dup.on, dupMin: c.dup.min,
  inlineOn: c.inline.on, inlineMin: c.inline.min, inlineRatio: c.inline.ratio,
  runOn: c.run.on, runMinLen: c.run.minLen,
  prefixOn: false, prefixMin: c.prefix.min,
  unifiedOn: c.unified.on, unifiedMin: c.unified.min,
  langOn: c.lang.on, langDir: c.lang.dir,
} as any);

const cjkOf = (t) => {
  const all = [...t].length;
  const cn = (t.match(/[\u4e00-\u9fff]/g) || []).length;
  return all ? cn / all : 0;
};

const files = process.argv.slice(2);
let total = 0, langRed = 0;
const buckets = { "纯英文(CJK<5%)": 0, "英文为主(5-30%)": 0, "中文为主(30-70%)": 0, "中文(>70%)": 0 };
const samples = { "英文为主(5-30%)": [], "中文为主(30-70%)": [] };

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
      total++;
      if (judgeThinking(t, CFG).rule !== "lang") continue;
      langRed++;
      const r = cjkOf(t);
      const k = r < 0.05 ? "纯英文(CJK<5%)" : r < 0.3 ? "英文为主(5-30%)" : r < 0.7 ? "中文为主(30-70%)" : "中文(>70%)";
      buckets[k]++;
      if (samples[k] && samples[k].length < 4) samples[k].push(t.split("\n").filter(x=>x.trim()).slice(0,2).map(x=>x.trim().slice(0,64)).join(" / "));
    }
  }
}
console.log("总段 " + total + "，lang 判红 " + langRed + " = " + (100*langRed/total).toFixed(1) + "%");
console.log("");
for (const [k, v] of Object.entries(buckets)) {
  console.log("  " + k.padEnd(26) + String(v).padStart(6) + "  (" + (100*v/langRed).toFixed(1) + "% 的 lang 判红)");
}
console.log("");
for (const [k, arr] of Object.entries(samples)) {
  if (!arr.length) continue;
  console.log("=== " + k + " 样本 ===");
  for (const s of arr) console.log("  | " + s);
  console.log("");
}
