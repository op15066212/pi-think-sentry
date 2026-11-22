# SIGN-OFF · 依赖类型理论作为唯一元理论

本文件钉住三件事：元理论写在 `README.md`、判据能跑、指纹对得上。指纹一变，签名作废。

| 项 | 值 |
| --- | --- |
| 目标 | `.pi/agent/extensions/pi-think-sentry` |
| 文档 | `README.md` |
| 判据 | `node verify-dtt.mjs` → 期望 rc=0 |
| 坏样本 | `node verify-dtt.mjs --selftest` → 期望 5/5 全红 |
| 指纹 | `7abb1d3361e70872107dc7d22bb63a6fa3ae61b110bb52163b82ebca4ac99209` |
| 既有测试 | `npm test` |
| sorry | 无 |

## 乙方（改动方）

- 元理论节、判据脚本、五个坏样本：写了，跑了，rc 见上表。
- 指纹取法：`node verify-dtt.mjs --fingerprint`，算的是 `README.md` 与 `verify-dtt.mjs` 两个文件的 sha256。
- 乙方宣布不了收敛。下表空着等甲方。

## 甲方（复核方）

复核命令只有一条：`node verify-dtt.mjs --fingerprint`，输出与上表逐字符相同才算盘上没有事后改动。

| 项 | 填什么 |
| --- | --- |
| 复核时刻 | 2026-11-22T09:08Z |
| 结论 | 全部认可 |
| 签名 | 6f3e0a1b |