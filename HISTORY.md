# 历史

## 0.2.1 · 2026-11-25 · 签名清理：幂等 + 增量

**一 事故：会话撑到 377MB，pi 1ms 就失败。**

2026-11-24T13-53-44 那个会话 133,092 行 / 377.6MB，其中 131,698 条是 `context_edit`：
478 个目标，平均每个被重写 275 次。pi 构建 prompt 与压缩时报 `Maximum call stack size exceeded`。

根因不是「清得不干净」，是**清完了还清**。`context_edit` 不改原始 entry
（pi `docs/session-format.md`：raw history 不变），于是「这条还有签名吗」对已清过的目标
永远为真，每轮 `turn_end` 再写一条一模一样的编辑。增长 `O(轮数 × 过期条目数)`。

**二 幂等：看最后一条 edit，不看原始 entry。**

修法一行：该 target 最后一条 `context_edit` 的 `replacement.content` 里已无
`thinkingSignature` 就跳过。`replacement = null`（整条从上下文省略）不算已清。

判据 `test/signature.test.ts` 15 条。变异（删掉 `alreadyClean` 那行）→ 幂等与新条目两条红。

**三 增量：水位停在过期区右端。**

幂等之后第二轮起产出恒为 0，全量扫是白扫。水位记「上一次的边界」，只处理 `[水位, 本次边界)`。
首轮水位 0 就等于全量，所以「0」与「未初始化」是同一件事，不需要额外的标记位。

实测 26,000 条（2026-11-25T09:05Z，连跑三次取区间）：首轮 1.5–1.9ms，
稳态 0.0003–0.0005ms，每轮新增 1 条 0.001–0.003ms。差三个数量级。

判据 `test/signatureIncremental.test.ts` 5 条：首次等价全量、逐轮累计等于一次全量、稳态 0、
过期区扩大补清、真实会话前 400 条等价。

删掉 `Math.min(state.boundary, boundary)`：三种变异都不改变行为，是等价变异，留着只多一处能写错的地方。

**四 幂等成了通用判据，不只管签名。**

`test/idempotence.test.ts` 盯的是更宽的一条：**两个插件里每个改内容的地方，第二遍必须不再改。**
签名只是第一处被查出来的。

**五 为什么这一条不是防御。**

它不挡「复核方构造的样本」，挡的是一件真发生过的事：一个 377MB 的会话让 pi 起不来。
按 lean-kernel 第三条——新增一条规则，先说它挡的是哪次已发生的事故。

## 0.2.0 · 2026-11-23 · 判据二第三次重构：从「匹配形状」改成「测结构性质」

**一 两次被绕过，两次都是按形状写判据。**

| 版本 | 口径 | 怎么被绕过 |
|---|---|---|
| v1 `dup` | 同一行出现 >= 4 次 | 模型把重复压进一行：`ok。ok。ok。…`（一行 37 个） |
| v2 `inline` | 同一句**连续**出现 >= 4 次 | 模型改成交替 `跑。ok。跑。ok。`，以及「换词不换结构」`执行。ok。/ 好。执行。ok。` |
| v3 坍缩 | 任意连续区间内 `uniq/len <= 1/4` 且 `len >= 12` | —— |

v3 覆盖前两版的特例：连续 37 句 uniq=1、交替 AB uniq=2、换词不换结构 480 句 uniq≈10。
真实数据：23 段真退化全红（最长 480 句），5 条正常文本零误判，12 段含 ok 但 ratio 58%~70% 的正常思考不判。

**二 类型：Verdict 改成依赖和类型。**
旧形状 `kind × rule` 两条正交轴，`strip×lang` 这类组合靠 parse 的 if 链在运行时挡。
新形状 `Verdict = Σ(k : Kind). EvOf(k)`、`RuleOf : Kind → Set Rule`：
「strip 配 inline」不是被检查掉，是写不出来。`fold` 独立成构造子（行内折叠 vs 整行删除是两个动作）。
消费点用 `switch + assertNever`：加构造子漏改一处 → tsc 报错。

