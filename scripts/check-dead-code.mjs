#!/usr/bin/env node
// check-dead-code.mjs —— 三类「声明了但从不生产/不使用/不变化」的东西。
//
// 为什么单独一个文件（2026-11-27）：这三个判据原先挤在 check-rules-coverage.mjs 里，
// 那个文件同时管模块对拍、规则覆盖、覆盖矩阵——红的时候说不出是哪一件坏了。
// 组 1 一句话说清了形状：「子集留在仓里不是中性的，它会抢走红的名义。」反过来更糟：
// 一件事挤在一个名字下面，红的名义没有归属。
//
// 三类各有一个真实事故（都写在函数上方）：
//   deadConstructors  Kind 里的 fold 有消费分支、能被 parse，但全仓无一处产生
//   staleModuleState  index.ts 的 lastThink / lastV / lastRedThink 恒等于初值
//   deadImports       index.ts / judges.ts 各有一处导入但从不用
//
// rc: 0 干净 ｜ 1 有问题 ｜ 2 读不到 src
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

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

/** 具名 import 的每个绑定，必须在文件其余部分至少出现一次。
 *  没有 tsconfig 的 noUnusedLocals 时，「导入但不用」是死声明里最难自己发现的一类：
 *  它不影响行为，tsc 不报，测试不红，编辑器的提示还常常标 [stale] 而被人忽略。
 *
 *  2026-11-27 实测：src/index.ts 的 import 里，planSignatureCleanup 全文只出现一次
 *  （实际调用的是 planSignatureCleanupIncremental）。pi-lens 报的
 *  「Remove unused declaration for: planSignatureCleanup」指的是这个绑定，
 *  不是那个函数本身——那个函数有 12 处测试调用，是活的。
 *  （这条是「诊断给的名字对、位置不对」的一个实例。）
 */
