# R9 复核记录（6e8dd769）

---

# R9 复核（窗口 6e8dd769）：不认可

对象：pi-think-sentry 0.1.42，commit `21cb6c6`。
我的基线：`npm test` → tests 236 / pass 236 / fail 0（复跑两次，一致）。
下面每条都写「跑什么能证伪它」，读者不需要知道前几轮说过什么。

## 0 先回答你问的三件事

### Q1 改动二是升维吗：方向是，但**说法错了一处**，而且**这一层没有判据**

先说说法。你写「概念变少了」——按概念数不成立：改前一层（形状，一条正则），改后两层（语法 + 形状）。层数 1 → 2。

成立的说法是换了一句话，而这句话正是格罗滕迪克那条判准：**判据的取值域从「不可穷举的相似性」换成了「可穷举的构造枚举」**。

- 改前要回答「这一行里哪一段是代码」，答案靠形状猜，类不可穷举（所以第一版写成否定类 `[^\s...]`，把汉字一起吃掉，反向 193 行）。
- 改后先回答「这是不是 markdown 的代码构造」，而这个类是**封闭三元组**：围栏（位置）、缩进（位置）、行内反引号（标记）。补上第三个成员是扩类，不是在类外打分支。形状层降为兜底，只认路径字符集（正列表，可穷举）。

所以：**升维成立，理由要换**。「概念更少」不成立，「可猜的东西更少」成立。

### Q1 后半：这一层**没有坏样本**——这是我不认可的第一条

实测（不是读代码看出来的）：把 `src/features/../judges.ts` 的 `naturalText` 里那一行语法层删掉，

```
  .replace(/`[^`\n]*`/g, " ")   // 语法层：行内 code
```

跑全量：**235 / 236 通过，只红 1 条**，而红的那条是 `test/natural-text.test.ts:51`「已知残余」，它在数 `ev.lines === 8`，属于计数锁定，不是「语法层对不对」。

也就是说：**这一轮唯一的新机制，是唯一没有坏样本的机制。** 谁哪天为性能删掉那一行，236 条测试会说「全绿」，而你自己实测的「83% 的误判」会全部回来。

为什么现有样本钉不住它：`test/natural-text.test.ts:16-21` 的那几行**全部含斜杠**，形状层的 `REF_RE` 能剥掉 `test/verdict.test.ts:39,...`，所以两条测试都靠形状层兜住了。

缺的坏样本形状是「行内 code **不含斜杠**」。我这三行就是（每行一段行内 code，全部无斜杠）：

```
`const cfg = judgeCfg({ dupOn: false, langOn: true, langLineRatio: 0.3, langBlockRatio: 0.3 })` 我改了。
`const ev = { cjk, lat, lines: off, dir, sample, ratio }` 这行也改。
`if (blockRed || off > keep) return Verdict.parse({ kind: retract })` 现在条件换了。
```

两版并排跑（同一份 `judgeCfg`，同一段文本）：

```
语法层在：kind=none    cjk=13 lat=0    → clean
只形状层：cjk=13 lat=144 块级比=0.083 → retract
```

把这三行加进 `test/natural-text.test.ts`，删语法层就会红。现在不会。

### Q2 换观测口（block → redCalls）算不算为了让它绿而改判据：**不算**

判法按你说的写：改回去之后坏样本还红不红。我真改了（临时副本，不动你的仓）：

```
src/index.ts:320  const key = c.intercept.cooldown === false ? "" : lastThink;
          改成      ... "" : String(event?.toolCallId ?? "");
→ test/cooldown-key.test.ts  3 条里 1 条红
  ✖ 同一段思考 + 三次不同 toolCallId：只拦第一次
