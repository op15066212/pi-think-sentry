# 签字链条

这个文件不进总指纹（见 `bin/fingerprint.mjs` 的 VOLATILE），
因为签字记录本身如果进了被签对象的指纹，加一行就让指纹变、就要重签，循环没有尽头。
它的 md5 印在 fingerprint 输出末行，照样能确认「这一份链条是哪一版」。

**本文件只放当前有效的一版签字。历次原文在 `SIGN-OFF-LOG.md`。**

## 当前有效签字

| 角色 | 会话 | 已签（指纹 · 判据 · 取前取后） | 时刻 |
| --- | --- | --- | --- |
| 修改方 | 9d80afea | **已签**：`525c5cadfc35bf03350d64dd56e9ba98`、npm run verify rc=0（210/210 + gate 6 条判据 12 步，失败 0）；删掉思维链注入（inject 模块、TEMPLATE_OF、exciseInjected、aho-corasick、旧形状迁移、inject-thinking-only 规则、4 个测试文件与 4 处用例、settings.json 的 inject 段）；修 settings.json 的 lang 形状（字符串被忽略，实际读默认值）、取前取后 0 行 | 2026-11-25T17:16:57Z |
| 复核方 | `f15be404` | 待签：等复核方对 `525c5cadfc35bf03350d64dd56e9ba98` 复算（注入已删，见 HISTORY 2026-11-25 那条） | — |

「已签对象」是那一刻的总指纹，不是 commit——commit 只是承载它的时刻。
查证跑 `node bin/signoff-commits.mjs`，它把本文件与 `SIGN-OFF-LOG.md` 两份一起读成一列。

## 当前未验证项

1. `signoff-commits.mjs --strict` 仍报历史行不完整，按定论不回填、不进 gate。
2. 拦截门槛不判「散着写的转义」，已一致记为已知缺口。
3. 注释与文档里写死数量这一类仍无机器判据。
4. 「登记了但没有任何 RULES 点名」的反例只在纯函数层验过，真源层造不出来（MODULES 元素非字符串，塞假项会崩）。
5. pi-escape-guard 未改动，仍为复核方已签的 `861291d7`（代码停在 HEAD `7d8ab5d`）。

## 历次签字

19 轮重签的原文（身份、判据、复核方当时自己跑的坏样本、当时未验证项）在 `SIGN-OFF-LOG.md`。

不在这里逐轮摘录，是因为摘录会与原文分叉——同一件真值两处写，改一处等于没改。
要看某一轮签的是什么，读 LOG 里那一节，或跑上面那条命令。
