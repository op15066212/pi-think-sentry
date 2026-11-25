# 签字链条

这个文件不进总指纹（见 `bin/fingerprint.mjs` 的 VOLATILE），
因为签字记录本身如果进了被签对象的指纹，加一行就让指纹变、就要重签，循环没有尽头。
它的 md5 印在 fingerprint 输出末行，照样能确认「这一份链条是哪一版」。

| 指纹 | commit | 状态 | 变了什么 |
| --- | --- | --- | --- |
| `fba6183d` | `3c0ccc8` | **已签**（代码面 ee67892） | README 第四条翻车 |
| `f0d83d8a` | `5f7f90c` | **未签** | README 加「签字是什么」一节 |
| `d6c34e9c` | `7ec1fb1` | **已签**（代码面沿用 ee67892） | README 四条凑齐成四行 |
| `554b0ca5` | `3c4430e` | **已签**（代码面沿用 ee67892） | README 记签字链条 |
| `cfa4b751` | `77cebfa` | 未签（被 291c08dc 取代） | 链条搬出被签面；随后发现 autocrlf 问题 |
| `291c08dc` | `a5e4238` | **已签** | 指纹对行尾不敏感 + live-config-check 重写 |
| `b79b1f87` | `85395e8` | **已签** | probe-live-config 进执行面 + README 落「读进来 vs 接到判据上」 |
| `79a2181b` | `d4c5a71` | **已签** | README 六条形状表（前四条报数/第五条记账/第六条动手）|

中间那版漏签不影响结论（与 fba6183d 在 src/ test/ bin/ 上零差异），
但**没签过就要说没签过**——否则下一个读这份回执的人会以为每一版都有签字。
这一格是我自己写错的：我在回执里把 f0d83d8a 标成「上一笔，你已签」，
实际签的是 fba6183d，f0d83d8a 从来没有人签过。复核方逐版比对后指出。

## 自指已断开（2026-11-24，复核方指出）

链条原来写在 README 里，README 进总指纹——于是加一行就让指纹变、就要重签，循环没有尽头。
现在它在 VOLATILE 里：往本文件加行，总指纹不变，而本文件的 md5 会出现在
`node bin/fingerprint.mjs` 输出末行。验法：加一行前后各跑一次，比较总指纹那一行。

## 这一轮的结论（2026-11-24 闭合）

- 两个插件：sentry `79a2181b`（代码面同 `85395e8`）/ escape-guard `8467da15`（未动）
- 一条自指断开：`SIGN-OFF.md` 出被签面，A/B/C 三次验过加行不动总指纹
- 六条形状三种场合：报数（四条）/ 记账（一条）/ 动手（一条）
- `cfa4b751` 标「未签」：一份表只能有一种含义，两义即失效

## 重新签字（用户要求，2026-11-24）

用户原话：「两个自定义的插件，重新签字，推送 github。重新双方签字。」

### 身份（现取，2026-11-24T17:54:31Z）

| 项 | 值 |
| --- | --- |
| 总指纹 | `79a2181b62633c97219f2489a1b8647f` |
| 文件数 / 总字节 | 88 / 424,896 |
| HEAD | `340bcf7` |
| 取前取后 git status | 0 行 / 0 行 |
| @settings | `96b47375` 421B |
| 工作区 | 干净 |

### 判据（整条命令的 rc）

```
npm run verify → rc=0
  tests 233 / pass 233 / fail 0
  check-probes: 6 个 probe，其中 1 个带 --selftest
  gate: 2 步，失败 0
```

### 签字

| 角色 | 会话 | 状态 | 时刻 |
| --- | --- | --- | --- |
| 复核方 | pi 插件2 `f15be404` | **重签**：指纹 `0a5f633c` SAME、verify rc=0（233/233 + 6 probe + gate 2 步 0 失败）、工作区取前取后 0 行、代码面 vs `69e8563` 零差异。原 `79a2181b` 作废（README 记 61% 真相与 .gitignore 后指纹前移） | 2026-11-24T18:59Z |
| 修改方 | pi 插件 `9d80afea` | **已签**：指纹 `79a2181b` SAME、verify rc=0、工作区取前取后 0 行 | 2026-11-24T18:11Z |

修改方自述（四行）：

- 指纹 `79a2181b62633c97219f2489a1b8647f`，`--verify` → SAME
- 时刻 2026-11-24T18:11Z
- 取前 `git status --porcelain | wc -l` = 0，取后 = 0
- `npm run verify` rc=0（233/233 + 6 probe 1 selftest + gate 2 步 0 失败）

补一条：复核方把签字记录写进仓并推了之后，HEAD 从 `340bcf7` 前移到 `3b4e40b`，
总指纹仍是 `79a2181b`。**签的是指纹，不是 HEAD**——这一条现在有实物了。

### 推送

`git ls-remote origin refs/heads/main` 与本地 `git rev-parse HEAD` 逐字相同，
`origin/main..HEAD` 未推提交 = 0。github 已是最新，本轮不需要再推代码；
只追加本段签字记录。

## 重签（2026-11-25，四个提交改了签名清理之后）

### 身份（现取，2026-11-25T09:30:57Z）

| 项 | 值 |
| --- | --- |
| 总指纹 | `b27c9be0eb33c36091d712f7dff9a44d` |
| 文件数 / 总字节 | 91 / 445,903 |
| HEAD | `0a03761` |
| 取前取后 git status | 0 行 / 0 行 |
| @settings | `96b47375` 421B |

上一版 `0a5f633c` 作废。代码面 14:34–15:17 进了四个提交
（`c41512a` / `6df433c` / `3e0ec12` / `23f0e8a`），全在改签名清理。

### 判据（整条命令的 rc）

```text
npm run verify → rc=0
  tests 246 / fail 0
  check-probes: 6 个 probe，其中 1 个带 --selftest
  check-doc-accuracy: 3 份文档，对不上 0 处
  check-rules-coverage: 7 条规则，缺口 0 个
  gate: 2 步，失败 0
```

### 复核方自己跑的坏样本（不看自述）

| 变异 | 应然 | 实测 |
| --- | --- | --- |
| 删 `src/algo/signature.ts` 的 `if (lastClean.get(e.id)) continue;` | 幂等测试红 | 退出码 1；#202「幂等：已清过的目标不再重复清」与 #205「只清过一次、后来又追加新条目」两条红。恢复后 rc=0，status 0 行 |
| 拿真实会话 12234 条跑全量清理 | 幂等生效 → 产出 0 条 | 产出 0 条。未修版同一份数据产出 3392 条 |

第二条是这份修的用处所在：同一个输入，修前要写 3392 条重复记录，修后一条不写。

### 签字

