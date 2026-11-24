// 前缀复诵：每行行首用同一个词起头。
//
// 为什么现有三条判据都抓不到（2026-11-24，用户从截图里指出）：
//   那段思考每一行都以「务实：」开头，有些还是「务实：务实：」双层。
//   dup    按整行计数 —— 每行内容都不同，一行都不重复，抓不到。
//   inline 按句子种类 —— 句子种类很多，比例不低，抓不到。
//   run    按最长连续重复 —— 公共部分只有「务实：」三个字，远低于 12 的门槛。
//
// 这是第四种形状：**行首前缀的机械重复**。它不属于行重复、句坍缩、连续重复任何一种。
//
// 度量：取每行前 N 个字，看最集中的那个前缀占多少行。
//   正常写作里行首是多样的（「先看…」「然后…」「所以…」），topShare 很低。
//   退化时行首被同一个词霸占，topShare 接近 1。
//
// N = 3：中文里三个字足以区分「务实：」和「正确做法」；再短会把「我」「这」这类虚词算进去。

export const PREFIX_LEN = 3;
export const PREFIX_TOP_MIN = 0.5;

export type Prefix = {
  /** 参与统计的行数（空行、代码行不算） */
  n: number;
  /** 最集中的前缀 */
  top: string;
  /** 它占多少行 */
  topShare: number;
  /** 前三个前缀及占比 */
  top3: Array<{ prefix: string; share: number }>;
  /** 判据是否成立 */
  repeated: boolean;
};

/**
 * 一次扫描，统计行首前缀的集中度。
 * 跳过空行、围栏行、缩进行（那些是代码，行首有缩进不代表退化）。
 */
export function prefixStats(text: any, len = PREFIX_LEN): Prefix {
  const lines = String(text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length >= len && !/^(`{3,}|~{3,})/.test(l) && !/^\s*$/.test(l));

  const n = lines.length;
  if (n < 4) return { n, top: "", topShare: 0, top3: [], repeated: false };

  const cnt = new Map<string, number>();
  for (const l of lines) {
    const p = l.slice(0, len);
    cnt.set(p, (cnt.get(p) || 0) + 1);
  }

  const sorted = [...cnt].sort((a, b) => b[1] - a[1]);
  const top = sorted[0][0];
  const topShare = sorted[0][1] / n;

  return {
    n,
    top,
    topShare,
    top3: sorted.slice(0, 3).map(([prefix, c]) => ({ prefix, share: c / n })),
    repeated: topShare >= PREFIX_TOP_MIN,
  };
}
