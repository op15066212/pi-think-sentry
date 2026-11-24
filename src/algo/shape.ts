// 结构特征：把一段思考摊成多个维度，各维度独立打分，最后投票。
//
// 为什么不能只看行首（2026-11-24，用户说「前缀，后缀，上下左右都安排上，多算法模式」）：
//   截图那段每行以「务实：」开头，行首前缀判据一次就抓到了。
//   但退化不长一个样子：有的行尾固定（「…完成。」），有的行长整齐（每行都是 12 字），
//   有的缩进层级固定，有的行内套话反复（「也就是说」「换句话说」）。
//   单看任何一个维度，换一种退化就漏。
//
// 做法：一次扫描算出六个维度，每个维度给一个 0~1 的「集中度」，
// 超过自己门槛的算一票。**两票以上才判红**——单维度高了容易是排版习惯，不是退化。
//
// 六个维度各自回答一句人话：
//   行首  这些行是拿同一个词起头的吗
//   行尾  这些行是拿同一个词收尾的吗
//   行长  这些行的长度是不是一个模子
//   缩进  这些行的缩进层级是不是一个模子
//   句首  句子是拿同一个词起头的吗
//   套话  高频短语是不是霸占了全篇

/**
 * 剥掉行首的 markdown 语法符号，留下「这句话本身」。
 *
 * 2026-11-24 事故（用户指着屏幕说「让你看思维链退化」，我看到的却是自己判据在乱判）：
 * 2045 段真实思考里 shape 判红 129 段，抽样后发现全是结构噪声——
 *
 *   行首「- 」55%      ← markdown 列表符号，不是文字重复
 *   行长「长」100%     ← 列表每行一样长，结构性必然
 *   句首「- 」43%      ← 同一个列表符号
 *   套话「inde」5%     ← 代码标识符 index
 *
 * 真退化与误报的分界就在这里：
 *   真退化   务实：／执行。／完成。
 *   误报     - * 1. > # |
 *
 * 所以统计前先剥语法符号。剥的只是前缀，正文一个字不动。
 * 反例：不剥的话，任何一篇用列表写的正常笔记都会被判成「行首高度集中」。
 */
export function stripMdPrefix(line: string): string {
  let s = String(line || "").trim();
  // 表格行：| a | b | → a | b（首尾竖线是语法）
  if (s.startsWith("|")) s = s.replace(/^\|+/, "").replace(/\|+$/, "").trim();
  // 列表、复选框、有序列表、引用、标题，可能叠加（「- - 项」「> 1. 步骤」）
  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s
      .replace(/^[-*+]\s+\[[ xX]\]\s+/, "")
      .replace(/^[-*+]\s+/, "")
      .replace(/^\d+[.)]\s+/, "")
      .replace(/^>+\s*/, "")
      .replace(/^#{1,6}\s+/, "")
      // 行首反引号与加粗星号也是语法：`` `npx find` `` 的内容是 npx，不是反引号。
      .replace(/^`+/, "")
      .replace(/^\*\*/, "")
      .trim();
  }
  return s;
}

/**
 * 剥掉行尾的 markdown 语法符号。
 *
 * 2026-11-24 跨会话量出来的形状（13093 段，6 个会话）：
 *   行尾「。**」65%   <- markdown 加粗结尾，不是文字重复
 *   行尾「...」70%    <- 省略号
 * 这两个在「行尾」维度上被判成「同一串字收尾」，而它们只是排版。
 *
 * 剥的仍是语法，不是内容：只吃行尾的 * _ ~ 与紧挨着的重复标点。
 */
export function stripMdSuffix(line: string): string {
  let s = String(line || "").trim();
  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s
      .replace(/[*_`~]+$/, "")
      .replace(/[.．。]{2,}$/, "")
      .trim();
  }
  return s;
}

/**
 * 是不是代码行。
 *
 * 跨会话数据里，行首维度被这两种骗过：
 *   「imp」50%（import）   「dat」53%（data）
 * 它们确实是「同一串字开头」，但那是代码关键字，不是退化。
 *
 * 判法：以 ASCII 字母开头，且这行里没有中文。
 * 反过来不成立——中文开头也可能是代码注释，但那种不常见，且宁可漏不可乱判。
 */
export function isCodeLine(s: string): boolean {
  const t = String(s || "").trim();
  if (!t) return false;
  if (!/^[A-Za-z_$]/.test(t)) return false;
  return !/[一-鿿]/.test(t);
}

