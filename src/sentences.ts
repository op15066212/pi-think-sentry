// 句子切分与处置标记识别：judges 与 features/collapse 都要用，所以单独一处。
//
// 为什么抽出来（2026-11-24）：重写 inline 的判据要用到 sentencesOf，
// 如果 collapse.ts 从 judges.ts import 它，而 judges.ts 又要 import collapse.ts，
// 就成了循环依赖。把「切句子」和「认标记」这两个词本身抽出来，两边都指向它。

/** 按句末标点切句。保留标点，末尾不带标点的片段也算一句。 */
export const SENT_RE = /[^。！？!?]+[。！？!?]+|[^。！？!?]+$/g;

/**
 * 处置标记：插件自己注入的东西，永远不算思考内容。
 *
 * ── 2026-11-24 事故（用户第 N 次说「防回灌没做好」）────────────────────
 *
 * 形状：处置的产物变成了下一次判红的输入。
 *
 *   判红 → 删掉重复行 → 注入「[外部附注：已删重复。]」
 *        → 下一帧读到这一行 → 它被当成「一种句子」→ 句子种类变少 → 判红
 *        → 再删、再注入 → 越注越多
 *
 * 实测（10 句完全正常的文本，末尾加 5 行标记）：
 *
 *   纯正常内容                              → 干净
 *   + [外部附注：已删重复。] × 5            → 判红 fold/inline   ← 漏
 *   + [外部附注：已删重复 4 处。] × 5        → 判红 fold/inline   ← 漏
 *   + [已折叠：重复] × 5                     → 判红 fold/inline   ← 漏
 *   + [已改：语言] × 5                       → 判红 fold/inline   ← 漏
 *   + [3 句、共 1-3 行坍缩成 1 种，已折叠] × 5 → 干净（只有这一种被认）
 *
 * 根因是**清单有两个像**：本文件的 MARK_RE 只写了 2 种带数字的形状，
 * judges.ts 另有一份 LEGACY_TRACES 写了 4 种逐字的。两处各写一遍，
 * 一边新增另一边不知道，于是最常出现的两种（实测 1088 次 + 444 次）从来没被剥掉。
 *
 * 所以这里只留**一份清单**：
 *   MARK_TEXTS    —— 逐字形状。judges.ts 的 Aho-Corasick 直接用它（任意位置删除）。
 *   MARK_PATTERNS —— 带数字的、没法逐字列的形状。只有正则认得。
 *   MARK_RE       —— 由上面两份拼出来的行级整行匹配。
 *
 * 加一种新标记只改这一个文件。反例：在 judges.ts 里再加一条 LEGACY_TRACES 而不改这里，
 * 那么 collapse 判据（走 sentencesOf）仍把新标记当成句子——两条判据对同一件事给出不同答案。
 */
export const MARK_TEXTS: readonly string[] = [
  // 2026-11-18 至 2026-11-21 的旧文案，实测出现 1088 次
  "[外部附注：已删重复。]",
  "[外部附注：已删重复 4 处。]",
  "[已折叠：重复]",
  "[已改：语言]",
];

/** 带数字的形状：逐字列不出来，只能用正则。 */
export const MARK_PATTERNS: readonly string[] = [
  String.raw`\[\d+ 句、共 \d+-\d+ 行坍缩成 \d+ 种，已折叠\]`,
  String.raw`\[原第 \d+-\d+ 行共 \d+ 行，全部重复已删\]`,
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * 处置标记的行级整行匹配。由 MARK_TEXTS 与 MARK_PATTERNS 拼出来，不手写第二份。
 *
 * 锚定整行：标记是独占一行的，正文里出现同样的字（比如讨论这个标记本身）
 * 不算标记。上面那组实测样本就是按整行喂的。
 */
export const MARK_RE = new RegExp(
  "^(?:" + [...MARK_PATTERNS, ...MARK_TEXTS.map(escapeRe)].join("|") + ")$",
);

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
