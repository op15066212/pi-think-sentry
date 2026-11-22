// R6 签核第二轮：一个模板服务三种互斥的 ev，16 格里只有 4 格有值 → 必然出现 ?。
// 改成每种判决一份模板之后，判据是「填完之后不含问号」。
import test from "node:test";
import assert from "node:assert/strict";
import { judgeThinking, judgeCfg } from "../src/judges.ts";
import inject from "../src/features/inject.ts";

const cfg = judgeCfg({ dupOn: true, dupMin: 4, langOn: true, langDir: "zh" });
const NL = String.fromCharCode(10);

const TEXTS = {
  dup: "[附注：第 {{blockLine}} 行起重复 {{blockReps}} 次]",
  lang: "[附注：中文占 {{ratio}}，第 {{blockLine}} 行起不是中文，共 {{lines}} 行]",
  clean: "",
};

const fill = (kind: "dup" | "lang" | "clean", ev: any) =>
  (inject.applyWith([{ type: "thinking", thinking: "原文" }], TEXTS[kind], ev) as any)[0].thinking.slice(2);

test("dup 模板只用 dup 有的字段：填完不含问号", () => {
  const v: any = judgeThinking(["同一行", "不同", "同一行", "同一行", "同一行"].join(NL), cfg);
  assert.equal(v.kind, "strip");
  const out = fill("dup", v.ev);
  assert.ok(!out.includes("?"), "不该有问号，实际：" + out);
  assert.ok(out.includes(String(v.ev.line)));
  assert.ok(out.includes(String(v.ev.reps)));
});



test("clean 不追加：空模板就是不动", () => {
  const before = [{ type: "thinking", thinking: "原文" }];
  assert.equal(inject.applyWith(before, "", {}), before);
});

test("模板里引用自己没有的字段仍然会留问号——所以按 kind 选模板是必需的", () => {
  const v: any = judgeThinking(["a".repeat(80), "b".repeat(80), "中".repeat(20)].join(NL), cfg);
  // 故意用 dup 模板配 lang 的 ev（缺 reps）：这就是「一个模板服务三种 ev」的错误用法
  const wrong = fill("dup", v.ev);
  assert.ok(wrong.includes("?"), "交叉使用必然留问号，这条钉住「不许交叉」");
});
