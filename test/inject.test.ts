import test from "node:test";
import assert from "node:assert/strict";
import inject from "../src/features/inject.ts";

// 五个功能里只有注入这一条，默认配置是关的（text 为空串），所以整套接线测试里
// 它一次都不会真跑。判据不能靠「默认关闭所以不报错」——那对坏代码同样成立。
// 这里直接测纯函数，不经过 pi。

const msg = (...blocks: any[]) => blocks;

test("尾部注入：追加到最后一个思考块，前面那块逐字不动", () => {
  const content = msg(
    { type: "thinking", thinking: "甲" },
    { type: "text", text: "回答" },
    { type: "thinking", thinking: "乙" },
  );
  const out = inject.applyWith(content, "尾巴");
  assert.equal(out.length, 3, "块数不该变");
  assert.equal(out[0].thinking, "甲", "第一块必须逐字不变");
  assert.equal(out[2].thinking, "乙尾巴", "尾块接上文案");
  assert.equal(out[1].text, "回答", "正文块不动");
  assert.equal(content[2].thinking, "乙", "原数组不该被改（上下文别处还在引用）");
});

test("尾部注入：空文案原样返回，不算注入过", () => {
  const content = msg({ type: "thinking", thinking: "甲" });
  assert.equal(inject.applyWith(content, ""), content);
  assert.equal(inject.applyWith(content, null), content);
  assert.equal(inject.applyWith(content, undefined), content);
});

test("尾部注入是幂等的：重复触发只追加一次", () => {
  // 这个形状真实存在：turn_end 的守卫是 entryKey !== "" && entryKey === lastEntryId，
  // 消息没有 entryId 时守卫整段失效。上一版不幂等，重复触发就叠加两遍。
  const content = msg({ type: "thinking", thinking: "甲" });
  const once = inject.applyWith(content, "尾巴");
  const twice = inject.applyWith(once, "尾巴");
  assert.equal(twice[0].thinking, "甲尾巴", "第二次不该再叠一段");
  assert.equal(twice, once, "幂等时原样返回同一个数组");
});

test("尾部注入：没有思考块就不追加，也不凭空造一块", () => {
  const content = msg({ type: "text", text: "只有正文" });
  const out = inject.applyWith(content, "尾巴");
  assert.equal(out, content);
  assert.equal(out.length, 1);
});

test("尾部注入：畸形输入不抛也不改", () => {
  assert.deepEqual(inject.applyWith(null, "尾巴"), []);
  assert.deepEqual(inject.applyWith(undefined, "尾巴"), []);
  assert.deepEqual(inject.applyWith("不是数组", "尾巴"), []);
});
