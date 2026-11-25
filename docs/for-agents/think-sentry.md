# think-sentry

覆盖：本仓根

- 目的：思考链哨兵。两条判据（`dup` 同一行复诵、`lang` 语言不匹配）；判红后删行或撤回该轮；判决追写 `ledger/judgments.jsonl`。
- 机器判据：`npm run verify`（= `npm test` + 指纹自检 + 总闸 `scripts/gate.mjs`）
- 能改哪里：这个仓内的文件；跨仓改动要先说明那是另一个 ownership。

## 改之前

- 先跑上面那条，拿到当前 rc；改完同一条必须还是 0。
- 只跑好样本会绿的不算判据：带 `--selftest` 的必须一起跑（总闸已经这么做）。
- 改 `README.md` 会让它的 sha256 变，`scripts/check-dtt-fingerprint.mjs` 会红。按 `node verify-dtt.mjs --fingerprint` 的新值更新 `SIGN-OFF-DTT.md` 后重签。
- 配置默认值只有一处：`src/defaults.ts` 的 `DEFAULTS`。`SETTINGS.md` 与它不一致时以代码为准。
