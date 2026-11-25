#!/usr/bin/env node
// check-main-guard.mjs —— 有导出的脚本，「直接跑」与「被 import」两个方向都要对。
//
// 为什么有（2026-11-25）：同一个修法在两处漏，我犯了三次，两次是碰巧发现的。
//    修法            第一次              漏在哪              怎么发现
//    isMain 保护     check-doc-accuracy  check-rc-pipe       写精确测试要 import 时
//    数组支持        check 主流程        selftest            gate 补 selftest 后崩
//    EXCLUDE 口径    sentry              guard               报数时看到 25 变 22
// 三条同源：同一份判断写在两个地方，只改了一处。
//
// 只看文本没有用。第一版判「文件里有没有 isMain 那几个字」，放过了「只归一右边」——
// 代码在、判断永远为假、保护形同不存在。所以这条判据真的跑，两个方向各一个输入：
//   A 直接跑：必须进入主流程（有输出）
//   B 被 import：必须拿到导出且不 exit
//
// 四种写法的实测：
//   写法            直接跑    import    结论
//   正确             true      true      过
//   恒 true          true      false     B 红（import 时跑主流程）
//   只归一右边       false     true      A 红（直接跑反而不执行）
//   恒 false         false     true      A 红
// 少任何一个方向都会漏两种。
//
// B 方向由 scripts/main-probe.mjs 这个真文件执行，不在本文件里拼源码——
// 拼过四次，每次都错，最后一次错到判据自己不准（见 main-probe.mjs 的注释）。
//
// 用 node -e 测不出来：那时 argv[1] 为空，保护永远「成立」。
// rc: 0 两个方向都对｜1 有文件不合格｜2 扫不到
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// 点名豁免，每条都要说得出为什么不能加保护。
const EXEMPT = new Map([
  ["verify-dtt.mjs", "sha256 被 SIGN-OFF-DTT.md 逐字钉住（7abb1d33…），改一字节等于作废那份签字；"
    + "它导出的两个函数没有任何地方 import，缺保护当前无后果。要修须连同 DTT 重签。"],
]);

/** 有 export 的文件才算「设计上给人复用」。 */
export function hasExport(text) {
  return /^export\s+(async\s+)?function\s/m.test(text) || /^export\s+const\s/m.test(text);
}

function targets(dir) {
  const out = [];
  const scripts = path.join(dir, "scripts");
  if (fs.existsSync(scripts)) {
    for (const f of fs.readdirSync(scripts)) {
      if (/^check-.*\.mjs$/.test(f)) out.push(path.join(scripts, f));
    }
  }
  for (const f of fs.readdirSync(dir)) if (/^verify-.*\.mjs$/.test(f)) out.push(path.join(dir, f));
  const bin = path.join(dir, "bin");
  if (fs.existsSync(bin)) {
    for (const f of fs.readdirSync(bin)) {
      if (/\.mjs$/.test(f)) out.push(path.join(bin, f));
    }
  }
  return out;
}

export function check(dir = here) {
  const problems = [];
  const probe = path.join(dir, "scripts", "main-probe.mjs");
  if (!fs.existsSync(probe)) return ["缺 scripts/main-probe.mjs，B 方向无法测（rc=2）"];

  for (const f of targets(dir)) {
    const rel = path.relative(dir, f).split(path.sep).join("/");
    if (EXEMPT.has(rel)) continue;
    if (!hasExport(fs.readFileSync(f, "utf8"))) continue;

    // B 方向
    const imp = spawnSync(process.execPath, ["--experimental-strip-types", probe, rel], { cwd: dir, encoding: "utf8", timeout: 60000 });
    const impOut = String(imp.stdout || "") + String(imp.stderr || "");
    if (!impOut.includes("IMPORTED_OK")) {
      const last = impOut.trim().split(String.fromCharCode(10)).slice(-1)[0].slice(0, 90);
      problems.push(rel + "：被 import 时没拿到导出——" + last);
      continue;
    }

    // A 方向（只对 scripts/ 与仓根：bin/ 下有些直接跑会做重活）
    if (!rel.startsWith("scripts/") && !rel.startsWith("verify-")) continue;
    const run = spawnSync(process.execPath, ["--experimental-strip-types", f, "--selftest"], { cwd: dir, encoding: "utf8", timeout: 120000 });
    const runOut = String(run.stdout || "") + String(run.stderr || "");
    if (runOut.trim().length === 0) {
      problems.push(rel + "：直接跑 --selftest 没有任何输出——isMain 恒为假，主流程永不执行");
    }
  }
  return problems;
}

// isMain 保护（2026-11-25，这条判据抓到它自己缺的）：
// 没有它时 import 本文件会跑 check()，而 check() 会 spawn 本文件做 B 方向测试，
// 于是递归到底。判据抓到自己，是它该有的样子。
const norm = (x) => String(x || "").split(String.fromCharCode(92)).join("/");
const isMain = !!process.argv[1] && norm(fileURLToPath(import.meta.url)) === norm(process.argv[1]);

if (isMain && process.argv.includes("--selftest")) {
  const cases = [
    ["导出函数", "export function f() {}", true],
    ["导出常量", "export const f = () => {};", true],
    ["只有 exit", "process.exit(1);", false],
  ];
  let n = 0;
  for (const [name, text, want] of cases) {
    const ok = hasExport(text) === want;
    if (!ok) n++;
    console.log((ok ? "PASS  " : "FAIL  ") + name);
  }
  console.log(n === 0 ? "selftest: 三条形状全对" : "selftest: " + n + " 条不符");
  process.exit(n === 0 ? 0 : 1);
}

if (isMain) {
  const problems = check();
  for (const p of problems) console.log("红  " + p);
  console.log("check-main-guard: 两个方向各测一遍，不合格 " + problems.length + " 处");
  process.exit(problems.length === 0 ? 0 : 1);
}
