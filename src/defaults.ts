// 配置的默认值：**唯一一处**。
//
// 为什么单独一个文件（2026-11-22 R8）：同一个默认值此前有三个像，各自独立演进——
//   features/intercept.ts 的 defaults.boundaryMinExempt = 3
//   features/intercept.ts 的 configure 兜底 = 3
//   judges.ts 的 BOUNDARY_MIN_EXEMPT = 3
// 三份都写 3，于是「改默认豁免门槛」要改三个地方，漏一个就分叉，而分叉之后没有任何判据能发现。
//
// 三个读者都是这个对象的投影：
//   1 写进配置文件的初始形状          features/X.ts 的 defaults
//   2 读不到时兜底                    features/X.ts 的 configure
//   3 判据的默认行为                  judges.ts 的 judgeCfg
// 它不含任何 import，所以谁都能取，不会形成环（judges 与 features 互为对方的依赖，
// 只有这个文件两边都能安全引用）。

export const DEFAULTS = {
  intercept: { on: true },
  // 2026-11-21（R13b）：3 → 4。两个复核方各给了一条独立证据：
  //   6e8dd769：会话 2026-11-18T14-10-43 上，dupMin=3 时连续 64 块同 blk「做。」判红、
  //              其中 62 块带工具调用；改成 4 后同一份数据连拦降到 15、判红 485 → 266。
  //   b711ced1：台账现取 384 次 block、「做。」221 次，按 reps 切不开两类，
  //              而 3 是本项目自己定的默认值（使用者从没指定过），改它不越界。
  // 使用者 2026-11-18 报的病例是「同一行出现了 7 次」——默认 3 比他自己记的数更严，
  // 那正是「替他把定义改强」。4 取在标记（3 次）与病例（7 次）之间。
  // 代价：整块只有三行 `做。` 的空转会漏判（台账里约 50 次），换来 64 块连拦的死锁解开。
  dup: { on: true, min: 4 },
  // 2026-11-23（实测）：「ok。ok。ok。…ok。」一行内 37 次，dup 判 none——
  // dup 按「整行」计数，同一行出现 1 次；退化发生在**一行之内**。
  // 门槛 4：真实退化段是 5 到 37 次连续，正常写作里同一句连着出现 4 次极少。
  // ratio：区间内不同句数 / 总句数 的上限。1/4 是实测分界——
  //   真退化 6%~25%，正常文本 58%~100%，中间没有样本。
  // 为什么可配：不同项目的正常写作密度不同（代码注释比散文短），写死就替使用者定了定义。
  inline: { on: true, min: 12, ratio: 0.25 },
  lang: { on: true, dir: "zh" },
  strip: { on: true, min: 4 },
  // 整体判据：整段当作一个字符串，量 3-gram 重复率。默认关闭，
  // 与 dup/inline 并行跑一段时间，用真实数据决定谁留下。
  // 整体判据：LZ77 最长匹配。默认关闭，与 dup/inline 并行跑一段时间再决定。
  run: { on: false, minLen: 12 },
  inject: { on: true, texts: { dup: "", lang: "", clean: "", inline: "" } },
  binding: { allowGateway: false },
} as const;

/** 某一模块的默认值。返回浅拷贝：调用方拿到的是自己的副本，改它不会污染这里的真值。 */
export const defaultsOf = (name: keyof typeof DEFAULTS) =>
  ({ ...DEFAULTS[name] } as Record<string, any>);
