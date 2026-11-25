import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// pi 的文档：returning entries or continue replaces only that field.
// 也就是说 handler 返回的 entries 会替换「这一轮到目前为止提案的 entries」，不是追加。
// 2026-11-21 通读时发现的实现落差：我们直接返回自己那几项，别的扩展在同一个 turn_end
// 里提案的东西会被整段盖掉。它不报错，只是安静地不生效——最贵的那种坏法。

const TMP_STATE = path.join(os.tmpdir(), "curb-entries-state-" + process.pid + ".json");
const TMP_CFG = path.join(os.tmpdir(), "curb-entries-cfg-" + process.pid + ".json");
process.env.CURB_STATE_FILE = TMP_STATE;
process.env.CURB_CONFIG_FILE = TMP_CFG;

const { default: installGuard } = await import("../src/index.ts");

import { fakePi, call } from "../test/harness.ts";
// 2026-11-26 用户决定：**这个插件不再注入任何内容**。
//
// 原来这两条测的是「我们提案 context_edit 时，别的扩展在同一轮提案的 entries 不能被盖掉」
// （pi 文档：returning entries replaces only that field）。现在轮末一个字节都不写盘，
// 「我们的提案」不存在了，那两条的观察点随之消失。
//
// 留下的是现在真正要证的那一条：**turn_end 不返回任何 entries**。
// 它同时保住了原来的安全性：我们什么都不返回，就不会接管 entries 字段，别人的提案自然还在。

test("轮末不注入任何内容：turn_end 不返回 entries", async () => {
  const pi = fakePi();
  await installGuard(pi);
  const out = await call(pi, "turn_end", {
    outcome: "completed",
    messageEntryId: "e1",
    // 一段一定会被判红、原来一定会被改写的思考（碎片重复）。
    message: { content: [{ type: "thinking", thinking: "做。\n做。\n做。\n做。\n正文。" }, { type: "text", text: "答" }] },
  });
  assert.equal(out.find((x: any) => x && x.entries), undefined, "不该返回 entries（返回就写盘了）");
});

test("别人在这一轮提案的 entries 不因我们而丢", async () => {
  const pi = fakePi();
  await installGuard(pi);
  const theirs = { type: "custom_message", customType: "someone-else", content: "别的扩展写的", display: false };
  const out = await call(pi, "turn_end", {
    outcome: "completed",
    messageEntryId: "e2",
    entries: [theirs],
    message: { content: [{ type: "thinking", thinking: "做。\n做。\n做。\n做。\n正文。" }, { type: "text", text: "答" }] },
  });
  // 我们不返回 entries 字段 = 不接管它 = pi 保留原值。
  assert.equal(out.find((x: any) => x && x.entries), undefined, "不该接管 entries 字段");
});
