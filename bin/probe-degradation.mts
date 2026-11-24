
import fs from "node:fs";
import { judgeThinking } from "../src/judges.ts";

const f = process.argv[2];
const raw = fs.readFileSync(f, "utf8");
const lines = raw.split("\n").filter(Boolean);
const thinks: string[] = [];
for (const l of lines) {
  let o: any;
  try { o = JSON.parse(l); } catch { continue; }
  const msg = o.message || o;
  if (!msg || msg.role !== "assistant") continue;
  const parts = msg.content || msg.parts || [];
  if (!Array.isArray(parts)) continue;
  for (const p of parts) {
    if (p && p.type === "thinking" && typeof p.thinking === "string" && p.thinking.trim().length >= 40) {
      thinks.push(p.thinking);
    }
    if (p && p.type === "thinking" && typeof p.text === "string" && p.text.trim().length >= 40) {
      thinks.push(p.text);
    }
  }
}
console.log("文件：" + f.split("\\").pop());
console.log("思考段：" + thinks.length + " 个\n");

import { readConfig } from "../src/config.ts";
// 出厂默认 = index.ts 那套投影（applyCfg 里逐字段传进 judgeCfg 的东西）。
// 手写 { dupOn:true, inlineOn:true, langOn:true } 测的不是出厂配置，是「我以为的出厂配置」。
const c = readConfig();
const DEFAULT = {
  dupOn: c.dup.on, dupMin: c.dup.min,
  inlineOn: c.inline.on, inlineMin: c.inline.min, inlineRatio: c.inline.ratio,
  runOn: c.run.on, runMinLen: c.run.minLen,
  prefixOn: c.prefix.on, prefixMin: c.prefix.min,
  unifiedOn: c.unified.on, unifiedMin: c.unified.min,
  langOn: c.lang.on, langDir: c.lang.dir,
};
const ALL = { dupOn: true, inlineOn: true, langOn: true, prefixOn: true, runOn: true, unifiedOn: true };

const tally = (cfg: any, name: string) => {
  const c: Record<string, number> = { none: 0 };
  let firstRed = -1;
  thinks.forEach((t, i) => {
    const v = judgeThinking(t, cfg);
    c[v.kind === "none" ? "none" : v.rule] = (c[v.kind === "none" ? "none" : v.rule] || 0) + 1;
    if (v.kind !== "none" && firstRed < 0) firstRed = i;
  });
  const red = thinks.length - c.none;
  console.log(name + "：判红 " + red + "/" + thinks.length + " （" + (100*red/thinks.length).toFixed(1) + "%）  " +
    Object.entries(c).filter(([k]) => k !== "none").map(([k,v]) => k+"="+v).join(" ") || "-");
  return firstRed;
};
tally(DEFAULT, "出厂默认        ");
tally(ALL, "全开（+prefix+run+unified）");

// 把最像退化的几段挑出来：默认配置判不判
console.log("\n=== 默认配置下没判、全开判了的那几段（前 3 个）===");
let shown = 0;
for (let i = 0; i < thinks.length && shown < 3; i++) {
  const t = thinks[i];
  const d = judgeThinking(t, DEFAULT);
  const a = judgeThinking(t, ALL);
  if (d.kind === "none" && a.kind !== "none") {
    shown++;
    console.log("\n--- 第 " + i + " 段（" + t.length + " 字）默认放过，全开判 " + a.rule + " ---");
    console.log(t.split("\n").slice(0, 6).map(x => "  | " + x.slice(0, 70)).join("\n"));
  }
}
