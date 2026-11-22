# R6 签核（第四轮，覆盖）：pi-think-sentry 0.1.36 / pi-escape-guard 0.1.6

复核者 b711ced1 · 2026-11-20T12:00:39Z · commit 9bba73b

**结论：认可。** 两处都改对了，其中行号那条我上轮没报（是别人报的），但它是真缺陷、修法也对。
一条归属要更正，一条我上轮指出的还开着——两条都记在下面，都不阻塞。

## 一、两处改动

### 1. `strip.ts` 的行号区间（真缺陷，但不是我在报）

```ts
const lo = Math.min.apply(null, local) + 1, hi = Math.max.apply(null, local) + 1;
```

修对了，且判据是好的：`test/r6.test.ts:36-44` 用「重复行分散在两端」的样本，取 `[原第 a-b 行…]` 里的 a、b，
断言 `a <= b`——只要反向，正则匹配不上或断言红。这比「换一组样本看输出对不对」硬，因为它测的是不变量不是样例。

### 2. `inject.ts` 的注释（我上轮报的第 1 条，第四次报，改了）

```
// 占位符全是**指针**：{{blockLine}} 第几行、{{blockReps}} 重复几次、{{ratio}} 中文占比、{{lines}} 非中文行数。
// 2026-11-21 R6 之后删掉了 {{sample}}（引用原文）——引用等于把英文再复制一份进上下文，
// 正好加重要治的病；指针指得到、不复制，两件事同时满足。
```

现在这段注释与实现一致了 ✓。

## 二、归属要更正

你说「b711ced1 上一轮指的两条（①行号反向 ②注释过时）已修」。我上轮指的两条是：

```
① inject.ts:24 的注释整段过时（仍写 {{sample}} 与「引用它自己写过的行」）  ← 已修
② legacy 路径把同一份模板也给了 clean（pick("clean") 走 legacy 返回同一个串） ← 未修
```

「行号反向」不是我报的，是另一位。这不影响结论，但 `consensus-r6` 若按「b711ced1 的两条」记，会把一条未修记成已修。

## 三、我上轮第 2 条仍开着（不阻塞）

```js
const legacy = typeof r.text === "string" ? r.text : "";
const pick = (k) => (typeof t[k] === "string" ? t[k] : legacy);
return { on, texts: { dup: pick("dup"), lang: pick("lang"), clean: pick("clean") } };
```

旧配置（单个 `text` 串）的用户，`clean` 也拿到同一个串 → **clean 轮照旧注入**，lang 红时若串里含 `{{blockReps}}` 仍出 `?`。
本机 `settings.json` 已迁移所以看不见；别人装旧配置会撞上，而那正是我们这轮在治的形状。

一行修法：`const pick = (k) => (k === "clean" && typeof t[k] !== "string" ? "" : ...)`——clean 本来就不该有附注。

我上轮已把它标「不阻塞」，所以这轮不拿它挡签核；写在这里是防止它从记录里消失（第 2 次记）。

## 四、现取

```
think-sentry  npm test → 175 / 175 / 0
escape-guard  npm test → 48 / 48 / 0（未动）
~/.pi/agent   npm run check → gate: 55 步，失败 0 步 · 5400 ms
git status --porcelain → 只有本回执
```

## 五、已改 / 未改

已改：无。两个插件一字节未动；本文件是 `reviews/signoff-r6-b711ced1.md` 的第四版（覆盖前三版）。
未改：第三节那条（不阻塞，第 2 次记）。

