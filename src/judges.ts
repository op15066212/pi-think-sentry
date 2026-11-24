import { longestRun } from "./features/run.ts";
import { buildAC, excise } from "./algo/aho-corasick.ts";
import { shapeOf } from "./algo/shape.ts";
import { unifiedScore } from "./algo/unified.ts";
import { collapseStats } from "./features/collapse.ts";
import { SENT_RE, MARK_RE, sentencesOf } from "./sentences.ts";
// 对外仍从 judges 导出：调用方不必知道我把它挪去了哪个文件。
export { MARK_RE, sentencesOf };
const ratioOf = (v: any, dflt: number) => {
  if (v === undefined) return dflt;
  const n = Number(v);
  if (!(Number.isFinite(n) && n > 0 && n < 1)) throw new Error("ratio 必须在 (0,1) 之间，实际 " + String(v));
  return n;
};


export const INLINE_RATIO: number = DEFAULTS.inline.ratio;
export const COLLAPSE_RATIO = INLINE_RATIO;
export const COLLAPSE_MIN_LEN = 12;


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
export const INLINE_MIN: number = DEFAULTS.inline.min;

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
  inlineOn: boolean;
  runOn: boolean;
  /** 结构特征判据（六维投票）。键名沿用 prefix，因为它最初只管行首。 */
  prefixOn: boolean;
  prefixMin: number;
  /** 归一化整体判断：四个量几何平均成一个分，一个门槛。 */
  unifiedOn: boolean;
  unifiedMin: number;
  runMinLen: number;
  inlineMin: number;
  inlineRatio: number;
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
    inlineOn: patch.inlineOn !== false,
    runOn: patch.runOn === true,
    prefixOn: patch.prefixOn === true,
    prefixMin: typeof patch.prefixMin === "number" ? patch.prefixMin : 0.5,
    unifiedOn: patch.unifiedOn === true,
    unifiedMin: typeof patch.unifiedMin === "number" ? patch.unifiedMin : 0.6,
    runMinLen: typeof patch.runMinLen === "number" ? patch.runMinLen : 12,
    inlineMin: threshold(patch.inlineMin, INLINE_MIN, "judges.inlineMin"),
    inlineRatio: ratioOf(patch.inlineRatio, INLINE_RATIO),
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

/**
 * 按内容扣除注入文本（2026-11-24，整体化）。
 *
 * 旧的 dropInjectedTail 只剥**末尾那几行**，且要求逐字相同。模型把标记抄到中间、
 * 改一个标点、拆成两行，就全都失效——而它抄的仍然是同一次注入的内容。
 *
 * 这里把「我注入过的每一段」建成自动机，一次扫过全文，命中即按**字符区间**挖掉。
 * 与正则的分工：正则是「我生成的标记长什么样」（含具体数字，自动机存不下），
 * 自动机是「我注入过的那些字」（逐字，与格式无关）。两者都要，各管一件。
 */
// 测试入口：同一个函数，只是给外面一个名字。不复制实现——
// 两处各写一遍，测的就不是跑的那一个了。
export const exciseInjectedForTest = (t: string, skip: readonly string[] | undefined) => exciseInjected(t, skip);
/**
 * 历史处置痕迹（2026-11-24，回灌实测之后加）。
 *
 * 数据：外部附注·已删重复 1088 次、当前附注·第N行起重复 444 次，
 * 时间从 2026-11-18 传到 2026-11-21 —— 处置痕迹本身变成了新的重复源。
 *
 * 最直接的证据：一段被拦之后的思考写着「（不写重复行。）」，紧接着三行「做。」。
 *
 * 自动机只认字面，所以这些**形状固定**的旧痕迹要逐条列出来。
 * 带数字的（[第 35 行起重复 8 次]）认不住——那正是这次把新文案改成不带数字的原因。
 */
const LEGACY_TRACES = [
  "[外部附注：已删重复。]",
  "[外部附注：已删重复 4 处。]",
  "[已折叠：重复]",
  "[已改：语言]",
];

