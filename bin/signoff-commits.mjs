#!/usr/bin/env node
// signoff-commits.mjs —— 从签字表里读出「谁签过什么指纹」，不靠记忆。
//
// 为什么有（2026-11-25，pi 插件2 第二次抓到我同一个错）：
// 我写「你上一封签的 4d3f05b / 44fe360 作废」。
// 实际复核方从没签过这两笔——它们是我自己的两笔代码提交。
// 同一个错 2026-11-24 犯过一次（把 f0d83d8a 说成「上一笔，你已签」，实际签的是 fba6183d）。
// 两次都是**从自己的提交历史里取，不是从签字表里取**。
//
// 更深一层，我原来连「签的是什么」都搞错了：
//
//   签字对象 = 总指纹（--head 算出来的那个 32 位 md5）
//   commit   = 承载这个指纹的那一时刻，不是被签对象
//
// 所以「你签过 4d3f05b」这句话本身就不成立——4d3f05b 只是一笔提交，
// 从来没有任何人对它签字。被签的是那一刻的指纹。
//
// 这类错机器验不了：我不能自动检查「我这句话里的 commit 是不是签过的」。
// 能做的是：**说之前先跑这个**。工具把签字表读成一列指纹，读的人对着它说。
//
// 跑法：node bin/signoff-commits.mjs [签字表路径]
//   不带参数：读 SIGN-OFF.md（当前有效）+ SIGN-OFF-LOG.md（历次），存在几份读几份
// rc: 0 读到｜2 文件不在
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// 位置参数只在第一个非 -- 开头的项里找。原来直接取 argv[2]，
// 于是 --strict 被当成文件路径（第一次跑就撞上这个）。
const arg = process.argv.slice(2).find((a) => !a.startsWith("--"));

// 2026-11-25 拆表：SIGN-OFF.md 只留当前有效的一版，历次签字搬到 SIGN-OFF-LOG.md。
// 默认两份都读——「谁签过什么」是跨时间的，只读当前那份等于把历史扔掉，
// 于是「你签过 X」这个问题就又变回靠记忆回答。
const DEFAULT_FILES = ["SIGN-OFF.md", "SIGN-OFF-LOG.md"].map((n) => path.join(REPO, n));
const files = arg ? [arg] : DEFAULT_FILES.filter((f) => fs.existsSync(f));

if (!files.length) { console.error("signoff-commits: 找不到 SIGN-OFF.md 或 SIGN-OFF-LOG.md（rc=2）"); process.exit(2); }
for (const f of files) if (!fs.existsSync(f)) { console.error("signoff-commits: 找不到 " + f + "（rc=2）"); process.exit(2); }

const rows = [];
for (const f of files) {
  const lines = fs.readFileSync(f, "utf8").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.startsWith("|")) continue;
    const cells = l.split("|").map((c) => c.trim());
    const role = cells[1];
    if (role !== "复核方" && role !== "修改方") continue;
    const body = cells.slice(2).join(" | ");

    // 总指纹：32 位十六进制。这是被签对象。
    const fps = [...new Set([...body.matchAll(/\b([0-9a-f]{32})\b/g)].map((m) => m[1]))];
    // 签字记录里常只写前 8 位（--head 复算 7dce27c7）。单独收一份，标明是缩写。
    const fp8 = [...new Set([...body.matchAll(/复算\s+`([0-9a-f]{8})`/g)].map((m) => m[1]))];
    // commit：只认明确写在 HEAD 或 commit 后面的，不认反引号里的任意十六进制
    // （session id 前缀 f15be404 也全是十六进制，形状与 commit 相同——第一版就栽在这里）。
    const commits = [...new Set([
      ...[...body.matchAll(/HEAD\s+`([0-9a-f]{7,40})`/g)].map((m) => m[1]),
      ...[...body.matchAll(/commit\s+`([0-9a-f]{7,40})`/g)].map((m) => m[1]),
    ])];
    const at = [...body.matchAll(/(\d{4}-\d{2}-\d{2}T[\d:]+Z)/g)].map((m) => m[1]);
    rows.push({ where: path.basename(f) + ":" + (i + 1), line: i + 1, role, fps, fp8, commits, at: at.length ? at[at.length - 1] : "" });
  }
}

if (!rows.length) { console.log("signoff-commits: " + files.map((f) => path.basename(f)).join(" / ") + " 里没有「复核方」或「修改方」行"); process.exit(0); }

console.log("签字行（" + files.map((f) => path.basename(f)).join(" + ") + "）");
console.log("");
console.log("  位置            角色    被签对象（总指纹）                      时刻");
console.log("  ──────────────  ─────  ──────────────────────────────────────  ────────────────────");
for (const r of rows) {
  const fp = r.fps.length ? r.fps[0] : (r.fp8.length ? r.fp8[0] + "（记的是前 8 位）" : "（本行没写指纹）");
  const cm = r.commits.length ? "  HEAD " + r.commits[0].slice(0, 7) : "";
  console.log("  " + r.where.padEnd(16) + "  " + r.role + "  " + fp.padEnd(38) + "  " + r.at + cm);
}
console.log("");
console.log("签字对象是**总指纹**，不是 commit。commit 只是承载那个指纹的时刻。");
// --strict：每一行签字都必须有完整 32 位指纹。
// 为什么需要：我作为修改方的历史签字行只写了前 8 位（7dce27c7），
// 「签的是什么」就复算不到完整值。8 位够人认，不够机器验。
// 历史行是既成事实、又是双方各自写的，不 retro 改；这条只管从现在起的签字。
if (process.argv.includes("--strict")) {
  const short = rows.filter((r) => r.fps.length === 0);
  for (const r of short) console.log("红  " + r.where + "（" + r.role + "）没有完整 32 位指纹");
  console.log(short.length === 0 ? "strict: 每行都有完整指纹" : "strict: " + short.length + " 行不完整");
  process.exit(short.length === 0 ? 0 : 1);
}
console.log("说「你签过 X」之前，先在上面这张表里找到 X。找不到就是没签过。");
