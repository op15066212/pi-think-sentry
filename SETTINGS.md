# 设置

一个文件：插件目录下的 `settings.json`。第一次启动时自动生成，之后不再被覆盖。改完立即生效，不用重启。

## 全文

```json
{
  "intercept": { "on": true },
  "dup":       { "on": true, "min": 4 },
  "inline":    { "on": true, "min": 12 },
  "lang":      { "on": true, "dir": "zh" },
  "strip":     { "on": true, "min": 3 },
  "inject":    { "on": true, "texts": { "dup": "", "lang": "", "clean": "", "inline": "" } },
  "binding":   { "allowGateway": false }
}
```

命令：`/think-sentry` 看全部状态；`/think-sentry dup min 5` 改一个值。写不认识的值会被拒绝并说明，不会静默兜底。

## 六个模块，逐个解释

### intercept · 拦截

| 键 | 默认 | 什么时候改 |
| --- | --- | --- |
| `on` | `true` | 只想看判决不想让它拦工具调用时设 `false` |

判到不合格时挡住这一轮的工具调用。没有别的参数。

### dup · 重复行守护

| 键 | 默认 | 什么时候改 |
| --- | --- | --- |
| `on` | `true` | 关掉后同一条重复行不再判红 |
| `min` | `4` | 同一行出现几次算「复诵」。整块短、句式机械的对话把 `min` 调高；要更严就调低 |

判据入口是 `judges.ts` 的 `dupJudge`，按「vote 行」计数：围栏内、缩进块、空行不计。

```bash
grep -n '"min"' src/defaults.ts      # 默认值以这里为准，不以文档为准
npm test                              # rc=0
```

### lang · 语言守护

| 键 | 默认 | 什么时候改 |
| --- | --- | --- |
| `on` | `true` | 关掉后不再判语言 |
| `dir` | `"zh"` | 目标语言。写 `"en"` 时判的是「中文过多」，方向整个反过来 |

判据入口是 `judges.ts` 的 `langJudge`。先剥掉围栏、行内代码、公式、URL、盘符路径，再看非目标语言的行数是否多于目标语言的行数。

### inline · 坍缩守护

**判什么**：连续 ≥ `min` 句里，不同句数 / 总句数 ≤ 1/4。

| 键 | 默认 | 说明 |
|---|---|---|
| `on` | `true` | 关掉后不判坍缩（`dup` 仍然判整行重复） |
| `min` | `12` | 最少句数。小于 12 句不判——4 句全同是 25%，但正常写作里「做。做。做。做。」不构成退化 |
| `ratio` | `0.25` | 区间内不同句数 / 总句数 的上限。实测分界：真退化 6%~25%，正常文本 58%~100%，中间没有样本 |

**为什么不叫「句内重复」**：第一版是「同一句连续出现」，模型换成交替与「换词不换结构」就绕过了。
现在判的是结构性质，不认形状。三段真实退化同一条判据全红。

**处置与 `dup` 不同**：`dup` 判红 → 整行删（`strip`）；`inline` 判红 → 把那段区间**折叠成一行标记**
（`fold`），因为那一行里还有正常内容，整行删会丢信息。

判据：`npm test` 的 `collapse.test.ts`（11 条：3 条退化形状必红、4 条正常文本不得误判、区间定位、折叠、非法组合、穷尽性）。

### strip · 删重复行

| 键 | 默认 | 什么时候改 |
| --- | --- | --- |
| `on` | `true` | 只想要判决不要删行时设 `false` |
| `min` | `3` | 删行自己的门槛，与 `dup.min` 分开。设成比 `dup.min` 小**不生效**——判据没认定的行没有依据删 |

`strip` 自己不判，只用判据已经算好的行号（`ev.dups` 里每组第三项），按行号从后往前删，位移不会串。

### inject · 追加提示

| 键 | 默认 | 什么时候改 |
| --- | --- | --- |
| `on` | `true` | 不想在 thinking 块后追加提示时设 `false` |
| `texts.dup` | `""` | `dup` 判红时追加的那段话 |
| `texts.lang` | `""` | `lang` 判红时追加的那段话 |
| `texts.clean` | `""` | 没有判红、但想补一句时追加的那段话 |

只对 `type === "thinking"` 的块追加；正文块原样返回。文案要过零容差自审，否则扩展拒绝启动。

### binding · 模型绑定

| 键 | 默认 | 什么时候改 |
| --- | --- | --- |
| `allowGateway` | `false` | 走网关代理、拿不到真实 provider 名时设 `true`，否则判据会以为「这个模型不思考」 |

没有 `on`：它不由人开关，而由 provider / api 名字自动判定。anthropic / bedrock 系一律 `capture: false`——它们不暴露 thinking，抓也抓不到。

## 判据

每条配置都要能验，否则填错了不报错、只是永远不生效。

| # | 命题 | 引入（命令 → 期望） | 消去（第二入口） | 反例 |
| --- | --- | --- | --- | --- |
| S1 | 本文件的键集合与 `src/defaults.ts` 的 DEFAULTS 一致 | `node -e` 比对两边键名 → 差集为空 | `grep -oE '^  [a-z]+:' src/defaults.ts` 与本文件的模块标题逐条对 | 文档列 5 个模块、代码有 6 个：`binding` 填了没人读 |
| S2 | 开关关掉后该模块不再动手 | 设 `dup.on=false` → `npm test` 的配置用例 → rc=0 | 同一份输入在 `true` 下判红、`false` 下不判 | 关掉了还判，用户以为关了 |
| S3 | `strip.min` 不是独立阈值 | 设 `strip.min=1`、`dup.min=3` → 只删判据已认定的行 | 与 `judges.ts` 的 strip 分支同结论 | 以为设小就能多删 |
| S4 | 改配置不用重启 | 改文件 → 下一次 `session_start` 生效 | 同进程新起一轮，行为已变 | 以为要重启 pi，改完没反应就报 bug |

```bash
npm test                                                              # rc=0
node --experimental-strip-types scripts/check-rules-coverage.mjs       # 6 条规则，0 缺口
node verify-dtt.mjs                                                    # 元理论节齐、四件齐
```
