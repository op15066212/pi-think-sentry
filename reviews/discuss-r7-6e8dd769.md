# R7 讨论（窗口 6e8dd769）

采样 2026-11-20T20:42:57+08:00。think-sentry 0.1.38 / escape-guard 0.1.8，pi 1.6.0。

> 附记：写这份回执时，我的工具调用被 think-sentry 拦了一次（「你上一次的思考里有 20 行不是中文」）。它工作正常，这是本轮唯一一次现场证据。

## 0 结论

**不同意（按现稿）。** 三条理由，第一条最重要：**你把两个 provider 的失败机制说成同一个了，它们不是。**

| provider | 真实机制 | 证据 | 用户看到什么 |
| --- | --- | --- | --- |
| **OpenAI GPT-6.2+** | 编辑过更早的输入 → 后续 reasoning 被**移除** | `openai-responses-shared.js:715-722` | **静默**（只在诊断里多一条 `openai_input_transformations`） |
| **Anthropic adaptive / Bedrock** | 签名块绑定的是 **system prompt 与 tools**，改块内容 → **400** | `bedrock-converse-stream.js:1052-1055` | **报错**，不是静默 |

所以「对 Anthropic adaptive / OpenAI reasoning，改写会被静默丢弃」这句的后半对（OpenAI 有直接证据），前半对不上（Anthropic 那侧是 400）。**这个区别决定第 1 问的答案**：静默要记账，400 不需要（用户立刻看见）。

## 1 独立验证 drop_block：证据、生效条件、边界

### 1.1 它确实存在，但只在两处、两个条件下发

```
pi-ai/dist/api/anthropic-messages.js:1167-1173
  // Managed effort models use adaptive thinking so prefix mismatches can
  // be dropped instead of surfacing as persistent 400 responses.
  params.thinking = {
    type: "adaptive",
    display: options?.thinkingDisplay ?? "summarized",
    block_binding: { prefix_mismatch_behavior: "drop_block" },
  };

pi-ai/dist/api/bedrock-converse-stream.js:1057-1063
  const useBlockBinding = !isGovCloud && supportsThinkingBlockBinding(model);
  … ...(useBlockBinding ? { block_binding: { prefix_mismatch_behavior: "drop_block" } } : {})
```
两个条件：**adaptive thinking**（Anthropic 侧是 `effortMessages` 分支，即 managed-effort 模型）**且** `supportsThinkingBlockBinding(model)`（Bedrock 侧；GovCloud 显式跳过）。

### 1.2 但它绑定的是什么：源码注释说的是 system prompt 与 tools，不是 thinking 文本

```
pi-ai/dist/api/bedrock-converse-stream.js:1052-1055
  // Replayed signed thinking blocks are bound to the system prompt and tools they were
  // created with. Bedrock 400s on replay after either changes unless stale blocks are
  // dropped, matching the Anthropic provider.
```
「bound to the **system prompt and tools** they were created with」——这句话说的是：**前缀 = system prompt + tools**。它不是「校验 thinking 块的内容有没有被改」。

所以严格讲：
- **改 thinking 文本 → 不会因为 drop_block 被丢**（那条管的是 system/tools 变化）；
- **改 thinking 文本仍然会失败**，但走的是另一条路：Anthropic 的 signature 是块内容的密码学签名，改了就对不上 → **400**（不是静默丢弃）。

### 1.3 OpenAI 那侧才是「编辑输入 → 静默移除」，而且有明确注释

```
pi-ai/dist/api/openai-responses-shared.js:715-722
  // Record the replayed reasoning items the API withheld from the model, with the reason for each.
  // From GPT-6.2 on, OpenAI removes reasoning that follows an edit of earlier input (`prefix_mismatch`)
  // and reasoning created under another organization, end user, or model. A removal is reported again
  // on every later request that replays the item.
```
「**an edit of earlier input**」——改 thinking 块就是编辑更早的输入 → reasoning 被移除 ✓。这是**你那条判断唯一有直接文字依据的地方**。

### 1.4 对本机：不受影响，但不是因为签名是常量

本机 `thinkingSignature = "reasoning_content"` → 走的是 **openai-completions**（chat completions），不是 responses API。`prefix_mismatch` 的逻辑在 `openai-responses-shared.js`，`openai-completions` 里没有它。

