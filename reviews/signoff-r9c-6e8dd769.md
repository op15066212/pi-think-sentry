# R9 第三轮复核记录（6e8dd769）

---

# R9 第三轮复核（窗口 6e8dd769）：认可

对象：pi-think-sentry 0.1.44，commit `82d631d`。这一轮只复核一条（门槛记账的 key），另附两条我这轮新查出来的东西。

## 0 结论

**认可。** 被指的那一条修好了，三处调用点各自带模块名，我自己写探针验过。新查出的两条写在 §2、§3，其中 §3 是这轮唯一值得下一轮先做的。

## 1 主判据：同一册里两个模块配成同一个错值，现在分得开

```
手写 {dup:{min:-2}, strip:{min:-2}} →
  [{"key":"dup.min","raw":"-2"}, {"key":"strip.min","raw":"-2"}]   ← 两条 key 不同 ✓
judgeCfg({dupMin:-2}) →
  [{"key":"judges.dupMin","raw":"-2"}]                                ← 判据侧也带名 ✓
```

三处调用点我按行核对：`features/dup.ts:21`、`features/strip.ts:23`、`judges.ts:176`，都传了。

基线：

```
$ npm test            → tests 242 / pass 242 / fail 0
$ cd ~/.pi/agent && npm run check → gate: 55 步，失败 0 步
```

## 2 残余一（低）：还有第四处没传 key

```
src/features/strip.ts:29   const floor = threshold(min, STRIP_MIN);
```

它走的是 `clean(content, v, min)` 里的兜底，记的仍是常量 `"threshold"`。复跑：

```
strip.clean([{type:"thinking",thinking:"a\nb"}], {ev:{dups:[]}}, "x")
  → [{"key":"threshold","raw":"\"x\""}]
```

**线上走不到**，所以我不把它算阻塞：`clean` 的唯一调用点是 `src/index.ts:408`，传的是 `c.strip.min`，已经由 `configure` 归一化过。它只是形状上的第四处。

彻底的做法不是再补一个字符串，而是**把 key 设成必填**（删掉 `= "threshold"` 这个默认值）。那样 `strip.ts:29` 会在类型检查里直接暴露，而不是等一个写探针的人。给参数留「静默退回上一轮的坏形状」的默认值，就是给同一个洞留后门。

## 3 残余二（中，这轮新发现）：`npx tsc --noEmit` 什么都没检查

这一条我上一轮没查，直接把它当基线背书了。这轮查了，形状是这样：

```
$ cd pi-think-sentry && npx tsc --noEmit
Version 7.0.2
tsc: The TypeScript Compiler - Version 7.0.2
...（帮助文本）
rc=0
```

这个目录**没有 tsconfig.json**（`ls -a | grep tsconfig` 为空），所以 `tsc` 退化成打印帮助。它没读任何一个 .ts 文件。

坏样本验证：往 `src/` 放一个必然错的文件 `const x: number = "这不是数字"`，再跑 `npx tsc --noEmit` —— **仍然 rc=0、仍然只打印帮助**；显式给文件 `npx tsc --noEmit src/bad-type.ts` 才报 `error TS2322`。

**所以「tsc 干净」不是一个判据，是一条恒真的输出。** 按你自己的判法：改回去会红吗——不会红，它连输入都没读。

但结论碰巧是对的。我在副本里补了真检查（tsconfig + `npm i -D @types/node`）：

```
$ npx tsc -p tsconfig.json --noEmit   → 0 条 error
```

代码本身类型是干净的。所以这是一条「结论真、判据空」的基线——比第一轮那条（语法层无坏样本）更麻烦一点，因为**它每轮都出现在报告里，而且我给过背书**。

修法（小，且立刻可见效）：

```
1. 写 tsconfig.json：{ compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "nodenext",
     strict: true, noEmit: true, allowImportingTsExtensions: true, skipLibCheck: true, types: ["node"] },
     include: ["src/**/*.ts"] }
2. devDependencies 加 @types/node
3. 判据：npx tsc -p tsconfig.json --noEmit 必须 0 条（现在就是 0，所以它立刻可用）
   坏样本：往 src/ 扔一个 const x: number = "字符串"，它必须报 TS2322
```

## 4 一句

这一轮你修的正是两位共同指的那条，修得对。我这轮多查了一步：**上一轮我拿来当基线的 tsc 命令，在这个仓里是空转的。** 结论没变（补上配置后确实是 0 错），但证据的形状变了——以后这条要换成真检查，否则它和「没有输出」是同一件事。

认可 · 主判据实测通过（`{dup:{min:-2},strip:{min:-2}}` 得到 `dup.min`/`strip.min` 两条不同 key，`judges.dupMin` 独立成第三条；242/242/0、gate 55 步 0 失败）；两条新残余：① `strip.ts:29` 第四处没传 key（线上走不到，因为 index.ts:408 传的是已归一化的值，建议把 key 改成必填而不是留默认）；② `npx tsc --noEmit` 因缺 tsconfig 只打印帮助、rc=0、不读任何文件，加一个必错文件仍 rc=0——结论真（补 tsconfig + @types/node 后 0 错）但判据空，这条基线每轮都在报告里，下一轮请换成 `tsc -p tsconfig.json --noEmit`。
