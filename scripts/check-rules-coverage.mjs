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


/** 判据覆盖矩阵：每条 kind=verdict 的规则，必须有一个「只该它成立」的输入。
 *
 *  为什么要有（2026-11-27）：check-judge-order 只验三种组合，而规则数是会增长的。
 *  抓的那个真缺陷正是「dup 先 return 把 lang 整条吞了」——它靠人想到"同时命中"才现形。
 *  这条矩阵把「想到」变成「跑一遍」：组合判据的胜者必须等于单判时唯一成立的那条。
 *
 *  真值从哪来（这是它不恒绿的关键）：
 *    每格的真值 = 该规则**独立的判定函数**（dup → dupJudge，lang → langJudge）现算，
 *    不是手写的期望。手写的只有「输入」和「意图让谁成立」，两者都会被现算核对。
 *    所以新增一条规则时：RULES 自动多一列 → 若取不到它的独立入口，报红（"没有可单独测的入口"）；
 *    若取得到但没有任何样本让它单独成立，也报红。
 *
 *  返回问题列表；纯函数，selftest 直接喂假 judges。 */
export function ruleMatrix(rules, judgesMod, samples, strength) {
  const out = [];
  const verdictRules = rules.filter((r) => r.kind === "verdict").map((r) => r.id);
  const judgeOf = (id) => {
    // 两种命名都试：dup -> dupJudge（本仓现状），signature-clean -> signatureCleanJudge。
    const camel = id.replace(/(^|-)([a-z])/g, (_m, _d, c) => c.toUpperCase());
    for (const name of [id + "Judge", camel + "Judge"]) {
      if (typeof judgesMod[name] === "function") return judgesMod[name];
    }
    return null;
  };
  // ① 每条规则都要有独立入口。没有入口就无从「让它单独成立」，这条判据也就管不到它。
  for (const id of verdictRules) {
    if (!judgeOf(id)) out.push("规则 " + id + "：judges.ts 里没有它的独立判定函数，无法单独验它成立");
  }
  const wins = new Map(verdictRules.map((id) => [id, 0]));
  const conflicts = [];
  for (const s of samples) {
    const firing = [];
    for (const id of verdictRules) {
      const f = judgeOf(id);
      if (!f) continue;
      const v = f(s.text);
      if (v && v.kind !== "none") firing.push({ rule: id, kind: v.kind });
    }
    for (const f of firing) wins.set(f.rule, wins.get(f.rule) + 1);
    if (firing.length > 1) conflicts.push(s.name);

    // 胜者不手写：由「处置强度」表在单判成立的规则里挑最高的一条。
    // 这条表是设计声明，不靠代码反推——retract 是「这一轮不采用」，比 strip「删几行」强。
    let want = { kind: "none", rule: null };
    if (firing.length) {
      const top = firing.reduce((a, b) => ((strength[b.kind] || 0) > (strength[a.kind] || 0) ? b : a));
      const ties = firing.filter((f) => (strength[f.kind] || 0) === (strength[top.kind] || 0));
      if (ties.length > 1) out.push("样本 " + s.name + "：成立的规则处置强度并列（" + ties.map((t) => t.rule).join("/") + "），强度表需要补一条序");
      want = top;
    }

    // 意图核对：写了的 expect 必须真的单独成立；expect 为 null 时不该有任何规则成立。
    if (s.expect === null) {
      if (firing.length) out.push("样本 " + s.name + "：意图「不该有任何规则成立」，但 " + firing.map((f) => f.rule).join("/") + " 单独成立了");
      continue;
    }
    if (s.expect !== undefined && !firing.some((f) => f.rule === s.expect)) {
      out.push("样本 " + s.name + "：意图让 " + s.expect + " 成立，实际单独成立的有 " + (firing.map((f) => f.rule).join("/") || "无"));
      continue;
    }

    // 组合判据的胜者必须等于按强度算出来的那条——不是"第一个 return 的那条"。
    const combined = judgesMod.judgeThinking(s.text);
    if (combined.kind !== want.kind || combined.rule !== want.rule) {
      out.push("样本 " + s.name + "：按强度胜者应是 " + want.kind + "/" + (want.rule || "-") + "，组合判据判给 " + combined.kind + "/" + combined.rule);
    }
  }
  // ④ 每条规则都要在矩阵里赢过至少一格。
  for (const [id, n] of wins) {
    if (n === 0) out.push("规则 " + id + "：" + samples.length + " 个样本里一次都没单独成立过（覆盖缺口）");
  }
  // ⑤ 至少要有一个「多条同时成立」的样本，否则「谁先判」这个面一格都没覆盖。
  //    2026-11-27 实测：少了这一类时，把顺序改回 dup 先判，矩阵仍 rc=0 —— 它管不住顺序。
  if (!conflicts.length) out.push("没有任何样本同时成立两条规则：判据顺序（谁先 return）这个面没被覆盖");
  return out;
}

/** KINDS 与 STRENGTH 的键集合必须相等。
 *  2026-11-27：把强度表从判据脚本搬进 verdict.ts 时发现，两边各自维护 kind 集合——
 *  强度表里还留着 `fold: 2`，而 fold 那个构造子已经删了。多出来的键不会报错，
 *  只会在某天有人恢复 fold 时给出一个「看起来有定义」的强度。
 */
