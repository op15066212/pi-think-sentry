轮次: R2
提出者: 会话 9d80afea-e93e-4328-8106-7f2aebe20d8d
发现者: 31e5cf4e-b321-4fe0-826c-459c7d9da49e
修改者: 31e5cf4e-b321-4fe0-826c-459c7d9da49e
复核者: 31e5cf4e-b321-4fe0-826c-459c7d9da49e
交付: 2026-11-20T13:35:17+08:00

**一句话**：第 3 节三条判据全过；但 `src/index.ts:216` 那句「拦截才不可绕过」在这一版仍可破——同一段文本，只因为 `inject.text` 多了两句中文，拦截从「仍拦」变成「放行」。所以不认可，理由不是验收不符，是那条不变量还站着。

## 审查

**身份（第 0 节三行）**

```
node -e "…version"      → 0.1.20
git log --oneline -1    → 3a571b0 pi-think-sentry 0.1.20：全仓变异面一次跑完…
md5sum src/judges.ts    → 2b384bdab5b07409659e94bde7adcf5d
```

三行都对上，所以下面说的不是旧版。开工时 `git status` 只有一条 `?? reviews/proposals-r2.md`（就是任务书本身）。

**第 3 节判据（原文与 rc，不经管道取值）**

```
npm test                                    → tests 137 / pass 137 / fail 0   rc=0
node bin/mutate.mjs --file src/verdict.ts   → 抓住 10 · 存活 0 · 跳过 0          rc=0
node bin/mutate.mjs --file src/cut.ts       → 抓住 6 · 存活 1 · 跳过 0           rc=0
                                              存活的：src/cut.ts:11  < → <=
```

三条与期望逐字一致。cut.ts:11 那条我自己穷举了 9 种文本 × 15 种 drop = 135 组，`<` 与 `<=` 零差异——`splice(lines.length, 1)` 不动数组，R1 复核方测的 152 组同一个结论。它是等价，不是空白。

**五问，每问落到文件:行**

**第 1 问 · 一张图。** 九份状态，产生者与读者：

```
cfg          index.ts:53   ← applyCfg(60) ← readConfig   → tool_call(230) turn_end(254) runCommand(132)
cfgStamp     index.ts:54   ← statStamp(59) 只取 mtimeMs → refresh(76)
jcfg         index.ts:58   ← applyCfg(62)                → judgeThinking(209,269) refresh(81)
lastThink    index.ts:72   ← message_update(223)         → refresh(81) tool_call(232)
lastV        index.ts:73   ← message_update(224) refresh(81) → tool_call(232)
sawRed       index.ts:186  ← message_update(225)         → turn_end(275)
lastEntryId  index.ts:183  ← turn_end(259)               → turn_end(258)
stats        index.ts:32   ← 两处自增 + install 回填(181) → writeState(106)
lastRejected threshold.ts:19 ← threshold(36)             → runCommand(index:138)
lastProblem  config.ts:65  ← readConfig(85)              → runCommand(index:138)
```

`lastRejected` 是唯一一处「一处可写」被破的：一个 `let`，被五个模块的 `configure` 顺次覆盖（`MODULES` 顺序 intercept→dup→lang→strip→inject，见 config.ts:12），谁最后写谁的声音留下。判据见第 2 问第 2 条。

**第 2 问 · 两个状态一个像。** 四处，每处给可区分输入。

1）**`judges.ts:204` 的剥行跑在 `boundaryJudge`(206) 之前**——最严重的一处。

```
judgeThinking("    a\n    b\n    c\n    d", judgeCfg({}))
  → {"kind":"none","tag":"opaque","ev":{"indent":4,"exempt":4}}
同一段文本，judgeCfg({skip:"a\nb"})
  → {"kind":"none","tag":"clean","rule":"lang","ev":{"cjk":0,"lat":0,"lines":0}}
```

