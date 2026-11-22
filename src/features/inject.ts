// 尾部注入：每轮思考末尾追加一段自己写的文案。
// 空字符串就是「不追加」，不会退回任何内置文案。
//
// 不另设「已经注入过就不再追加」的标记判断：turn_end 对同一条 message 只处理一次
// （index.ts 的 lastEntryId 守着），而且追加前后同一个数组的下标与长度都对得上，
// 再加一道按标记字符串的判重，只会变成「用户换了文案就静默失效」的假绿判据。
import { asBool, asObject, asText } from "../values.ts";
import { defaultsOf } from "../defaults.ts";

export default {
  name: "inject",
  // 2026-11-21 R6 签核（两位都指了）：一个模板服务三种互斥的 ev，16 格里只有 4 格有值，
  // 于是必然出现「第 ? 行起重复 ? 次」。改成每种判决一份模板，各自只引用自己有的字段。
  // 旧形状 text（单个字符串）仍然认：三份都用它，等于不改配置的人什么都不变。
  defaults: defaultsOf("inject"),
  configure(raw: any) {
    const r = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const on = asBool(true, r.on, "inject.on");
    // 旧形状 text（单个字符串）仍然认：三份都用它，等于不改配置的人什么都不变。
    const legacy = asText("", r.text, "inject.text");
    const t = asObject(r.texts, "inject.texts");
    const pick = (k: string) => (typeof t[k] === "string" ? t[k] : legacy);
    return { on, texts: { dup: pick("dup"), lang: pick("lang"), clean: pick("clean") } };
  },

  // 追加到最后一个 thinking 块的末尾；没有 thinking 块就原样返回。
  // 占位符全是**指针**：{{blockLine}} 第几行、{{blockReps}} 重复几次、{{ratio}} 中文占比、{{lines}} 非中文行数。
  // 2026-11-21 R6 之后删掉了 {{sample}}（引用原文）——引用等于把英文再复制一份进上下文，
  // 正好加重要治的病；指针指得到、不复制，两件事同时满足。
  // 为什么要占位符而不是固定文案（b711ced1 在 reviews/discuss-r5 提的）：固定文案读两遍就会被当成思路续写。
  applyWith(content: any, text: any, ev: any = {}) {
    const arr = Array.isArray(content) ? content : [];
    if (!text) return arr;
    const filled = String(text)
      // 2026-11-21 R6：删掉 {{sample}}。引用原文 = 把英文再复制一遍进上下文，正好加重要治的病。
      // 指针（第几行）指得到、不复制，两件事同时满足。
      .split("{{blockLine}}").join(String(ev?.line ?? "?"))
      .split("{{blockReps}}").join(String(ev?.reps ?? "?"))
      .split("{{ratio}}").join(String(ev?.cjkOverCjkLatin ?? "?"))
      .split("{{lines}}").join(String(ev?.lines ?? "?"));
    if (!arr.some((c) => c && c.type === "thinking")) return arr;
    const out = arr.slice();
    for (let i = out.length - 1; i >= 0; i--) {
      if (out[i] && out[i].type === "thinking") {
        const cur = String(out[i].thinking || "");
        // 幂等：末尾已经是这段文案就不再追加。2026-11-21 实测的退化是这样的——
        // 上一版按「文案里的标记行」判重，用户换掉文案后那条判据静默失效；改成按
        // 末尾判重之后，重复触发与用户改文案都不影响结果，也不需要哨兵字符串。
        // 触发路径真实存在：turn_end 的守卫是 entryKey !== "" && entryKey === lastEntryId，
        // 消息没有 entryId 时守卫整段失效，同一条消息被处理两次就会叠加两遍。
        if (cur.endsWith(filled)) return arr;
        out[i] = { ...out[i], thinking: cur + filled };
        return out;
      }
    }
    return arr;
  },
};
