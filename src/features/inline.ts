import { INLINE_MIN, INLINE_RATIO } from "../judges.ts";
import { threshold } from "../threshold.ts";
import { asBool } from "../values.ts";
import { defaultsOf } from "../defaults.ts";

// 坍缩守护（配置单元）：判据在 judges.collapseRange，处置在 features/strip.foldInline。
//
// 2026-11-23 加：此前它只是一个常量（judges.inlineMin），没有配置单元——
// 于是「关掉它」要改代码，而 dup/lang 都能在 settings.json 里关。
// 形状与 dup.ts 一致：只管配置，不兼职判据。
//
// 与 dup 的关系：dup 判「整行重复」（处置=删行），inline 判「区间内句子的唯一性」
// （处置=按行折叠）。前者是后者的特例（行重复必然坍缩），但处置不同，所以是两条判据、
// 两个开关、两个门槛。
export default {
  name: "inline",
  defaults: defaultsOf("inline"),
  configure(raw: any) {
    const r = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    // 兜底值从 defaults.ts 取，不在这里写死（2026-11-24 同一处踩了三次）。
    const d = defaultsOf("inline");
    const on = asBool(d.on === true, r.on, "inline.on");
    const min = threshold(r.min, INLINE_MIN, "inline.min");
    // ratio 是比例，不是计数：threshold() 判的是整数门槛，这里单独校验 0 < r < 1。
    // 写 1 会让任何区间都「坍缩」（含正常文本）；写 0 会让判据永不成立。
    const rr = r.ratio === undefined ? INLINE_RATIO : Number(r.ratio);
    if (!(Number.isFinite(rr) && rr > 0 && rr < 1)) {
      throw new Error("inline.ratio 必须在 (0,1) 之间，实际 " + String(r.ratio));
    }
    return { on, min, ratio: rr };
  },
};
