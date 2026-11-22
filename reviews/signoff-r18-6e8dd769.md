# R18 复核记录（6e8dd769）

---

# R18 复核（窗口 6e8dd769）：认可

## 0 结论

三条判据全部 rc=1，PR.md 这次真在提交里，三处新文字与 r6 的断言我都看过原文。src 一行没碰，npm test 173/173/0。

## 1 我复跑的

```
$ grep -n '够三次' PR.md                          → 无输出  rc=1
$ grep -n '≥3 次' test/deadlock.test.ts            → 无输出  rc=1
$ git show --stat 1f377f3 | grep PR.md
  extensions/pi-think-sentry/PR.md | 4 +-                rc=0

PR.md:101  判法算一遍哪些行够 dup.min 次，删行时又算一遍。…
PR.md:115  跨块那条用例还在：合并后够四次（dup.min），逐块删也要删得动。
deadlock:88  // 取舍：…真复诵（≥ dup.min 次，默认 4）仍然被 judgeThinking 直接抓住。

$ git show --stat HEAD | grep src/                 → 无输出  rc=1（src 没碰）
$ npm test                                          → 173/173/0
```

r6 那行断言我看了，形状对：

```
assert.equal(v.kind, "retract");
assert.equal(v.rule, "lang");    // 新加
assert.equal(v.ev.line, 1);
```

样本是 `["a","b","中"]` 各重复 80/80/20 —— 三行互不相同，dup 结构上不在场，所以这条断言锁的是 lang 而不是碰巧。它挡的是「把 retract 换回 strip 或把 rule 改坏」——那正是只断言 kind 会漏的形状。

## 2 一处我顺手核的

全仓 grep `够三次|>=3 次|≥3 次`（排除 reviews），只剩 `docs/guard-rules.md:5` 的 frag 口径。
**那条不是 dup**：frag 是另一个组件（guard.ts）的门槛，`src/` 里没有 frag 模块，`src/defaults.ts` 里也只有 dup/lang/strip/inject/binding 五项。所以它保持 3 是对的，不用跟着改。

## 3 一句

这轮比三行字更值的是你自己写下的那条方法：**「我改了」后面必须跟一条命令与它的 rc，rc 不是我以为的那个数就还没改。** 我在 R17 就是靠 `git show --stat 3d940df | grep PR.md` 的 rc=1 钉住的——那条命令正是这条方法的形状。把它写进签核流程，比这一轮改的三行字有用得多。

认可 · 三条判据实测：`grep -n '够三次' PR.md` 无输出 rc=1、`grep -n '≥3 次' test/deadlock.test.ts` 无输出 rc=1、`git show --stat 1f377f3 | grep PR.md` 命中 4 行 rc=0；PR.md:101/115 与 deadlock:88 的原文已改成 dup.min 口径；r6 新增 `assert.equal(v.rule, "lang")` 与三行互不相同的样本匹配（dup 结构上不在场）；`git show --stat HEAD | grep src/` 无输出，npm test 173/173/0；`docs/guard-rules.md:5` 的「≥3 次」是 frag 口径（另一组件），本仓 src 无 frag 模块，不改是对的。
