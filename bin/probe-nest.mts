import fs from "node:fs";
import readline from "node:readline";
import { shapeOf, stripMdPrefix } from "../src/algo/shape.ts";
import { exciseInjectedForTest } from "../src/judges.ts";
import { readConfig } from "../src/config.ts";

const c = readConfig();
const skip = c.inject.on ? [c.inject.texts.dup, c.inject.texts.lang, c.inject.texts.clean].filter(Boolean).join(String.fromCharCode(10)) : "";

// 行首的「自我嵌套深度」：最短单元 k 连续出现几次。
// 「务实：务实：务实：用户说」 -> 3    「务实：我发给了」 -> 1    「关键：frac」 -> 1
function nestDepth(line) {
  const t = line.trim();
  for (let k = 2; k <= 10; k++) {
    if (t.length < k * 2) break;
    const seg = t.slice(0, k);
    let cnt = 0;
    let i = 0;
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
      const sh = shapeOf(body, { headMin: c.prefix.min });
      const head = sh.dims.find((d) => d.name === "行首");
      // 注意：这里不剥前缀，因为要量的就是前缀本身的嵌套
      const raw = body.split("\n").map((x) => x.trim()).filter((x) => x.length >= 6);
      const depths = raw.map(nestDepth);
      const nested = depths.filter((d) => d >= 2).length;
      rows.push({
        top: head && head.over ? head.top : "(无固定前缀)",
        votes: sh.votes,
        maxDepth: depths.length ? Math.max(...depths) : 1,
        nestedLines: nested,
        nestedShare: depths.length ? nested / depths.length : 0,
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
console.log("总段 " + rows.length);
console.log("");
console.log("组".padEnd(16) + "段数".padStart(6) + "  最大嵌套深度  >=2 行占比 p50/p90   有嵌套的段占比");
for (const [k, list] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const md = list.map((x) => x.maxDepth);
  const ns = list.map((x) => x.nestedShare);
  const withNest = list.filter((x) => x.maxDepth >= 2).length;
  console.log(
    k.padEnd(16) + String(list.length).padStart(6) + "  " +
    String(q(md, 0.5)).padStart(8) + " / " + String(q(md, 0.9)).padStart(3) + "     " +
    q(ns, 0.5).toFixed(2) + " / " + q(ns, 0.9).toFixed(2) + "            " +
    ((100 * withNest) / list.length).toFixed(0) + "%"
  );
}
