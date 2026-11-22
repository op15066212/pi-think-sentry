import { stripDupLines } from "../cut.ts";
import { threshold } from "../threshold.ts";
import { asBool } from "../values.ts";
import { DEFAULTS, defaultsOf } from "../defaults.ts";

// 删重复行：轮末把判据已经认定的重复行删掉。
//
// 这里不自己数。判据给《哪一行重复了几次、出现在哪些行号》，这里按行号从后往前删。
// 从前删行会踩到「删了第 3 行，第 5 行变成第 4 行」的偏移；从后往前不会。
//
// 代价（有意）：dup 关掉时删行不工作。没有判据说「这些行重复了」，就没有依据删。
// 另一个代价：判据判语言错（retract）时不带行号，所以不删。语言错不是删行的理由。
// 删行门槛的默认值。它与 dup.min 是两个独立门槛（可以更严），所以不引用 DUP_MIN——
// 相同只是巧合，改一处不该牵动另一处。
const STRIP_MIN: number = DEFAULTS.strip.min;

export default {
  name: "strip",
  defaults: defaultsOf("strip"),
  configure(raw: any) {
    const r = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const on = asBool(true, r.on, "strip.on");
    const min = threshold(r.min, STRIP_MIN, "strip.min");
    return { on, min };
  },
  // v 是判据给的 Verdict；min 是 strip 自己的门槛，只在判据的记录上筛，不重新数。
  clean(content: any, v: any, min: any) {
    const source = Array.isArray(content) ? content : [];
    const floor = threshold(min, STRIP_MIN, "strip.min.clean");
    const judged = Array.isArray(v?.ev?.dups) ? v.ev.dups : [];
    const want = judged.filter((x: any) => Number(x?.[1]) >= floor && Array.isArray(x?.[2]));
    if (!want.length) return { content: source, cleaned: false };

    // 判据的行号是「所有 thinking 块用换行拼起来」的行号（index.ts 的 thinkingOf）。
    // 实测 31556 条 message 全部只有一个 thinking 块，所以这里基本是恒等；
    // 多块时按块先后折算回去，只删落在本块内的行号。
    let offset = 0;
    const out = source.flatMap((c: any) => {
      if (c?.type !== "thinking") return [c];
      const text = String(c.thinking || "");
      const n = text.split("\n").length;
      const local = [];
      for (const d of want) for (const i of d[2]) if (i >= offset && i < offset + n) local.push(i - offset);
      offset += n;
      if (!local.length) return [c];
      const next = stripDupLines(text, local);
      // 空守护：这一块删完是空的，就放一句**指针**。空 thinking 段在有些渲染路径上会显示成空白气泡。
      // 2026-11-21 R6（b711ced1 抓的）：这里原是固定句「（这一段的重复行已删除）」，
      // 它是插件自己造的句子、直接写进 thinking，模型下一轮就读到一句可抄的话——
      // 比拦截文案更危险，因为拦截文案在 toolResult 里，这句在它自己的思考里。
      // 判据：每个输出差异都要指得到一段原文区间。行号来自判据给的 local，指得到、不复制内容。
      if (!next.trim()) {
        // local 是判据给的行号，**不保证升序**（实测出现过 [6-5] 这种反向区间）。
        // 区间端点是 min/max，不是首尾。
        const lo = Math.min.apply(null, local) + 1, hi = Math.max.apply(null, local) + 1;
        return [{ ...c, thinking: "[原第 " + lo + "-" + hi + " 行共 " + local.length + " 行，全部重复已删]" }];
      }
      return [{ ...c, thinking: next }];
    });
    // 从前这里还有一条「删光且没有正文就回退原文」。空守护上线后它永远走不到：
    // 每块删空都会留一句占位（见上面），所以 out 里始终有 thinking 块，不会掏空消息。
    return { content: out, cleaned: true };
  },
};