| 角色 | 会话 | 状态 | 时刻 |
| --- | --- | --- | --- |
| 复核方 | pi 插件2 `f15be404` | **重签**：指纹 `b27c9be0` SAME、verify rc=0、取前取后 0 行、两条坏样本各红一次 | 2026-11-25T09:31Z |
| 修改方 | pi 插件 `9d80afea` | **已签**：指纹 `b27c9be0`、verify rc=0、local = remote | 2026-11-25T09:26Z |


### 签的是 HEAD 的身份，不含工作区那一刻的临时改动

签名时刻（2026-11-25T09:32:57Z）复核方发现工作区已有**别人**未提交的改动：
`scripts/gate.mjs`（+59/−14）、`scripts/check-rules-coverage.mjs`（2 行），
属另一个会话正在做的工作。为免把「别人改到一半」当成被签对象，身份按 HEAD 取，不按工作区取：

```text
git archive HEAD | tar -x -C /tmp/head-sentry
cd /tmp/head-sentry && node bin/fingerprint.mjs
→ 91 文件 / 445,903 字节 / b27c9be0eb33c36091d712f7dff9a44d   采样 2026-11-25T09:33:17Z
```

与修改方报的完全一致。同一命令在工作区跑是 `47c5a048`，差的就是上面那两个未提交文件。
本次提交只追加本文件，不带那两个文件。

反例（这一条挡的）：直接签工作区算出的指纹，第二天去看就复现不出来——
被签对象里混进了别人写到一半的东西。


## 重签（2026-11-25T10:05Z，口径改为 HEAD）

### 身份（`node bin/fingerprint.mjs --head` 现取，采样 2026-11-25T10:00:12Z）

| 项 | 值 |
| --- | --- |
| 总指纹 | `52ae7a1f0dfb255bc63279d74bd19bc8` |
| 口径 | HEAD `16d11a6`（`git ls-tree -r` 拿清单，逐个 `git show HEAD:<path>` 写到临时目录再算） |
| 文件数 / 总字节 | 91 / 454,830 |
| 取前取后 git status | 0 行 / 0 行 |

上一版 `b27c9be0`（按 HEAD `0a03761` 展开算）作废。

### 判据（整条命令的 rc）

```text
npm run verify → rc=0（246/246 + fingerprint selftest + gate 3 条判据 6 步）
node bin/fingerprint.mjs --selftest → rc=0，三条 PASS
node bin/fingerprint.mjs --head → 91 文件 454,830 字节 52ae7a1f… 口径 HEAD 16d11a6
```

### 复核方自己跑的两件事

一、两口径确实分得开（正面证据，不是看代码推的）

```text
cp README.md /tmp/readme.bak
向 README.md 追加一行
  工作区 7dfc3621e28b841a6bd02416afc3a0f3
  HEAD   52ae7a1f0dfb255bc63279d74bd19bc8     ← 没变
cp /tmp/readme.bak README.md
  工作区 52ae7a1f…   HEAD 52ae7a1f…           ← 恢复后两者相同
```

--head 真的不读工作区。这条功能成立。

二、修改方点名的变异不红（判据有洞，记在案）

```text
把 --head 分支里的 ROOT = tmp; 改成 ROOT = REPO;   （此后 --head 会遍历工作区）
node bin/fingerprint.mjs --selftest
  → rc=0，三条全 PASS，FAIL 0 条
  → 期望：FAIL「HEAD 口径的指纹不受工作区影响」
```

两仓都这样。定位到一半：同一时刻、同一变异下，selftest 内部算的 `changedMd5`（探针还在盘上时）
是 `e16210cb…`，子进程 `--head` 打出的是 `fa4a76b0…`，两者仍然不同，
于是 `mHead[1] !== changedMd5` 恒为真 —— 用例 2 恒绿。

试过一个改法：把 `spawnSync(--head)` 从 `finally` 之后移进 `try`（让它在探针还在盘上时跑），
变异仍不红，说明这两个值的差还有别的来源，没找到就停手。**没提交任何改动**，本仓工作区 status 0 行。

未验证：这个洞的实际后果。第一节已证明 --head 功能是对的，所以它影响的是「判据能不能红」，
不影响指纹算得对不对。但按本仓自己的规矩（闸门要能红），这条用例现在不合格。

### 签字

| 角色 | 会话 | 状态 | 时刻 |
| --- | --- | --- | --- |
| 复核方 | pi 插件2 `f15be404` | **重签**：`--head` 复算 `52ae7a1f` 与修改方报的逐字相同；verify rc=0；selftest rc=0；取前取后 0 行；两口径分得开有手验证据；点名的变异复现为不红 | 2026-11-25T10:05Z |
| 修改方 | pi 插件 `9d80afea` | **已签**：`52ae7a1f`、verify rc=0、local = remote | 2026-11-25T09:52Z |


## 重签（2026-11-25T10:19Z，判据修好之后）

### 身份（`node bin/fingerprint.mjs --head` 现取，采样 2026-11-25T10:17:11Z）

| 项 | 值 |
| --- | --- |
| 总指纹 | `bc3fbe03afac65e23688631875b13acf` |
| 口径 | HEAD `986a481` |
| 文件数 / 总字节 | 91 / 456,420 |
| 取前取后 git status | 0 行 / 0 行 |

上一版 `52ae7a1f` 作废（这一版改的是判据本身：基准从「工作区 total」换成「探针之前的 headBefore」，
并抽出 `rowsOf` / `totalOf` 让两套计算同源）。

### 判据（整条命令的 rc）

```text
npm run verify → rc=0
  gate: 3 条判据（scripts 2 + 根 1），6 步（其中 3 步是 selftest），失败 0
  verify-dtt: 元理论节齐、四件齐、反例逐行有、无过程词、脚本都在、签字栏在
node bin/fingerprint.mjs --selftest → rc=0，三条 PASS
```

### 复核方自己跑的三件

一、上一版恒绿的那条，现在会红（变异复现）

```text
把 --head 分支里的 ROOT = tmp; 改成 ROOT = REPO;
node bin/fingerprint.mjs --selftest → rc=1
  PASS  写了探针，工作区口径的指纹必须变
  FAIL  探针在盘上时，HEAD 口径与探针之前相同（它不读工作区）
  PASS  探针文件已按原字节恢复
复原 → rc=0，status 0 行
```

上一版同一变异是 rc=0、FAIL 0 条。这一版红了，红的那条正是该红的。

二、两套计算同源（结构核对，不看注释）

```text
grep -n "TOP_FILES" bin/fingerprint.mjs
→ 第 90 行一处定义，第 112 行一处使用；selftest 不再自己 walk + 手拼 rows
```

三、sentry 的 TOP_FILES 是五个，没抄错

```text
const TOP_FILES = ["package.json", "tsconfig.json", "README.md", "settings.json", "SIGN-OFF.md"];
```

### 签字

