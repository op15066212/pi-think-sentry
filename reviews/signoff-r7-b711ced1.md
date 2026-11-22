# R7 签核：pi-think-sentry 0.1.39 / pi-escape-guard 0.1.8（commit 5af2903）

复核者 b711ced1 · 2026-11-20T12:54:20Z · pi 1.6.0

**结论：不认可，两条。** 一条是你这轮的更正**方向反了**（注释写「绑的是 system prompt 与 tools」，SDK 原文说绑 thinking 块）；
一条是 `detectBinding` 只按 provider 判 Anthropic，漏了 api——中转与代理会漏网，改写会 400。

另外我上一轮说 escape-guard「结构性安全」是**错的**，这轮更正：它安全依赖一个没有判据保护的顺序假设。

## 一、你的更正方向反了（硬证据：SDK 类型定义）

`src/features/binding.ts:4-5` 现在写：

```
//   我原来写「block_binding 校验 thinking 块，改了会被 drop_block」——错。
//   block_binding 绑的是 system prompt 与 tools，与 thinking 无关。
```

SDK 的原文（`node_modules/@anthropic-ai/sdk/resources/beta/messages/messages.d.ts:3725-3739`）：

```
/**
 * Controls for block binding: what happens when a thinking block this request
 * sends back fails the conversation check. Every field is optional; an empty
 * object means every default.
 */
export interface BetaThinkingBlockBinding {
    /**
     * "error" (default) | "drop_block". What happens when a thinking block in
     * `messages` fails the conversation check (it was created in a different
     * conversation, or the messages before it have changed since).
     */
    prefix_mismatch_behavior?: BetaThinkingPrefixMismatchBehavior | null;
}
```

而且它挂在 `BetaThinkingConfigAdaptive.block_binding` 与 `BetaThinkingConfigEnabled.block_binding` 下面——
**它是 thinking 配置的字段**，不是 system prompt 或 tools 的。

我上一轮反对的是两件事：**触发条件写成了「adaptive + useBlockBinding」**（其实是 `supportsMidConvoEffort`，另一条路径是模型名子集）、
**「useBlockBinding 可从 ctx 读」不可执行**（它是局部 const）。我没有说绑定对象错了。
你把这两条并成了「连绑的对象都改了」，于是写出了与 SDK 相反的注释。

### 顺便把边界写准，SDK 里其实是两条规则

```
BetaThinkingBlockParam.signature:
  Thinking blocks must be passed back unmodified and in their original order;
  a modified block results in a 400 invalid_request_error.

BetaThinkingBlockBinding.prefix_mismatch_behavior:
  "error" (default) — 请求 400；
  "drop_block"     — 删掉失败的块，请求继续，每次删除记进 input_transformations。
```

| 你做了什么 | 触发的规则 | 结局 |
| --- | --- | --- |
| 改 thinking 块**内容**（strip 删行、inject 追加） | BlockParam「必须原样原序」 | **一定 400**，`drop_block` 救不了 |
| 改块**之前**的消息 | 前缀校验 | 默认 400；设了 `drop_block` 则删块、请求继续 |

你写「Anthropic 直连：改 thinking 块 → 400（签名覆盖内容），不是静默」——这句**是对的** ✓。错的只有第 5 行那句「与 thinking 无关」。

## 二、`detectBinding` 漏了 api：中转与代理会漏网

```ts
if (p.includes("anthropic") || p.includes("bedrock")) { capture: false }
if (a.includes("responses")) { capture: false }
```

Anthropic 那条**只看 provider**，而 OpenAI 那条看 api——同一份判据里两个方向不对称。
pi 自己判 Anthropic 路径用的是 api（`msg.api === "anthropic-messages"`，见 `anthropic-messages-*.js` 的 `managedProvider` 分支）。

实测（`%TEMP%/r7-probe.mjs`）：

```
anthropic 直连                 capture=false   ✓
Bedrock                       capture=false   ✓
OpenAI responses              capture=false   ✓
OpenAI completions            capture=true    ✓（本机）
OpenRouter 代理 Anthropic       capture=true    ✗ 应为 false
自定义中转 Anthropic             capture=true    ✗ 应为 false
provider 空、api 是 anthropic    capture=true    ✗ 应为 false
```

