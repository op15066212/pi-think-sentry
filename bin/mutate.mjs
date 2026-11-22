#!/usr/bin/env node
// 变异巡检：把源码里的运算符逐个翻掉，跑测试，报出「没被抓住」的那些。
//
// 为什么要有它：仓库里 24 个坏样本是手工挑的（_m*.cjs，用完就删）。手工挑的判据只能证明
// 「我以为重要的地方被覆盖了」，不能证明「没有别的地方是空的」。这个脚本是同一件事的机器版：
// 枚举所有候选，跑一遍，把存活的列出来。
//
// 存活的变异有两种收场，必须分开判：
//   1. 真缺陷——这处改动会改变行为，测试却全绿，说明缺一条判据。
//   2. 等价变异——改了但行为不变（例如两侧都是常量），不是缺陷。
// 脚本只负责把它们摆出来，判哪一种要人看一眼代码。
//
// 用法：node bin/mutate.mjs [--limit N] [--file src/judges.ts]
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
const ALL = [
  "src/judges.ts", "src/threshold.ts", "src/cut.ts", "src/verdict.ts", "src/config.ts",
  "src/features/dup.ts", "src/features/lang.ts", "src/features/strip.ts",
  "src/features/inject.ts", "src/features/intercept.ts",
];
const FLIP = { "<=": "<", "<": "<=", ">=": ">", ">": ">=", "&&": "||", "||": "&&" };

const argv = process.argv.slice(2);
const only = argv.includes("--file") ? argv[argv.indexOf("--file") + 1] : null;
const limit = argv.includes("--limit") ? Number(argv[argv.indexOf("--limit") + 1]) : Infinity;

// 一行里哪些列落在字符串字面量里（含引号本身）。扫状态机，不剥副本。
const quoteMask = (line) => {
  const mask = new Array(line.length).fill(false);
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      mask[i] = true;
      if (ch === "\\") { i++; if (i < line.length) mask[i] = true; }
      else if (ch === q) q = null;
    } else if (ch === '"' || ch === "'" || ch === "`") { q = ch; mask[i] = true; }
  }
  return mask;
};

// 收集候选点：跳过整行注释与行内字符串里的符号（判法是「这一行剥掉字符串后还有没有」）。
const sites = [];
for (const rel of ALL) {
  if (only && rel !== only) continue;
  const abs = path.join(ROOT, rel);
  const lines = fs.readFileSync(abs, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*)/.test(line)) return;
    // 不能在「剥掉字符串的副本」上取列号：副本长度与原文不同，替换会落到错位置。
    // 这是脚本自己的一个真 bug（2026-11-22 第十一版）：config.ts:57 的第二个 || 被替换到
    // 偏移后的位置，改动无效，于是报「存活」——一个不存在的空白。
    // 口径：只翻两侧各带一个空格的运算符。这是本仓的书写风格；裸写的 a<b、泛型 Record<...>
    // 与箭头 => 都不在巡检面内——它们不是比较运算符，翻出来是语法错，只会制造假"抓住"。
    const mask = quoteMask(line);
    for (const m of line.matchAll(/ (<=|>=|&&|\|\||<|>) /g)) {
      const col = m.index + 1;
      if (mask[col]) continue;
      sites.push({ rel, abs, line: i, col, op: m[1], text: line });
    }
  });
}
const picked = sites.slice(0, limit === Infinity ? sites.length : limit);
console.log("候选 " + sites.length + " 处，本轮跑 " + picked.length + " 处\n");

// 无论怎么退出（含被杀），盘上必须回到开跑前的样子：变异改坏源码留在盘上，下一个
// 跑 npm test 的人会拿到一条「与本次巡检无关」的红。
const originals = new Map();
const restore = () => { for (const [p2, c] of originals) { try { fs.writeFileSync(p2, c); } catch {} } };
process.on("exit", restore);
process.on("SIGINT", () => process.exit(1));
process.on("SIGTERM", () => process.exit(1));
process.on("uncaughtException", (e) => { console.error(String(e && e.stack || e)); process.exit(1); });

// 测试命令只在一处定义：package.json 的 scripts.test（2026-11-22 第十三版）。
// 此前这里写 node --test test/ —— 全目录，含 rpc.test.mjs 与 rpc-strip.test.mjs，
// 那两个会真起 pi 进程。于是「基线」跑的是一个集合、npm test 跑的是另一个集合，
// 同一件事在两处算；代价是每处变异多花 10 秒，且两处数字可能不同而没人比较。
const TEST_CMD = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).scripts.test;
const runTest = () => {
  try {
    const out = execSync(TEST_CMD, { cwd: ROOT, encoding: "utf8", stdio: "pipe", timeout: 180000 });
    return { fail: Number((out.match(/# fail (\d+)/) || [])[1] ?? 0), syntax: false };
  } catch (e) {
    const out = String(e.stdout || "") + String(e.stderr || "");
    const fail = Number((out.match(/# fail (\d+)/) || [])[1] ?? (out.match(/fail (\d+)/) || [])[1] ?? 1);
    return { fail, syntax: /SyntaxError|ERR_/.test(out) && fail === 0 };
  }
};

const baseRun = runTest();
if (baseRun.fail > 0 || baseRun.syntax) {
  console.log("基线不是绿的（fail=" + baseRun.fail + "）：拒绝在脏盘上跑变异。先让 npm test 全绿。");
  process.exit(2);
}
let survivor = 0, caught = 0, skipped = 0;
const survivors = [];
for (const s of picked) {
  const orig = fs.readFileSync(s.abs, "utf8");
  if (!originals.has(s.abs)) originals.set(s.abs, orig);
  const lines = orig.split("\n");
  const line = lines[s.line];
  const next = line.slice(0, s.col) + FLIP[s.op] + line.slice(s.col + s.op.length);
  lines[s.line] = next;
  fs.writeFileSync(s.abs, lines.join("\n"));
  let r;
  try { r = runTest(); } finally { fs.writeFileSync(s.abs, originals.get(s.abs)); originals.delete(s.abs); }
  const tag = r.syntax ? "SKIP" : r.fail > 0 ? "抓住" : "存活";
  if (tag === "存活") { survivor++; survivors.push(s.rel + ":" + (s.line + 1) + "  " + s.op + " → " + FLIP[s.op] + "   " + line.trim().slice(0, 90)); }
  else if (tag === "抓住") caught++;
  else skipped++;
  console.log(tag + "  " + s.rel + ":" + (s.line + 1) + "  " + s.op + " → " + FLIP[s.op] + (tag === "抓住" ? "  (fail=" + r.fail + ")" : ""));
}
console.log("\n抓住 " + caught + " · 存活 " + survivor + " · 跳过 " + skipped);
if (survivors.length) { console.log("\n存活的："); for (const x of survivors) console.log("  " + x); }