同「空思考」的像逐字段相同。`skip` 从「注入文案的行集合」映到「判据可见的行集合」不是单射，且它同时改两样东西：`exempt`（位置可见性）与 `cjk/lines`（语言判据的证据）。第二样尤其糟：上面那段全是汉字，`ev.cjk` 报 0——证据与原文不对应。

后果不是「少判一帧」。`message_update`(218) 对 `opaque` 是「不覆盖上一帧判决」，对 `clean` 是「覆盖」。于是剥行把「保留判红」变成「清掉判红」。真进程里跑：

```
文案空（默认）  判红后贴四行缩进段  → 仍拦 = true
文案=两句中文   判红后贴四行缩进段  → 仍拦 = false     ← 同一段文本、同一份判据配置
```

探针（真 `installGuard` + 真 `readConfig` 链路）：`inject:{on:true,text:"先说结论\n再列步骤"}`，先发一帧三行复诵判红，再发一帧 `"    先说结论\n    再列步骤\n    同上\n    同上"`，`tool_call` 返回 `undefined`（放行）。对照组文案为 `""` 时同一步返回 `{block:true}`（拦）。

这条与 `index.ts:216-217` 修过的那次事故**同构**：模型靠「位置」让拦截失效。当时补的是围栏/缩进这一半，补丁只改了「看不见 ≠ 没有」，没改「谁有权决定看不见」。模型的输入里就有 `inject.text`（每轮追加在思考末尾，inject.ts:31），所以它抄得出那两行。

2）**`threshold.ts:19` 单槽。**

```
{dup:{min:3},   strip:{min:"坏"}}  → lastRejected = "坏"
{dup:{min:"坏"}, strip:{min:"坏"}}  → lastRejected = "坏"   ← 与上一行逐字节相同
```

「dup.min 配错了」这件事在 strip.min 也配错时从报告里消失。自愈性存在（修好 strip 再读一次就露出来），所以代价是「一次只报一个」，不是永久隐藏。这条我判**低危**，但它确实是第 1 问那张图里唯一的单槽。

3）**`index.ts:59` 的 stamp 只取 `mtimeMs`。**

```
写 {dup:{min:3}} → utimes 钉到整秒 T → install（cfgStamp = T）
写 {dup:{min:5}} → utimes 钉回同一整秒 T
  tool_call → 拦（仍用 min=3）
对照：mtime +1s
  tool_call → 放行（重读了 min=5）
```

「配置变了必须重读」的判据是 mtime，而 mtime 不是内容的函数。代价与可达性：本地 NTFS 亚毫秒粒度，正常编辑撞不上；网络盘/同步盘按秒粒度时同一秒两次保存会合并。我判**低危、规格退化**，修法极便宜（stamp 里带上 size），但带 size 也不保内容，所以真要归零得在三个边界各读一次算哈希。

4）**`features/strip.ts:30` 的 `cleaned` 不是删了几行。**

```
content=[{type:"text"},{type:"thinking",thinking:"一"}]，v.ev.dups=[[“x”,3,[7]]]（行号越界）
  → cleaned: true，内容逐字节没变
```

`cleaned` 的像是「`want` 非空」，不是「删了行」。`index.ts:27` 的注释写的是「真删过东西的回答比例」。真实链路上这个像很难撞（判据的行号来自同一份文本），但 `verdict.ts:47` 只校验行号是数字、不校验范围，所以畸形 Verdict 能进来——而那正是 R1 复核方抓过的形状（`strip.ts:41` 的空守护）。

**第 3 问 · 可逆性。** 三步**没有一步不可逆**，这一点与任务书的预设相反：