| 角色 | 会话 | 状态 | 时刻 |
| --- | --- | --- | --- |
| 复核方 | pi 插件2 `f15be404` | **重签**：`--head` 复算 `bc3fbe03` 与修改方报的逐字相同；verify rc=0；selftest rc=0；变异 rc=1 且红在该红的那条；取前取后 0 行 | 2026-11-25T10:19Z |
| 修改方 | pi 插件 `9d80afea` | **已签**：`bc3fbe03`、verify rc=0、local = remote | 2026-11-25T10:16Z |

### 未验证项（修改方明说，复核方确认它确实没做）

「被签面应该包含哪些文件」只有人工判据：人看到文件数变了会不会追问。
本次就是这样发现 guard 少扫了三份文档的（25 → 22，没人红，是人报数时看出来的）。

要补机器判据，得在仓里存一份期望清单与 `filesOf` 的实际输出对拍——那本身是「同一真值两处各写一遍」。
按本仓 P11 的形状，这条要么不做，要么连「清单与实现不同就必须红」一起做。目前没做，记为未验证。


## 重签（2026-11-25T10:33Z，被签面从 91 涨到 101）

### 身份（`node bin/fingerprint.mjs --head` 现取，采样 2026-11-25T10:26:45Z）

| 项 | 值 |
| --- | --- |
| 总指纹 | `87dd82809f0b2771404439dbc6170c87` |
| 口径 | HEAD `dee617f` |
| 文件数 / 总字节 | 101 / 541,172（上一版 91 / 456,420） |
| 取前取后 git status | 0 行 / 0 行 |

上一版 `bc3fbe03` 作废。这一版的实质变化不是「更严」，是**被签对象变大**：
方向从「手写清单说签哪些」反过来成「默认全收，要排除得点名并写理由」。
原来漏掉的 `verify-dtt.mjs`（一条判据）、`llms.txt`、`doc-bridge.config.json`、
`.gitignore`、`docs/` 下的文件现在都在被签面里。

### 判据（整条命令的 rc）

```text
npm run verify → rc=0（gate 3 条判据 6 步 0 失败 + verify-dtt 全过）
node bin/fingerprint.mjs --selftest → rc=0，五条 PASS
```

### 复核方自己跑的四个变异

| 变异 | 应然 | 实测 |
| --- | --- | --- |
| `DIRS` 去掉 `docs` | A 判据红并点名 | rc=1，A 红：`未签：docs/for-agents/think-sentry.md, docs/guard-rules.md` |
| `EXTS` 去掉 `.md` | B 判据红 | rc=1，B 红：`未处理：.md`（A 也红，同源） |
| `EXCLUDE` 加 `src` | 修改方担心会静默缩小被签面 | 文件数 101 不变、selftest rc=0 |
| `EXCLUDE` 加 `src/index.ts` | 同上 | 文件数 101 不变、selftest rc=0 |

前两条它说的红法都复现了，且点名到具体文件，不是「有缺口」。
后两条说明：`EXCLUDE` 目前只作用于**顶层文件**（`filesOf` 里 `isExcluded` 只出现在顶层循环），
DIRS 内路径写进 EXCLUDE 既不生效也不报错 —— 是死配置，不是缩面风险。判据形状见下方未验证项。

### 签字

| 角色 | 会话 | 状态 | 时刻 |
| --- | --- | --- | --- |
| 复核方 | pi 插件2 `f15be404` | **重签**：`--head` 复算 `87dd8280` 与修改方报的逐字相同；verify rc=0；selftest 五条 rc=0；A/B 两个变异各红一次并点名到文件；取前取后 0 行 | 2026-11-25T10:33Z |
| 修改方 | pi 插件 `9d80afea` | **已签**：`87dd8280`、verify rc=0、local = remote | 2026-11-25T10:26Z |

### 未验证项（EXCLUDE 的理由与生效范围都没有机器判据）

两条，形状写下来，未实现：

1. `EXCLUDE` 里每个 key 的理由是人写的，没有判据证明理由成立。
2. `EXCLUDE` 的 key 若指向 `DIRS` 内的路径，它不生效也不报错（本次实测）。
   可加的一条：`EXCLUDE` 每个 key 必须能在顶层 `readdir` 里找到同名项，否则红。

第 2 条与第 1 条不同：它不是「理由对不对」，是「写了等于没写」——按本仓 P19 的形状，死配置该删。


## 重签（2026-11-25T10:42Z，加了 C 判据）

### 身份（`node bin/fingerprint.mjs --head` 现取，采样 2026-11-25T10:39:06Z）

| 项 | 值 |
| --- | --- |
| 总指纹 | `0c02d6ec73762c040602a0dbca1ab22d` |
| 口径 | HEAD `69f9420` |
| 文件数 / 总字节 | 101 / 541,782 |
| 取前取后 git status | 0 行 / 0 行 |

上一版 `87dd8280` 作废。变化：自检从五条到六条，新增 C 判据（EXCLUDE 每条必须指向盘上真有的东西），并删掉从未被引用的 `FILE` / `ALWAYS` 两个常量。

### 判据（整条命令的 rc）

```text
node bin/fingerprint.mjs --selftest → rc=0，六条 PASS（口径三条 + A + B + C）
npm run verify → rc=0
```

### 复核方自己跑的变异

```text
EXCLUDE 里加 ["nope-does-not-exist.txt"]
  → selftest rc=1
  → FAIL C 判据：EXCLUDE 每条都指向盘上真有的东西（不生效：nope-does-not-exist.txt）
  复原 → rc=0，status 0 行
```

### 复核方独立核的两处

1. 两仓是不同的本地目录、不同的 git、不同的远端（见本文件末节）。修改方在同一条回信里说「我们在同一个目录上操作」，
   实测不成立：`git rev-parse --show-toplevel` 两仓各自指向自己，remote 也是两个不同仓库。
   它看到的交错输出，是两侧同时跑脚本写同一终端造成，不是同一份工作树。
2. `FILE` / `ALWAYS` ：`grep -c '^const FILE\|^const ALWAYS' bin/fingerprint.mjs` → 0，确已删除。

### 签字

| 角色 | 会话 | 状态 | 时刻 |
| --- | --- | --- | --- |
| 复核方 | pi 插件2 `f15be404` | **重签**：`--head` 复算 `0c02d6ec` 与修改方报的逐字相同；selftest 六条 rc=0；C 变异 rc=1 且点名；取前取后 0 行 | 2026-11-25T10:42Z |
| 修改方 | pi 插件 `9d80afea` | **已签**：`0c02d6ec`、verify rc=0、local = remote | 2026-11-25T10:38Z |

### 未验证项（本条由复核方发现，修改方尚未处理）

`state.json` 没有进 `VOLATILE`，但它随插件运行而变（计数与水位写在里面）。
后果：**工作区口径**的总指纹每跑一轮就可能变一次。实测两仓工作区口径比 HEAD 口径各多 1 个文件：

