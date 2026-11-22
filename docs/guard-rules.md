# 判据规则（依赖类型理论）

> 2026-11-22 重写。旧版描述 guard 那个文件的 frag / lang / combo 三条规则，引用 `guard.ts:118/147/175`。
> **那个文件与 frag、combo 两条规则现在都不存在**——`grep -c combo src/judges.ts` 得 0。
> 一份指着不存在代码的文档比没有文档更坏：读者照着找，找不到，会以为是自己找错地方。

每一条都是一个类型：**命题**（判什么为真）· **引入**（跑什么命令、该看到什么）· **消去**（第二入口）· **反例**（一个具体输入，喂进去就为假）。

## 产生判决的判据（kind: verdict）

| # | 命题 | 引入（命令 → 期望） | 消去（第二入口） | 反例 |
| --- | --- | --- | --- | --- |
| dup | 同一行（vote 行）出现次数 ≥ `dup.min`（默认 4）时判红 | `npm test` → rc=0；`node --experimental-strip-types scripts/check-rules-coverage.mjs` → 6 条 0 缺口 | `src/meta.ts` 里 id=dup 的条目，与 `judges.ts` 的 `rule: "dup"` 对得上 | 四行都是「做。」：min=4 时命中；三行时 clean |
| lang | 剥掉围栏/行内代码/公式/URL/盘符路径后，非目标语言行数 > 目标语言行数时判红 | `npm test` → rc=0 | 同一块换 `lang.dir` 从 zh 到 en，方向应对调 | 整块英文思考、中文只有一行 |

两条的入口在 `src/judges.ts`：`dupJudge`（第 110 行）、`langJudge`（第 130 行）、`judgeThinking`（第 160 行）。

## 机制约束（kind: mechanism，不产生 rule）

这四条不是「判什么」，而是「什么时候不许动手」。删掉它们，行为会变，但不会有任何一条判决变红——所以它们必须各自有对应的测试。

| # | 命题 | 引入（命令 → 期望） | 消去（第二入口） | 反例 |
| --- | --- | --- | --- | --- |
| inject-thinking-only | 只对 `type === "thinking"` 的块动手，别的块原样返回 | `npm test` 的形状用例 → rc=0 | 同一份 content 放一个 text 块与一个 thinking 块，只有后者变 | 往 text 块注入提示：正文被污染，用户直接看见 |
| intercept-en-only | 拦截只在 `dir === "en"` 时生效 | `npm test` 的拦截用例 → rc=0 | 同一块内容换 dir=zh 再跑，方向应反过来 | 不看 dir 就拦：中文思考被当成英文误判 |
| strip-empty | 没有可剥片段时原样返回，不制造空补丁 | `npm test`：`want=[]` 时 content 不变、`cleaned=false` | wire 层此时不产生 `message_end` 替换，下游收不到改动 | 无判定也返回新数组：下游以为改过，日志多一条空补丁 |
| binding-anthropic | anthropic / bedrock 系 provider 不抓 thinking（它们不暴露） | `npm test` 的绑定用例 → rc=0 | provider 与 api 两个字段各含 anthropic 时都判 `capture=false` | 对 anthropic 也开抓：永远抓不到，看起来像「模型不思考」 |

## 判据对齐（谁保证这份文档没撒谎）

```bash
node --experimental-strip-types scripts/check-rules-coverage.mjs
# check-rules-coverage: 6 条规则，缺口 0 个    rc=0

node --experimental-strip-types scripts/check-rules-coverage.mjs --selftest
# PASS  改坏一条 module 后应红 → selftest: 坏样本红了    rc=0
```

它判三件事：① `judges.ts` 里出现的每个 `rule: "xxx"` 都必须有 `kind=verdict` 的条目；② `src/features/` 下每个文件都必须被某条规则的 `module` 点名；③ 点名的文件必须存在。

## 为什么 message_update 判不了 thinking

`message_update` 递来的 `event.message` 是增量片段，不是累积后的完整消息。2026-11-13 12:29 实测：`thinkingOf` 从该事件取到的文本长度只有 3、7、13 个字符，而判据入口有 `minLen=60` 的下限，于是每次都被长度门挡回去——**判据在结构上从未执行过一次**。当时的日志显示有 hit，那是别的路径记的；这个分支十二小时里看起来在工作，实际上一直是死的。

修法：删掉 `message_update` 监听，thinking 挪到 `turn_end` 判。

这一条留着，因为它记的是「判据看起来在工作、其实一次没跑过」这个形状——那是最难发现的一类缺陷。
