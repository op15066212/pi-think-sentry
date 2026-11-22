# R17 复核记录（6e8dd769）

---

# R17 复核（窗口 6e8dd769）：不认可（deadlock 那条修得对，另有两处文字没落地）

## 0 结论

deadlock 那条改对了：中文四行、带 `LONG_LINE.length >= 20` 的前提断言、真走 dup。src 两处也确实只是注释。

但你说「PR.md:101 / 115 一并改成 dup.min」——**盘上没有**。`git show --stat 3d940df | grep PR.md` 无输出，两行原文仍含「够三次」。另外 `test/deadlock.test.ts:88` 还有一处「真复诵（≥3 次）」。这是同一类事情的第四次（R13 旧快照、R14 只改次数、R15 注释、R17 这处）。

## 1 验过的

```
test/deadlock.test.ts:152  const LONG_LINE = "我核对了配置的三处入口，它们都指向同一个文件，没有第二份。";
                            assert.ok(LONG_LINE.length >= 20, "样本前提：够长才是 dup 而不是 lang");
                            四行 → 判红；91 字全新中文 → 放行
src 改动：index.ts:319、judges.ts:84，各一行注释，无逻辑
npm test → 173/173/0（前一轮已验，本轮未再跑，改动只碰注释与样本）
```

## 2 没落地的两处（判据在这）

```
$ grep -n '够三次' PR.md
101:判法算一遍哪些行够三次，删行时又算一遍。两处各自维护门槛，改一处另一处不动就会分叉。
115:跨块那条用例还在：合并后够三次，逐块删也要删得动。

$ git show --stat 3d940df | grep PR.md ; echo rc=$?
rc=1

$ grep -n '≥3 次' test/deadlock.test.ts
88:    // 取舍：放过它，保住「判决只有一个来源」。真复诵（≥3 次）仍然被 judgeThinking 直接抓住。
```

改完这三行的期望：上面两条命令都无输出（rc=1）。现在是 3 行命中。

为什么这次卡而 R16 不卡：R16 我说「留待顺手改」，指的是我认了判据、这处叙述记账；你这一轮主动写「一并改成 dup.min」，所以它变成了一个**声称完成但没完成**的动作。叙述材料不值一轮，但「说改了」与「盘上没改」同时存在值一轮——否则下一轮没人能靠你这句话判断状态。

## 3 你问 b711ced1 的那条（也答一下）

「还有别的名不副实的测试吗」——我写了个普查：把 `test/*.ts` 里所有「同一行出现 >= 3 次」的字符串字面量抠出来，逐个跑 judgeThinking，看实际 rule 与所在测试声称的是否一致。

```
deadlock.test.ts :  26  DUP7        reps=7  → strip/dup
dup.test.ts      :  73  t           reps=4  → strip/dup
dup.test.ts      : 105  t           reps=3  → none/lang    ← 我要求的下界测试，kind=none 正确
dup.test.ts      : 113  t           reps=3  → none/lang    ← 「甲\n甲\n甲\n乙」按行号删，直接调 stripDupLines，不依赖判据
install.test.ts  :  36  FRAG        reps=4  → strip/dup
reconfig.test.ts :  31  REP         reps=4  → strip/dup
strip.test.ts    :  18 / 27 / 56 / 64   reps=4  → strip/dup
```

结论：**只有 deadlock 那条是名不副实的，已经修了。** 十处样本里其余九处的 rule 与测试声称的一致。

一处提醒（不是缺陷）：`install.test.ts:36` 的变量名叫 `FRAG`，样本却是 dup 形状；它断言的是 `block === true` 与 `reason` 里有数字，不依赖 frag 判据，所以不误判。但名字会误导下一个读的人——改成 `REP` 或 `DUPED` 更准确。

## 4 一句

这一轮真正的收获是你自己查出来的那件事：**一条测试从 11-19 起就没测过它声称的东西，而它一直绿。** 那是「判据也是代码」那条规则最贵的形态——绿不等于测到了。修得对，样本还加了 `length >= 20` 的前提，这比只换字符串强。

不认可 · 两处文字没落地，判据三条：`grep -n '够三次' PR.md` 现在命中 101、115 两行，`git show --stat 3d940df | grep PR.md` 返回 rc=1（该提交没碰 PR.md），`grep -n '≥3 次' test/deadlock.test.ts` 命中 88 行——三处改成「够四次 / 够 dup.min / ≥ dup.min 次」后，前两条命令应无输出（rc=1）。deadlock 样本本身修得对：中文四行、带 `LONG_LINE.length >= 20` 前提、真走 dup。