**三 三个函数、两个出口（此前混淆）。**
`judgeThinking` 判、`strip.clean` 处置、`intercept.reason` 拦。
删除在 `turn_end`（改上下文），拦截在 `tool_call`（拒副作用）。

**四 处置改成「折到不红为止」。**
此前只处置「最后一帧的判决」，两条路会漏：一轮里两段不相邻、退化后补一句正常话洗白。
现在循环：判 → 处置 → 再判，预算 5 轮（实测 1 轮即干净）。

**五 兜底与边界。**
- 折叠按 `ev.line..ev.lineTo` 整段替换（不按句子正则，那会误删区间外同句）。实测 1410 → 142 字节。
- 区间两端收缩：首尾若在区间内只出现一次，还给原文（否则会吞掉相邻正常行）。
- 注入文案不计入统计，否则「判红 → 注入 → 提醒被当成重复 → 再判红」自锁。
- 中断的轮次不介入（`outcome !== completed` 跳过）：改写一条本该丢弃的消息有害。
- 只有 `tool_call` 拦，纯文本轮没有拦截点；兜底是 `turn_end` 的折叠。
  不改成「整轮都拦」：模型改好了也逃不掉，实测它的反应是找绕过而不是改（R11 用台账数据推翻过）。

**六 空帧洗白判决（「为什么没拦截」的直接答案）。**
现象：判据判红了，工具调用照样执行。台账：某会话 red=790 / blocked=7。
根因：模型写完思考要调工具，那一帧 `thinkingOf()` 返回空串，`judgeThinking("")` 得 none，
**覆盖掉上一帧的判红**，于是 `tool_call` 查到的判决是干净的。
修法：空 thinking 不更新判决（trace 记 `empty-keep`）；清空判决只留一个点——`before_agent_start`。
两个清空点必然分叉，所以只留一个。
判据：`test/empty-frame.test.ts`（2 条）。

**七 代码指纹（判「跑的是哪一版」）。**
用户三次问「为什么没拦住」，其中一次的真实情况是「改了没重启」——那时没有任何东西能看出来。
`boot` 日志与 `/think-sentry` 现在都带四个核心文件的 mtime：加载时记一次，查时再读盘，
不一致即 `code.stale: true`。版本号是手写字符串，改代码不改版本号分不出来，所以另记指纹。

**八 端到端：拿真实退化跑，不只用构造样本。**
`scripts/e2e-real.mjs` 从会话记录里捞出真实退化段（31 次「做。」、2395 字节），走三关：
判据判红 → 同一轮内空 thinking 帧之后 tool_call 仍被拦 → turn_end 处置后重复行 31 → 0。
断言按判决分支写：`fold` 总是留标记，`strip` 只有删空了才留——
第一版把两者写成一条，于是 `strip` 的样本报「没有处置标记」，那是断言错，不是处置错。

**九 输出改成人读的。**
使用者三次反馈同一件事：`/think-sentry` 打出一整行 JSON，弹窗里很丑、会溢出、没有复制按钮。
改成四行短表，每行不超过 44 字符；机读走 `/think-sentry json`。
同批压了另外两处会进上下文的长文案：拦截提示从三行压成一行，折叠加的附注从 60 字符压到 20 字符——
附注是每轮都注入的，省下的会累积。
「不溢出」写成判据：测试断言行数 ≤ 6、每行 ≤ 44 字符，谁加内容撑破了会红。
顺带修一个真 bug：`json` 分支原先写在 `if (!a)` 块里面，空串时永远不成立，等于那个出口没接上。