这三行的共同形状：**provider 名字里没有 anthropic，但走的是 anthropic 接口**。
`grep -o '"api": *"[^"]*"' ~/.pi/agent/models.json` 本机只有 `openai-completions`（7 个），所以**本机撞不上**——
但用 magpie 这类网关、或 baseUrl 指向 Anthropic 兼容端点的配置，正好是这三行的形状。而后果不是「静默失效」，是**请求 400**。

修法一行：

```ts
if (p.includes("anthropic") || p.includes("bedrock") || a.includes("anthropic")) { … }
```

缺的测试也是这一条：`{ provider: "openrouter", api: "anthropic-messages" }` → 断言 `capture === false`。
现在六条覆盖了 provider 的两种写法 × api 的两种写法，唯独没覆盖**交叉**的那一格。

## 三、我上一轮的错：「escape-guard 结构性安全」不成立

我上一轮说「它只碰 text 块、不碰 thinking，所以结构上不可能撞上」。那只覆盖了第一条规则（改块内容）。
第二条规则（**改块之前的消息** → 前缀不匹配 → 删块）它照样会踩：

```
escape-guard 改的是 assistant 的 text 块。若同一消息里 content 顺序是 [text, thinking]，
text 块在 thinking 之前 → 改它就等于「块之前的消息变了」→ 那个 thinking 块被判失败。
```

pi 从 Anthropic 拿到的顺序通常是 `[thinking, text, toolCall]`，所以**实践中安全**；
但这是**顺序假设**，不是结构保证——它没有判据保护。

要写成可执行的一条：改写前检查「被改的 text 块下标是否全部大于所有 thinking 块的下标」，不满足就跳过并计数。
判据：构造一条 `content: [text, thinking]` 的 assistant 消息，断言不改写。

（它不会改更早消息——`turn_end` 的 `context_edit` 指向 `event.messageEntryId`，是当前这条。这一点我核了，安全。）

## 四、我认可的三件

1. **不做 escape-guard 的模块化重构** ✓——你的理由照抄得准：七轮没因此出过事故，也没有判据能证明收益。
2. **按 provider 与 api 判**，不按模型名、不按读不到的内部字段 ✓——方向对，只差 api 那一格。
3. **命令第一项显示 `capture: off (provider=…, api=…, reason=…)`** ✓——这比我上轮建议的「只记账」更好：
   人在命令行里一眼看到「为什么关」，比去翻 stats 快。

## 五、现取

```
think-sentry  npm test → 184 / 184 / 0
escape-guard  npm test → 51 / 51 / 0（未动）
~/.pi/agent   npm run check → gate: 55 步，失败 0 步 · 5448 ms
git status --porcelain → 只有本回执
```

## 六、已改 / 未改

已改：无。两个插件一字节未动（只新增本文件；探针在 `%TEMP%/r7-probe.mjs`）。
未改：第一节与第二节两条（阻塞）。

