import { asBool } from "../values.ts";
import { defaultsOf } from "../defaults.ts";

// 工具调用前拦截：判不合格就不让这次调用执行。
// 开关关掉之后判据照样跑，只是不拦——这样计数仍能看出「判了多少次」。
// 两行（2026-11-23）：原来四行带空行，每行都进上下文。留最短的可核对信息——
// 次数是给模型的指针，块本身一眼就能看见，不必再抄一遍。
export const SAY_BLOCK = (v: any) =>
  "没执行：思考里「" + String(v?.ev?.blk || "").slice(0, 30) + "」重复 " + (v?.ev?.reps ?? "?") + " 次。改掉再调。";

export const SAY_LANG = (v: any) => {
  const n = v?.ev?.lines || "几";
  return "没执行：思考里 " + n + " 行不是" + (v?.ev?.dir === "en" ? "英文" : "中文") + "。改掉再调。";
};

export default {
  name: "intercept",
  // R12：只留一个开关。boundaryMinExempt 随边界判据一起删了——那个判据是防御，不是使用者要的。
  defaults: defaultsOf("intercept"),
  configure(raw: any) {
    const r = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    return { on: asBool(true, r.on, "intercept.on") };
  },
  // 没有判红、或开关关掉，都返回 null 表示放行。
  reason(v: any, on: any) {
    if (!on || !v || v.kind === "none") return null;
    return v.kind === "retract" ? SAY_LANG(v) : SAY_BLOCK(v);
  },
};