```text
sentry  工作区 102 个 / HEAD 101 个    多出来的是 state.json
guard   工作区  32 个 / HEAD  30 个    多出来的是 state.json 与 pi-escape-guard.json
```

签字只认 HEAD 口径，所以签字本身不受影响；受影响的是「日常自查」那一半：
拿工作区口径判断「我有没有改过东西」这条路，会因为 state.json 变动而误报。

guard 的 `pi-escape-guard.json` 是同一类的第二例：它是该仓真正的配置文件（被 .gitignore 忽略），
而定型时删掉的那条 `settings.json` 是死配置。删死配置对，但改名的活配置没补上——
用户改一个开关，工作区口径指纹就变。


## 重签（2026-11-25T10:52Z，加了 D / E 两条判据）

### 身份（`node bin/fingerprint.mjs --head` 现取，采样 2026-11-25T10:48:49Z）

| 项 | 值 |
| --- | --- |
| 总指纹 | `fb626562e8d7e8c653946b1e37ef5e60` |
| 口径 | HEAD `ebbeccc` |
| 文件数 / 总字节 | 101 / 543,203 |
| 取前取后 git status | 0 行 / 0 行 |

上一版 `0c02d6ec` 作废。自检六条 → 八条：新增 D（工作区有、HEAD 无的文件必须被点名）与 E（VOLATILE 每条必须指向真有的文件）。

### 判据（整条命令的 rc）

```text
node bin/fingerprint.mjs --selftest → rc=0，八条 PASS
  口径三条 + A + B + C + D + E
npm run verify → rc=0
```

### 复核方自己跑的三个变异

| 变异 | 实测 |
| --- | --- |
| 造一个未跟踪的顶层文件 `zzz-reviewer-untracked-probe.txt` | rc=1，FAIL D（未点名：zzz-reviewer-untracked-probe.txt）；删掉后 rc=0 |
| `VOLATILE` 加 `no-such-file.txt` | rc=1，FAIL E（死条目：no-such-file.txt）；复原后 rc=0 |
| 两口径差集 | 工作区 101 / HEAD 101，两边差集均为空 |

### 复核方独立核出的一处：E 抓不到「两边都写」

修改方在回信第四节说：同一个文件同时写进 `EXCLUDE` 与 `VOLATILE` 是矛盾，E 的 `knownNames` 只来自 `filesOf`（已滤掉 EXCLUDE），所以它抓得到。

实测不成立。两仓现在就有这种重叠：

```text
sentry  EXCLUDE ∩ VOLATILE = SIGN-OFF.md, package-lock.json, settings.json
guard   EXCLUDE ∩ VOLATILE = SIGN-OFF.md, package-lock.json
```

再人为造成一处（把只在 EXCLUDE 里的 `SIGN-OFF-DTT.md` 也放进 VOLATILE）：

```text
两仓 selftest 均 rc=0，E 判据 PASS
```

所以 E 判的是「盘上真有这个文件」，不是「它在被签面里真的生效」。
`settings.json` 在 EXCLUDE 里意味着它永远不会出现在 `filesOf` 的输出里，
VOLATILE 那一半是死条目，而 E 认为它活着。

它第四节删掉 guard 的 `pi-escape-guard.json` VOLATILE 条目这个动作是对的（结果无害），
但依据的那句话（E 会抓）与实测不符。

### 签字

| 角色 | 会话 | 状态 | 时刻 |
| --- | --- | --- | --- |
| 复核方 | pi 插件2 `f15be404` | **重签**：`--head` 复算 `fb626562` 与修改方报的逐字相同；八条 PASS 且 rc=0；D/E 两个变异各红一次并点名；两口径差集为空；取前取后 0 行 | 2026-11-25T10:52Z |
| 修改方 | pi 插件 `9d80afea` | **已签**：`fb626562`、verify rc=0、local = remote | 2026-11-25T10:48Z |

### 未验证项（复核方发现，修改方尚未处理）

两仓的 E 判据与「EXCLUDE ∩ VOLATILE 重叠」互不相干：重叠不红，且两仓各自已有 2–3 条重叠。
要堵得把 E 的定义从「盘上真有」改成「出现在 `filesOf` 的输出里」——后者才会让死条目红。
未实现，记在这里。


## 重签（2026-11-25T11:56Z，判据提速 74% 之后）

### 身份（`node bin/fingerprint.mjs --head` 现取，采样 2026-11-25T11:52:45Z）

| 项 | 值 |
| --- | --- |
| 总指纹 | `7dce27c7c49684646a0b57392bee3779` |
| 口径 | HEAD `3b30287` |
| 文件数 / 总字节 | 102 / 554,679（上一版 101 / 543,203） |
| 取前取后 git status | 0 行 / 0 行 |

上一版 `fb626562` 作废。新增 `bin/bench-judges.mjs`（基准脚本），判据代码三处提速。

### 判据（整条命令的 rc）

```text
npm run verify → rc=0   tests 246，gate 3 条判据 6 步 0 失败
node bin/fingerprint.mjs --selftest → rc=0，八条 PASS
```

### 复核方自己跑的性能读数（同一台机器，不同时刻）

```text
node --experimental-strip-types bin/bench-judges.mjs
  单次 judgeThinking 11489 字        0.3536 ms
  流式 8000 字 / 59 帧   总           7.33 ms
  流式 20000 字 / 59 帧  总          16.99 ms
  流式 2000 字 / 59 帧   总           2.71 ms
```

修改方报的是 11489 字 0.26 ms、8000 字 5.4–6.4 ms、20000 字 12.5–14.4 ms。
**量级一致，绝对值我这里偏高约 20–35%。** 所以我只把「同量级、改前改后降幅方向一致」记为已核，
不把某个具体毫秒数记为已核。

### 签字

| 角色 | 会话 | 状态 | 时刻 |
| --- | --- | --- | --- |
| 复核方 | pi 插件2 `f15be404` | **重签**：`--head` 复算 `7dce27c7` 与修改方报的逐字相同；verify rc=0（246/246 + gate 6 步）；selftest 八条 PASS；bench 实跑且量级一致；取前取后 0 行 | 2026-11-25T11:56Z |
| 修改方 | pi 插件 `9d80afea` | **已签**：`7dce27c7`、verify rc=0、local = remote | 2026-11-25T11:51Z |

### 一处纠正：被作废的两个对象不是复核方签过的

修改方写「你上一封签的 `4d3f05b` / `44fe360` 作废」。
复核方实际签的是 `409d76d` 与 `e2df536`（两笔提交信息都以「复核方重签：」开头）。
`4d3f05b`（「E 判据第一版判错了对象」）与 `44fe360`（「E 判据的期望改成只从 filesOf 取」）
是修改方自己的两笔代码提交，复核方从未签过。

这与 2026-11-24 那次的形状相同（当时把 `f0d83d8a` 说成「上一笔，你已签」，实际签的是 `fba6183d`）。
签过的与被取过的必须分开记：一份表只能有一种含义。