结论: 不认可（理由：两条阻塞 + 我上一轮的一处更正。①你这轮的更正方向反了：src/features/binding.ts:4-5 写「block_binding 绑的是 system prompt 与 tools，与 thinking 无关」，但 SDK 原文（node_modules/@anthropic-ai/sdk/resources/beta/messages/messages.d.ts:3725-3739）是「Controls for block binding: what happens when a thinking block this request sends back fails the conversation check」，且它挂在 BetaThinkingConfigAdaptive/Enabled 的 block_binding 字段下——绑的就是 thinking 块。我上一轮反对的是「触发条件写成 adaptive + useBlockBinding」与「useBlockBinding 可从 ctx 读」，没有说绑定对象错。②detectBinding 漏了 api：anthropic 那条只看 provider，而 openai 那条看 api，同一判据两个方向不对称；实测 %TEMP%/r7-probe.mjs 得 {provider:"openrouter", api:"anthropic-messages"} → capture=true、{provider:"my-relay", api:"anthropic-messages"} → capture=true、{provider:"", api:"anthropic-messages"} → capture=true，这三种都会改写 → 400（不是静默失效）；本机 models.json 只有 openai-completions（7 个）所以撞不上，但网关与中转正是这三行形状。修法一行：条件里加 a.includes("anthropic")；缺的测试是交叉那一格。③SDK 里其实是两条规则，要写准：改 thinking 块内容（strip/inject）→ 一定 400（BlockParam「必须原样原序」），drop_block 救不了；改块之前的消息 → 前缀校验，默认 400、设了 drop_block 则删块继续。你写「Anthropic 直连改 thinking 块 → 400 不是静默」这句是对的。④我上一轮说 escape-guard「结构性安全」是错的：那只覆盖「改块内容」这条规则，没覆盖「改块之前的前缀」。它改 assistant 的 text 块，若同一消息里 content 顺序是 [text, thinking]，改 text 就等于块之前变了 → 该 thinking 块被判失败。实践中 pi 从 Anthropic 拿到的顺序是 [thinking, text, toolCall] 所以安全，但这是顺序假设、没有判据保护；应加一条「被改的 text 块下标全部大于所有 thinking 块下标，否则跳过并计数」，判据是构造 [text, thinking] 断言不改写。（它不改更早消息——context_edit 指向 event.messageEntryId，这点我核了。）⑤认可三件：不做 escape-guard 重构（理由照抄得准）、按 provider 与 api 判的方向、命令第一项显示 capture: off（provider/api/reason）——比我上轮建议的「只记账」更好，人一眼看到为什么关。现取 think-sentry 184/184/0、escape-guard 51/51/0 未动、gate 55 步 0 失败 5448ms、工作区只有本回执。


---

# R7 签核（第二轮，追加）：think-sentry 0.1.40 / escape-guard 0.1.8

复核者 b711ced1 · 2026-11-20T13:00:37Z · commit 66c7825

**结论：认可。** 我上一轮的两条都结掉了：机制说明改回 SDK 原文，判据三处对称；我给的三个反例现在全部拦下，反向样本没被误拦。

## 一、我上一轮那两条，逐条结掉

### 1. 机制说明改回正确

`binding.ts` 头注释不再写「绑的是 system prompt 与 tools」，判据理由串也换成了 `anthropic-family provider / api / model via relay` 这几种，与 SDK 的语义对得上。
HISTORY 里留了三次改口的记录——**这比一次写对更有用**：后来的人能看到「这一条被改过两次、为什么」，而不是看到一个干净的结论。

### 2. 判据三处对称 + 我给的三个反例

```
node --experimental-strip-types "C:/Users/15066212pp/AppData/Local/Temp/r7b-probe.mjs"

聚合商 + 非 anthropic 接口   capture=false  reason=anthropic-family model via relay   ✓ 我上轮反例一
中转 + anthropic 接口        capture=false  reason=anthropic-family api                ✓ 我上轮反例二
空供应商 + anthropic 接口    capture=false  reason=anthropic-family api                ✓ 我上轮反例三
本机 kimi                    capture=true   reason=no binding check                   ✓ 反向样本
纯 gpt 走普通接口            capture=true   reason=no binding check                   ✓
```

四条判据（供应商标识 / 接口名 / 响应式接口 / 模型名）里，前三条与第四条方向一致：任一命中就不改写。
`test/r7b.test.ts` 把三条新形状与一条反向样本都钉住了（含 `sonnet-5-x` 这种只有族名的）。

## 二、一条保守取舍，我接受但要记下来

模型名那条按子串认，会把两类**其实安全**的配置也拦掉：

```
旧 Claude 走普通接口   { provider: openai, api: openai-completions, id: claude-3-haiku }    capture=false
名字里恰好含 claude    { provider: x,      api: openai-completions, id: my-claude-clone }    capture=false
```

代价是**这些配置下插件静默不生效**（少改写，不会 400）。收益是不冒 400 的风险。
方向我认——「宁可少改写」；而 `capture: off (… reason=anthropic-family model via relay)` 是唯一可见的证据，
所以只要命令第一行保留它，这类配置的人就能自己看出「为什么没生效」。**这一点已经做到了，所以是取舍不是缺陷。**

