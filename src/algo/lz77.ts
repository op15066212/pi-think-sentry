// LZ77 解析：把一段文本压成「字面量 + 指回前面的匹配」序列。
//
// 这是整体处理的底座：一次扫完全文，不切分、不按行、不按句。
// 出来的 match 列表就是「哪些片段在重复、重复了多长、指回多远」——
// 退化检测、去重、压缩、防回灌扣除，全部从这一份结果派生，不再各算一遍。
//
// 参数取 zlib 的口径：窗口 4096、最小匹配 3、最长匹配 258。
// 哈希链而不是后缀数组：一段思考几千字符，哈希链够快且实现短一半。
// 链上探 64 个候选后放弃：再多收益递减，最坏情况会退化成 O(n²)。

export const WIN = 4096;
export const MIN_MATCH = 3;
export const MAX_MATCH = 258;

const HASH_BITS = 15;
const HASH_SIZE = 1 << HASH_BITS;
const MAX_PROBES = 64;

const hash3 = (s: string, i: number) =>
  ((s.charCodeAt(i) << 10) ^ (s.charCodeAt(i + 1) << 5) ^ s.charCodeAt(i + 2)) & (HASH_SIZE - 1);

export type Match = { at: number; dist: number; len: number };

export type Lz = {
  /** 每个匹配：指回多远、多长。 */
  matches: Match[];
  /** 最长的那个匹配有多长。退化的核心度量。 */
  longest: number;
  /** 字面量总长（没被任何匹配覆盖的部分）。 */
  literal: number;
  /**
   * 去重结果：只保留每条重复的第一次出现，其余折叠成标记。
   * 与 compress 同源，但输出是给人看的文本，不是字节流。
   */
  deduped: string;
};

/**
 * 解析一段文本。只用字符码，不做编码转换——对「重复」的判断没影响。
 * 不改输入，不读文件，不写文件：纯函数。
 */
export function lz77(text: string): Lz {
  const n = text.length;
  if (n < MIN_MATCH * 2) {
    return { matches: [], longest: 0, literal: n, deduped: text };
  }

  const head = new Int32Array(HASH_SIZE).fill(-1);
  const prev = new Int32Array(n).fill(-1);
  const matches: Match[] = [];
  let longest = 0;
  let covered = 0;
  let i = 0;

  while (i + MIN_MATCH <= n) {
    const h = hash3(text, i);
    let j = head[h];
    let bestLen = 0;
    let matchStart = -1;

    let probes = 0;
    while (j >= 0 && i - j <= WIN && probes++ < MAX_PROBES) {
      let l = 0;
      while (i + l < n && text[j + l] === text[i + l] && l < MAX_MATCH) l++;
      if (l > bestLen) {
        bestLen = l;
        matchStart = j;
        if (l >= MAX_MATCH) break;
      }
      j = prev[j];
    }

    if (bestLen >= MIN_MATCH) {
      matches.push({ at: i, dist: i - matchStart, len: bestLen });
      if (bestLen > longest) longest = bestLen;
      covered += bestLen;
      // 匹配区间里每个位置都进表，否则后面的匹配找不到更近的引用
      for (let k = 0; k < bestLen; k++) {
        const p = i + k;
        if (p + MIN_MATCH <= n) {
          const hh = hash3(text, p);
          prev[p] = head[hh];
          head[hh] = p;
        }
      }
      i += bestLen;
    } else {
      prev[i] = head[h];
      head[h] = i;
      i++;
    }
  }

  return { matches, longest, literal: n - covered, deduped: dedupeByMatches(text, matches) };
}

/**
 * 按匹配列表去重：每条重复只留第一次出现，其余替换成 `〔重复 N 字〕`。
 * 与 lz77 同一个 pass 的产物推出来的，所以「判出来」和「改出来」用的是同一份证据。
 */
function dedupeByMatches(text: string, matches: Match[]): string {
  if (!matches.length) return text;
  const out: string[] = [];
  let last = 0;
  // matches 是按起点递增的（扫描从左往右），所以一遍就够，不用排序也不用重扫。
  for (const m of matches) {
    if (m.at < last) continue; // 落在上一段匹配里，跳过
    out.push(text.slice(last, m.at));
    out.push('〔重复 ' + m.len + ' 字〕');
    last = m.at + m.len;
  }
  out.push(text.slice(last));
  return out.join('');
}
