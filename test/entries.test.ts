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
test("别人在这一轮提案的 entries 必须留着", async () => {
  const pi = fakePi();
  await installGuard(pi);

  const theirs = { type: "custom_message", customType: "someone-else", content: "别的扩展写的", display: false };
  const out = await call(pi, "turn_end", {
    outcome: "completed",
    messageEntryId: "e1",
    entries: [theirs],
    message: { content: [{ type: "thinking", thinking: "做。\n做。\n做。\n做。\n正文。" }, { type: "text", text: "答" }] },
  });

  const got = out.find((x: any) => x && x.entries);
  assert.ok(got, "前提：这一轮我们确实提案了东西（有重复行要删）");
  assert.equal(got.entries[0], theirs, "别人的提案必须原样排在前面");
  assert.ok(got.entries.length >= 2, "我们的提案接在后面");
});

test("别人没提案时，返回的 entries 就是我们的", async () => {
  const pi = fakePi();
  await installGuard(pi);
  const out = await call(pi, "turn_end", {
    outcome: "completed",
    messageEntryId: "e2",
    message: { content: [{ type: "thinking", thinking: "做。\n做。\n做。\n做。\n正文。" }, { type: "text", text: "答" }] },
  });
  const got = out.find((x: any) => x && x.entries);
  assert.ok(got.entries.every((e: any) => typeof e.type === "string"), "没有别人的提案时不该凭空造");
});