**十 台账虚高：把帧数当次数。**
使用者贴了「回合 237 红 70 拦 7」，读起来像判据很勤快，其实那个 70 是帧数。
`message_update` 一段一千多字符的思考会来几十帧，每帧判红就落一条，
台账里同一条记录连记五次（时间戳 `16:52:39.36x`、长度 1268、开头全同）。
改法是按文本比对去重：内容变了才记。判据两条——同一文本四帧只记一条，文本改了记第二条；
把去重那行改成 `if (true)` 必须红（验过，红）。
顺带把 `strip.min` 的默认值从 3 改成 4，与 `dup.min` 同步；并加了跨字段检查：
处置门槛大于判红门槛时报 `strip-gt-dup`——两个字段单独看都合法，只有放在一起才矛盾。

**十一 加 CLI：数据要自己读得到，不能等人贴。**
使用者问了两次「所有数据，你自己可以查看，而不是需要我调用给你」。
`/think-sentry` 是 pi 内部命令，agent 在 bash 里调不到，只能写临时测试去模拟——等于每次都绕一圈。
加了 `bin/status.mjs`，`npm run status` 直接输出同一份短表，多一节台账统计。
第一次跑就报出真相：**台账 2492 条红，去重后只有 145 次**，虚高 17 倍。
这也是为什么「去重」那条改动的判据必须建在磁盘文件上，而不是内存计数上。

**十二 机读出口补齐：四个入口两种形状。**
使用者的问法是「两个插件的（机读）都做了吗」。核对下来四个入口只有 `/think-sentry json` 一个能机读，
其余三个（`/escape-guard`、两个 CLI）都只有人读——**一个问题四种答案，我一处一处补，就漏了三处**。
补完的形状是：pi 内 `/x` 与 `/x json`、bash 里 `npm run status` 与 `node bin/status.mjs --json`。
两条设计约束：
一是人读与机读从**同一份计算结果**渲染（`statusLines()` 一次算完，两种形状都从它来），
二是机读给结构化数字（`config.dup.min` 是数字），不逼着对面反过来解析人类那几行。
判据同时测两个入口——它们走两段不同的代码，测一个不能证明另一个；
把 `--json` 里的 `config` 字段删掉必须红（验过，红）。

**十四 算法层：LZ77 + Aho-Corasick，三条判据一个防回灌。**
用户要求「把思维链看成整体，用高级算法」。加了两件纯算法（`src/algo/lz77.ts`、`src/algo/aho-corasick.ts`），
前者给「最长自我重复多长」，后者给「注入过的文本在哪出现」。
三条被实测否决的路都记在探针里：k-gram 比（平均值，长文本稀释）、压缩覆盖率（压缩与退化不是同一个量）、
我自己写的 SEQUITUR 原型（O(n³) 重扫，把整段压成单个符号，逻辑错误）。
四个真 bug 是接进去才露出来的，都不是算法本身的错：
`run` 排在 dup 之后永远轮不到；`run` 用 raw 没扣注入文本导致自锁；
`judgeThinking` 传部分配置就抛 `ev.dir 只能是 zh 或 en`；`isCodeSpan` 把 quote 也算代码。

**十五 历史回放：15030 个真实思考段，测出 68.8% 的误报。**
用户要求「用历史数据回灌测试」。写了 `bin/replay-history.mjs`（有界：8 文件 / 20 万行 / 单段 2 万字）。
两件事是造样本发现不了的：
一 探针自己会脏——第一版自己拼 `{ t, i }` 丢掉 `kind`，空行全算进 vote 行，`dup` 冲到 93.2%，
  改用 `partitionLines` + `voteOf` 才是 13.7%。
二 `longest >= 12` 在真实数据上判红 68.8%，例子全是路径、命令行参数重复。
  那不是退化，是写代码时正常的引用。加 `longestNatural`（中文占比 ≥ 80%）后降到 5.4%。
同一批数据还给出三个数：inline 只命中 0.1%（几乎不起作用）、三条同时命中只有 0.6%（抓的是不同形状）。
边界写清楚：没做人工标注，「5.4%」是命中率不是误报率。

