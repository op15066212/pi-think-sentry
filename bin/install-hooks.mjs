#!/usr/bin/env node
// install-hooks.mjs —— 把「rc=1 不许推」装成机器判据。
//
// 为什么有（2026-11-25，pi 插件2 指出）：
// 我提交 4fb1570 之前跑了 npm run verify，rc=1，没看就 commit 又 push。
// 事后查明红的原因是 D 判据（新文件还没进 git），提交后自愈——原因无害，过程有害。
//
// 我当时的应对是「把顺序改成 add -> commit -> verify」。那是绕过，不是解法：
// 顺序换了，真正要守的那条没变，还是「rc=1 不许推」，而它靠我自觉。
// 换顺序还有新代价：verify 红了的时候已经提交，得 amend 或 reset 才不留脏历史。
//
// hook 与顺序无关：红了就推不出去。它放在 .git/hooks 里，不进 git、不跨机器，
// 所以这个脚本要进 git——装的那一步可复制，装出来的东西是本地的。
//
// 跑法：node bin/install-hooks.mjs
// 反例：造一条红的判据，git push 必须被拒。
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const HOOK = "#!/bin/sh\n# pre-push —— rc=1 不许推。由 bin/install-hooks.mjs 装。\n# 判据只看退出码，不看文本：npm run verify 的 rc 非 0 就 exit 1。\n# 日志写进 git 目录（不是 .git/：worktree 里 .git 是个文件，写不进去）。\ncd \"$(git rev-parse --show-toplevel)\" || exit 1\nLOG=\"$(git rev-parse --git-dir)/pre-push-verify.log\"\nnpm run verify >\"$LOG\" 2>&1\nrc=$?\nif [ $rc -ne 0 ]; then\n  echo \"pre-push 拒收：npm run verify rc=$rc\"\n  echo \"红在哪：tail -30 $LOG\"\n  exit 1\nfi\nexit 0\n" + "\n";

// hooks 目录不能用 --git-dir 拼：worktree 里它指向 .git/worktrees/<名>，那里也有一个
// hooks/ 目录，但 git 根本不读，于是装完照样不生效、还打印「已装」——假绿。
// git 自己的答案是 --git-path hooks，普通克隆与 worktree 两种情况都对。
const dir = path.resolve(REPO, execFileSync("git", ["-C", REPO, "rev-parse", "--git-path", "hooks"], { encoding: "utf8" }).trim());
fs.mkdirSync(dir, { recursive: true });
const target = path.join(dir, "pre-push");
fs.writeFileSync(target, HOOK, { mode: 0o755 });
try { fs.chmodSync(target, 0o755); } catch {}

// 装完读回来比对：写进去的必须是这一份。路径选错时这里红，而不是打印一句「已装」。
if (fs.readFileSync(target, "utf8") !== HOOK) {
  console.error("装完读回内容不一致：" + target);
  process.exit(1);
}

console.log("已装 " + path.relative(REPO, target));
console.log("判据：npm run verify 的 rc 非 0 时，git push 被拒（exit 1）");
