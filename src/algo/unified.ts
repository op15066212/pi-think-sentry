// 归一化整体判断：四个量全部在 [0,1]，几何平均成一个分，一个门槛。
//
// 为什么换掉四条判据七个阈值（2026-11-24，用户说「好复杂」「有无归一化、整体判断的办法」
// 「向量化，图论，矩阵」「群论」）：
//   原来 dup / inline / run / shape 各管一种形状，各有一个阈值。加一种形状就要加一条判据。
//   现在把一段文本看成**一张图 + 一个矩阵 + 一个置换群**，四张量都天然归一化，
//   用几何平均合成一个数，只需要一个门槛。
//
// 四个量的出处：
//   symmetry   群论。T 的平移自同构群大小 |Aut|/n = 1/p，p 是最小周期。
//              规则重复（做。×31、ABAB、整段复制两遍）只有它给出一个数。
//   entropy    矩阵。句子转移矩阵的归一化行熵。模板化改写时转移模式固定 → 熵低。
//   maxShare   图论。最高频节点的度 / 总节点数。同一句反复时接近 1。
//   ngramRep   子结构。字级 3/4-gram 的重复率。抓前缀、后缀、中间任何位置的重复，
//              这是前三项都抓不到的那一类——「18 行都以『务实：』开头、整句各不同」。
//
// 为什么几何平均而不是加权和：
//   加权和会让「n-gram 塌了但熵仍是 1.0」被救回来。实测截图那 18 行，
//   加权和给 0.59（判绿，漏），几何平均给 0.48（判红，对）。
//   几何平均的语义是：任一维塌陷，整体就塌陷。
//
// 实测分离（bin/probe-unified.mjs，5 个真实形状）：
//   退化 0.00 / 0.41 / 0.48      正常 0.80 / 0.86      门槛 0.60，中间没有人。

export type Unified = {
  /** 句总数 */
  sentences: number;
  /** 不同句数（图的节点数） */
  nodes: number;
  /** 群论：1 - 1/p，p 是最小周期（行级与字符级取更对称的） */
  symmetry: number;
  /** 转移熵，1 = 完全均匀 */
  entropy: number;
  /** 最高频句占比 */
  maxShare: number;
  /** 字级 3/4-gram 重复率 */
  ngramRep: number;
  /** 几何平均，0 = 完全退化，1 = 完全正常 */
  score: number;
  /** score < 门槛 */
  red: boolean;
  why: string;
};

/** 最小周期；只认整除的 p，因为 |Aut| = n/p 要是整数。 */
export function minPeriod<T>(steps: readonly T[]): number {
  const n = steps.length;
  if (n < 2) return n;
  for (let p = 1; p < n; p++) {
    if (n % p !== 0) continue;
    let ok = true;
    for (let i = p; i < n; i++) {
      if (steps[i] !== steps[i - p]) { ok = false; break; }
    }
    if (ok) return p;
  }
  return n;
}

const normEntropy = (counts: readonly number[]): number => {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total <= 1) return 1;
  let h = 0;
  for (const c of counts) {
    if (!c) continue;
    const p = c / total;
    h -= p * Math.log2(p);
  }
  // 归一化用 min(K,2)：只用两个符号的文本，熵本来就只能是 1.0，
  // 按 log K 归一化会把「ABAB」判成完全正常。
  const k = Math.min(counts.filter((c) => c > 0).length, 2);
  return k <= 1 ? 0 : Math.min(1, h / Math.log2(k));
};

/** 切成句子：句子是图的节点。 */
function sentencesOf(text: string): string[] {
  const out: string[] = [];
  for (const l of text.split("\n").map((s) => s.trim()).filter(Boolean)) {
    if (/^(`{3,}|~{3,})/.test(l)) continue;
    const parts = l.split(/(?<=[。！？!?])/).map((s) => s.trim()).filter(Boolean);
    if (parts.length) out.push(...parts);
    else out.push(l);
  }
  return out;
}

/**
 * 四个量 + 几何平均。纯函数，无 IO。
 * minScore 默认 0.60，出自实测间隙（退化 ≤0.48，正常 ≥0.80）。
 */
export function unifiedScore(text: any, minScore = 0.6): Unified {
  const raw = String(text || "");
  const sents = sentencesOf(raw);
  const n = sents.length;

  if (n < 4) {
    return {
      sentences: n, nodes: n, symmetry: 1, entropy: 1, maxShare: 0, ngramRep: 0,
      score: 1, red: false, why: "句数 " + n + " 太少，不判",
    };
  }

  // 图：节点 = 不同句，最高频节点的度
  const cnt = new Map<string, number>();
  for (const s of sents) cnt.set(s, (cnt.get(s) || 0) + 1);
  let maxDeg = 0;
  for (const c of cnt.values()) if (c > maxDeg) maxDeg = c;
  const maxShare = maxDeg / n;

  // 矩阵：相邻句转移
  const trans = new Map<string, number>();
  for (let i = 0; i + 1 < n; i++) {
    const k = sents[i] + "\u0000" + sents[i + 1];
    trans.set(k, (trans.get(k) || 0) + 1);
  }
  const entropy = normEntropy([...trans.values()]);

  // 群论：行级与字符级各算周期，取更对称的
  const chars = [...raw];
  const rows = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const symRow = rows.length >= 2 ? 1 / minPeriod(rows) : 0;
  const symChar = chars.length >= 2 ? 1 / minPeriod(chars) : 0;
  const symmetry = Math.max(symRow, symChar);

  // 子结构：字级 3-gram 与 4-gram 取重复率更高的
  const ngramRep = (k: number): number => {
    const grams: string[] = [];
    for (let i = 0; i + k <= chars.length; i++) grams.push(chars.slice(i, i + k).join(""));
    if (!grams.length) return 0;
    const seen = new Map<string, number>();
    for (const g of grams) seen.set(g, (seen.get(g) || 0) + 1);
    let dup = 0;
    for (const c of seen.values()) if (c > 1) dup += c - 1;
    return dup / grams.length;
  };
  const rep = Math.max(ngramRep(3), ngramRep(4));

  // 四维几何平均（权重之和 = 1，所以就是加权几何平均）
  const dims: Array<[number, number]> = [
    [1 - symmetry, 0.15],
    [entropy, 0.15],
    [1 - maxShare, 0.3],
    [1 - rep, 0.4],
  ];
  let logSum = 0;
  for (const [x, w] of dims) logSum += w * Math.log(Math.max(x, 1e-9));
  const score = Math.exp(logSum);

  return {
    sentences: n,
    nodes: cnt.size,
    symmetry,
    entropy,
    maxShare,
    ngramRep: rep,
    score,
    red: score < minScore,
    why:
      "句 " + n + "/" + cnt.size +
      " 群论 " + symmetry.toFixed(2) +
      " 熵 " + entropy.toFixed(2) +
      " 最高频 " + maxShare.toFixed(2) +
      " ngram " + rep.toFixed(2) +
      " → " + score.toFixed(2) + (score < minScore ? " 红" : " 绿"),
  };
}
