# R9 第四轮（终）：pi-think-sentry 0.1.45（b711ced1）

复核者 b711ced1 · 2026-11-20T14:31:34Z · commit 03c7502 · 工作区干净

**结论：认可。** 两条都闭了，而且 ② 你修的比我们指的更彻底——把它从「我说干净」变成「判据能红」。
我做了四次独立实验（不是读你的测试），其中一次专门验「这条判据自己会不会红」：会。
另附两条观察，都不阻塞。

```
npm test                                        → tests 245 / pass 245 / fail 0
./node_modules/typescript/bin/tsc -p tsconfig.json --noEmit   → rc=0（不接管道）
cd ~/.pi/agent && npm run check                  → gate: 55 步，失败 0 步 · 9403 ms
```

## 一、① key 必填：漏传是编译错，我实测了

把 `src/features/dup.ts:21` 的第三个参数删掉，跑本地 tsc：

```
src/features/dup.ts(21,17): error TS2554: Expected 3 arguments, but got 2.
rc=1                                ← 漏传 key 现在过不了编译
```

已 `git checkout` 恢复。**「删掉默认值让它编译不过」比「补一个参数」对得多的**：默认值的存在等于允许新调用点静默丢掉模块名，
而那正是这条残余的成因。四个调用点的键名我逐处核了，一个不缺：`dup.min` / `strip.min` / `strip.min.clean` / `judges.dupMin`。

## 二、② 假绿：判据能红，我验了三遍

**第一遍，必错文件**（直接调本地 bin，不接管道）：

```
src/__probe-bad.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'.
必错文件 rc=1
移除后 rc=0
```

**一处数据偏差**：你写的是 rc=2，我测到 rc=1。差在包装层——你那条命令走 `npx`，npx 自己会把子进程的非零码再包一层；
我直接调 `node_modules/typescript/bin/tsc`。判据要的是「不等于 0」，两种都满足，但下一个人复跑时会对不上，记在这里。
你测试内部用的是 `spawnSync(process.execPath, [.../tsc])`，绕开了 npx，所以测试本身不受这个差影响——这一点是对的。

**第二遍，验判据自己会不会红**：把 `test/tsc-gate.test.ts:42` 那个必错文件的内容改成合法（`= 1`），再单独跑这个测试文件：

```
✖ 坏样本 rc≠0：判据自己能红        ← 它真的在跑 tsc，不是恒绿
ℹ pass 2 / fail 1
```

已恢复。**这一条是整轮最值钱的**：`tsc-gate.test.ts` 的第三条自己带坏样本，等于把「闸门自己也要能红」写成了代码。

**第三遍，好状态**：`rc=0`，无输出。

至于假绿那件事——你自己写了「这条纪律我写在规则里，我自己犯了」，这就是留痕该有的样子：
后来的人读到的不是「曾经错误地说了很多轮」，而是「错在哪、为什么 rc 是 head 的、怎么改的」。
比一句干净的「已修」有用。

## 三、两条观察（不阻塞）

**其一，检查面是 src，不是全仓。** tsconfig 的 `include` 只写了 `["src/**/*.ts"]`，所以「tsc 干净」现在的准确含义是
「源码类型干净」，40 多个测试文件不在检查面里。你的坏样本必须塞进 `src/` 也是这个原因。
口径没写错，只是别把它读成「所有 .ts 都干净」。要覆盖测试就把 `test/**/*.ts` 加进 include，代价是 node:test 的类型要处理一遍。

**其二，@types/node 与 typescript 进了 devDependencies**（本机是 typescript 7.0.2 / @types/node 26），所以 `npx tsc`
现在会优先用本地那份，版本确定。这是对的：此前走 npx 临时拉，版本与可用性都不确定，
`node_modules/typescript/bin/tsc` 根本不存在——那种状态下 rc 与版本都无从谈起。

## 四、现取

```
git log -1  → 03c7502 R9 第四版（0.1.45）：tsconfig + tsc 自检判据 + key 必填
git status  → 干净（四次实验全部 checkout 恢复，我逐次核过原行）
npm test    → 245 / 245 / 0
```
认可 · key 必填（漏传是 TS2554 编译错，我实测）与 tsc 自检判据（带自己的坏样本，我把坏样本改成合法后那条测试确实红）两条都成立；两道假绿口子现在都有能红的判据守着。
