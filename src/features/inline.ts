import { INLINE_MIN } from "../judges.ts";
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
    const on = asBool(true, r.on, "inline.on");
    const min = threshold(r.min, INLINE_MIN, "inline.min");
    return { on, min };
  },
};
