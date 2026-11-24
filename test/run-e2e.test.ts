// run 判据的端到端：从判据到处置走一次，看它是不是真的把重复折掉了。
//
// 这一条把三个算法串起来验证：
//   LZ77 给出最长匹配 -> run 判据拿它判红 -> strip 的 dedupByLz 用同一份解析去重。
// 「判出什么」与「改出什么」同源，所以这条测试红了就是链路断了，不是阈值没调好。
import test from "node:test";
import assert from "node:assert/strict";
import { judgeThinking } from "../src/judges.ts";
import strip from "../src/features/strip.ts";
import { lz77 } from "../src/algo/lz77.ts";

const WALL = Array.from({ length: 31 }, () => "做。").join("\n");

test("run 打开时：31 行同一句判红，rule 是 run", () => {
  const v = judgeThinking(WALL, { runOn: true, runMinLen: 12 });
  assert.equal(v.kind, "fold", "应当判红，实际 kind=" + v.kind);
  assert.equal(v.rule, "run", "来源应当是 run，实际 " + v.rule);
});

test("run 关闭时：同样的文本判干净（不改变旧行为）", () => {
  const v = judgeThinking(WALL, { runOn: false });
  assert.notEqual(v.rule, "run", "关掉之后不该由 run 判");
});

test("处置与判定同源：run 判红后，strip 用 LZ 的去重结果", () => {
  const v = judgeThinking(WALL, { runOn: true, runMinLen: 12 });
  const src = [{ type: "thinking", thinking: WALL }, { type: "text", text: "回答" }];
  const r = strip.clean(src, v, 4);
  assert.ok(r.cleaned > 0, "应当处置过，实际 cleaned=" + r.cleaned);
  const after = r.content.find((b) => b.type === "thinking").thinking;
  assert.ok(after.length < WALL.length, "处置后应当更短：" + after.length + " vs " + WALL.length);
  assert.ok(after.includes("〔重复"), "应当留下可数指针，实际：" + after);
});

test("处置后再判：折叠标记不该被当成新的重复源（防回灌）", () => {
  const v = judgeThinking(WALL, { runOn: true, runMinLen: 12 });
  const src = [{ type: "thinking", thinking: WALL }];
  const once = strip.clean(src, v, 4).content.find((b) => b.type === "thinking").thinking;
  assert.ok(lz77(once).longest < lz77(WALL).longest, "折叠后不该还有同样长的重复");
});

test("正常文本：run 不判红，strip 不动它", () => {
  const normal =
    "读完配置后我把三个阈值都记下来，然后逐条核对它们是不是写在同一个文件里。" +
    "阈值分别在 defaults 与 config 两处声明，读的时候后者覆盖前者。";
  const v = judgeThinking(normal, { runOn: true, runMinLen: 12 });
  assert.notEqual(v.rule, "run", "正常文本不该由 run 判红");
});
