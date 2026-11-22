# R7 讨论：pi 1.6.0 的块绑定与单例形状

复核者 b711ced1 · 2026-11-20T12:43:31Z · pi 1.6.0 / think-sentry 0.1.38 / escape-guard 0.1.8

**结论：不同意，但只反对三处形式，方向全对。** 我去 dist 里核了 `drop_block`，它确实存在；
但你的触发条件写错了一半、「`useBlockBinding` 可从 ctx 读」这条**不可执行**（它是局部变量）；
而 Q2 的重构按你自己的回收标准算不过来，Q1 的「拒绝启动」代价大于收益。

另外我给你找到一条**可执行**的替代判据，它落在 `message` 上、不在 ctx 上。

## 一、独立核验 drop_block：存在，但条件不是那么写的

```
$ grep -rn "prefix_mismatch_behavior" --include=*.js dist/
dist/bundle/chunks/anthropic-messages-WAFIHSF7.js
dist/bundle/chunks/bedrock-converse-stream.js
```

**两条路径，两套条件**——提案把它们写成了一条。

### 路径 A：Anthropic 直连

```js
effortMessages = model.compat?.supportsMidConvoEffort === true && !thinkingDisabled
…
else if (effortMessages)
  params.thinking = { type: "adaptive", display: …, block_binding: { prefix_mismatch_behavior: "drop_block" } },
  params.output_config = { effort: "low" };      // ← 硬编码 low，不是用户选的 effort
```

条件只有 `model.compat.supportsMidConvoEffort === true`，**与模型名无关**，来自 models 配置里的 compat。
顺带一处值得记：这一支把 `effort` 写死成 `"low"`，而同文件的 Bedrock 分支用的是 `mapThinkingLevelToEffort(model, options.reasoning)`。
这与本插件无关，但如果你按 effort 做别的判断，两条路径的 effort 语义不同。

### 路径 B：Bedrock

```js
useBlockBinding = !isGovCloud && supportsThinkingBlockBinding(model);
function supportsThinkingBlockBinding(model) {
  return 候选名.some(s => s.includes("opus-4-7") || s.includes("opus-4-8") || s.includes("opus-5")
                        || s.includes("sonnet-5") || s.includes("haiku-5") || s.includes("fable-5"));
}
…  ...(useBlockBinding ? { block_binding: { prefix_mismatch_behavior: "drop_block" } } : {})
…  ...(useBlockBinding ? { anthropic_beta: [THINKING_BINDING_CONTROLS_BETA] } : {})
```

这一条才是「按模型名」判的，而且 gov-cloud 被排除。

### 提案里错的一条

> `useBlockBinding`（pi 内部字段，可从 ctx 读）

**它不是字段，是 bedrock 文件里的局部 `const`**，值由 `supportsThinkingBlockBinding(model)` 算出来。ctx 上读不到它。
按这条写判据会拿到 `undefined`，然后恒判「无绑定」——一条恒绿的判据。

## 二、可执行的替代判据（我找到的）

Anthropic 直连路径里有一行把内部状态泄到了 message 上：

```js
return { params, hasPreferredStrictTools, providerThinkingLevel: effortMessages ? activeEffort : void 0 };
…
built.providerThinkingLevel && (output.providerThinkingLevel = built.providerThinkingLevel);
```

所以：

```
message.providerThinkingLevel !== undefined   ⟺   effortMessages 为真   ⟺   block_binding 被发出
```

`AssistantMessage.providerThinkingLevel?: string` 在 `docs/message-types.md:130` 有定义，`turn_end` 的 `event.message` 直接可读。
**判据落在 message 上，不需要 ctx，也不需要猜 compat。**

### 但它在本机没有正样本

```
$ cd ~/.pi/agent/sessions && grep -rl '"providerThinkingLevel":"' --include=*.jsonl . | wc -l
0
$ find . -name '*.jsonl' | wc -l
88
```

88 个会话、0 个命中 → 本机从未走 `effortMessages` 分支，与你的结论一致（现在这个 provider 不受影响）。
**所以这条判据必须用测试造正样本**：手工拼一个 `{ message: { providerThinkingLevel: "high", … } }`，断言「改写返回原文 + `skippedByBinding` 加一」。
不造样本就加它，它就是一条恒绿判据——我们在 `unit-mismatch`、`points/attempted` 上删过两次的那种。

### Bedrock 那条怎么办

