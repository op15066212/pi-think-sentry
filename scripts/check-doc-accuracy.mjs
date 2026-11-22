#!/usr/bin/env node
// check-doc-accuracy.mjs —— 文档里写到的配置键与文件路径，盘上必须真的有。
//
// 只查两类东西，因为这两类是「文档骗人」的高发处：
//   ① 配置键：表格第一格是键名，或 JSON 块里的 "key": ——必须在 defaults.ts / config.ts 里有
//   ② 文件路径：含 / 或以已知扩展名结尾 —— 必须存在
// 不查泛泛的反引号词：那会把「你可以」「sorry」「unicode 转义」这类正常用词算成标识符，
// 于是判据天天红、人天天忽略它——比没有判据更坏。
//
// rc: 0 全对得上｜1 有对不上的｜2 文档目录缺失
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TICK = String.fromCharCode(96);
const DOCS = ["README.md", "SETTINGS.md", "docs/guard-rules.md"]
  .map((f) => path.join(here, f))
  .filter((f) => fs.existsSync(f));
if (DOCS.length === 0) { console.log("缺文档"); process.exit(2); }

function read(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) read(full, out);
    else out.push(full);
  }
  return out;
}
const srcFiles = read(path.join(here, "src"));
const srcText = srcFiles.filter((f) => /\.(ts|mjs|js)$/.test(f)).map((f) => fs.readFileSync(f, "utf8")).join("\n");
// 只数「声明的字段」，不数注释里提到的名字：
// config.ts 的注释里写着「删掉的是 strict / ratio / ...」，用 includes 判会让这些键看着还存在。
const cfgKeys = new Set();
for (const f of ["config.ts", "defaults.ts"]) {
  const fp = path.join(here, "src", f);
  if (!fs.existsSync(fp)) continue;
  for (const line of fs.readFileSync(fp, "utf8").split(/\r?\n/)) {
    if (/^\s*(\/\/|\*)/.test(line)) continue;
    const m = line.match(/^\s{1,4}([a-z][a-zA-Z0-9_]*)\s*\??\s*:/);
    if (m) cfgKeys.add(m[1]);
    for (const j of line.matchAll(/([a-z][a-zA-Z0-9_]*)\s*:\s*(?:true|false|\d+|"|\{)/g)) cfgKeys.add(j[1]);
  }
}

/** 文档里声明的配置键。两种形状：表格首格 | 键 |，JSON 块里的 "键": */
export function keysIn(text) {
  const keys = new Set();
  const T = String.fromCharCode(96);
  for (const line of text.split(/\r?\n/)) {
    // 表格首格：| `key` | ...
    if (line.startsWith("|")) {
      const cell = line.slice(1).split("|")[0].trim();
      if (cell.length > 2 && cell.startsWith(T) && cell.endsWith(T)) {
        const k = cell.slice(1, -1).trim();
        if (/^[a-z][a-zA-Z0-9_.]*$/.test(k)) keys.add(k);
      }
    }
    // JSON 块：  "key":
    const j = line.match(/^\s*"([a-z][a-zA-Z0-9_]*)"\s*:/);
    if (j) keys.add(j[1]);
  }
  return keys;
}

/** 文档里声明的文件路径 */
export function pathsIn(text) {
  const out = new Set();
  const re = new RegExp(TICK + "([A-Za-z0-9_./-]+\\.(?:ts|mjs|js|json|md|sh|py))" + TICK, "g");
  for (const m of text.matchAll(re)) out.add(m[1]);
  return out;
}

export function check(docs = DOCS, root = here) {
  const problems = [];
  for (const doc of docs) {
    const rel = path.isAbsolute(doc) ? path.relative(root, doc) : doc;
    const text = fs.readFileSync(doc, "utf8");
    for (const k of keysIn(text)) {
      const leaf = k.includes(".") ? k.split(".").pop() : k;
      if (!cfgKeys.has(leaf)) problems.push(rel + "：配置键 " + k + " 在 config.ts / defaults.ts 里不存在");
    }
    for (const p of pathsIn(text)) {
      const cands = [path.join(root, p), path.join(root, "src", p), path.join(root, "scripts", p), path.join(root, "test", p), path.join(root, "bin", p)];
      if (!cands.some((c) => fs.existsSync(c))) problems.push(rel + "：路径不存在 " + p);
    }
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync(path.join(process.env.TEMP || "/tmp", "docacc-"));
  const bad = path.join(tmp, "bad.md");
  const good = path.join(tmp, "good.md");
  fs.writeFileSync(bad, "| " + TICK + "strict" + TICK + " | true | 已删的键 |\n有用：`config.ts`\n", "utf8");
  fs.writeFileSync(good, "| " + TICK + "on" + TICK + " | true |\n| " + TICK + "threshold" + TICK + " | 3 |\n", "utf8");
  const badProblems = check([bad], tmp);
  const goodProblems = check([good], tmp);
  const checks = [
    ["文档写了已删的键 strict → 必须红", badProblems.length > 0, true],
    ["文档只写真实键 → 必须绿", goodProblems.length === 0, true],
  ];
  let n = 0;
  for (const c of checks) { const ok = c[1] === c[2]; if (!ok) n++; console.log((ok ? "PASS" : "FAIL") + "  " + c[0] + "（得 " + c[1] + "）"); }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(n === 0 ? "selftest: 坏样本红、好样本绿" : "selftest: " + n + " 条不符");
  process.exit(n === 0 ? 0 : 1);
}

const problems = check();
for (const p of problems) console.log("红  " + p);
console.log("check-doc-accuracy: " + DOCS.length + " 份文档，对不上 " + problems.length + " 处");
process.exit(problems.length === 0 ? 0 : 1);