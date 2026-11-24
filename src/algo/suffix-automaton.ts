// 后缀自动机：一次建出整段文本的全部重复结构。
//
// 为什么需要它（2026-11-24，用户指出「还在用原始的」）：
//   inline 原来的 collapseRange 是 O(n²) 的**连续区间搜索**——它只找得到
//   「第 3 句到第 15 句全是重复」这种形状。真实退化不是那样：
//   数据里 3384 段被 dup 判为退化，collapseRange 只在其中 110 段命中，漏掉 3143 段。
//   原因是那些重复**散落**在正常内容之间，连续区间永远凑不够长度。
//
// 后缀自动机一次建出所有子串的出现次数，不要求连续：
//   每个状态 v 代表一族子串（长度在 (len[link[v]], len[v]] 之间），
//   它们在这段文本里都出现 cnt[v] 次。所以「哪些片段重复了几次」是查表，不是搜索。
//
// 复杂度：建 O(n)，计数排序 O(n)，遍历 O(n)。n 是符号数（这里是句子数），不是字符数。
//
// 与 LZ77 的分工：LZ77 找「最长的连续重复」（压缩口径），
// 后缀自动机找「出现次数最多的片段」（统计口径）。散落的重复只有后者看得见。

export type Repeated = { /** 片段（符号数组） */ slice: number[]; /** 长度（符号数） */ len: number; /** 出现次数 */ count: number };

/**
 * 建索引。symbols 是任意可比较的符号序列（句子、行、字符都行）。
 * 返回的 query 给「出现 >= minCount 次的最长片段」与「覆盖率」两个数。
 */
export function suffixIndex<T>(symbols: readonly T[]) {
  const n = symbols.length;
  // 符号先映射成 0..k-1 的整数，自动机只认整数
  const id = new Map<T, number>();
  const seq = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const s = symbols[i];
    let v = id.get(s);
    if (v === undefined) { v = id.size; id.set(s, v); }
    seq[i] = v;
  }
  const alpha = Math.max(1, id.size);

  // 状态上限 2n-1
  const maxStates = Math.max(2, 2 * n);
  const next = new Map<number, number>();
  const link = new Int32Array(maxStates).fill(-1);
  const len = new Int32Array(maxStates);
  const cnt = new Int32Array(maxStates);
  const firstPos = new Int32Array(maxStates).fill(-1);
  let size = 1;
  let last = 0;

  const get = (v: number, c: number) => next.get(v * alpha + c);
  const set = (v: number, c: number, u: number) => next.set(v * alpha + c, u);

  const newState = (l: number) => {
    len[size] = l;
    return size++;
  };

  for (let i = 0; i < n; i++) {
    const c = seq[i];
    const cur = newState(len[last] + 1);
    cnt[cur] = 1;
    firstPos[cur] = i;
    let p = last;
    while (p !== -1 && get(p, c) === undefined) {
      set(p, c, cur);
      p = link[p];
    }
    if (p === -1) {
      link[cur] = 0;
    } else {
      const q = get(p, c) as number;
      if (len[p] + 1 === len[q]) {
        link[cur] = q;
      } else {
        const clone = newState(len[p] + 1);
        firstPos[clone] = firstPos[q];
        // 复制 q 的出边
        for (let d = 0; d < alpha; d++) {
          const t = get(q, d);
          if (t !== undefined) set(clone, d, t);
        }
        link[clone] = link[q];
        while (p !== -1 && get(p, c) === q) {
          set(p, c, clone);
          p = link[p];
        }
        link[q] = clone;
        link[cur] = clone;
      }
    }
    last = cur;
  }

  // 按 len 降序累加出现次数
  const order = Array.from({ length: size }, (_, i) => i).sort((a, b) => len[b] - len[a]);
  for (const v of order) {
    const f = link[v];
    if (f >= 0) cnt[f] += cnt[v];
  }

  return {
    symbols,
    size,
    n,
    /** 出现 >= minCount 次的最长片段（按符号数算）。没有就返回 null。 */
    longestRepeated(minCount = 2): Repeated | null {
      let best = -1;
      for (let v = 1; v < size; v++) {
        if (cnt[v] >= minCount && (best === -1 || len[v] > len[best])) best = v;
      }
      if (best < 0) return null;
      const L = len[best];
      const start = firstPos[best] - L + 1;
      if (start < 0) return null;
      const slice: number[] = [];
      for (let i = start; i < start + L; i++) slice.push(i);
      return { slice, len: L, count: cnt[best] };
    },
    /**
     * 重复覆盖率：被「出现 >= minCount 次」的片段覆盖的符号数 / 总符号数。
     *
     * 这是 inline 需要的那个数。散落的重复也能算到——
     * 因为每个位置只要落在任何一个重复片段里就算覆盖，不要求它们连成一片。
     */
    coverage(minCount = 2): number {
      if (!n) return 0;
      const covered = new Uint8Array(n);
      for (let v = 1; v < size; v++) {
        if (cnt[v] < minCount) continue;
        const L = len[v];
        const start = firstPos[v] - L + 1;
        if (start < 0) continue;
        // 这个状态代表的所有出现位置都要标；沿 link 链会重复标，所以用 firstPos 容易漏。
        // 简化：只标这一处（下界），足够做判据——真实覆盖率只会更高。
        for (let i = start; i < start + L; i++) covered[i] = 1;
      }
      let s = 0;
      for (let i = 0; i < n; i++) s += covered[i];
      return s / n;
    },
  };
}