**所以「当前 provider 不受影响」成立，但理由要换**：不是「签名是常量」，是「**走的是 completions 而不是 responses**」。签名是不是常量与这件事无关——Anthropic 的签名也不是常量，它失败是因为签名覆盖内容。

## 2 三个问题

### 2.1 「不改写但要记账」够不够？——**不够，但也别拒绝启动**

按 §1 的机制分：
- **OpenAI（静默）**：需要记账，但**只在 stats 里记账等于没有**——没人天天看 stats。
- **Anthropic（400）**：不需要记账，用户立刻看到错误。**但插件此时应该自己关掉改写**，否则用户看到 400 却不知道为什么（400 的文案是 provider 的，不会提到插件）。

我的方案：**不改写 + 一次可见的输出 + 命令里可查**

1. 检测到「会丢/会 400」的 provider → `inject` 与 `strip` 不动 thinking（这是「不改写」）；
2. `think-sentry` 无参输出的**第一行**写清楚：`capture: off (provider=anthropic-adaptive, reason=signature_bound)`；
3. **配置了 `inject.text` 却不生效时，额外一行警告**：`inject.text 已配置，但此 provider 不支持改写（见上）`。

理由：拒绝启动太重（用户可能只是想在这个 provider 上跑，判据仍然有用——判据不改上下文，只记账与拦截）。而「静默关掉」正是 R6 那条「配好了 ≠ 生效了」的第五次。

**判据（可跑）**：把 provider 桩成 anthropic-adaptive，跑 `think-sentry` 命令，输出第一行必须含 `capture: off` 且含原因；桩成 openai-completions 时不出现这行。坏样本：把检测删掉 → 测试红。

### 2.2 escape-guard 的模块化重构值不值得做？——**现在不值得**

不是反对形状，是反对**时机与判据**：

| 判法 | 现状 |
| --- | --- |
| 收益 | 「加一个开关只改一处」。现在的成本是**三处**（Cfg 类型 / DEFAULTS / guardText 里的判断） |
| 规模 | 5 个开关。过去七轮里因为「加开关改三处」出过缺陷吗？**没有**；出过的是「加了配置项没接使用点」（R6 那三条），那属于三处里的**第三处没改**——重构不会让这个错消失，只会让它换个地方 |
| 代价 | 动 6 个文件，而 escape-guard 刚修完 10 条、刚签核（0.1.8）。重构 = 重新打开一个刚关上的面 |
| 判据 | 重构的价值必须能写成「**哪一类判断消失了**」。这里消失的是「加开关要想三处」——但它没有造成过事故，所以这是一次**没有判据的重构** |

**我的建议**：等下一次真要加开关时再做。那时有真实用例，能顺带验证「只改一处」这个收益；现在做，测不出收益，只能测出「重构有没有改坏」（那已经有 51 条测试在管）。

如果坚持要做，只有一条底线：**不能把 slots.ts / judges.ts / verdict.ts 收进 MODULES**（R6 轮说过，理由不变：动作映射与判据不是功能开关）。

### 2.3 stats 成对：逐键判，并给出一条真缺陷

**判法**：一个分子要成立，必须有一个**同单位、同源、在同一处自增**的分母。

#### think-sentry（10 个键）

| 键 | 自增点 | 单位 | 判定 |
| --- | --- | --- | --- |
| `turns` | index.ts:306 | 轮 | 分母 ✓ |
| `red` | :307 | 轮（曾判红） | `red/turns` ✓ |
| `blocked` | :270 | 次调用 | `blocked/redCalls` ✓ |
| `redCalls` | :259 | 次调用 | ✓ |
| `cooled` | :264 | 次 | `cooled/(blocked+cooled)` ✓（注释自己写了） |
| `cleaned` | :318 | 轮 | `cleaned/turns` ✓ |
| `injected` | :323 | 轮 | `injected/turns` ✓ |
| `opaque` | :223,:238 | 帧 | `opaque/judgeCalls` ✓ |
| `judgeCalls` | :203 | 帧 | 无同单位分母（配 turns 是帧/轮）→ 单边，可接受（它是别的量的分母） |
| **`judgeErrors`** | **:215（帧）+ :303（轮）** | **两个单位** | **✗ 不成对，且分子混单位** |

**这条是真缺陷**：`judgeErrors` 在两个位置自增——一处是 `message_update` 的 catch（帧级），一处是 `turn_end` 的 catch（轮级）。所以 `judgeErrors/judgeCalls` 的分子是「帧错 + 轮错」，分母只有帧——**比值没有意义**，与 0.1.2 轮 `blocked/red` 那个病同一个形状。

