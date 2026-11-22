import test from "node:test";
import assert from "node:assert/strict";
import { judgeThinking, langJudge, judgeCfg } from "../src/judges.ts";
import { stripDupLines } from "../src/cut.ts";

// 下面四个样本原本散在被删的状态机用例里，判据用例还要用，收回到文件头。
// 注入文案从参数传（2026-11-22）：judges 不再持有全局，skip 由这里显式给。
let skip = "";
const judge = (t: string) => judgeThinking(t, judgeCfg({ skip }));

const PROSE_TAIL = "改完之后重点看退出码是不是零，不去看打印出来的文字，这样才算跑通一次验证。";
const CN_BODY = "读完三个文件后我发现阈值写在配置里而不是代码里，所以下一步应该改配置再跑一次测试看退出码是否为零，然后确认没有别处也写了这个值。";
const TAIL_EN = [
  "I will read the config file first.",
  "Then change the threshold to the new value.",
  "And rerun the test to see the exit code.",
].join("\n");
const HEAD_EN = [
  "Let me check whether the threshold lives in the config.",
  "Or maybe it is in the code somewhere.",
  "I will read both files and compare the values.",
].join("\n");

const FRAG = [
  "读完配置后我把三个阈值都记下来，然后逐条核对它们是不是写在同一个文件里。",
  "（执行）done。",
  "（执行）done。",
  "（执行）done。",
  "（执行）done。",
].join("\n");
const EN = [
  "I think we should read the file first.",
  "Then check whether the threshold is in the config.",
  "So that we can change it and rerun the test.",
].join("\n");
const CN_LONG = "读完三个文件后我发现阈值写在配置里而不是代码里，所以下一步应该改配置再跑一次测试看退出码是否为零，然后确认没有别处也写了这个值。";

test("中文守护：整段英文命中 retract", () => {
  const v = langJudge(EN);
  assert.equal(v.kind, "retract");
  skip = "";
  assert.equal(v.ev.cjk, 0);
  assert.ok(v.ev.cjk === 0 && v.ev.lat >= 60, "整段没有汉字且英文够长才退回，实测 cjk=" + v.ev.cjk + " lat=" + v.ev.lat);
});

test("中文守护：中文夹标识符不误伤", () => {
  const mixed = "读 ECU_PART_NUMBER 的 import 语句，arr.map 在 src/index.ts 里，这一步只是定位字段来源，不涉及逻辑改动，接下来看配置项默认值。";
  assert.equal(judge(mixed).kind, "none");
});

const TPL = String.fromCharCode(10) + "测试模板甲：仅作哨兵。" + String.fromCharCode(10) + "测试模板乙：仅作哨兵。";

test("模板行不算复诵：抄两遍结算模板不该被当成碎片", () => {
  skip = TPL;
  // 2026-11-18 自锁实测：模板要求每轮写留痕，模型把模板抄一遍再写结论，
  // 同一行就出现 3 次，dup 判据随即把工具调用拦下——拦的是我们自己发的文案。
  const s = [TPL, TPL, TPL].join("\n");
  assert.equal(judge(s).kind, "none", "模板行不承载思考内容，判据不该看它");
  skip = "";
});

test("模板里的汉字不能替英文正文顶罪", () => {
  // 更隐蔽的一半：模板全是汉字，langJudge 数到 cjk>0 就判 clean，于是
  // 「整段英文 + 末尾模板」永远撤不掉。剥掉模板之后只剩英文，才判得出来。
  skip = TPL;
  const v = judge(
    [
  "I should read the config file first.",
  "Then check whether the threshold is written in code.",
  "Or whether it is written in config instead.",
].join("\n") + TPL,
  );
  assert.equal(v.kind, "retract", "英文正文 + 中文模板，实际 " + v.kind);
  skip = "";
});

