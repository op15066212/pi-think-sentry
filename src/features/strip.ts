import { lz77 } from "../algo/lz77.ts";
import { stripDupLines } from "../cut.ts";
import { threshold } from "../threshold.ts";
import { asBool } from "../values.ts";
import { DEFAULTS, defaultsOf } from "../defaults.ts";
import { assertNever } from "../verdict.ts";

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

// 句内重复的处置：**折叠，不删行**。
//
// 为什么不能删行：dup 的重复单位是「整行」，删了不损失别的内容；
// inline 的重复发生在**一行之内**——那一行里还有正常内容（「verify-all PASS，现在跑 X」），
// 整行删会把有效信息一起删掉。所以只能在行内把连续重复的那几句折成一个可数的指针。
//
// 指针为什么带数字：模型下一轮会读到这个折叠标记。`[ok。 ×13]` 是**可核对的事实**
// （13 次），不像原始退化文本那样可以无限自我强化。它可数、不可再复制。
/**
 * 整体去重：对每个 thinking 块跑一次 LZ77，把重复段折成可数的指针。
 *
 * 与 foldInline 的分工：
 *   foldInline 要行号（判据告诉它「第几行起了哪些重复」），只在行内折叠；
 *   dedupByLz 不要行号——它自己扫一遍就知道哪里重复，因为 run 判据本来就是那么判的。
 * 两者都留：dup/inline 判出来的重复位置是行/句级的，比 LZ 更准；
 * run 判出来的只有长度，没有位置，所以用 LZ 自己的解析。
 */
function dedupByLz(source: any[], floor: number) {
  let touched = 0;
  const out = source.map((b: any) => {
    if (!b || b.type !== "thinking" || typeof b.thinking !== "string") return b;
    const r = lz77(b.thinking);
    if (r.longest < floor) return b;
    if (r.deduped === b.thinking) return b;
    touched++;
    return { ...b, thinking: r.deduped };
  });
  // 与 foldInline / stripDupLines 同一个返回契约：{ content, cleaned }。
  // cleaned 是数字不是布尔——上层用它决定「说没说处置过」，0 与 false 的区分在这儿。
  return { content: touched ? out : source, cleaned: touched };
}

function foldInline(source: any[], v: any, floor: number) {
  const ev = v?.ev || {};
  const lineFrom = Number(ev.line);
  const lineTo = Number(ev.lineTo ?? ev.line);
  const len = Number(ev.len);
  const unique = Number(ev.unique);
  if (!Number.isFinite(lineFrom) || !Number.isFinite(lineTo) || lineFrom < 1 || lineTo < lineFrom) {
    return { content: source, cleaned: false };
  }
  if (!Number.isFinite(len) || len < floor) return { content: source, cleaned: false };

  // 按**行区间**折叠，不按句子正则。
  // 为什么（2026-11-23 第三次）：坍缩是「多行、每行不同、整体只有几种」，
  // 用第一句做正则会误删区间外出现的同一句，而区间内其余行原样留着——等于没治。
  // 行号来自判据（ev.line / ev.lineTo），指得到原文，不复制内容。
  const mark = "[" + len + " 句、共 " + lineFrom + "-" + lineTo + " 行坍缩成 " + unique + " 种，已折叠]";

  let offset = 0;
  let touched = false;
  const out = source.flatMap((c: any) => {
    if (c?.type !== "thinking") return [c];
    const lines = String(c.thinking || "").split("\n");
    const n = lines.length;
    const lo = Math.max(0, lineFrom - 1 - offset);
    const hi = Math.min(n - 1, lineTo - 1 - offset);
    offset += n;
    if (hi < lo) return [c];
    // 区间外的行原样保留，区间内的行合并成一句标记（保留区间前后的正常内容）
    const before = lines.slice(0, lo);
    const after = lines.slice(hi + 1);
    touched = true;
    return [{ ...c, thinking: [...before, mark, ...after].join("\n") }];
  });
  return { content: out, cleaned: touched };
}

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
    // 按构造子分派，不按 rule：strip 与 fold 是两个动作（整行删 / 行内折叠）。
    // 这里用 switch 而不是 if，是为了让 tsc 查穷尽——将来加第五种构造子，
    // 漏改这里会在编译期报 `never` 不可赋值。
    switch (v?.kind) {
      case "fold":
        // run 判据的 ev 没有行号：它判的是「最长的一条重复有多长」，不是「哪一行重复了」。
        // 所以不能走 foldInline（那需要行号），改用 LZ 自己的去重结果——
        // 与判定同源：判出「最长的匹配」和「把匹配折掉」用的是同一次解析，不是两套逻辑。
        if (v?.rule === "run") return dedupByLz(source, floor);
        return foldInline(source, v, floor);
      case "strip":
        break;
      case "retract":
      case "none":
      case undefined:
        break;
      default:
        return assertNever(v.kind as never);
    }
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
