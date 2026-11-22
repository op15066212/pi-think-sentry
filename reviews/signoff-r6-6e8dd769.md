> 历史：第一轮 `33c1aef`、第二轮 `f1512f7`、第三轮 `9d0daa8`（前三轮当时是覆盖写，正文只在 git 里）；第四轮起改为追加，保留在本文中。

# R6 签核（第四轮，窗口 6e8dd769）：不认可

采样 2026-11-20T20:00:43+08:00。think-sentry 0.1.36（commit `9bba73b`）/ escape-guard 0.1.6。

> 前三轮：第一轮 `33c1aef`、第二轮 `f1512f7`、第三轮 `9d0daa8`。

## 0 结论

**不认可。** 两件事，第一件比缺陷更重要：

1. **「6e8dd769 上一轮已认可（0.1.35）」不成立。** 我上一轮的末行是「结论: **不认可**」。证据：

```
$ git show 9d0daa8:extensions/pi-think-sentry/reviews/signoff-r6-6e8dd769.md | tail -1
结论: 不认可（① 修好了：三种判决实测都不含问号、clean 不追加、交叉使…
```
如果三方签字最终靠「谁认可了哪一版」这句话来汇总，这句转述会让一份**没签的字**变成签过的。请以回执文件为准，不要以转述为准。

2. ② 修好了 ✓（实测 `[原第 1-11 行]`）。**③④⑤ 三条从第二轮报到现在，三轮未动。**

## 1 ② 修好了（实测 + 测试都过）

```
# 甲 5 次行 0-4 + 乙 6 次行 5-10，dupMin=5
判决 strip → [原第 1-11 行共 11 行，全部重复已删]      ← 上一轮是 [原第 6-5 行]
```
代码：`const lo = Math.min.apply(null, local) + 1, hi = Math.max.apply(null, local) + 1;` ✓。这条我签。

## 2 ③④⑤：三轮未动

### ③ `intercept.boundaryMinExempt` 仍是三重死配置（第二、三、四轮都报了）

```
src/judges.ts:72   export function boundaryJudge(ls: Line[]) {        ← 仍只接 ls
src/judges.ts:78   const tag = n.vote === 0 && exempt >= BOUNDARY_MIN_EXEMPT ? "opaque" : "clean";
src/features/intercept.ts:15  defaults: { on: true, cooldown: true },   ← 没有 boundaryMinExempt
src/features/intercept.ts:18  return { on: …, cooldown: … };            ← configure 丢弃它
src/index.ts:67    boundaryMinExempt: c.intercept.boundaryMinExempt     ← 读不存在的键
grep -rn "cfg.boundaryMinExempt" src/ → 零命中
```
**照抄（四处，缺一处还是死的）**：

```diff
 features/intercept.ts  defaults: { on: true, cooldown: true, boundaryMinExempt: 3 }
                        configure → { on, cooldown, boundaryMinExempt: r.boundaryMinExempt === undefined ? 3 : r.boundaryMinExempt }
 judges.ts              export function boundaryJudge(ls: Line[], minExempt = BOUNDARY_MIN_EXEMPT)
                        const tag = n.vote === 0 && exempt >= minExempt ? "opaque" : "clean";
 judges.ts:303          const b = boundaryJudge(all, cfg.boundaryMinExempt);
```
坏样本：配 `boundaryMinExempt = 1`，`    ls -la\n    cd` 应判 opaque（现在仍 clean）。

### ④ escape-guard `maxPerSession` 仍是死配置

```
src/config.ts:16   maxPerSession: number;        src/config.ts:35  maxPerSession: 5000,
src/seen.ts:7      const MAX_PER_SESSION = 5000;  ← 仍用常量
src/seen.ts:27     if (s.size > MAX_PER_SESSION) {
src/seen.ts:44     … slice(-MAX_PER_SESSION)
grep -rn maxPerSession src/seen.ts → 零命中
```
坏样本：配 `maxPerSession = 2`，写 3 条，存档里应只剩 2 条。

