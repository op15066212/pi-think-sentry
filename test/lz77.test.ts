// 整体判据：LZ77 的最长匹配有多长。
//
// 为什么是这一个数（2026-11-24，两条路都被实测否决之后）：
//   k-gram 比是平均值 —— 长文本稀释，夹九次「做。」在 133 字节里掉到 0.809，漏。
//   压缩覆盖率是冗余量 —— 夹九次只占 20%，从压缩角度确实不值得管，但行为上要管。
// 「压缩」与「退化」不是同一个量：压缩问「这段能不能更短」，退化问「是不是卡住了」。
// 卡住的形状是同一个小片段**连续重复很多次**，度量它只要一个数：最长的 match 有多长。
//
// 实测（bin/longest-run-probe.mjs 可复现）：
//   31 行「做。」      89
//   夹 9 个「做。」     15
//   变形重复            14
//   同一句 6 次         15
//   正常散文            0
//   长正常文（200 字）    3
// 退化 14~89，正常 0~3，门槛 12 落在中间的空档里。
import test from "node:test";
import assert from "node:assert/strict";
import { lz77 } from "../src/algo/lz77.ts";

const longest = (t) => lz77(t).longest;

test("31 行同一句：最长匹配接近全文长度", () => {
  const t = Array.from({ length: 31 }, () => "做。").join("\n");
  assert.ok(longest(t) >= 80, "应当接近全文，实际 " + longest(t));
});

test("夹九次「做。」：最长匹配 15，仍越过门槛 12", () => {
  const t = [
    "第一步读取配置文件，确认两个门槛写在同一个文件里，并且确认它们的默认值出处。",
    "做。", "做。", "做。", "做。", "做。",
    "第二步核对台账，看最近判红的样本是不是同一份思考，还是分散在不同轮次上。",
    "做。", "做。", "做。", "做。",
    "第三步再决定要不要改阈值，改之前先问原来的值是怎么定下来的。",
  ].join("\n");
  assert.ok(longest(t) >= 12, "剖面重复应当越过 12，实际 " + longest(t));
});

test("正常散文：最长匹配 0~3，远低于门槛", () => {
  const t =
    "读完配置后我把三个阈值都记下来，然后逐条核对它们是不是写在同一个文件里。" +
    "阈值分别在 defaults 与 config 两处声明，读的时候后者覆盖前者。";
  assert.ok(longest(t) <= 6, "正常文本不该有长匹配，实际 " + longest(t));
});

test("长正常文（200 字、有常见短语）：仍低于门槛 12", () => {
  const t =
    "读完配置之后我把三个阈值都记录下来，然后逐条核对它们是不是写在同一个文件里面。" +
    "阈值分别在 defaults 与 config 两处声明，读取的时候后者会覆盖前者。" +
    "如果两处写得不一样，换一台机器跑出来的结果就会不同，所以判据里额外加了一条跨字段检查。" +
    "写完这一段之后我又回读了一遍，确认没有把阈值写错。";
  assert.ok(longest(t) < 12, "长正常文不该越过 12，实际 " + longest(t));
});

test("变形重复（同一段话改写两遍）：最长匹配 >= 12", () => {
  const t =
    "先看台账确认最近的判红集中在同一份思考上，如果是说明计数把流式帧当成了次数。" +
    "先查台账确认最近的判红都集中在同一份思考里，若是的话，说明计数把流式帧当成了次数。";
  assert.ok(longest(t) >= 12, "改写两遍应当抓到 12 以上，实际 " + longest(t));
});

test("去重与判定同源：去重后的文本比原文短，且不再有长匹配", () => {
  const t = Array.from({ length: 20 }, () => "同一句话反复出现。").join("\n");
  const r = lz77(t);
  assert.ok(r.deduped.length < t.length, "去重后应当更短：" + r.deduped.length + " vs " + t.length);
  assert.ok(r.deduped.includes("〔重复"), "应当留下可见的标记");
  assert.ok(lz77(r.deduped).longest < r.longest, "去重后最长匹配应当下降");
});

test("纯函数：同一输入两次调用结果一致，输入不被改写", () => {
  const t = Array.from({ length: 12 }, () => "跑。").join("\n");
  const copy = t;
  const a = lz77(t);
  const b = lz77(t);
  assert.equal(a.longest, b.longest);
  assert.equal(a.matches.length, b.matches.length);
  assert.equal(t, copy, "输入不能被改写");
});
