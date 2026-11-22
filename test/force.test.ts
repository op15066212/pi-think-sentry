// 后门：CURB_FORCE_STRIP / CURB_FORCE_RETRACT 让判据恒红，仅供 RPC 测试用。
//
// 2026-11-22 修的真缺陷：CURB_FORCE_STRIP 那一支的 ev 不带 dups，而 verdict 对 dup 形状
// 要求 dups 是数组——于是环境变量一开，judgeThinking 直接抛，message_update 的
// try/catch 吞掉它，判据一帧都没跑。RPC 测试读 stderr，读到的是「零个 strip 帧」，
// 于是走 SKIP 分支，打印通过。后门自己坏了，而所有显示都是绿的。
//
// 现在两条：形状必须完整（不抛），并且 forced: true 出现在输出里（强制的红与判出来的红分得开）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeThinking } from "../src/judges.ts";

const clean = "这是一段正常的中文，没有重复行，也没夹英文。";

test("不带后门时判干净，且没有 forced 标记", () => {
  const v = judgeThinking(clean);
  assert.equal(v.kind, "none");
  assert.equal(v.forced, undefined);
});

test("CURB_FORCE_STRIP：不抛，且带 forced 标记", () => {
  process.env.CURB_FORCE_STRIP = "1";
  try {
    const v = judgeThinking(clean);
    assert.equal(v.kind, "strip");
    assert.equal(v.forced, true);
    assert.ok(Array.isArray(v.ev.dups), "dup 形状必须完整，否则 verdict 会抛");
  } finally { delete process.env.CURB_FORCE_STRIP; }
});

test("CURB_FORCE_RETRACT：不抛，且带 forced 标记", () => {
  process.env.CURB_FORCE_RETRACT = "1";
  try {
    const v = judgeThinking(clean);
    assert.equal(v.kind, "retract");
    assert.equal(v.forced, true);
    assert.equal(v.ev.dir, "zh", "处方方向也要完整");
  } finally { delete process.env.CURB_FORCE_RETRACT; }
});

test("后门只影响判据，不给 opaque 开后门", () => {
  // 后门恒红；但「判据看不见这段」这个状态不能由后门造出来，
  // 否则 opaque 就成了绕过拦截的第二条路。
  process.env.CURB_FORCE_STRIP = "1";
  try {
    // 样本换成「有正文」的文本（2026-11-20 R3）：原来用 "   "，那本来就是不可判文本，
    // 0.1.23 起空帧判 opaque（空帧不该覆盖上一帧判红），这条断言就会拿位置判据的结果
    // 去验后门的边界，测的不是同一件事。
    const v = judgeThinking("这是一段正常的中文，没有重复行，也没夹英文。");
    assert.notEqual(v.tag, "opaque", "后门不能把可判文本变成 opaque");
    assert.equal(v.kind, "strip", "后门应判 strip");
  } finally { delete process.env.CURB_FORCE_STRIP; }
});

// 变异巡检找到的空白（2026-11-22 第十二版）：把 CURB_FORCE_STRIP 那个 length > 0 改成 >= 0，
// 126 条测试全绿。后门的两个开关是分开的：CURB_FORCE_STRIP 只管非空，空思考要另开
// CURB_FORCE_EMPTY —— 这个边界没有用例。
test("CURB_FORCE_STRIP 对空思考不生效：要 CURB_FORCE_EMPTY 才判", () => {
  process.env.CURB_FORCE_STRIP = "1";
  try {
    const v = judgeThinking("   \n  ");
    assert.notEqual(v.kind, "strip", "空思考不加 CURB_FORCE_EMPTY 就不该判红");
    process.env.CURB_FORCE_EMPTY = "1";
    assert.equal(judgeThinking("").kind, "strip", "开了 CURB_FORCE_EMPTY 之后空思考也判红");
  } finally { delete process.env.CURB_FORCE_STRIP; delete process.env.CURB_FORCE_EMPTY; }
});
