// run 判据的分会话明细（2026-11-24，回答 pi 插件2 的 A 项质疑）
//
// 对方在 11-21 上测出 run 判红 120/2155 = 5.6%，而我写的是「6 会话误报 61%」。
// 差别不是谁算错，是「61%」这个数没说清分母：
//   判红率 = run 判红段 / 全部段      （对方算的，约 5%）
//   误报率 = 误报段 / run 判红段      （我算的，约 61%）
// 这个脚本把两个数分开算，每个会话一行，同时给门槛 12 和 40 两档。
//
// 用法：node --experimental-strip-types bin/report-run-by-session.mts <file.jsonl>...
// 输出：<文件> <段数> <run@12 判红> <run@40 判红>，再抽判红样本打印

import fs from "node:fs";
import readline from "node:readline";
import { longestRun } from "../src/features/run.ts";

const MAX_LEN = 20000;
const MAX_SEG = 4000;

const segsOf = async (file) => {
  const out = [];
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    if (out.length >= MAX_SEG) break;
    if (!line.trim()) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    const content = o?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const b of content) {
      if (b?.type !== "thinking" || typeof b.thinking !== "string") continue;
      const t = b.thinking;
      if (t.length > MAX_LEN) continue;
      out.push(t);
      if (out.length >= MAX_SEG) break;
    }
  }
  rl.close();
  return out;
};

const files = process.argv.slice(2);
if (!files.length) { console.error("用法：report-run-by-session.mts <file.jsonl>..."); process.exit(2); }

let tSeg = 0, t12 = 0, t40 = 0;
const samples = [];
console.log("<文件>\t<段数>\t<@12判红>\t<@12判红率>\t<@40判红>\t<@40判红率>");
for (const f of files) {
  const segs = await segsOf(f);
  let n12 = 0, n40 = 0;
  for (const s of segs) {
    const a = longestRun(s, 12);
    if (a.over) n12++;
    const b = longestRun(s, 40);
    if (b.over) { n40++; if (samples.length < 400) samples.push({ len: b.len, s }); }
  }
  tSeg += segs.length; t12 += n12; t40 += n40;
  const r12 = segs.length ? (100 * n12 / segs.length).toFixed(1) : "0.0";
  const r40 = segs.length ? (100 * n40 / segs.length).toFixed(1) : "0.0";
  console.log(`${f.split("/").pop()}\t${segs.length}\t${n12}\t${r12}%\t${n40}\t${r40}%`);
}
console.log(`合计\t${tSeg}\t${t12}\t${(100*t12/tSeg||0).toFixed(1)}%\t${t40}\t${(100*t40/tSeg||0).toFixed(1)}%`);
console.log("");
console.log("--- run@40 判红样本（前 14 条；@40 是现在的默认门槛） ---");
for (const s of samples.slice(0, 14)) {
  const head = s.s.slice(0, 130).replace(/\n/g, " ⏎ ");
  console.log(`[len=${s.len}] ${head}`);
}