- 删行：`turn_end` 返回 `context_edit`（index.ts:296）。pi 的 `docs/session-format.md:141` 明写「Append-only edit … the target entry and its metadata remain unchanged in raw history, UI, exports, and session accounting」，另有「Edits are branch-relative: navigating to a point before the edit reveals the target's original contribution again」。所以**原文还在 jsonl 里，退路在 pi 层**（`/tree` 回退，或直接读会话文件）。本插件自己的输出读不出删了哪几行（`stats.cleaned` 只是次数，`trace` 只有 `kind`），这是「回程读不出它曾在此」，但数据本身没丢。
- 注入：尾部追加（inject.ts:31），加法，可逆。
- 拦截：拒绝执行，可逆。
- 真正不可逆的只有 `writeState`(index.ts:108-110) 丢掉一天前的会话计数。有界、可重建，且注释论证过。

**第 4 问 · 升维。** 本版 diff（`3a571b0`）只有三件：变异巡检的测试入口收成一处、7 处空白补坏样本、两条等价。其中**有一处**是换了一层：

> **消失的判断：旧「这次变异巡检要跑哪些测试文件」（两处各写一遍：`node --test test/` 与 `scripts.test`，改一处不会红）→ 新「读那一处 `scripts.test`」。**

这一句写得出来，所以本版不是纯清账。`partitionLines` 的四分区、`Verdict` 的 `CHECKS` 表、`threshold` 的单点取值域、`Read` 的两态，都是更早版本做的，不在本版 diff 内，我不把它们记到本版账上。

**第 5 问 · 映射保不保。** 四条链路，三条有断点：

| 链路 | 断点 | 若 ___ 则这两个东西不可区分 |
| --- | --- | --- |
| 配置→运行时（readRaw 50 → migrate 26 → configure → cfg → judgeCfg 94 → jcfg） | `index.ts:59` | 若两版配置的 `mtimeMs` 相同，则「换了配置」与「没换」不可区分（已构造，见第 2 问第 3 条） |
| 判决→拦截（Verdict.parse 62 → lastV → intercept.reason 21 → SAY_BLOCK 3 / SAY_LANG 6） | `judges.ts:204` | 若注入文案的两行出现在缩进段里，则「判据看不见这段」与「这段干净」不可区分；处方里的行数是剥行后的数，不是原文的数 |
| 文本→行号（thinkingOf 37 → partitionLines 35 的 `i` → strip.clean 41 的 offset） | `verdict.ts:47` | 若行号越界（判据不校验范围），则「删了几行」与「一行没删」不可区分（`cleaned:true` 两者都真） |
| 写配置→盘（writeConfig 95） | `config.ts` 的 catch | 若磁盘拒绝写，则「写失败」与「写入成功且新值等于旧值」不可区分。**已修，见下** |

行号映射本身是保住的：`partitionLines` 的 `l.i` 是原始下标，`filter` 不重编号；judge 与 strip 两端都用 `split("\n")`。

另外一条不在链路上：`test/harness.ts:9` 写着「判据：`node bin/ax9-scan.mjs` 里 test/ 那几组候选消失」，而 `bin/` 只有 `mutate.mjs`——这条判据是文字，不是代码，跑不出来。`doc-names.test.ts` 只查 README 的导出名，查不到注释里的命令。

## 已改

**commit `f1f0324`**（父 `3a571b0`），version 0.1.20 → **0.1.21**。

1. `src/config.ts` 的 `writeConfig` 失败路径：`catch {}` → `catch { return { error: "…" } }`。成功路径一个字节没改。

   改前实测（只读文件）：

   ```
   盘上写前 = {"dup":{"min":3},...}  写后 = {"dup":{"min":3},...}
   writeConfig("dup",{min:7}) → {"on":true,"min":3}   抛出 = null
   ```

   同一函数的另一种失败（坏 JSON）是带 `error` 的。两个失败形状不同 = 调用方没法只凭返回值知道写没写。

2. `test/write-fail.test.ts`（新增 2 条）：第一条在改前红（`AssertionError: 写失败必须返回 error，实际返回 {"on":true,"min":3}`），改后绿；第二条是对照，防止「永远返回 error」冒充修好。

