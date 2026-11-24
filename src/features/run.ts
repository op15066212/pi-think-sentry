// run —— 整体判据：整段思考里最长的那条重复有多长。
//
// 与 dup / inline 的差别是**粒度**，不是阈值：
//   dup 先按行切，再数某一行出现几次 —— 重复不是整行时看不见；
//   inline 先按句切，再数种类占比 —— 是平均值，长文本会稀释；
//   run 不切分：LZ77 一次扫完全文，取最长的那条匹配。
// 它答的问题是「这段文本里，最长的一段自我重复有多长」，与文本总长无关。
//
// 实测（bin/longest-run-probe.mjs）：
//   31 行「做。」   89      夹 9 个「做。」  15      变形重复  14
//   正常散文          0      长正常文 200 字    3
// 退化 14~89，正常 0~3，门槛 12 落在空档里。
//
// 默认关闭：它是新判据，与 dup/inline 并行跑一段时间，用真实数据决定谁留下。
// 打开：/think-sentry run on

import { threshold } from "../threshold.ts";
import { asBool } from "../values.ts";
import { defaultsOf } from "../defaults.ts";
import { lz77 } from "../algo/lz77.ts";

/** 判据本体，纯函数：给文本与门槛，返回最长重复长度与是否越线。 */
export const longestRun = (text: string, minLen: number) => {
  const r = lz77(String(text || ""));
  return { len: r.longest, over: r.longest >= minLen, matches: r.matches, deduped: r.deduped };
};

export default {
  name: "run",
  defaults: defaultsOf("run"),
  configure(raw: any) {
    const r = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const on = asBool(false, r.on, "run.on");
    // minLen：最长重复达到多少字符算卡住。12 是实测空档的下沿——
    // 正常文本实测最长 3，退化最短 14，12 离两边各留一段余量。
    const minLen = threshold(r.minLen, 12, "run.minLen");
    return { on, minLen };
  },
};