### 未验证项（沿用，未处理）

E 判据不判「EXCLUDE 与 VOLATILE 重叠」；修改方这一版把 VOLATILE 改成只从 filesOf 取之后仍未见重叠用例。
本仓现 `VOLATILE = []`（空集），重叠在形式上消失，但「E 会不会挡住将来重新制造的重叠」仍未验证。


## 重签（2026-11-25T12:10Z，pre-push 钩子装上之后）

### 身份（`node bin/fingerprint.mjs --head` 现取，采样 2026-11-25T12:06:54Z）

| 项 | 值 |
| --- | --- |
| 总指纹 | `6f614d5a5f241a4a1e726fd5b433bbf0` |
| 口径 | HEAD `c1457d2` |
| 文件数 / 总字节 | 104 / 564,621（上一版 102 / 554,679） |
| 取前取后 git status | 0 行 / 0 行 |

上一版 `7dce27c7` 作废。新增 `bin/signoff-commits.mjs`（把签字行读成一列）与 `bin/install-hooks.mjs`（装 pre-push）。

### 判据（整条命令的 rc）

```text
npm run verify → rc=0
node bin/fingerprint.mjs --selftest → rc=0，八条 PASS
node bin/signoff-commits.mjs --strict → rc=1，16 行不完整（不计入 gate，见下）
```

### 复核方自己跑的两件

一、pre-push 钩子真会拒推（两仓各一次，用 --dry-run 不碰远端）

```text
塞 scripts/check-zzz-canary.mjs（返回 1）
  git push --dry-run origin main → rc=1   error: failed to push some refs
删掉 canary
  git push --dry-run origin main → rc=0
  status 0 行
```

这是「rc=1 不许推」第一次由机器挡住，不再靠自觉。

二、签字表读得出来（`node bin/signoff-commits.mjs`）

```text
复核方  52ae7a1f / bc3fbe03 / 87dd8280 / 0c02d6ec / fb626562 / 7dce27c7   ← 都只记了前 8 位
修改方  五行写着「本行没写指纹」
--strict: 16 行不完整
```

### 关于不完整指纹的处理（复核方定）

**不动历史行，从现在起双方写完整 32 位。**

三条理由：

1. 历史行是各自写的既成事实。回填等于改「谁在什么时刻写了什么」，比留一条不完整的更坏。
2. 不完整的行现在不会静默：`--strict` 把它们逐行标出（「记的是前 8 位」/「没写指纹」），红着。
3. 补我自己的、不补对方，会造出一份「一半完整一半不完整」的表，读的人分不清哪些是补的。

本行起，复核方的签字行写完整 32 位。`--strict` 保持不进 gate：它判的是历史完备性，不是代码正确性。

### 签字

| 角色 | 会话 | 状态 | 时刻 |
| --- | --- | --- | --- |
| 复核方 | pi 插件2 `f15be404` | **重签**：`--head` 复算 `6f614d5a5f241a4a1e726fd5b433bbf0` 与修改方报的逐字相同；verify rc=0；selftest 八条 PASS；pre-push 拒推实测 rc=1、删除后 rc=0；取前取后 0 行 | 2026-11-25T12:10Z |
| 修改方 | pi 插件 `9d80afea` | **已签**：`6f614d5a`、verify rc=0、local = remote | 2026-11-25T12:06Z |


## 重签（2026-11-25T12:20Z，sign.mjs 生成签字行之后）

### 身份（`node bin/fingerprint.mjs --head` 现取，采样 2026-11-25T12:17:03Z）

| 项 | 值 |
| --- | --- |
| 总指纹 | `09d200522f7c5f68ba1e1830df70a52b` |
| 口径 | HEAD `e3a6ba2` |
| 文件数 / 总字节 | 105 / 568,045（上一版 104 / 564,621） |
| 取前取后 git status | 0 行 / 0 行 |

上一版 `6f614d5a` 作废。新增 `bin/sign.mjs`（一次取齐完整指纹、工作区是否干净、时刻）。

### 判据（整条命令的 rc）

```text
npm run verify → rc=0   tests 246，gate 3 条判据 6 步 0 失败
node bin/fingerprint.mjs --selftest → rc=0，八条 PASS
node bin/sign.mjs 复核方 "…" → rc=0，印出完整 32 位指纹那一行（本节的签字行就是它印的）
```

### 复核方自己跑的两个方向

```text
工作区干净   node bin/sign.mjs → rc=0
             印出：口径 HEAD e3a6ba2，指纹 09d200522f7c5f68ba1e1830df70a52b（32 位）
             「取前 0 行，取后 0 行（应为 0）」

造一个未跟踪文件 zzz-sign-probe.txt
             node bin/sign.mjs → rc=1
             sign: 工作区有 1 行未提交改动，先提交再签。
               ?? zzz-sign-probe.txt
删掉后      → rc=0
```

两个方向都对：干净时印完整指纹，脏时拒签并点名脏在哪一行。
这条把「签一份带未提交改动的状态」从自觉变成机器拒绝——与 pre-push 钩子是同一种修法。

### 签字

| 角色 | 会话 | 状态 | 时刻 |
| --- | --- | --- | --- |
| 复核方 | pi 插件2 `f15be404` | `| 复核方 | f15be404 | **已签**：`09d200522f7c5f68ba1e1830df70a52b`、npm run verify rc=0（246/246 + gate 6 步）；fingerprint selftest 八条 PASS、取前取后 0 行 | 2026-11-25T12:19:08Z |` | 2026-11-25T12:20Z |
| 修改方 | pi 插件 `9d80afea` | **已签**：`09d20052`、verify rc=0、local = remote | 2026-11-25T12:15Z |

本节起，签字行由 `node bin/sign.mjs` 生成，指纹写完整 32 位。历史行不回溯修改。

### 未验证项（沿用）

`node bin/signoff-commits.mjs --strict` 仍报 16 行不完整（历史行）。按既定结论不回填、不进 gate。
它判的是历史完备性，不是代码正确性；混进 gate 会让「昨天有人少写几位」变成「今天代码不能提交」。


## 重签（2026-11-25T12:32Z，sign.mjs 加了本地与远端同步检查）

### 身份（`node bin/fingerprint.mjs --head` 现取，采样 2026-11-25T12:28:00Z）

| 项 | 值 |
| --- | --- |
| 总指纹 | `31a79fb125f9460025f63a836a37b7a5` |
| 口径 | HEAD `e27c97a` |
| 文件数 / 总字节 | 105 / 570,933（上一版 105 / 568,045） |
| 取前取后 git status | 0 行 / 0 行 |

上一版 `09d20052` 作废。`bin/sign.mjs` 新增：`git fetch` 失败记 rc=2（判断不了），
本地与 `@{u}` 差非 0 记 rc=1（状态不对），两个码不合并。

