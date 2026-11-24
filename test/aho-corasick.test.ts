// Aho-Corasick 判据：一次扫描找出所有模式的所有出现位置，并按区间扣除。
//
// 这是防回灌的整体化：不是「这一行像不像标记」，而是「这段内容是不是我注入过的那一段」。
// 模型把标记改一个标点、拆成两行、掺进别的话，按内容认仍然认得出。
import test from "node:test";
import assert from "node:assert/strict";
import { buildAC, excise } from "../src/algo/aho-corasick.ts";

test("单模式：一次命中，位置与长度都对", () => {
  const ac = buildAC(["重复 5 字"]);
  const hits = ac.scan("前面〔重复 5 字〕后面");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].len, "重复 5 字".length);
  assert.equal(hits[0].end, "前面〔重复 5 字".length);
});

test("多模式：短模式不被长模式遮住", () => {
  const ac = buildAC(["重复", "重复 5 字"]);
  const hits = ac.scan("〔重复 5 字〕");
  const names = hits.map((h) => ["重复", "重复 5 字"][h.pattern]).sort();
  assert.deepEqual(names, ["重复", "重复 5 字"].sort(), "两个模式都该命中，实际：" + JSON.stringify(names));
});

test("失败指针：跨模式边界也能接上（abc + bcd 在 abcd 里都要命中）", () => {
  const ac = buildAC(["abc", "bcd"]);
  const hits = ac.scan("abcd");
  const names = hits.map((h) => ["abc", "bcd"][h.pattern]).sort();
  assert.deepEqual(names, ["abc", "bcd"], "两个都该命中，实际：" + JSON.stringify(names));
});

test("同一模式多次出现：全部报出来", () => {
  const ac = buildAC(["做。"]);
  const hits = ac.scan("做。做。做。");
  assert.equal(hits.length, 3);
});

test("空模式被跳过：不会自环，也不会永远命中", () => {
  const ac = buildAC(["", "真"]);
  assert.equal(ac.test("假"), false);
  assert.equal(ac.test("真"), true);
});

test("excise：按字符区间扣除，句子中间的标记只扣掉那一段", () => {
  const ac = buildAC(["〔重复 5 字〕"]);
  const text = "前半句〔重复 5 字〕后半句";
  const out = excise(text, ac.scan(text));
  assert.equal(out, "前半句后半句");
});

test("excise：重叠命中合并成一段，不产生重复扣", () => {
  const ac = buildAC(["重复", "重复 5 字"]);
  const text = "〔重复 5 字〕";
  const out = excise(text, ac.scan(text));
  assert.equal(out, "〔〕", "应当只剩括号，实际：" + out);
});

test("excise：跨行命中也能扣（标记被拆成两行时）", () => {
  const ac = buildAC(["重复 5\n字"]);
  const text = "前〔重复 5\n字〕后";
  assert.equal(excise(text, ac.scan(text)), "前〔〕后");
});

test("没有命中时原样返回，不复制字符串", () => {
  const ac = buildAC(["不存在的东西"]);
  const text = "完全无关的一段话";
  assert.equal(excise(text, ac.scan(text)), text);
});
