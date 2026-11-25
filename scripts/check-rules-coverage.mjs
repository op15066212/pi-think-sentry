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

/** 一条规则点名的模块。允许是数组（2026-11-24）：一条判据常由配置单元与实现两件组成。 */
const mods = (r) => (Array.isArray(r.module) ? r.module : r.module ? [r.module] : []);

/** 每条规则点名的模块里，哪个不在盘上。正常模式与 --selftest 共用这一份。
 *  2026-11-25 之前两处各写一遍：mods 加了数组支持，selftest 那处没跟着改，
 *  一跑就崩（path.join 收到 Array）。因为 gate 那时不跑 selftest，这个崩藏了整整一天。
 *  两处各写一遍同一段判断，改一处等于没改。 */
function missingModules(rules, srcDir) {
  const out = [];
  for (const r of rules) for (const m of mods(r)) if (!fs.existsSync(path.join(srcDir, m))) out.push(r.id + " 点名的 " + m + " 不存在");
  return out;
}

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

  const named = new Set(mods({ module: RULES.flatMap(mods) }).map((m) => m.replace(/^features\//, "")));
  for (const f of features) if (!named.has(f)) problems.push("features/" + f + " 没有任何 RULES 条目点名");

  for (const p of missingModules(RULES, src)) problems.push(p);
  return problems;
}

if (process.argv.includes("--selftest")) {
  // 反例：把某条 RULES 的 module 改成一个不存在的文件，判据必须红。
  const { RULES } = await import(pathToFileURL(path.join(here, "src", "meta.ts")).href);
  const bad = RULES.map((r, i) => (i === 0 ? { ...r, module: "features/不存在的模块.ts" } : r));
  const problems = [];
  // 与正常模式同源：调 missingModules，不在这里重写一遍判断。
  // 2026-11-25 这里原先是 path.join(here, "src", r.module)——module 改成数组之后必崩。
  for (const p of missingModules(bad, path.join(here, "src"))) problems.push(p);
  const ok = problems.length > 0;
  console.log((ok ? "PASS" : "FAIL") + "  改坏一条 module 后应红：实得 " + ok);
  console.log(ok ? "selftest: 坏样本红了" : "selftest: 坏样本没红");
  process.exit(ok ? 0 : 1);
}

// isMain 保护（2026-11-25）：本文件导出 check()，设计上就是给别人复用的。
// 没有保护时 import 它会连带跑完主流程并 exit，复用者拿不到返回值。
const norm = (x) => String(x || "").replace(/\\/g, "/");
const isMain = !!process.argv[1] && norm(fileURLToPath(import.meta.url)) === norm(process.argv[1]);
if (isMain) {
  const problems = await check();
  for (const p of problems) console.log("红  " + p);
const { RULES } = await import(pathToFileURL(path.join(here, "src", "meta.ts")).href);
console.log("check-rules-coverage: " + RULES.length + " 条规则，缺口 " + problems.length + " 个");
  process.exit(problems.length === 0 ? 0 : 1);
}