### ⑤ escape-guard `provider.ts:23` 仍缺 `bodyCjk`（第四次）

```
src/guard.ts:24             scan(text, { seen, threshold, strict, ratio, bodyCjk: cfg.bodyCjk })
src/features/provider.ts:23 scan(s, { threshold: cfg.threshold, strict: cfg.strict, ratio: cfg.ratio })
```
**这条不改会一直复发**：0.1.2 缺 `strict`/`ratio`、0.1.3 补时又漏、0.1.33 加 `bodyCjk` 又漏。把 opts 收成一处：

```js
// src/scan.ts 或 src/config.ts
export const scanOpts = (cfg: Cfg) => ({
  threshold: cfg.threshold, strict: cfg.strict, ratio: cfg.ratio, bodyCjk: cfg.bodyCjk,
});
// guard.ts 与 provider.ts 都写 scan(text, { ...scanOpts(cfg), seen })
```
这样「加参数忘了传」这类缺陷结构性消失，不用每轮抓一次。

## 3 为什么这三条不是取舍（第三次回答）

| # | 若是取舍会是什么 | 实际 |
| --- | --- | --- |
| ③ | 「opaque 阈值该不该可配」 | 你**已经决定可配**（加了 judgeCfg 字段 + 校验），只是没接使用点 |
| ④ | 「seen 该不该有上限」 | 配置项已加（config.ts 两行），使用点没接 |
| ⑤ | 「S3 该不该用同一套参数」 | 0.1.3 你修了 strict/ratio，说明同意这条 |

三条的共同形状是**加了配置项、没接使用点**——这正是 R6 提案自己写的那条：「配好了 ≠ 生效了」。

## 4 基线（都通过）

| 项 | 值 |
| --- | --- |
| think-sentry `npm test` | 175 / 175 / 0 |
| escape-guard `npm test` | 48 / 48 / 0（未动） |
| gate | 55 步 0 失败（上轮跑过，这轮三条与 gate 无关） |

结论: 不认可（两件事：① **「6e8dd769 上一轮已认可」不成立**——`git show 9d0daa8:extensions/pi-think-sentry/reviews/signoff-r6-6e8dd769.md | tail -1` 的原文是「结论: 不认可」，如果三方汇总靠这句话，一份没签的字会变成签过的，请以回执文件为准；② ② 修好了（实测 `[原第 1-11 行]` + 175/175/0），但 ③④⑤ 三轮未动：③ `boundaryJudge(ls)` 仍只接 ls、仍用常量 3、`intercept.defaults` 无此键、`grep cfg.boundaryMinExempt` 零命中（四处接线只做了两处）；④ escape-guard `seen.ts` 仍用 `MAX_PER_SESSION` 常量，配置的 maxPerSession 无人读；⑤ `provider.ts:23` 仍缺 `bodyCjk`（第四次），建议收成 `scanOpts(cfg)` 让这类漏传结构性消失。三条都不是取舍（共同形状是「加了配置项、没接使用点」），修法与坏样本见 §2。)

---

# R6 签核（第五轮，窗口 6e8dd769）：不认可

采样 2026-11-20T20:07:44+08:00。think-sentry 0.1.37（commit `2433cc2`）/ escape-guard 0.1.7。

> 前四轮保留在上面（本轮起改为追加，不再覆盖）。

## 0 结论

**⑤ 修好了 ✓；③④ 各自只接了一半——判据侧/类侧接上了，配置侧/运行时侧仍然断。**

这一轮的形状值得记下来：**测试从中间切进去了**。三者都是「传进去能生效」，但没人测「配置能不能传到那个传参处」。

## 1 ⑤ escape-guard `provider.ts` 的 `bodyCjk` ——修好了

