# 设置

一个文件：插件目录下的 `settings.json`。首次启动自动生成，之后不再覆盖。
改完下一次 `session_start` 生效，不用重启 pi。

## 全文

```json
{
  "intercept": { "on": true },
  "dup":       { "on": true, "min": 4 },
  "lang":      { "on": true, "dir": "zh" },
  "signature": { "on": true, "keepTurns": 30 },
  "strip":     { "on": true, "min": 4 },
  "inject":    { "on": true, "texts": { "dup": "", "lang": "", "clean": "", "inline": "" } },
  "binding":   { "allowGateway": false }
}
```

这份全文取自 `src/defaults.ts` 的 `DEFAULTS`，两者不一致时以代码为准。
命令：`/think-sentry` 看全部状态；`/think-sentry dup min 5` 改一个值。写不认识的键会被拒绝并说明，不静默兜底。

## 七个模块

### intercept · 拦截

| 键 | 默认 | 什么时候改 |
| --- | --- | --- |
| `on` | `true` | 只想看判决、不想让它挡工具调用时设 `false` |

判到不合格时挡住这一轮的工具调用，并附一句为什么。没有别的参数。

### dup · 重复行

| 键 | 默认 | 什么时候改 |
| --- | --- | --- |
| `on` | `true` | 关掉后同一条重复行不再判红 |
| `min` | `4` | 同一行出现几次算复诵。整块短、句式机械的对话把它调高；要更严就调低 |

为什么是 4 不是 3：使用者 2026-11-18 报的病例是「同一行出现了 7 次」，3 比他自己记的数更严，
那等于替他把定义改强。4 取在标记（3 次）与病例（7 次）之间。代价是「只有三行 `做。`」的空转会漏判。

### lang · 语言

| 键 | 默认 | 什么时候改 |
| --- | --- | --- |
| `on` | `true` | 关掉后不再判语言 |
| `dir` | `"zh"` | 目标语言。写 `"en"` 时判的方向整个反过来 |

先剥掉围栏、行内代码、公式、URL、盘符路径，再比较非目标语言行数与目标语言行数。

### signature · 清签名

| 键 | 默认 | 什么时候改 |
| --- | --- | --- |
| `on` | `true` | 不想动历史 entry 时设 `false` |
| `keepTurns` | `30` | 最近多少轮保留签名，更早的清掉。上限 300 |

`keepTurns` 数的是**最小轮**：每一条 assistant 消息算一轮，不是一次对话往返。
一次对话里可能有多个 assistant 消息（工具调用中间那些），按往返数会少算。
清理发生在 `turn_end`，改的是历史 entry 的内容，不动当前这轮。

### strip · 删重复行

| 键 | 默认 | 什么时候改 |
| --- | --- | --- |
| `on` | `true` | 只想要判决、不要删行时设 `false` |
| `min` | `4` | 删行自己的门槛。设成比 `dup.min` 小**不生效**——判据没认定的行没有依据删 |

`strip` 自己不判，只用判据已经算好的行号，从后往前删，位移不会串。
`strip.min` 大于 `dup.min` 时会出现「判红了但删不了」——看着在管，一次都没处置。
这种跨字段的事单个键查不出来，所以读配置时会单独报出来。

### inject · 追加提示

| 键 | 默认 | 什么时候改 |
| --- | --- | --- |
| `on` | `true` | 不想在 thinking 块后追加提示时设 `false` |
| `texts.dup` | `""` | `dup` 判红时追加的那段话 |
| `texts.lang` | `""` | `lang` 判红时追加的那段话 |
| `texts.clean` | `""` | 没有判红、但想补一句时追加的那段话 |
| `texts.inline` | `""` | 留着的位置：`inline` 判据已删，这个键没有读者 |

只对 `type === "thinking"` 的块追加，正文块原样返回。文案要过零容差自审，否则扩展拒绝启动。

### binding · 模型绑定

| 键 | 默认 | 什么时候改 |
| --- | --- | --- |
| `allowGateway` | `false` | 走网关代理、拿不到真实 provider 名时设 `true` |

没有 `on`：它不由人开关，由 provider / api 名字自动判定。anthropic / bedrock 系一律 `capture: false`——
它们不暴露 thinking，抓也抓不到。对它们硬开会得到一个永远抓不到东西的插件，看起来像「模型不思考」。

## 判据

每条配置都要能验。填错了不报错的配置等于没有配置。

| # | 命题 | 引入（命令 → 期望） | 消去（第二入口） | 反例 |
| --- | --- | --- | --- | --- |
| S1 | 本文件的键集合与 `DEFAULTS` 一致 | `npm test` 里 `config.test.ts` 的键比对用例 → rc=0 | `grep -oE '^  [a-z]+:' src/defaults.ts` 与本文件的模块标题逐条对 | 文档列了已删的 `inline` 模块 |
| S2 | 某模块关掉后不再动手 | 设 `dup.on=false` → `npm test` → rc=0 | 同一份输入在开与关下结论相反 | 关掉了还判红 |
| S3 | `strip.min` 不是独立阈值 | 设 `strip.min=1`、`dup.min=4` → 只删判据已认定的行 | 与 `judges.ts` 的 strip 分支同结论 | 以为设小就能多删 |
| S4 | 改配置不用重启 | 改文件 → 下一次 `session_start` 生效 | 同进程里再起一轮，行为已变 | 改完没反应就报 bug |
| S5 | `strip.min > dup.min` 会被报出来 | 设成 5 / 3 → `/think-sentry` 输出里有 `strip-gt-dup` | 读 `readConfig` 的跨字段检查 | 判红了但一次都没删，没人发现 |

```bash
npm test
node scripts/check-doc-accuracy.mjs
```
