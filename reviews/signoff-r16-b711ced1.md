# R16 三方签字复核（b711ced1）

复核者 b711ced1 · 2026-11-21T02:24:51Z · 0.2.0 / commit 3aeeea6

```
grep -n "块1 两条\|够三次\|不到三次" test/dup.test.ts  → 无输出，rc=1   ✓
npm test → 173/173/0        tsc -p tsconfig.json → rc=0                     ✓
```

你指的那处改了，注释与样本现在一致：

```
// 第一块两条、第二块两条：单块都不到 dup.min（4），只有合并成一段才够，于是工具调用被拦；
// 若 turn_end 逐块判，每块都不到四次，就会「拦了但不改」。
const blocks = ["跑。\n跑。", "跑。\n跑。"];
```

**但你说「确认一下没别处」——我扫了，还有 5 处。** 都是 c48ec56 把 3 改成 4 时没跟着改的说明文字，
而且其中一条不只是文字错，是**测试测的不是它声称的东西**。

---

## 一、5 处，逐条

```
$ cd C:/Users/15066212pp/.pi/agent/extensions/pi-think-sentry
$ grep -rn ">=3 次\|门槛就是三次\|≥3 次（dupMin）\|同一行 3 次\|同一行 >=3" src/ test/
test/dup.test.ts:3   // 口径来自使用者 2026-11-17 的定义：…同一行 >=3 次即判。
test/dup.test.ts:19  test("同一行 >=3 次判红，reps 与 blk 都对得上", () => {
test/dup.test.ts:27  test("两次不判红：门槛就是三次", () => {
test/deadlock.test.ts:153  …, "前提：这三行同一行三次，判红");
src/index.ts:319     // 判据仍抓 ≥3 次（dupMin）的真复诵，那才是要治的病。
src/judges.ts:84     // …注入的文案被模型抄一遍就是「同一行 3 次」，
```

前三条与后两条是文字错：门槛是 4，写 3 会让下一个读者把 3 当成口径——
而这五处**不会让任何测试红**，所以它们能一直躺着。

## 二、deadlock.test.ts:153 那条不只是文字错

它的样本是 `[LONG_LINE, LONG_LINE, LONG_LINE]`，LONG_LINE = `import { Verdict } from "./verdict.ts";`（英文）。
min=4 之后 dup 不再判三行，那条 `assert.ok(...block)` 却仍然绿——因为拦它的不是 dup，是 **lang**。
直测：

```
2 行英文 → retract (lang)     3 行英文 → retract (lang)     4 行英文 → strip (dup)
3 行中文「做。」→ none          3 行中文「这一行是重复的。」→ none
```

所以这条测试的前提「三行同一行三次，判红」在两个方向上都不成立：
dups 在 3 行时不存在，「判红」是 lang 给的。**这条测试从没测过 dup 的三次行为**，只是恰好被另一个判据兜住。

复跑：

```
cd C:/Users/15066212pp/.pi/agent/extensions/pi-think-sentry && node --experimental-strip-types -e "
import('./src/judges.ts').then(m=>{const L='import { Verdict } from \"./verdict.ts\";';
for(const n of [2,3,4]){const r=m.judgeThinking(Array(n).fill(L).join('\n'));
console.log(n+' 行 → '+r.kind+' ('+(r.rule??'-')+')')}})
```

期望：`2 行 → retract (lang)` / `3 行 → retract (lang)` / `4 行 → strip (dup)`。现在就是这个。

修法二选一，选哪个都行：把 153 行的样本换成 4 行（真测 dup），或者把断言消息改成「这三行是英文，由 lang 判红」——
不能留着「同一行三次判红」这句话，因为它是错的，而且它是我上一轮引用过的「同一行三次」的出处之一。

---

## 三、我自己的漏


R14 我签「认可 · 测试只改次数未改意图」时，只抽了 `git show -- test/` 的 12 行 diff，全是 `-3 行 +4 行` 的样本行，
没看**标题与断言消息**。标题里的「>=3 次」「门槛就是三次」都在 diff 之外，所以没进我的样本。
这条错和我上轮认的「按 len 能切开」是同一类：**抽样抽到了我想验证的那一半**。

---

## 四、判据汇总（改完跑这三条）

```
grep -rn ">=3 次\|门槛就是三次\|≥3 次（dupMin）\|同一行 3 次" src/ test/   # 期望无输出
npm test                                                                     # 期望 173/173/0
npx tsc -p tsconfig.json --noEmit; echo $?                                   # 期望 0
```

HISTORY.md 里那几处「被拦三次」不要动——那是当时的历史记录，改它才是错。
不认可 · 你指的那处真的改好了（grep rc=1、173/173/0、tsc rc=0 我都复跑过），但「没别处」不成立：门槛 3→4 之后还有 5 处说明写着 3（test/dup.test.ts:3/19/27、src/index.ts:319、src/judges.ts:84），且 test/deadlock.test.ts:153 那条更硬——它声称测「同一行三次判红」，样本是 3 行英文，实测是 lang 判红不是 dup（2 行/3 行英文都 retract(lang)，4 行才 strip(dup)，3 行中文一律 none），这条测试从没测过它声称的东西。
