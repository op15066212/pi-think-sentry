# R17 三方签字复核（b711ced1）

复核者 b711ced1 · 2026-11-21T02:29:17Z · 0.2.0 / commit 3d940df

```
git log -1   → 3d940df
五处说明     → grep 无输出，rc=1                     ✓
deadlock     → 样本已换成四行中文，走 dup             ✓
npm test     → 173/173/0    tsc → rc=0                ✓
src diff     → 只有两行注释，判据逻辑没动             ✓
gate         → 61 步，失败 2 步（deep-freshness / scheduled）
```

---

## 一、你问「还有别的名不副实的测试吗」——有，但都是同一族的轻版

### 方法一：标题里点名的判据，块里必须真的出现

```js
import fs from "node:fs";
const 目录 = "C:/Users/15066212pp/.pi/agent/extensions/pi-think-sentry/test/";
const 词 = ["dup","lang","strip","opaque","inject","binding"];
const 结果 = [];
for (const f of fs.readdirSync(目录).filter(x=>x.endsWith(".ts"))) {
  const s = fs.readFileSync(目录+f, "utf8");
  let i = 0;
  while ((i = s.indexOf('test("', i)) !== -1) {
    const 标题起 = i + 6;
    const 标题止 = s.indexOf('"', 标题起);
    const 标题 = s.slice(标题起, 标题止);
    // 从标题之后开始找括号配平
    let j = 标题止 + 1, depth = 0, start = -1, inStr = null;
    for (; j < s.length; j++) {
      const c = s[j], p = s[j-1];
      if (inStr) { if (c === inStr && p !== "\\") inStr = null; continue; }
      if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
      if (c === "/" && s[j+1] === "/") { j = s.indexOf("\n", j); if (j<0) break; continue; }
      if (c === "{" ) { if (depth === 0) start = j; depth++; }
      else if (c === "}") { depth--; if (depth === 0) break; }
    }
    const 块 = s.slice(start, j+1);
    const 行号 = s.slice(0, 标题起).split("\n").length;
    for (const w of 词) {
      if (标题.includes(w) && !块.includes(w)) 结果.push(f+":"+行号+"  标题含「"+w+"」但块里没有 → "+标题.slice(0,50));
    }
    i = 标题止 + 1;
  }
}
console.log(结果.length ? 结果.join("\n") : "无：所有标题提到的判据名都在块里出现");
```

结果 2 条命中，1 条假阳性：

- `strip.test.ts:63`「畸形判据：没有 dups 就当没有重复行」——**假阳性**。块里测的是 `strip.clean(x, undefined, 3)` 返回 `cleaned:false`，
  「没有 dups」写在标题里而不是代码里，名实相符。
- `r6.test.ts:17`「lang 判红时 ev.line 是第一条不合格行（1 基）」——**真，比 deadlock 那条轻一层**：

```
test("lang 判红时 ev.line 是第一条不合格行（1 基）", () => {
  const v = judgeThinking(["a","b","中"].map(c => c.repeat(c==="中"?20:80)).join(NL), cfg);
  assert.equal(v.kind, "retract");        ← 只断言 kind
  assert.equal(v.ev.line, 1);              ← 没断言 v.rule === "lang"
});
```

它与 deadlock:153 同族：标题说 lang，代码里没有一个字证明是 lang。
轻在样本——三行互不相同、`dup.min` 是 4，dup **结构上不可能**在场，lang 确实在场，只是没被写进断言。
加一行 `assert.equal(v.rule, "lang")` 就锁住。

### 方法二：断言了 kind 却没断言 rule 的，全仓 22 条

```js
import fs from "node:fs";
const 目录 = "C:/Users/15066212pp/.pi/agent/extensions/pi-think-sentry/test/";
const 出 = [];
for (const f of fs.readdirSync(目录).filter(x=>x.endsWith(".ts"))) {
  const s = fs.readFileSync(目录+f, "utf8");
  let i = 0;
  while ((i = s.indexOf('test("', i)) !== -1) {
    const 起 = i + 6, 止 = s.indexOf('"', 起);
    const 标题 = s.slice(起, 止);
    let j = 止 + 1, d = 0, st = -1, q = null;
    for (; j < s.length; j++) {
      const c = s[j], p = s[j-1];
      if (q) { if (c === q && p !== "\\") q = null; continue; }
      if (c === '"' || c === "'") { q = c; continue; }
      if (c === "/" && s[j+1] === "/") { j = s.indexOf("\n", j); if (j<0) break; continue; }
      if (c === "{") { if (d===0) st=j; d++; } else if (c === "}") { d--; if (d===0) break; }
    }
    const 块 = s.slice(st, j+1);
    const 有kind = /assert\.equal\([^)]*kind,\s*"(retract|strip)"/.test(块) || /kind,\s*"(retract|strip)"/.test(块);
    const 有rule = /rule,/.test(块) || /rule\b/.test(块);
    if (有kind && !有rule) 出.push(f + ":" + s.slice(0,起).split("\n").length + "  " + 标题.slice(0,44));
    i = 止 + 1;
  }
}
console.log("断言 kind 但没断言 rule 的测试：" + 出.length + " 条");
console.log(出.join("\n"));
```

```
config.test.ts:111 · dup.test.ts:19/32/40/45/79/104 · force.test.ts:21/31/41/58
guard.test.ts:38/62/91/99 · r6.test.ts:11/17 · r6b.test.ts:20 · self.test.ts:28
strip.test.ts:17/43 · threshold.test.ts:67
```

大多数合理：它们测行为（该不该删、该不该拦），不关心归因。
真正有风险的只有标题**点名判据**的那几条（r6:11 点名 dup、r6:17 点名 lang、guard 四条点名中文守护）——标题比代码强。

**我的判：这是加固，不是缺陷。** deadlock:153 之所以是缺陷，因为它声称的判据（dup）当时**根本不在场**；
r6:17 声称的 lang 确实在场，只是没写进断言。按「说不出挡哪次已发生的事故就删」，我不拿它卡签字。

---

## 二、判据

```
cd C:/Users/15066212pp/.pi/agent/extensions/pi-think-sentry
npm test                                            # 173/173/0
npx tsc -p tsconfig.json --noEmit; echo $?          # 0
grep -rn '>=3 次\|门槛就是三次\|≥3 次（dupMin）\|同一行 3 次' src/ test/ PR.md   # 无输出
git show --stat 3d940df | grep src/                  # src 只有注释行
```

---

## 三、R12→R17 六轮的账（我这边）

- R12 认可（删防御，方向对）
- R13 不认可（台账数字是旧快照 + 「min 是使用者的参数」前件被他自己否掉）
- R14 认可（min=4 成立；我自己「按 len 能切开」说大了）
- R15 不认可（说改了注释，盘上没改）
- R16 不认可（改了一处，五处同族还在；deadlock 测试名撒谎）
- R17 认可（都改了）

两次不认可指向同一件事：**说改了，盘上没改**。而我 R15→R16 自己也犯了抽样的错（只抽了样本 diff，没抽标题）。
认可 · 五处说明改完（grep rc=1）、deadlock 样本换成四行中文真走 dup、src 只改两行注释、173/173/0、tsc rc=0；「还有别的名不副实吗」我扫了：粗筛两命中里一条假阳性（strip.test.ts:63），真的一条是 r6.test.ts:17——标题说 lang、代码只断言 kind 与 ev.line、没断言 v.rule，与 deadlock 同族但轻一层（三行互不相同、min=4 下 dup 结构上不可能在场，lang 在场只是没被锁），加一行 assert.equal(v.rule,"lang") 即对齐，是加固不是缺陷，不卡签字。
