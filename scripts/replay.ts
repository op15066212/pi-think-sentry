// 真实会话回放：把历史会话里每一段思考原文喂给判据，输出判决分布。
//
// 为什么需要它：单元测试用的是构造样本，判据在真实数据上的命中率只能用回放看。
// 改判据之前先跑一遍记下分布，改完再跑，差了多少一眼看到。
//
// 用法：npm run replay                       # 默认扫 ~/.pi/agent/sessions
//       npm run replay -- <目录>             # 指定会话目录
//       npm run replay -- <目录> --sample 500   # 只取前 500 段（快，注意是前 N 段不是随机抽样）
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { judgeThinking } from "../src/judges.ts";

const args = process.argv.slice(2);
const root = args[0] && !args[0].startsWith("--") ? args[0] : path.join(os.homedir(), ".pi/agent/sessions");
const si = args.indexOf("--sample");
const SAMPLE = si >= 0 ? Number(args[si + 1]) : 0;

// 递归扫会话目录。只认 .jsonl，只取非空 thinking 字符串。
function walk(dir, out) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p, out); continue; }
    if (!e.name.endsWith(".jsonl")) continue;
    let txt;
    try { txt = fs.readFileSync(p, "utf8"); } catch { continue; }
    for (const line of txt.split("\n")) {
      if (!line.includes('"thinking"')) continue;
      let o;
      try { o = JSON.parse(line); } catch { continue; }
      const stack = [o];
      while (stack.length) {
        const x = stack.pop();
        if (!x || typeof x !== "object") continue;
        if (Array.isArray(x)) { for (const y of x) stack.push(y); continue; }
        if (typeof x.thinking === "string" && x.thinking.trim()) out.push(x.thinking);
        for (const k in x) if (x[k] && typeof x[k] === "object") stack.push(x[k]);
      }
    }
  }
}

const all = [];
walk(root, all);
// 同一个字符串出现多次只算一次：不然复诵率被会话重复放大。
const seen = new Set();
const segs = [];
for (const t of all) {
  if (seen.has(t)) continue;
  seen.add(t);
  segs.push(t);
  if (SAMPLE && segs.length >= SAMPLE) break;
}

// opaque 是 none 的一个 tag，说明「判据看不见这段」（整段落进围栏/缩进）。
// 必须与 clean 分开统计：否则「干净的比例变高了」有两种解释，而回放本身分不出是哪种。
const tally = { none: 0, opaque: 0, strip: 0, retract: 0 };
const lens = [];
for (const t of segs) {
  const v = judgeThinking(t);
  tally[v.tag === "opaque" ? "opaque" : v.kind]++;
  lens.push(t.length);
}
lens.sort((a, b) => a - b);

const pct = (n) => ((n / segs.length) * 100).toFixed(2) + "%";
console.log("目录 " + root);
console.log("原始 " + all.length + " 段   去重 " + segs.length + " 段" + (SAMPLE ? "（前 " + SAMPLE + " 段，不是随机抽样，命中率只能横向比不能当总量）" : ""));
console.log("段长  最短 " + lens[0] + "  中位 " + lens[Math.floor(lens.length / 2)] + "  最长 " + lens[lens.length - 1]);
console.log("");
console.log("  none     " + String(tally.none).padStart(6) + "  " + pct(tally.none));
console.log("  opaque   " + String(tally.opaque).padStart(6) + "  " + pct(tally.opaque) + "   判据看不见（整段围栏/缩进）");
console.log("  strip    " + String(tally.strip).padStart(6) + "  " + pct(tally.strip) + "   dup 判红");
console.log("  retract  " + String(tally.retract).padStart(6) + "  " + pct(tally.retract) + "   lang 判红");
console.log("");
console.log("命中合计 " + pct(tally.strip + tally.retract) + "（判据只认能数清的事实，命中率高不等于判得对，");
console.log("  判得对要靠逐段读原文，回放只回答「改前改后差多少」）");
