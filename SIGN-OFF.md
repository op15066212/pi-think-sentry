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
