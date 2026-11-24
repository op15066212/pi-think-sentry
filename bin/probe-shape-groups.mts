import fs from "node:fs";
import readline from "node:readline";
const { shapeOf, stripMdPrefix } = await import("../src/algo/shape.ts");
const { exciseInjectedForTest } = await import("../src/judges.ts");
const { readConfig } = await import("../src/config.ts");
const c = readConfig();
const skip = c.inject.on ? [c.inject.texts.dup, c.inject.texts.lang, c.inject.texts.clean].filter(Boolean).join(String.fromCharCode(10)) : "";

const ngramDup = (str, k) => {
  const ch = [...str];
  if (ch.length < k) return 0;
  const g = [];
  for (let i = 0; i + k <= ch.length; i++) g.push(ch.slice(i, i + k).join(""));
  const m = new Map();
  for (const x of g) m.set(x, (m.get(x) || 0) + 1);
  let d = 0;
  for (const v of m.values()) if (v > 1) d += v - 1;
  return d / g.length;
};

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
      if (sh.votes < 2) continue;
      const head = sh.dims.find((d) => d.name === "行首");
      if (!head || !head.over) continue;
      const lines = body.split("\n").map(stripMdPrefix).filter((x) => x.length >= 3);
      // 每行的最后一个句子（结论句）
      const tails = lines.map((x) => { const s = x.split(/[。！？!?]/).filter((q) => q.trim()); return s.length ? s[s.length-1].trim() : ""; }).filter((x) => x.length >= 4);
      rows.push({
        top: head.top,
        share: head.share,
        lines: lines.length,
        chars: body.length,
        residual: (() => {
          const res = lines.filter((r) => r.slice(0, head.top.length) === head.top).map((r) => r.slice(head.top.length).trim()).filter((s) => s.length >= 4);
          return res.length >= 3 ? ngramDup(res.join("\u0001"), 3) : 0;
        })(),
        tailDup: tails.length >= 3 ? ngramDup(tails.join("\u0001"), 3) : 0,
      });
    }
  }
}

const q = (a, p) => { if (!a.length) return 0; const b=[...a].sort((x,y)=>x-y); return b[Math.min(b.length-1, Math.floor(p*b.length))]; };
const groups = new Map();
for (const r of rows) { if (!groups.has(r.top)) groups.set(r.top, []); groups.get(r.top).push(r); }

console.log("输入 " + files.length + " 个文件，shape 命中且行首越线 " + rows.length + " 段\n");
console.log("前缀".padEnd(10) + "段数".padStart(5) + "  行数p50  字数p50  集中度  残句重复  末句重复");
for (const [top, list] of [...groups.entries()].sort((a,b)=>b[1].length-a[1].length).slice(0, 6)) {
  console.log(
    ("「"+top+"」").padEnd(10) +
    String(list.length).padStart(5) + "  " +
    String(q(list.map(x=>x.lines),0.5)).padStart(7) + "  " +
    String(q(list.map(x=>x.chars),0.5)).padStart(7) + "  " +
    q(list.map(x=>x.share),0.5).toFixed(2).padStart(6) + "  " +
    q(list.map(x=>x.residual),0.5).toFixed(2).padStart(7) + "  " +
    q(list.map(x=>x.tailDup),0.5).toFixed(2).padStart(7)
  );
}
