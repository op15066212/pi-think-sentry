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
