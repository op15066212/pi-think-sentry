import { asBool } from "../values.ts";
import { defaultsOf } from "../defaults.ts";

// 工具调用前拦截：判不合格就不让这次调用执行。
// 开关关掉之后判据照样跑，只是不拦——这样计数仍能看出「判了多少次」。
export const SAY_BLOCK = (v: any) =>
  "这次工具调用没有执行。\n\n你上一次的思考里，同一行出现了 " + (v?.ev?.reps ?? "?") + " 次：\n\n" + (v?.ev?.blk || "");

export const SAY_LANG = (v: any) => {
  const n = v?.ev?.lines || "几";
  return v?.ev?.dir === "en"
    ? "这次工具调用没有执行。\n\n你上一次的思考里有" + n + "行不是英文。用英文重写这几行，然后重新调用工具。"
    : "这次工具调用没有执行。\n\n你上一次的思考里有" + n + "行不是中文。用中文重写这几行，然后重新调用工具。";
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
