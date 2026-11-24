import fs from "node:fs";
import readline from "node:readline";
import { shapeOf } from "../src/algo/shape.ts";
import { exciseInjectedForTest } from "../src/judges.ts";
import { readConfig } from "../src/config.ts";

const c = readConfig();
const skip = c.inject.on ? [c.inject.texts.dup, c.inject.texts.lang, c.inject.texts.clean].filter(Boolean).join(String.fromCharCode(10)) : "";

// 不确定性标记：纠结、权衡、自我怀疑
const HEDGE = ["或者", "可能", "也许", "大概", "似乎", "好像", "不确定", "不该猜", "猜", "假设", "如果", "除非", "或许", "是不是", "要不要", "应该", "最可能", "但", "不过", "然而", "其实", "反正"];
// 确定性标记：断言、结论
const ASSERT = ["确定", "一定", "就是", "因此", "所以", "结论", "证明", "等于", "成立", "显然", "必然"];

function density(text, words) {
  const n = [...text].length;
  if (!n) return 0;
  let k = 0;
  for (const w of words) {
    let i = 0;
    while ((i = text.indexOf(w, i)) >= 0) { k++; i += w.length; }
  }
  return k / (n / 100);
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
      const h = density(body, HEDGE);
      const a = density(body, ASSERT);
      rows.push({
        top: head && head.over ? head.top : null,
        votes: sh.votes,
        hedge: h,
        assert: a,
        ratio: a > 0 ? h / a : h,
      });
    }
  }
}

const q = (arr, p) => { if (!arr.length) return 0; const b = [...arr].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * b.length))]; };
const groups = new Map();
for (const r of rows) {
  const k = r.top === "务实：" || r.top === "務實：" ? "务实类" : r.top === "关键：" ? "关键类" : r.votes >= 2 ? "其他命中" : "未命中(正常)";
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}
console.log("总段 " + rows.length);
console.log("");
console.log("组".padEnd(14) + "段数".padStart(6) + "   不确定密度 p10/p50/p90      确定密度 p50     h/a 比 p50");
for (const [k, list] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const h = list.map((x) => x.hedge), a = list.map((x) => x.assert), r = list.map((x) => x.ratio);
  console.log(
    k.padEnd(14) + String(list.length).padStart(6) + "   " +
    [0.1, 0.5, 0.9].map((p) => q(h, p).toFixed(1).padStart(5)).join(" ") + "        " +
    q(a, 0.5).toFixed(1).padStart(5) + "        " +
    q(r, 0.5).toFixed(2).padStart(6)
  );
}