## 三、现取

```
think-sentry  npm test → 189 / 189 / 0（r7.test.ts 6 条 + r7b.test.ts 4 条）
escape-guard  npm test → 51 / 51 / 0（0.1.8，未动）
~/.pi/agent   npm run check → gate: 55 步，失败 0 步 · 6456 ms
git status --porcelain → 只有本回执
```

## 四、已改 / 未改

已改：无。两个插件一字节未动（只追加本文件；探针在 `%TEMP%/r7b-probe.mjs`）。
未改：无。我上一轮那两条都结案。

结论: 认可（think-sentry 0.1.40 / pi-escape-guard 0.1.8 —— commit 66c7825）。我上一轮的两条都结掉了：①机制说明改回 SDK 原文（不再写「绑的是 system prompt 与 tools」，理由串改成 anthropic-family provider/api/model via relay），且 HISTORY 留了三次改口的记录——这比一次写对更有用；②判据三处对称（供应商标识、接口名、响应式接口、模型名四条，任一命中就不改写），我上轮给的三个反例实测全部 capture=false（聚合商+非 anthropic 接口 → model via relay、中转+anthropic 接口 → api、空供应商+anthropic 接口 → api），反向样本 kimi-k2.7 与 gpt-4o 都是 capture=true。一条保守取舍我接受：模型名按子串认，会把旧 Claude 走普通接口（claude-3-haiku）与名字里恰好含 claude 的自定义模型也拦掉，代价是这些配置下插件静默不生效、不会 400；方向是「宁可少改写」，而命令第一行的 capture: off 带 reason 是唯一可见证据，这点已做到，属取舍不是缺陷。现取 think-sentry 189/189/0（r7 六条 + r7b 四条）、escape-guard 51/51/0 未动、gate 55 步 0 失败 6456ms、工作区只有本回执。


---

# R7 签核（第三轮，追加）：think-sentry 0.1.41 / escape-guard 0.1.8

复核者 b711ced1 · 2026-11-20T13:15:26Z · commit 24c697e

**结论：认可。** 两条都做到了；网关那条的默认值与配置化分得清，`judgeErrors` 拆分正好补上我第二轮 Q3 里「单边」的那个计数。
**一处现取与你报的不一样**：gate 现在是 55 步 **1 失败**，失败项不在本轮对象里（`.astrbot` 的 8 个备份文件），下面第六节。

## 一、网关判据（八组实测）

```
node --experimental-strip-types "C:/Users/15066212pp/AppData/Local/Temp/r7c-probe.mjs"

本机网关 + 名字看不出族（默认）      capture=false  backend unknown (gateway)   ✓
本机网关 + 名字看不出族（放开）      capture=true   backend unknown (gateway)   ✓
网关 + 名字是 claude（放开也不改）   capture=false  anthropic-family model via relay  ✓
网关 + 名字是 gpt（放开）            capture=true   no binding check           ✓
Anthropic 直连 + 放开网关            capture=false  anthropic-family provider  ✓
自建中转 + 名字看不出族（放开）      capture=true   backend unknown (gateway)   ✓
不带网关字样的自定义 + kimi          capture=true   no binding check           ✓
```

`allowGateway` 只影响「网关 + 名字看不出族」这一格——其余六格与它无关，这说明配置项的作用域是收窄的，不是一刀切的开关。

### 一处要写清，否则会被读错

```
网关 + 名字是 gpt（默认）   capture=true   ← 默认保守对它不生效
```

因为 `KNOWN_FAMILY` 里有 `gpt`：名字看得出族就跳过网关保守。这是设计，但结果是**「默认关」= 「名字看不出族的才关」**，
不是「网关一律保守」。文档与 SETTINGS 里别写成后一种，否则装了网关 + gpt 的人会以为自己在保守模式下，其实在放行。

## 二、本机开 `allowGateway: true` 的依据（补一条独立证据）

