import { SENT_RE, MARK_RE, sentencesOf } from "./sentences.ts";
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



const countCjk = (s: any) => (s.match(/[\u3400-\u4dbf\u4e00-\u9fff]/g) || []).length;
const countLat = (s: any) => (s.match(/[A-Za-z]/g) || []).length;
const countTarget = (s: string, dir: "zh" | "en") => (dir === "en" ? countLat(s) : countCjk(s));
// 一次扫描同时数中文与拉丁字母（2026-11-25）。
//
// 为什么手写循环，不用正则：实测 11489 字文本，重复 500 次取均——
//   两次 match（原始写法）   0.1049 ms
//   一次 matchAll            0.3027 ms   ← 我第一版以为合并成正则更快，实测慢 3 倍
//   手写 charCodeAt 循环     0.0318 ms   ← 快 3.3 倍
//
// matchAll 每步返回迭代器对象，开销在分配不在匹配。三个实现结果逐字相同
//（cjk 8800 / lat 0），所以换实现不换判据。
//
// 反例：用 [^\x00-\x7f] 数中文——全角标点、日文、emoji 都会被算进去。
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
  const counts = countBoth(joined);
  const ev = { cjk: counts.cjk, lat: counts.lat, lines: off, dir, sample, line: badLine };
  if (off > keep) return Verdict.parse({ kind: "retract", rule: "lang", ev });
  return none("lang", ev);
}




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
  const all = partitionLines(raw).filter((l) => !MARK_RE.test(l.t));
  const lines = voteOf(all);
  // 整体判据先跑（2026-11-24 修）：它比 dup/inline 更准——不切分，一次扫描取最长匹配。
  // 原来放在它们之后，于是 31 行「做。」先被 dup 判红，run 永远轮不到。
  // 「更准的先判」不是效率问题：先判的那条决定了 ev 的形状，也就决定了处置怎么走。
  if (cfg.dupOn) {
    const d = dupOn(lines, cfg);  // lines 就是 voteOf(all)，上面已算过
    if (d.kind !== "none") return d;
  }
  if (!cfg.langOn) return none("lang", { cjk: 0, lat: 0, lines: 0, dir: cfg.langDir, sample: null });
  return langOn(lines, cfg);
}
