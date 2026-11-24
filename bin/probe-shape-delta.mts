#!/usr/bin/env node
// probe-shape-delta.mts —— 量化 shape 判据的独有贡献，并且先自证脚本没坏。
//
// 为什么需要 --selftest（2026-11-24，pi 插件2 在对策里给的，我照做）：
//   这一轮我三次「结论先于数」：
//    R2  先在回执里给方案，再去量，量反了
//    R3  统计脚本里 nobody 恒为 0（我判 rule === "none"，但 none 判决的 rule 是 "lang"），
//        据此差点宣布「shape 一条独有都没有」
//    R3  我说「314 段全是关键：」，对方在新样本上抽出 12 条全是务实：
//   三次都不是能力问题，是顺序问题。一个便宜的对策：
//   **每个统计脚本先喂一个你已经知道答案的输入，它对不上就说明脚本错了。**
//
// 所以这个文件先跑 --selftest，三段样本的答案是我手工数过的：
//   A 整行重复（60 行全是「执行。」）        shape 判红，dup 也判红
//   B 写作习惯（10 行「关键：」+ 各不同内容） shape 判红，dup 不判   <- 这就是它的缺陷
//   C 正常技术说明（10 行各不同）             shape 不判
//
// B 那条断言期望 shape **判红**。这不是「期望它绿」——它记录的是缺陷：
// shape 会把写作习惯叫做退化。哪天有人修好了 B，这条断言会红，提醒改文档。
//
// 用法：
//   node --experimental-strip-types bin/probe-shape-delta.mts --selftest
//   node --experimental-strip-types bin/probe-shape-delta.mts <file.jsonl>...
//
// 退出码：0 自检全过 / 统计跑完｜1 自检失败｜2 用法错

import fs from "node:fs";
import readline from "node:readline";
import { judgeThinking, judgeCfg } from "../src/judges.ts";
import { readConfig } from "../src/config.ts";

const base = process.argv[2] === "--selftest" ? [] : process.argv.slice(2);
const isSelf = process.argv[2] === "--selftest";

// 出厂配置 + 显式开关。判据是「开 shape 与关 shape 的差」，
// 所以两套配置只差 prefixOn 一个字段，别的一模一样。
const c = readConfig();
const mk = (prefixOn: boolean) =>
  judgeCfg({
    dupOn: c.dup.on, dupMin: c.dup.min,
    inlineOn: c.inline.on, inlineMin: c.inline.min, inlineRatio: c.inline.ratio,
    runOn: c.run.on, runMinLen: c.run.minLen,
    prefixOn, prefixMin: c.prefix.min,
    unifiedOn: c.unified.on, unifiedMin: c.unified.min,
    langOn: c.lang.on, langDir: c.lang.dir,
  } as any);
const ON = mk(true);
const OFF = mk(false);

const SAMPLES: Record<string, string> = {
  // A 整行重复：60 行完全相同
  A: Array(60).fill("执行。").join("\n"),
  // B 写作习惯：10 行都以「关键：」开头，内容各不相同
  B: [
    "关键：frac 的振荡看起来像伪随机，而最小 frac 随 t 增长得很慢。",
    "关键：我这边也能跑，20000 只用 0.3 秒，10^6 需要多少。",
    "关键：现在该自己查这个是否已有人做过，而不是等别人。",
    "关键：矛盾出在 v2(9)=0，K=1，K>=L 不成立。",
    "关键：整族共享同一条轨道，因为都走到 1/2。",
    "关键：math3 认了两个错，并且指出了一个新东西。",
    "关键：两条轨道的 lo 和 hi 几乎是同一个序列，错位一步。",
    "关键：窗口太大会超时，所以先切小再放大。",
    "关键：这里要用 cycle_equation_int，它已经可见了。",
    "关键：先把子目录查一遍再下结论，上一轮就漏了这个。",
  ].join("\n"),
  // C 正常技术说明：10 行各不同，没有任何固定前缀
  C: [
    "问题在 findReaders 的递归没有上限，目录一深就会挂住。",
    "挂住的判据比红的判据更难发现，所以先加上限。",
    "超限时打印遍历被上限截断，让人知道结果不完整。",
    "这条判据的坏样本是把上限删掉，然后造一个十层深的目录。",
    "命令必须挂住才算红，跑得出 rc 才算数。",
    "回放用的是真实会话记录，造样本会带上写判据的人的偏见。",
    "指纹要连采样时刻一起引，否则那组数不可引用。",
    "同一件事两个像时，一边新增另一边不知道，判据就会给出两个答案。",
    "改完先看 git status，有别人的脏文件就先停手。",
    "提交信息写为什么，不写 update 或 fix。",
  ].join("\n"),
};