```

红的正是键的语义那条。所以观测口钉住了，不是橡皮图章。

而且新观测口比旧的**更直接**：旧写法用「第二次 tool_call 有没有被拦」间接推「判决还在不在」，把两件事（判决 / 冷却）混进一个观测；`redCalls` 在 tool_call 入口按 `lastV` 自增，与冷却无关。这不是放松，是拆开。

### Q3 ref 类是否必要：**必要**，两条独立理由，第二条可跑

1. **判准不同类**：ref 的判准是内容（剥完没有语言字符），fence / indent 的判准是位置（在围栏内 / 有缩进）。把内容判据塞进位置类，就是「同一个像两个原像」——正是这一轮在修的病。
2. **可测**：把 `partitionLines` 里那行改成 `kind: "indent"`（ref 并入缩进），跑 `test/ref.test.ts test/boundary.test.ts` → **3 条红**：

```
✖ 纯路径行是引用类，不投反对票（实测 174 行）
✖ ref 不算豁免行：一堆路径不等于「判据看不见这段」
✖ 纯路径行被复诵三次，仍然是复诵（R9 不许顺手削弱 dup）
```

第二条最关键：ref 一旦进 indent 就自动进 `exempt`，`boundaryJudge` 的 opaque 条件被路径行喂饱——**贴一堆路径就能把已判红的拦截清掉**。你自己写下的那个洞，就是判定「塞进 fence/indent」不成立的判据。

代价（我也记下来）：分区 4 类 → 5 类，`boundaryJudge` 多一个计数，verdict 多校验一个可空字段。可接受。

## 1 我不认可的四条

### D1（硬）`lang.ratio` / `lang.blockRatio` 用命令行**改不了**，报错文案还误导

```
$ think-sentry lang ratio 0.5  → 数字必须是不小于 2 的整数，收到 "0.5"。没有写入。
$ think-sentry lang ratio 0.3  → 同上（0.3 就是默认值本身）
$ think-sentry lang ratio 0    → 同上
$ think-sentry dup min 4      → {"dup":{"on":true,"min":4}}   ← 门槛类正常
```

根因：`src/index.ts:169` 的数字分支对**所有**数字键统一用 `validThreshold`（`src/threshold.ts`，`MIN_FLOOR = 2`，且 `Math.floor`），而比例类的取值域是 0..1（`values.ts` 的 `asUnit`，`0` 是合法值）。

于是同一个键两个像：

```
手写配置文件 {lang:{ratio:0,blockRatio:0}} → configure 读到 {"ratio":0,"blockRatio":0}   ← 接受
命令行       think-sentry lang ratio 0       → 拒绝                                  ← 不接受
```

这正对着你这一轮的主张写：「raw → 值的映射只在一处定义」。盘上还有第二处（`threshold.ts`），两处的取值域不同。**类加了（asUnit / asCount），分派没加**——`parseValue` 仍把比例当门槛。

修好后会变绿的判据：`think-sentry lang ratio 0.5` 的返回值与文件里都出现 `"ratio": 0.5`。

### D2（中）改动二的语法层无坏样本

见 Q1 后半。判据：把上面那三行样本加进 `test/natural-text.test.ts`，删掉 `naturalText` 里的语法层必须红。现在删掉它 235/236 绿。

### D3（中低）注释指向错的文件名

```
src/values.ts:16  // 判据（test/values.test.ts）：删掉任何一条记账，那一条坏样本就变成静默兜底。
$ ls test/ | grep -i values   → (空)
$ grep -rn 'rejectsOf' test/  → test/r8.test.ts:12,28,34
```

测试存在，但名字是 `test/r8.test.ts`。读注释的人 grep `test/values.test.ts` 会得到空结果，然后以为没有判据。你自己在 0.1.5 那轮写过：「注释也是判据，说错了就有人按它实现。」

### D4（低）`cooled` 的注释还停在旧键上

```
src/index.ts:38  // cooled：本该被拦、但因为同一个 toolCallId 已经拦过一次而放行的次数。
src/index.ts:320 const key = c.intercept.cooldown === false ? "" : lastThink;   ← 键是思考文本
```

同一个人在同一轮里刚把键从 `toolCallId` 换成思考文本，注释没跟。D3 与 D4 是同一种病，第三次出现。

## 2 我认为对的（免得下一轮被当成漏项）

- 改动一的**三态**划分是对的：`absent`（undefined/null/空串）→ 默认不记账、合法 → 归一化、不合法 → 默认 + 记账。空串当「没配」这一条尤其对——`Number("")` 是 0 是你抓到的真缺陷。
- `src/defaults.ts` 收六份默认值为一处：`boundaryMinExempt` 的三个像，`ratio` 的三个像，都归零了。
- 改动四把 `TEMPLATE_OF` / `CHECKS` / `RULES` 三张表合成「类与分派同一张表」，这是同一轮里最干净的一处升维。
- 你自己留痕的两处（第一版否定类反向 193 行、剥裸标识符停手）写法正确：写清「停在哪、为什么、怎么推翻」。

## 3 基线

| 项 | 值 |
| --- | --- |
| `npm test` | tests 236 / pass 236 / fail 0 |
| 删语法层后全量 | 235 / 236，唯一红的是「已知残余」计数锁定 |
| 删形状层后全量 | 232 / 236，4 条红（形状层有判据） |
| ref 并入 indent | 3 条红（ref 必要，可跑） |
| 冷却键改回 toolCallId | 1 条红（观测口有效） |
| 命令行比例类 | 3 个值全部拒绝写入（D1） |

## 4 一句

这一轮你抓住的病是真的（字符串 `false`、空串变 0、按调用冷却），修的方向也对。我不认可的是**两处收尾**：一类值（比例）新建了翻译函数却没接进分派，一个机制（语法层）升对了却没留坏样本。按你自己的判法——「改回去会红」——这两处现在都是绿的：删掉语法层 235 条绿，比例类命令行一个也写不进去。

不认可 · 四条可复跑：① `think-sentry lang ratio 0.5` 被拒（比例类命令行改不了，报错说「不小于 2 的整数」），而手写配置 `{"ratio":0}` 被接受——同一键两个取值域；② 删掉 `naturalText` 的语法层，全量 235/236 仍绿（唯一红的是计数锁定），三行无斜杠行内 code 的样本给在 Q1；③ `src/values.ts:16` 指向不存在的 `test/values.test.ts`（实际在 `test/r8.test.ts`）；④ `src/index.ts:38` 的 `cooled` 注释仍说 toolCallId。已认可的部分：冷却键（改回 toolCallId 立刻 1 条红）、ref 类（并入 indent 立刻 3 条红）、defaults 单点。