export function deadImports(files) {
  const out = [];
  const IMPORT_RE = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["\'][^"\']+["\']/g;
  for (const [rel, text] of Object.entries(files)) {
    const imports = [];
    for (const m of text.matchAll(IMPORT_RE)) imports.push({ full: m[0], names: m[1] });
    let rest = text;
    for (const imp of imports) rest = rest.split(imp.full).join("");
    // 注释里的名字不算使用。只剥「整行 //」与块注释：行内 // 保留，
    // 因为字符串里也可能有 //（剥它会少算一处使用 → 多报死导入 → 假红）。
    // 保守方向选「宁可漏报，不要假红」——假红会让人开始忽略这条判据。
    rest = rest.replace(/\/\*[\s\S]*?\*\//g, "").split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join("\n");
    for (const imp of imports) {
      for (const rawPiece of imp.names.split(",")) {
        const piece = rawPiece.trim();
        if (!piece) continue;
        const id = piece.replace(/^type\s+/, "").split(/\s+as\s+/).pop().trim();
        if (!/^[A-Za-z_$][\w$]*$/.test(id)) continue;
        const re = new RegExp("(^|[^.\\w$])" + id + "\\b");
        if (!re.test(rest)) out.push(rel + "：导入的 " + id + " 在文件其余部分一次都没出现");
      }
    }
  }
  return out;
}

/** 给一个目录，跑三类死代码检查。返回问题列表。 */
// 默认根目录是仓根（scripts/ 的上一级）：下面既找 dir/src，也找 仓根 之类。
const ROOT = path.resolve(here, "..");

export async function check(dir = ROOT) {
  const src = path.join(dir, "src");
  if (!fs.existsSync(src)) { console.log("缺 " + src + "（rc=2，环境缺失）"); process.exit(2); }
  const problems = [];

  const metaMod = await import(pathToFileURL(path.join(src, "meta.ts")).href);
  const archived = new Set((metaMod.REMOVED_RULES || []).map((r) => r.id));

  // ① 死构造子：读 verdict.ts + judges.ts 的源码文本（产生处就写在里面）。
  const declareSrc = ["verdict.ts", "judges.ts"]
    .map((f) => fs.readFileSync(path.join(src, f), "utf8"))
    .join("\n");
  for (const q of deadConstructors(declareSrc, archived)) problems.push(q);

  // ② 恒不变的模块级 let。
  const srcFiles = {};
  for (const f of fs.readdirSync(src).filter((n) => n.endsWith(".ts"))) {
    srcFiles["src/" + f] = fs.readFileSync(path.join(src, f), "utf8");
  }
  for (const q of staleModuleState(srcFiles)) problems.push(q);

  // ③ 死导入：src 与 src/algo、src/features 三层一起看（跨目录导入是常见误报源）。
  const allSrc = {};
  for (const d of ["src", "src/algo", "src/features"]) {
    const full = path.join(dir, d);
    if (!fs.existsSync(full)) continue;
    for (const f of fs.readdirSync(full).filter((n) => n.endsWith(".ts"))) {
      allSrc[d + "/" + f] = fs.readFileSync(path.join(full, f), "utf8");
    }
  }
  for (const q of deadImports(allSrc)) problems.push(q);

  return problems;
}

// selftest：三类各两条（一红一绿）。喂自造文本，不读真实 src——
// 读真实的话，有人把死代码删了这条样本就失去意义。
if (import.meta.main && process.argv.includes("--selftest")) {
  const NL = String.fromCharCode(10);
  const q = String.fromCharCode(34);
  const fakeKind = (k, r) => "export type Kind = " + k + ";" + NL + "export type Rule = " + r + ";" + NL;
  const prod = "x({ kind: " + q + "none" + q + " })";
  const ghost = fakeKind(q + "none" + q + " | " + q + "ghost" + q, "never");

  const deadState = "let a = 1;" + NL + "export function f() { return a; }" + NL;
  const liveState = "let a = 1;" + NL + "export function f() { a = 2; return a; }" + NL;
  const constState = "const a = 1;" + NL + "export function f() { return a; }" + NL;
  const impOf = (names, body) => "import { " + names + " } from " + q + "./m.ts" + q + ";" + NL + body + NL;
  const cases = [

  // 每条样本对应一处「会被改坏就红」的判据分支。拆分时我曾把 11 条精简成 6 条，
  // 两个文件的 PASS 数（6 与 10）都对，加起来却比拆分前少 5 条——覆盖降级没人报。
  // 数字自己是对的，数错了对象。所以这里按类补齐，且下面有一条「条数不少于 11」的断言。
    ["死构造子：有定义无产生 -> 应红", deadConstructors(ghost + prod, new Set()).length === 1],
    ["死构造子：有档案 -> 必须绿", deadConstructors(ghost + prod, new Set(["ghost"])).length === 0],
    ["死构造子：全部有产生处 -> 必须绿（挡「一律报红」）",
      deadConstructors(fakeKind(q + "none" + q, "never") + prod, new Set()).length === 0],
    // 死状态
    ["死状态：模块级 let 从不赋值 -> 应红", staleModuleState({ "x.ts": deadState }).length === 1],
    ["死状态：有赋值 -> 必须绿", staleModuleState({ "x.ts": liveState }).length === 0],
    ["死状态：const（本意就是常量）-> 必须绿", staleModuleState({ "x.ts": constState }).length === 0],
    ["死状态：注释里提到名字不算赋值 -> 仍应红",
      staleModuleState({ "x.ts": "let a = 1;" + NL + "// a = 2 是注释" + NL }).length === 1],
    // 死导入
    ["死导入：导入但不用 -> 应红", deadImports({ "x.ts": impOf("a, b", "b();") }).length === 1],
    ["死导入：导入且用 -> 必须绿", deadImports({ "x.ts": impOf("a, b", "a(); b();") }).length === 0],
    // 这一条原来写成一个断言、名字却是「用别名时必绿」，而断言值是 1 —— 名字与断言说的不是一件事。
    // 它同时验两样东西，所以拆成两条：
    //   `type T` 未被使用        -> 报 1 处（type 前缀要能认出来）
    //   `b as c` 通过别名 c 使用 -> 不报（as 别名要算使用）
    ["死导入：type 前缀要能认出来（type T 未使用 -> 报 1 处）",
      deadImports({ "x.ts": impOf("type T, b as c", "c();") }).length === 1],
    ["死导入：as 别名算使用（只留 b as c 并用 c -> 必须绿）",
      deadImports({ "x.ts": impOf("b as c", "c();") }).length === 0],
    ["死导入：名字只出现在注释里 -> 仍应红（注释不算使用）",
      deadImports({ "x.ts": impOf("a", "// a 是注释") }).length === 1],
  ];

  // 条数断言：挡「重构时顺手合并两条而没人注意」。
  // 它不是恒真断言——把两条合并成一条，这个数就掉下去。
  // 组 1 这条建议（「样本总数 >= N」）我采纳，并且写成「与下面的期望值相等」而不是「>=」，
  // 因为「>=」挡不住「删一条补一条」，而「等于」会逼人同时改两个地方——那正是要被看见的。
  const EXPECTED = 12;
  // 条数断言先跑：条数不对下面那些 PASS 就没有意义（它们可能把两条合并成一条而都过）。
  if (cases.length !== EXPECTED) {
    console.log("FAIL 样本条数 " + cases.length + "，期望 " + EXPECTED + "（有人删或合并了样本）");
    process.exit(1);
  }
  let bad = 0;
  for (const [name, ok] of cases) { if (!ok) bad++; console.log((ok ? "PASS " : "FAIL ") + name); }
  console.log(bad === 0 ? "selftest: " + cases.length + " 条全对" : "selftest: " + bad + " 条不符");
  process.exit(bad === 0 ? 0 : 1);
}

if (import.meta.main) {
  const problems = await check();
  for (const p of problems) console.log("红  " + p);
  console.log("check-dead-code: 死构造子 / 死状态 / 死导入 三类，问题 " + problems.length + " 处");
  process.exit(problems.length === 0 ? 0 : 1);
}