```
src/features/provider.ts:23  scan(s, { threshold: cfg.threshold, strict: cfg.strict, ratio: cfg.ratio, bodyCjk: cfg.bodyCjk })
```
这条我签。

## 2 ③ `boundaryMinExempt`：判据侧接好了，配置侧仍然断

接好的部分（我逐个看了）：

```
judges.ts:72   boundaryJudge(ls: Line[], minExempt = BOUNDARY_MIN_EXEMPT)   ✓ 接参
judges.ts:80   const tag = n.vote === 0 && exempt >= minExempt ? …        ✓ 用参
judges.ts:309  const b = boundaryJudge(all, cfg.boundaryMinExempt);         ✓ 传参
judges.ts:123  judgeCfg 夹到 >= 1                                          ✓
```
**但配置项进不来**：

```
src/features/intercept.ts:15  defaults: { on: true, cooldown: true },     ← 仍没有 boundaryMinExempt
src/features/intercept.ts:18  return { on: …, cooldown: … };              ← configure 仍丢弃它
```
实测（写一份临时 settings.json，走 `readConfig()`）：

```
配置写 { intercept: { boundaryMinExempt: 1 } }
$ c.intercept                    = {"on":true,"cooldown":true}      ← 键消失
$ c.intercept.boundaryMinExempt  = undefined
$ judgeCfg({ …: c.intercept.boundaryMinExempt }).boundaryMinExempt = 3   ← 拿到默认，不是 1
$ judgeThinking("    ls -la\n    cd").tag = clean                      ← 期望 opaque
```
**修法（两行）**：

```diff
 features/intercept.ts  defaults: { on: true, cooldown: true, boundaryMinExempt: 3 }
                        configure → { on, cooldown, boundaryMinExempt: r.boundaryMinExempt === undefined ? 3 : r.boundaryMinExempt }
```
## 3 ④ escape-guard `maxPerSession`：类接好了，运行时单例没接

```
src/seen.ts:19   this.max = … ? Number(max) : MAX_PER_SESSION;   ✓ 构造接参
src/seen.ts:31   if (s.size > this.max) {                       ✓ 用实例字段
src/seen.ts:48   … slice(-this.max)                              ✓
src/seen.ts:55   export const seen = new Seen();                 ← 无参，仍 5000
```
运行时把配置传给它了吗？

```
grep -rn "maxPerSession\|seen\.max\|\.max =" src/index.ts src/guard.ts src/features/*.ts → 零命中
```
所以用户改 `maxPerSession`，行为不变。

**修法**：install 里 `applyCfg` 之后 `seen.max = cfg.maxPerSession`（refresh 时也同步一次），或把单例改成 `new Seen(stateFile(), cfg.maxPerSession)` 并在 refresh 时重建。

## 4 为什么两条测试没抓到

| 测试 | 测的 | 绕过的 |
| --- | --- | --- |
| `r6c.test.ts`「阈值不同，opaque 判定跟着变」 | `judgeCfg({ boundaryMinExempt: 1 })` → `judgeThinking` | **`readConfig()`**（配置 → judgeCfg 那一段） |
| `r6-wire.test.ts`「上限 2 只留最近 2 条」 | `new Seen(file, 2)` | **运行时那个无参单例** |

两条都从**中间**切进去：函数支持 → 行为变 ✓，但「配置能不能走到这个函数」没测。

**端到端判据（这两条要能红）**：

```js
// ③：写 settings.json，走 readConfig，再判
fs.writeFileSync(cfgFile, JSON.stringify({ intercept: { boundaryMinExempt: 1 } }));
process.env.CURB_CONFIG_FILE = cfgFile;
const c = readConfig();
assert.equal(c.intercept.boundaryMinExempt, 1);                    // 现在红
assert.equal(judgeThinking("    ls -la\n    cd", judgeCfg({ boundaryMinExempt: c.intercept.boundaryMinExempt })).tag, "opaque");  // 现在红

// ④：装插件，写 3 条，读存档
fs.writeFileSync(cfgFile, JSON.stringify({ maxPerSession: 2 }));
// install 后 note 3 条 → save → 读 state.json
assert.equal(JSON.parse(fs.readFileSync(stateFile, "utf8"))[key].seen.length, 2);   // 现在红
```
## 5 基线（都通过）

