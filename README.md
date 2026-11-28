# pi-think-sentry

在工具调用前检查最近一条 assistant thinking，并在一轮结束时清理保留范围外的 thinkingSignature。插件只按明确配置的表面规则判断，不判断观点真伪，也不识别换词后的语义重复。

## 钩子

| 钩子 | 行为 |
| --- | --- |
| `tool_call` | 检查 thinking；判红时阻止调用并返回原因 |
| `turn_end` | 删除保留范围以外的 thinkingSignature |

插件目录：`~/.pi/agent/extensions/pi-think-sentry/`。

## 判据

| 规则 | 条件 | 结果 | 反例 |
| --- | --- | --- | --- |
| `dup` | 同一投票行出现次数达到 `dup.min` | 按判决行号执行 `strip` | 三次重复、门槛为四时放行 |
| `lang` | 非目标语言投票行多于目标语言投票行 | `retract`，不采用当前 thinking | 两类行数相等时不触发 |

空行、围栏代码、四空格或制表符缩进行不参与投票。插件注入的内部处置标记先排除。判决类型为 `none`、`strip`、`retract`；执行阶段复用判决行号，不另算一次。

## 配置

配置文件为插件目录下的 `settings.json`，首次运行生成。配置在 `session_start` 读取；改动从下一轮会话启动时生效。默认值唯一来源为 `src/defaults.ts`，完整字段和取值见 [SETTINGS.md](SETTINGS.md)。

常用项：

- `dup.min`：重复行门槛，默认 `4`。
- `lang.dir`：目标语言，默认 `zh`。
- `signature.keepTurns`：保留最近的 assistant 最小轮数，默认 `30`。
- `binding`、`intercept`、`strip`：provider 绑定、拦截和处置开关。

## 实现边界

`src/judges.ts` 负责投票行分类与判决，`src/verdict.ts` 定义判决形状，`src/config.ts` 读取配置，`src/sentences.ts` 切句并识别内部标记。跳过清单非空时才创建 Set，行号保持为原文位置。

## 元理论
依赖类型理论：规则须有命题、证明项、反例和消去。直觉主义：通过必须由实际命令与坏样本支撑。需要从累积覆盖恢复逐项贡献时，先指名偏序格与 μ，这叫莫比乌斯反演；独立子集构成布尔格，其 μ(S)=(-1)^|S|，反演式就是容斥，称为布尔格上的莫比乌斯反演。仓内规则表位于 `src/meta.ts`。

形成：`src/meta.ts` 的规则类型；引入：`npm run verify` 返回 0；反例：单元测试坏样本；消去：`node scripts/check-rules-coverage.mjs` 独立核对规则入口。

`src/meta.ts` 的 `RULES` 一共 6 条（2 条产生判决，4 条是机制约束）。`SIGN-OFF-DTT.md` 记录指纹与签核；`node scripts/check-rules-coverage.mjs` 验证规则的独立入口和组合样本。

## 验证

```bash
npm ci
npm test
npm run verify
node scripts/check-doc-accuracy.mjs
node scripts/check-rules-coverage.mjs
```

`npm run verify` 返回 `0` 表示仓内总闸通过。规则覆盖检查要求每条规则有独立入口，并验证组合输入。

## 排错

| 现象 | 检查 |
| --- | --- |
| 没有拦截 | 检查 provider 绑定、`intercept.on` 与规则开关 |
| 判红过多 | 调整 `dup.min`，再运行 `npm run status` 检查配置与状态 |
| 配置未生效 | 检查插件目录下的 JSON；改动需等下一次 `session_start` |
| 签名被清理 | 调整 `signature.keepTurns` 或关闭 `signature.on` |
