#!/usr/bin/env node
// check-judge-order.mjs —— 两条判据同时成立时，报的是哪一条。
//
// 为什么要有（2026-11-27）：组 1 提出「前置判定会吃掉后面的类」，我按它给的输入形状
// 在自己仓里造了一条，实测出真缺陷：judgeThinking 原来先判 dup 并 return，于是
// 「英文复诵 4 行」这种同时命中两条的输入只报 dup/strip —— 整块英文思考删掉重复行后
// 仍被采用，而 lang（retract，这一轮不采用）那条保护等于不存在。
//
// 判据三条，各管一件事：
//   ① 两条都成立 → 报更强的那条：retract / lang（不是「先判的那条」）
//   ② 只 dup 成立 → 仍是 strip / dup（修 ① 不能把这条也改掉）
//   ③ 只 lang 成立 → retract / lang
//
// --selftest 换掉 judge：喂一个永远返回 none 的实现，三条必须全红；
// 喂真实现，三条必须全绿。判据错了（恒绿）会被自己的 selftest 抓到。
//
// rc: 0 全对 ｜ 1 有不符 ｜ 2 环境缺失
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

export const CASES = [
  ["两条都成立（英文复诵 4 行）→ 必须是 retract/lang", [
    "I should read the config file first.",
    "I should read the config file first.",
    "I should read the config file first.",
    "I should read the config file first.",
  ].join("\n"), "retract", "lang"],
  ["只 dup 成立（中文复诵 4 行）→ 必须是 strip/dup", ["做。", "做。", "做。", "做。"].join("\n"), "strip", "dup"],
  ["只 lang 成立（整块英文不重复）→ 必须是 retract/lang", [
    "I should read the config file first.",
    "Then check the parsed values.",
    "After that I will write the summary.",
    "Finally I will run the tests.",
  ].join("\n"), "retract", "lang"],
];

/** 用给定的 judge 跑三条，返回 { bad, lines }。纯函数，selftest 直接喂假 judge。 */
export function check(judge) {
  const lines = [];
  let bad = 0;
  for (const [name, text, wantKind, wantRule] of CASES) {
    const v = judge(text);
    const ok = v.kind === wantKind && v.rule === wantRule;
    if (!ok) bad++;
    lines.push((ok ? "PASS " : "FAIL ") + name + "（实得 " + v.kind + "/" + v.rule + "）");
  }
  return { bad, lines };
}

if (import.meta.main && process.argv.includes("--selftest")) {
  // 假 judge 永远说「没判红」：三条都必须被它自己判成不符。
  const dead = check(() => ({ kind: "none", rule: "dup" }));
  // 假 judge 永远说 strip/dup（就是修之前的行为）：第 ① ③ 两条必须红。
  const old = check(() => ({ kind: "strip", rule: "dup" }));
  const cases = [
    ["恒 none 的 judge → 三条全红", dead.bad === 3],
    ["修之前的实现（恒 strip/dup）→ 至少两条红", old.bad >= 2],
  ];
  let n = 0;
  for (const [name, ok] of cases) {
    if (!ok) n++;
    console.log((ok ? "PASS " : "FAIL ") + name);
  }
  console.log(n === 0 ? "selftest: 判据能红" : "selftest: " + n + " 条不符");
  process.exit(n === 0 ? 0 : 1);
}

if (import.meta.main) {
  const mod = await import(pathToFileURL(path.join(here, "..", "src", "judges.ts")).href).catch(() => null);
  if (!mod || typeof mod.judgeThinking !== "function") {
    console.error("读不到 src/judges.ts 的 judgeThinking（rc=2，环境缺失）");
    process.exit(2);
  }
  const { bad, lines } = check(mod.judgeThinking);
  for (const l of lines) console.log(l);
  console.log(bad === 0 ? "check-judge-order: 三条顺序全对" : "check-judge-order: " + bad + " 条不符");
  process.exit(bad === 0 ? 0 : 1);
}
