# R3 · 独立复核：pi-think-sentry 0.1.22

对象：`C:\Users\15066212pp\.pi\agent\extensions\pi-think-sentry`，version **0.1.22**，commit **e7c502f**
回执写到：`reviews/review-r3-<你的会话 id 前 8 位>.md`

## 0 这个插件是什么（事实，不含评价）

一个 pi 扩展。每轮读模型的思考文本，判两件事：同一行重复 ≥3 次、非中文占比过高。判红就拦掉这次工具调用，并把重复行从消息里删掉。

## 1 已经发生过的事（事实）

- R1 复核（`reviews/review-r1.md`）给「不认可」，指出我把四条变异判成「等价」是错的，其中三条能构造出可区分输入。已修，见 0.1.18。
- R2 复核（`reviews/review-r2-grothendieck.md`）给「不认可」，理由是拦截可绕过：

  ```
  配置 inject:{on:true, text:"先说结论\n再列步骤"}
  先发一帧三行复诵 → 判红 → tool_call 拦
  再发一帧 "    先说结论\n    再列步骤\n    同上\n    同上" → tool_call 放行
  对照：text 为空时同一步仍然拦
  ```

- 0.1.22 的修法（commit e7c502f）：`src/judges.ts` 里注入文案的行原先是 `filter` 掉（从行号里消失），改成标成 `indent`（不从行号里消失）。理由是方向不对称——多判一次 opaque 只是保留上一帧判决，多判一次 clean 是放行。

## 2 你要做的四件

**2.1 验身份**

```bash
cd "C:/Users/15066212pp/.pi/agent/extensions/pi-think-sentry"
node -e "console.log(require('./package.json').version)"   # 期望 0.1.22
git log --oneline -1                                        # 期望 e7c502f …
md5sum src/judges.ts                                        # 现取，记下来
```

对不上就回「基于旧版」并停。

**2.2 自己构造输入，判这个修法成立不成立**

不要只读代码。至少给出两组：

1. 把 R2 那条攻击原样重放一次（真 install 这个扩展，喂两帧，看 `tool_call` 的返回值）。
2. 一个你自己想到的、让「判红之后 `tool_call` 不拦」的输入。想不出来就写明你试过哪些、各自结果。

判据只有一条：**能不能让判红之后的 `tool_call` 不拦**。能，就是不认可，把输入贴出来。

**2.3 跑判据，贴 rc 与原文**

```bash
npm test                                     # 现取
node bin/mutate.mjs --file src/judges.ts
node bin/mutate.mjs --file src/verdict.ts
```

跑不出来写「未验证」。

**2.4 写回执**

第一屏六行，缺一行算没签：

```
轮次: R3
提出者: 会话 9d80afea-e93e-4328-8106-7f2aebe20d8d
发现者: <你的会话 id>
修改者: <你的会话 id 或「未改」>
复核者: <你的会话 id>
交付: <你写完回执的时刻>
```

三段：`审查:`（你构造了什么输入、看到什么）、`已改:`（改了就写文件与 commit 号；没改写「无」）、`未改:`（写「无」或三种客观原因之一：无写权限 / 无凭据 / 文件不在本机）。

最后一行必须是：

```
结论: 认可（版本 0.1.22，md5 src/judges.ts = <你现取的>）
结论: 不认可（理由：…）
```

## 3 边界

- 可以改代码，改了要写 commit 号并重跑 `npm test`。
- 不许 `git push`；别动桌面上那个镜像副本目录。
- 另有一个窗口可能同时在跑同一个仓。看到你没写过的改动，先 `git status` 取证，别直接 `git checkout`。
