// alreadyWritten：幂等判据。三条断言各挡一个真实事故形状。
//
// 事故（2026-11-26）：会话 2026-11-20T00-42-25-558Z 里 124745 条 context_edit / 305MB，
// 占文件 87%，全是同一 target 的重复写入。这条判据是那次修复的证明项。
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { alreadyWritten } from "../src/algo/written.ts";

const edit = (targetId: string, content: unknown) => ({ type: "context_edit", targetId, replacement: { content } });

describe("alreadyWritten", () => {
	it("同样的内容第二次不写", () => {
		const entries = [edit("a1", [{ type: "text", text: "x" }])];
		assert.equal(alreadyWritten(entries, "a1", [{ type: "text", text: "x" }]), true);
	});

	it("内容不同就要写（否则修改永远落不下去）", () => {
		const entries = [edit("a1", [{ type: "text", text: "x" }])];
		assert.equal(alreadyWritten(entries, "a1", [{ type: "text", text: "y" }]), false);
	});

	it("从没写过就写", () => {
		assert.equal(alreadyWritten([], "a1", [{ type: "text", text: "x" }]), false);
	});

	it("只看该 target 的最后一条，不看别的 target", () => {
		const entries = [edit("a1", [{ type: "text", text: "x" }]), edit("b2", [{ type: "text", text: "z" }])];
		assert.equal(alreadyWritten(entries, "a1", [{ type: "text", text: "x" }]), true);
		assert.equal(alreadyWritten(entries, "a2", [{ type: "text", text: "x" }]), false);
	});

	it("replacement 为 null（整条省略）不算「写过这份内容」", () => {
		const entries = [{ type: "context_edit", targetId: "a1", replacement: null }];
		assert.equal(alreadyWritten(entries, "a1", [{ type: "text", text: "x" }]), false);
	});

	it("空 targetId 一律返回 false（不拿空键去比）", () => {
		const entries = [edit("", [{ type: "text", text: "x" }])];
		assert.equal(alreadyWritten(entries, "", [{ type: "text", text: "x" }]), false);
	});
});
