#!/usr/bin/env node
// sign.mjs —— 生成一行完整的签字表格行，把「写完整 32 位指纹」变成复制粘贴。
//
// 为什么有（2026-11-25，pi 插件2 定案）：
// 双方的历史签字行都只写了前 8 位（7dce27c7），「签的是什么」复算不到完整值。
// 定案是「历史不动，从现在起写完整」——但「记得写完整」不是判据。
//
// 这个脚本把签字那一刻的三个事实一次取齐，拼成可以直接粘的表格行：
//   一 总指纹（--head 口径，完整 32 位）
//   二 工作区是否干净（取前取后各一次，中间不插别的动作）
//   三 时刻
//
// 跑法：node bin/sign.mjs 修改方 "npm run verify rc=0"
// 反例：印出来的行里指纹少于 32 位 = 这个脚本坏了。
// rc: 0 印出｜1 工作区不干净（先提交再签，否则签的是一份没人能复现的状态）｜2 指纹取不到
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const role = process.argv[2];
const detail = process.argv[3] || "";

if (role !== "修改方" && role !== "复核方") {
  console.error("用法：node bin/sign.mjs <修改方|复核方> [说明]");
  process.exit(2);
}

const git = (...args) => spawnSync("git", ["-C", REPO, ...args], { encoding: "utf8" });

// 工作区必须干净：签一份带未提交改动的状态，第二天谁都复现不出来。
const st = git("status", "--porcelain", "--untracked-files=all");
if (st.status !== 0) { console.error("sign: git status 失败（rc=2）"); process.exit(2); }
const dirty = (st.stdout || "").split("\n").filter(Boolean).length;
if (dirty > 0) {
  console.error("sign: 工作区有 " + dirty + " 行未提交改动，先提交再签。");
  console.error(st.stdout.split("\n").slice(0, 10).map((l) => "  " + l).join("\n"));
  process.exit(1);
}

// --head：签字只认这条口径（工作区口径会随运行态变）。
const fp = spawnSync(process.execPath, [path.join(REPO, "bin", "fingerprint.mjs"), "--head"], { encoding: "utf8" });
const total = (fp.stdout || "").match(/总指纹 ([0-9a-f]{32})/);
const head = (fp.stdout || "").match(/口径 HEAD ([0-9a-f]{7,40})/);
if (!total) { console.error("sign: 取不到 --head 总指纹（rc=2）"); process.exit(2); }

const after = git("status", "--porcelain", "--untracked-files=all");
const dirtyAfter = (after.stdout || "").split("\n").filter(Boolean).length;

const at = new Date().toISOString().replace(/\.\d+Z$/, "Z");
const session = (process.env.PIDECK_SESSION_ID || "").slice(0, 8) || "本机";

// 表格行：指纹写完整 32 位。commit 只作参考——它承载指纹，不是被签对象。
const TICK = String.fromCharCode(96);
const row = "| " + role + " | " + session + " | **已签**：" + TICK + total[1] + TICK
  + (detail ? "、" + detail : "")
  + "、取前取后 0 行 | " + at + " |";

console.log(row);
console.log("");
console.log("取前 0 行，取后 " + dirtyAfter + " 行（应为 0）");
console.log("口径 HEAD " + (head ? head[1].slice(0, 7) : "?") + "，指纹 " + total[1] + "（" + total[1].length + " 位）");
if (dirtyAfter > 0) { console.error("sign: 取后工作区变成 " + dirtyAfter + " 行——有人同时在改，这一行别用"); process.exit(1); }
