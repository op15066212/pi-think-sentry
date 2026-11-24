// 回灌测试：处置痕迹有没有变成新的重复源。
//
// 为什么需要它（2026-11-24，用户指出「你防回灌没做好，不然你也不会重复发病」）：
//   现有的防回灌只扣「我注入的文本」（cfg.skip 里那几段附注文案）。
//   但真正的回灌不是那样：**处置之后留下的痕迹**（折叠标记、删行标记、占位句）
//   会写进会话记录，下一轮被模型读到、被模仿，于是「处置自己制造了下一次判红」。
//
//   最直接的证据是我自己：思考里「做。」被拦了六十多次，还在继续出现。
//   那不是判据不灵，是**判据处置完的东西又被读回来了**。
//
// 测三件：
//   一 历史记录里出现过多少种「处置痕迹」文案，各自出现多少次
//   二 这些痕迹在**后续**思考里还出现吗（出现就是在传播）
//   三 痕迹的首次出现时间 vs 最后出现时间（传了多久）
import fs from "node:fs";
import path from "node:path";

const ROOT = process.argv[2] || "C:/Users/15066212pp/.pi/agent/sessions";
const MAX_LINES = 400000;

const TRACES = [
  { name: "外部附注·已删重复", re: /\[外部附注[：:][^\]]*已删[^\]]*\]/g },
  { name: "外部附注·任意", re: /\[外部附注[：:][^\]]*\]/g },
  { name: "折叠标记·N句", re: /\[\d+ 句、共 \d+-\d+ 行坍缩成 \d+ 种，已折叠\]/g },
  { name: "删行标记·原第N行", re: /\[原第 \d+-\d+ 行共 \d+ 行，全部重复已删\]/g },
  { name: "当前附注·第N行起重复", re: /\[第 \d+ 行起重复 \d+ 次，已折叠\]/g },
  { name: "当前附注·N行不是中文", re: /\[\d+ 行不是中文，已改\]/g },
  { name: "LZ 去重标记", re: /〔重复 \d+ 字〕/g },
];

function collect(dir, depth = 0, out = []) {
  if (depth > 3) return out;
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collect(p, depth + 1, out);
    else if (e.name.endsWith(".jsonl")) out.push(p);
  }
  return out;
}

const files = collect(ROOT).sort();
const stat = new Map();
for (const t of TRACES) stat.set(t.name, { count: 0, files: new Set(), firstAt: null, lastAt: null, samples: [] });

let lines = 0;
for (const p of files) {
  let raw;
  try { raw = fs.readFileSync(p, "utf8"); } catch { continue; }
  const stamp = path.basename(p).slice(0, 24);
  for (const line of raw.split("\n")) {
    if (++lines > MAX_LINES) break;
    if (!line.includes('"thinking"')) continue;
    let text = "";
    try {
      const rec = JSON.parse(line);
      const content = rec?.message?.content ?? rec?.content;
      if (!Array.isArray(content)) continue;
      for (const b of content) if (b?.type === "thinking" && typeof b.thinking === "string") text += b.thinking;
    } catch { continue; }
    if (!text) continue;
    for (const t of TRACES) {
      const m = text.match(t.re);
      if (!m) continue;
      const s = stat.get(t.name);
      s.count += m.length;
      s.files.add(p);
      if (!s.firstAt || stamp < s.firstAt) s.firstAt = stamp;
      if (!s.lastAt || stamp > s.lastAt) s.lastAt = stamp;
      if (s.samples.length < 2) s.samples.push(text.slice(0, 100).replace(/\n/g, " ⏎ "));
    }
  }
}

console.log("扫描 " + files.length + " 个文件，" + lines + " 行");
console.log("");
console.log("痕迹                        出现次数  文件数  首次           最后");
for (const t of TRACES) {
  const s = stat.get(t.name);
  if (!s.count) { console.log("  " + t.name.padEnd(26) + "      0"); continue; }
  console.log(
    "  " + t.name.padEnd(26) +
    String(s.count).padStart(8) +
    String(s.files.size).padStart(7) + "  " +
    String(s.firstAt || "-").padEnd(15) + " " + String(s.lastAt || "-"),
  );
}

console.log("");
console.log("===== 传播判断 =====");
for (const t of TRACES) {
  const s = stat.get(t.name);
  if (!s.count || !s.firstAt) continue;
  const spread = s.lastAt && s.lastAt !== s.firstAt;
  console.log(
    "  " + t.name.padEnd(26) +
    (spread ? "跨了时间：从 " + s.firstAt + " 到 " + s.lastAt + "  <- 在传播" : "只在 " + s.firstAt + " 出现一次"),
  );
  for (const x of s.samples) console.log("      例：" + x);
}