/**
 * 这一行参不参与「行首/行尾/句首」三个文字维度的统计。
 *
 * 跨会话第二轮量出来的残留（13097 段，shape 从 2.1% 收到 0.8% 之后）：
 *   行首「100」93%   <- 数字开头（表格、编号）
 *   句首「1.」44%    <- 有序列表
 *   行首「~/.」57%   <- 路径
 * 这三种都不是「文字重复」，是排版与路径。
 *
 * 判法：只认中文开头的行。
 *
 * 代价写在这里，不假装没有：**全英文的思考在行首维度上永远 0 票**。
 * 本插件的 lang.dir 默认 zh，英文场景主要由 lang 判据管；
 * 真要覆盖英文退化，得给英文行单独一组统计，现在没做。
 */
export function isProseLine(s: string): boolean {
  const t = String(s || "").trim();
  if (!t) return false;
  return /^[一-鿿]/.test(t);
}

export const DIM_LEN = 3;

export type Dim = {
  /** 维度名 */
  name: string;
  /** 最集中的那一项 */
  top: string;
  /** 它占多少（0~1） */
  share: number;
  /** 最集中那一项出现了几次（绝对次数） */
  count: number;
  /** 判它越线的门槛（比例） */
  min: number;
  /** 判它越线的门槛（绝对次数） */
  minCount: number;
  /** 是否越过门槛 */
  over: boolean;
};

export type Shape = {
  /** 参与统计的行数 */
  n: number;
  dims: Dim[];
  /** 越过门槛的维度数 */
  votes: number;
  /** 两票以上 */
  red: boolean;
  /** 给人读的一句话 */
  why: string;
};

const topShareOf = (items: readonly string[]) => {
  const m = new Map<string, number>();
  for (const x of items) m.set(x, (m.get(x) || 0) + 1);
  let top = "";
  let best = 0;
  for (const [k, v] of m) {
    // 平手取字典序小的，保证同一输入两次结果一致（纯函数）
    if (v > best || (v === best && k < top)) {
      best = v;
      top = k;
    }
  }
  // count 是绝对次数。只有比例会被短段骗：4 行里 2 行相同就是 50%，
  // 但那不是「一个前缀霸占全篇」，只是段太短。判票要比例与次数同时越线。
  return { top, share: items.length ? best / items.length : 0, count: best };
};

/** 行长分档：把长度按 8 字一档合并，太细会每行都不一样。 */
const lenBucket = (s: string) => {
  const n = s.length;
  if (n < 8) return "短";
  if (n < 24) return "中";
  if (n < 60) return "长";
  return "特长";
};

/** 缩进分档：0、1-2、3-4、5+ 空格。 */
const indentBucket = (raw: string) => {
  const m = raw.match(/^[ \t]*/);
  const w = (m ? m[0] : "").replace(/\t/g, "    ").length;
  if (w === 0) return "0";
  if (w <= 2) return "1-2";
  if (w <= 4) return "3-4";
  return "5+";
};

export type ShapeCfg = {
  headMin?: number;
  tailMin?: number;
  lenMin?: number;
  indentMin?: number;
  sentHeadMin?: number;
  phraseMin?: number;
  votesToRed?: number;
  // 绝对次数门槛：比例与次数同时越线才算一票。
  // 2026-11-24 加：只有比例时，4 行里 2 行相同（50%）也算「集中」，
  // 2045 段真实思考上误报 125 段，抽样全是 markdown 列表与短段。
  headCount?: number;
  tailCount?: number;
  lenCount?: number;
  indentCount?: number;
  sentHeadCount?: number;
  phraseCount?: number;
};

/**
 * 一次扫描算完六个维度。纯函数，不改输入。
 *
 * 门槛的默认值来自截图样本与正常散文的对比（见 bin/probe-shape.mjs）：
 * 退化时那段的行首集中度是 1.00，正常文本最高 0.20；门槛取中间偏保守。
 */