**十六 按真实数据重写 inline：O(n²) → O(n)，0.3% → 6.4%。**
用户要求「按真实数据重写 inline，别直接删」。先诊断再改：
旧 `collapseRange` 是连续区间搜索，在 3384 段金标准（dup 命中）里只覆盖 110 段，漏 3143 段——
真实重复是散落的，连续区间凑不够长度。
三个候选量实测之后发现原判据的**核心量是错的**：`uniqRatio` 在金标准上 p50 是 0.750、未标记是 1.000，
阈值 0.5 只抓到 9%。能分的是 `topShare`（0.222 vs 0.079）。
新判据 `topShare >= 0.3 || repeatCover >= 0.5`：金标准 33.9%、未标记 7.0%。
回放验证 0.3% → 6.4%。
写过一版后缀自动机（`suffix-automaton.ts`），实测不需要那个粒度，按「未被引用的删」删掉了——
写了、测了、不用，比留着好看。
顺带消掉循环依赖：`sentencesOf` / `SENT_RE` / `MARK_RE` 抽到 `src/sentences.ts`。


**十三 证明项精确到这一条。**
七条规则的「引入」原来都写「npm test 期望 rc=0」——批次命令，红了只知道 203 条里有 1 条红。
换成各自单文件命令并写明用例数。
第一次改坏 `src/features/dup.ts` 测试没红，查下去才看清那个文件只是配置单元，判据在 `judges.ts`——
「module」与「引入」指的不是同一个文件，现在两条的指向在表里摆明了。
验证：改坏 `judges.ts` 的 dup 判定（`>=` 改 `>`），只有 `test/dup.test.ts` 红 6 条，
`test/guard.test.ts` 一条不动。判据写成代码：出现 `npm test` 就红。

判据：`npm test` 195/195；`test/collapse.test.ts` 11 条、`test/round-clean.test.ts` 2 条、
`test/no-reflow.test.ts` 3 条、`test/empty-frame.test.ts` 2 条。

## 0.1.45 · 2026-11-22 · R8/R9 四轮三方签字

四方改动，每处都有实测数据与能红的判据。

**一 配置的类型层（src/values.ts + src/defaults.ts）。**
实测缺陷：命令 `think-sentry intercept cooldown false` 写进配置的是字符串，configure 判 `=== false` 为假，
冷却仍开着而返回值看起来是成功；`"ratio": ""` 被 Number 变成 0，行内与块级判据同时失效且无提示。
修法：raw → 值的映射只在一处，类型来自 defaults；六种函数三态分清（没配 / 合法 / 配错要记账）。
同时把六个模块的默认值收进一处——此前 boundaryMinExempt 的 3 有三个像。

**二 行内反引号里的代码不算语言（这条是用户报的「路径好像会误判为英文」）。**
实测：845 块思考改前判红 54 块，改后 9 块，45 块（83%）是行内 code 造成的，零反向。
根因不是路径——是剥引用的规则只看形状（有没有斜杠），而 markdown 的三种代码构造里，
围栏与缩进按位置处理了，**行内反引号漏了**。补上第三个成员是扩类，不是在类外打分支。
第一版写否定类字符集，把汉字一起剥掉，实测 193 行反向——定义域写错。

**三 冷却的键从「调用」换成「判决」。**
实测（数学组1）：模型被拦后写的是同一段英文思考，只换 toolCallId 重试，同一段被拦三次，
第三段原话是 "Consistently blocked. Try a tool that isn't codemode?"——它在找绕过，不是在改语言。
修法：键换成思考文本，且有界集合（32 段，超出丢最早）。单槽记不住 A→B→A，那是复核方抓的。

**四 ref 类（纯引用行）。**
926 个引用行原先全在投反对票。ref 不投目标票也不投反对票，且**不算 exempt**——
opaque 的语义是「判据没有输入」，引用行有输入只是没有语言内容；混进 exempt，贴路径就能洗掉判红。
同时把 dup 的覆盖面从 vote 扩到 vote + ref，否则这次改动会顺手放过「贴同一行路径三次」。

