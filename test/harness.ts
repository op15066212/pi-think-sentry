// harness.ts —— 三个测试文件共用的假 pi。
//
// 为什么抽出来（2026-11-20，Ax9 空间轴/实例轴）：counts / entries / state 三份测试
// 各自抄了一遍 fakePi 与 call，共 12 行 × 3。同一段桩代码出现三处时，改一处漏两处，
// 而漏掉的那两处照样绿——测试通过不说明被测的是同一个东西。
// 这不是风格问题：ax9-scan 把它们记成「映射依赖实例标签」，意思是这段代码在记录
// 「这份测试凑巧长这样」，而不是「这里该有什么行为」。
//
// 判据：node bin/ax9-scan.mjs 里 test/ 那几组候选消失；三个测试仍全过。
export function fakePi() {
  const hooks: Record<string, Function[]> = {};
  return { hooks, on(n: string, f: Function) { (hooks[n] ||= []).push(f); }, registerCommand() {} };
}
export const call = async (pi: any, name: string, event: any = {}, ctx: any = undefined) => {
  const out = [];
  for (const fn of pi.hooks[name] || []) out.push(await fn(event, ctx));
  return out;
};

// 2026-11-26：tool_call 改成**现场判** —— 从会话历史里取最后一条 assistant 的思考。
// 所以测试不能再「先 message_update 推判决、再 tool_call 查」，而要直接给 tool_call 一份历史。
// 这件事必须在 harness 里做一次，否则每个测试各造一遍假 ctx（Ax9：空间轴 / 实例轴）。
export const ctxOf = (think: string) => ({
  sessionManager: {
    getEntries: () => [
      { type: "message", id: "u1", parentId: null, message: { role: "user", content: [{ type: "text", text: "问" }] } },
      { type: "message", id: "a1", parentId: "u1", message: { role: "assistant", content: [{ type: "thinking", thinking: think }] } },
    ],
  },
});

// 「判决还在吗」必须**直接观测**，不能靠「拦不拦」间接推断（R9）。
//
// 此前所有绕过测试都用 tool_call 的返回值当判决的观测口。冷却键改成思考文本之后，
// 同一段思考只拦一次，于是那个观测口失真了——它测的变成「拦了几次」，不再是「判决有没有被洗掉」。
// 这是表示的问题，不是测试的问题：旧表示把「判决」与「动作」映成同一个值，分不开。
// redCalls 在 tool_call 入口直接自增（src/index.ts 的 stats.redCalls++），与冷却无关，用它。
// 2026-11-27 修正：这里原来写「按 lastV 自增」，而 lastV 已随那一版每帧预判一起删掉——
// 注释指向一个不存在的变量，读的人会去找它。
export async function redCalls(): Promise<number> {
  const mod: any = await import("../src/index.ts");
  return mod.stats.redCalls;
}

/** 期望这一次 tool_call 之后，判决仍然是红的（与拦不拦无关）。 */
export async function expectStillRed(callFn: () => Promise<any>, why: string) {
  const before = await redCalls();
  await callFn();
  const after = await redCalls();
  if (!(after > before)) {
    const err = new Error(why + "（redCalls " + before + " → " + after + "，判决被洗掉了）");
    throw err;
  }
}
