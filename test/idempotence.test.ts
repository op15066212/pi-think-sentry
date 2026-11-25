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
import { settle } from "../../pi-escape-guard/src/scan.ts";
import strip from "../src/features/strip.ts";
import { judgeThinking } from "../src/judges.ts";

const MARK = "\n[已改：语言]";

test("escape-guard settle 幂等：还原过的文本再跑一遍不变", () => {
  const dirty = "开头正文：\\u4f60\\u53ef\\u4ee5\\u5e2e\\u6211\\u5417";
  const once = settle(dirty, 3);
  assert.equal(once.ok, true);
  assert.notEqual(once.out, dirty, "坏样本：这条必须真的被还原，否则下面一句恒绿");
  const twice = settle(once.out, 3);
  assert.equal(twice.out, once.out);
});

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
