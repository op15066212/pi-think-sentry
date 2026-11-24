// Aho-Corasick 多模式匹配：一次扫过全文，找出所有模式的所有出现位置。
//
// 为什么需要它（2026-11-24，用户要求「防回灌也是整体思维+高级算法」）：
//   现在的防回灌是**逐行正则**：MARK_RE 匹配折叠标记，dropInjectedTail 按行切。
//   这是局部的——它只知道「这一行像标记」，不知道「这一整段是我注入过的」。
//   于是模型把标记改写一个标点、拆成两行、掺进别的话，正则就失效；
//   而它抄的**仍然是同一次注入的内容**，判据看不见。
//
// 整体做法：把「我注入过的每一段文本」建成一个自动机，一次扫过模型输出，
// 报告每一段被复现的位置与长度。复现了就扣掉——不是按行猜，是按内容认。
//
// 复杂度：建树 O(Σ|模式|)，建失败指针 O(节点数)，扫描 O(|文本| + 匹配数)。
// 与「每个模式各扫一遍」的差别在长尾：注入文本通常三五段，但每段出现多次，
// 逐段扫是 O(m·n)，自动机是 O(n + 命中数)。
//
// 只在构建时分配，扫描时不分配（matches 数组除外）——判据跑在每一帧上，不能有隐藏开销。

export type Hit = { /** 命中的模式下标 */ pattern: number; /** 结束位置（不含） */ end: number; /** 命中长度 */ len: number };

/**
 * 构建自动机。patterns 里的空串会被跳过（空模式无意义且会让失败指针自环）。
 */
export function buildAC(patterns: readonly string[]) {
  // 每个节点：next（字符 → 节点下标）、fail、输出（到此结束的模式下标列表）、depth
  const next: Array<Map<string, number>> = [new Map()];
  const fail: number[] = [0];
  const out: number[][] = [[]];
  const depth: number[] = [0];

  const newNode = (d: number) => {
    next.push(new Map());
    fail.push(0);
    out.push([]);
    depth.push(d);
    return next.length - 1;
  };

  // 一 建 trie
  patterns.forEach((p, idx) => {
    if (!p) return;
    let cur = 0;
    for (const ch of p) {
      let nx = next[cur].get(ch);
      if (nx === undefined) {
        nx = newNode(depth[cur] + 1);
        next[cur].set(ch, nx);
      }
      cur = nx;
    }
    out[cur].push(idx);
  });

  // 二 建失败指针（BFS）
  const queue: number[] = [];
  for (const nx of next[0].values()) {
    fail[nx] = 0;
    queue.push(nx);
  }
  for (let qi = 0; qi < queue.length; qi++) {
    const v = queue[qi];
    for (const [ch, u] of next[v]) {
      // 沿失败链找 v 的后继
      let f = fail[v];
      while (f && !next[f].has(ch)) f = fail[f];
      const cand = next[f].get(ch);
      fail[u] = cand !== undefined && cand !== u ? cand : 0;
      // 输出合并：到 u 时，fail 链上的输出也算命中（否则短模式被长模式遮住）
      out[u] = out[u].concat(out[fail[u]]);
      queue.push(u);
    }
  }

  return {
    patterns,
    size: next.length,
    /** 一次扫描，返回所有命中。位置是「结束下标（不含）」与长度。 */
    scan(text: string): Hit[] {
      const hits: Hit[] = [];
      let cur = 0;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        while (cur && !next[cur].has(ch)) cur = fail[cur];
        const nx = next[cur].get(ch);
        cur = nx !== undefined ? nx : 0;
        if (out[cur].length) {
          for (const p of out[cur]) {
            hits.push({ pattern: p, end: i + 1, len: patterns[p].length });
          }
        }
      }
      return hits;
    },
    /** 是否命中任意一个模式。比 scan 便宜：命中即返回。 */
    test(text: string): boolean {
      let cur = 0;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        while (cur && !next[cur].has(ch)) cur = fail[cur];
        const nx = next[cur].get(ch);
        cur = nx !== undefined ? nx : 0;
        if (out[cur].length) return true;
      }
      return false;
    },
  };
}

export type Automaton = ReturnType<typeof buildAC>;

/**
 * 扣除：把命中区间从文本里挖掉，返回剩下的片段。
 * 与「按行过滤」的差别：按行只能整行留或整行删，这里按**字符区间**扣，
 * 所以标记写在句子中间、跨行、被改写一半，都能只扣掉命中那一段。
 */
export function excise(text: string, hits: readonly Hit[]): string {
  if (!hits.length) return text;
  // 命中可能重叠（长短模式同时中），先按起点排序再合并
  const spans = hits
    .map((h) => [h.end - h.len, h.end] as [number, number])
    .sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged: Array<[number, number]> = [];
  for (const [s, e] of spans) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  const out: string[] = [];
  let at = 0;
  for (const [s, e] of merged) {
    if (s > at) out.push(text.slice(at, s));
    at = Math.max(at, e);
  }
  if (at < text.length) out.push(text.slice(at));
  return out.join('');
}
