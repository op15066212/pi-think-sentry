// signature —— 清理 thinkingSignature，只保留最近几个大轮。
//
// 用户 2026-11-24 要的：
//   「每一个大轮完成，thinkingSignature 清理签名。这个也配置文件化。
//    可以选近几个大轮，是否启用它。」
//
// 为什么会有这个东西：
//   会话 jsonl 里每个 thinking 块都带 thinkingSignature。pi 的一个会话里实测 2501 次，
//   值多是 "reasoning_content"（来源标记），Anthropic 系则是长 base64（真签名）。
//   历史轮次的签名对后续请求没有用，但一直躺在上下文里——既占 token，
//   也在某些后端上因为「签名与改过的 thinking 不匹配」而报错。
//
// 保留最近 N 轮而不是全清：某些 provider 要求最近的消息带签名才能续上，
//   清掉最后几轮会让下一次请求被拒。keepTurns 就是那个余量。
//
// 这是配置单元，判据与执行在 features/session 侧（index.ts 的 turn_end），
// 与 strip 同一个形状。

import { asBool } from "../values.ts";
import { defaultsOf } from "../defaults.ts";

export default {
  name: "signature",
  defaults: defaultsOf("signature"),
  configure(raw: any) {
    const r = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    // 兜底值从 defaults.ts 取，不在这里再写一份字面量。
    const d = defaultsOf("signature");
    const on = asBool(d.on === true, r.on, "signature.on");
    const keepTurns = Number(r.keepTurns === undefined ? d.keepTurns : r.keepTurns);
    if (!Number.isInteger(keepTurns) || keepTurns < 0) {
      throw new Error("signature.keepTurns 必须是非负整数，实际 " + String(r.keepTurns));
    }
    // 上限 300（Ax4 有界）：再大的话每轮都要扫一遍几十条 entry 生成 context_edit，
    // 而保留 300 轮以上的签名在实际使用里没有区别。
    if (keepTurns > 300) throw new Error("signature.keepTurns 上限 300，实际 " + keepTurns);
    return { on, keepTurns };
  },
};