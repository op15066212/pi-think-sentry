// 判据：从 ctx 取条目时必须取「当前分支」，不是「文件全集」。
//
// 挡的事故（2026-11-26 真实发生）：会话被编辑/重试过之后，文件里有一批
// 已废弃分支的条目。取全集去清 thinkingSignature，产出的 context_edit 指向
// 废弃分支的 entry id；pi 按当前分支校验，抛
//   Invalid boundary entries: Entry 9af3edf3 not found
// 扩展这边看不到异常（错误由 pi 的 runner 捕获），只有界面上冒一行红。
//
// 坏样本：把 branchEntries 改成恒用 getEntries，本文件的第 1 条断言立刻红。

import { test } from "node:test";
import assert from "node:assert/strict";
import { branchEntries } from "../src/algo/branch.ts";

const onBranch = [{ id: "a1", type: "message" }, { id: "a2", type: "message" }];
const wholeFile = [
	{ id: "dead1", type: "message" }, // 废弃分支上的旧条目
	{ id: "dead2", type: "message" },
	...onBranch,
];

test("有 getBranch 时用它，不碰 getEntries", () => {
	let asked: string[] = [];
	const ctx = {
		sessionManager: {
			getBranch: () => {
				asked.push("getBranch");
				return onBranch;
			},
			getEntries: () => {
				asked.push("getEntries");
				return wholeFile;
			},
		},
	};
	const got = branchEntries(ctx);
	assert.deepEqual(got, onBranch, "必须返回分支，不是全集");
	assert.deepEqual(asked, ["getBranch"], "不该问 getEntries");
});

test("没有 getBranch 时退回 getEntries（老版本 pi 兼容）", () => {
	const ctx = { sessionManager: { getEntries: () => wholeFile } };
	assert.deepEqual(branchEntries(ctx), wholeFile);
});

test("ctx 缺 sessionManager 时给空数组，不抛", () => {
	assert.deepEqual(branchEntries({}), []);
	assert.deepEqual(branchEntries(undefined), []);
});