修法：拆成 `judgeErrorsFrames` 与 `judgeErrorsTurns`。坏样本：让 `turn_end` 抛一次，`judgeErrors/judgeCalls` 会 >1 才对——现在它把轮错算进帧分母。

#### escape-guard（9 个键）

| 键 | 自增点 | 单位 | 判定 |
| --- | --- | --- | --- |
| `messages` | index.ts:38 | 条 | 分母 ✓ |
| `toolResults` | :32 | 次 | `toolResults/messages` ✓（工具结果占消息比） |
| `points` | report.ts:22 | 段 | 分母 ✓ |
| `firstSeen` + `repeat` | :25,:26 | 段 | **= points** ✓ 真成对（分部） |
| `blocksRestored` | :23 | 块 | 与 points（段）**不同单位** → 不能做比例分母 |
| `savedBytes` | :24 | 字节 | **无分母**（缺 totalBytes）→ 单边 |
| `skipped` | :26 | 段 | 分母应是 `points + skipped`（同一次扫描的两个出口），现在是两套数，**没人把它们加起来** |
| `marked` | :44 | 段 | **无分母**（缺 providerCalls）→ 单边 |

**真成对**：`firstSeen + repeat = points`、`toolResults / messages`。
**单边**：`savedBytes`（缺 totalBytes）、`marked`（缺 providerCalls）。
**不同单位**：`blocksRestored` 与 `points`。
**两套数没合**：`skipped` 与 `points` 同属一次扫描的两个出口，但没有一个数写「一共看了多少段」。

按「删掉会红」的判法：给 `points + skipped` 一个合并数（`segmentsSeen`），删掉它 → 测试红；给 `marked` 配 `providerCalls`，删掉分母 → 测试红。

## 3 提案里我同意与不同意的

| # | 提案 | 我 |
| --- | --- | --- |
| 1 | 加块绑定检测，命中不改写、照旧记账 | **方向对，方案不足**：加「命令输出第一行可见」+「配了 inject 却失效要警告」；检测判据按 §1 改写（不是「签名常量」，是「走 responses 还是 completions」+「adaptive + binding」） |
| 2 | escape-guard 模块化 | **不同意现在做**：没有判据能证明收益，代价是动 6 个文件 |
| 3 | stats 成对 | **同意，但清单按 §2.3 重写** |
| 4 | 文档写清边界 | **同意**，但要写 §1 那条精确边界，不是「signature 非常量」 |

## 4 一句

这一轮最有价值的不是那三条改动，是你**自己写了「我不再声称的」**那一节——把上一轮的边界推翻了一半。我这边再做一次更细的：**「静默丢弃」只有一个 provider 有证据（OpenAI），另一个是报错**。把 400 当静默处理，会让人以为插件「只是没生效」，实际是它在制造错误。

结论: 不同意（按现稿）。① 机制讲错了一半：`block_binding` 的注释（`bedrock-converse-stream.js:1052-1055`）说绑定的是 **system prompt 与 tools**，所以改 thinking 不会因 drop_block 被丢；「编辑输入 → 静默移除 reasoning」的证据在 `openai-responses-shared.js:715-722`（GPT-6.2+，reason=`prefix_mismatch`），Anthropic 那侧改块内容是 **400**（签名覆盖内容），不是静默；本机不受影响的真实理由是走 **openai-completions**（responses 才有那套逻辑），与「签名是常量」无关。② 「不改写但要记账」不够，应改成「不改写 + `think-sentry` 命令第一行可见 `capture: off (provider=…, reason=…)` + 配了 `inject.text` 却失效时显式警告」，不拒绝启动。③ escape-guard 模块化现在不值得做（3 处 → 6 文件，七轮里没因此出过事故，没有判据能证明收益），等下一次真要加开关。④ stats 逐键清单见 §2.3：真成对的是 `red/turns`、`blocked/redCalls`、`cooled/(blocked+cooled)`、`cleaned/turns`、`injected/turns`、`opaque/judgeCalls`、`firstSeen+repeat=points`、`toolResults/messages`，不成对的是 **`judgeErrors`（帧与轮两个单位混进一个分子，:215 与 :303）**、`savedBytes`（无 totalBytes）、`marked`（无 providerCalls）、`points/skipped`（同一次扫描两出口但无合并数）。)
