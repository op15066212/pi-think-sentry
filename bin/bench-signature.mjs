// 清签名这一步每轮都要扫一遍全量历史，所以它本身也得有数（Ax4 有界）。
//
// 2026-11-25 上午实测（这台机器，R=50 次取均）：
//   200 条 0.07–0.09ms · 2000 条 0.28–0.32ms · 10000 条 0.97–1.02ms · 26000 条 2.6–3.0ms
// 同日晚（09:05Z）复测同一份代码：26000 条 1.8–2.4ms，比上午低。
// 代码没变，机器负载变了——所以只写区间并标注时刻，不写单值当"真值"。
// 同一天改成单遍扫描 + 提前终止之前是 0.105 / 0.444 / 1.360 / 5.107 ms（固定值，未抖动）。
// 区间是两次连跑的差；写区间不写单值，因为这台机器上 26000 条一次能差 0.4ms。
//
// 不设阈值：耗时随机器变，卡一个绝对值会把「换了台慢机」判成回归。
// 用途是优化前后对比，跑法 node --experimental-strip-types bin/bench-signature.mjs
import { planSignatureCleanup, planSignatureCleanupIncremental } from "../src/algo/signature.ts";

const asst = (i) => ({ id: "a" + i, type: "message", message: { role: "assistant", content: [{ type: "thinking", thinking: "t" + i, thinkingSignature: "sig" }] } });
const user = (i) => ({ id: "u" + i, type: "message", message: { role: "user", content: [{ type: "text", text: "q" }] } });
function mk(n) { const out = []; for (let i = 0; i < n; i++) { out.push(user(i)); out.push(asst(i)); } return out; }

for (const n of [100, 1000, 5000, 13000]) {
  const entries = mk(n);
  planSignatureCleanup(entries, 30); // 热身
  const R = 50;
  const t0 = performance.now();
  let last = null;
  for (let r = 0; r < R; r++) last = planSignatureCleanup(entries, 30);
  const t1 = performance.now();
  console.log("entries " + (n * 2) + " 条，单次 " + ((t1 - t0) / R).toFixed(3) + " ms，产出 " + last.length + " 条 edit");
}

// 增量：上面那几行是「首轮」（等价全量），下面这两行是「之后每一轮」。
// 为什么必须测：幂等修好后第二轮起产出恒为 0，全量扫就成了纯白扫——
// 光看全量的数看不出这件事，因为它每轮都一样。
console.log("--- 增量 ---");
for (const n of [1000, 13000]) {
  const entries = mk(n);
  const R = 50;
  let t0 = performance.now();
  for (let r = 0; r < R; r++) planSignatureCleanupIncremental(entries, 30, { boundary: 0 });
  let t1 = performance.now();
  console.log("首轮   " + (n * 2) + " 条，单次 " + ((t1 - t0) / R).toFixed(4) + " ms");

  const done = planSignatureCleanupIncremental(entries, 30, { boundary: 0 }).state;
  t0 = performance.now();
  for (let r = 0; r < R; r++) planSignatureCleanupIncremental(entries, 30, done);
  t1 = performance.now();
  console.log("稳态   " + (n * 2) + " 条，单次 " + ((t1 - t0) / R).toFixed(4) + " ms   （水位不动，没有新东西要清）");

  const grown = entries.concat([asst(n + 5000)]);
  t0 = performance.now();
  for (let r = 0; r < R; r++) planSignatureCleanupIncremental(grown, 30, done);
  t1 = performance.now();
  console.log("每轮+1 " + (n * 2 + 1) + " 条，单次 " + ((t1 - t0) / R).toFixed(4) + " ms");
}
