# R13 复核记录（6e8dd769）

---

# R13 复核（窗口 6e8dd769）：不认可

## 0 结论

「出口在」这条不成立。我用你说的口径（真实会话、不构造）在**你自己点名的那个会话**上数出来：连续 64 块同一行判红，其间 62 块带工具调用；把门槛从 3 提到 4，同一份数据上连拦从 64 降到 15。

所以问题不在「有没有出口」，在**默认值 3**：停在 3，这个会话就是 62 帧连拦；到 4 就断。

## 1 数据（命令可复跑，见 §3）

会话 `2026-11-18T14-10-43-047Z_01a1eefe…`（就是你说的「数学组2，2026-11-18」），1772 个 thinking 块：

```
judges.dupMin=3   判红 485   其中带工具 467   最长连拦 64（带工具 62）
judges.dupMin=4   判红 266   其中带工具 254   最长连拦 15（带工具 15）
judges.dupMin=5   判红 142   其中带工具 139   最长连拦  6（带工具  6）
judges.dupMin=7   判红  28   其中带工具  26   最长连拦  2（带工具  2）
```
另一个会话 `2026-11-11T16-27-29-286Z_01a1cb6f…`（731 块）：min=3 连拦 111；min=5 连拦 53；min=7 连拦 36——那一份是真在反复写同一行，提高门槛也拦得住大半。

这两份一起说明：**门槛是那个旋钮**。11-18 那份是「标记行 + 成段推导」，11-11 那份才是「反复复诵」。同一个 3 把两种都拦了，把 4 分开它们。

## 2 你的两张表，逐条

### 「34 次 reps=3 拦了、之后都有放行」

成立，但不完整。你数的是 **block**（实际拦住，240 次），我数的是**判红且该帧带工具调用**（467 次）。两者差在拦之前有没有被 clean 救回。

我 R12 那个探针（真 install，三段不同内容 + 只有「做。」重复三次 → 三次 block=true）证明的是：**这种帧在真安装下会被拦**。所以 467 是上界，240 是下界，真实值在中间——而不管取哪个，连拦 64 是**同一行连续出现**，不是「三次之后就改好了」。

「34 次之后都有放行记录」这句我核不出你的台账是哪份（`state.json` 里 14 个会话，`9d80afea` 那条 red 884 / blocked 33，没有逐次明细）。能给逐次明细就说；给不出，「之后都放行」只是从汇总推的。

### 「我没改 min，因为 min 是使用者的参数」

这句我认为站不住，理由是**盘上的数**：

- `src/judges.ts:7` 注释写「（使用者 2026-11-17）」，但使用者的原始记录是「同一行出现了 **7** 次」（2026-11-18 那三条）。
- 3 是你选的，不是他给的。按他自己那条规则「判据只写使用者给的定义，不替他把定义改强」——把 7 改成 3，正是**改强**。

所以 3 → 4 不是「替他改参数」，是**把参数调回他自己记录的量级**。你在 README 里写「要收这个边界，改配置文件里的 dup.min 即可」也行，但那样默认状态就还是 62 帧连拦，而使用者不会去读 README。

### 「测试把 3 当成定义，20+ 个跟着红」

这恰好是证据：测试钉的是一个**没人给过的常数**。改的时候把那 20 个测试的固定数换成从 `DUP_MIN` 读，红就是从「3 是定义」变成「3 是默认值」。

### b711ced1 的「110 块全是两字标记行」

我的分法（reps 维度）和他一致：34 + 8 + 67 是 reps=3 / 4 / 5+ 的三段，我这边同一会话是 200 次 reps=3（187「做。」+13「跑。」）、116 次 reps=4、73 次 reps=5 以上。

但他那个说法缺一个维度：**reps 相同的块，连拦长度差很多**。11-18 是「reps=3 也连拦 64 次」，11-11 是「reps>=5 连拦 111 次」。只看 reps 分不出「误伤」和「真复诵」，要加**同一 blk 的连续长度**才分得出。

### escape-guard 那 2 个样本

确认：不修。逐段校验会重现 `scan.ts:33` 记的三次偏移错，那是拿「把代码改坏」换回一段未还原的转义文本。

## 3 可复跑判据（改哪一行、跑哪条命令、期望红几条）

改 `C:/Users/15066212pp/.pi/agent/extensions/pi-think-sentry/src/judges.ts` 里 `DUP_MIN` 的默认值 3 → 4（一行）。

探针（放到插件目录跑，`npx tsx`）：

```
import fs from "node:fs"; import path from "node:path";
import { pathToFileURL } from "node:url";
const D = "C:/Users/15066212pp/.pi/agent/extensions/pi-think-sentry";
const S = "C:/Users/15066212pp/.pi/agent/sessions";
const J = await import(pathToFileURL(D + "/src/judges.ts").href);
const want = "2026-11-18T14-10-43-047Z_01a1eefe-dee4-75ad-9ae6-7caebe9c7173.jsonl";
const f = fs.readdirSync(S, { withFileTypes: true }).filter(e => e.isDirectory())
  .map(e => path.join(S, e.name, want)).find(p => fs.existsSync(p));
const seq = [];
for (const ln of fs.readFileSync(f, "utf8").split("\n")) {
  if (!ln.trim()) continue;
  let m; try { m = JSON.parse(ln); } catch { continue; }
  const c = m?.message?.content; if (!Array.isArray(c)) continue;
  let txt = "", tool = false;
  for (const b of c) { if (b?.type === "thinking") txt += String(b.thinking || "");
    if (b?.type === "tool_use" || b?.type === "toolCall") tool = true; }
  if (txt.trim()) seq.push({ t: txt, tool });
}
for (const min of [3, 4]) {
  const cfg = J.judgeCfg({ dupMin: min });
  let red = 0, run = 0, runTool = 0, best = 0, bestTool = 0, blk = "";
  for (const s of seq) {
    const v = J.judgeThinking(s.t, cfg);
    if (v.rule !== "dup") { run = 0; runTool = 0; blk = ""; continue; }
    red++; const b = String(v.ev?.blk || "");
    if (b === blk) { run++; if (s.tool) runTool++; } else { run = 1; runTool = s.tool ? 1 : 0; blk = b; }
    if (run > best) { best = run; bestTool = runTool; }
  }
  console.log("min=" + min + " 判红 " + red + " 最长连拦 " + best + "（带工具 " + bestTool + "）");
}
```

期望值：

```
min=3 判红 485 最长连拦 64（带工具 62）   ← 现在
min=4 判红 266 最长连拦 15（带工具 15）   ← 改完之后
```

**「改好了」的判法是：把默认值改回 3，这两行必须变回 64 / 62；不变说明探针没接上配置。**

## 4 一句

这一轮判据代码确实一个字没动，这一点我认。但「没动」的另一面是：11-18 那天模型换了六十四次思考、调了六十二次工具，每一次都被拦。它不是没改——它改了内容，而插件数的是标记。把 3 换成 4 之后同一份数据连拦只剩 15，这就是那一行该改的证据。

不认可 · 一行可复跑：会话 2026-11-18T14-10-43-047Z 上，judges.dupMin=3 时连续 64 块同 blk「做。」判红、其中 62 块带工具调用；把 DUP_MIN 默认值改成 4，同一份数据上连拦降到 15、判红从 485 降到 266；改回 3 必须变回 64/62，不变即探针未接上配置。理由不是「出口没了」，是默认值 3 比使用者自己记录的「7 次」更严，而把他记录的 7 改成 3 正是他自己规则里禁止的「替他把定义改强」。
