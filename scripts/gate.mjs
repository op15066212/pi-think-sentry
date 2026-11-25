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

let bad = 0, steps = 0, selfs = 0;
for (const full of files) {
  const name = path.relative(ROOT, full).split(path.sep).join("/");
  const hasSelf = fs.readFileSync(full, "utf8").includes("--selftest");

  if (hasSelf) {
    const s = run(full, ["--selftest"]);
    steps++; selfs++;
    console.log((s.rc === 0 ? "OK   " : "FAIL ") + name + " --selftest rc=" + s.rc + " " + s.ms + "ms");
    if (s.rc !== 0) { bad++; continue; }
  }

  const r = run(full, []);
  steps++;
  console.log((r.rc === 0 ? "OK   " : "FAIL ") + name + (hasSelf ? "" : "（无 --selftest）") + " rc=" + r.rc + " " + r.ms + "ms");
  if (r.rc !== 0) bad++;
}

if (selfs === 0) console.log("gate: 警告 —— " + files.length + " 条判据里没有一条带 --selftest，判据自身退化无人看守");
console.log("gate: " + files.length + " 条判据（scripts " + inScripts.length + " + 根 " + atRoot.length + "），" + steps + " 步（其中 " + selfs + " 步是 selftest），失败 " + bad);
process.exit(bad ? 1 : 0);
