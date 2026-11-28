import { MARK_RE, sentencesOf } from "./sentences.ts";
// 对外仍从 judges 导出：调用方不必知道我把它挪去了哪个文件。
export { MARK_RE, sentencesOf };
const ratioOf = (v: any, dflt: number) => {
  if (v === undefined) return dflt;
  const n = Number(v);
  if (!(Number.isFinite(n) && n > 0 && n < 1)) throw new Error("ratio 必须在 (0,1) 之间，实际 " + String(v));
  return n;
};




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
  inlineOn: boolean;
  runOn: boolean;
  /** 结构特征判据（六维投票）。键名沿用 prefix，因为它最初只管行首。 */
  prefixOn: boolean;
  /** 归一化整体判断：四个量几何平均成一个分，一个门槛。 */
  langOn: boolean;
  langDir: "zh" | "en";
};

export const judgeCfg = (patch: any = {}): JudgeCfg => {
  return {
    dupOn: patch.dupOn !== false,
    dupMin: threshold(patch.dupMin, DUP_MIN, "judges.dupMin"),
    inlineOn: patch.inlineOn !== false,
    runOn: patch.runOn === true,
    prefixOn: patch.prefixOn === true,
    langOn: patch.langOn !== false,
    langDir: patch.langDir === "en" ? "en" : "zh",
  };
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



// 一次扫描同时完成行投票与字符统计；避免先逐行扫描、再 join 后第二次扫描。
const countBoth = (s: string) => {
  let cjk = 0, lat = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    if (ch < 0x80) {
      if ((ch >= 65 && ch <= 90) || (ch >= 97 && ch <= 122)) lat++;
    } else if ((ch >= 0x3400 && ch <= 0x4dbf) || (ch >= 0x4e00 && ch <= 0x9fff)) {
      cjk++;
    }
  }
  return { cjk, lat };
};
function langOn(lines: Line[], cfg: JudgeCfg) {
  const dir = cfg.langDir;
  let keep = 0, off = 0;
  let sample: string | null = null;
  let badLine: number | null = null;
  let cjk = 0, lat = 0;
  for (const line of lines) {
    const counts = countBoth(line.t);
    cjk += counts.cjk;
    lat += counts.lat;
    const target = dir === "en" ? counts.lat : counts.cjk;
    if (target > 0) keep++;
    else { off++; if (sample === null) sample = line.t; if (badLine === null) badLine = line.i + 1; }
  }
  const ev = { cjk, lat, lines: off, dir, sample, line: badLine };
  if (off > keep) return Verdict.parse({ kind: "retract", rule: "lang", ev });
  return none("lang", ev);
}

export const langJudge = (text: any, cfg: JudgeCfg = judgeCfg()) => langOn(voteOf(partitionLines(text)), cfg);




export function judgeThinking(text: any, patch: Partial<JudgeCfg> = {}) {
  // 入口补全，不是只在没传时用默认值。
  // 之前签名是 cfg: JudgeCfg = judgeCfg()：传了部分配置就用部分的，
  // langDir 这类必填字段是 undefined，Verdict.parse 当场抛
  // （verdict: ev.dir 只能是 zh 或 en）。判据抛异常比判错更难查——
  // 上层只记 judgeErrors，看不出是哪一条坏的。
  const cfg: JudgeCfg = judgeCfg(patch as any);
  const raw = String(text || "");
  // 仅测试用：强制开关，让 RPC 测试能确定地验证两条链路。
  if (process.env.CURB_FORCE_STRIP && (raw.trim().length > 0 || process.env.CURB_FORCE_EMPTY)) {
    return Verdict.parse({ kind: "strip", rule: "dup", forced: true, ev: { blk: "x", reps: 99, why: "forced", dups: [["x", 99, [0]]] } });
  }
  if (process.env.CURB_FORCE_RETRACT) {
    return Verdict.parse({ kind: "retract", rule: "lang", forced: true, ev: { cjk: 0, lat: 99, lines: 99, dir: cfg.langDir, sample: null } });
  }
  // 处置标记在任何判据里都不算内容：dup 按整行计数，6 行相同的标记会被判成「复诵 6 次」，
  // 那等于「处置自己制造了下一次判红」。
  // 2026-11-25 删掉思维链注入之后，新标记不再产生；这里留着是按行滤掉历史会话里的旧标记——
  // 旧数据不该让新判据判红，而滤一行的成本可以忽略。
  const lines = partitionLines(raw).filter((l) => l.kind === "vote" && !MARK_RE.test(l.t));
  // 整体判据先跑（2026-11-24 修）：它比 dup/inline 更准——不切分，一次扫描取最长匹配。
  // 原来放在它们之后，于是 31 行「做。」先被 dup 判红，run 永远轮不到。
  // 「更准的先判」不是效率问题：先判的那条决定了 ev 的形状，也就决定了处置怎么走。
  // 顺序按「处置强度」，不按「准确度」：retract（这一轮不采用）比 strip（删几行）更强，
  // 所以 lang 先判。2026-11-27 实测到的缺陷：原来 dup 先判并 return，于是
  // 「英文复诵 4 行」这种同时命中两条的输入只报 dup/strip —— 整块英文思考被删掉重复行后
  // 仍然被采用，lang 那条保护等于不存在。
  // 判据：node --experimental-strip-types scripts/check-judge-order.mjs
  //   英文复诵 → kind=retract rule=lang（改前是 strip/dup）
  //   中文复诵 → 仍是 strip/dup（lang 不成立，不该被吃掉）
  if (cfg.langOn) {
    const l = langOn(lines, cfg);
    if (l.kind !== "none") return l;
  }
  if (!cfg.dupOn) return none("dup", { blk: null, reps: 0, why: "dup off", dups: [] });
  return dupOn(lines, cfg);
}
