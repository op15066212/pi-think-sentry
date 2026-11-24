import fs from "node:fs";
import readline from "node:readline";
import { judgeThinking, exciseInjectedForTest, judgeCfg } from "../src/judges.ts";
import { shapeOf } from "../src/algo/shape.ts";
import { readConfig } from "../src/config.ts";

const c = readConfig();
const skip = c.inject.on ? [c.inject.texts.dup, c.inject.texts.lang, c.inject.texts.clean].filter(Boolean).join(String.fromCharCode(10)) : "";
const CFG = judgeCfg({
  dupOn: c.dup.on, dupMin: c.dup.min,
  inlineOn: c.inline.on, inlineMin: c.inline.min, inlineRatio: c.inline.ratio,
  runOn: c.run.on, runMinLen: c.run.minLen,
  prefixOn: false, prefixMin: c.prefix.min,
  unifiedOn: c.unified.on, unifiedMin: c.unified.min,
  langOn: c.lang.on, langDir: c.lang.dir,
} as any);

function nestDepth(line) {
  const t = line.trim();
  for (let k = 2; k <= 10; k++) {
    if (t.length < k * 2) break;
    const seg = t.slice(0, k);
    let cnt = 0, i = 0;
    while (t.slice(i, i + k) === seg) { cnt++; i += k; }
    if (cnt >= 2) return cnt;
  }
  return 1;
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
      const raw = body.split("\n").map((x) => x.trim()).filter((x) => x.length >= 6);
      const maxDepth = raw.length ? Math.max(...raw.map(nestDepth)) : 1;
      const sh = shapeOf(body, { headMin: c.prefix.min });
      const v = judgeThinking(t, CFG);
      rows.push({ maxDepth, prefixHit: sh.votes >= 2, inlineRed: v.kind !== "none" && v.rule === "inline", body: body.slice(0, 120) });
    }
  }
}

console.log("总段 " + rows.length);
console.log("");
console.log("=== 嵌套深度：阈值 -> 命中段数 -> 其中落在「行首越线的段」里的比例（当精度代理）===");
for (const d of [2, 3, 4]) {
  const hit = rows.filter((r) => r.maxDepth >= d);
  const inPrefix = hit.filter((r) => r.prefixHit).length;
  console.log("  maxDepth >= " + d + " : " + String(hit.length).padStart(5) + " 段  其中行首越线 " + inPrefix + " (" + (hit.length ? ((100*inPrefix)/hit.length).toFixed(0) : "0") + "%)");
}
console.log("");
const inlineRed = rows.filter((r) => r.inlineRed);
console.log("=== inline 判红 " + inlineRed.length + " 段（占 " + (100*inlineRed.length/rows.length).toFixed(2) + "%），抽 6 段内容 ===");
for (const r of inlineRed.slice(0, 6)) {
  console.log("  | " + r.body.replace(/\s+/g, " ").slice(0, 96));
}
