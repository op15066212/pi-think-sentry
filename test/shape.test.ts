// 六维结构判据：截图那段与三种退化形状都要判红，正常文本一票不投。
//
// 样本来自用户 2026-11-24 的截图（pideck pr 会话）：每行以「务实：」开头，
// 有的还是「务实：务实：」双层。前三条判据（dup/inline/run）在这段上一律不判。
import test from "node:test";
import assert from "node:assert/strict";
import { shapeOf, stripMdPrefix } from "../src/algo/shape.ts";

const SCREENSHOT = Array.from({ length: 18 }, (_, i) =>
  [
    "务实：关键洞察：我上一轮把 resolveAnchoredTurnWindow 改成锚点在但没命中的分支。",
    "务实：这是我的改动引入的性能灾难。",
    "务实：务实：必须改掉：锚点未命中不能返回全量。",
    "务实：正确做法：用索引里的位置兜底选窗口。",
    "务实：务实：但渲染层没有索引位置。",
    "务实：更根本：用户问能不能只加载可视范围内的。",
  ][i % 6],
).join("\n");

const TAIL_FIXED = Array.from({ length: 14 }, (_, i) =>
  "第 " + (i + 1) + " 项检查完毕，结论是没有问题，记录一下。",
).join("\n");

const SAME_LEN = Array.from({ length: 12 }, (_, i) =>
  "甲" + String(i).padStart(2, "0") + "乙丙丁戊己庚辛壬癸子丑寅卯辰",
).join("\n");

const NORMAL_A = [
  "先看配置文件的默认值，确认三个门槛各自写在哪里。",
  "然后核对磁盘上的实际配置，看有没有人手工改过。",
  "如果两边不一致，说明改过之后没同步，要查是哪一次改动。",
  "最后跑一遍判据，确认改完之后行为没变。",
  "结论写进 HISTORY，不写进代码注释——注释会被下次重构删掉。",
  // 2026-11-24：行数门槛从 4 提到 8（4 行里 2 行相同就是 50%，那是段短不是退化），
  // 这个样本补到 8 行，测试的才是「缩进维度被跳过」，不是「行数太少」。
  "改完先看 git status，有别人的脏文件就先停手。",
  "提交信息写为什么，不写 update 或 fix。",
  "推完用远端复核一次，不看自己的输出。",
].join("\n");

test("截图那段（行首固定）：判红，且至少两票", () => {
  const s = shapeOf(SCREENSHOT);
  assert.ok(s.votes >= 2, "应当至少两票，实际 " + s.votes + "：" + s.why);
  assert.equal(s.red, true);
});

test("截图那段：行首维度必须越线（那一项是 100%）", () => {
  const s = shapeOf(SCREENSHOT);
  const head = s.dims.find((d) => d.name === "行首");
  assert.ok(head.over, "行首应当越线，实际 " + head.share.toFixed(2));
});

test("行尾固定：判红（换一种形状也要抓得住）", () => {
  const s = shapeOf(TAIL_FIXED);
  assert.equal(s.red, true, "行尾固定应当判红：" + s.why);
  const tail = s.dims.find((d) => d.name === "行尾");
  assert.ok(tail.over, "行尾应当越线");
});

test("行长整齐：判红", () => {
  const s = shapeOf(SAME_LEN);
  assert.equal(s.red, true, "行长整齐应当判红：" + s.why);
});

test("正常散文 A：零票，不判", () => {
  const s = shapeOf(NORMAL_A);
  assert.equal(s.votes, 0, "正常文本不该投票：" + s.why);
  assert.equal(s.red, false);
});

test("整段无缩进不算退化（缩进维度被跳过）", () => {
  const s = shapeOf(NORMAL_A);
  const ind = s.dims.find((d) => d.name === "缩进");
  assert.equal(ind.top, "0", "正常文本确实没有缩进");
  assert.equal(ind.over, false, "无缩进不该算票");
});

