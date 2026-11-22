# R6 提案：防止自我模仿 + 配置化 + 模块化单例

两个插件都要做同一件事：**插件自己写进上下文的文本，不能是可复制的固定句式。**

## 一 先把「自我模仿」定义成可判据

模型会照抄它读到的任何东西。所以威胁面不是「它会想」，是「上下文里有什么可抄」。

| 写进上下文的文本 | 谁写的 | 可抄吗 | 现状 |
| --- | --- | --- | --- |
| thinking | 模型 | 可以 | pi-think-sentry 用 inject 追加附注（引用它自己的英文行） |
| 工具结果 | 工具 | 可以 | pi-escape-guard 只做解码替换，不新增文本 |
| **拦截文案** | **插件** | **可以** | **固定句式，读 22 次就会被抄——这一条没处理** |
| 配置文件 | 人 | 可以 | 不进上下文 |

**判据（可执行）**：插件写进上下文的每个字符串，必须满足至少一条：
1. 是从原文截取或解码得到的（引用式），不是它自己造的句子；
2. 是模板，且模板里至少有一个占位符来自当次对话（每轮唯一）。

两条都不满足 = 固定句式 = 可被抄。判法：把插件所有输出字符串跑一遍，含占位符的集合记 O，不含的记 F；F 必须为空。

## 二 现在违反这条的地方

| 位置 | 内容 | 违反 |
| --- | --- | --- |
| pi-think-sentry `intercept.ts` SAY_BLOCK | 「这次工具调用没有执行。你上一次的思考里，同一行出现了 N 次：…」 | 只有数字是变量，句式固定 |
| pi-think-sentry `intercept.ts` SAY_LANG | 「…有 N 行不是中文。用中文重写这几行，然后重新调用工具。」 | 同上，且「用中文重写」这句被抄过一次（用户截图里模型写过 Keep thinking pure Chinese） |
| pi-escape-guard | 无对模型说的句子 | 不违反 |

修法：两句都改成模板，**引用模型自己写的那几行**，并允许从配置里换模板。

## 三 配置化：只搬「用户会想改且有值域」的

判法三条，缺一不搬：
1. 改它有意义（不是结构判据）；2. 值域可穷举或可夹住；3. 改了不会让判据变成恒绿。

**pi-think-sentry 要搬的**：

| 常量 | 现在 | 配置键 | 值域 |
| --- | --- | --- | --- |
| LANG_MIN_DIGITS | 100 | `lang.minDigits` | >= 0 整数 |
| isTarget 的 5 | 5 | `lang.lineChars` | >= 1 整数 |
| BOUNDARY_MIN_EXEMPT | 3 | `boundary.minExempt` | >= 1 整数 |
| SAY_LANG / SAY_BLOCK | 固定句 | `intercept.langText` / `intercept.blockText` | 模板，必须含占位符 |
| 冷却开关 | 无 | `intercept.cooldown` | true/false |

**不搬**：FENCE_RE、INDENT_RE（结构判据，改了判据就废）、MIN_FLOOR（安全地板）、DUP_MIN/STRIP_MIN（已有配置）。

**pi-escape-guard 要搬的**：

| 常量 | 现在 | 配置键 | 值域 |
| --- | --- | --- | --- |
| BODY_CJK | 2 | `bodyCjk` | >= 0 整数 |
| MAX_PER_SESSION | 5000 | `seen.maxPerSession` | >= 0 整数 |
| FIXTURE_DIRS | 3 个名 | `skipFixtures.dirs` | 字符串数组 |

**不搬**：SEG、ASSIGN、CJK_CHAR（结构判据）。

## 四 模块化单例：两个插件同一个形状

pi-think-sentry 已经有 `MODULES = [intercept, dup, lang, strip, inject]`，配置从各模块的 defaults 拼。
pi-escape-guard 现在是散装的 config.ts（一个 Cfg 类型 + DEFAULTS 对象），**改成同样的形状**：

```
features/toolResult.ts  { name, defaults, configure }
features/assistant.ts   同上
features/provider.ts    同上
features/scanOp.ts      { name: "scan", defaults: { threshold, bodyCjk, strict, ratio } }
features/seen.ts        { name: "seen", defaults: { maxPerSession } }
features/report.ts      { name: "report", defaults: { on: true } }
```

理由不是对称好看，是**加一个功能不该改三个地方**：现在 escape-guard 加一个开关要改 Cfg 类型、DEFAULTS、guardText 里的判断。

## 五 判据（每条都要能红）

| 断言 | 判据 | 坏样本 |
| --- | --- | --- |
| 没有固定句式 | 遍历插件所有输出字符串，不含占位符的集合 F 为空 | 把 SAY_LANG 改回固定句 → F 非空 |
| 模板必须有占位符 | 配置里 langText 不含 {{…}} 时拒绝启动并报错 | 填 "请用中文" → 报错 |
| 常量真的搬了 | 改配置项后行为变（不是读了没用） | 改 `lang.minDigits=99999` → 所有块不因块级判红 |
| 不搬的不该出现 | 结构判据不在配置文件里 | 配置文件加 fence 键 → 测试红 |

## 六 要三方回答

1. 拦截文案要不要彻底改成「只引用、不劝告」？（劝告句「用中文重写这几行」本身可被抄）
2. 配置化的边界：`lang.lineChars`（5）这种从数据里拟合出来的数，该不该让用户改？改了判据就失真。
3. escape-guard 要不要也加一条「输出不含自造文本」的运行时判据（每个替换都验 `replacement(text)` 可逆），还是只在测试里验。