function exciseInjected(text: string, skip: readonly string[] | undefined): string {
  // skip 可能没给：judgeCfg() 一定有，但调用方直接传部分 cfg 时会是 undefined。
  // 崩在这儿比判错更糟——判据抛异常，上层只能记 judgeErrors，看不出是哪一条判据坏的。
  const pats = [...(Array.isArray(skip) ? skip : []), ...LEGACY_TRACES]
    .filter((x) => typeof x === "string" && x.length >= 4);
  if (!pats.length) return text;
  const ac = buildAC(pats);
  const hits = ac.scan(text);
  if (!hits.length) return text;
  return excise(text, hits);
}

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

// ── 判据二：尾部坍缩（2026-11-23 第二次重构）────────────────────────────────
//
// 这一条被改过两次，两次都是因为「判据被绕过」：
//
//   v1（dup）：按「整行」计数。模型把重复压进一行 → 漏。
//   v2（inline，连续相同句）：按句子找「连续相同」。模型改成交替（跑。ok。跑。ok。）
//      和「换词不换结构」（执行。ok。/ 跑。ok。/ 好。执行。ok。）→ 又漏。
//   v3（本条）：不再匹配形状，测**结构性质**——尾部窗口里有多少个不同的句子。
//
// 类型：
//   Γ ⊢ 段 : Seg = Sentence*              （按行切，行内再按 。！？!? 切）
//   W_k   = Seg 的后 k 句
//   uniq(W) = |{ s ∈ W }|                 （去重后的句数）
//   坍缩(W) ⟺ uniq(W) / |W| ≤ RATIO
//   最长坍缩后缀 L = 最大的 k，使 W_k 坍缩
//   判红 ⟺ L ≥ MIN_LEN
//
// 为什么它同时覆盖前两版（不是「再补一条 if」，是「前两版是它的特例」）：
//   连续相同 37 句          → uniq = 1，1/37 ≤ 1/4         ✓
//   交替 AB × 6             → uniq = 2，2/12 ≤ 1/4         ✓
//   换词不换结构（480 句）  → uniq ≈ 10，10/480 ≤ 1/4      ✓
//   正常列举 12 句各不同    → uniq = 12，12/12 = 1         ✗（不判，正确）
//
// 反例（必须不判）：正文里写「做完。跑。看。」这类三步式短句，只有 3 句，L < MIN_LEN。
// 门槛：RATIO=1/4、MIN_LEN=12。MIN_LEN 取 12 是因为：12 句里最多允许 3 种不同句，
// 正常写作几乎不可能；而退化段实测 200~480 句、uniq 个位数，远远超过门槛。

/** 最长坍缩区间：整段里任意连续区间，只要 uniq/len ≤ ratio 且 len ≥ minLen，取最长。
 *
 * 为什么不是「后缀」（第二次被绕过的地方）：
 * 实测有一段 192 句、125 个 ok，但**尾部恢复了正常**（结尾是「先看 pideck 技能文档」）。
 * 只扫尾部就判 none，而中段 60 句里只有 8 种。退化的位置不固定，判据就不能假定它在尾部。
 *
 * 复杂度 O(n²)：n 是句数，实测最大 539 句 → 14 万次 Set 操作，不到 5ms。
 * 有界（Ax4）：超过 MAX_SENT 句就只扫前 MAX_SENT 句并报「截断」。
 */
export const COLLAPSE_MAX_SENT = 2000;

