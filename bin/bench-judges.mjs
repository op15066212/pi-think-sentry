#!/usr/bin/env node
// bench-judges.mjs —— judgeThinking 的耗时（Ax4 有界：这一步每帧都跑）。
//
// 为什么需要它：message_update 是流式的，一段 8000 字的思考来 50-60 帧，
// 每帧都把「到这一帧为止的全部文本」判一次。单次 1ms 就是每轮 60ms。
// 这不是可以靠"感觉还行"带过的量。
//
// 跑法：node --experimental-strip-types bin/bench-judges.mjs
// 不设阈值：耗时随机器变，卡一个绝对值会把"换台慢机"判成回归。
// 用途是优化前后对比，以及给 README 里的数字一个能复现的来源。
//
// 2026-11-25 这一轮的三处改动（每一项都先实测再改）：
//   一 exciseInjected 每帧重建 Aho-Corasick 自动机 -> 按 pats 内容缓存
//   二 exciseInjected 加首字符预筛：真实思考几乎不含「[」，直接跳过整次扫描
//   三 langOn 的 countCjk + countLat 两个正则各扫全文 -> 一次 charCodeAt 循环
//      （中间试过合并成一个 matchAll，实测比原来慢 3 倍，见 _bench-count 的结论）
import { judgeThinking, judgeCfg } from "../src/judges.ts";

const unit = "这一行是正常的思考内容，长度大约二十几个汉字。";
const normal = (n) => Array.from({ length: n }, (_, i) => "第" + i + "：" + unit).join("\n");
const degen = (n) => Array.from({ length: n }, () => "做。").join("\n");

const cfg = judgeCfg({});
const R = 200;

const per = (text) => {
  judgeThinking(text, cfg); judgeThinking(text, cfg);
  const t0 = performance.now();
  for (let i = 0; i < R; i++) judgeThinking(text, cfg);
  return (performance.now() - t0) / R;
};

console.log("单次 judgeThinking（文本 n 字，重复 " + R + " 次取均）");
for (const n of [20, 100, 400]) {
  const t = normal(n);
  console.log("  正常 " + String(t.length).padStart(6) + " 字   " + per(t).toFixed(4).padStart(8) + " ms");
}
for (const n of [100, 400]) {
  const t = degen(n);
  console.log("  退化 " + String(n).padStart(6) + " 行   " + per(t).toFixed(4).padStart(8) + " ms");
}

// 流式总开销：pi 真实的调用方式。切帧后每帧拿「到这一帧为止的全量」判一次。
console.log("");
console.log("流式一轮（切成 59 帧，每帧判全量）");
for (const total of [2000, 8000, 20000]) {
  const text = normal(Math.ceil(total / unit.length)).slice(0, total);
  const step = Math.max(1, Math.ceil(text.length / 59));
  const t0 = performance.now();
  for (let cut = step; cut <= text.length; cut += step) judgeThinking(text.slice(0, cut), cfg);
  console.log("  文本 " + String(text.length).padStart(6) + " 字   总 " + (performance.now() - t0).toFixed(2).padStart(7) + " ms");
}