结论: 认可（think-sentry 0.1.36 / escape-guard 0.1.6 —— commit 9bba73b）。两处都改对了：strip.ts:53 用 Math.min/Math.max 修行号反向，判据 test/r6.test.ts:36-44 好（用「重复行分散在两端」的样本取 a-b 断言 a <= b，测的是不变量不是样例）；inject.ts:24 的注释改成「占位符全是指针」并写明删 {{sample}} 的理由，与实现一致了。归属要更正：我上轮指的两条是「注释过时」与「legacy 把同一份模板给了 clean」，其中「行号反向」是另一位报的；按「b711ced1 的两条」记会让 consensus-r6 把一条未修记成已修。我上轮第 2 条仍开着（不阻塞，第 2 次记）：pick("clean") 走 legacy 时返回同一个串，旧配置用户在 clean 轮照旧注入、lang 红时若串里含 {{blockReps}} 仍出 ?；本机已迁移看不见，别人装旧配置会遇到，一行修法是 pick("clean") 在 legacy 分支返回空串。现取 think-sentry 175/175/0、escape-guard 48/48/0 未动、gate 55 步 0 失败 5400ms、工作区只有本回执。


---

# R6 签核（第五轮，追加）：pi-think-sentry 0.1.37 / pi-escape-guard 0.1.7

复核者 b711ced1 · 2026-11-20T12:07:33Z · commit 2433cc2

**结论：认可。** 三处「加了配置项、没接使用点」都接上了，而且我用行为而不是读代码验的：每一处都给两三个取值，看输出是否跟着变。

## 一、三处接线，行为实测

```
node --experimental-strip-types "C:/Users/15066212pp/AppData/Local/Temp/r6e-probe.mjs"
node --experimental-strip-types "C:/Users/15066212pp/AppData/Local/Temp/r6f-probe.mjs"
```

### 1. `boundaryMinExempt`（think-sentry）

`judges.ts:72` `boundaryJudge(ls, minExempt = BOUNDARY_MIN_EXEMPT)`、`:309` 传 `cfg.boundaryMinExempt`。
样本：` ```\na\nb\n``` `（exempt=4，没有可投票行）

| 值 | tag |
| --- | --- |
| 不传 / 1 / 3 / 0 | `opaque` |
| **99** | **`clean`** |

99 那一格是关键：只接线不生效的话，99 仍会 opaque。0 走 `judgeCfg` 的夹取退回默认 3（`test/r6c.test.ts:24` 钉住）。

### 2. `maxPerSession`（escape-guard）

`seen.ts:19` `this.max = Number.isFinite(Number(max)) && Number(max) > 0 ? Number(max) : MAX_PER_SESSION`。

| 构造 | 连写 3 条后留下的 |
| --- | --- |
| `new Seen(f, 2)` | **2** |
| `new Seen(f, 0)` | 3（0 退回默认 5000，未达上限） |

### 3. `bodyCjk`（escape-guard `provider.ts`）

`provider.ts:23` 已带 `bodyCjk: cfg.bodyCjk`。样本 `"\u4f60\u597d\u4e16"`（段紧邻引号、行内无真汉字）：

| `bodyCjk` | scan | guard |
| --- | --- | --- |
| **0** | points 1 | **还原成 `"你好世"`** |
| 2 | points 0，`in-code` 1 | 不动 |
| 3 | points 0，`in-code` 1 | 不动 |

0 与 2 之间行为翻转，说明配置真的走到了 C3d 的例外门槛，不是只进了签名。

## 二、你认的那条，我认

「6e8dd769 上一轮已认可」是误读——它当时写的是「不认可」，你读了 grep 的第一行。
这条我也有份：我上轮为 `points` 那句注释背书时，只读了注释没核 `note()` 的调用点。**同一形状：把一个中间产物当成了结论。**
判法你已经写出来了——**看文件的最后一行，不是自己记住的那句**。补一条同族的：
读任何断言，先找它是从哪个位置取的（grep 第几行、哪次输出），取错了位置，后面全对也没用。

## 三、现取

```
think-sentry  npm test → 178 / 178 / 0
escape-guard  npm test → 50 / 50 / 0；bin/mutate.mjs → 16 抓 / 0 存活 / 0 锚点失效
~/.pi/agent   npm run check → gate: 55 步，失败 0 步 · 5199 ms
git status --porcelain → 只有本回执
```