export function strengthParityProblems(kinds, strength) {
  const out = [];
  const k = new Set(kinds);
  const s = new Set(Object.keys(strength || {}));
  for (const x of s) if (!k.has(x)) out.push("强度表里有 " + x + "，但 KINDS 里没有这个构造子");
  for (const x of k) if (!s.has(x)) out.push("KINDS 里有 " + x + "，但强度表里没有它（同时成立时会被按 0 处理）");
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



  // 判据覆盖矩阵（2026-11-27）。
  // 样本表只是输入；每格的真值由各自的独立判定函数现算，胜者由下面的强度表算出。
  // 两类样本各管一个面：
  //   独有类——只该一条规则成立，验「这条规则真能单独赢」；
  //   冲突类——多条同时成立，验「谁先 return」。
  // 2026-11-27 实测：只有独有类时，把顺序改回 dup 先判，矩阵仍 rc=0 —— 它管不住顺序。
  const judgesMod = await import(pathToFileURL(path.join(src, "judges.ts")).href);
  const NL3 = String.fromCharCode(10);
  // 处置强度从 src/verdict.ts 取，与 KINDS 同处——两处各写一份就会分叉，
  // 而分叉之后矩阵会静默把新构造子按 0 处理，不报错。
  const verdictMod = await import(pathToFileURL(path.join(src, "verdict.ts")).href);
  const STRENGTH = verdictMod.STRENGTH || {};
  const SAMPLES = [
    { name: "中文复诵 4 行（只该 dup）", expect: "dup", text: ["做。", "做。", "做。", "做。"].join(NL3) },
    { name: "整块英文不重复（只该 lang）", expect: "lang", text: [
      "I should read the config file first.",
      "Then check the parsed values.",
      "After that I will write the summary.",
      "Finally I will run the tests.",
    ].join(NL3) },
    { name: "中文正常写作（都不该成立）", expect: null, text: [
      "先读配置文件。",
      "再看解析出来的值。",
      "然后写总结。",
      "最后跑测试。",
    ].join(NL3) },
    // 冲突类：不复用 check-judge-order 的输入（那三条是同一批形状），这里换长度与语序，
    // 让两处样本表不同源——否则改一张表两条判据一起变，那是一条判据不是两条。
    { name: "英文长句复诵 5 行（dup 与 lang 都成立）", expect: "dup", text: [
      "Before touching the parser I want to re-read the settings file once more.",
      "Before touching the parser I want to re-read the settings file once more.",
      "Before touching the parser I want to re-read the settings file once more.",
      "Before touching the parser I want to re-read the settings file once more.",
      "Before touching the parser I want to re-read the settings file once more.",
    ].join(NL3) },
  ];
  for (const q of ruleMatrix(RULES, judgesMod, SAMPLES, STRENGTH)) problems.push(q);

  // KINDS 与 STRENGTH 的键集合必须相等（两处写同一件事就会分叉）。
  // 少一个：新构造子没有强度，矩阵会按 0 静默处理；多一个：强度表里有已删的构造子。
  for (const q of strengthParityProblems(verdictMod.KINDS || [], STRENGTH)) problems.push(q);

  // 死构造子：Kind / Rule 里每个字面量必须真的会被产生，或在 REMOVED_RULES 里有档案。
  // 读 verdict.ts + judges.ts 的源码文本：产生处就写在里面（rule:"x" / kind:"x"）。
  const declareSrc = ["verdict.ts", "judges.ts"]
    .map((f) => fs.readFileSync(path.join(src, f), "utf8"))
    .join("\n");
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

  // ⑲⑳㉑ 覆盖矩阵（2026-11-27）。喂假 judges，不读真实 src/judges.ts——
  // 读真实的话，判据坏了也会因为「真实实现恰好对」而绿。
  const fakeRules = [{ id: "dup", kind: "verdict" }, { id: "lang", kind: "verdict" }];
  const ST = { retract: 3, strip: 2, fold: 2, none: 0 };
  const alwaysNone = { judgeThinking: () => ({ kind: "none", rule: "dup" }) };
  cases.push(["没有任何独立判定函数 → 应红（无从单独验规则成立）",
    ruleMatrix(fakeRules, alwaysNone, [{ name: "s", text: "x" }], ST).some((q) => q.includes("独立判定函数"))]);

  const twoJudges = {
    dupJudge: () => ({ kind: "strip", rule: "dup" }),
    langJudge: () => ({ kind: "retract", rule: "lang" }),
    judgeThinking: () => ({ kind: "strip", rule: "dup" }), // 就是修之前那个「dup 先 return」
  };
  cases.push(["冲突样本时组合判据判给弱的那条 → 应红（这条正是本轮的真缺陷）",
    ruleMatrix(fakeRules, twoJudges, [{ name: "both", text: "x", expect: "dup" }], ST).some((q) => q.includes("按强度胜者应是"))]);

  const goodJudges = {
    dupJudge: () => ({ kind: "none", rule: "dup" }),
    langJudge: () => ({ kind: "retract", rule: "lang" }),
    judgeThinking: () => ({ kind: "retract", rule: "lang" }),
  };
  cases.push(["只有独有类样本（无冲突）→ 应红：顺序面没被覆盖",
    ruleMatrix(fakeRules, goodJudges, [{ name: "only-lang", text: "x", expect: "lang" }], ST).some((q) => q.includes("顺序") && q.includes("没被覆盖"))]);

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
