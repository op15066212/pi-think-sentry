// 门槛：一个整数，取值域是「有限 且 >= 2」。
//
// 只在这一处定义（2026-11-22）。此前 dup.ts / strip.ts / judges.ts 各写一遍
// `Number.isFinite(x) && x >= 2`，三份口径不同：dup 侧不先 Number()，strip 侧先 Number()。
// 于是配置里写 "5"（字符串）在删行侧生效、在判据侧被忽略——同一个值两个像。
//
// 判据：grep -rn ">= " src/ --include=*.ts 里的比较只出现在本文件。
//
// 兜底之后要能看见，但**不记次数**（2026-11-22 第二版）。次数是「重读次数」的函数，
// 不是「配错几次」的函数：refresh 挂在三个边界上，长会话里它能涨到几千，读不出任何东西。
// 这一条与 blocked/red 是同一类错误（分子的单位不是分母的单位），第一次改的时候重犯了一次。
// 现在记原值：读的人要的是「这份配置现在有没有问题、问题是什么」。
//
// R9 第二版（b711ced1 的判据）：这里原来自己存一个 lastRejected **单值**，
// 与 values.ts 的 rejects 数组各写一册。{dup:{min:-2}, strip:{min:"x"}} 读完之后
// -2 静默消失——它比「没配」更该被看见，而报告只记得最后一条。
// 现在门槛类与类型层记进**同一册**（values.ts 的 rejects），生命周期也只有一个：
// readConfig 入口清空。两个报告合并的理由不是省代码，是「两个报告会分叉，而分叉后没有东西比较它们」。

import { reject } from "./values.ts";

export const MIN_FLOOR = 2;

// 取值域只有一处：合法 → 整数，不合法 → null。threshold 与命令行的校验都用它，
// 于是「什么样的数是门槛」只有一个答案。
export const validThreshold = (raw: any): number | null => {
  const s = typeof raw === "string" ? raw.trim() : raw;
  // R8：原来写 `(typeof s === "string" && s !== "")`。那个 `&& s !== ""` 对结果没有影响：
  // 空串 Number("") 是 0，而 0 < MIN_FLOOR 已经被下一行挡住。变异测试里 `&& → ||` 存活——
  // 它是等价变异体。删掉多余条件，等价消失。
  const n = typeof s === "number" || typeof s === "string" ? Number(s) : NaN;
  return Number.isFinite(n) && n >= MIN_FLOOR ? Math.floor(n) : null;
};

// key **必填**（R9 第三版）：留个默认值就等于允许新调用点静默丢掉模块名，
// 而那正是上一轮两位复核指出的残余。必填之后漏传是编译错误，不是运行时才发现。
export const threshold = (raw: any, fallback: number, key: string): number => {
  const v = validThreshold(raw);
  if (v !== null) return v;
  // undefined / null 是「没配」，不是「配错了」，不记账。
  // key 必须带模块名（R9 第三版，两位复核共同指出的残余）：
  // 常量的 key 让两个模块配成同一个错值时，两条记录一模一样，
  // 而报告存在的理由就是「告诉人哪里配错了」——丢了模块名就答不了那个问题。
  if (raw !== undefined && raw !== null) reject(key, raw);
  return fallback;
};