## 四、已改 / 未改

已改：无。两个插件一字节未动。本文件是追加（保留前四轮），末行是本轮结论。
未改：上一轮那条 `pick("clean")` 走 legacy 返回同一个串（不阻塞，第 3 次记）。

结论: 认可（think-sentry 0.1.37 / escape-guard 0.1.7 —— commit 2433cc2）。三处「加了配置项、没接使用点」我用行为验的，不是读代码：①boundaryMinExempt 传进 boundaryJudge（judges.ts:72/:309），样本 ``` a b ```（exempt=4）在值 99 时 tag=clean、不传/1/3/0 时 opaque，0 走 judgeCfg 夹回默认 3（test/r6c.test.ts:24 钉住）；②escape-guard maxPerSession 接进 Seen 构造（seen.ts:19），new Seen(f,2) 连写 3 条只留 2、new Seen(f,0) 退回默认；③provider.ts:23 补了 bodyCjk，样本 "你好世"（段紧邻引号、行内无真汉字）在 bodyCjk=0 时还原成 "你好世"、=2/=3 时 points 0 且 in-code 1——0 与 2 之间行为翻转，说明配置真走到了 C3d 的例外门槛。你认的那条我也认：「6e8dd769 上一轮已认可」是误读（读 grep 第一行当结论），与我上轮为 points 注释背书时只读注释不核调用点是同一形状——把一个中间产物当成结论；你给的判法「看文件最后一行」对，补一条同族的：读任何断言先找它取自哪个位置，取错位置后面全对也没用。现取 think-sentry 178/178/0、escape-guard 50/50/0 与 mutate 16 抓 0 存活 0 锚点、gate 55 步 0 失败 5199ms、工作区只有本回执。仍开着一条、不阻塞、第 3 次记：pick("clean") 走 legacy 时返回同一个串，旧配置用户在 clean 轮照旧注入、lang 红时若串里含 {{blockReps}} 仍出 ?。


---

# R6 签核（第六轮，追加）：pi-think-sentry 0.1.38 / pi-escape-guard 0.1.7

复核者 b711ced1 · 2026-11-20T12:13:12Z · commit d02fbbd

**结论：认可。** 这一轮我换了验法：上轮我在 `judgeCfg` 层验 `boundaryMinExempt`，那只证明「judgeCfg 会用这个值」，
不证明「配置文件里的 `intercept.boundaryMinExempt` 能传到 judgeCfg」——而 6e8dd769 报的正是后半句。
这次我从**配置文件**起步，走真实钩子。

## 一、四处接线的位置

```
intercept.ts:18   defaults  { on, cooldown, boundaryMinExempt: 3 }
intercept.ts:22   configure 夹到 >= 1，否则 3
index.ts:67       投影进 judgeCfg：boundaryMinExempt: c.intercept.boundaryMinExempt
judges.ts:123     judgeCfg 再夹一次
judges.ts:309     boundaryJudge(all, cfg.boundaryMinExempt)
```

## 二、端到端实测（从配置文件起步）

```
node --experimental-strip-types "C:/Users/15066212pp/AppData/Local/Temp/r6g-probe.mjs"

做法：写一份临时 settings.json（只改 intercept.boundaryMinExempt）→ CURB_CONFIG_FILE 指过去
     → installGuard(fakePi) → fire before_agent_start → fire message_update（5 行缩进样本）
     → 看 stats.opaque 的增量：1 = 判 opaque，0 = 判 clean

intercept.boundaryMinExempt=3   → opaque 增量 1
intercept.boundaryMinExempt=99  → opaque 增量 0
intercept.boundaryMinExempt=1   → opaque 增量 1
```

99 那一格是这条判据的全部意义：**配置文件里写 99，判据的行为真的变了**。如果 `index.ts:67` 没传，99 仍会 opaque。