**这一轮我自己的假绿，比上面四条都值得记。**
我连续多轮在报告里写「tsc 干净」，用的命令是 `npx tsc --noEmit | head -5; echo rc=$?`——
rc 是 head 的退出码，恒 0。这正是我自己写在规则里的「管道末端 rc 是 tail 的」。
复核方指出后实测：有 tsconfig 直跑 rc=1，坏样本能红；无 tsconfig 也读文件（这条复核方的说法与本机实测不符）。
修法：加 tsconfig（strict 显式）、装 typescript 为 devDependency、新增 test/tsc-gate.test.ts 三条，
其中第三条是**判据自己的坏样本**：塞必错文件必须 rc≠0，否则「rc=0」与「tsc 没跑」不可区分。

**四轮复核，两次拒签，五条 + 两条残余全部修完。**
拒签时给的判据比认可有用：6e8dd769 的「新机制是唯一没有坏样本的机制」直接指出
我加的语法层没有任何测试能锁住（删掉它 235/236 仍绿）；b711ced1 的 A/B/A 指出单槽不是集合。

## 0.1.41 · 2026-11-21 · R7 第三次：网关保守判据 + 单位拆开

签核第二轮，6e8dd769 认了自己那条机制判错（它把 bedrock 的注释当成了字段语义），另留两条：

**一 网关类 provider 的后端未知，我刚才没拦。** 它给的样本是本机正在用的那条：
`{provider:"magpie", api:"openai-completions", id:"group/never-stuck"}` → 我判 capture=true。
它转发到哪个后端，插件看不见；也许是 Claude（会 400），也许是 deepseek。

修法：加一条「网关 + 模型名看不出族 → 保守不改写」，默认关，配置 `binding.allowGateway` 可显式放开。
本机 `settings.json` 里写了 `binding: { allowGateway: true }`——因为本机确实用它跑通了，
但那是一个**取舍**（可用性 vs 一个可能的 400），所以放配置不放常量。

判据：test/r7c.test.ts 五条——网关默认不改写、开了就改、网关但模型名看得出族时按族判（不改保守）、
Anthropic 即使开了网关开关也不改、binding 是模块（与其余五个同形状）。

**二 judgeErrors 在帧与轮两处各加一，分子混单位。** 我原来的改法是删掉轮级那处，
但复核的旧测试（`turn_end 判据抛异常：轮次照记，不整段崩`）说明轮级抛了必须看得见——删掉就是丢信息。

改法改成**拆开**：帧级仍叫 `judgeErrors`，轮级新叫 `turnJudgeErrors`。两个单位不再混，两边都不丢。

npm test 194/194/0。

## 0.1.40 · 2026-11-21 · R7 第二次修：机制第三次改口，判据改成三处对称

签核时两位各给了一条硬的：

**b711ced1 用 SDK 类型定义纠正我**：`block_binding` 的原文是
「what happens when a thinking block this request sends back fails the conversation check」，
它挂在 `BetaThinkingConfigAdaptive` / `BetaThinkingConfigEnabled` 的 block_binding 字段下——
**绑的就是 thinking 块**。我上一版在 consensus 里写「绑的是 system prompt 与 tools」是错的，
那是 bedrock 那份文件的注释，不是这个字段。所以：

| 版本 | 我说的 | 对错 |
| --- | --- | --- |
| 提案 | block_binding 校验 thinking 块 | **对** |
| consensus | 绑的是 system prompt 与 tools | **错**（把另一个文件的注释当成了这个字段） |
| 现在 | 绑 thinking 块，SDK 原文为证 | 对 |

**判据改成三处对称**（6e8dd769 与 b711ced1 各给一半）：
原来 anthropic 那条只看 provider、openai 那条只看 api，两个方向不一致。实测三种都会漏：
`{provider:"openrouter", api:"openai-completions", id:"anthropic/claude-opus-4.7"}`、
`{provider:"my-relay", api:"anthropic-messages"}`、`{provider:"", api:"anthropic-messages"}`。

现在四条判据：provider 含 anthropic/bedrock、api 含 anthropic/bedrock、api 含 responses、
模型名含 anthropic/claude/opus-4-7/opus-4-8/opus-5/sonnet-5/haiku-5/fable-5（聚合 provider 转发用）。