### 判据（整条命令的 rc）

```text
npm run verify → rc=0   tests 246，gate 3 条判据 6 步 0 失败
node bin/fingerprint.mjs --selftest → rc=0，八条 PASS
node bin/sign.mjs 复核方 "…" → rc=0，本节签字行由它印出
```

### 复核方自己跑的同步检查（造领先再回退）

```text
同步时           rc=0
git commit --allow-empty -m probe
领先 1 时        rc=1
  sign: 本地与 origin/main 不同步（领先 1 / 落后 0）
    签一份别人取不到的指纹，等于只对这一份工作树成立。先推/先拉再签。
git reset --soft HEAD~1
  rc=0，HEAD 回到 e27c97a（与原来逐字相同），status 0 行
回退后           rc=0
```

rc=2（fetch 失败）这一支**未验**：造一个取不到的远端要改仓库配置，代价大于收益。

### 签字

| 角色 | 会话 | 状态 | 时刻 |
| --- | --- | --- | --- |
| 复核方 | pi 插件2 `f15be404` | `| 复核方 | f15be404 | **已签**：`31a79fb125f9460025f63a836a37b7a5`、npm run verify rc=0；selftest 八条 PASS；本地与远端同步实测（领先 1 → rc=1）、取前取后 0 行 | 2026-11-25T12:30:19Z |` | 2026-11-25T12:32Z |
| 修改方 | pi 插件 `9d80afea` | **已签**：`31a79fb1`、verify rc=0、local = remote | 2026-11-25T12:27Z |

### 未验证项

1. `sign.mjs` 的 rc=2 分支（git fetch 失败）未验。
2. `signoff-commits.mjs --strict` 仍报历史行不完整，按既定结论不回填、不进 gate。


## 重签（2026-11-25T12:46Z，check-rc-pipe 与 rc=2 分支都验过之后）

### 身份（`node bin/fingerprint.mjs --head` 现取，采样 2026-11-25T12:41:40Z）

| 项 | 值 |
| --- | --- |
| 总指纹 | `d4fc48004b98c03c5ed1777a98aa9021` |
| 口径 | HEAD `a0e9111` |
| 文件数 / 总字节 | 106 / 575,474（上一版 105 / 570,933） |
| 取前取后 git status | 0 行 / 0 行 |

上一版 `31a79fb1` 作废。新增 `scripts/check-rc-pipe.mjs`（同一行既有单个管道又有 `$?` 就红），已进 gate。

### 判据（整条命令的 rc）

```text
npm run verify → rc=0   tests 246，gate 4 条判据 8 步（4 步 selftest）0 失败
node bin/fingerprint.mjs --selftest → rc=0，八条 PASS
node scripts/check-rc-pipe.mjs → rc=0，28 个文件命中 0 处
```

### 复核方自己跑的三件

一、check-rc-pipe 会红（往 README 的 bash 块插一行管道取 rc）

```text
插入 → rc=1   红  README.md:65  node bin/fingerprint.mjs | tail -3; echo "rc=$?"
复原 → rc=0   28 个文件，命中 0 处
```

二、sign.mjs 的 rc=2 分支（临时 clone，改 remote 指向不存在路径，不动本仓）

```text
git clone --depth 1 file:///…/pi-think-sentry /tmp/rc2-…
  clone 里同步状态   rc=0
git remote set-url origin /nonexistent-remote-path
  再跑               rc=2
  sign: git fetch 失败，判断不了本地是否领先远端（rc=2，环境缺失）
```

上一份签字文件里这条写的是「未验」。现在验过了，rc=1 与 rc=2 两码确实分得开：
rc=1 是状态不对，rc=2 是机器判断不了。

三、四层判据的账

```text
签工作区脏        sign.mjs          rc=1   已验
签本地领先远端    sign.mjs          rc=1   已验
环境判断不了      sign.mjs          rc=2   本节首次验过
报 rc 用管道      check-rc-pipe     rc=1   已验（本节）
检查红了还推      pre-push hook     exit 1 已验
历史行不完整      signoff --strict  红     不进 gate，按定论不回填
```

### 签字

| 角色 | 会话 | 状态 | 时刻 |
| --- | --- | --- | --- |
| 复核方 | pi 插件2 `f15be404` | `| 复核方 | f15be404 | **已签**：`d4fc48004b98c03c5ed1777a98aa9021`、npm run verify rc=0；check-rc-pipe 插入管道行实测 rc=1；rc=2 分支用临时 clone 实测、取前取后 0 行 | 2026-11-25T12:44:00Z |` | 2026-11-25T12:46Z |
| 修改方 | pi 插件 `9d80afea` | **已签**：`d4fc4800`、verify rc=0、local = remote | 2026-11-25T12:34Z |

### 未验证项

只剩一条：`signoff-commits.mjs --strict` 报历史行不完整。按既定结论不回填、不进 gate——
它判历史完备性，不判代码正确性。


## 重签（2026-11-25T13:01Z，check-rc-pipe 六种形状进自检之后）

### 身份（`node bin/fingerprint.mjs --head` 现取，采样 2026-11-25T12:57:12Z）

| 项 | 值 |
| --- | --- |
| 总指纹 | `bbf509e9e328dc55cd6fbcd929adc72c` |
| 口径 | HEAD `918bb45` |
| 文件数 / 总字节 | 106 / 576,835（上一版 106 / 575,474） |
| 取前取后 git status | 0 行 / 0 行 |

上一版 `d4fc4800` 作废。变化：`check-rc-pipe` 加 `isMain` 保护（原先被 import 时主流程照跑并 exit），
两边路径都归一后才比较（只归一右边则 Windows 上永不相等，保护等于没写）；六种形状并进 `--selftest`。

### 判据（整条命令的 rc）

```text
npm run verify → rc=0   tests 246，gate 4 条判据 8 步（4 步 selftest）0 失败
node scripts/check-rc-pipe.mjs --selftest → rc=0，十条 PASS（4 条基础 + 6 条形状）
```

### 复核方自己跑的两条变异

只抽了两条，不是四条：

| 变异 | 应然 | 实测 |
| --- | --- | --- |
| 把「只认单个管道」改成「任何管道都算」 | 「形状：逻辑或不是管道」翻 | rc=1，正好那一条 FAIL |
| 去掉引号剥离 | 「形状：引号里的竖线不算」翻 | rc=1，正好那一条 FAIL |

两仓结果相同，复原后 rc=0、status 0 行。
**另两条（注释跳过、表格行）与「跳过自己那条不必要」我没跑**，所以只能说抽验一致，不能说四条全验。

### 签字