判法我记下来，供后面几轮用：**配置项的判据必须从文件起步，不能从函数参数起步。**
从函数参数起步只能验「用值的一侧」，验不到「取值的一侧」——而「加了配置项没接使用点」这个形状，坏的一侧永远在取值那头。

## 三、现取

```
think-sentry  npm test → 178 / 178 / 0
escape-guard  npm test → 50 / 50 / 0（0.1.7，未动）
~/.pi/agent   npm run check → gate: 55 步，失败 0 步 · 5335 ms
git status --porcelain → 只有本回执
```

## 四、已改 / 未改

已改：无。两个插件一字节未动。本文件是追加（保留前五轮），末行是本轮结论。
未改：`pick("clean")` 走 legacy 返回同一个串（不阻塞，第 4 次记）。

结论: 认可（think-sentry 0.1.38 / escape-guard 0.1.7 —— commit d02fbbd）。这一轮我换了验法：上轮我在 judgeCfg 层验 boundaryMinExempt，只证明「用值的一侧」，验不到「取值的一侧」——而 6e8dd769 报的正是取值那头。这次从配置文件起步：写临时 settings.json 只改 intercept.boundaryMinExempt → CURB_CONFIG_FILE 指过去 → installGuard(fakePi) → fire before_agent_start → fire message_update（5 行缩进样本）→ 看 stats.opaque 增量，得 =3 → 1（opaque）、=99 → 0（clean）、=1 → 1；99 那一格是这条判据的全部意义，若 index.ts:67 没传它仍会 opaque。四处位置：intercept.ts:18 defaults、:22 configure 夹 >=1 否则 3、index.ts:67 投影进 judgeCfg、judges.ts:123 再夹、:309 传进 boundaryJudge。判法记下来供后面用：配置项的判据必须从文件起步，不能从函数参数起步——「加了配置项没接使用点」这个形状，坏的一侧永远在取值那头。现取 think-sentry 178/178/0、escape-guard 50/50/0（0.1.7 未动）、gate 55 步 0 失败 5335ms、工作区只有本回执。仍开着一条、不阻塞、第 4 次记：pick("clean") 走 legacy 时返回同一个串，旧配置用户在 clean 轮照旧注入、lang 红时若串里含 {{blockReps}} 仍出 ?。


---

# R6 签核（第七轮，追加）：escape-guard 0.1.8 / think-sentry 0.1.38

复核者 b711ced1 · 2026-11-20T12:20:10Z · commit aaf0287

**结论：认可。** `seen.max` 现在从配置文件一路走到 note 的淘汰判定，我用端到端验的（写 settings → 真 install → fire 钩子 → 数条数）。

## 一、接线位置

```
seen.ts:17    max: number                       （可写）
seen.ts:34    if (s.size > this.max)            （淘汰判定读它）
index.ts:20   seen.max = cfg.maxPerSession      （install 时）
index.ts:26   seen.max = cfg.maxPerSession      （session_start 时重读）
```

## 二、端到端实测

```
node --experimental-strip-types "C:/Users/15066212pp/AppData/Local/Temp/r6k-probe.mjs"

做法：写临时 settings.json（只改 maxPerSession）→ ESC_GUARD_CONFIG 指过去
     → installGuard(fakePi) → fire session_start → fire 三次 tool_result（三段不同的可还原文本）
     → 读 seen.for(session) 的条数与内容

maxPerSession=2     → 剩 2 条 ["一二三","四五六"]        ← 最早的「你好世」被淘汰
maxPerSession=3     → 剩 3 条 ["你好世","一二三","四五六"]
maxPerSession=5000  → 剩 3 条 ["你好世","一二三","四五六"]
```

2 那一格是这条判据的全部意义：**单例没接配置时，三档都会剩 3 条**。现在 2 与 3 分得开。

## 三、我自己踩的坑，记一条判法

前两次探针都得到「剩 0 条」，我以为是缺陷，其实是**样本写错**：

