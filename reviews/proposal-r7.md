# R7 提案：pi 1.6.0 之后的边界与单例形状

## 一 pi 1.6.0 变在哪（只列与这两个插件有关的）

| 变化 | 影响 |
| --- | --- |
| Breaking：`render()` 返回 `readonly string[]`，Container 返回缓存数组 | **无影响**：两个插件都是事件钩子，不做 TUI 组件 |
| 新增 `block_binding: { prefix_mismatch_behavior: "drop_block" }` | **有影响**：改动过的 thinking 块会被**静默丢弃** |
| 「OpenAI dropped N reasoning items: prefix_mismatch」的交易记录提示 | 同一件事的另一个 provider |
| GPT-6.2 Sol 拒绝 effort `none`/`minimal` | 无影响 |
| `find` 的路径语义改为相对搜索目录 | 无影响（插件不用 find） |

## 二 那个真正的问题：改写可能到不了模型

pi 源码里（`anthropic-messages-*.js`）：

```
params.thinking = { type: "adaptive", display, block_binding: { prefix_mismatch_behavior: "drop_block" } }
```

只在 **adaptive thinking + useBlockBinding** 时出现。含义：provider 校验 thinking 块的**前缀**是否与它自己产出的那份一致，不一致就丢块。

而 pi-think-sentry 干的正是**改 thinking 块**（strip 删行、inject 追加）。于是：

| provider | 改写的结局 |
| --- | --- |
| Anthropic adaptive（新模型） | 块被 drop_block 丢弃 → 模型看不到改写 → **插件静默失效** |
| OpenAI reasoning items | prefix_mismatch 丢弃 + 一条提示 |
| 当前用的（`reasoning_content` 常量签名，如 kimi/deepseek） | 不受影响，改写生效 |

**这不是 bug，是边界。** 上一轮我写「signature 非常量时不改写」，只覆盖了「签名是密文」这一种；
这一轮要知道的是另一种：**签名是常量，但 provider 做前缀绑定校验**。

## 三 格罗滕迪克视角：不可交换处就是它会坏的地方

三个槽位：

```
    改写                provider 校验
thinking ──────► 记录里的 thinking ──────────► 模型读到的 thinking
   │                                              │
   └──────────── 不改写 ──────────────────────────┘
```

- 不改写：右上与下边两条路得到的模型输入**相同**（交换图成立）。
- 改写：只有 provider 不做前缀校验时，两条路才得到相同结果。**校验存在时交换图破裂**。

所以判据不是「改写有没有生效」（没法直接测），是：**这个 provider 的交换图成立吗**。
可判法三条，任一成立就不改写：
1. `thinkingSignature` 不是常量（密文签名，改了必不合）
2. 模型走 adaptive thinking 且 `useBlockBinding`（pi 内部字段，可从 ctx 读）
3. provider 家族属于已知做前缀校验的那类（Anthropic / OpenAI reasoning）

## 四 要改的四件事

| # | 改什么 | 判据 |
| --- | --- | --- |
| 1 | 加「块绑定检测」：命中就**不改写**，但**照旧记账**（`skippedByBinding`），并在原因里写清 | 构造一个 signature 为密文的 message → 改写返回原文，stats 里多一条 |
| 2 | escape-guard 的模块化改成与 think-sentry 同一形状（MODULES + 模块自带 defaults） | 加一个开关只改一个文件；`grep` 证明 Cfg 类型不再手写 |
| 3 | 两个插件的 `stats` 统一成「成对出现」：每个分子配一个同源分母 | 删掉任一分母 → 有测试红 |
| 4 | 文档写清这条边界（哪些 provider 改写有效） | README 有一节，且与代码里的判据一一对应 |

## 五 要三方回答

1. 第 1 件里「不改写但要记账」是否够？还是应该**拒绝启动**（配置里写了 inject.text 却不生效，是否该报错）？
2. escape-guard 的模块化重构值不值得做？（它现在只有 5 个开关，重构会动 6 个文件）
3. `stats` 成对这条：两个插件现有 20 多个计数，哪些是真成对的、哪些是单边数了？

## 六 我不再声称的

- 不再说「改写一定到得了模型」——它取决于 provider 是否做块绑定校验。
- 不再说「signature 非常量就够了」——那只是一种，另一种是常量签名 + 前缀校验。