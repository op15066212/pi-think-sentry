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

/** MODULES 与 features/ 目录对拍，两个方向（2026-11-25，pi 插件2 指出）。
 *
 * 删掉注释里写死的数量之后，「清单见 MODULES」这句本身可能只指向一份残清单：
 * MODULES 少一项，目录里就有个文件没人认领；多一项，就指向不存在的文件。
 * 两个方向都要查，只查一个方向等于只挡一半。
 *
 * 期望从盘上取（readdir），实现从代码取（MODULES）。两边不同源，不同步就红。
 * 反例：MODULES 删掉 binding -> 「目录里有、清单里没有」；MODULES 加一项 fake -> 「清单里有、盘上没有」。
 * 与 missingModules 同一个形状：正常模式与 selftest 共用这一份，不各写一遍。 */
export function diffModulesAndFeatures(modNames, features) {
  const out = [];
  const names = new Set(modNames);
  const files = new Set(features.map((f) => f.replace(/\.ts$/, "")));
  for (const n of names) if (!files.has(n)) out.push("MODULES 里有 " + n + "，但 features/" + n + ".ts 不存在");
  for (const f of files) if (!names.has(f)) out.push("features/" + f + ".ts 存在，但 MODULES 里没有它");
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

  // MODULES 与 features/ 对拍（2026-11-25，pi 插件2 指出）：
  // 删掉注释里写死的数量之后，「清单见 MODULES」这句本身可能只指向一份残清单。
  // 两个方向都查——MODULES 少一项则目录里有人没人认领，多一项则指向不存在的文件。
  const { MODULES } = await import(pathToFileURL(path.join(src, "config.ts")).href);
  for (const p of diffModulesAndFeatures(MODULES.map((m) => m.name), features)) problems.push(p);
  // 2026-11-24：module 允许是数组。一条判据常常由两件组成——配置单元（features/xxx.ts）
  // 与实现（algo/xxx.ts 或 features/yyy.ts）。只允许一个字符串时，
  // 实现那一侧就无法被点名，于是「文件存在但规则表里没有它的条目」永远抓不到。

  // 下面这条与上面 diffModulesAndFeatures 是**两条独立的网**，查的不是同一件事
  // （2026-11-25，pi 插件2 造污染时看到两条红，指出会被误读成重复报）：
  //   上面问：config.ts 的 MODULES 里，有没有这个文件的位置？
  //   下面问：有没有任何一条 RULES 判据在用这个文件？
  // 一个没登记的 features/zzz.ts 会同时触发两条，那不是重复报，是两种失效同时发生——
  // 配置里没位置，而且没有任何判据在用它。别把第二条当重复删掉；
  // 反例：把下面这段删了，只留 MODULES 对拍，一个「登记了但没有任何判据在用」的文件就再也不会红。
  const named = new Set(mods({ module: RULES.flatMap(mods) }).map((m) => m.replace(/^features\//, "")));
  for (const f of features) if (!named.has(f)) problems.push("features/" + f + " 没有任何 RULES 条目点名");

  for (const p of missingModules(RULES, src)) problems.push(p);
  return problems;
}

if (process.argv.includes("--selftest")) {
  const { RULES } = await import(pathToFileURL(path.join(here, "src", "meta.ts")).href);
  const srcDir = path.join(here, "src");

  // 自造样本对，不读真实盘面（2026-11-25，pi 插件2 指出）。
  //
  // 原先第 ②③④ 条用真实 MODULES / 真实 features 构造，于是它们的红绿取决于
  // 工作区干净程度——临时建一个 features/xxx.ts 调试，selftest 就红。
  // 判据自身对不对，不该依赖此刻盘上正好有什么。
  // 全部改成自造名字，与工作区彻底解耦。
  const names = ["alpha", "beta"];
  const files = ["alpha.ts", "beta.ts"];

  const cases = [];

  // ① 规则点名的 module 文件不存在（原有反例）。这条必然读盘：它问的就是「盘上有没有」。
  //    但它塞的是一个必然不存在的路径，所以与工作区状态无关。
  const badRules = RULES.map((r, k) => (k === 0 ? { ...r, module: "features/不存在的模块.ts" } : r));
  cases.push(["改坏一条 module 后应红", missingModules(badRules, srcDir).length > 0]);

  // ② 上游到下游：清单里有一项，盘上没有
  cases.push([
    "MODULES 多一项、盘上没有 → 应红",
    diffModulesAndFeatures([...names, "gamma"], files).length > 0,
  ]);

  // ③ 下游到上游：盘上有一个，清单里没登记
  cases.push([
    "盘上多一个文件、MODULES 没登记 → 应红",
    diffModulesAndFeatures(names, [...files, "gamma.ts"]).length > 0,
  ]);

  // ④ 挡「恒非空」：一个永远报错的实现会让 ②③ 都 PASS。
  //    用一个两边都齐的样本对，结果必须是空。
  cases.push(["两边都齐 → 必须返回空（挡恒非空）", diffModulesAndFeatures(names, files).length === 0]);

  let n = 0;
  for (const [name, ok] of cases) {
    if (!ok) n++;
    console.log((ok ? "PASS  " : "FAIL  ") + name);
  }
  console.log(n === 0 ? "selftest: 四个方向全对" : "selftest: " + n + " 条不符");
  process.exit(n === 0 ? 0 : 1);
}

// isMain 保护（2026-11-25）：本文件导出 check()，设计上就是给别人复用的。
// 没有保护时 import 它会连带跑完主流程并 exit，复用者拿不到返回值。
const isMain = import.meta.main;
if (isMain) {
  const problems = await check();
  for (const p of problems) console.log("红  " + p);
const { RULES } = await import(pathToFileURL(path.join(here, "src", "meta.ts")).href);
console.log("check-rules-coverage: " + RULES.length + " 条规则，缺口 " + problems.length + " 个");
  process.exit(problems.length === 0 ? 0 : 1);
}
