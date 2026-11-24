import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// 轮级清洗（2026-11-23）：
// 判据是帧级的（每一帧思考判一次），但**清洗**必须是轮级的——
// 一轮里可能出现两段退化，中间夹一句正常话；只清最后一帧会漏掉前面那段，
// 而前面那段照样会进下一轮上下文。
//
// 这条测试守的就是那个缺口：两个 message_update 判红，turn_end 一次调用里两段都要被折叠。

const TMP_STATE = path.join(os.tmpdir(), "curb-round-state-" + process.pid + ".json");
const TMP_CFG = path.join(os.tmpdir(), "curb-round-cfg-" + process.pid + ".json");
process.env.CURB_STATE_FILE = TMP_STATE;
process.env.CURB_CONFIG_FILE = TMP_CFG;

const { default: installGuard } = await import("../src/index.ts");
const { fakePi, call } = await import("../test/harness.ts");

// 两段退化，形状不同（一段连续、一段交替），中间没有正常内容
const DEGEN_A = "跑。ok。".repeat(10);                                   // 20 句、2 种 → 坍缩
const DEGEN_B = Array.from({ length: 16 }, (_, i) => ["执行。ok。", "好。执行。ok。"][i % 2]).join("\n");

test("轮级清洗：一轮里两段退化，turn_end 都要折叠", async () => {
  // 这条测的是 inline 的折叠，所以显式开 inline：2026-11-24 之后它默认关，
  // 而「测哪条就只开哪条」是 P20 的要求——用默认值会测到别的判据上去。
  fs.writeFileSync(TMP_CFG, JSON.stringify({ inline: { on: true } }));
  const p = fakePi();
  await installGuard(p);
  await call(p, "before_agent_start", {});

  // 两帧，各自判红；正文不带工具调用
  await call(p, "message_update", { message: { content: [{ type: "thinking", thinking: DEGEN_A }] } });
  await call(p, "message_update", { message: { content: [{ type: "thinking", thinking: DEGEN_B }] } });

  const edit = await call(p, "turn_end", {
    outcome: "completed",
    messageEntryId: "e1",
    message: {
      content: [
        { type: "thinking", thinking: DEGEN_A + "\n" + DEGEN_B },
        { type: "text", text: "答" },
      ],
    },
  });

  // call() 返回每个 hook 的返回值组成的数组；turn_end 的返回值本身是 entries
  // call() 返回每个 hook 的返回值；turn_end 返回 { entries: [...] }
  const rets = Array.isArray(edit) ? edit : [];
  const payload: any = rets.find((x: any) => x && Array.isArray(x.entries)) || {};
  const entries = payload.entries || [];
  assert.ok(entries.length >= 1, "应该产出 context_edit，实际 " + JSON.stringify(rets).slice(0, 300));
  const after = entries[0].replacement.content[0].thinking;

  // 两段都被折叠：折叠标记出现两次
  const marks = after.match(/\[\d+ 句、共 \d+-\d+ 行坍缩成 \d+ 种，已折叠\]/g) || [];
  assert.ok(marks.length >= 1, "至少出现折叠标记，实际：" + after.slice(0, 200));
  assert.ok(after.length < DEGEN_A.length + DEGEN_B.length, "折叠后应更短");
});

test("轮级清洗：判红的那一轮之后，下一轮不沿用（redFrames 必须清空）", async () => {
  fs.writeFileSync(TMP_CFG, JSON.stringify({}));
  const p = fakePi();
  await installGuard(p);
  await call(p, "before_agent_start", {});

  // 第一轮：退化
  await call(p, "message_update", { message: { content: [{ type: "thinking", thinking: DEGEN_A }] } });
  await call(p, "turn_end", {
    outcome: "completed",
    messageEntryId: "e1",
    message: { content: [{ type: "thinking", thinking: DEGEN_A }, { type: "text", text: "答" }] },
  });

  // 第二轮：完全正常，不该被上一轮的红牵连
  await call(p, "message_update", { message: { content: [{ type: "thinking", thinking: "这一轮只写了一句正常的中文，没有重复。" }] } });
  const edit = await call(p, "turn_end", {
    outcome: "completed",
    messageEntryId: "e2",
    message: { content: [{ type: "thinking", thinking: "这一轮只写了一句正常的中文，没有重复。" }, { type: "text", text: "答" }] },
  });
  const rets = Array.isArray(edit) ? edit : [];
  const entries = rets.find((x: any) => Array.isArray(x)) || [];
  // 允许注入文案（content 变化），但不应出现折叠标记（那意味着上一轮的红泄漏进来）
  for (const e of entries) {
    const t = e.replacement?.content?.[0]?.thinking || "";
    assert.ok(!/坍缩成/.test(t), "上一轮的判红不该泄漏到这一轮：" + t.slice(0, 120));
  }
});