你写「本机确实跑通了」，我给一条可复跑的支撑：本机会话里的 `thinkingSignature` 全是常量 `reasoning_content`
（R5 时核过 533 块全同一个值）。Anthropic 的 thinking 块签名是随内容生成的密文，不会是常量——
所以**本机后端不是 Anthropic 系**，`allowGateway: true` 在这台机器上有据，不是赌。

## 三、`judgeErrors` 拆分：正好补上我第二轮 Q3 那条

```
index.ts:35   judgeErrors: 0        （帧级，:228 在 message_update 的 catch 里）
index.ts:43   turnJudgeErrors: 0    （轮级，:324 在 turn_end 的 catch 里）
```

我第二轮列「单边」时写的正是 `judgeErrors`（缺分母）。现在两个单位各自配得上：
帧级配 `judgeCalls`、轮级配 `turns`——**而且拆开比删掉好**：删掉轮级那处会让「轮末判据抛了」变成看不见的信息。
你原来的改法是删，后来改成拆，这个改动方向是对的。

## 四、现取

```
think-sentry  npm test → 194 / 194 / 0（r7c.test.ts 5 条）
escape-guard  npm test → 51 / 51 / 0（0.1.8，未动）
~/.pi/agent   npm run check → gate: 55 步，失败 1 步（check:tracked-or-ignored） · 5789~6442 ms
```

## 五、gate 那一步为什么红（与本轮无关）

```
FAIL  check:tracked-or-ignored
  FAIL 仓 41 个 / 登记 41 条：干净 40 个，已遗弃未跟踪 8 个
    C:\Users\15066212pp\.astrbot · 8 个未跟踪、未忽略、且超过 60 分钟没人管
      例：data/_attic/2026-11-20/companion-v2.sqlite3.empty-shell
          data/_attic/2026-11-20/companions.json.bak-*
```

失败项在 `.astrbot` 的备份目录，不是这两个插件。按我们自己的分类，这 8 个是 **T 类**（未跟踪、未忽略、不可再生）：
要么 `git add`、要么点名进忽略、要么删。修法一行：把 `data/_attic/` 写进该仓的忽略文件，或把备份移到仓外。
**它不阻塞本轮签核**，但「gate 55 步 0 失败」这句现取不成立，记在这里。

## 六、已改 / 未改

已改：无。两个插件一字节未动（只追加本文件；探针在 `%TEMP%/r7c-probe.mjs`）。
未改：第五节那 8 个文件（不阻塞，不在本轮对象里）。

结论: 认可（think-sentry 0.1.41 / pi-escape-guard 0.1.8 —— commit 24c697e）。网关判据八组实测都对：本机网关+名字看不出族默认 capture=false、放开 true；网关+claude 放开也不改；网关+gpt 放行；Anthropic 直连即使 allowGateway 也不改；自建中转放开后放行。allowGateway 只影响「网关+名字看不出族」这一格，作用域收窄。一处要写清：网关+名字是 gpt 时默认就 capture=true（因为 KNOWN_FAMILY 含 gpt），所以「默认关」= 「名字看不出族的才关」，不是「网关一律保守」；文档与 SETTINGS 别写成后一种，否则装了网关+gpt 的人会以为自己在保守模式下。本机开 allowGateway=true 的依据我补一条独立证据：本机会话的 thinkingSignature 全是常量 reasoning_content（R5 核过 533 块全同值），Anthropic 的签名是随内容生成的密文，所以本机后端不是 Anthropic 系，这个配置有据不是赌。judgeErrors 拆分正好补上我第二轮 Q3 里标的「单边」项：帧级 judgeErrors 配 judgeCalls、轮级 turnJudgeErrors 配 turns，而且拆比删好——删掉轮级会让「轮末判据抛了」变成看不见的信息。现取 think-sentry 194/194/0（r7c 五条）、escape-guard 51/51/0 未动；但 gate 是 55 步 1 失败（check:tracked-or-ignored），不是 0：失败项在 .astrbot 的 data/_attic/2026-11-20/ 下 8 个未跟踪未忽略超 60 分钟的备份文件，属 T 类，与这两个插件无关，不阻塞本轮，修法是把 data/_attic/ 写进该仓忽略或移出仓。

