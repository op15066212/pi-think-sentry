// LZ77 解析：整段文本一次扫完，给出「哪些片段可以指着前面说」。
//
// 为什么需要它（2026-11-24，k-gram 被实测否决之后）：
// k-gram 比是**平均值**，长文本里夹九次「做。」会被正常内容稀释到 0.6 以上，
// 判据就漏了——而那种形状正是要抓的。LZ77 省的是**绝对字节**，不受稀释影响。
//
// 输出三样，都在一次解析里得到：
//   matches  —— [{dist, len}] 每个匹配引用的距离与长度
//   saved    —— Σ(len - 编码开销)，即这段文本「有多少是重复的」
//   coverage —— saved / 原长，越过阈值就判红
//
// 窗口 4096、最小匹配 3：与 zlib 的默认口径接近，短匹配不值得编码。
// 哈希链而不是后缀数组：一段思考通常几千字符，哈希链足够快，实现短一半。

const WIN = 4096;
const MIN_MATCH = 3;
const HASH_BITS = 15;
const HASH_SIZE = 1 << HASH_BITS;

const hash3 = (s, i) =>
  ((s.charCodeAt(i) << 10) ^ (s.charCodeAt(i + 1) << 5) ^ s.charCodeAt(i + 2)) & (HASH_SIZE - 1);

/**
 * 解析一段文本。返回匹配列表与节省量。
 * 只用字符码，不做编码转换——中文在这里按 UTF-16 码元算，对「重复」没影响。
 */
export function lz77(text) {
  const n = text.length;
  if (n < MIN_MATCH * 2) return { matches: [], saved: 0, coverage: 0, original: n };

  const head = new Int32Array(HASH_SIZE).fill(-1);
  const prev = new Int32Array(n).fill(-1);
  const matches = [];
  let saved = 0;
  let i = 0;

  while (i + MIN_MATCH <= n) {
    const h = hash3(text, i);
    let j = head[h];
    let bestLen = 0;
    let bestDist = 0;

    let probes = 0;
    while (j >= 0 && i - j <= WIN && probes++ < 64) {
      let l = 0;
      while (i + l < n && text[j + l] === text[i + l] && l < 258) l++;
      if (l > bestLen) {
        bestLen = l;
        bestDist = i - j;
        if (l >= 258) break;
      }
      j = prev[j];
    }

    if (bestLen >= MIN_MATCH) {
      matches.push({ dist: bestDist, len: bestLen });
      saved += Math.max(0, bestLen - 4);
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

  return { matches, saved, coverage: n ? saved / n : 0, original: n };
}

const CASES = [
  ["31 行「做。」", Array.from({ length: 31 }, () => "做。").join("\n")],
  ["正常散文", "读完配置后我把三个阈值都记下来，然后逐条核对它们是不是写在同一个文件里。阈值分别在 defaults 与 config 两处声明，读的时候后者覆盖前者。"],
  ["夹 9 个（加长版）", ["第一步读取配置文件，确认两个门槛写在同一个文件里，并且确认它们的默认值出处。", "做。", "做。", "做。", "做。", "做。", "第二步核对台账，看最近判红的样本是不是同一份思考，还是分散在不同轮次上。", "做。", "做。", "做。", "做。", "第三步再决定要不要改阈值，改之前先问原来的值是怎么定下来的。"].join("\n")],
  ["夹 9 个（短版）", ["第一步读取配置文件。", "做。", "做。", "做。", "做。", "做。", "第二步核对台账。", "做。", "做。", "做。", "做。", "第三步再决定。"].join("\n")],
  ["变形重复", "先看台账确认最近的判红集中在同一份思考上，如果是说明计数把流式帧当成了次数。先查台账确认最近的判红都集中在同一份思考里，若是的话，说明计数把流式帧当成了次数。"],
  ["完全孤立", "甲一乙二丙三丁四戊五己六庚七辛八"],
];

if (process.argv[2] === "--run") {
  console.log("样本".padEnd(24) + "字节".padStart(6) + "匹配".padStart(6) + "省".padStart(6) + "覆盖率".padStart(9));
  for (const [name, text] of CASES) {
    const r = lz77(text);
    console.log(name.padEnd(24) + String(text.length).padStart(6) + String(r.matches.length).padStart(6) + String(r.saved).padStart(6) + r.coverage.toFixed(3).padStart(9));
  }
}
