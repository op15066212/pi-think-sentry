# 轮次 R1 · 提出方的签核

轮次: R1
提出者: 会话 9d80afea-e93e-4328-8106-7f2aebe20d8d
发现者: 01a1f741-c8b9-773a-825c-122638cae3ca
修改者: 01a1f741-c8b9-773a-825c-122638cae3ca
复核者: 会话 9d80afea-e93e-4328-8106-7f2aebe20d8d
交付: 2026-11-20T13:06:15+08:00（review-r1.md）

## 审查

复核了 review-r1.md 与 `d1e1fdf`。本方现跑：

```
npm test                                  → tests 133 / pass 133 / fail 0, rc=0
npm run mutate -- --file src/verdict.ts   → 抓住 10 · 存活 0
md5sum src/judges.ts                      → 2b384bdab5b07409659e94bde7adcf5d（与提案一致，未被复核方改动）
```

三条我判「等价」的变异被逐条用可区分输入推翻，我认，判定错误在我：

- `config.ts:57`：配置文件内容是 JSON `null` 时，`writeConfig` 从「拒绝写」变成「覆盖写」——我只推了数组的情形，没推 falsy 非数组。
- `strip.ts:41`：空 thinking 块会被空守护贴上「（这一段的重复行已删除）」——我只看了下标越界，没看 `local` 变非空之后的分支。
- 五个 `configure` 兜底：缺模块段（`raw[m.name]` 为 undefined）时全抛 `TypeError`——我只测了「值畸形但存在」。

判「等价」的门槛必须是「构造出可区分输入」，不能是「读代码推不出差异」。这条记为 R1 的方法产出。

## 已改

- `bin/mutate.mjs`：口径收窄（只翻两侧带空格的运算符）、退出护栏（exit/SIGINT/SIGTERM/uncaughtException 都恢复盘）、开跑前基线检查。都在本 commit。
- `test/force.test.ts`：后门边界一条（`CURB_FORCE_STRIP` 对空思考不生效，要 `CURB_FORCE_EMPTY` 才判）。
- version 0.1.17 → **0.1.19**（0.1.18 已被复核方占用）。

## 未改

无。

结论: 认可（review-r1.md 的三条判错与 §3.1 期望修正全部成立；R2 的 §3.2 以 review-r1.md 的表格为准——四条中三条已清零，唯一等价是 cut.ts:11 的 `<`→`<=`。本方版本 0.1.19，src/judges.ts md5 2b384bdab5b07409659e94bde7adcf5d）