if (isSelf) {
  let bad = 0;
  const chk = (label: string, cond: boolean, detail: string) => {
    if (!cond) bad++;
    console.log((cond ? "ok   " : "FAIL ") + label + "   " + detail);
  };

  const a1 = judgeThinking(SAMPLES.A, ON);
  const a2 = judgeThinking(SAMPLES.A, OFF);
  chk("A 整行重复：shape 开时判红", a1.kind !== "none", "kind=" + a1.kind + " rule=" + a1.rule);
  chk("A 整行重复：shape 关时仍判红（dup 兜住）", a2.kind !== "none", "kind=" + a2.kind + " rule=" + a2.rule);

  const b1 = judgeThinking(SAMPLES.B, ON);
  const b2 = judgeThinking(SAMPLES.B, OFF);
  // 这条期望它判红——记录的是缺陷，不是成绩。
  chk("B 写作习惯：shape 会误判成退化（缺陷）", b1.rule === "shape", "kind=" + b1.kind + " rule=" + b1.rule);
  chk("B 写作习惯：关掉 shape 后没人判（说明是 shape 独有的误报）", b2.kind === "none", "kind=" + b2.kind + " rule=" + b2.rule);

  const c1 = judgeThinking(SAMPLES.C, ON);
  chk("C 正常说明：shape 不判", c1.kind === "none", "kind=" + c1.kind + " rule=" + c1.rule);

  console.log("");
  console.log((bad === 0 ? "PASS" : "FAIL") + " 自检 " + (bad === 0 ? "全过" : "失败 " + bad + " 条") + "（答案手工数过）");
  process.exit(bad === 0 ? 0 : 1);
}

if (!base.length) {
  console.error("用法：node --experimental-strip-types bin/probe-shape-delta.mts --selftest | <file.jsonl>...");
  process.exit(2);
}

let n = 0;
let on = 0;
let off = 0;
let onOnly = 0;
let offOnly = 0;
const samples: string[][] = [];

for (const f of base) {
  const rl = readline.createInterface({ input: fs.createReadStream(f, "utf8"), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let o: any;
    try { o = JSON.parse(line); } catch { continue; }
    const msg = o.message || o;
    if (!msg || msg.role !== "assistant") continue;
    const parts = msg.content || msg.parts || [];
    if (!Array.isArray(parts)) continue;
    for (const p of parts) {
      const t = p && p.type === "thinking" ? p.thinking : null;
      if (typeof t !== "string" || t.trim().length < 40 || t.length > 20000) continue;
      n++;
      const a = judgeThinking(t, ON);
      const b = judgeThinking(t, OFF);
      if (a.kind !== "none") on++;
      if (b.kind !== "none") off++;
      // 注意：判 kind 不判 rule。none 判决的 rule 是 "lang"，
      // 拿 rule === "none" 去判会让这一支永远不命中（上一版就错在这里）。
      if (a.kind !== "none" && b.kind === "none") {
        onOnly++;
        if (samples.length < 4) {
          samples.push(t.split("\n").filter((x: string) => x.trim()).slice(0, 2).map((x: string) => x.trim().slice(0, 60)));
        }
      }
      if (a.kind === "none" && b.kind !== "none") offOnly++;
    }
  }
}

console.log("总段 " + n + "（未截断，全量）");
console.log("  shape 开：判红 " + on + " (" + ((100 * on) / n).toFixed(2) + "%)");
console.log("  shape 关：判红 " + off + " (" + ((100 * off) / n).toFixed(2) + "%)");
console.log("  只有开时判：" + onOnly + " 段  <- shape 的独有贡献");
console.log("  只有关时判：" + offOnly + " 段  <- 必须为 0，否则两套配置不止差一个字段");
console.log("");
for (const s of samples) {
  console.log("  独有样本 " + s.join(" / "));
}