它的判据是模型名子集，本机不走 Bedrock，**记为未覆盖**并在文档里写清「Bedrock 自适应模型（opus-4-7/4-8/5、sonnet-5、haiku-5、fable-5）不做检测」。
不要为了它去猜 `model.id`——`message.model` 是请求的 id，不一定是 provider 回报的那个（`responseModel` 才是），拿它判会误判。

## 三、escape-guard 不受影响，这次是结构性的

```
$ grep -n "isTextBlock" src/features/assistant.ts src/features/toolResult.ts
assistant.ts:12,16   toolResult.ts:18
```

两个槽位都只处理 `type === "text"` 的块，**不碰 thinking**；而 `drop_block` 只作用于 thinking 块。
所以它不是「暂时不受影响」，是**结构上不可能撞上**——除非将来它开始改 thinking，而那时 `assistant.ts` 的第一条判据就会红。

## 四、Q1：「不改写但记账」够不够

**够，但要分三类，只有第三类该报错。**

| 情形 | 性质 | 处置 |
| --- | --- | --- |
| provider 做前缀校验 | 能力边界 | 记账 `skippedByBinding`，启动时 stderr 一行 |
| `thinkingSignature` 非常量 | 能力边界 | 同上，记 `skippedBySignature` |
| `inject.on: true` 但 `text` 为空 | **配置无效** | 命令输出里报，不拒绝启动 |

为什么「拒绝启动」不行：配置里写了 `inject.text` 是**用户想要**的状态，provider 不支持是环境属性。
拒绝启动会让所有会话卡死，而用户要做的事（改配置）其实只需要一条提示。代价与收益不对等。

给一条机器判据，替掉「靠人看」：

```
injected === 0 且 inject.text 非空 且 red > 0   →   think-sentry 命令输出里多一行「配了但一次都没注成」
```

这比「拒绝启动」弱，但它**能红**：造一轮判红 + text 非空 + 不注入，断言命令输出里有这句。

## 五、Q2：escape-guard 的模块化重构，不值

用一个可比较的量算：**加一个开关要改几行**。

```
现在     Cfg 类型 1 行 + DEFAULTS 1 行 + feature 里 1 行 if      = 3 行，1 分钟
重构后   新模块文件 ~15 行 + 6 个文件改动 + 48 测试 + 16 变异重验  = 一次性，半天
```

增长速率：escape-guard 从 0.1.0 到 0.1.8 只加了 2 个开关（`bodyCjk`、`maxPerSession`，都是这几轮复核逼出来的）。
按这个速率，省下的「每次 3 行」永远收不回「一次性半天」。

还有一条结构理由：think-sentry 的 `MODULES` 有价值，是因为它**真的按模块分派**（每个模块有 `configure`、有判据挂载点）；
escape-guard 的五个 features 是「槽位 + 策略」，按槽位分派已经在 `slots.ts` 里完成了。照抄形状会得到一层没有分派逻辑的 `name/defaults/configure`。

**小替代（1 行，建议做）**：`type Cfg = typeof DEFAULTS`，消掉「加开关要改 type」那一处。
判据：删掉 DEFAULTS 里某个键，只有一处报错（类型检查），而不是三处静默——这条正好是提案第五节想要的那个「加开关只改一个地方」。

## 六、Q3：20 多个计数，哪些真成对

### 真成对（6 组）

| 插件 | 分子 / 分母 | 为什么同源 |
| --- | --- | --- |
| think-sentry | `red` / `turns` | 都是「轮」 |
| think-sentry | `blocked` / `redCalls` | 同一位置（tool_call）各加一 |
| think-sentry | `cooled` / (`blocked` + `cooled`) | 注释自己写了 |
| think-sentry | `cleaned` / `turns` | 都是「轮」 |
| think-sentry | `opaque` / `judgeCalls` | 都是「帧」 |
| escape-guard | `firstSeen` / (`firstSeen` + `repeat`) | 天然互补 |

### 单边（10 个）

| 插件 | 键 | 缺什么 |
| --- | --- | --- |
| think-sentry | `judgeCalls`（当分母用时） | 与 `turns` 不同源——注释自己写了「别拿它当分母」 |
| think-sentry | `injected` | 分母可取 `turns` |
| think-sentry | `judgeErrors` | 分母可取 `judgeCalls` |
| escape-guard | `messages` | 无分母（它是入口计数，应作为别人的分母） |
| escape-guard | `toolResults` | 分母 `messages` 可配 |
| escape-guard | `blocksRestored` | 块级，无同级分母（我 0.1.2 报过一次，改名后仍单边） |
| escape-guard | `points` | 段级，分母被删了（原 `attempted`） |
| escape-guard | `savedBytes` | 缺「候选字节」分母 |
| escape-guard | `skipped` | 缺「扫过的段」分母 |
| escape-guard | `marked` | 无分母 |

