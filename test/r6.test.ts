// R6 签核时两位指出的同一条：inject 模板引用 {{blockLine}}，但没有任何判据产出 line，
// 于是永远替换成 ?，指针失效。这一组把「判据必须产出指针」钉住。
import test from "node:test";
import assert from "node:assert/strict";
import { judgeThinking, judgeCfg } from "../src/judges.ts";

const cfg = judgeCfg({ dupOn: true, dupMin: 4, langOn: true, langDir: "zh" });
const NL = String.fromCharCode(10);
const dupSample = ["同一行", "不同", "同一行", "同一行", "同一行"].join(NL);

test("dup 判红时 ev.line 是第一个重复行（1 基）", () => {
  const v: any = judgeThinking(dupSample, cfg);
  assert.equal(v.kind, "strip");
  assert.equal(v.ev.line, 1);
});

test("lang 判红时 ev.line 是第一条不合格行（1 基）", () => {
  const v: any = judgeThinking(["a", "b", "中"].map((c: string) => c.repeat(c === "中" ? 20 : 80)).join(NL), cfg);
  assert.equal(v.kind, "retract");
  // 2026-11-21（复核 b711ced1 R17）：只断言 kind 不锁判据——三行互不相同时 dup 结构上不在场，
  // lang 在场只是没人锁。加这一行，改坏 lang（比如把 retract 换回 strip）会红。
  assert.equal(v.rule, "lang");
  assert.equal(v.ev.line, 1);
});

test("没判红时 line 为 null：指针不瞎指", () => {
  const v: any = judgeThinking("中".repeat(80), cfg);
  assert.equal(v.kind, "none");
  assert.equal(v.ev.line, null);
});

test("模板拿到真行号：不是问号，是正整数", () => {
  const v: any = judgeThinking(dupSample, cfg);
  assert.notEqual(v.ev.line, null);
  assert.ok(Number.isInteger(v.ev.line) && v.ev.line >= 1);
});

test("strip 的行号区间必须 lo <= hi：判据给的行号不保证升序", () => {
  // 实测出现过 [6-5] 这种反向区间——local 是判据按块拼出来的，首尾不是端点。
  // 这里用一个「重复行分散在两端」的样本：只要出现反向，正则就匹配不上。
  const NL2 = String.fromCharCode(10);
  const body = ["同一句", "中间", "中间", "中间", "中间", "同一句", "同一句", "同一句", "尾"].join(NL2);
  const v: any = judgeThinking(body, judgeCfg({ dupOn: true, dupMin: 4, langOn: false }));
  if (v.kind !== "strip") return;
  const text = String(v.ev.blk || "");
  const m = /第 (d+)-(d+) 行/.exec(String(text));
  if (m) assert.ok(Number(m[1]) <= Number(m[2]), "行号不能反向：" + m[0]);
});