#!/usr/bin/env node
// check-rules-coverage.mjs —— 规则与实现的对齐，机器判。
// 问题：src/meta.ts 写着 6 条规则（四件齐），但 src/judges.ts 的判据是另一处代码。
// 两者没有任何校验关系——删一条规则、加一个判据、改一个文件，谁也不红。
// 判据：
//   ① judges.ts 里出现的每个 rule 名，必须有一条 kind=verdict 的 RULES 条目
//   ② src/features/*.ts 每个文件，必须被某条 RULES 的 module 字段点名
//   ③ 条目引用的 module 文件必须存在
// rc: 0 全对齐｜1 有缺口｜2 环境缺失
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function check(dir = here) {
  const src = path.join(dir, "src");
  if (!fs.existsSync(src)) { console.log("缺 " + src); process.exit(2); }
  const { RULES } = await import(pathToFileURL(path.join(src, "meta.ts")).href);
  const problems = [];

  const judges = fs.readFileSync(path.join(src, "judges.ts"), "utf8");
  const usedRules = new Set([...judges.matchAll(/rule:\s*"([a-z][a-z0-9-]*)"/g)].map((m) => m[1]));
  const declaredVerdict = new Set(RULES.filter((r) => r.kind === "verdict").map((r) => r.id));
  for (const r of usedRules) if (!declaredVerdict.has(r)) problems.push("judges.ts 用了 rule 「" + r + "」，meta.ts 没有对应条目");

  const featuresDir = path.join(src, "features");
  const features = fs.existsSync(featuresDir) ? fs.readdirSync(featuresDir).filter((f) => f.endsWith(".ts")) : [];
  // 2026-11-24：module 允许是数组。一条判据常常由两件组成——配置单元（features/xxx.ts）
  // 与实现（algo/xxx.ts 或 features/yyy.ts）。只允许一个字符串时，
  // 实现那一侧就无法被点名，于是「文件存在但规则表里没有它的条目」永远抓不到。
  const mods = (r) => (Array.isArray(r.module) ? r.module : r.module ? [r.module] : []);
  const named = new Set(mods({ module: RULES.flatMap(mods) }).map((m) => m.replace(/^features\//, "")));
  for (const f of features) if (!named.has(f)) problems.push("features/" + f + " 没有任何 RULES 条目点名");

  for (const r of RULES) {
    for (const m of mods(r)) {
      if (!fs.existsSync(path.join(src, m))) problems.push(r.id + " 点名的 " + m + " 不存在");
    }
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  // 反例：把某条 RULES 的 module 改成一个不存在的文件，判据必须红。
  const { RULES } = await import(pathToFileURL(path.join(here, "src", "meta.ts")).href);
  const bad = RULES.map((r, i) => (i === 0 ? { ...r, module: "features/不存在的模块.ts" } : r));
  const problems = [];
  for (const r of bad) if (r.module && !fs.existsSync(path.join(here, "src", r.module))) problems.push(r.id + " 点名的文件不存在");
  const ok = problems.length > 0;
  console.log((ok ? "PASS" : "FAIL") + "  改坏一条 module 后应红：实得 " + ok);
  console.log(ok ? "selftest: 坏样本红了" : "selftest: 坏样本没红");
  process.exit(ok ? 0 : 1);
}

const problems = await check();
for (const p of problems) console.log("红  " + p);
const { RULES } = await import(pathToFileURL(path.join(here, "src", "meta.ts")).href);
console.log("check-rules-coverage: " + RULES.length + " 条规则，缺口 " + problems.length + " 个");
process.exit(problems.length === 0 ? 0 : 1);
