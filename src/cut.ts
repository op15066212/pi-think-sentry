// 删行：判据把「哪些原文行该删」算好了（ev.dups 里每组第三项就是行号），这里照着删。
// 从后往前删——删第 9 行不会影响第 3 行的下标。
//
// 不再按内容匹配。按内容匹配是第二份判据：判据按 dup.min 数一遍，删行按自己的规则再数一遍，
// 两边不一致时删行会比判据更狠。
export function stripDupLines(text: any, drop: any) {
  const src = String(text || "").split("\n");
  const lines = src.slice();
  const idx = (drop instanceof Set ? [...drop] : Array.from(drop || []))
    .map(Number)
    .filter((i) => Number.isInteger(i) && i >= 0 && i < lines.length)
    .sort((a, b) => b - a);
  if (!idx.length) return String(text || "");
  for (const i of idx) lines.splice(i, 1);
  return lines.join("\n");
}

