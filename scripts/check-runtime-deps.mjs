#!/usr/bin/env node
// check-runtime-deps.mjs —— 运行时依赖必须为空。
//
// 为什么（2026-11-27，本轮讨论「用开源库重构」的结论）：
// 这个扩展的生效方式是「把目录拷到 ~/.pi/agent/extensions/」或者从 npm 包加载，
// 两种方式下生效副本里都没有 node_modules。加了运行时依赖的后果是：
//   本地 npm test 全绿（依赖装在这儿），装上之后静默不工作（那边没有依赖）。
// 这不是风格问题，是**判据跑在比真实环境更全的环境里**——与我修过的那个缓存假绿同族。
//
// 规则：
//   dependencies / optionalDependencies / peerDependencies 一律必须为空
//   devDependencies 只允许 @types/* 与 typescript（类型与编译，不参与运行）
//
// 要引入第三方能力时的正确做法：vendoring（把需要的部分拷进本仓、写明出处与许可），
// 而不是加一条 dependencies。判据不看做法，只看 package.json。
//
// 判据（--selftest 每条都跑）：
//   运行时依赖非空            -> rc=1
//   devDependencies 里出现别的包 -> rc=1
//   @types/* 与 typescript     -> 放行
//   三个运行时字段缺失         -> 放行（默认干净）
//
// rc: 0 干净 ｜ 1 有运行时依赖 ｜ 2 package.json 读不到
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** 三个运行时字段 + dev 白名单。返回问题列表；纯函数，selftest 直接喂假的 package 对象。 */
export function problemsOf(pkg) {
  const out = [];
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    const deps = pkg && pkg[field];
    if (!deps) continue;
    const names = Object.keys(deps);
    if (names.length) out.push(field + " 非空：" + names.join(", ") + "——生效副本里没有 node_modules，装了也不工作");
  }
  const dev = Object.keys((pkg && pkg.devDependencies) || {});
  for (const name of dev) {
    const allowed = name.startsWith("@types/") || name === "typescript";
    if (!allowed) out.push("devDependencies 里出现 " + name + "：只允许 @types/* 与 typescript（其余是真的运行时依赖混进了开发面）");
  }
  return out;
}

// 入口守卫：被 import 时不能跑主流程。check-main-guard 会抓这一条，
// 而这轮我自己先踩过一次（第一版没有守卫，被它当场点名）。
if (import.meta.main && process.argv.includes("--selftest")) {
  const cases = [
    ["运行时依赖非空 -> 应红", problemsOf({ dependencies: { zod: "^3" } }).length === 1],
    ["optionalDependencies 也算运行时 -> 应红", problemsOf({ optionalDependencies: { x: "1" } }).length === 1],
    ["peerDependencies 也算运行时 -> 应红", problemsOf({ peerDependencies: { x: "1" } }).length === 1],
    ["dev 里出现别的包 -> 应红", problemsOf({ devDependencies: { husky: "9" } }).length === 1],
    ["@types/* 与 typescript -> 必须绿", problemsOf({ devDependencies: { "@types/node": "1", typescript: "1" } }).length === 0],
    ["三个运行时字段都缺 -> 必须绿（默认干净）", problemsOf({}).length === 0],
  ];
  let bad = 0;
  for (const [name, ok] of cases) { if (!ok) bad++; console.log((ok ? "PASS " : "FAIL ") + name); }
  console.log(bad === 0 ? "selftest: " + cases.length + " 条全对" : "selftest: " + bad + " 条不符");
  process.exit(bad === 0 ? 0 : 1);
}

if (import.meta.main) {
  const p = path.join(here, "..", "package.json");
  if (!fs.existsSync(p)) { console.error("读不到 " + p + "（rc=2，环境缺失）"); process.exit(2); }
  const problems = problemsOf(JSON.parse(fs.readFileSync(p, "utf8")));
  for (const x of problems) console.log("红  " + x);
  console.log("check-runtime-deps: 运行时依赖 0 个，dev 只有类型与编译" + (problems.length ? "，问题 " + problems.length + " 处" : ""));
  process.exit(problems.length === 0 ? 0 : 1);
}
