// 清理 thinkingSignature：纯函数，不碰 IO，不碰 ctx。
//
// 为什么单独抽出来（P20：证明项要精确到这一条）：
//   如果逻辑写在 index.ts 的 turn_end 里，测它就得 mock 整个 ctx 与业务链，
//   测红了只说明「链上有处红」，说不出是哪一条。
//   抽成 entries -> edits 的纯函数之后，一条断言对应一个性质。
//
// 用户的诉求（2026-11-24）：「每一个大轮完成，thinkingSignature 清理签名。
//   这个也配置文件化。可以选近几个大轮，是否启用它。」

export type Entry = {
  id?: string;
  type?: string;
  message?: { role?: string; content?: any };
};

export type Edit = { type: "context_edit"; targetId: string; replacement: { content: any[] } };

/** 这条 entry 是一条 assistant 消息，且它的 content 里有块带 thinkingSignature。 */
export function hasSignature(e: Entry): boolean {
  if (e?.type !== "message" || e?.message?.role !== "assistant") return false;
  const content = e.message.content;
  if (!Array.isArray(content)) return false;
  return content.some((b: any) => b && typeof b.thinkingSignature === "string");
}

/** 去掉块里的 thinkingSignature，保留其它一切（thinking 文本、type、cache_control…）。 */
export function stripOne(content: any[]): any[] {
  return content.map((b: any) => {
    if (!b || typeof b.thinkingSignature !== "string") return b;
    const { thinkingSignature, ...rest } = b;
    return rest;
  });
}

/**
 * 生成要清理的 context_edit 列表：保留最近 keepTurns 个 assistant 轮次，清掉更早的。
 *
 * 三条性质（各有断言）：
 *   1 最近 keepTurns 个 assistant entry 一定不在结果里（`it 保留最近 N 轮`）。
 *   2 keepTurns 大于总数时结果为空（同上）。
 *   3 keepTurns = 0 时清全部有签名的（`it 0 表示全清`）。
 *   4 只动带签名的块，thinking 文本一字不改（`it 不丢 thinking`）。
 *   5 非 assistant / 非 message entry 一概不碰（`it 不碰别的 entry`）。
 *
 * 反例：把 slice 的下标算错成 `-keepTurns`（漏了 max 0），keepTurns=0 时会清掉一个不该清的。
 */
export function planSignatureCleanup(entries: readonly Entry[], keepTurns: number): Edit[] {
  const k = Math.max(0, Math.floor(keepTurns));
  const assistant = entries.filter((e) => e?.type === "message" && e?.message?.role === "assistant");
  const keepFrom = Math.max(0, assistant.length - k);
  // 幂等（2026-11-25，真机事故）：context_edit 不改原始 entry——pi 文档
  // docs/session-format.md 明写「the target entry and its metadata remain unchanged in
  // raw history」。所以 hasSignature(原始 entry) 对已清过的目标永远为 true，
  // 每轮 turn_end 都会再写一条内容相同的 edit。增长是 O(轮数 × 过期条目数)：
  // 实测 2026-11-24T13-53-44 那个会话 133092 行里 131698 条是 context_edit
  // （478 个 target，平均每个被重写 275 次），pi 构建 prompt / 压缩时
  // 「Maximum call stack size exceeded」，1ms 就失败。
  // 判据：看该 target 的**最后一条** edit 是否已无 thinkingSignature。
  const lastEditOf = new Map<string, any>();
  for (const e of entries as readonly any[]) {
    if (e?.type === "context_edit" && typeof e.targetId === "string") lastEditOf.set(e.targetId, e);
  }
  const alreadyClean = (id: string): boolean => {
    const content = lastEditOf.get(id)?.replacement?.content;
    // replacement = null 是「整条从上下文里省略」，不是清签名，不能当已清。
    if (!Array.isArray(content)) return false;
    return !content.some((b: any) => b && typeof b.thinkingSignature === "string");
  };
  const out: Edit[] = [];
  for (let i = 0; i < keepFrom; i++) {
    const e = assistant[i];
    if (!e || typeof e.id !== "string" || !e.id) continue;
    if (!hasSignature(e)) continue;
    if (alreadyClean(e.id)) continue;
    out.push({ type: "context_edit", targetId: e.id, replacement: { content: stripOne(e.message!.content) } });
  }
  return out;
}