export function collapseRange(text: any, ratio = COLLAPSE_RATIO, minLen = COLLAPSE_MIN_LEN, skip: string[] = []) {
  let sents = sentencesOf(text, skip);
  let truncated = false;
  if (sents.length > COLLAPSE_MAX_SENT) {
    sents = sents.slice(0, COLLAPSE_MAX_SENT);
    truncated = true;
  }
  const n = sents.length;
  if (n < minLen) return null;

  let best: { from: number; len: number; unique: number } | null = null;
  for (let i = 0; i < n; i++) {
    const seen = new Set<string>();
    // 剪枝：剩下的长度不可能超过当前最优
    if (best && n - i <= best.len) break;
    for (let j = i; j < n; j++) {
      seen.add(sents[j].t);
      const len = j - i + 1;
      if ((best === null || len > best.len) && len >= minLen && seen.size / len <= ratio) {
        best = { from: i, len, unique: seen.size };
      }
      // 剪枝：uniq 增长快于 ratio*len 时，继续延长只会更差
      if (seen.size / len > ratio && seen.size > ratio * (n - i) + 1) break;
    }
  }
  if (!best || best.len < minLen) return null;

  // 收缩两端（2026-11-23 第四次）：单纯「最长区间」会把紧挨着的正常句子吞进来——
  // 只要加进来之后 uniq/len 仍 ≤ ratio，它就继续扩。实测会把「开头第一行，正常。」也折掉。
  // 修法：区间首/尾若在区间内只出现一次（= 它不属于这套重复），就把它还给原文。
  const counts = new Map<string, number>();
  for (let i = best.from; i < best.from + best.len; i++) {
    counts.set(sents[i].t, (counts.get(sents[i].t) || 0) + 1);
  }
  while (best.len > minLen) {
    const head = sents[best.from].t;
    if ((counts.get(head) || 0) > 1) break;
    counts.set(head, (counts.get(head) || 0) - 1);
    best.from++;
    best.len--;
  }
  while (best.len > minLen) {
    const tail = sents[best.from + best.len - 1].t;
    if ((counts.get(tail) || 0) > 1) break;
    counts.set(tail, (counts.get(tail) || 0) - 1);
    best.len--;
  }
  best.unique = new Set(sents.slice(best.from, best.from + best.len).map((x) => x.t)).size;
  if (best.unique / best.len > ratio) return null;

  const first = sents[best.from];
  const last = sents[best.from + best.len - 1];
  return {
    from: best.from,
    len: best.len,
    unique: best.unique,
    ratio: best.unique / best.len,
    line: first.li + 1,
    lineTo: last.li + 1,     // 区间最后一句所在行（折叠按行做，需要两端）
    sample: first.t,
    truncated,
    sents,
  };
}

/**
 * 句级坍缩（2026-11-24 重写）。
 *
 * 旧实现用 collapseRange：O(n²) 找「最长的一段连续句子，其中不同句占比 <= ratio」。
 * 真实数据上它只覆盖 0.3%（50641 段里 129 段）；拿 dup 命中当金标准（3384 段），
 * 它漏掉 3143 段——因为真实重复是**散落**的，连续区间凑不够长度。
 *
 * 新实现走 features/collapse.ts 的 collapseStats：一次扫描算两个全局量，
 *   topShare     最高频那一句占全部句子的比例（金标准 p50 0.222 vs 未标记 0.079）
 *   repeatCover  出现 >= 2 次的句子覆盖的句子数 / 总句数
 * 判据：topShare >= 0.3 或 repeatCover >= 0.5。实测金标准命中 33.9%、未标记 7.0%。
 *
 * 复杂度从 O(n²) 降到 O(n)。ev 形状不变，所以 strip 的 foldInline 不用改。
 */
