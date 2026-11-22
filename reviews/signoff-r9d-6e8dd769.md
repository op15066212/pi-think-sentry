# R9 第四轮复核记录（6e8dd769）

---

# R9 第四轮复核（窗口 6e8dd769）：认可

对象：pi-think-sentry 0.1.45，commit `03c7502`。两条都验了，另外有两处要更正（其中一处是我自己上一轮说错）。

## 0 结论

**认可。** 一条（key 必填）修得比要求对，另一条（tsc 假绿）修成了真判据且坏样本会红。

## 1 ① key 改成必填

```
src/threshold.ts:37  export const threshold = (raw: any, fallback: number, key: string): number
src/features/dup.ts:21     threshold(r.min, DUP_MIN, "dup.min")
src/features/strip.ts:23   threshold(r.min, STRIP_MIN, "strip.min")
src/features/strip.ts:29   threshold(min, STRIP_MIN, "strip.min.clean")
src/judges.ts:176          threshold(patch.dupMin, DUP_MIN, "judges.dupMin")
```

四处都带名了，含上一轮我指的 `strip.ts:29`。缺省值是删掉的，不是补的——这比我要的对：留默认值就是允许下一个调用点静默丢名，而丢名正是这条残余的成因。

## 2 ② tsc 从假绿改成真判据

**好状态**（我真跑了，不接管道）：

```
$ node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit > /tmp/x.log 2>&1; echo rc=$?
rc=0            0 个 error TS
```

**坏样本**（我自己塞文件，不用你的测试）：

```
$ printf 'const x: number = "not a number";\n' > src/__probe_fail.ts
$ node .../tsc -p tsconfig.json --noEmit > log 2>&1; echo rc=$?
rc=1
1 个 error TS：src/__probe_fail.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'.
```

删掉文件后回到 rc=0。基础设施也对了：`node_modules/typescript/bin/tsc` 存在，`devDependencies` 里有 `typescript ^7.0.2` 与 `@types/node`。

```
$ npm test   → tests 245 / pass 245 / fail 0
$ cd ~/.pi/agent && npm run check → gate: 55 步，失败 0 步
```

## 3 要更正一：你的病因诊断对了一半

你写「没有 tsconfig 时，塞一个必错文件，tsc **确实**抓到了 error（所以不是『一个文件都没读』）」。这一半不成立。实测（同一份副本，删掉 tsconfig，放同一个必错文件，不接管道，跑两次一致）：

```
$ node node_modules/typescript/bin/tsc --noEmit > log 2>&1; echo rc=$?
rc=1
0 个 error TS
输出是帮助文本：Version 7.0.2 / tsc: The TypeScript Compiler / COMMON COMMANDS ...
```

所以真相是三件事同时成立：

| 说法 | 对不对 |
| --- | --- |
| 没有 tsconfig 时 tsc 不读任何文件 | **对**（0 个 error TS，输出是帮助） |
| rc 是被管道掩盖的 | **对**（直接跑是 rc=1，不是 0） |
| 那时 tsc 抓到了 error | **不对**（0 个 error TS） |

这一条重要，因为它决定病史：如果「检查有效、只是 rc 读错」，那前几轮的结论只是**没被验证**；实际是**检查面本身是空的**。「tsc 干净」这句话此前既没有证据，也不可能有。

顺带一处我自己的错：我上一轮写「rc=0」。那是错的——我当时跑的是 `npx tsc --noEmit 2>&1 | head -5; echo rc=$?`，拿的是 `head` 的码。**我和你犯的是同一个错，只是我先报了它的存在。** 这一轮我用不接管道的方式复跑，得到 rc=1。

## 4 要更正二：rc=2 实测是 rc=1

你写「必错文件 → rc=2」。实测 rc=**1**（tsc 的 1 是「有类型错误」，2 是「编译器内部错误」）。不影响结论，但这轮报告里的数字要按实测写。

## 5 一句

「把 key 改成必填」比「再补一个字符串」对，因为前者让漏传变成编译错误而不是等一个人来写探针。tsc 那条你也修到底了：坏样本会红、基础设施本地化、lint:ts 覆盖不到的地方由插件自己守——这三件齐了，这条基线以后可以说。唯一要改的是**它怎么坏掉的**：不是「抓到了错但 rc 被掩盖」，是「什么都没检查，rc 也被掩盖」。

认可 · 两条都实测通过：key 必填且四处带名（dup.min / strip.min / strip.min.clean / judges.dupMin），tsc 好状态 rc=0、坏样本 rc=1 且 1 个 error TS、基础设施本地化；245/245/0、gate 55 步 0 失败；两处更正供记录：① 无 tsconfig 时 tsc **不读文件**（0 个 error TS，输出是帮助），不是「抓到了 error」——rc 是被管道掩盖的（直跑 rc=1），我上一轮报的 rc=0 也是同一个管道错；② 必错样本实测 rc=1 不是 rc=2。
