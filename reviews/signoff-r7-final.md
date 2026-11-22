# R7 最终签核：pi 1.6.0 之后的一轮

对象：
- pi-think-sentry **0.1.41**（commit 24c697e）
- pi-escape-guard **0.1.8**（未动）

## 三方结论

| 方 | 结论 |
| --- | --- |
| 提出方 | 认可（本文件） |
| b711ced1 | 认可（think-sentry 0.1.41 / escape-guard 0.1.8） |
| 6e8dd769 | 认可（think-sentry 0.1.41 / escape-guard 0.1.8） |

## 现取

    think-sentry   npm test 194/194/0
    escape-guard   npm test 51/51/0
    gate           55 步 0 失败
    工作区          干净

## pi 1.6.0 带来的

| 变化 | 影响 |
| --- | --- |
| Breaking：组件 render() 返回 readonly string[] | 无影响：两个插件都是事件钩子，不做 TUI |
| block_binding（adaptive thinking） | 有影响：绑 thinking 块，Anthropic 家族改块会 400 |
| OpenAI responses 的 prefix_mismatch | 有影响：静默移除 reasoning item |
| GPT-6.2 拒绝 effort none/minimal | 无影响 |

## 这一轮做的

新增 `src/features/binding.ts`，四条判据（**对称**，provider、api、模型名都看）：
1. provider 含 anthropic / bedrock
2. api 含 anthropic / bedrock
3. api 含 responses
4. 模型名含 anthropic/claude/opus-4-7/opus-4-8/opus-5/sonnet-5/haiku-5/fable-5

第五条是取舍，放配置不放常量：**网关类 provider 且模型名看不出族 → 默认不改写**，
配置 `binding.allowGateway` 可放开。本机是网关，所以 settings.json 里写了 true。

命中就只记账不改写（`skippedByBinding`），并且 `think-sentry` 命令第一项就是
`capture: on|off (provider=…, api=…, model=…, reason=…)`。

## 这一轮我错了三次，机制改了三次口

| 版本 | 我说的 | 对错 |
| --- | --- | --- |
| 提案 | block_binding 校验 thinking 块 | **对** |
| consensus | 绑的是 system prompt 与 tools | **错**：把 bedrock 的实现注释当成了字段语义 |
| 0.1.40 | 改回「绑 thinking 块」，引 SDK 原文 | 对 |

三位（我 + 两位复核）在这条上各错过一次，最后靠 SDK 的 JSDoc 定案：
「what happens when a thinking block this request sends back fails the conversation check」。
**判机制要读类型定义，不要读实现注释。**

## 另一条被两位逼出来的

「判据要对称」：原来 anthropic 只看 provider、openai 只看 api，方向不一致，
于是聚合 provider（openrouter、自建中转、magpie）全漏。现在四处看齐。

## 没做的

- escape-guard 的模块化重构：两位都反对——七轮没因此出过事故，没有判据能证明收益。
- 用 `providerThinkingLevel !== undefined` 当判据：本机 88 会话 0 命中，会变成恒绿。记为未覆盖。