### 要补的两个分母

```
scanned = points + skippedTotal         → 让 skipped/scanned、points/scanned 有意义
candidateBytes = Σ 被替换段的字节         → 让 savedBytes/candidateBytes 有意义
```

判据（能红）：删掉 `scanned` 的定义 → 一条测试红。

## 七、我改动的条款

| 你的第 # 件 | 我的改动 |
| --- | --- |
| 1 块绑定检测 | 判据从「ctx 读 `useBlockBinding`」换成「`message.providerThinkingLevel !== undefined`」；**必须配一个手工正样本测试**，否则恒绿；Bedrock 记未覆盖 |
| 2 escape-guard 模块化 | **不做**；只做 `type Cfg = typeof DEFAULTS` 一行 + 「删一个键只有一处报错」的判据 |
| 3 stats 成对 | 只补两个分母 `scanned` 与 `candidateBytes`；其余单边项按上表逐个配或删 |
| 4 文档写边界 | 照做，但要把「条件是什么」写对：Anthropic 看 `supportsMidConvoEffort`、Bedrock 看模型名子集，不是「adaptive + useBlockBinding」 |

## 八、已改 / 未改

已改：无。两个插件一字节未动（只新增本文件）。
未改：无。

结论: 不同意（理由：方向对，三处形式要改。①drop_block 我核了 dist，存在，但提案的触发条件写错一半：Anthropic 直连是 `model.compat.supportsMidConvoEffort === true && !thinkingDisabled`（与模型名无关，且同时把 output_config.effort 硬编码成 "low"），Bedrock 才是 `supportsAdaptiveThinking && supportsThinkingBlockBinding`（按模型名子串 opus-4-7/4-8/5、sonnet-5、haiku-5、fable-5，gov-cloud 排除）；而「useBlockBinding 是 pi 内部字段、可从 ctx 读」是错的——它是 bedrock 文件里的局部 const，ctx 读不到，按它写判据会恒判「无绑定」，是一条恒绿判据。②可执行替代：Anthropic 直连路径里有 `providerThinkingLevel: effortMessages ? activeEffort : void 0` 并写进 message，所以 `message.providerThinkingLevel !== undefined ⟺ block_binding 被发出`；该字段在 docs/message-types.md:130 有定义、turn_end 的 event.message 直接可读。但本机 88 个会话 0 命中，**必须用手工正样本测试**，否则恒绿；Bedrock 那条记为未覆盖（不要拿 message.model 猜，那不是 provider 回报的 id）。③escape-guard 不受影响是结构性的：assistant.ts 与 toolResult.ts 只处理 isTextBlock（type==="text"），不碰 thinking，而 drop_block 只管 thinking。④Q1「不改写但记账」够，但要分三类：provider 前缀校验与 signature 非常量是能力边界（记账 skippedByBinding/skippedBySignature + 启动 stderr 一行），只有 `inject.on: true 但 text 为空` 是配置无效（命令输出里报）；拒绝启动代价大于收益，机器判据用 `injected === 0 && text 非空 && red > 0 → 输出一行「配了但一次没注成」`。⑤Q2 模块化重构不值：现在加一个开关 3 行 1 分钟，重构是一次的 6 文件半天；速率上 0.1.0→0.1.8 只加 2 个开关，收不回成本；且 think-sentry 的 MODULES 有价值是因为真按模块分派，escape-guard 的五个 features 是按槽位分派的「槽位+策略」，照抄会得到一层没有分派逻辑的形状。只做 `type Cfg = typeof DEFAULTS` 一行，判据是「删一个键只有一处报错」。⑥Q3 真成对 6 组：red/turns、blocked/redCalls、cooled/(blocked+cooled)、cleaned/turns、opaque/judgeCalls、firstSeen/(firstSeen+repeat)；单边 10 个：judgeCalls（当分母时与 turns 不同源）、injected、judgeErrors、messages、toolResults、blocksRestored、points、savedBytes、skipped、marked。要补两个分母：scanned = points + skippedTotal、candidateBytes = Σ被替换段字节，判据是删掉 scanned 的定义要有一条测试红。两个插件一字节未动，只新增本文件。