function collapseOn(text: any, cfg: JudgeCfg) {
  const minLen = Math.max(COLLAPSE_MIN_LEN, cfg.inlineMin);
  const c = collapseStats(text, cfg.skip || []);
  // 句数太少时两个比例都没有统计意义：4 句全同是 100%，但正常写作里那样并不构成退化。
  if (c.n < minLen) return none("inline", { blk: null, reps: 0, why: "句数 " + c.n + " 不足 " + minLen, dups: [], line: null });
  if (!c.collapsed) return none("inline", { blk: null, reps: 0, why: c.why, dups: [], line: null });

  const reps = c.n > 0 && c.uniq > 0 ? Math.round(c.n / c.uniq) : 0;
  return Verdict.parse({
    kind: "fold",
    rule: "inline",
    ev: {
      blk: c.topSentence,
      reps,
      why: c.why,
      // 与 dup 同形，供 strip 定位：这里是「最高频那一句 + 它的行号」
      dups: [[c.topSentence, reps, [c.topLine]] as [string, number, number[]]],
      line: c.topLine + 1,
      lineTo: c.topLine + 1,
      scope: "collapse" as const,
      from: 0,
      len: c.n,
      unique: c.uniq,
      ratio: c.topShare,
      truncated: false,
    },
  });
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


/**
 * 结构特征的多维投票（2026-11-24，用户说「前缀，后缀，上下左右都安排上，多算法模式」）。
 *
 * 前一版只看行首前缀。截图那段确实被抓到了，但退化不长一个样子：
 * 行尾固定、行长整齐、句首固定、套话霸占——单看一个维度换种退化就漏。
 *
 * 现在一次扫描算六个维度（algo/shape.ts），各维度独立投票，**两票以上才判红**。
 * 实测：截图段 2 票、行尾固定 3 票、行长整齐 4 票；两个正常样本都是 0 票。
 *
 * 缩进维度在「整段无缩进」时不算票——那是常态不是退化，不加这条两个正常样本各多一票。
 */
function shapeOn(text: string, cfg: JudgeCfg) {
  const sh = shapeOf(text, { headMin: cfg.prefixMin });
  if (sh.n < 4) return none("shape", { blk: null, reps: 0, why: "行数 " + sh.n + " 太少", dups: [], line: null });
  if (!sh.red) return none("shape", { blk: null, reps: 0, why: sh.why, dups: [], line: null });

  const topDim = sh.dims.filter((d) => d.over).sort((a, b) => b.share - a.share)[0];
  return Verdict.parse({
    kind: "fold",
    rule: "shape",
    ev: {
      blk: topDim ? topDim.top : "",
      reps: sh.votes,
      why: sh.why,
      dups: [[topDim ? topDim.top : "", sh.votes, [0]] as [string, number, number[]]],
      line: 1,
      lineTo: 1,
      scope: "collapse" as const,
      from: 0,
      len: sh.n,
      unique: sh.n,
      ratio: topDim ? topDim.share : 0,
      truncated: false,
    },
  });
}

/**
 * 归一化整体判断。四个量各自在 [0,1]，几何平均成一个分，一个门槛。
 *
 * 为什么它和 shape 并存而不是取代：shape 的六维是**各自定门槛再投票**，
 * unified 是**先归一化再合成**。同一段文本两者可能给出不同判决——
 * 那正是要观察的区别，所以它们各有一条规则、各有开关，而不是合并。
 *
 * 证据形状复用 fold（按句计重复单元）：形状与 inline 相同，处置也相同。
 */
function unifiedOn(text: string, cfg: JudgeCfg) {
  const u = unifiedScore(text, cfg.unifiedMin);
  if (u.sentences < 4) {
    return none("unified", { blk: null, reps: 0, why: u.why, dups: [], line: null });
  }
  if (!u.red) {
    return none("unified", { blk: null, reps: 0, why: u.why, dups: [], line: null });
  }
  // 报出拉低总分最多的那一维，让人知道是哪一类重复。
  const dims: Array<[string, number]> = [
    ["群论周期", 1 - u.symmetry],
    ["转移熵", u.entropy],
    ["最高频句", 1 - u.maxShare],
    ["ngram 重复", 1 - u.ngramRep],
  ];
  dims.sort((a, b) => a[1] - b[1]);
  const worst = dims[0];
  return Verdict.parse({
    kind: "fold",
    rule: "unified",
    ev: {
      blk: worst[0],
      reps: u.sentences,
      why: u.why,
      dups: [[worst[0], u.sentences, [0]] as [string, number, number[]]],
      line: 1,
      lineTo: 1,
      scope: "collapse" as const,
      from: 0,
      len: u.sentences,
      unique: u.nodes,
      ratio: 1 - u.score,
      truncated: false,
    },
  });
}

export function judgeThinking(text: any, patch: Partial<JudgeCfg> = {}) {
  // 入口补全，不是只在没传时用默认值。
  // 之前签名是 cfg: JudgeCfg = judgeCfg()：传了部分配置就用部分的，
  // langDir 这类必填字段是 undefined，Verdict.parse 当场抛
  // （verdict: ev.dir 只能是 zh 或 en）。判据抛异常比判错更难查——
  // 上层只记 judgeErrors，看不出是哪一条坏的。
  const cfg: JudgeCfg = judgeCfg(patch as any);
  const raw = String(text || "");
  // cfg 可能是部分配置（测试常用）：skip 没给时按空数组算。
  // 入口规范化一次，下游的 exciseInjected 与 dropInjectedTail 就不必各自防一遍。
  const skip: string[] = Array.isArray((cfg as any).skip) ? (cfg as any).skip : [];
  // 仅测试用：强制开关，让 RPC 测试能确定地验证两条链路。
  if (process.env.CURB_FORCE_STRIP && (raw.trim().length > 0 || process.env.CURB_FORCE_EMPTY)) {
    return Verdict.parse({ kind: "strip", rule: "dup", forced: true, ev: { blk: "x", reps: 99, why: "forced", dups: [["x", 99, [0]]] } });
  }
  if (process.env.CURB_FORCE_RETRACT) {
    return Verdict.parse({ kind: "retract", rule: "lang", forced: true, ev: { cjk: 0, lat: 99, lines: 99, dir: cfg.langDir, sample: null } });
  }
  // 处置标记在任何判据里都不算内容：dup 按整行计数，6 行相同的折叠标记会被判成「复诵 6 次」——
  // 那等于「处置自己制造了下一次判红」，是最典型的回灌。
  // 按行剥末尾（保底）与滤标记行：body 已经在上面扣过一次内容了。
  // 三层分工固定：内容扣得最干净（任意位置），末尾剥是历史行为兜底，标记行过滤最便宜。
  // 先扣掉注入文本，再判（2026-11-24 修）：run 一开始用的是 raw，
  // 于是我们自己注入的文案被当成退化——防回灌被整体判据绕过去了，直接自锁。
  // 顺序必须是「先扣后判」，不是「先判后扣」。
  const body = exciseInjected(raw, skip);

  const all = dropInjectedTail(partitionLines(body), skip).filter((l) => !MARK_RE.test(l.t));
  const lines = voteOf(all);
  // 整体判据先跑（2026-11-24 修）：它比 dup/inline 更准——不切分，一次扫描取最长匹配。
  // 原来放在它们之后，于是 31 行「做。」先被 dup 判红，run 永远轮不到。
  // 「更准的先判」不是效率问题：先判的那条决定了 ev 的形状，也就决定了处置怎么走。
  // 结构特征放在 dup 之前：它看的是形状（行首/行尾/行长/缩进/句首/套话），比「整行」更早成立。
  if (cfg.prefixOn) {
    const sh = shapeOn(body, cfg);
    if (sh.kind !== "none") return sh;
  }
  if (cfg.unifiedOn) {
    const u = unifiedOn(body, cfg);
    if (u.kind !== "none") return u;
  }
  if (cfg.runOn) {
    const r = longestRun(body, cfg.runMinLen);
    if (r.over) {
      return Verdict.parse({
        kind: "fold",
        rule: "run",
        ev: { blk: "最长重复 " + r.len + " 字", reps: r.matches.length, why: "len=" + r.len, dups: [], line: 1 },
      });
    }
  }
  if (cfg.dupOn) {
    const d = dupOn(voteOf(all), cfg);
    if (d.kind !== "none") return d;
  }
  if (cfg.inlineOn) {
    const q = collapseOn(raw, cfg);
    if (q.kind !== "none") return q;
  }
  if (!cfg.langOn) return none("lang", { cjk: 0, lat: 0, lines: 0, dir: cfg.langDir, sample: null });
  return langOn(lines, cfg);
}
