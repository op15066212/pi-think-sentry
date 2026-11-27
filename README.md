# pi-think-sentry

在模型调用工具前检查最近一条 assistant thinking；在一轮结束时清理保留范围之外的 thinkingSignature。

## 钩子

| 钩子 | 当前行为 |
| --- | --- |
| `tool_call` | 检查 thinking；判红时阻止工具调用并返回原因 |
| `turn_end` | 清理保留范围之外的 thinkingSignature |

安装位置是 `~/.pi/agent/extensions/pi-think-sentry/`。

## 判据

| 规则 | 条件 | 处置 | 反例 |
| --- | --- | --- | --- |
| `dup` | 同一投票行出现次数 ≥ `dup.min` | `strip` 删除命中的行 | 三次重复且门槛为四次时放行 |
| `lang` | 非目标语言行数 > 目标语言行数 | `retract` 不采用当前 thinking | 目标语言行数不少于非目标语言行数时放行 |

投票行不包括 fenced code、四空格或制表符缩进行、空行。工具调用前会先排除内部标记，再进行判定。

判决类型是 `none`、`strip`、`retract`；处置直接使用判据产生的行号，不重复计算。

## 配置

配置文件是插件目录下的 `settings.json`，下一次事件前按文件修改时间重读。默认值只有一处：`src/defaults.ts` 的 `DEFAULTS`。

主要配置：

- `dup.min`：重复行门槛，默认 4；
- `lang.dir`：目标语言，默认 `zh`；
- `signature.keepTurns`：保留的最近轮数，默认 30；
- `binding`、`intercept`、`strip`：运行开关和处置配置。

完整配置见 `SETTINGS.md`。

## 代码模型

语言判定在 `src/judges.ts` 的一次字符扫描中同时完成行投票和中英字符统计。判据、处置和配置分别由 `src/judges.ts`、`src/verdict.ts`、`src/config.ts` 提供。

## 元理论

### 规则模型

依赖类型理论：规则是类型，命题、证明项、反例、消去缺一不可。直觉主义：成立必须给出居民，不能把未发现反例当成证明。莫比乌斯反演：累积覆盖恢复逐项贡献时，先指名偏序与 μ。布尔格上的莫比乌斯反演使用 `μ(S)=(-1)^|S|`，也就是容斥。

| 构件 | 当前居民 | 反例 |
| --- | --- | --- |
| 形成 | `src/meta.ts` 的 `RULES` | 规则没有对应代码入口 |
| 引入 | `npm run verify` 返回 0 | 只写“检查过” |
| 反例 | 单元测试中的坏样本 | 只有正常样本 |
| 消去 | `node scripts/check-rules-coverage.mjs` 返回 0 | 规则表与实现分别计算 |

`src/meta.ts` 的 `RULES` 一共六条（两条产生判决，四条是机制约束）。覆盖矩阵要求每条规则有独立入口，并包含组合样本。

## 检查

```bash
npm ci
npm test
npm run verify
node scripts/gate.mjs
node scripts/check-rules-coverage.mjs
```

`npm run verify` 返回 0 才表示当前代码和文档检查均通过。

## 范围

插件检查字符级重复和语言行数差异；它不判断换词后的语义重复，也不判断观点是否正确。

## 排错

| 现象 | 检查 |
| --- | --- |
| 没有拦截 | 检查 `binding.capture` 和对应开关 |
| 判红太频繁 | 提高 `dup.min`，再运行 `npm run status` |
| 配置没有生效 | 检查 JSON 格式和配置路径 |
| 签名被清理 | 检查 `signature.keepTurns` |

## 文档入口

配置见 `SETTINGS.md`；规则签字见 `SIGN-OFF-DTT.md` 和 `SIGN-OFF.md`。