判据：test/r7.test.ts 六条 + test/r7b.test.ts 五条（含「真的普通模型仍然能改写」这条反向样本，
防止判据把所有人都拦了）。npm test 189/189/0。

## 0.1.39 · 2026-11-21 · R7：块绑定的真实边界（我上一版讲错了）

pi 更新到 1.6.0。先跑两个插件：think-sentry 178/178、escape-guard 51/51，都没坏
（1.6.0 的 breaking change 是 TUI 的 render()，两个插件都是事件钩子，不碰渲染）。

我想报一个「pi 1.6.0 让改写静默失效」的发现，两位复核把它驳了，而且驳得对：

| 我说的 | 实际 | 谁驳的 |
| --- | --- | --- |
| block_binding 校验 thinking 块 | 它绑的是 **system prompt 与 tools** | 6e8dd769 |
| useBlockBinding 可从 ctx 读 | 它是 bedrock 文件里的局部 const，读它恒判「无绑定」= 恒绿 | b711ced1 |
| 触发条件是模型名含 opus-4-7 | 那是 Bedrock；Anthropic 直连看 supportsMidConvoEffort，与模型名无关 | b711ced1 |
| 本机安全因为签名是常量 | 真实原因是走 openai-completions；prefix_mismatch 那套在 responses（GPT-6.2+） | 6e8dd769 |

**边界仍然真实存在，只是机制与我说的不同：**

| 路径 | 改 thinking 的结局 |
| --- | --- |
| Anthropic 家族 | 400（签名覆盖内容），不是静默 |
| OpenAI responses | 静默移除 reasoning item（prefix_mismatch） |
| OpenAI completions（本机） | 不受影响 |

so 本轮做的事：把这条边界变成一个**可执行判据**。

- 新增 `src/features/binding.ts`：按 provider 与 api 判，不按模型名、不按读不到的内部字段
- `message_update` 与 `turn_end` 各读一次 ctx.model（换模型不用重启）
- 命中就**不改写**，记 `skippedByBinding`（与 turns 成对）
- `think-sentry` 命令的第一项就是 `capture: off (provider=…, api=…, reason=…)`
  ——配置里写了 inject.text 却不生效时，人得能看出来，而不是以为生效了

判据：test/r7.test.ts 六条（Anthropic 不改写、Bedrock 归同一族、responses 不改写、
completions 照旧改写、未知默认能改、label 带 provider 与 api）。npm test 184/184/0。

**两位都反对的那件事我没做**：escape-guard 的模块化重构（MODULES + defaults，动 6 个文件）。
理由：七轮里没因此出过事故，没有判据能证明收益。加戏。

## 0.1.38 · 2026-11-21 · boundaryMinExempt 四处接线补齐

签核第五轮 6e8dd769：boundaryJudge 接参、用参、传参、夹值四处都对，但 intercept.defaults 没这个键、configure 也不返回它，
于是配置里写 intercept.boundaryMinExempt 是无效的（第四处接线缺失）。

补：defaults、configure 各加一项。副本的「配置改了行为要变」已由 r6c.test.ts 覆盖。npm test 178/178/0。

## 0.1.37 · 2026-11-21 · 把配置项接到使用点

签核第四轮，b711ced1 与 6e8dd769 指出的共同形状：**加了配置项、没接使用点**。
boundaryMinExempt 加了但 boundaryJudge 仍用常量 3；现在第二参传入，judgeCfg 夹到 >= 1。

test/r6c.test.ts 三条：阈值 99 与 1 给出不同 tag、默认仍是 3、0 退回默认。npm test 178/178/0。

## 0.1.36 · 2026-11-21 · 行号方向 + 注释对齐

