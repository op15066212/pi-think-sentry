// 句级坍缩：整体统计算法，不做区间搜索。
//
// 为什么重写（2026-11-24，用户要求「按真实数据重写 inline，别直接删」）：
//   原来用 collapseRange：O(n²) 找「最长的一段连续句子，其中不同句占比 <= ratio」。
//   真实数据上它只覆盖 0.3%（50641 段里 129 段）。拿 dup 命中当金标准（3384 段），
//   它漏掉 3143 段——**因为真实重复是散落的**，连续区间永远凑不够长度。
//
// 实测三个候选量（3384 段金标准 vs 43403 段未标记，p10/p50/p90）：
//   uniqRatio    0.750 / 1.000     差：两边都在 0.7~1.0，阈值 0.5 只抓到 9%
//   topShare     0.222 / 0.079     好：2.8 倍差距，是三个量里最好的
//   repeatCover  0.324 / 0.000     好：但不是所有退化都有「大半是重复」
//
// 选的判据：topShare >= 0.3 **或** repeatCover >= 0.5
//   实测金标准命中 33.9%，未标记命中 7.0%（比值 4.8）。
//   比 0.25 更保守的那一档：0.25 能抓 45.4% 但误报 10.4%，对默认开启的判据太高。
//
// 复杂度 O(n)，n 是句子数。原来那个是 O(n²)。

import { sentencesOf } from "../sentences.ts";

export const TOP_SHARE_MIN = 0.3;
export const REPEAT_COVER_MIN = 0.5;

export type Collapse = {
  /** 总句数 */
  n: number;
  /** 不同句数 */
  uniq: number;
  /** 最高频那一句占全部句子的比例 */
  topShare: number;
  /** 出现 >= 2 次的句子覆盖的句子数 / 总句数 */
  repeatCover: number;
  /** 最高频的那一句（用来指认） */
  topSentence: string;
  /** 它在原文里的第一次出现位置（0 基行号） */
  topLine: number;
  /** 判据是否成立 */
  collapsed: boolean;
  /** 为什么（给人读的一句话） */
  why: string;
};

/**
 * 一次扫描算完全部统计量。不找区间，不回溯，不排序句子的各种排列。
 * topLine 用句子自带的行号，句子切分时已经记好了。
 */
export function collapseStats(text: any, skip: readonly string[] = []): Collapse {
  const sents = sentencesOf(text, skip);
  const n = sents.length;
  if (!n) {
    return { n: 0, uniq: 0, topShare: 0, repeatCover: 0, topSentence: "", topLine: 0, collapsed: false, why: "无句子" };
  }

  const cnt = new Map<string, number>();
  const firstLine = new Map<string, number>();
  for (const s of sents) {
    cnt.set(s.t, (cnt.get(s.t) || 0) + 1);
    if (!firstLine.has(s.t)) firstLine.set(s.t, s.li ?? 0);
  }

  let topSentence = "";
  let top = 0;
  let repeated = 0;
  for (const [s, c] of cnt) {
    if (c > top) { top = c; topSentence = s; }
    if (c >= 2) repeated += c;
  }

  const topShare = top / n;
  const repeatCover = repeated / n;
  const byTop = topShare >= TOP_SHARE_MIN;
  const byCover = repeatCover >= REPEAT_COVER_MIN;

  return {
    n,
    uniq: cnt.size,
    topShare,
    repeatCover,
    topSentence,
    topLine: firstLine.get(topSentence) ?? 0,
    collapsed: byTop || byCover,
    why:
      (byTop ? "最高频句占 " + (topShare * 100).toFixed(0) + "%（门槛 30%）" : "") +
      (byTop && byCover ? "，" : "") +
      (byCover ? "重复句覆盖 " + (repeatCover * 100).toFixed(0) + "%（门槛 50%）" : "") ||
      "未坍缩：最高频 " + (topShare * 100).toFixed(0) + "%，覆盖 " + (repeatCover * 100).toFixed(0) + "%",
  };
}
