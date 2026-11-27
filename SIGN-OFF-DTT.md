# SIGN-OFF · 依赖类型理论作为唯一元理论

本文件钉住三件事：元理论写在 `README.md`、判据能跑、指纹对得上。指纹一变，签名作废。

| 项 | 值 |
| --- | --- |
| 目标 | `.pi/agent/extensions/pi-think-sentry` |
| 文档 | `README.md` |
| 判据 | `node verify-dtt.mjs` → 期望 rc=0 |
| 坏样本 | `node verify-dtt.mjs --selftest` → 期望 5/5 全红 |
| 指纹一致 | `node scripts/check-dtt-fingerprint.mjs` → 期望 rc=0；本表那行与现值不同就红 |
| 指纹 | `0b0fbb31434c26884c48754f0a5453715fb6824caf98375f0f077c8293ac3068` |
| 既有测试 | `npm test` |
| sorry | 无 |

## 乙方（改动方）

| 项 | 内容 |
| --- | --- |
| 改了什么 | README 与 SETTINGS 按当前代码重写；新增 `scripts/check-dtt-fingerprint.mjs`，让本表指纹过期会红 |
| 2026-11-26 重签 | 取条目从 `getEntries()`（文件全集）改成 `getBranch()`（当前分支）：tab 报 `Invalid boundary entries: Entry XXXXXXXX not found`，根因是清签名时指向了废弃分支的条目。新增 `src/algo/branch.ts` + `test/branch.test.ts`（坏样本已验会红）。指纹随之刷新。 |
| 2026-11-26 重签（二） | README 的「配置生效机制」一句改成与代码一致：按文件 mtime 现读（`src/index.ts` 的 `refresh()`），不是靠 `session_start`。文档一改指纹就变，所以重签。 |
| 2026-11-27 重签 | 这条判据在 main 上本来就是红的：签字行记的是 `3365adc4`，现值 `0ad81b82`（`README.md` 与 `verify-dtt.mjs` 两个文件的 sha256，两份都与 main 逐字节相同，所以过期的是签字行，不是文件）。按脚本给的指引改成本次现值。 |
| 2026-11-27 重签（三） | README 的「判据怎么验」加了第一步 `npm ci`：不装依赖直接跑 verify 会红在两条 tsc 用例上（Cannot find module .../typescript/bin/tsc），那是环境缺失不是代码坏，这个形状骗过两个人各两次。文档一改指纹就变，所以重签。 |
| 判据 | `npm run verify` → rc=0（签字行里记这一次的实跑结果） |
| 指纹取法 | `node verify-dtt.mjs --fingerprint`：`README.md` 与 `verify-dtt.mjs` 两个文件的 sha256 |
| 宣布不了收敛 | 下表空着等甲方 |

## 甲方（复核方）

复核命令两条：`node verify-dtt.mjs --fingerprint` 与 `node scripts/check-dtt-fingerprint.mjs`。
输出与上表逐字符相同才算盘上没有事后改动。

| 项 | 填什么 |
| --- | --- |
| 复核时刻 | |
| 结论 | |
| 签名 | |
