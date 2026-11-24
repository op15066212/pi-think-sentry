#!/usr/bin/env node
// check-probes.mjs —— 让 bin/probe-* 这些诊断脚本也进执行面。
//
// 为什么要有它（2026-11-24，R9 里我自己留下的一处）：
//   npm test 只扫 test/*.test.ts。README 里那些 probe-* 命令一个都不在测试里，
//   它们坏了没人知道——14 个脚本里 13 个连 --selftest 都没有。
//   这与「指纹不覆盖 README」是同一类错：判据存在，但覆盖范围小了一圈，
//   而且不漏、不报错，只是没人发现。
//
// 判据（每条都能让别的脚本红）：
//   ① 每个 probe 不带参数时 rc 必须是 0（有默认行为）或 2（用法错），不能是 1。
//      rc=1 表示未捕获异常，那说明它坏了。
//   ② 带 --selftest 的脚本，跑 --selftest 必须 rc=0。
//   ③ 至少有一个脚本带 --selftest，否则 ② 恒假绿。
//
// 坏样本：
//   · 往 bin/ 放 probe-zzz.mjs 内容 throw new Error("x")  → ① 红
//   · 把 probe-shape-delta.mts 的断言改成假的          → ② 红
//   · 删掉所有 --selftest 字样                        → ③ 红
//
// rc: 0 全过｜1 有脚本坏了｜2 环境缺失

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin");

if (!fs.existsSync(BIN)) { console.error("缺 " + BIN); process.exit(2); }

const probes = fs
  .readdirSync(BIN)
  .filter((f) => f.startsWith("probe-") && /\.(mts|mjs|js)$/.test(f))
  .sort();

if (!probes.length) {
  console.error("bin/ 下没有 probe-* 脚本：判据会恒假绿，先确认路径");
  process.exit(2);
}

const run = (file, args) => {
  const isTs = file.endsWith(".mts");
  const nodeArgs = isTs
    ? ["--experimental-strip-types", path.join(BIN, file), ...args]
    : [path.join(BIN, file), ...args];
  const r = spawnSync(process.execPath, nodeArgs, { encoding: "utf8", timeout: 120000 });
  return { rc: r.status === null ? 124 : r.status, out: (r.stdout || "") + (r.stderr || "") };
};

const problems = [];
let withSelf = 0;

for (const f of probes) {
  const src = fs.readFileSync(path.join(BIN, f), "utf8");
  const hasSelf = src.includes("--selftest");

  const bare = run(f, []);
  if (bare.rc === 1) {
    const first = bare.out.split("\n").find((l) => /Error/.test(l)) || bare.out.split("\n")[0] || "";
    problems.push(f + " 不带参数 rc=1（未捕获异常）：" + first.trim().slice(0, 110));
  } else if (bare.rc !== 0 && bare.rc !== 2) {
    problems.push(f + " 不带参数 rc=" + bare.rc + "，期望 0 或 2");
  }

  if (hasSelf) {
    withSelf++;
    const st = run(f, ["--selftest"]);
    if (st.rc !== 0) {
      const tail = st.out.trim().split("\n").slice(-2).join(" | ");
      problems.push(f + " --selftest rc=" + st.rc + "，期望 0：" + tail.slice(0, 140));
    }
  }
}

if (withSelf === 0) problems.push("没有任何 probe 带 --selftest：判据 2 恒假绿");

console.log("check-probes: " + probes.length + " 个 probe，其中 " + withSelf + " 个带 --selftest");
for (const p of problems) console.log("红  " + p);
console.log(problems.length ? "FAIL " + problems.length + " 处" : "OK 全部可调用");
process.exit(problems.length ? 1 : 0);