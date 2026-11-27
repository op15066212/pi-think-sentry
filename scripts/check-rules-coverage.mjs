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

/** RULES 的「引入」里点名的 test 文件与期望条数，必须与盘面对得上。
 *  2026-11-27 实测两条真空条目：
 *    strip-empty 的引入指向 test/empty-frame.test.ts —— 那个文件不存在；
 *    signature-clean 写「期望 11 条」，而 test/signature.test.ts 实际有 15 条。
 *  check-rules-coverage 原本只查「id 在模块里出现」，所以两条都为绿。
 *  这不是措辞问题：一条规则的四格之一（引入）指向空，那条规则等于没有判据。
 *  返回问题列表；纯函数，便于坏样本直接喂。 */
export function introProblems(rules, dir) {
  const out = [];
  for (const r of rules) {
    const text = String(r.引入 || "");
    const m = text.match(/test\/([A-Za-z0-9_.-]+\.test\.(?:ts|mjs))/);
    const want = text.match(/期望\s*(\d+)\s*条/);
    if (!m) { out.push(r.id + "：引入里没有点名任何 test 文件"); continue; }
    const file = path.join(dir, "test", m[1]);
    if (!fs.existsSync(file)) { out.push(r.id + "：引入指向 test/" + m[1] + "，盘上没有这个文件"); continue; }
    if (!want) { out.push(r.id + "：引入里没写期望条数"); continue; }
    const body = fs.readFileSync(file, "utf8");
    const actual = (body.match(/^\s*(?:test|it)\(/gm) || []).length;
    if (actual !== Number(want[1])) out.push(r.id + "：引入写期望 " + want[1] + " 条，test/" + m[1] + " 实际 " + actual + " 条");
  }
  return out;
}

/** Kind / Rule 里每个字面量，要么真的会被产生，要么有档案（REMOVED_RULES 点名）。
 *
 *  2026-11-27（组 1 在 session-doctor 抓到同族缺陷：KIND.UNREACHABLE 只有定义，
 *  grep "KIND.UNREACHABLE" 命中 0——那个异常类永远不会产生）。我仓同族更隐蔽：
 *  Kind 里的 fold 有消费分支（features/strip.ts 的 case "fold"）、能被 Verdict.parse 接受，
 *  但全仓没有任何一处产生 kind: "fold"。于是那条分支永不执行，而它看起来是活的。
 *
 *  为什么这比缺样本更坏：覆盖率/待办表里它永远占一格，人读到的是「还没写」而不是「不存在」。
 *
 *  返回问题列表；纯函数，坏样本直接喂。 */
export function deadConstructors(srcText, archivedIds) {
  const out = [];
  const kindBlk = srcText.match(/export type Kind\s*=([^;]+);/);
  const ruleBlk = srcText.match(/export type Rule\s*=([^;]+);/);
  const pick = (blk) => (blk ? [...blk[1].matchAll(/"([a-z][a-z0-9-]*)"/g)].map((m) => m[1]) : []);
  const pairs = [["kind", pick(kindBlk)], ["rule", pick(ruleBlk)]];
  for (const [field, names] of pairs) {
    for (const n of names) {
      const produced = (srcText.split(field + ": \"" + n + "\"").length - 1) > 0;
      if (produced) continue;
      if (archivedIds.has(n)) continue; // 有档案：REMOVED_RULES 里点名并写了 why
      out.push(field + " \"" + n + "\"：永不产生，也没有档案（REMOVED_RULES 里没有它）");
    }
  }
  return out;
}

/** 模块级 `let` 若没有任何「非声明处的赋值」，它就恒等于初始值。
 *  这种变量只有两种可能：死状态（本意是状态，但从没被更新过），或该写成 `const`。
 *  精确到行：只认以 let 开头、且名字后面跟 = 或 : 的模块级声明。
 *
 *  2026-11-27 我仓实测到三个（src/index.ts）：
 *    lastThink      只在声明处 = ""，从不写非空
 *    lastV          只在 `if (lastThink) lastV = ...` 里写，而 lastThink 恒空 → 永不执行
 *    lastRedThink   只在声明处 = ""
 *  它们是「判据改成 tool_call 现场判」之后留下的壳，而同文件第 318 行的注释已经写着
 *  「原来那一堆 lastThink / lastV ... 都没了」——注释说删了，变量还在。
 *
 *  这条判据是 deadConstructors 的同族第二类：那一类抓枚举值，这一类抓状态变量。
 *  两级递进：先删掉 ① 里恒空的，② 的写入点会随之变成「无写入点」，被同一条判据抓住。 */
export function staleModuleState(files) {
  const out = [];
  for (const [rel, text] of Object.entries(files)) {
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^let\s+([A-Za-z_$][\w$]*)\s*[=:]/);
      if (!m) continue;
      const name = m[1];
      const re = new RegExp("\\b" + name + "\\b", "g");
      let writes = 0;
      for (let j = 0; j < lines.length; j++) {
        if (j === i) continue;
        const line = lines[j];
        if (/^\s*\/\//.test(line)) continue; // 注释里的名字不算
        // 赋值形态：name = / name += / ++name / name++ / name.push( 等就地修改
        const assign = new RegExp("(^|[^.\\w$])" + name + "\\s*(=|\\+=|-=|\\+\\+|\\-\\-)");
        const mutate = new RegExp("(^|[^.\\w$])" + name + "\\.(push|set|add|delete|clear)\\(");
        if (assign.test(line) || mutate.test(line)) writes++;
      }
      if (writes === 0) out.push(rel + ":" + (i + 1) + " 模块级 let " + name + "：除声明处没有任何赋值，恒等于初值");
    }
  }
  return out;
}
export async function check(dir = here) {
  const src = path.join(dir, "src");
  if (!fs.existsSync(src)) { console.log("缺 " + src); process.exit(2); }
  const { RULES, REMOVED_RULES } = await import(pathToFileURL(path.join(src, "meta.ts")).href);
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

  for (const p of introProblems(RULES, dir)) problems.push(p);
  for (const p of missingModules(RULES, src)) problems.push(p);

  // 恒不变的模块级 let（deadConstructors 的同族第二类：那一类抓枚举值，这一类抓状态）。
  const srcFiles = {};
  for (const f of fs.readdirSync(src).filter((n) => n.endsWith(".ts"))) {
    srcFiles["src/" + f] = fs.readFileSync(path.join(src, f), "utf8");
  }
  for (const q of staleModuleState(srcFiles)) problems.push(q);

  // 死构造子：Kind / Rule 里每个字面量必须真的会被产生，或在 REMOVED_RULES 里有档案。
  // 读 verdict.ts + judges.ts 的源码文本：产生处就写在里面（rule:"x" / kind:"x"）。
  const declareSrc = ["verdict.ts", "judges.ts"]
    .map((f) => fs.readFileSync(path.join(src, f), "utf8"))
    .join("\n");
  for (const q of deadConstructors(declareSrc, new Set(REMOVED_RULES.map((r) => r.id)))) problems.push(q);
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

  // ⑤⑥⑦ 引入这一格的样本（2026-11-27）。三条都喂自造规则，不读真实 RULES：
  //     读真实的话，有人把 meta.ts 改对了这条样本就失去意义。
  const introOf = (id, text) => [{ id, 引入: text }];
  cases.push(["引入指向不存在的 test 文件 → 应红",
    introProblems(introOf("x", "node --test test/不存在.test.ts；期望 1 条全过、rc=0"), here).length > 0]);
  cases.push(["引入的期望条数与实际不符 → 应红",
    introProblems(introOf("x", "node --test test/strip.test.ts；期望 999 条全过、rc=0"), here).length > 0]);
  cases.push(["引入指的文件存在且条数对 → 必须绿",
    introProblems(introOf("x", "node --test test/strip.test.ts；期望 10 条全过、rc=0"), here).length === 0]);

  // ⑧⑨⑩ 死构造子（2026-11-27）。喂自造类型文本，不读真实 verdict.ts——
  //       读真实的话，有人把 fold 删了这条样本就失去意义。
  const fakeSrc = (k, r) =>
    "export type Kind = " + k + ";" + String.fromCharCode(10) + "export type Rule = " + r + ";" + String.fromCharCode(10);
  const q = String.fromCharCode(34);
  const ghost = fakeSrc(q + "none" + " | " + q + "ghost" + q, "never");
  // none 必须带产生处，否则它自己也成了死值，样本就测不到 ghost。
  const prod = "x({ kind: " + q + "none" + q + " })";
  cases.push(["Kind 里一个值从不产生、也没档案 → 应红",
    deadConstructors(ghost + prod, new Set()).length === 1]);
  cases.push(["同一值在档案里点名 → 必须绿",
    deadConstructors(ghost + prod, new Set(["ghost"])).length === 0]);
  cases.push(["全部有产生处 → 必须绿（挡「一律报红」）",
    deadConstructors(fakeSrc(q + "none" + q, "never") + prod, new Set()).length === 0]);

  // ⑪⑫⑬⑭ 恒不变的模块级 let（2026-11-27）。喂自造文件文本，不读真实 src。
  const NL2 = String.fromCharCode(10);
  const deadState = "let a = 1;" + NL2 + "export function f() { return a; }" + NL2;
  const liveState = "let a = 1;" + NL2 + "export function f() { a = 2; return a; }" + NL2;
  const constState = "const a = 1;" + NL2 + "export function f() { return a; }" + NL2;
  cases.push(["模块级 let 从不赋值 → 应红",
    staleModuleState({ "x.ts": deadState }).length === 1]);
  cases.push(["有赋值 → 必须绿",
    staleModuleState({ "x.ts": liveState }).length === 0]);
  cases.push(["const（本意就是常量）→ 必须绿",
    staleModuleState({ "x.ts": constState }).length === 0]);
  cases.push(["注释里提到名字不算赋值 → 仍应红",
    staleModuleState({ "x.ts": "let a = 1;" + NL2 + "// a = 2 是注释" + NL2 }).length === 1]);

  let n = 0;
  for (const [name, ok] of cases) {
    if (!ok) n++;
    console.log((ok ? "PASS  " : "FAIL  ") + name);
  }
  // 数字不写死：条数会变，写死就变成注释（这条本身就是「N 条全过」那条判据的应用）。
  console.log(n === 0 ? "selftest: " + cases.length + " 条全对" : "selftest: " + n + " 条不符");
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