签核第三轮 b711ced1 的两条（不阻塞但都是真的）：
- strip 的行号区间用 min/max：local 不保证升序，实测出现过 [原第 6-5 行] 这种反向区间
- inject.ts 的注释还写着 {{sample}} 与「引用它自己写过的行」，而 0.1.33 删 sample 的理由正是「引用=把英文再复制一遍」

判据：test/r6.test.ts 加一条「行号不能反向」。npm test 175/175/0。

## 0.1.35 · 2026-11-21 · 模板按判决分家

签核第二轮，两位都指同一条：**一个模板服务三种互斥的 ev，16 格里只有 4 格有值**，
于是 clean 帧渲染成「第 ? 行起重复 ? 次」，dup 帧渲染成「占比 ?」。

改成 `inject.texts = { dup, lang, clean }`，每份只引用自己那份判据真有的字段：

| 模板 | 可用字段 | 写了什么 |
| --- | --- | --- |
| dup | `blockLine` `blockReps` | 第几行起、重复几次 |
| lang | `ratio` `blockLine` `lines` | 中文占比、第几行起不是中文、共几行 |
| clean | 无 | 空（不追加） |

旧形状 `text`（单字符串）仍然认：三份都用它，不改配置的人什么都不变。

判据：`test/r6b.test.ts` 四条——dup 填完不含问号、lang 填完不含问号、clean 不追加、
**交叉使用必然留问号**（这条钉住「不许交叉」）。

**过程中的一个真观察**：我读 `inject.ts` 时看到 `ev?.cjkOverCjkLatin`，以为是源码被写坏了，
改了两次都没改对——磁盘上其实是 `ev?.cjkOverCjkLatin`，那个占位符是**读取层遮蔽**，不是文件内容。
判法：打印 charCode（3f 2e 63 6a 6b... = "?." 加 cjk...）。**看到的是输出，不是输入。**

npm test 174/174/0。

## 0.1.34 · 2026-11-21 · 判据产出指针

签核时两位指出同一条：inject 模板引用 {{blockLine}}，但没有任何判据产出 line，永远替换成 ?。
补：dup 与 lang 的 ev 都产出 line（第一条不合格行，1 基）；没判红时为 null，指针不瞎指。
test/r6.test.ts 四条钉住（含「模板拿到真行号」）。npm test 170/170/0。

## 0.1.33 · 2026-11-21 · R6：指针代替引用 + 配置化

两份否决都成立（reviews/discuss-r6-*、consensus-r6）：

- 6e8dd769：我认定的违规（拦截文案）**没有样本**——27 块含该文案的逐块读全是人类讨论，复诵 0 次。
- b711ced1：真正的违规在 `strip.ts` 的「（这一段的重复行已删除）」，它直接写进 thinking，比拦截文案更危险。
- 两位都说：「引用原文」等于把英文**再复制一遍**进上下文，方向该反过来用**指针**（行号）。

改动：

1. strip 的删空守护：固定句 → `[原第 a-b 行共 N 行，全部重复已删]`（行号来自判据，指得到）。
2. inject 占位符：删 `{{sample}}`（复制原文），换成 `{{blockLine}}` / `{{blockReps}}`（指针）。
3. 配置化（只搬有意义的）：`intercept.cooldown`、`boundaryMinExempt`；
   **不搬** `lang.minDigits` / `lang.lineChars`——按提案自己的判法第 3 条，那两个改了就是恒绿。

判据：npm test 166/166/0；mutate 91 抓住 / 5 存活（老账，前几轮记录过）。

## 0.1.32 · 2026-11-21 · R5：判据收紧 + 尾部附注 + 冷却

观察对象：数学组1（会话 01a1f667），551 个 thinking 块、55 万字符。
三方讨论稿在 reviews/：proposal-r5（我）· discuss-r5-b711ced1 · discuss-r5-6e8dd769，共识在 consensus-r5。

**两条否决合起来才成立**：b711ced1 说判据认「一行有一个汉字」就算中文行，所以 L2 没有作用对象；
6e8dd769 说 533 块里判红 14 块、其中 dup 12 / lang 2——我拿 dup 的效果去论证语言改写有效，口径错了。

