// 用截图里那段文本验证：现有三条判据抓得到吗，新的前缀判据统计出什么。
//
// 样本来自用户 2026-11-24 的截图（pideck pr 会话），每行以「务实：」开头，
// 有些还是「务实：务实：」双层。
import { dupIn, judgeThinking, partitionLines, voteOf } from "../src/judges.ts";
import { lz77 } from "../src/algo/lz77.ts";
import { prefixStats } from "../src/algo/prefix.ts";

const SAMPLE = [
  "务实：关键洞察：我上一轮把 resolveAnchoredTurnWindow 改成「锚点在但没命中 → 返回 items 全量」——这就是卡的原因！全量渲染 722 轮。",
  "务实：这是我的改动引入的性能灾难。",
  "务实：务实：必须改掉：锚点未命中不能返回全量。",
  "务实：正确做法：锚点未命中 → 用索引里的位置兜底选窗口，而不是全量也不是尾部。",
  "务实：务实：但渲染层没有索引位置。",
  "务实：更根本：用户问「就不能只加载可视范围内的吗」——说明渲染层没有虚拟化（722 轮全在 DOM）。",
  "务实：务实：resolveAnchoredTurnWindow 返回 items（全量）→ 组件渲染全部 → 卡死。",
  "务实：修法两步：",
  "务实：1. 回滚「返回全量」→ 改成「锚点未命中时保持上一次的窗口」或「用锚点位置附近的轮」",
  "务实：2. 虚拟化：只挂载视口内的轮",
  "务实：务实：第 1 步立刻做（性能灾难）。",
  "务实：务实：第 2 步：查现有虚拟化机制（TIMELINE_MOUNTED_TURN_LIMIT）。",
  "务实：务实：现有机制是「窗口 = 最近 N 轮」，N=3（贴底）或 scrolledWindowTurns。",
  "务实：所以「只加载可视范围」已经存在，但被我的「返回全量」破坏了。",
  "务实：务实：先修 bug ①（回滚全量），再验证。",
  "务实：至于「跳转不到 100-300 行」—— 那是 positioned（26% 概率）或锚点问题。",
  "务实：更好的架构：锚点未命中时，用 pos（主进程已算好）直接选窗口，而不是靠 entryId 匹配。",
  "务实：务实：把 resolveEntryPosition 的结果传回渲染层，用它切片。",
].join("\n");

const normal = [
  "先看配置文件的默认值，确认三个门槛各自写在哪里。",
  "然后核对磁盘上的实际配置，看有没有人手工改过。",
  "如果两边不一致，说明改过之后没同步，要查是哪一次改动。",
  "最后跑一遍判据，确认改完之后行为没变。",
  "结论写进 HISTORY，不写进代码注释——注释会被下次重构删掉。",
].join("\n");

const report = (label, t) => {
  const d = dupIn(voteOf(partitionLines(t)), 4);
  const i = judgeThinking(t, { dupOn: false, inlineOn: true, langOn: false, runOn: false });
  const r = lz77(t);
  const p = prefixStats(t);
  console.log("=== " + label + " ===");
  console.log("  dup      " + (d && d.length ? "判红（" + d.length + " 种行重复）" : "不判"));
  console.log("  inline   " + (i.kind !== "none" ? "判红：" + i.ev?.why : "不判"));
  console.log("  run      最长自然语言重复 " + r.longestNatural + " 字（门槛 12）" + (r.longestNatural >= 12 ? " → 判红" : " → 不判"));
  console.log("  prefix   行数 " + p.n + "，最常见前缀「" + p.top + "」占 " + (p.topShare * 100).toFixed(0) + "%" + (p.repeated ? " → 判红" : " → 不判"));
  console.log("           前三个：" + p.top3.map((x) => x.prefix + " " + (x.share * 100).toFixed(0) + "%").join(" / "));
  console.log("");
};

report("截图里的退化段（务实：前缀）", SAMPLE);
report("正常思考（对照）", normal);
