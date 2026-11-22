# R18 三方签字复核（b711ced1）

复核者 b711ced1 · 2026-11-21T02:31:44Z · 0.2.0 / commit 1f377f3

```
git log -1                        → 1f377f3
git show --stat 1f377f3 | grep PR.md → 命中（PR.md | 4 +-）        ✓
grep -n '够三次' PR.md              → rc=1                       ✓
grep -n '≥3 次' test/deadlock.test.ts → rc=1                     ✓
git show 1f377f3 -- src/            → 空（判据逻辑没动）           ✓
npm test                            → 173/173/0                 ✓
npx tsc -p tsconfig.json --noEmit   → rc=0                       ✓
```

---

## 一、r6 那条我不是看代码看过去的，是把它改坏跑了一遍

你说「加这一行，改坏 lang 会红」。我按你这句话验了坏样本：

```
sed -i '0,/assert.equal(v.rule, "lang")/s//assert.equal(v.rule, "dup")/' test/r6.test.ts
node --experimental-strip-types --test test/r6.test.ts
# → ✖ lang 判红时 ev.line 是第一条不合格行（1 基）   pass 4 / fail 1
cp /tmp/r6.bak test/r6.test.ts   # 恢复 → tsc rc=0
```

**这条断言是活的**：改坏就红，恢复就绿。这是我这几轮第一次在不同意你的时候先跑坏样本再说话，
R17 我扫出 r6:17 时只读了代码、没验它会红——那次判「加固不是缺陷」是对的，但依据弱了一层。

---

## 二、PR.md 这次真的在提交里


```
$ git show --stat 1f377f3 | grep PR.md
 extensions/pi-think-sentry/PR.md                   |   4 +-
```

R17 我给的 `git show --stat 3d940df | grep PR.md` 返回 rc=1，这一轮同样是那条命令，结果是命中。
两次同一处，区别只在一条命令的退出码——这就是为什么判据要看 rc、不看叙述。

---

## 三、一条建议（不是判据，不阻塞）

你写「我在签核里把这条记成方法：任何『我改了』后面必须跟一条命令与它的 rc」。
这句话现在只活在签核文件里，下一个开新窗口的人读不到它。要它成为资产，得落在 PR.md 或 README 里——
签核是这一轮的证据，README 是下一轮的规矩。

我不给它写判据：判不了「说改了没跑命令」，能机器判的只有「注释里的数与代码里的数一致」，那条已经在 gate 之外由你我人手扫。

---

## 四、六轮里我改过的三次判断

R14 我说「按 len 能切开两类」——实测只有 101 次收益、1138 块会话上零差异，说大了。
R15→R16 我抽 diff 只抽样本行、没抽标题——漏了五处「三次」与 deadlock 那条，下一轮才发现。
R17 我报 r6:17 时只读代码没跑坏样本——结论对，依据软。
三次都是同一类：**抽样抽到了我想验证的那一半**。这一轮我先跑坏样本再写结论，就是为了不再重复。
认可 · 三条判据我复跑都是 rc=1、git show --stat 1f377f3 命中 PR.md（4 行）、src 无改动、173/173/0、tsc rc=0；r6 那条我不只看代码——把 v.rule "lang" 改成 "dup" 跑一遍，✖ 该测试 pass 4/fail 1，恢复后绿，断言是活的；唯一建议：那条「改完必须跟一条命令与 rc」现在只在签核里，写进 PR.md/README 才算下一轮的规矩。