四条改动：

1. **判据**：lang 从「行内有目标字符即合格」改成「块级字符比 < 0.3 且 >= 100 字」或「行投票 off > keep」，两条取并集。
   实测 lang 红块 2 → 44（命中 43/77 字符比 < 0.3 的块，误杀 0）。
   行内比例（0.3）与绝对下界（5 个汉字）只用来算「有几行不是中文」这个文案数字。
2. **ev 多一个 cjkOverCjkLatin**：分母写进字段名。R5 两份复核的 0.276 与 0.434 对不上，就是因为没写分母。
3. **尾部附注**：inject 支持 {{sample}} / {{ratio}} / {{lines}} 占位符，引用该块自己那一行英文，每轮唯一、无模板可模仿。
   轮换池没做——b711ced1 说固定文案读两遍就会被当成自己的思路续写。
4. **拦截冷却**：同一个 toolCallId 只拦一次，第二次放行并记 cooled。判据收紧后红块涨 22 倍，无冷却会反复打回同一次调用。

判据：npm test 166/166/0。直接验「>= 5 → > 5」的变异：2 个测试红。
undefined

## 2026-11-22 · README 移出的过程记录

正文只留结论；下面这段原在 README 的「配置」与「改这个插件时的一条硬规矩」之间，讲了 dup.min 从 3 改到 4 的过程与两次事故。移到这里是因为正文不写试错。

settings.json，六个模块，每个一个开关加它的参数：

    {
      "intercept": { "on": true },
      "dup":       { "on": true, "min": 3 },
      "lang":      { "on": true, "dir": "zh" },
      "strip":     { "on": true, "min": 3 },
      "inject":    { "on": true, "texts": { "dup": "", "lang": "", "clean": "" } },
      "binding":   { "allowGateway": false }
    }

命令：/think-sentry 看全部状态，/think-sentry dup min 5 改一个值。
写不认识的值会拒绝并说明，不会静默兜底。



## dup 的门槛：3 太严，改成了 4

台账 `ledger/judgments.jsonl` 里 384 次真实 `block`，被复诵行是「做。」的 221 次：

| 整块长度 | 次数 | 读法 |
|---|---|---|
| ≤ 20 字符 | 136 | 整块就是 `做。\n做。\n做。`——空转，该拦 |
| 21–200 | 5 | — |
| > 200 | 80 | 长思考里夹三个标记——误伤，不该拦 |

按 reps 切不开这两类（len≤200 里 3/4/5/7 都有），按整块长度能。

**改法**：`dup.min` 3 → 4。

两个复核方各给了一条独立证据：

- **6e8dd769**：会话 2026-11-18T14-10-43 上，`dupMin=3` 时连续 **64 块**同 blk「做。」判红、其中 62 块带工具调用（模型怎么改都过不去）；改成 4 后同一份数据连拦降到 **15**、判红 485 → 266。
- **b711ced1**：3 是本项目自己定的默认值，使用者从没指定过。使用者 2026-11-18 报的病例是「同一行出现了 **7** 次」——默认 3 比他自己记的数更严，那正是「替他把定义改强」。

全量回放（98 个会话、38375 块思考）上改动的效果：

| | min=3 | min=4 |
|---|---|---|
| 判红总数 | 3660 | 2339 |
| 其中 dup | 2854 | 1533 |
| 其中 lang | 806 | 806 |

**我试过但撤回的方案**：给 dup 加「被复诵行占整块 30% 以上才判」。全量回放上 dup 判红从 2760 掉到 **6**——把使用者的病一起放过了。比例切不干净，次数才切得干净。

**代价**：整块只有三行 `做。` 的空转会漏判（约 50 次），换来的是 64 块连拦的死锁解开。

**一条自己的事故**：上表统计时发现台账里曾混进 78 次我自己的测试假样本（`这一行是重复的。`）——改测试时把样本回显进了真实会话，于是它在真 install 下被自己拦。**改测试时不要在会话里回显样本。**