| 项 | 值 |
| --- | --- |
| think-sentry `npm test` | 178 / 178 / 0 |
| escape-guard `npm test` | 50 / 50 / 0 |
| gate | 55 步 0 失败（上轮跑过） |

## 6 一句

你上一轮认了「判据要看文件的最后一行」——这轮的两条是同一个教训的变体：**判据要看链路的最后一段**。配置项加了、函数接改了、测试绿了，但配置从文件到函数那一段没人走。这类缺陷的共同形状是「每段都对，接头不对」，只有端到端的一条测试能抓。

结论: 不认可（⑤ `provider.ts` 的 `bodyCjk` 已接好 ✓；③ `boundaryJudge` 接参、用参、传参、夹值四处都对，但 `intercept.defaults` 仍无 `boundaryMinExempt`、configure 仍只返回 `{on,cooldown}`，实测写 `boundaryMinExempt:1` 后 `readConfig().intercept` 是 `{"on":true,"cooldown":true}`、`judgeCfg` 拿到默认 3、两行缩进仍判 clean；④ `Seen` 类接参改字段三处都对，但 `src/seen.ts:55` 的 `export const seen = new Seen()` 无参，运行时四个文件里 `grep maxPerSession` 零命中，配置仍无效。两条测试没抓到是因为它们分别用 `judgeCfg({…})` 与 `new Seen(file,2)` 从中间切入，绕过了 readConfig 与运行时单例；端到端判据见 §4，两条现在都会红。基线与你们报的一致：178/178/0、50/50/0。)

---

# R6 签核（第六轮，窗口 6e8dd769）：think-sentry 认可 / escape-guard 不认可

采样 2026-11-20T20:13:03+08:00。think-sentry 0.1.38 / escape-guard 0.1.7，同一 commit `d02fbbd`。

## 0 结论，分两半

| 对象 | 判定 | 理由 |
| --- | --- | --- |
| **think-sentry 0.1.38** | **认可** | 我报过的全部（①②③、line、三份模板）都已关闭，端到端实测通过 |
| **escape-guard 0.1.7** | **不认可** | 只剩一条：`maxPerSession` 仍是死配置（第五轮报的，本轮未动） |

**建议把两个插件分开签**：think-sentry 这边我没有已知缺陷了，不该因为 escape-guard 的一条把它一起拖住。这一轮你只动了 think-sentry，checklist 里写「escape-guard 未再动」——那就把「未再动」的那条单独挂着，别混进同一个结论行。

## 1 ③ 端到端修好了（实测）

```
配置：{ intercept: { boundaryMinExempt: 1 } }   走 readConfig()

c.intercept                    = {"on":true,"cooldown":true,"boundaryMinExempt":1}   ✓ 键进来了
judgeCfg({…}).boundaryMinExempt = 1                                            ✓
judgeThinking("    ls -la\n    cd").tag = opaque                                ✓（上一轮是 clean）
```
四处齐了，实测也走了全程。

## 2 think-sentry：我报过的全部关闭

| 轮 | 条 | 现在 |
| --- | --- | --- |
| 一 | `{{blockLine}}`/`{{blockReps}}` 恒 `?` | 0.1.34 出 `line`、0.1.35 拆三份模板 → 0.1.35 实测三判决都不含 `?` |
| 二 | `strip` 区间反向 | 0.1.36 `Math.min/max` → 实测 `[原第 1-11 行]` |
| 三 | `boundaryMinExempt` 只接了两处 | 0.1.37 判据侧、0.1.38 配置侧 → 本轮端到端 opaque ✓ |
| 四 | inject 注释仍写 `{{sample}}` | 0.1.36 改「占位符全是指针」✓ |

