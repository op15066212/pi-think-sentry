// 句子切分与处置标记识别：judges 与 features/collapse 都要用，所以单独一处。
//
// 为什么抽出来（2026-11-24）：重写 inline 的判据要用到 sentencesOf，
// 如果 collapse.ts 从 judges.ts import 它，而 judges.ts 又要 import collapse.ts，
// 就成了循环依赖。把「切句子」和「认标记」这两个词本身抽出来，两边都指向它。

/** 按句末标点切句。保留标点，末尾不带标点的片段也算一句。 */
export const SENT_RE = /[^。！？!?]+[。！？!?]+|[^。！？!?]+$/g;

/**
 * 处置标记的两种形状。它们不算思考内容——否则「处置自己制造了下一次判红」，
 * 是最典型的回灌：模型读到折叠标记，抄一遍，标记自己成了新的一种句子。
 */
export const MARK_RE =
  /^\[\d+ 句、共 \d+-\d+ 行坍缩成 \d+ 种，已折叠\]$|^\[原第 \d+-\d+ 行共 \d+ 行，全部重复已删\]$/;

/**
 * 切句。返回 { t: 句子, li: 原始行号 }。
 *
 * 跳过两类行：注入文案（skip 里逐字相同的行）、处置标记（MARK_RE 命中）。
 * 行号仍按原文计——折叠定位要用它，跳过的行不能让它错位。
 */
export function sentencesOf(text: any, skip: readonly string[] = []) {
  const out: { t: string; li: number }[] = [];
  String(text || "").split("\n").forEach((ln: string, li: number) => {
    const t = ln.trim();
    // 注入文案不算思考内容（自锁的另一半）：若不算，坍缩判据会把自己注入的提醒
    // 当成退化来源，判红→再注入→再判红。
    if (skip.length && skip.includes(t)) return;
    // 处置标记也不算（防回灌的第二半）：折叠后的那一行会被模型读到、可能被抄。
    // 抄来的标记如果计入统计，它自己就成了「一种句子」，越抄越多，等于回灌。
    if (MARK_RE.test(t)) return;
    const m = ln.match(SENT_RE) || [];
    for (const raw of m) {
      const s = String(raw).trim();
      if (s) out.push({ t: s, li });
    }
  });
  return out;
}