test("中文守护：中文短句夹长标识符不误伤", () => {
  // 这三条在「拉丁/汉字 > 8」这一版下会被判红（误伤）。区分它们的量不是比例而是功能词：
  // 英文正文必有 the/to/of/is 这类虚词，中文夹标识符一个都没有。
  const cn = [
    "读完 argumentation、combo-protocol、lean-kernel。继续读 eigenform、plain-chinese、second-order-cot。",
    "端点：/roleplay/personas（GET），前缀 /<plugin_name>/page。curl 探测。用 token。",
    "PluginConfigUpdateRequest / PluginConfigPayload 定义在别处（models）。用 PUT /api/plugins/config。",
    "GET /api/v1/plugins/config?plugin_id=... 返回 200，接着 PUT 同一路径并打印详情。",
  ];
  for (const line of cn) {
    assert.equal(judge(line).kind, "none", "中文夹标识符不该判红：" + line.slice(0, 34));
  }
});

test("中文守护：结尾整段英文命中 retract", () => {
  skip = TPL;
  const v = judge(CN_BODY + "\n\n" + TAIL_EN);
  assert.equal(v.kind, "retract", "中文正文 + 英文结尾，实际 " + v.kind);
  skip = "";
  assert.ok(v.ev.lines >= 3, "应报全英文行数，实际 " + v.ev.lines);
});

test("中文守护：开头整段英文命中 retract", () => {
  skip = TPL;
  const v = judge(HEAD_EN + "\n\n" + CN_BODY);
  assert.equal(v.kind, "retract", "英文开头 + 中文正文，实际 " + v.kind);
  skip = "";
  assert.ok(v.ev.lines >= 3, "应报全英文行数，实际 " + v.ev.lines);
});

test("中文守护：首尾是命令、参数、标识符时不误伤", () => {
  // 三条各挡一条路径，不是三条在测同一件事：
  //   1 纯英文命令，词数够（git status porcelain src index ts），只有「含代码字符」能挡；
  //   2 纯英文命令，无代码字符，只有「词数不够」能挡；
  //   3 标识符行，词数不够。
  const cases = [
    "git status --porcelain -- src/index.ts",
    "npm run replay sample",
    "ECU_PART_NUMBER",
  ];
  for (const line of cases) {
    assert.equal(judge(line + "\n\n" + CN_BODY).kind, "none", "开头不该判红：" + line);
    assert.equal(judge(CN_BODY + "\n\n" + line).kind, "none", "结尾不该判红：" + line);
  }
});

test("markdown 列表项不算碎片", () => {
  const raw = "- 保留：收尾入口命令与 rc\n- 3 秒\n- python 假绿\n\n" + PROSE_TAIL;
  assert.equal(judge(raw).kind, "none", "列表项是结构不是碎片，现在被判成 " + judge(raw).kind);
});

test("表格行不算碎片", () => {
  const raw = "| 对象 | 类型 |\n|---|---|\n| 大模型 | file |\n| 记忆 | db |\n\n" + PROSE_TAIL;
  assert.equal(judge(raw).kind, "none", "表格行不是碎片");
});

test("编号列表与标题不算碎片", () => {
  const raw = "1. 先读配置\n2. 再看代码\n3. 最后跑测试\n\n## 结论\n\n" + PROSE_TAIL;
  assert.equal(judge(raw).kind, "none", "编号和标题不是碎片");
});

test("缩进代码块里的碎片不算碎片", () => {
  const frag = "做。跑。读。查。改。写。试。看。";
  const body = frag.split("。").filter(Boolean).join("。\n    ");
  let pad = "";
  for (let i = 0; i < 8; i++) pad += "第" + i + "步要读配置文件确认阈值写在哪儿再改代码跑一次测试看退出码是不是零。";
  assert.equal(judge("前一句。\n\n    " + body + "\n\n" + pad).kind, "none", "四空格缩进是代码块");
  assert.equal(judge("前一句。\n\n\t" + body + "\n\n" + pad).kind, "none", "制表符缩进也是代码块");
});

// ===== 预判可以撤（2026-11-18 实测补的）=====
// 状态机原来只有「进 PREDICT」，没有「退出 PREDICT」：帧1 判红进 PREDICT，帧2 判干净，
// 状态还是 PREDICT，下一个工具调用照旧被拦。PREDICT 是「等着拦」，不是「已经介入」，
// 所以判据变干净时必须能退回去。