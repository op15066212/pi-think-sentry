# R7 共识：我把 block_binding 讲错了，真正的边界是另外两条

## 一 我错在哪

| 我说的 | 实际 | 谁驳的 |
| --- | --- | --- |
| `block_binding` 校验 thinking 块，改了会被丢 | 它绑的是 **system prompt 与 tools**（`bedrock-converse-stream.js:1052`），改 thinking 不触发 | 6e8dd769 |
| `useBlockBinding` 可从 ctx 读 | 它是 bedrock 文件里的**局部 const**，ctx 读不到；按它写判据会恒判「无绑定」= 恒绿 | b711ced1 |
| 触发条件是模型名含 opus-4-7 等 | 那是 **Bedrock** 的路径；Anthropic 直连是 `model.compat.supportsMidConvoEffort === true && !thinkingDisabled`，与模型名无关 | b711ced1 |
| 本机不受影响因为「签名是常量」 | 真实原因是本机走 **openai-completions**，而 prefix_mismatch 那套在 **responses**（`openai-responses-shared.js:715-722`，GPT-6.2+） | 6e8dd769 |

**这三条合起来说明：我拿一个讲错的机制去论证一个真实存在的边界。** 边界在，理由不对。

## 二 真正的边界（两位给的）

| provider 路径 | 改 thinking 的结局 | 判法 |
| --- | --- | --- |
| Anthropic 直连 | **400**（签名覆盖内容），不是静默 | `provider` 家族 |
| Anthropic Bedrock（adaptive + 块绑定） | thinking 不受绑定影响；system/tools 才受 | 与改写无关 |
| OpenAI responses（GPT-6.2+） | 静默移除 reasoning item，`reason=prefix_mismatch` | API 是 responses |
| OpenAI completions（本机） | 不受影响 | API 是 completions |

**可执行判据只有一条**：按 **provider/API** 判，不按模型名、不按 ctx 里读不到的内部字段。

## 三 要做的三件事（砍掉两件）

| 做不做 | 事 | 理由 |
| --- | --- | --- |
| **做** | 块绑定/签名检测：命中 Anthropic 直连或 responses 时**不改写**，改记账 + 命令第一行可见 `capture: off (provider=…, reason=…)` | 两位都要求「可见」，不是拒绝启动 |
| **做** | stats 逐键配对（A 给了清单） | 单边计数的数读不出任何东西 |
| **不做** | escape-guard 的模块化重构（MODULES + defaults，动 6 个文件） | 两位都反对：七轮没因此出过事故，没有判据能证明收益。**加戏。** |
| **不做** | 用 `providerThinkingLevel !== undefined` 当判据 | B 提了它可用，但本机 88 会话 0 命中 → 必须手工正样本，否则恒绿。记为未覆盖 |

## 四 判据（每条都要能红）

| 断言 | 坏样本 |
| --- | --- |
| Anthropic 直连不改写 | 构造 `provider: "anthropic"` 的 ctx → 改写返回原文，`skippedByBinding` +1 |
| responses 不改写 | 构造 `api: "responses"` → 同上 |
| completions 照旧改写 | 构造 `api: "completions"` → 改写生效 |
| 命令第一行可见 | 命中时 `think-sentry` 输出以 `capture: off (` 开头 |

## 五 我不再声称的

- 不再说 `block_binding` 与 thinking 有关——它绑 system prompt 与 tools。
- 不再说「本机安全是因为签名是常量」——是因为走 completions。
- 不再把 escape-guard 的模块化当成本轮任务。