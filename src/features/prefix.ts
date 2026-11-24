// prefix —— 第四种退化形状：行首前缀的机械重复。
//
// 为什么前面三条都抓不到（2026-11-24，用户从截图指出）：
//   截图那段每行以「务实：」开头，有的还是「务实：务实：」双层。
//   dup    按整行计数 —— 每行内容都不同，抓不到。
//   inline 按句子种类 —— 句子种类很多，抓不到。
//   run    按最长连续重复 —— 公共部分只有三个字，远低于 12。
//   实测四条判据在同一段文本上的结果：dup 不判 / inline 不判 / run 9 字不判 / prefix 100% 判红。
//
// 判据本体在 src/algo/prefix.ts（纯函数，能单独测）。这里只管配置，形状与 dup.ts 一致。

import { threshold } from "../threshold.ts";
import { asBool } from "../values.ts";
import { defaultsOf } from "../defaults.ts";

export default {
  name: "prefix",
  defaults: defaultsOf("prefix"),
  configure(raw: any) {
    // 兜底值一律从 defaults.ts 取，不在这里再写一份字面量。
    // 2026-11-24：两处各写一遍时，改了 defaults 忘了这里，
    // 「坏 JSON 回默认」拿到的就不是默认值，测试当场红。
    const d = defaultsOf("prefix");
    const r = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const on = asBool(d.on === true, r.on, "prefix.on");
    // min 是比例：最集中的行首前缀占到多少行就算退化。
    // 0.5 是实测分界——截图那段 100%，正常写作里最集中的前缀占 20%。
    const min = threshold(r.min, d.min, "prefix.min");
    if (min > 1) throw new Error("prefix.min 是比例，不能大于 1，实际 " + String(r.min));
    return { on, min };
  },
};
