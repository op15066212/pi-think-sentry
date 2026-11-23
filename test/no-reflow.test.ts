import test from "node:test";
import assert from "node:assert/strict";

import { judgeThinking } from "../src/judges.ts";

// 防回灌（2026-11-23）：
// 处置之后，原文里那段重复被换成一行标记，例如
//   [40 句、共 3-3 行坍缩成 3 种，已折叠]
// 这行标记会留在上下文里，模型下一轮读得到，也可能把它抄下来。
// 如果标记本身被计入「不同句子」，那么抄一次是 1 种、抄两次是 2 种——
// 越抄越多，判据自己成了回灌源。
//
// 这条测试守两件事：
//   一 标记不计入统计（抄几遍都不判红）
//   二 折叠是幂等的（对已折叠的内容再判，仍然是干净）

const MARK = "[40 句、共 3-3 行坍缩成 3 种，已折叠]";
const MARK2 = "[原第 5-9 行共 5 行，全部重复已删]";

test("防回灌：折叠标记被抄多遍，不判红", () => {
  const text = [MARK, MARK, MARK, MARK, MARK, MARK].join("\n");
  const v = judgeThinking(text);
  assert.equal(v.kind, "none", "标记不是思考内容，抄多少遍都不该判红，实际 " + v.kind);
});

test("防回灌：两种标记混着抄，也不判红", () => {
  const text = [MARK, MARK2, MARK, MARK2, MARK, MARK2, MARK, MARK2].join("\n");
  const v = judgeThinking(text);
  assert.equal(v.kind, "none", "实际 " + v.kind + " " + (v.ev?.why ?? ""));
});

test("防回灌：标记周围的正常内容照样算", () => {
  // 标记被排除，但正文仍参与判断——不能因为「有标记」就整段失明
  const degen = Array.from({ length: 30 }, (_, i) => ["执行。ok。", "跑。ok。"][i % 2]).join("\n");
  const text = [MARK, degen, MARK].join("\n");
  const v = judgeThinking(text);
  assert.notEqual(v.kind, "none", "标记不能当挡箭牌，正文退化仍要判");
});
