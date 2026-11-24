// 防回灌的整体化判据：注入文本被抄到**中间**、被改一个标点、被拆成两行时，
// 仍要认出来并扣掉。
//
// 旧实现（dropInjectedTail）只剥末尾那几行，且要求逐字相同：
// 模型把标记抄到中间就完全失效——而它抄的仍然是同一次注入。
// 新实现把注入过的每一段建成自动机，一次扫全文，按字符区间挖掉。
import test from "node:test";
import assert from "node:assert/strict";
import { exciseInjectedForTest } from "../src/judges.ts";

const INJECTED = "〔重复 5 字〕";

test("抄到中间：旧实现看不见，新实现扣掉", () => {
  const text = "前半句" + INJECTED + "后半句";
  const out = exciseInjectedForTest(text, [INJECTED]);
  assert.equal(out, "前半句后半句", "中间的注入应当被扣掉，实际：" + out);
});

test("抄多次：全部扣掉，不是只扣第一次", () => {
  const text = INJECTED + "甲" + INJECTED + "乙" + INJECTED;
  const out = exciseInjectedForTest(text, [INJECTED]);
  assert.equal(out, "甲乙", "三处都该扣，实际：" + out);
});

test("标记被拆成两行：仍按内容认得出", () => {
  const text = "前〔重复 5\n字〕后";
  const out = exciseInjectedForTest(text, ["重复 5\n字"]);
  assert.equal(out, "前〔〕后", "跨行命中应当扣掉，实际：" + out);
});

test("标记周围掺了别的话：只扣标记本身，不误伤周围", () => {
  const text = "我先说一句，" + INJECTED + "然后继续正常内容。";
  const out = exciseInjectedForTest(text, [INJECTED]);
  assert.equal(out, "我先说一句，然后继续正常内容。");
});

test("没注入过就不动：空列表原样返回", () => {
  const text = "完全正常的一段思考";
  assert.equal(exciseInjectedForTest(text, []), text);
});

test("太短的模式不参加匹配：避免把单字当标记扣掉", () => {
  const text = "这是一段正常的话，里面有「的」和「了」。";
  const out = exciseInjectedForTest(text, ["的", "了"]);
  assert.equal(out, text, "单字模式应当被跳过，实际：" + out);
});

// 处置痕迹的回灌（2026-11-24 实测之后加）。
//
// 数据：外部附注·已删重复在历史里出现 1088 次、当前附注·第N行起重复 444 次，
// 时间从 2026-11-18 传到 2026-11-21。最直接的证据是一段被拦之后的思考：
//   「（不写重复行。）」紧接着三行「做。」
// 判据处置完留下的痕迹，被读回来当成新的句子模仿——这就是回灌。
//
// 修法两条：新文案改成固定短字面（不带数字，自动机认得住），旧痕迹逐条列进 LEGACY_TRACES。
test("固定短字面被抄进思考：扣掉，不算复诵", () => {
  const t = "[已折叠：重复]\n[已折叠：重复]\n[已折叠：重复]\n[已折叠：重复]";
  const out = exciseInjectedForTest(t, ["[已折叠：重复]"]);
  assert.equal(out.replace(/\n/g, ""), "", "四处都该扣掉，实际：" + JSON.stringify(out));
});

test("历史痕迹（外部附注）：不传 skip 也能扣掉", () => {
  const t = "前面的话\n[外部附注：已删重复。]\n后面的话";
  // 第二个参数故意为空：LEGACY_TRACES 是内置的，不依赖配置
  const out = exciseInjectedForTest(t, []);
  assert.ok(!out.includes("外部附注"), "历史痕迹该被扣掉，实际：" + out);
  assert.ok(out.includes("前面的话") && out.includes("后面的话"), "周围内容不该动");
});

test("旧的带数字附注：形状不固定，自动机认不住（这是已知边界）", () => {
  const t = "前面\n[第 35 行起重复 8 次，已折叠]\n后面";
  const out = exciseInjectedForTest(t, []);
  // 这一条测的是「为什么要把新文案改成不带数字」：带数字的认不住。
  // 如果哪天有人把数字加回去，这条会红，提醒他回灌的路又开了。
  assert.ok(out.includes("第 35 行起重复"), "带数字的痕迹本就不该被自动机扣掉（记下这个边界）");
});

test("新文案与旧痕迹可以同时被扣", () => {
  const t = "甲\n[已折叠：重复]\n乙\n[外部附注：已删重复。]\n丙";
  const out = exciseInjectedForTest(t, ["[已折叠：重复]"]);
  assert.ok(!out.includes("已折叠"), "新文案该扣");
  assert.ok(!out.includes("外部附注"), "旧痕迹该扣");
  assert.ok(out.includes("甲") && out.includes("乙") && out.includes("丙"), "正文都该留着");
});
