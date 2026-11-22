import { Verdict } from "./verdict.ts";
import { threshold } from "./threshold.ts";
import { DEFAULTS } from "./defaults.ts";

// ===== 两条判据，就是使用者给的定义，没有别的 =====
//
//   dup   同一行出现几次 >= dupMin 就判        （使用者 2026-11-17）
//   lang  非目标语言的行数 > 目标语言的行数 就判 （使用者 2026-11-19）
//
// R12：这个文件此前堆了七层防御——块级字符比、行内比例门槛、5 个汉字的绝对下界、
// ref 类（纯引用行不计票）、剥行内反引号、剥路径、边界判据（整段看不见时不更新判决）。
// 每一层都是为了挡「复核方构造的某个绕过样本」而加的，没有一层是使用者要的。
// 它们合起来的效果：判红比使用者的定义多 51%，且模型改好之后解除不了（台账 2678 次）。
// 按 lean-kernel 第三条——「要新增一条，先说它挡的是哪次已经发生的事故；说不出就删」——
// 全部删掉。剩下的就是下面这些。

export const DUP_MIN: number = DEFAULTS.dup.min;

// ===== 位置：把文本切成行，每行一个标签 =====
//
// 四类，四类相加等于总行数。
//   vote   参与判据的行
//   fence  围栏内（含围栏分隔行与围栏内空行）
//   indent 缩进行
//   blank  空行
//
// 为什么要分区：围栏与缩进里是代码，判「语言」时不该数进去——这是判据本身的要求，
// 不是防御（贴一段代码不该被判成「用英文思考」）。
export type LineKind = "vote" | "fence" | "indent" | "blank";
export type Line = { i: number; t: string; kind: LineKind };

