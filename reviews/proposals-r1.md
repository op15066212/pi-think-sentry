# 轮次 R1 · 提案：pi-think-sentry 0.1.17 的独立复核

提出者：会话 9d80afea-e93e-4328-8106-7f2aebe20d8d（写出这一份的那个窗口）
交付时刻：2026-11-22（见 git log 时间）
对象：`C:\Users\15066212pp\.pi\agent\extensions\pi-think-sentry`，version **0.1.17**，commit **21c030b**

## 0 先验身份（三行命令，现取）

```bash
cd "C:/Users/15066212pp/.pi/agent/extensions/pi-think-sentry"
node -e "console.log(require('./package.json').version)"   # 期望 0.1.17
git log --oneline -1                                        # 期望 21c030b pi-think-sentry 0.1.17…
md5sum src/judges.ts                                        # 期望 2b384bdab5b07409659e94bde7adcf5d
```

三行对不上，说明你看的不是这一版，先回一句「基于旧版」再停。

## 1 这是什么插件

一个 pi 扩展。每轮读模型的思考文本，判两件事：同一行重复 ≥3 次（`dup`）、非中文占比过高（`lang`）；判红则拦掉这次工具调用，并把重复行从消息里删掉。

## 2 这一轮（0.1.15 → 0.1.17）改了什么

- **0.1.15**：配置文件在会话中途被手改时，`tool_call` 刷新了开关却沿用旧配置算出的判决。修法是在配置变化时用新配置重算最后一帧。这是「两个真值」的第三种形态（时间轴）。
- **0.1.16**：新增 `bin/mutate.mjs`（`npm run mutate`）。它把源码里每个 `< <= > >= && ||` 逐个翻掉、跑全部测试，报出**存活**的（翻掉还绿）。第一轮抓到两个真空白：围栏闭合后接正文没有用例、`verdict` 的形状校验只测过「项不是数组」。
- **0.1.17**：再补三条配置判据；记下四条等价变异；并修了变异脚本自己的 bug——它第一版是「剥掉字符串再取列号」，长度变了列就偏，报出一个不存在的空白。

## 3 要你做三件事

### 3.1 跑判据，贴 rc 原文

```bash
cd "C:/Users/15066212pp/.pi/agent/extensions/pi-think-sentry"
npm test                                     # 期望 tests 127 / pass 127 / fail 0
npm run mutate -- --file src/verdict.ts      # 期望 抓住 12 · 存活 0
```

rc 与最后三行原文都要贴。跑不出来写「未验证」，别写「应该是绿的」。

### 3.2 复核我判为「等价」的四条，逐条说我对不对

我判它们「改了代码但行为不变，不是缺陷」。判错的代价是：真的是空白，却被下一轮当成已清账跳过。

1. `src/cut.ts:11` `i < lines.length` → `i <= lines.length`：我说 `splice(len,1)` 对越界下标不动数组。
2. `src/config.ts:57` 第一个 `||`（`!v || typeof v !== "object" || Array.isArray(v)`）→ `&&`：我说 `Array.isArray` 在末尾兜住，数组照样判 broken。
3. `src/features/strip.ts:41` 两处（`i >= offset && i < offset + n`）：我说越界的行号被下游 `stripDupLines` 的 `i >= 0 && i < lines.length` 挡住。
4. 五个文件的 `configure` 兜底 `raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}` → `||`：我说取到畸形值也只是丢键、不抛。

**判法**：每条写一句「等价 / 不等价 + 若不等价的输入是什么」。不要只说「同意」。

### 3.3 写回执并签字

写 `reviews/review-r1.md`，第一屏六行，缺一行算没签：

```
轮次: R1
提出者: 会话 9d80afea-e93e-4328-8106-7f2aebe20d8d
发现者: <你的会话 id>
修改者: <你的会话 id>
复核者: <你的会话 id>
交付: <你把 review-r1.md 写完的时刻>
```

三段：

- `审查:` 你跑了什么、rc 是什么、读到什么
- `已改:` 如果你自己发现并改了东西，写文件与 commit 号；没改写「无」
- `未改:` 写「无」，或三种客观原因之一（无写权限 / 无凭据 / 文件不在本机）

**最后一行必须是这一句之一**：

```
结论: 认可（版本 0.1.17，md5 2b384bdab5b07409659e94bde7adcf5d）
结论: 不认可（理由：…）
```

## 4 边界

- 你可以改代码。改了就把 commit 号写进 `已改`，并把 `npm test` 的 rc 贴上来。
- 不许 `git push`，不许改 `~/.pi/agent` 下别的目录。
- 桌面镜像 `C:\Users\15066212pp\Desktop\My Data 15066212\pi\核心配置` 是这台机器上另一个仓的副本，不要动。
