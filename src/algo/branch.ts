// 从 pi 的 ctx 里取「当前分支」的条目。
//
// 为什么单独一个文件：这条判据要能被单测，而它唯一做的事就是「选哪个数组」。
// 选错了不会报异常 —— pi 的 runner 捕获后 emitError，扩展这边看到一切正常，
// 只有界面上冒一行「Invalid boundary entries: Entry XXXXXXXX not found」。

/**
 * 当前分支的条目：从 leaf 沿 parentId 回到根。
 *
 * 为什么不是 getEntries()：它返回**文件里的全部条目**，包含已废弃的分支
 * （编辑/retry/fork 之后留在文件里的旧分支）。
 *
 * 实测（2026-11-26，本会话）：
 *   全集 5259 条，当前分支只有 251 条；assistant 全集 2095、分支上 79；
 *   带 thinkingSignature 的全集 1271、分支上 62。
 *   `9af3edf3`（2026-11-24 的一条 assistant）在全集里、不在分支上。
 *
 * 用它产出 context_edit，pi 按当前分支构建 projection，找不到 targetId 就抛
 * 「Invalid boundary entries: Entry 9af3edf3 not found」，整轮 turn_end 作废。
 * 每轮都中一次，看起来像扩展坏了，实际是选错了数组。
 *
 * 回退到 getEntries 只为兼容没有 getBranch 的老版本 pi。
 */
export function branchEntries(ctx: any): any[] {
	const sm = (ctx as any)?.sessionManager;
	if (typeof sm?.getBranch === "function") return sm.getBranch();
	return sm?.getEntries?.() ?? [];
}