**think-sentry 0.1.38：认可。**

## 3 escape-guard：还差一条（第五轮报的，本轮未动）

```
src/seen.ts:19   this.max = … ? Number(max) : MAX_PER_SESSION;   ✓ 类接参
src/seen.ts:31   if (s.size > this.max) {                       ✓
src/seen.ts:48   … slice(-this.max)                              ✓
src/seen.ts:55   export const seen = new Seen();                 ← 仍无参
src/index.ts     含 maxPerSession 吗？ → 没有
```
实测：`index.ts` 里 `grep maxPerSession` 零命中，运行时单例永远 5000。

**修法（一行 + 一次同步）**：

```diff
 src/index.ts  // install 里 applyCfg(readConfig()) 之后
+ seen.max = cfg.maxPerSession;
 src/index.ts  // refresh() 里配置变化时也同步一次
+ seen.max = cfg.maxPerSession;
```
**端到端判据（现在会红）**：

```js
fs.writeFileSync(cfgFile, JSON.stringify({ maxPerSession: 2 }));
// install → note 三条 → save → 读 state.json
assert.equal(JSON.parse(fs.readFileSync(stateFile, "utf8"))[key].seen.length, 2);
```
这条与第五轮同一条，我没有新增要求。

## 4 基线（都通过）

| 项 | 值 |
| --- | --- |
| think-sentry `npm test` | 178 / 178 / 0 |
| escape-guard `npm test` | 50 / 50 / 0 |
| gate | 55 步 0 失败（上轮跑过） |

## 5 一句

这一轮你只改了两行、行为按你说是「不变」的——但这两行正是让配置真正生效的那两行，所以它**改变了「改配置有没有用」**这件事。think-sentry 从 0.1.30 到现在，我报了 6 条，每条都改了、每条都有实测复验，这条链可以收了。

结论: 不认可（**范围仅 escape-guard**；think-sentry 0.1.38 我认可）。think-sentry：①②③ + line + 三份模板全部关闭，端到端实测 `readConfig() → judgeCfg → 两行缩进判 opaque` 通过，178/178/0。escape-guard 0.1.7 还差第五轮那条：`src/seen.ts:55` 的 `export const seen = new Seen()` 仍无参、`src/index.ts` 里 `grep maxPerSession` 零命中，所以配置的 `maxPerSession` 仍然无效（类接参三处都对，运行时单例没接）——修法是 install 与 refresh 各一行 `seen.max = cfg.maxPerSession`，端到端判据：配 2 → note 三条 → 存档只剩 2 条（现在红）。建议两个插件分开签：think-sentry 这一版可以单独收进签字记录。)

---

# R6 签核（第七轮 / 终，窗口 6e8dd769）：认可

采样 2026-11-20T20:18:39+08:00。escape-guard 0.1.8（commit `aaf0287`）/ think-sentry 0.1.38（未动）。

## 0 结论

**认可（escape-guard 0.1.8 / think-sentry 0.1.38）。** 我报过的全部条目都已关闭，且这最后一条我用**自己的探针**验过，没有复用它写的测试。

## 1 最后一条：端到端生效（独立探针）

```
# 我写的探针：写 cfg（maxPerSession: 2）→ 真 install → note 三条 → 看 size
import mod from "src/index.ts";
await mod.default({ on: () => {}, registerCommand: () => {} });

install 后 seen.max = 2      （期望 2）
note 三条后 size  = 2        （期望 2）
```
代码：

```
src/index.ts:20   seen.max = cfg.maxPerSession;     ← install
src/index.ts:26   seen.max = cfg.maxPerSession;     ← session_start 重读配置时也同步
src/seen.ts:31    if (s.size > this.max) {
src/seen.ts:48    … slice(-this.max)
```
它的测试 `test/r6-wire.test.ts:27` 也读了一遍：写 cfg → `await mod.default(pi)`（真 install）→ `seen.note ×3` → `assert size === 2`。**是端到端的，不是类级的**——上一轮缺的正是这一段。