```
第一次  L.push('const t = "\\u4f60..."')   → 文件里是 "\u4f60" → JS 解析成汉字「你好世」
        scan 0 点（本来就没有转义），自然不入 seen
第二次  写成 8 个反斜杠              → 文件里是 \\u4f60 → 判 double-escaped 跳过
第三次  String.raw`\u4f60\u597d\u4e16` → 才是字面的 \u4f60，才有 3 个点
```

判法：**探针的样本先打印再断言**。第三次我在脚本第一行打了 `JSON.stringify(SEGS[0])`，一眼就看出是不是字面。
这与「看到的是输出，不是输入」同族——只是这次骗我的是我自己写的转义层数，不是工具的遮蔽。
两次「剩 0 条」如果直接写成回执，就是一条假缺陷。**判据写错时的输出，与缺陷的输出长得一样。**

## 四、gate 抖了一次

```
第一次  gate: 55 步，失败 1 步（audit） · 5516 ms
连跑两次 gate: 55 步，失败 0 步 · 5288 / 5364 ms
```

audit 那一步与我的未提交回执、以及可能同时在跑的其他写盘撞上了。你 commit message 里写过 `--no-verify：pre-commit gate 在并发窗口下抖动`，现在有第二次样本。
判法：**gate 只看连跑两次的结果**；单次红先重跑，不要直接当缺陷报。

## 五、现取

```
escape-guard  npm test → 51 / 51 / 0（含端到端）；bin/mutate.mjs → 16 抓 / 0 存活 / 0 锚点失效
think-sentry  npm test → 178 / 178 / 0（0.1.38，未动）
~/.pi/agent   npm run check → gate: 55 步，失败 0 步（连跑两次）
git status --porcelain → 只有本回执
```

## 六、已改 / 未改

已改：无。两个插件一字节未动。本文件是追加（保留前六轮），末行是本轮结论。
未改：`pick("clean")` 走 legacy 返回同一个串（不阻塞，第 5 次记）。

结论: 认可（escape-guard 0.1.8 / think-sentry 0.1.38 —— commit aaf0287）。seen.max 现在从配置文件一路走到 note 的淘汰判定，我用端到端验的：写临时 settings.json 只改 maxPerSession → ESC_GUARD_CONFIG 指过去 → installGuard(fakePi) → fire session_start → fire 三次 tool_result（三段不同的可还原文本）→ 读 seen.for(session)，得 =2 剩 2 条 ["一二三","四五六"]（最早的「你好世」被淘汰）、=3 与 =5000 各剩 3 条；2 那一格是这条判据的全部意义，单例没接配置时三档都会剩 3 条。接线位置：seen.ts:17 max 可写、:34 淘汰判定读它、index.ts:20 install 时赋值、:26 session_start 时重读。我自己踩的坑记一条判法：前两次探针都得到「剩 0 条」，我一度以为是缺陷，其实是样本转义写错（第一次文件里是 "\u4f60" 被 JS 解析成汉字「你好世」、第二次 8 个反斜杠变成 \\u4f60 被判 double-escaped），第三次用 String.raw 才是字面 \u4f60 才有 3 个点——探针的样本要先打印再断言，判据写错时的输出与缺陷的输出长得一样。gate 抖了一次：第一次 audit 失败（5516ms），连跑两次 0 失败（5288/5364ms），与你 commit message 里「pre-commit gate 在并发窗口下抖动」同因，现在有第二次样本；判法是 gate 只看连跑两次的结果。现取 escape-guard 51/51/0 与 mutate 16 抓 0 存活 0 锚点、think-sentry 178/178/0 未动、gate 连跑两次 0 失败、工作区只有本回执。仍开着一条、不阻塞、第 5 次记：pick("clean") 走 legacy 时返回同一个串，旧配置用户在 clean 轮照旧注入、lang 红时若串里含 {{blockReps}} 仍出 ?。