export const FENCE_RE = /^(`{3,}|~{3,})/;
export const INDENT_RE = /^(?: {4}|\t)/;

export function partitionLines(text: any): Line[] {
  const src = String(text || "").split("\n");
  const out: Line[] = [];
  // 开围栏记字符与长度，闭合要求同字符且长度不小于开围栏——嵌套围栏是 markdown 的合法构造。
  let fence: { ch: string; len: number } | null = null;
  for (let i = 0; i < src.length; i++) {
    const t = src[i].trim();
    const m = FENCE_RE.exec(t);
    if (m) {
      const ch = m[1][0], len = m[1].length;
      if (!fence) fence = { ch, len };
      else if (ch === fence.ch && len >= fence.len) fence = null;
      out.push({ i, t, kind: "fence" });
      continue;
    }
    if (fence) { out.push({ i, t, kind: "fence" }); continue; }
    if (!t) { out.push({ i, t, kind: "blank" }); continue; }
    if (INDENT_RE.test(src[i])) { out.push({ i, t, kind: "indent" }); continue; }
    out.push({ i, t, kind: "vote" });
  }
  return out;
}

export const voteOf = (ls: Line[]) => ls.filter((l) => l.kind === "vote");

/** 纯引用行按使用者的定义算「非中文行」：一行没有汉字就是没有汉字。 */
export type JudgeCfg = {
  dupOn: boolean;
  dupMin: number;
  langOn: boolean;
  langDir: "zh" | "en";
  /** 注入文案的行序列（trim 后、去空行）。顺序有意义：只剥末尾那一段。 */
  skip: string[];
};

export const judgeCfg = (patch: any = {}): JudgeCfg => {
  const src = patch.skip;
  const skip = src instanceof Set
    ? [...(src as Set<string>)]
    : String(src || "").split("\n").map((l: string) => l.trim()).filter(Boolean);
  return {
    dupOn: patch.dupOn !== false,
    dupMin: threshold(patch.dupMin, DUP_MIN, "judges.dupMin"),
    langOn: patch.langOn !== false,
    langDir: patch.langDir === "en" ? "en" : "zh",
    skip,
  };
};

// 只剥末尾那一段注入文案。不剥的话，注入的文案被模型抄一遍就是「同一行 dupMin 次」，
// 判据会拦我们自己发的文案（2026-11-18 实测的自锁）。
// 这只防**自己**，不防模型：剥的是我们写进去的那几行，且只剥末尾。
const dropInjectedTail = (ls: Line[], skip: string[]): Line[] => {
  const n = skip.length;
  if (!n || ls.length < n) return ls;
  const tail = ls.slice(ls.length - n);
  for (let i = 0; i < n; i++) if (tail[i].t !== skip[i]) return ls;
  return ls.slice(0, ls.length - n);
};

const none = (rule: any, ev: any) => Verdict.parse({ kind: "none", rule, ev });

// 判据一：同一行复诵。数一遍谁出现够 dupMin 次就判。就是 map 计数。
export function dupIn(lines: Line[], min = DUP_MIN) {
  const counts = new Map<string, number[]>();
  for (const s of lines) {
    const at = counts.get(s.t);
    if (at) at.push(s.i); else counts.set(s.t, [s.i]);
  }
  return [...counts]
    .filter(([, idxs]) => idxs.length >= min)
    .map(([t, idxs]) => [t, idxs.length, idxs] as [string, number, number[]])
    .sort((a, b) => b[1] - a[1]);
}

export const dupJudge = (text: any, cfg: JudgeCfg = judgeCfg()) => dupOn(voteOf(partitionLines(text)), cfg);
function dupOn(lines: Line[], cfg: JudgeCfg) {
  const hits = dupIn(lines, cfg.dupMin);
  const top = hits.length ? hits[0][0] : null;
  const topN = hits.length ? hits[0][1] : 0;
  const ev = {
    blk: top,
    reps: topN,
    why: topN + "次",
    dups: hits.map(([t, n, idxs]) => [t, n, idxs]),
    line: hits.length && Array.isArray(hits[0][2]) && hits[0][2].length ? Number(hits[0][2][0]) + 1 : null,
  };
  if (!hits.length) return none("dup", ev);
  return Verdict.parse({ kind: "strip", rule: "dup", ev });
}

const countCjk = (s: any) => (s.match(/[\u3400-\u4dbf\u4e00-\u9fff]/g) || []).length;
const countLat = (s: any) => (s.match(/[A-Za-z]/g) || []).length;
const countTarget = (s: string, dir: "zh" | "en") => (dir === "en" ? countLat(s) : countCjk(s));

export const langJudge = (text: any, cfg: JudgeCfg = judgeCfg()) => langOn(voteOf(partitionLines(text)), cfg);

// 判据二：一行一行数起来比。**非目标语言的行数 > 目标语言的行数就判。**
//
// 这是使用者的定义（2026-11-19），也是这里唯一跑的东西。
//
// R12：此前跑的不是它。R5（复核 b711ced1 的 discuss-r5-b711ced1.md:139）把
// 「有汉字就算中文行」改成「行内汉字占比 >= 0.3」，又加了「本块字符比 < 0.3 判红」，
// 我采纳了，于是判据从**行数**变成了**字符比**。实测同一批 4855 个思考块：
//   使用者定义判红 488 块 / 字符比判红 735 块 / 只有字符比红 247 块 / 只有行数红 0 块。
// 多出来的 247 块全部是「中文行数够多，但引用代码把字符比拉低」。
// 我为它加过 ref 类、剥反引号、剥路径三层补丁，全是在给这 247 块擦地。已删。
//
// 代价写清：模型若每行塞一两个汉字，行数投票就过。这是**定义本身的边界**，
// 不是实现缺陷；要收它得先改定义。
function langOn(lines: Line[], cfg: JudgeCfg) {
  const dir = cfg.langDir;
  let keep = 0, off = 0;
  let sample: string | null = null;
  let badLine: number | null = null;
  for (const line of lines) {
    if (countTarget(line.t, dir) > 0) keep++;
    else { off++; if (sample === null) sample = line.t; if (badLine === null) badLine = line.i + 1; }
  }
  const joined = lines.map((x) => x.t).join(String.fromCharCode(10));
  const ev = { cjk: countCjk(joined), lat: countLat(joined), lines: off, dir, sample, line: badLine };
  if (off > keep) return Verdict.parse({ kind: "retract", rule: "lang", ev });
  return none("lang", ev);
}

export function judgeThinking(text: any, cfg: JudgeCfg = judgeCfg()) {
  const raw = String(text || "");
  // 仅测试用：强制开关，让 RPC 测试能确定地验证两条链路。
  if (process.env.CURB_FORCE_STRIP && (raw.trim().length > 0 || process.env.CURB_FORCE_EMPTY)) {
    return Verdict.parse({ kind: "strip", rule: "dup", forced: true, ev: { blk: "x", reps: 99, why: "forced", dups: [["x", 99, [0]]] } });
  }
  if (process.env.CURB_FORCE_RETRACT) {
    return Verdict.parse({ kind: "retract", rule: "lang", forced: true, ev: { cjk: 0, lat: 99, lines: 99, dir: cfg.langDir, sample: null } });
  }
  const all = dropInjectedTail(partitionLines(raw), cfg.skip);
  const lines = voteOf(all);
  if (cfg.dupOn) {
    const d = dupOn(voteOf(all), cfg);
    if (d.kind !== "none") return d;
  }
  if (!cfg.langOn) return none("lang", { cjk: 0, lat: 0, lines: 0, dir: cfg.langDir, sample: null });
  return langOn(lines, cfg);
}
