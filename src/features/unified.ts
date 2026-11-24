// unified —— 归一化整体判断的配置单元。
//
// 判据本体在 src/algo/unified.ts。这里只管开关与门槛，形状与 dup.ts 一致。
//
// 为什么单独一条而不是并进 shape：
//   shape 是六维投票，每一维各自有一个门槛（六个），合起来还要一个票数门槛（第七个）。
//   unified 把四个量几何平均成一个分，只有**一个**门槛。两者是同一件事的两种做法，
//   不是同一条判据的两个入口——它们对同一段文本可能给出不同判决，这正是要观察的东西。
//
// 默认关闭：先看它在真实台账上的分离度，别上来就拦。

import { threshold } from "../threshold.ts";
import { asBool } from "../values.ts";
import { defaultsOf } from "../defaults.ts";

export default {
  name: "unified",
  defaults: defaultsOf("unified"),
  configure(raw: any) {
    const r = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const on = asBool(false, r.on, "unified.on");
    // min 是分数门槛：四个量几何平均后的分低于它就算退化。
    // 0.6 出自实测间隙——退化样本 0.00 / 0.41 / 0.48，正常样本 0.80 / 0.86，中间没有样本。
    // 下限 0.05 是防「调成 0 就永不判红」这种恒假绿。
    const min = threshold(r.min, 0.6, "unified.min");
    if (min > 1) throw new Error("unified.min 是分数，不能大于 1，实际 " + String(r.min));
    if (min < 0.05) throw new Error("unified.min 太小（" + String(min) + "），门槛低于 0.05 等于永不判红");
    return { on, min };
  },
};
