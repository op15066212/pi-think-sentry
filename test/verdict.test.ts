// 手写校验的行为：畸形输入一律抛，合法输入原样返回。
// 原来用 zod 的 .parse 也是抛，这里保持同一语义。
//
// 2026-11-22 加严两次，都是因为「形状在一个地方说」没说到边上：
//   1. lang 的 ev 只查了 cjk/lat，而处方 SAY_LANG 要读 lines 与 dir。
//      缺 dir 时处方会说「不是中文」——方向反了，且不报错。三条 ng 样本在下面。
//   2. tag 这条轴此前只有 clean 一个取值，等于空转。opaque 加进来之后
//      「判据看不见这段」与「判干净了」才在类型上分开。
import { test } from "node:test";
import assert from "node:assert/strict";
import { Verdict } from "../src/verdict.ts";

const dupEv = { blk: "跑。", reps: 3, why: "3 次", dups: [["跑。", 3, [1, 2]]] };
const dupEvNone = { blk: null, reps: 0, why: "0 次", dups: [] };
const langEv = { cjk: 0, lat: 100, lines: 4, dir: "zh", sample: "the line" };
const boundaryEv = { vote: 0, fence: 1, indent: 5, blank: 2, exempt: 6 };

const strip = { kind: "strip", rule: "dup", ev: dupEv };
const retract = { kind: "retract", rule: "lang", ev: langEv };
const none = { kind: "none", tag: "clean", rule: "dup", ev: dupEvNone };
const opaque = { kind: "none", tag: "opaque", rule: "boundary", ev: boundaryEv };







test("lang 的处方字段缺一个就抛：lines / dir / sample", () => {
  // 这三条就是「处方会静默失真」的坏样本。去掉任一条校验，对应那条断言会变绿。
  const ng = [
    [{ cjk: 0, lat: 99, dir: "zh", sample: null }, /ev\.lines/],
    [{ cjk: 0, lat: 99, lines: 5, sample: null }, /ev\.dir/],
    [{ cjk: 0, lat: 99, lines: 5, dir: "zh" }, /ev\.sample/],
    [{ cjk: 0, lat: 99, lines: 5, dir: "fr", sample: null }, /ev\.dir/],
  ];
  for (const [ev, re] of ng) assert.throws(() => Verdict.parse({ kind: "none", tag: "clean", rule: "lang", ev }), re);
  assert.doesNotThrow(() => Verdict.parse({ kind: "none", tag: "clean", rule: "lang", ev: langEv }));
});





test("forced 只能是 true 或缺席：让强制的红在输出里分得开", () => {
  assert.doesNotThrow(() => Verdict.parse({ ...strip, forced: true }));
  assert.throws(() => Verdict.parse({ ...strip, forced: 1 }), /forced/);
  assert.throws(() => Verdict.parse({ ...strip, forced: false }), /forced/);
});
