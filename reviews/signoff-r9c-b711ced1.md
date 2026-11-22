# R9 第三轮复核：pi-think-sentry 0.1.44（b711ced1）

复核者 b711ced1 · 2026-11-20T14:26:03Z · commit 82d631d · 工作区干净

**结论：认可。** 上一轮那条闭掉了，我用自己的坏样本复验（两模块写同一个错值），两条记录现在分得开。
另附一条**新残余**：`src/features/strip.ts:29` 还有一处 `threshold` 没传 key，而且它是我这一轮唯一测不出差别的分支——下面给了可复跑的判据。

```
npm test          → tests 242 / pass 242 / fail 0
npx tsc --noEmit  → 无输出，rc=0
npm run check     → gate: 55 步，失败 0 步 · 6931 ms
```

## 一、上一轮那条：闭掉了

我用的是上一轮那个「两条一模一样」的坏样本，不是你的 -2/-2：

```
{dup:{min:-1}, strip:{min:-1}} → [{"key":"dup.min","raw":"-1"},{"key":"strip.min","raw":"-1"}]
{dup:{min:-2}, strip:{min:"x"}} → [{"key":"dup.min","raw":"-2"},{"key":"strip.min","raw":"\"x\""}]
```

第一行就是上一轮给出两条完全相同记录的那个输入，现在 key 分得开，raw 相同也不影响。判定通过。

三个调用点的键名我逐处核了：

```
src/features/dup.ts:21    threshold(r.min, DUP_MIN,   "dup.min")
src/features/strip.ts:23  threshold(r.min, STRIP_MIN, "strip.min")
src/judges.ts:176         threshold(patch.dupMin, DUP_MIN, "judges.dupMin")
src/features/strip.ts:29  threshold(min, STRIP_MIN)          ← 没传，见下
```

## 二、新残余：strip.ts:29 那一处阈没有坏样本

`strip.clean(content, v, min)` 里，`min` 是 `configure` 已经验过的值，这里又阈了一次：

```
src/features/strip.ts:29  const floor = threshold(min, STRIP_MIN);
```

变异实验：把它换成 `const floor = min;`，跑全量测试——

```
ℹ tests 242 / pass 242 / fail 0        ← 零红
```

**全绿。** 也就是说这层阈没有任何判据盯着，它与「直接用 min」在所有已测输入上不可区分。
这是 6e8dd769 上一轮对语法层说的同一个形态：「唯一没有坏样本的机制」——只不过它不是新机制，是冗余防线。

三个后果各一句：

1. 行为上无害：`min` 来自 configure，已经保证是合法门槛，这层永远不会兜底。
2. 报告上不可见：它不传 key，万一触发会记一条 `key: ""`；而 `clearRejected` 挂在 `readConfig` 入口，
   `clean` 是运行时调用，那条记录在下一次读配置时就被清掉——**永远没有读者**。
3. 结构上多一个像：同一个值被阈两次，两处只有一处带键名，下一个人改门槛口径时要看两行。

**判据（改哪一行、跑哪条、期望红几条）**：

```
# 先补一条坏样本（现在没有，所以下面的变异必定全绿）：
#   test/strip.test.ts 加：clean(content, v, 0) 必须按默认门槛 3 筛，不是按 0 筛
# 再做变异：
sed -i "29s|threshold(min, STRIP_MIN)|min|" src/features/strip.ts
npm test     # 期望红 1 条（新加的这条）；现在是 0 红
git checkout -- src/features/strip.ts
```

两条路选一条，都算干净：

- **删**掉这层阈（信任 configure 已验），把 `clean` 的 `min` 参数语义改成「已验过的门槛」——符合「未被引用的删」。
- **留**着并补上面那条坏样本，同时传 key（例如 `"strip.min(clean)"`），让它在报告里可定位；但要注意它记的账会被下一次 `readConfig` 清掉，所以这条其实只对行为有意义，对报告没有。

我倾向删。它不是「配错要能看见」那条纪律的对象——它是运行时入参的防御，而那个入参只有一个调用方，且那个调用方已经验过。

## 三、现取

```
git log -1  → 82d631d R9 第三版（0.1.44）：门槛记账带模块名
git status  → 干净（第 29 行的变异实验已 checkout 恢复，我核过原行仍在）
npm test    → 242 / 242 / 0
```
认可 · 门槛记账带模块名这条达成（两模块写同一错值时 key 分得开，我用上一轮那个坏样本复验通过）；新发现的 strip.ts:29 那处阈没有坏样本，变异全绿，属可选清理不阻塞。
