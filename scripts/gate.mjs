#!/usr/bin/env node
// gate.mjs —— 本仓所有判据的总闸。
// 判据：跑完发现面上的全部判据，每个留自己的 rc，任一步非零则 rc=1。
// 反例：往 scripts/ 塞一个返回 1 的 check-zzz.mjs，本闸必须 rc=1 并点名。
//
// 发现面有两种（2026-11-25）：
//   scripts/check-*.mjs   —— 缩写前缀是 check 的，都在这里
//   仓根 verify-*.mjs     —— 历史命名。verify-dtt.mjs 在 SIGN-OFF-DTT.md 里被逐字引用，
//                            改名要重签，所以不动它；但它同样是一条判据、同样有 --selftest，
//                            不该因为命名不同就落在发现面外。发现面靠 glob，不靠登记。
//
// 每条判据走两步：先 --selftest（证明它会红），再正常模式（证明现在的盘面没红）。
// 以前只跑正常模式，于是「这条判据自己会不会红」从来不在执行面上。
// check-rules-coverage 的 selftest 一跑就崩（path.join 收到数组），那个崩藏了一整天。
//
// 顺序：selftest 先。它红了就不跑正常模式——判据本身坏了，
// 它给出的「0 处对不上」没有意义。
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, "..");

const inScripts = fs.readdirSync(DIR).filter((f) => /^check-.*\.mjs$/.test(f)).sort().map((f) => path.join(DIR, f));
const atRoot = fs.readdirSync(ROOT).filter((f) => /^verify-.*\.mjs$/.test(f)).sort().map((f) => path.join(ROOT, f));
const files = [...inScripts, ...atRoot];

if (!files.length) { console.error("gate: 发现面上一条判据都没有（rc=2，环境缺失）"); process.exit(2); }

const run = (full, args, ms = 300000) => {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [full, ...args], { stdio: "inherit", timeout: ms });
  return { rc: r.status ?? 1, ms: Date.now() - t0 };
};

/** 三态：0 绿 / 1 红 / 2 与环境相关（缺外部程序、缺兄弟仓）。
 *  分开的理由：把 2 算成红，一台没装 Electron 的机器上永远是红的，而「永远红」和
 *  「永远绿」是同一种病——人学会忽略它。把 2 算成绿更坏：判据根本没跑。
 *  所以 2 单独一栏，且全部条数都是 2 时整体 rc=2，不许报「通过」。 */
function classify(rc) {
  if (rc === 0) return "green";
  if (rc === 2) return "skip";
  return "red"; // 1 与崩溃（null→1）都算红：崩溃是判据本身坏了
}

let green = 0, red = 0, skipped = 0, steps = 0, selfs = 0;
const reds = [];
for (const full of files) {
  const name = path.relative(ROOT, full).split(path.sep).join("/");
  const hasSelf = fs.readFileSync(full, "utf8").includes("--selftest");

  if (hasSelf) {
    const s = run(full, ["--selftest"]);
    steps++; selfs++;
    const k = classify(s.rc);
    if (k === "red") { red++; reds.push(name + " --selftest"); }
    else if (k === "skip") skipped++;
    else green++;
    console.log((k === "green" ? "OK   " : k === "skip" ? "SKIP " : "FAIL ") + name + " --selftest rc=" + s.rc + " " + s.ms + "ms");
    if (k !== "green") continue;
  }

  const r = run(full, []);
  steps++;
  const k = classify(r.rc);
  if (k === "red") { red++; reds.push(name); }
  else if (k === "skip") skipped++;
  else green++;
  console.log((k === "green" ? "OK   " : k === "skip" ? "SKIP " : "FAIL ") + name + (hasSelf ? "" : "（无 --selftest）") + " rc=" + r.rc + " " + r.ms + "ms");
}

if (selfs === 0) console.log("gate: 警告 —— " + files.length + " 条判据里没有一条带 --selftest，判据自身退化无人看守");
console.log("gate: " + files.length + " 条判据（scripts " + inScripts.length + " + 根 " + atRoot.length + "）");
console.log("      步骤 " + steps + "（selftest " + selfs + "）｜ 绿 " + green + " / 红 " + red + " / 跳过 " + skipped);
if (red) { console.log("      红：" + reds.join(", ")); process.exit(1); }
if (skipped && !green) { console.log("      全部与环境有关，没有任何一条真正跑过：rc=2"); process.exit(2); }
process.exit(0);
