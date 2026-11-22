轮次: R1
提出者: 会话 9d80afea-e93e-4328-8106-7f2aebe20d8d
发现者: 01a1f741-c8b9-773a-825c-122638cae3ca
修改者: 01a1f741-c8b9-773a-825c-122638cae3ca
复核者: 01a1f741-c8b9-773a-825c-122638cae3ca
交付: 2026-11-20T13:06:15+08:00

## 审查

**身份** 三行都对上：version `0.1.17`、`git log -1` = `21c030b`、`md5sum src/judges.ts` = `2b384bdab5b07409659e94bde7adcf5d`。所以下面说的不是旧版。

**§3.1 没达到它自己写的期望。** 实跑两次（同一基线，中间只做只读操作）：

```
npm test → tests 127 / pass 127 / fail 0        rc=0
npm run mutate -- --file src/verdict.ts
  抓住 11 · 存活 1 · 跳过 0
  存活的：src/verdict.ts:19  && → ||  const isNum = (x:any) => typeof x === "number" && Number.isFinite(x);
```

提案写的是「期望 抓住 12 · 存活 0」。差的那一条不是等价：`typeof "number" || isFinite` 对 `NaN`、`±Infinity` 判真，而第 17 行注释明写「这里用 isFinite 两个都拦」——设计意图有，用例没有。所以 §3.1 的期望值本身是错的，不是脚本这次的偏差。

**§3.2 四条，我判 1 对 3 错。** 判法是复制整份 `src` 造真实变异体，用真实模块跑对比，不是读代码推：

| # | 坐标 | 提案判定 | 我的判定 | 可区分的输入 |
| --- | --- | --- | --- | --- |
| 1 | `cut.ts:11` `<` → `<=` | 等价 | **等价** | 无：8 种文本 × 19 种 drop 共 152 组，零差异。`splice(len,1)` 不动数组，`split/join` 互逆 |
| 2 | `config.ts:57` 第一个 `\|\|` → `&&` | 等价 | **不等价** | 配置文件内容是 `null`。原版 `readProblem()="broken"`；变异版 `=null`，于是 `writeConfig` 从「拒绝写、报错」变成「覆盖写」——丢掉「文件坏了不动它」那条保护。`5`、`"abc"`、`Infinity` 同样可区分（`!v && typeof v !== "object"` 只对 falsy 且非 object 成立，`Array.isArray` 只兜住数组，兜不住 null 与 truthy 非对象） |
| 3 | `strip.ts:41` `&&` → `\|\|` | 等价 | **不等价** | 消息里两个 thinking 块、后块 `thinking: ""`、判据的 dup 行号落在前块。原版后块保持 `""`；变异版把后块写成「（这一段的重复行已删除）」——给一段没删过的空块贴上「已删除」。下游 `stripDupLines` 只挡住越界下标，挡不住 `local` 变非空后走的空守护分支 |
| 4 | 五个 `configure` 的 `&&` 兜底 → `\|\|` | 等价 | **不等价** | `raw = undefined`（配置里缺该模块段，`readConfig` 里 `raw[m.name]` 对缺键就是 undefined）或 `raw = null`，五个模块全抛 `TypeError`。`5`/`"abc"`/`[]`/`{}` 只丢键不抛——提案说的「只丢键」对这几类成立，对最常发生的缺键不成立 |

第 3 条我补了一句更窄的事实：`strip.ts:41` 的 `<` → `<=` 是另一处，只在「dups 含越界行号 `offset+n` + 该块 thinking 为空」时可区分（畸形 Verdict，`parse` 不校验行号范围）。它与第 3 条同源，不是同一个变异。

**顺带查出两件盘上事实（已与提案者对齐）：**

1. `src/verdict.ts` 在 04:44 前后被并发窗口的变异体留在盘上（`ev.sample === null && typeof …`，恒抛），我当时的测试红就是它。我判定它是残留不是修复，先快照到 `%TEMP%/pts-snapshot/`，再 `git checkout -- src/verdict.ts`，测试回到 127 绿。提案者已确认是两边同时跑 mutate 造成的互扰。
2. `bin/mutate.mjs` 的两处未提交改动我复核过：只翻两侧带空格的运算符（泛型 `Record<…>` 与箭头 `=>` 不再被误翻）、exit/SIGINT/SIGTERM/uncaughtException 都恢复盘、开跑前先查基线。三条都有效。一处新分叉要点名：`runTest()` 跑 `node --test test/`（全目录，含 `rpc*.test.mjs`），而 `npm test` 跑 `test/*.test.ts`——两个入口的集合不同，同一件事在两处算，改一处不会红。

## 已改

`test/equiv-blanks.test.ts`（新增，5 条坏样本）、`package.json` + `package-lock.json`（0.1.17 → 0.1.18，版本一处真值）。**commit `d1e1fdf`**。没改 `src/`。

每条都验过「改回去会红」，不是「现在绿」：

```
verdict.ts       抓住 10 · 存活 0   （改前 11 · 1）
config.ts        抓住  8 · 存活 0   （改前  6 · 2）
features/strip.ts 抓住 8 · 存活 0   （改前  7 · 1）
features/dup.ts  抓住  2 · 存活 0
features/lang.ts 抓住  2 · 存活 0
cut.ts           抓住  6 · 存活 1   ← 唯一存活就是 §3.2 第 1 条，等价
npm test → tests 133 / pass 133 / fail 0   rc=0
```

## 未改

无。边界照办：没有 `git push`（pre-commit 只推了本机复刻仓，那是闸门自带动作），没动桌面镜像目录，没碰 `bin/mutate.mjs` 与 `test/force.test.ts`（另一个窗口的在途改动，未纳入 `d1e1fdf`）。

结论: 不认可（理由：§3.1 的期望「12 · 0」实为「11 · 1」，那一条是 NaN/Infinity 的真空白；§3.2 四条里第 2、3、4 条判错，可区分输入分别是 JSON `null`、空 thinking 块、缺失的模块段。三条判错的代价正是提案自己写的：真空白被下一轮当成已清账跳过。五条已补成坏样本并在 `d1e1fdf` 清零，请按新坐标重写 §3.2 再提 R2。）
