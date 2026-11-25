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

  // 两件事一遍扫完：assistant 总数、每个目标最后一条覆盖记录清没清干净。
  // 只存布尔不存整条 entry——13 万条历史下 Map 里放对象是本函数的主要开销
  // （2026-11-25 实测：26000 条从 5.1ms 降到 1.9ms）。
  //
  // 幂等（2026-11-25，真机事故）：context_edit 不改原始 entry——pi 文档
  // docs/session-format.md 明写「the target entry and its metadata remain unchanged in
  // raw history」。所以 hasSignature(原始 entry) 对已清过的目标永远为 true，
  // 每轮 turn_end 都会再写一条内容相同的 edit。增长是 O(轮数 × 过期条目数)：
  // 实测 2026-11-24T13-53-44 那个会话 133092 行里 131698 条是 context_edit
  // （478 个 target，平均每个被重写 275 次），pi 构建 prompt / 压缩时
  // 「Maximum call stack size exceeded」，1ms 就失败。
  let total = 0;
  const lastClean = new Map<string, boolean>();
  for (const e of entries as readonly any[]) {
    if (e?.type === "message") {
      if (e.message?.role === "assistant") total++;
    } else if (e?.type === "context_edit" && typeof e.targetId === "string") {
      const content = e.replacement?.content;
      // replacement = null 是「整条从上下文里省略」，不是清签名，不能当已清。
      lastClean.set(e.targetId, Array.isArray(content) && !content.some((b: any) => b && typeof b.thinkingSignature === "string"));
    }
  }

  const keepFrom = Math.max(0, total - k);
  if (keepFrom === 0) return [];

  // 只扫到第 keepFrom 个 assistant 就停：旧版 filter 会先复制全部 assistant 再取前段。
  const out: Edit[] = [];
  let seen = 0;
  for (const e of entries) {
    if (seen >= keepFrom) break;
    if (e?.type !== "message" || e?.message?.role !== "assistant") continue;
    seen++;
    if (typeof e.id !== "string" || !e.id) continue;
    if (!hasSignature(e)) continue;
    if (lastClean.get(e.id)) continue;
    out.push({ type: "context_edit", targetId: e.id, replacement: { content: stripOne(e.message!.content) } });
  }
  return out;
}

/**
 * 增量版：只处理「刚过期」的那几条，不扫全量历史。
 *
 * 为什么要另写一个（2026-11-25 实测）：全量版在 26000 条 entry 的会话里单次
 * 4.4ms，每轮 turn_end 都跑一遍，而幂等修好之后第二轮起它产出恒为 0——纯粹白扫。
 * 增长源已断（见上面的 alreadyClean），剩下的成本只是「每轮把历史重数一遍」。
 *
 * 水位语义（state.boundary）：上一次处理到的「过期区右端」。第一轮它是 0，
 * 于是第一次调用等价于全量（from = 0），之后只处理 [上次边界, 本次边界)。
 * 不需要「是否已初始化」的标记 —— 0 就是未初始化，两者是同一件事。
 *
 * 反例（这条挡的）：第一轮就把水位写成「当前边界」而不是 0 —— 开头那批从未清过的
 * 条目永远不会被处理，表现为「装好插件后最前面几条签名一直清不掉」。
 * 判据：test/signatureIncremental.test.ts 的「第一次调用等价全量」。
 */
export type CleanupState = { boundary: number };

export function planSignatureCleanupIncremental(
  entries: readonly Entry[],
  keepTurns: number,
  state: CleanupState,
  tailWindow = 512,
): { edits: Edit[]; state: CleanupState } {
  const k = Math.max(0, Math.floor(keepTurns));
  // 本次边界：从尾部数到第 k+1 个 assistant，它及更早的都在过期区。
  let seen = 0;
  let boundary = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e?.type === "message" && e?.message?.role === "assistant" && typeof e.id === "string" && e.id) {
      seen++;
      if (seen > k) { boundary = i + 1; break; }
    }
  }
  // 水位只会右移，除非 keepTurns 被调大 —— 那时新边界比水位更靠左，
  // from >= boundary 直接返回，本来就是对的（过期区缩小，没有新东西要清）。
  // 所以不写 min(state.boundary, boundary)：那是等价变异，测不出差别，留着只是多一处可写错的地方。
  const from = state.boundary;
  if (from >= boundary) return { edits: [], state: { boundary } };
  // 已清判定要看该 target 的最后一条 edit。edit 总写在 target 之后、清完就贴着边界，
  // 所以只在尾部窗口里找：窗口外找不到就当未清（多写一条，不会漏清）。
  const lastEditOf = new Map<string, any>();
  const start = Math.max(0, entries.length - tailWindow);
  for (let i = start; i < entries.length; i++) {
    const e = entries[i] as any;
    if (e?.type === "context_edit" && typeof e.targetId === "string") lastEditOf.set(e.targetId, e);
  }
  const edits: Edit[] = [];
  for (let i = from; i < boundary; i++) {
    const e = entries[i];
    if (!e || e.type !== "message" || e.message?.role !== "assistant") continue;
    if (typeof e.id !== "string" || !e.id) continue;
    if (!hasSignature(e)) continue;
    const content = lastEditOf.get(e.id)?.replacement?.content;
    // replacement = null 是「整条省略」，不是清签名。
    if (Array.isArray(content) && !content.some((b: any) => b && typeof b.thinkingSignature === "string")) continue;
    edits.push({ type: "context_edit", targetId: e.id, replacement: { content: stripOne(e.message!.content) } });
  }
  return { edits, state: { boundary } };
}