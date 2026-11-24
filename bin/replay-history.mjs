// 历史回放：把真实会话记录里的思考段喂给判据，看它们各自命中多少、重合多少。
//
// 为什么是回放而不是造样本（2026-11-24，用户要求用历史数据回灌测试）：
//   我造的样本都带着我自己的偏见——我知道判据怎么写，所以下意识造它抓得到的形状。
//   真实记录里是什么形状，只有跑一遍才知道。
//
// 有界（Ax4）：最多读 READ_LIMIT 个文件、每文件最多 MAX_LINES 行、单段超过 MAX_LEN 跳过。
// 251MB 全读会跑几分钟且吃满内存，判据探针不该有这种副作用。
//
// 三个判据各自独立跑（不是 judgeThinking 的短路链）：
//   回放要的是「各自抓到多少」，短路链只会告诉我「第一条抓到多少」。
import fs from "node:fs";
import path from "node:path";
import { dupIn, judgeThinking, partitionLines, voteOf } from "../src/judges.ts";
import { lz77 } from "../src/algo/lz77.ts";

const DIR = process.argv[2];
const READ_LIMIT = Number(process.env.REPLAY_FILES || 8);
const MAX_LINES = Number(process.env.REPLAY_LINES || 200000);
const MAX_LEN = 20000;
const MIN_LEN = 40;

if (!DIR || !fs.existsSync(DIR)) {
  console.error("用法：node bin/replay-history.mjs <会话目录>");
  process.exit(2);
}

const files = fs.readdirSync(DIR)
  .filter((f) => f.endsWith(".jsonl"))
  .map((f) => ({ f, size: fs.statSync(path.join(DIR, f)).size }))
  .sort((a, b) => b.size - a.size)
  .slice(0, READ_LIMIT);

const thunks = [];
let readLines = 0;
let truncated = false;

for (const { f } of files) {
  const raw = fs.readFileSync(path.join(DIR, f), "utf8");
  for (const line of raw.split("\n")) {
    if (++readLines > MAX_LINES) { truncated = true; break; }
    if (!line.includes('"thinking"')) continue;
    try {
      const rec = JSON.parse(line);
      const content = rec?.message?.content ?? rec?.content;
      if (!Array.isArray(content)) continue;
      for (const b of content) {
        if (b && b.type === "thinking" && typeof b.thinking === "string") {
          const t = b.thinking;
          if (t.length >= MIN_LEN && t.length <= MAX_LEN) thunks.push(t);
        }
      }
    } catch { /* 畸形行跳过：回放不该因为一行坏掉就停 */ }
  }
  if (truncated) break;
}

let dupHit = 0;
let inlineHit = 0;
let runHit = 0;
let both = 0;
let any = 0;
const examples = { dup: [], inline: [], run: [] };

for (const t of thunks) {
  // 每条判据单独开一次：judgeThinking 是短路链，全开只会告诉我第一条抓到多少。
  // 关掉另外两条，才能看出这一条自己在真实数据上命中多少。
  // 必须走 partitionLines + voteOf：自己拼 { t, i } 对象等于把 kind 丢成 undefined，
  // 空行、围栏、缩进行全被算进 vote 行——回放第一版就这么干了，dupHit 冲到 93%。
  // 误报率是回放唯一有用的数字，探针自己脏了就没意义。
  const d = dupIn(voteOf(partitionLines(t)), 4);
  const i = judgeThinking(t, { dupOn: false, inlineOn: true, langOn: false, runOn: false });
  const r = lz77(t);
  const dHit = d && d.length > 0;
  const iHit = i && i.kind && i.kind !== "none";
  const rHit = r.longestNatural >= 12;
  if (dHit) dupHit++;
  if (iHit) inlineHit++;
  if (rHit) runHit++;
  const n = (dHit ? 1 : 0) + (iHit ? 1 : 0) + (rHit ? 1 : 0);
  if (n >= 2) both++;
  if (n >= 1) any++;
  if (dHit && examples.dup.length < 3) examples.dup.push(t.slice(0, 90));
  if (iHit && examples.inline.length < 3) examples.inline.push(t.slice(0, 90));
  if (rHit && examples.run.length < 3) examples.run.push(t.slice(0, 90));
}

const total = thunks.length;
const pct = (x) => total ? (x / total * 100).toFixed(1) + "%" : "0%";

console.log("回放：" + files.length + " 个文件，" + readLines + " 行，思考段 " + total + " 个" + (truncated ? "（已截断）" : ""));
console.log("");
console.log("判据              命中      占比");
console.log("dup（行复诵）      " + String(dupHit).padStart(6) + "   " + pct(dupHit));
console.log("inline（句坍缩）   " + String(inlineHit).padStart(6) + "   " + pct(inlineHit));
console.log("run（自然语言重复）  " + String(runHit).padStart(6) + "   " + pct(runHit));
console.log("");
console.log("至少一条命中       " + String(any).padStart(6) + "   " + pct(any));
console.log("两条以上命中       " + String(both).padStart(6) + "   " + pct(both) + "   ← 交叉验证");
console.log("");
for (const k of ["dup", "inline", "run"]) {
  if (!examples[k].length) continue;
  console.log("--- " + k + " 例子 ---");
  for (const e of examples[k]) console.log("  " + e.replace(/\n/g, " ⏎ "));
}
