// 幂等性：同一输入跑两遍，第二遍必须不再改动。
//
// 为什么单独一个文件（2026-11-25 真机事故）：context_edit 不改原始 entry，
// 所以「读原始状态、判断为需要处理、写派生投影」这个形状每轮都会重复写同一条内容，
// 增长是 O(轮数 × 过期条目数)。pi-think-sentry 的 signature 清理就是这么把
// 2026-11-24T13-53-44 那个会话喂到 133092 行（131698 条 context_edit），
// pi 压缩当场 Maximum call stack size exceeded。
// 本文件把「每个可变内容的地方都幂等」变成可跑的红/绿，而不是靠读代码。
import test from "node:test";
import assert from "node:assert/strict";
import strip from "../src/features/strip.ts";
import { judgeThinking } from "../src/judges.ts";

const MARK = "\n[已改：语言]";

// 2026-11-26：原来这里有一条「escape-guard 的 settle 幂等」。
// settle 已随「只保留 tool_call 与拒绝执行」整条删除，那条的观察对象不存在，
// 跨仓引用也一并断掉。本文件其余部分（strip / signature 的幂等）不受影响。

test("strip 一轮就到定点：判红 → 清 → 再判，第二轮不再改", () => {
  const dup = ["同一句", "同一句", "同一句", "同一句", "另一句"].join("\n");
  const v = judgeThinking(dup, {});
  assert.notEqual(v.kind, "none", "坏样本：这段必须判红");
  const r1 = strip.clean([{ type: "thinking", thinking: dup }], v, 4);
  assert.equal(r1.cleaned, true);
  const text1 = r1.content.map((b) => b.thinking || "").join("\n");
  const v2 = judgeThinking(text1, {});
  const r2 = v2.kind === "none" ? { cleaned: false } : strip.clean([{ type: "thinking", thinking: text1 }], v2, 4);
  assert.equal(r2.cleaned, false);
});