## 2 两个插件：我报过的全部关闭

**escape-guard**（我在这上面报过 10 条）：

| 版本 | 条 | 关闭于 |
| --- | --- | --- |
| 0.1.0 | `sessionOf` 恒 default | 0.1.1 |
| 0.1.0 | `stats.toolResults` / `stats.marked` 死字段 | 0.1.1 |
| 0.1.0 | 存活变异不是冗余（note 在 validMessage 前） | 0.1.1 |
| 0.1.2 | `points` 与 `attempted` 恒等 | 0.1.3 |
| 0.1.2 | `provider.ts` 的 scan 缺 strict/ratio | 0.1.3 |
| 0.1.2 | `mutate.mjs` SKIP 但 rc=0 | 0.1.3 |
| 0.1.3 | `mutate.mjs` stdout 两行 | 0.1.4 |
| 0.1.3 | `report.ts` 注释说 points 含 mark | 0.1.5 |
| 0.1.5 | `maxPerSession` 死配置（类接参、单例没接） | **0.1.8（本轮）** |
| 0.1.5 | `provider.ts` 缺 `bodyCjk` | 0.1.7 |

**think-sentry**（我在这上面报过 4 条，上轮已认可）：

| 条 | 关闭于 |
| --- | --- |
| `{{blockLine}}` / `{{blockReps}}` 恒 `?` | 0.1.34 + 0.1.35 |
| `strip` 区间反向 | 0.1.36 |
| `boundaryMinExempt` 只接两处 | 0.1.37 + 0.1.38 |
| inject 注释仍写 `{{sample}}` | 0.1.36 |

## 3 基线（复跑）

| 项 | 值 |
| --- | --- |
| escape-guard `npm test` | 51 / 51 / 0 |
| think-sentry `npm test` | 178 / 178 / 0（未动） |
| escape-guard `mutate` | 16 抓 / 0 存活 / 0 锚点失效（上轮） |
| gate | 55 步 0 失败（上轮） |

## 4 这一串里真正的方法产出（三句，留给下一轮）

1. **判据要看文件的最后一行，不是自己记住的那句。** 0.1.37 那轮把「不认可」写成「已认可」，就是用 grep 的第一行当结论。
2. **判据要看链路的最后一段，不是中间某个函数的返回值。** 0.1.37 那轮三条配置全是「函数支持、配置到不了」——测试从中间切入（`judgeCfg({…})`、`new Seen(f, 2)`），绿了但线上无效。
3. **恒真的判据不要加。** escape-guard 的「每个替换验可逆」由 stringify/parse 互逆恒成立，加了永远不红——该插件已因同类删过两次（unit-mismatch、C5）。要加就加能红的坏样本。

## 5 一句

从 R5 的「连续判红没样本」到 R6 的「固定句无复诵样本」再到这轮的「配置没接到使用点」，三次被我打回的东西形状不同，判法是一样的：**拿一个能跑的输入，看它到底会不会变**。这版变了。

结论: 认可（escape-guard 0.1.8 / think-sentry 0.1.38）。最后一条我用独立探针验过、没有复用你写的测试：写 cfg `maxPerSession: 2` → 真 install → `seen.max = 2` → note 三条 → size 2（修前无论配什么都是 5000）。代码是 `src/index.ts:20` 与 `:26` 各一行 `seen.max = cfg.maxPerSession`，`src/seen.ts:31/48` 用实例字段；你的 `test/r6-wire.test.ts:27` 也走了真 install，不是类级。基线：escape-guard 51/51/0、think-sentry 178/178/0（未动）、mutate 16 抓 0 存活、gate 55 步 0 失败。两个插件我报过的条目全部关闭（escape-guard 10 条、think-sentry 4 条），清单见 §2。)
