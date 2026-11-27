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
import { DEFAULTS } from "../src/defaults.ts";
import { RULES } from "../src/meta.ts";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TICK = String.fromCharCode(96);
const DOCS = ["README.md", "SETTINGS.md"]
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
  // 2026-11-24：原来「任何表格首格」都当配置键，于是 README 里算法度量名
  // （uniqRatio / topShare / repeatCover）、函数名（judgeThinking）、模块名（intercept.reason）
  // 全被报成「配置键不存在」——9 处误报，判据恒假红，红久了就没人看。
  // 现在只有两种来源算配置键：
  //   ① 「配置」小节里的表格首格（标题含 配置/设置/键）
  //   ② 全文的 JSON 块 "key":（这个形状没有歧义）
  let inCfg = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^#{1,6}\s/.test(line)) {
      inCfg = /配置|设置|键/.test(line);
      continue;
    }
    if (inCfg && line.startsWith("|")) {
      const cell = line.slice(1).split("|")[0].trim();
      if (cell.length > 2 && cell.startsWith(T) && cell.endsWith(T)) {
        const k = cell.slice(1, -1).trim();
        if (/^[a-z][a-zA-Z0-9_.]*$/.test(k)) keys.add(k);
      }
    }
    // EPUB 块也只在配置小节内算：README 里 status 输出的示例 JSON（config / file / lines / ledger）
    // 形状和配置一模一样，全文扫就会把输出字段当配置键。
    if (inCfg) {
      const j = line.match(/^\s*"([a-z][a-zA-Z0-9_]*)"\s*:/);
      if (j) keys.add(j[1]);
    }
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

/** SETTINGS.md 表格里声明的默认值：{ 模块: { 键: 字面量 } }。
 *  形状是三级标题「### dup · 重复行」下面的「| 键 | 默认 | …|」。 */
