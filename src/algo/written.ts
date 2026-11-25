// 幂等判据：这条内容是否已经写过（与该 target 最后一条 context_edit 比对）。
//
// 为什么单独成文件（P20）：做成 index.ts 里的私有函数，测它就得 mock ctx 与 sessionManager，
// 测红了只说明「链上有处红」。抽成 entries -> boolean 的纯函数后，一条断言对应一个性质。
//
// 事故（2026-11-26 用户实测）：会话 2026-11-20T00-42-25-558Z 里 124745 条 context_edit，
// 305MB，占文件 87%，全是「同一条 assistant 的复制，只有 thinking 被折短」。
// 每条 assistant 平均被写 11 次 —— 只判「这一轮改没改」不够，同一 target 会被反复处理。
// 症状：探针读一次十几秒、pi 构建 prompt 报 Maximum call stack size exceeded。

export type AnyEntry = { type?: string; targetId?: string; replacement?: { content?: any } | null };

/**
 * 该 target 最后一条 context_edit 是否已经写过这份内容。
 *
 * 只反扫尾部窗口：context_edit 总写在 target 之后，窗口外不可能有更近的一条。
 * 窗口内找不到 → false（多写一条，不会漏写）。
 *
 * 反例（这条挡的）：把 return 改成恒 false —— 每轮又追加一条，文件回到 O(轮数) 增长。
 * 判据：test/written.test.ts 的「同样的内容第二次不写」。
 */
export function alreadyWritten(entries: readonly AnyEntry[], targetId: string, content: unknown, tailWindow = 512): boolean {
	if (!targetId) return false;
	const want = JSON.stringify(content);
	const start = Math.max(0, entries.length - tailWindow);
	for (let i = entries.length - 1; i >= start; i--) {
		const e = entries[i];
		if (e?.type === "context_edit" && e.targetId === targetId) {
			return JSON.stringify(e.replacement?.content) === want;
		}
	}
	return false;
}