test("行数太少不判：三行以内的比例没有统计意义", () => {
  const s = shapeOf("甲乙丙。\n丁戊己。\n庚辛壬。");
  assert.equal(s.red, false);
  assert.equal(s.n, 3);
});


// ── 2026-11-24：真实数据上误报 125 段之后加的三条 ──
//
// 用户指着屏幕说「让你看思维链退化」，我跑自己判据却发现它在乱判：
// 2045 段真实思考里 129 段判红，抽样一看全是 markdown 列表符号与 4 行短段。
// 真退化与误报的分界是：真退化是「同一个词占满每行开头」，误报是「语法符号本来就在那儿」。

test("markdown 列表不该判红：- 开头是语法，不是文字重复", () => {
  const md = [
    "- 32-52（三个解析测试）",
    "- 96-125（契约测试）",
    "- 读 anchors 再改",
    "- 改完跑一次全量",
    "- 提交信息写为什么",
    "- 推完用远端复核",
    "- 不看自己的输出",
    "- 有别人的脏文件就先停",
    "- 攒着的改动会被污染",
    "- 一次提交一件事",
  ].join("\n");
  const s = shapeOf(md);
  const head = s.dims.find((d) => d.name === "行首");
  assert.ok(head, "要把行首维度报出来");
  assert.equal(head.over, false, "剥掉 '-' 之后行首是各自的正文，不该越线：" + s.why);
  assert.equal(s.red, false, "整段不该判红：" + s.why);
});

test("行首绝对次数门槛：4 行里 2 行相同不算集中", () => {
  const short = ["执行。", "改动核对。", "执行。", "看结果。"].join("\n");
  const s = shapeOf(short);
  assert.equal(s.votes, 0, "行少时比例会骗人，4 行 2 相同 = 50% 但只出现 2 次：" + s.why);
});

test("真退化仍然判红：务实：占满行首，且绝对次数远超门槛", () => {
  const bad = [
    "用户说「别发错人」。",
    "务实：我发给了数学组 2，用户说发错人了。",
    "务实：截图里有两个分组，pr 和插件。",
    "务实：协作对象应该是另一个 agent 会话。",
    "务实：但它可能不是我以为的那个。",
    "务实：我不该猜，先问一句。",
    "务实：但那违反了不问要不要。",
    "务实：所以先做手上的活，再确认发给谁。",
    "务实：撤回不了，只能先说清楚。",
    "务实：继续做插件。",
  ].join("\n");
  const s = shapeOf(bad);
  assert.ok(s.votes >= 2, "「务实」占了 9/10 行，应当至少两票：" + s.why);
  assert.equal(s.red, true);
  const head = s.dims.find((d) => d.name === "行首");
  assert.ok(head.count >= 8, "行首绝对次数要报出来，实际 " + (head ? head.count : "无"));
});

test("stripMdPrefix：列表、标题、引用、表格、反引号都剥，正文不动", () => {
  assert.equal(stripMdPrefix("- 一条"), "一条");
  assert.equal(stripMdPrefix("  1. 步骤"), "步骤");
  assert.equal(stripMdPrefix("> 引用"), "引用");
  assert.equal(stripMdPrefix("### 标题"), "标题");
  assert.equal(stripMdPrefix("| 表格 |"), "表格");
  assert.equal(stripMdPrefix("- [x] 勾了"), "勾了");
  assert.equal(stripMdPrefix("- - 叠加"), "叠加");
  assert.equal(stripMdPrefix("**加粗开头**"), "加粗开头**");
  // 正文里的字一个不动
  assert.equal(stripMdPrefix("务实：直接改"), "务实：直接改");
});
test("同一输入两次结果一致（纯函数）", () => {
  const a = shapeOf(SCREENSHOT);
  const b = shapeOf(SCREENSHOT);
  assert.deepEqual(a.dims.map((d) => d.share), b.dims.map((d) => d.share));
  assert.equal(a.votes, b.votes);
});
