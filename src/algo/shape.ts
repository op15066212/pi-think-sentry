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

export const DIM_LEN = 3;

export type Dim = {
  /** 维度名 */
  name: string;
  /** 最集中的那一项 */
  top: string;
  /** 它占多少（0~1） */
  share: number;
  /** 判它越线的门槛 */
  min: number;
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
  if (!items.length) return { top: "", share: 0 };
  const cnt = new Map<string, number>();
  for (const x of items) cnt.set(x, (cnt.get(x) || 0) + 1);
  let top = "";
  let best = 0;
  for (const [k, v] of cnt) if (v > best) { best = v; top = k; }
  return { top, share: best / items.length };
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
    .map((l) => ({ raw: l, t: l.trim() }))
    .filter((x) => x.t.length >= DIM_LEN && !/^(`{3,}|~{3,})/.test(x.t));

  const n = rows.length;
  const empty: Shape = { n, dims: [], votes: 0, red: false, why: "行数太少" };
  if (n < 4) return empty;

  // 一 行首：前 3 字
  const head = topShareOf(rows.map((x) => x.t.slice(0, DIM_LEN)));
  // 二 行尾：后 3 字
  const tail = topShareOf(rows.map((x) => x.t.slice(-DIM_LEN)));
  // 三 行长：分档后的集中度
  const lenb = topShareOf(rows.map((x) => lenBucket(x.t)));
  // 四 缩进：分档后的集中度
  const ind = topShareOf(rows.map((x) => indentBucket(x.raw)));
  // 五 句首：每句前 2 字（句子比行更细）
  const sents = rows.flatMap((x) => x.t.split(/[。！？!?]/).map((s) => s.trim()).filter((s) => s.length >= 2));
  const sentHead = topShareOf(sents.map((s) => s.slice(0, Math.min(2, s.length))));
  // 六 套话：连续 4 字窗口的集中度（高频短语霸占全篇）
  const grams: string[] = [];
  const joined = rows.map((x) => x.t).join("\n");
  for (let i = 0; i + 4 <= joined.length; i++) {
    const g = joined.slice(i, i + 4);
    if (!/[\n\s]/.test(g)) grams.push(g);
  }
  const phrase = topShareOf(grams);

  const mk = (name: string, x: { top: string; share: number }, min: number, skip = false): Dim => ({
    name,
    top: x.top,
    share: x.share,
    min,
    // skip 的维度不算票，但数值照样报出来——读的人要看到「这一项是多少、为什么不算」。
    over: !skip && x.share >= min,
  });

  const dims = [
    mk("行首", head, cfg.headMin ?? 0.5),
    mk("行尾", tail, cfg.tailMin ?? 0.6),
    mk("行长", lenb, cfg.lenMin ?? 0.9),
    // 缩进全是 0 说明这段没有缩进——那是常态，不是退化。实测两个正常样本都在这项拿 1.00。
    mk("缩进", ind, cfg.indentMin ?? 0.9, ind.top === "0"),
    mk("句首", sentHead, cfg.sentHeadMin ?? 0.4),
    mk("套话", phrase, cfg.phraseMin ?? 0.05),
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
