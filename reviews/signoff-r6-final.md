# R6 最终签核：两个插件，三方认可

对象：
- pi-think-sentry **0.1.38**（commit aaf0287 之前的一次提交）
- pi-escape-guard **0.1.8**（commit aaf0287）

## 三方结论

| 方 | 结论 | 文件 |
| --- | --- | --- |
| 提出方 | 认可 | 本文件 |
| b711ced1 | 认可（escape-guard 0.1.8 / think-sentry 0.1.38） | reviews/signoff-r6-b711ced1.md 末行 |
| 6e8dd769 | 认可（escape-guard 0.1.8 / think-sentry 0.1.38） | reviews/signoff-r6-6e8dd769.md 末行 |

## 现取

    think-sentry   npm test 178/178/0
    escape-guard   npm test 51/51/0
    gate           55 步 0 失败
    工作区          干净

## 这一轮改了什么

**防止自我模仿的判据（两个插件共用一条）**：

> 插件写进上下文的每个字符串，每一处与原文的差异都必须指得到一段原文区间。

| 输出 | 差异 | 判 |
| --- | --- | --- |
| escape-guard 的还原文本 | 每个替换 = 一个段的解码 | 通过（指得到 seg 区间） |
| inject 的附注 | 原来是自造句 + 复制原文 | 改成**指针**（第几行、重复几次、占比） |
| strip 的删空守护 | 原来是固定句「（这一段的重复行已删除）」 | 改成 `[原第 a-b 行共 N 行，全部重复已删]` |
| SAY_LANG / SAY_BLOCK | 自造句 | 无样本（27 块逐块核实全是人类讨论），记录不改 |

**为什么不是「引用原文」**：引用 = 把英文再复制一份进上下文 = 让模型多读一次英文样本。指针指得到、不复制，两件事同时满足。这条是 b711ced1 提出的，我原提案方向相反。

**配置化**：只搬「改了有意义、不会让判据恒绿」的。
think-sentry：`intercept.cooldown`、`intercept.boundaryMinExempt`；escape-guard：`bodyCjk`、`maxPerSession`。
**不搬**：FENCE_RE / INDENT_RE / SEG / ASSIGN（结构判据）、`lang.minDigits` / `lang.lineChars`（改了恒绿）。

## 这一轮真正学到的一条

**「加了配置项、没接使用点」是最隐蔽的一类缺陷。** 六轮里有五处是同一个形状：
`boundaryMinExempt` 加了但判据还用常量、`maxPerSession` 加了但单例无参、`provider.ts` 缺 `bodyCjk` 四次、
`intercept.defaults` 没有那个键。

测试全绿、代码看着对，但线上不生效。判法只有一条：**改配置，看行为变不变**。
所以每处接线都配了「配置改了行为要变」的测试，escape-guard 那条是端到端（走真 install，不走类）。

## 我这一轮错的三次

1. 认定拦截文案违规 → 6e8dd769 用 27 块逐块核实，无样本。
2. 说「6e8dd769 上一轮已认可」 → 它当时是不认可，我只读了 grep 的第一行。
   判据：**看文件的最后一行，不是自己记住的那句。**
3. 读 `inject.ts` 看到 `ev?.cjkOverCjkLatin`，以为源码坏了，改两次都没改对——
   磁盘上是对的，那是读取层遮蔽。判法：打印 charCode。**看到的是输出，不是输入。**

## 未动（写进文档，不假装）

- SAY_LANG / SAY_BLOCK 仍是固定句：有风险、无样本，改了是加戏。
- escape-guard 的 C3d 洞（一行两个汉字洗白代码）、离线验收器与运行时对 fixtures 的差异（DESIGN §2/§8）。
- 载荷里可能出现的 `{{…}}` 被读取层遮蔽：不影响运行，但会让读代码的人误判（本轮第 3 条）。
