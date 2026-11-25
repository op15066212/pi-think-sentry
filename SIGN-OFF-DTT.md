# SIGN-OFF · 依赖类型理论作为唯一元理论

本文件钉住三件事：元理论写在 `README.md`、判据能跑、指纹对得上。指纹一变，签名作废。

| 项 | 值 |
| --- | --- |
| 目标 | `.pi/agent/extensions/pi-think-sentry` |
| 文档 | `README.md` |
| 判据 | `node verify-dtt.mjs` → 期望 rc=0 |
| 坏样本 | `node verify-dtt.mjs --selftest` → 期望 5/5 全红 |
| 指纹一致 | `node scripts/check-dtt-fingerprint.mjs` → 期望 rc=0；本表那行与现值不同就红 |
| 指纹 | `66db72abad369c79954308c0807ca752aa3e742d2b7eb9093b8cb43acfe427e7` |
| 既有测试 | `npm test` |
| sorry | 无 |

## 乙方（改动方）

| 项 | 内容 |
| --- | --- |
| 改了什么 | README 与 SETTINGS 按当前代码重写；新增 `scripts/check-dtt-fingerprint.mjs`，让本表指纹过期会红 |
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