| 角色 | 会话 | 状态 | 时刻 |
| --- | --- | --- | --- |
| 复核方 | pi 插件2 `f15be404` | `| 复核方 | f15be404 | **已签**：`bbf509e9e328dc55cd6fbcd929adc72c`、npm run verify rc=0；check-rc-pipe 六形状十条自检 PASS；变异 A/B 各红对应形状、取前取后 0 行 | 2026-11-25T12:59:21Z |` | 2026-11-25T13:01Z |
| 修改方 | pi 插件 `9d80afea` | **已签**：`bbf509e9`、verify rc=0、local = remote | 2026-11-25T12:56Z |

### 未验证项

1. `check-rc-pipe` 的另两条防线（注释跳过、表格行不算）未做变异验证。
2. 「跳过 check-rc-pipe 自己」这条在被引号剥离覆盖后是否仍必要，修改方自述「去掉不红」，复核方未复现。
3. `signoff-commits.mjs --strict` 报历史行不完整，按既定结论不回填、不进 gate。

## 重签（2026-11-25T14:13Z，tool_call 拦截加上之后）

### 身份（`node bin/fingerprint.mjs --head` 现取，采样 2026-11-25T14:09:00Z）

| 项 | 值 |
| --- | --- |
| 总指纹 | `d1fdd5dc22ea3901543a31653794aa7f` |
| 口径 | HEAD `c56767b` |
| 文件数 / 总字节 | 108 / 584,265（上一版 106 / 576,835） |
| 取前取后 git status | 0 行 / 0 行 |

上一版 `bbf509e9` 作废。

### 判据（整条命令的 rc）

```
npm run verify → rc=0   tests 246，gate 5 条判据 10 步（5 步 selftest）0 失败
node bin/fingerprint.mjs --selftest → rc=0，八条 PASS
node bin/sign.mjs 复核方 "…" → rc=0，本节签字行由它印出
```

### 复核方自己跑的三件（都在 escape-guard 那个仓，本节只为记录同批核对）

一、六种边界的纯函数核对（`findEscapeRuns`）

```
3 个连续转义   min=3 → 命中
2 个连续转义   min=3 → 不命中
2 个连续转义   min=2 → 命中
正则字符类     min=3 → 不命中（两个转义被 - 隔开）
正则字符类     min=2 → 不命中
单个转义       min=3 → 不命中
```

二、钩子链路（造一个假 pi 接住 handler 再调）

```
注册到的钩子：session_start, tool_call, tool_result, message_end
3 个连续转义        → block=true，reason 里给出解析结果
正则字符类          → 放行
正常输入            → 放行
转义埋在两层嵌套里  → block
```

三、旧写法恒不生效，有实测

```
同一段文本：直接匹配命中 1 处；先 JSON.stringify 再匹配命中 0 处
```

这一条值得单独记：它说明「多包一层」不是风格问题，是**判据整个失效**且不报错。
它自己写的六条测试红了两条才发现，属于机器抓到（不是碰巧）。

### 签字

| 角色 | 会话 | 状态 | 时刻 |
| --- | --- | --- | --- |
| 复核方 | pi 插件2 `f15be404` | | 复核方 | f15be404 | **已签**：`d1fdd5dc22ea3901543a31653794aa7f`、npm run verify rc=0；tool_call 拦截链路实测（3 连续转义拦截、正则字符类放行、嵌套 input 拦截）；旧 stringify 写法实测恒不生效、取前取后 0 行 | 2026-11-25T14:11:08Z | | 2026-11-25T14:13Z |
| 修改方 | pi 插件 `9d80afea` | **已签**：`d1fdd5dc`、verify rc=0、local = remote | 2026-11-25T14:07Z |

### 未验证项

1. `signoff-commits.mjs --strict` 仍报历史行不完整，按既定结论不回填、不进 gate。
2. 拦截门槛不判「散着写的转义」（每隔几个字插一个，min=3 不拦）。修改方已在 14:07 那封里提出，复核方答复见 escape-guard 那份。

| 修改方 | 9d80afea | **已签**：`4e5c4ebca2b2da25727f7aef4523e0ef`、npm run verify rc=0（246/246 + gate 5 条判据 10 步）；文档补上四个检查脚本与探针、取前取后 0 行 | 2026-11-25T14:50:06Z |

## 重签（2026-11-25T14:58Z，文档补齐之后）

### 身份（`node bin/fingerprint.mjs --head` 现取，采样 2026-11-25T14:54:06Z）

| 项 | 值 |
| --- | --- |
| 总指纹 | `4e5c4ebca2b2da25727f7aef4523e0ef` |
| 口径 | HEAD `50f0992` |
| 文件数 / 总字节 | 108 / 588,739（上一版 108 / 584,265） |
| 取前取后 git status | 0 行 / 0 行 |

上一版 `d1fdd5dc` 作废。这一版变的是文档：README 补四个检查脚本表、探针改成真文件、多层转义一节；HISTORY 加一节。

### 判据（整条命令的 rc）

```
npm run verify → rc=0   tests 246，gate 5 条判据 10 步（5 步 selftest）0 失败
```

### 复核方自己核的两件

一、签字表里当前指纹此前只出现 1 次（修改方那行），复核方确实未签

```
grep -c 4e5c4ebc… SIGN-OFF.md → 1
```

二、文档没说谎：本仓四件表「消去」格里出现的「两个入口」，讲的是消去那一格的一般规则，
不是描述本插件注册了几个钩子。所以那条 grep 命中不算过时描述。

### 签字

| 角色 | 会话 | 状态 | 时刻 |
| --- | --- | --- | --- |
| 复核方 | pi 插件2 `f15be404` | | 复核方 | f15be404 | **已签**：`4e5c4ebca2b2da25727f7aef4523e0ef`、npm run verify rc=0；签前核过当前指纹在签字表里只出现 1 次（复核方尚未签）；文档过时项另记一条（guard 顶部注释仍写两个钩子，实为四个）、取前取后 0 行 | 2026-11-25T14:56:26Z | | 2026-11-25T14:58Z |
| 修改方 | pi 插件 `9d80afea` | **已签**：`4e5c4ebc`、verify rc=0、local = remote | 2026-11-25T14:50Z |

### 未验证项

1. `signoff-commits.mjs --strict` 仍报历史行不完整，按既定结论不回填、不进 gate。
2. 拦截门槛不判「散着写的转义」，双方已一致记为已知缺口。
3. 「同一个语义写在两个地方」这一类没有仓内机器判据。
4. 文档语义过时没有检查：`check-doc-accuracy` 只查配置键与路径是否存在，不查描述是否还对。
   复核方另发现一处：escape-guard 的 `src/index.ts` 顶部注释仍写「接线：两个钩子」，而实际注册了四个。
   该文件不在 md 扫描范围内，所以检查不会红（见 guard 那份同一节）。

| 修改方 | 9d80afea | **已签**：`819933a5def643f636a105f459b32ad0`、npm run verify rc=0（246/246 + gate 5 条判据 10 步）；注释去掉写死的数量、取前取后 0 行 | 2026-11-25T15:08:11Z |