3. `package.json` + `package-lock.json`（两处）→ 0.1.21，`version.test.ts` 验一致。

4. `reviews/proposals-r2.md` 一并入库（md5 `fdbf3ee3`，内容一字未改）。原因：gate 的 audit 面把「未跟踪且未被忽略」判红，挡住所有人的提交；按第三类规则（未跟踪且不可再生 → git add）。不这么做就只能 `--no-verify`，那等于绕过闸门。

**判据（改完在 `f1f0324` 上重跑）**

```
node --experimental-strip-types --test test/*.test.ts
  → tests 139 / pass 139 / fail 0    rc=0        （137 + 我加的 2 条）
npm test                             → tests 139 / pass 139 / fail 0    rc=0
node bin/mutate.mjs --file src/config.ts  → 抓住 8 · 存活 0 · 跳过 0     （改前也是 8·0，无新增空白）
node bin/mutate.mjs --file src/verdict.ts → 抓住 10 · 存活 0
node bin/mutate.mjs --file src/cut.ts     → 抓住 6 · 存活 1（等价那条）
gate（pre-commit 自动跑）             → 55 步，失败 0 步
md5sum src/judges.ts                 → 2b384bdab5b07409659e94bde7adcf5d（一个字节未动）
```

## 未改

四处已定位未执行。原因**不是**「无写权限 / 无凭据 / 文件不在本机」——三条都不适用，是我主动把它们交还给人，所以这里偏离模板列出来：

1. `judges.ts:204` 的剥行顺序（第 2 问第 1 条）。修它要动判据语义：「注入文案里的行算不算投票」是使用者的判断，不是我的。最小修法两个候选，都要使用者点头：把 `boundaryJudge` 挪到剥行之前（位置可见性不再受文案影响，但模板行会重新触发 dup），或者只在 `dup/lang` 前剥、给 `ev` 加一个 `skipped` 数（两者仍可区分，但 `cjk` 仍是剥后的数）。
2. `threshold.ts:19` 单槽（低危，修完一个自然浮出下一个）。
3. `index.ts:59` 的 `mtimeMs` 单像（低危，且「比率修复」不是「判据修复」）。
4. `test/harness.ts:9` 引用了不存在的 `bin/ax9-scan.mjs`。这是删别人的论证，我改就是替 ta 决定那条判据还有没有意义。

**另有一处盘上事实，不是我改的，也没纳入提交**：`settings.json` 在工作区里有一处 `dup.min: 4 → 7` 的改动（mtime `2026-11-20 13:32:00`）。取证过：单跑 `test/write-fail.test.ts`、跑一次 `npm test`，该文件 md5 三次都是 `ddc0bd63951ade30d6a20258666f05d3`，不是我的测试写的。按任务书第 5 节没有 `git checkout`，留给它的作者。

结论: 不认可（理由：第 3 节三条判据全过，但 `src/index.ts:216` 的「拦截才不可绕过」仍可破——`inject:{on:true,text:"先说结论\n再列步骤"}` 下，判红后贴 `"    先说结论\n    再列步骤\n    同上\n    同上"`，`tool_call` 从拦变成放行，对照组文案为空时仍拦；根因是 `judges.ts:204` 的剥行跑在 `boundaryJudge` 之前，于是 `skip` 同时改 `exempt` 与 `cjk/lines`，把 `opaque` 伪装成 `clean`，而 `opaque` 保留上一帧判决、`clean` 清掉它。另有同一形状的三处残留：`threshold.ts:19` 单槽、`index.ts:59` 只取 mtimeMs、`strip.clean` 的 `cleaned` 是「want 非空」不是「真删了几行」。本版升维确有一处——「消失的判断：旧『这次变异巡检跑哪些测试文件』（两处各写一遍）→ 新『读一处 scripts.test』」。删行**可逆**，与任务书预设相反：pi 的 `docs/session-format.md:141` 写的是 append-only，原文留在 jsonl 里）
