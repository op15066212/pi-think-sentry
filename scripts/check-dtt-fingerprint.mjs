#!/usr/bin/env node
// check-dtt-fingerprint.mjs —— SIGN-OFF-DTT.md 里那行指纹必须是现值。
//
// 为什么有（2026-11-25）：verify-dtt.mjs 只把指纹打印出来，不比对。
// 于是改过 README 之后，签字表里的指纹变成一串再也不等于现值的常数，
// 而没有任何东西会红——它是只有人读的字段，读的人通常也只看一眼。
// 这是恒假绿的一种：判据存在，但没有任何输入能让它失败。
//
// 判据：SIGN-OFF-DTT.md 里 | 指纹 | xxx | 那一行的值 === node verify-dtt.mjs --fingerprint 的输出。
// rc: 0 一致｜1 不一致｜2 文件或脚本缺失
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// 从签字表里取指纹行的值。取不到返回 null —— 缺行也是不一致，不能当「没问题」。
export function fpInSignoff(text) {
  const m = String(text || "").match(/^\|\s*指纹\s*\|\s*`?([0-9a-f]{16,128})`?\s*\|/m);
  return m ? m[1] : null;
}

// 比对。返回问题清单，空数组 = 一致。
export function check(signPath, current) {
  if (!fs.existsSync(signPath)) return ["缺 " + path.basename(signPath)];
  const inFile = fpInSignoff(fs.readFileSync(signPath, "utf8"));
  if (!inFile) return ["签字表里没有指纹行（形如 | 指纹 | <hex> |）"];
  if (inFile !== current) return ["签字表的指纹 " + inFile.slice(0, 16) + " 与现值 " + current.slice(0, 16) + " 不同"];
  return [];
}

const norm = (x) => String(x || "").replace(/\\/g, "/");
const isMain = !!process.argv[1] && norm(fileURLToPath(import.meta.url)) === norm(process.argv[1]);

if (isMain && process.argv.includes("--selftest")) {
  // 四份自造样本：与工作区无关，改 README 不会让 selftest 摇晃。
  const FAKE = "a".repeat(64);
  const OTHER = "b".repeat(64);
  const cases = [
    ["写对了 → 取出来就是它", fpInSignoff("| 指纹 | " + FAKE + " |") === FAKE],
    ["写错了 → 取出来是另一个值", fpInSignoff("| 指纹 | " + OTHER + " |") === OTHER],
    ["没有指纹行 → 取到 null", fpInSignoff("| 别的 | x |") === null],
    ["短于十六位不认（会话 id 那种不算指纹）", fpInSignoff("| 指纹 | f15be404 |") === null],
  ];
  let n = 0;
  for (const [name, ok] of cases) { if (!ok) n++; console.log((ok ? "PASS  " : "FAIL  ") + name); }
  console.log(n === 0 ? "selftest: 四条形状全对" : "selftest: " + n + " 条不符");
  process.exit(n === 0 ? 0 : 1);
}

if (isMain) {
  const vd = path.join(HERE, "verify-dtt.mjs");
  if (!fs.existsSync(vd)) { console.error("check-dtt-fingerprint: 缺 verify-dtt.mjs（rc=2）"); process.exit(2); }
  const r = spawnSync(process.execPath, [vd, "--fingerprint"], { encoding: "utf8" });
  const current = String(r.stdout || "").trim();
  if (r.status !== 0 || !/^[0-9a-f]{16,128}$/.test(current)) {
    console.error("check-dtt-fingerprint: 取不到现值（rc=2）" );
    process.exit(2);
  }
  const problems = check(path.join(HERE, "SIGN-OFF-DTT.md"), current);
  for (const p of problems) console.log("红  " + p);
  console.log(problems.length === 0
    ? "check-dtt-fingerprint: 签字表指纹与现值一致（" + current.slice(0, 16) + "）"
    : "check-dtt-fingerprint: " + problems.length + " 处不一致；按现值改 SIGN-OFF-DTT.md 后重签");
  process.exit(problems.length ? 1 : 0);
}
