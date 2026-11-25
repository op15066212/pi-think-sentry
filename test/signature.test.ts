// 清理 thinkingSignature 的判据。
//
// 用户的诉求（2026-11-24）：「每一个大轮完成，thinkingSignature 清理签名。
//   这个也配置文件化。可以选近几个大轮，是否启用它。」
//
// 每条断言对应一个性质，红了能说出是哪一条。
import test from "node:test";
import assert from "node:assert/strict";
import { planSignatureCleanup, hasSignature, stripOne } from "../src/algo/signature.ts";
import signature from "../src/features/signature.ts";

const asst = (id, sig = "reasoning_content", text = "t-" + id) => ({
  id,
  type: "message",
  message: { role: "assistant", content: [{ type: "thinking", thinking: text, thinkingSignature: sig }] },
});
const user = (id) => ({ id, type: "message", message: { role: "user", content: [{ type: "text", text: "u" }] } });

test("保留最近 keepTurns 个：清掉前面 3 个 assistant", () => {
  const entries = [asst("a1"), asst("a2"), asst("a3"), asst("a4"), asst("a5")];
  const edits = planSignatureCleanup(entries, 2);
  assert.deepEqual(edits.map((e) => e.targetId), ["a1", "a2", "a3"]);
});

test("keepTurns 大于总数：一条都不清", () => {
  const entries = [asst("a1"), asst("a2")];
  assert.deepEqual(planSignatureCleanup(entries, 5), []);
});

test("keepTurns = 0：全清（这是 max 0 那一处最容易漏的边界）", () => {
  const entries = [asst("a1"), asst("a2")];
  const edits = planSignatureCleanup(entries, 0);
  assert.deepEqual(edits.map((e) => e.targetId), ["a1", "a2"]);
});

test("不丢 thinking 文本：只去掉 thinkingSignature 字段", () => {
  const edits = planSignatureCleanup([asst("a1", "sig", "正文保留")], 0);
  const block = edits[0].replacement.content[0];
  assert.equal(block.thinking, "正文保留");
  assert.equal(block.type, "thinking");
  assert.equal("thinkingSignature" in block, false);
});

test("非 assistant 与非 message 的 entry 一概不碰", () => {
  const entries = [user("u1"), { id: "c1", type: "custom" }, asst("a1"), asst("a2")];
  const edits = planSignatureCleanup(entries, 1);
  assert.deepEqual(edits.map((e) => e.targetId), ["a1"]);
});

test("没有签名的 assistant 不产生 edit（不制造空补丁）", () => {
  const noSig = { id: "a1", type: "message", message: { role: "assistant", content: [{ type: "thinking", thinking: "x" }] } };
  // 两个 assistant，keepTurns=0 时都该进结果；但 noSig 没有签名，必须被跳过。
  const edits = planSignatureCleanup([noSig, asst("a2")], 0);
  assert.deepEqual(edits.map((e) => e.targetId), ["a2"], "没有签名的那条不该产生 edit");
});

test("幂等：已清过的目标不再重复清（每轮重写是同一条事故）", () => {
  const entries = [
    asst("a1"),
    { id: "e1", type: "context_edit", targetId: "a1", replacement: { content: stripOne(asst("a1").message.content) } },
  ];
  assert.deepEqual(planSignatureCleanup(entries, 0), []);
});

test("反例：最后一条 edit 又把签名写回去了，必须再清", () => {
  const entries = [
    asst("a1"),
    { id: "e1", type: "context_edit", targetId: "a1", replacement: { content: asst("a1").message.content } },
  ];
  assert.deepEqual(planSignatureCleanup(entries, 0).map((e) => e.targetId), ["a1"]);
});

test("反例：replacement = null（整条从上下文省略）不算已清签名", () => {
  const entries = [asst("a1"), { id: "e1", type: "context_edit", targetId: "a1", replacement: null }];
  assert.deepEqual(planSignatureCleanup(entries, 0).map((e) => e.targetId), ["a1"]);
});

test("反例：只清过一次、但后来又追加了新的过期条目，新条目照样要清", () => {
  const entries = [
    asst("a1"),
    { id: "e1", type: "context_edit", targetId: "a1", replacement: { content: stripOne(asst("a1").message.content) } },
    asst("a2"),
  ];
  assert.deepEqual(planSignatureCleanup(entries, 0).map((e) => e.targetId), ["a2"]);
});
test("hasSignature 只看 assistant + message + 有字段", () => {
  assert.equal(hasSignature(asst("a1")), true);
  assert.equal(hasSignature(user("u1")), false);
});

test("stripOne 保留其它块原样（cache_control 之类不能被吃掉）", () => {
  const content = [
    { type: "thinking", thinking: "a", thinkingSignature: "s", cache_control: { type: "ephemeral" } },
    { type: "text", text: "b" },
  ];
  const out = stripOne(content);
  assert.equal(out[0].cache_control.type, "ephemeral");
  assert.equal(out[1].text, "b");
  assert.equal("thinkingSignature" in out[0], false);
});

test("配置：默认开，keepTurns=30", () => {
  const c = signature.configure(undefined);
  assert.equal(c.on, true);
  assert.equal(c.keepTurns, 30);
});

test("配置：非法 keepTurns 必须抛，不静默兜底", () => {
  assert.throws(() => signature.configure({ keepTurns: -1 }), /非负整数/);
  assert.throws(() => signature.configure({ keepTurns: 1.5 }), /非负整数/);
  assert.throws(() => signature.configure({ keepTurns: 301 }), /上限 300/);
});

test("配置：合法值原样采纳", () => {
  const c = signature.configure({ on: true, keepTurns: 5 });
  assert.equal(c.on, true);
  assert.equal(c.keepTurns, 5);
});