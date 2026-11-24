// probe-kgram.mjs —— 整体度量的探针：k-gram 重复率 + 最长重复子串。
//
// 存在理由（2026-11-24，用户问「换成纯算法，把思维链看成整体」）：
// 现有判据是局部的：dup 数「同一行出现几次」，inline 数「一段里几种句子」。
// 重复其实发生在**子串**上——一段十行里第三到第七行是同一段话的变形，dup 一行都数不出来。
//
// 这里放两件整体度量，都能在整段文本上一次算完：
//
// 一 k-gram 重复率 = 不同 k-gram 数 / 总 k-gram 数
//    压缩的可计算代理。实测（2026-11-24）三档分得开：
//      31 行「做。」      0.033
//      夹 9 个「做。」     0.519
//      正常散文 / 孤立行   1.000
//    k 固定为 3：再小中文虚词就撞车，再大短重复抓不住。
//
// 二 后缀自动机找最长重复子串 O(n)
//    能直接说出「重复的是哪一段、多长、几次」，这句是人能核对的话。
//    注意：最长的那条通常只出现 2 次（长度 88 的子串在 92 字节里只能放两个位置），
//    所以判重复要看 k-gram 比，看定位才用这一条。
//
// 这个文件只做探针，不改判据。要不要接进 judges.ts 由数据决定，不由偏好决定。
//
// 用法：
//   node bin/probe-kgram.mjs                 跑内置样本
//   node bin/probe-kgram.mjs <文件>           跑一个文件
//   echo "文本" | node bin/probe-kgram.mjs -  从 stdin 读

import fs from 'node:fs';

/** 不同 k-gram 占全部 k-gram 的比例。1 = 全是新片段，越小重复越多。 */
export const kgramRatio = (text, k = 3) => {
  if (text.length < k) return 1;
  const seen = new Set();
  let total = 0;
  for (let i = 0; i + k <= text.length; i++) {
    seen.add(text.slice(i, i + k));
    total++;
  }
  return seen.size / total;
};

/** 后缀自动机：返回出现次数 >= minUses 的最长子串。O(n) 建，O(n·L) 取样本。 */
export const longestRepeat = (text, minUses = 2) => {
  const n = text.length;
  if (n < 2) return { text: '', uses: 0, len: 0 };

  const maxN = 2 * n + 5;
  const next = new Map();
  const link = new Int32Array(maxN).fill(-1);
  const len = new Int32Array(maxN);
  const cnt = new Int32Array(maxN);
  let last = 0;
  let size = 1;
  next.set(0, new Map());

  const newState = (l) => {
    len[size] = l;
    next.set(size, new Map());
    return size++;
  };

  for (let i = 0; i < n; i++) {
    const c = text[i];
    const cur = newState(len[last] + 1);
    cnt[cur] = 1;
    let p = last;
    while (p !== -1 && !next.get(p).has(c)) {
      next.get(p).set(c, cur);
      p = link[p];
    }
    if (p === -1) {
      link[cur] = 0;
    } else {
      const q = next.get(p).get(c);
      if (len[p] + 1 === len[q]) {
        link[cur] = q;
      } else {
        const clone = newState(len[p] + 1);
        next.set(clone, new Map(next.get(q)));
        link[clone] = link[q];
        while (p !== -1 && next.get(p).get(c) === q) {
          next.get(p).set(c, clone);
          p = link[p];
        }
        link[q] = clone;
        link[cur] = clone;
      }
    }
    last = cur;
  }

  const order = Array.from({ length: size }, (_, i) => i).sort((a, b) => len[b] - len[a]);
  for (const v of order) {
    if (link[v] >= 0) cnt[link[v]] += cnt[v];
  }

  let best = 0;
  for (let v = 1; v < size; v++) {
    if (cnt[v] >= minUses && len[v] > len[best]) best = v;
  }
  if (!best) return { text: '', uses: 0, len: 0 };

  const L = len[best];
  for (let start = 0; start + L <= n; start++) {
    const sub = text.slice(start, start + L);
    let uses = 0;
    for (let j = 0; j + L <= n; j++) if (text.slice(j, j + L) === sub) uses++;
    if (uses >= minUses) return { text: sub, uses, len: L };
  }
  return { text: '', uses: 0, len: 0 };
};

const show = (name, text) => {
  const kr = kgramRatio(text, 3);
  const lr = longestRepeat(text, 2);
  const where = lr.len ? `「${lr.text.slice(0, 14).replace(/\n/g, '⏎')}」长${lr.len}x${lr.uses}` : '无';
  console.log(name.padEnd(22) + String(text.length).padStart(6) + kr.toFixed(3).padStart(9) + '  ' + where);
};

const arg = process.argv[2];
if (arg === '-') {
  show('stdin', fs.readFileSync(0, 'utf8'));
} else if (arg) {
  show(arg.replace(/^.*[\\/]/, ''), fs.readFileSync(arg, 'utf8'));
} else {
  console.log('样本'.padEnd(22) + '字节'.padStart(6) + '3gram比'.padStart(9) + '  最长重复');
  show('31 行「做。」', Array.from({ length: 31 }, () => '做。').join('\n'));
  show('正常散文', '读完配置后我把三个阈值都记下来，然后逐条核对它们是不是写在同一个文件里。\n阈值分别在 defaults 与 config 两处声明，读的时候后者覆盖前者。');
  show('夹 9 个「做。」', ['第一步读取配置文件。', '做。', '做。', '做。', '做。', '做。', '第二步核对台账。', '做。', '做。', '做。', '做。', '第三步再决定。'].join('\n'));
  show('完全孤立六行', '甲一乙二丙三丁四戊五己六');
}