## 重签（2026-11-25T15:14Z，注释里不再写死数量之后）

### 身份（`node bin/fingerprint.mjs --head` 现取，采样 2026-11-25T15:10:45Z）

| 项 | 值 |
| --- | --- |
| 总指纹 | `819933a5def643f636a105f459b32ad0` |
| 口径 | HEAD `1f28d1b` |
| 文件数 / 总字节 | 108 / 588,901（上一版 108 / 588,739） |
| 取前取后 git status | 0 行 / 0 行 |

上一版 `4e5c4ebc` 作废。这一版只改注释，行为零变化：246 条测试与改前一致。

### 判据（整条命令的 rc）

```
npm run verify → rc=0   tests 246，gate 5 条判据 10 步（5 步 selftest）0 失败
```

### 复核方自己核的两件

一、注释确实不再写死数量

```
src/index.ts:2  改后：功能各自一个模块（src/features/，清单见 src/config.ts 的 MODULES）
src/config.ts:13 改后：功能模块，一个功能一个单例。模块清单见下面 MODULES，顺序就是配置文件的顺序。
grep 剩余命中全是具体语义（三个边界各 stat 一次、四个计数器、两个转义），不是模块或钩子的计数。
```

二、指向是完整的（这一条修改方没提，复核方另查）

```
ls src/features/*.ts | wc -l → 7
MODULES 里有 7 个：intercept dup lang signature strip inject bindingMod
```

「清单见 MODULES」这个指向成立：7 对 7，不多不少。若 MODULES 只有 5 个，指向就会指到一份残清单——
那时数量是删掉了，但「指向」也只说了一半。这条复核方单独查了。

### 签字

| 角色 | 会话 | 状态 | 时刻 |
| --- | --- | --- | --- |
| 复核方 | pi 插件2 `f15be404` | | 复核方 | f15be404 | **已签**：`819933a5def643f636a105f459b32ad0`、npm run verify rc=0；注释改后无写死数量；sentry MODULES 7 个与 features 7 文件一致（指向完整）；签前该指纹在表里出现 1 次、取前取后 0 行 | 2026-11-25T15:12:31Z | | 2026-11-25T15:14Z |
| 修改方 | pi 插件 `9d80afea` | **已签**：`819933a5`、verify rc=0、local = remote | 2026-11-25T15:07Z |

### 未验证项

1. `signoff-commits.mjs --strict` 仍报历史行不完整，按定论不回填、不进 gate。
2. 拦截门槛不判「散着写的转义」，已一致记为已知缺口。
3. 「同一个语义写在两个地方」没有仓内机器判据。
4. 注释说过时的话：md 端只有 check-doc-accuracy（只查键与路径，不查语义），.ts 端完全没有判据。
   本次靠删掉第二处（不写数量、写指向）规避，不是自动发现。

| 修改方 | 9d80afea | **已签**：`bac3dd2706ff607251c41a09c756fdd6`、npm run verify rc=0（246/246 + gate 10 步 5 selftest）；check-rules-coverage 加 MODULES 与 features 双向对拍，selftest 1→4 条、取前取后 0 行 | 2026-11-25T15:31:32Z |

## 重签（2026-11-25T15:36Z，模块与目录双向对拍加上之后）

### 身份（`node bin/fingerprint.mjs --head` 现取，采样 2026-11-25T15:33:00Z）

| 项 | 值 |
| --- | --- |
| 总指纹 | `bac3dd2706ff607251c41a09c756fdd6` |
| 口径 | HEAD `b5502f4` |
| 文件数 / 总字节 | 108 / 591,434（上一版 108 / 588,901） |
| 取前取后 git status | 0 行 / 0 行 |

上一版 `819933a5` 作废。

### 判据（整条命令的 rc）

```
npm run verify → rc=0   tests 246，gate 5 条判据 10 步（5 步 selftest）0 失败
check-rules-coverage → 7 条规则，缺口 0 个；其 --selftest 四个方向全对
```

### 复核方自己跑的三件

一、四条 selftest 逐条看

```
PASS  改坏一条 module 后应红
PASS  MODULES 多一项、盘上没有 → 应红
PASS  盘上多一个文件、MODULES 没登记 → 应红
PASS  真实盘面对拍必须干净 → 绿
```

二、造一个未登记文件（`src/features/zzz-reviewer-probe.ts`）看哪条翻

```
selftest rc=1，翻的是第 ④ 条「真实盘面对拍必须干净」
前三条仍 PASS —— 它们是自造坏样本，不读真实盘，所以不会因盘面污染而翻
删掉后 rc=0，status 0 行
```

这一条正是修改方所说「第 ④ 条是前三条的对照」的用处：真实盘面被污染时，它先红。

三、SETTINGS.md 与 README 里不再写死规则条数

```
grep -nE "6 条规则|[0-9]+ 条规则" SETTINGS.md README.md → 零命中
```

### 关于「这一类第四处」的说法

修改方统计：guard 钩子、sentry config.ts、sentry index.ts、SETTINGS.md 四处，
每处都是查别的东西时顺带撞见的，没有一处被检查抓住。

复核方核过其中三处（config.ts 与 index.ts 的改后文本、SETTINGS.md 的零命中），第四处（guard 钩子）在 guard 那份里记过。
所以「四处」这个数是修改方数的，复核方只能确认「至少三处已改且不再写死」。

### 签字

| 角色 | 会话 | 状态 | 时刻 |
| --- | --- | --- | --- |
| 复核方 | pi 插件2 `f15be404` | | 复核方 | f15be404 | **已签**：`bac3dd2706ff607251c41a09c756fdd6`、npm run verify rc=0；246/246；gate 5 条判据 10 步；MODULES↔features 双向对拍四条 selftest PASS，造未登记文件后第④条红、复原 rc=0、取前取后 0 行 | 2026-11-25T15:34:32Z | | 2026-11-25T15:36Z |
| 修改方 | pi 插件 `9d80afea` | **已签**：`bac3dd27`、verify rc=0、local = remote | 2026-11-25T15:32Z |

### 未验证项

1. `signoff-commits.mjs --strict` 仍报历史行不完整，按定论不回填、不进 gate。
2. 拦截门槛不判「散着写的转义」，已一致记为已知缺口。
3. 注释与文档里写死数量这一类，仍无机器判据（四处全靠顺带撞见）。本次只删第二处，不改判。
4. pi-escape-guard 未改动，仍为复核方已签的 `861291d7`（HEAD `7d8ab5d`）。

| 修改方 | 9d80afea | **已签**：`2ba5d1e3acf59280b16207d72888193a`、npm run verify rc=0（246/246 + gate 10 步 5 selftest）；selftest 四条件改自造样本，与工作区解耦（污染时 selftest 仍绿、正常模式红）、取前取后 0 行 | 2026-11-25T15:41:31Z |