export function defaultsIn(text) {
  const out = {};
  const T = String.fromCharCode(96);
  let mod = null;
  for (const line of text.split(/\r?\n/)) {
    const h = line.match(/^###\s+([a-z][a-zA-Z0-9]*)\s*·/);
    if (h) { mod = h[1]; out[mod] = out[mod] || {}; continue; }
    if (/^#{1,2}\s/.test(line)) { mod = null; continue; }
    if (!mod || !line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 2) continue;
    if (!cells[0].startsWith(T) || !cells[0].endsWith(T)) continue;
    const key = cells[0].slice(1, -1).trim();
    if (!/^[a-z][a-zA-Z0-9_]*$/.test(key)) continue;
    const v = cells[1].replace(/`/g, "").trim();
    if (v === "默认" || v === "---" || !v) continue;
    out[mod][key] = v;
  }
  return out;
}

/** 文档里的默认值是否等于代码里的默认值。
 *  为什么要有：同一个默认值只在 defaults.ts 一处写，文档是第二处。
 *  2026-11-27 实测缺口：把 SETTINGS.md 的 dup.min 从 4 改成 3，
 *  check-doc-accuracy 与 208 条测试全绿——「文档与代码一致」是没人看的面。 */
export function defaultsMismatch(text, defaults) {
  const bad = [];
  for (const [mod, kv] of Object.entries(defaultsIn(text))) {
    const code = defaults[mod];
    if (!code) { bad.push("模块 " + mod + " 在 DEFAULTS 里不存在"); continue; }
    for (const [k, v] of Object.entries(kv)) {
      if (!(k in code)) { bad.push(mod + "." + k + " 不在 DEFAULTS 里"); continue; }
      const want = typeof code[k] === "string" ? code[k] : String(code[k]);
      const got = v.replace(/^"|"$/g, "");
      if (got !== want) bad.push(mod + "." + k + " 文档写 " + v + "，代码是 " + JSON.stringify(code[k]));
    }
  }
  return bad;
}

/** 文档里那段 ```json 全文块。它是唯一能直接贴进配置文件的东西，也是第二处真值。
 *  为什么单独一个函数：模块表格（人能读的那处）与 JSON 全文（能复制的那处）是两处，
 *  只验一处时另一处写成什么都不报——2026-11-27 组 1 复算出这个缺口：
 *  把 JSON 全文里的 dup.min 从 4 改成 3，本脚本 rc=0。 */
export function jsonBlockOf(text) {
  const lines = text.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^```json\s*$/.test(lines[i].trim())) { start = i + 1; break; }
  }
  if (start < 0) return null;
  const body = [];
  for (let i = start; i < lines.length; i++) {
    if (lines[i].trim().startsWith("```")) break;
    body.push(lines[i]);
  }
  return body.join("\n");
}

/** 嵌套对象拍平成 "模块.键"：既方便比对，也让报错能指名到叶子。 */
export function flattenDefaults(o, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(o)) {
    const key = prefix ? prefix + "." + k : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flattenDefaults(v, key, out);
    else out[key] = String(v);
  }
  return out;
}

/** JSON 全文块与 DEFAULTS 的差异。块本身解析不了也算一处——文档里那段必须能直接粘贴使用。 */
export function jsonDefaultsMismatch(text, defaults) {
  const body = jsonBlockOf(text);
  if (body === null) return ["没有 ```json 全文块：文档里那段能直接粘贴的配置不见了"];
  let doc;
  try { doc = JSON.parse(body); } catch (e) { return ["```json 全文块解析不了：" + String(e.message).slice(0, 80)]; }
  const want = flattenDefaults(defaults);
  const got = flattenDefaults(doc);
  const bad = [];
  for (const [k, v] of Object.entries(want)) {
    if (!(k in got)) { bad.push("JSON 全文缺键 " + k); continue; }
    if (got[k] !== v) bad.push("JSON 全文 " + k + " 文档写 " + got[k] + "，代码是 " + v);
  }
  for (const k of Object.keys(got)) if (!(k in want)) bad.push("JSON 全文有 DEFAULTS 里没有的键 " + k);
  return bad;
}

/** README 里「一共 N 条（A 条产生判决，B 条是机制约束）」这类写死的数，必须等于 RULES 的实际分布。
 *
 *  2026-11-27 实测缺口：README 写「一共七条（两条产生判决，五条是机制约束）」，
 *  而 src/meta.ts 的 RULES 实际是 6 条（2 verdict + 4 mechanism）。
 *  也就是说文档一直多报一条，check-doc-accuracy 只说「对不上 0 处」——
 *  因为它只查配置键与路径，不查这种写死的数。
 *
 *  这条与「SETTINGS 默认值对拍」是同一族：**写死的数只要有一处能对拍，它就是判据；
 *  没有对拍，它就是注释。**
 *
 *  返回问题列表；纯函数，坏样本直接喂。 */
export function rulesCountMismatch(text, rules) {
  const out = [];
  const verdict = rules.filter((r) => r.kind === "verdict").length;
  const mech = rules.filter((r) => r.kind === "mechanism").length;
  const total = rules.length;
  const cn = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12 };
  const parse = (s) => {
    if (/^\d+$/.test(s)) return Number(s);
    return Object.prototype.hasOwnProperty.call(cn, s) ? cn[s] : null;
  };
  // 句子形状：一共 N 条（A 条产生判决，B 条是机制约束）
  const m = text.match(/一共\s*([0-9一二两三四五六七八九十]+)\s*条[（(]\s*([0-9一二两三四五六七八九十]+)\s*条产生判决[，,]\s*([0-9一二两三四五六七八九十]+)\s*条是机制约束/);
  if (!m) {
    out.push("找不到「一共 N 条（A 条产生判决，B 条是机制约束）」这句：规则条数没有被声明，谁都改不了它");
    return out;
  }
  const got = [parse(m[1]), parse(m[2]), parse(m[3])];
  const want = [total, verdict, mech];
  const names = ["总数", "产生判决", "机制约束"];
  for (let i = 0; i < 3; i++) {
    if (got[i] === null) { out.push(names[i] + "写成了「" + m[i + 1] + "」，不是可比的数"); continue; }
    if (got[i] !== want[i]) out.push(names[i] + "：文档写 " + got[i] + "，RULES 实际 " + want[i]);
  }
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
    // 默认值对拍：只在 SETTINGS.md 上做（它是唯一声明默认值的那份文档）。

    // 规则条数对拍：只在 README 上做（它是唯一声明条数的那份文档）。
    if (rel.endsWith("README.md")) {
      for (const b of rulesCountMismatch(text, RULES)) problems.push(rel + "：" + b);
    }
    if (rel.endsWith("SETTINGS.md")) {
      // 两处都验：模块表格（人能读的那处）与 JSON 全文（能直接粘贴的那处）。
      for (const b of defaultsMismatch(text, DEFAULTS)) problems.push(rel + "：" + b);
      for (const b of jsonDefaultsMismatch(text, DEFAULTS)) problems.push(rel + "：" + b);
    }
    for (const p of pathsIn(text)) {
      const cands = [path.join(root, p), path.join(root, "src", p), path.join(root, "scripts", p), path.join(root, "test", p), path.join(root, "bin", p)];
      if (!cands.some((c) => fs.existsSync(c))) problems.push(rel + "：路径不存在 " + p);
    }
  }
  return problems;
}

// selftest 分支也受 isMain 保护（2026-11-25）：别的脚本带 --selftest 去 import 它时，
// 跑的是它的自检并直接 exit，外层那个脚本的自检根本没执行。
if (import.meta.main && process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync(path.join(process.env.TEMP || "/tmp", "docacc-"));
  const bad = path.join(tmp, "bad.md");
  const good = path.join(tmp, "good.md");
  fs.writeFileSync(bad, "## 配置\n\n| " + TICK + "strict" + TICK + " | true | 已删的键 |\n", "utf8");
  fs.writeFileSync(good, "## 配置\n\n| " + TICK + "on" + TICK + " | true |\n| " + TICK + "min" + TICK + " | 3 |\n", "utf8");
  // 新样本：不在「配置」小节里的表，首格是度量名，不该被当配置键报红。
  // 这条正是 2026-11-24 那 9 处误报的形状（uniqRatio / topShare / judgeThinking）。
  const metric = path.join(tmp, "metric.md");
  fs.writeFileSync(metric, "## 实测对比\n\n| " + TICK + "uniqRatio" + TICK + " | 0.750 | 1.000 | 差 |\n", "utf8");
  const badProblems = check([bad], tmp);
  const goodProblems = check([good], tmp);
  const metricProblems = check([metric], tmp);
  // 默认值对拍：文档写 3、代码写 4 时必须红（2026-11-27 实测过的缺口）。
  const dm = defaultsMismatch("### dup · 重复行\n\n| " + TICK + "min" + TICK + " | " + TICK + "3" + TICK + " | 次数 |\n", { dup: { on: true, min: 4 } });
  const dg = defaultsMismatch("### dup · 重复行\n\n| " + TICK + "min" + TICK + " | " + TICK + "4" + TICK + " | 次数 |\n", { dup: { on: true, min: 4 } });
  // JSON 全文块：组 1 复算出的那一处（2026-11-27）。
  const jm = jsonDefaultsMismatch("```json\n{ \"dup\": { \"on\": true, \"min\": 3 } }\n```\n", { dup: { on: true, min: 4 } });
  const jg = jsonDefaultsMismatch("```json\n{ \"dup\": { \"on\": true, \"min\": 4 } }\n```\n", { dup: { on: true, min: 4 } });
  const jbroken = jsonDefaultsMismatch("```json\n{ \"dup\": { \"on\": true }\n```\n", { dup: { on: true, min: 4 } });
  // 条数对拍用的假规则集：两条 verdict + 四条 mechanism，与真实 RULES 同形但独立。
  // 用假的而不是读真实 RULES——读真实的话，有人改了 RULES 这条样本就失去意义。
  const SIX = [
    { id: "a", kind: "verdict" }, { id: "b", kind: "verdict" },
    { id: "c", kind: "mechanism" }, { id: "d", kind: "mechanism" },
    { id: "e", kind: "mechanism" }, { id: "f", kind: "mechanism" },
  ];
  const checks = [
    ["文档默认值与代码不同 → 必须红", dm.length > 0, true],
    ["文档默认值与代码相同 → 必须绿", dg.length === 0, true],
    ["JSON 全文默认值与代码不同 → 必须红", jm.length > 0, true],
    ["JSON 全文默认值与代码相同 → 必须绿", jg.length === 0, true],
    ["JSON 全文块坏掉（不能直接粘贴）→ 必须红", jbroken.length > 0, true],
    ["配置小节里写了已删的键 strict → 必须红", badProblems.length > 0, true],
    ["配置小节里只写真实键 → 必须绿", goodProblems.length === 0, true],
    ["非配置小节的表首格是度量名 → 必须绿（这是那 9 处误报的形状）", metricProblems.length === 0, true],
    // 规则条数对拍（2026-11-27）。样本用「两」而不是「二」——第一版正则只收了「二」，
    // 于是 README 那句「两条产生判决」匹配不上，判据报「找不到那句」。
    // 中文数字里 2 有两种写法，漏一种就等于漏一半。
    ["条数写对（六条=两+四）→ 必须绿", rulesCountMismatch("一共六条（两条产生判决，四条是机制约束）", SIX).length === 0, true],
    ["条数写成七条 → 必须红", rulesCountMismatch("一共七条（两条产生判决，五条是机制约束）", SIX).length > 0, true],
    ["条数用阿拉伯数字也要认（6/2/4）→ 必须绿", rulesCountMismatch("一共6条（2条产生判决，4条是机制约束）", SIX).length === 0, true],
    ["整句不见了 → 必须红（条数没人声明）", rulesCountMismatch("没有任何条数声明", SIX).length > 0, true],
  ];
  let n = 0;
  for (const c of checks) { const ok = c[1] === c[2]; if (!ok) n++; console.log((ok ? "PASS" : "FAIL") + "  " + c[0] + "（得 " + c[1] + "）"); }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(n === 0 ? "selftest: " + checks.length + " 条全对" : "selftest: " + n + " 条不符");
  process.exit(n === 0 ? 0 : 1);
}

// 只在被直接执行时跑主流程（2026-11-25）。此前 import 这个文件会直接跑完 check() 并 process.exit，
// 于是别的脚本想复用它里面的 keysIn/pathsIn 就做不到。
// 结果就是同一份逻辑在两个仓里各抄一遍，抄到两边行为不一致。
const isMain = import.meta.main;
if (isMain) {
  const problems = check();
  for (const p of problems) console.log("红  " + p);
  console.log("check-doc-accuracy: " + DOCS.length + " 份文档，对不上 " + problems.length + " 处");
  process.exit(problems.length === 0 ? 0 : 1);
}