export function shapeOf(text: any, cfg: ShapeCfg = {}): Shape {
  const raw = String(text || "").split("\n");
  // 行级统计只看非空、非围栏、不太短的行
  const rows = raw
    .map((l) => {
      const t = l.trim();
      // c = 剥掉 markdown 语法符号后的内容，文字维度都用它；
      // t 与 raw 留给行长与缩进——那两个维度问的是排版，不是文字。
      const c = stripMdPrefix(t);
      return { raw: l, t, c, e: stripMdSuffix(c) };
    })
    .filter((x) => x.c.length >= DIM_LEN && !/^(`{3,}|~{3,})/.test(x.t));

  const n = rows.length;
  const empty: Shape = { n, dims: [], votes: 0, red: false, why: "行数太少" };
  // 8 行以下不判：4 行里 2 行相同就是 50%，那是段短，不是退化。
  if (n < 8) return empty;

  // 一 行首：前 3 字
  // 行首：只看「有中文的行」。代码关键字（import / data）也是同一串字开头，
  // 但那是语言结构，不是退化。跨会话实测这两种把行首维度骗到 50% 以上。
  const prose = rows.filter((x) => isProseLine(x.c));
  const head = topShareOf(prose.map((x) => x.c.slice(0, DIM_LEN)));
  // 二 行尾：后 3 字
  const tail = topShareOf(prose.map((x) => x.e.slice(-DIM_LEN)));
  // 三 行长：分档后的集中度
  const lenb = topShareOf(rows.map((x) => lenBucket(x.t)));
  // 四 缩进：分档后的集中度
  const ind = topShareOf(rows.map((x) => indentBucket(x.raw)));
  // 五 句首：每句前 2 字（句子比行更细）
  // 每句开头也要剥语法符号。
  // 2026-11-24 第三轮量出来：17628 段里 413 段命中 shape>=2，其中七段的命中维度都是
  // 「句首 ** 40~50%」——加粗在句子中间（「现在第三环：**需要 ...」），
  // stripMdPrefix 只管行首，管不到 split 出来的每一句。
  const stripSent = (s: string) => s.replace(/^[*_`~]+/, "").replace(/[*_`~]+$/, "").trim();
  const sents = prose
    .flatMap((x) => x.c.split(/[。！？!?]/))
    .map((s) => stripSent(s))
    .filter((s) => s.length >= 2);
  const sentHead = topShareOf(sents.map((s) => s.slice(0, Math.min(2, s.length))));
  // 六 套话：连续 4 字窗口的集中度（高频短语霸占全篇）
  const grams: string[] = [];
  const joined = rows.map((x) => x.c).join("\n");
  for (let i = 0; i + 4 <= joined.length; i++) {
    const g = joined.slice(i, i + 4);
    if (!/[\n\s]/.test(g)) grams.push(g);
  }
  const phrase = topShareOf(grams);

  const mk = (name: string, x: { top: string; share: number; count: number }, min: number, minCount: number, skip = false): Dim => ({
    name,
    top: x.top,
    share: x.share,
    count: x.count,
    min,
    minCount,
    // skip 的维度不算票，但数值照样报出来——读的人要看到「这一项是多少、为什么不算」。
    // 比例与绝对次数都要越线：只有比例时，4 行里 2 行相同（50%）也算「集中」，
    // 2045 段真实数据上这样误报 125 段，抽样全是列表符号与 4 行短段。
    over: !skip && x.share >= min && x.count >= minCount,
  });

  const dims = [
    mk("行首", head, cfg.headMin ?? 0.5, cfg.headCount ?? 8),
    mk("行尾", tail, cfg.tailMin ?? 0.6, cfg.tailCount ?? 8),
    mk("行长", lenb, cfg.lenMin ?? 0.9, cfg.lenCount ?? 10),
    // 缩进全是 0 说明这段没有缩进——那是常态，不是退化。实测两个正常样本都在这项拿 1.00。
    mk("缩进", ind, cfg.indentMin ?? 0.9, cfg.indentCount ?? 10, ind.top === "0"),
    mk("句首", sentHead, cfg.sentHeadMin ?? 0.4, cfg.sentHeadCount ?? 8),
    mk("套话", phrase, cfg.phraseMin ?? 0.05, cfg.phraseCount ?? 20),
  ];

  const votes = dims.filter((d) => d.over).length;
  const need = cfg.votesToRed ?? 2;
  const over = dims.filter((d) => d.over);

  return {
    n,
    dims,
    votes,
    red: votes >= need,
    why: votes === 0
      ? "六个维度都没越线"
      : over.map((d) => d.name + "「" + d.top + "」" + Math.round(d.share * 100) + "%").join("，") +
        "（" + votes + " 票，门槛 " + need + "）",
  };
}
