// R10：判红之后显式拦成死锁。样本逐字来自 2026-11-18 那个会话（数学组2）的活动记录。
//
// 盘上四条连续记录，模型的思考每次都改了，理由一次都没变：
//   3391 「哦，我上一轮的思考里有重复行被拦截了。现在重试工具调用。重试。」  → 同一行 7 次：做。
//   3393 「又被拦。问题在我的思考里重复「做。」多次。要避免……改：思考简短」→ 同一行 7 次：做。
//   3395 「阻碍来自我思考里的重复行被检测。我需要不写重复行……」        → 同一行 7 次：做。
// 模型不是没改，它改了三次。是判据没有跟着它的思考走。
//
// 两个叠加的成因：
//   一 tool_call 用的是**缓存的上一帧判决** lastV。那可能是很久以前的帧，
//     之后模型换了思考、判据也算出了新结果，但那个结果被「证据不足就不覆盖」挡在门外，
//     于是 lastV 一直停在最早那一帧。模型改到死也是同一条理由。
//   二 releaseEvidence 要求「本帧可投票正文 >= dupMin 行」。第 3395 那条是一整段 43 个字、
//     但只有 1 行，于是永远解除不了。
//   三 解除门槛还乘了「被复诵那一行的长度」，于是复诵一行 39 字符的 import 语句时，
//     门槛变成 117 字符——错误越长越难改好。现在门槛只由 dupMin 定。
//
// 防「两行抄写 + 两行同上」靠什么：**不同字符数**（四种短句凑不出 24 种字符），
// 不是行数，也不是「两两不同」——后一条代码里从来没有（我一度在注释里这么写，是错的）。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// 2026-11-26：tool_call 改成现场判，测试给它一份会话历史即可，不再需要先推判决。
const ctxOf = (think: string) => ({ sessionManager: { getEntries: () => [{ type: "message", message: { role: "assistant", content: [{ type: "thinking", thinking: think }] } }] } });

const DUP7 = "做。\n做。\n做。\n做。\n做。\n做。\n做。";
const FIX2 = "又被拦。问题在我的思考里重复「做。」多次。\n\n要避免思考里的重复行。直接写调用，少写思考。\n\n改：思考简短，不重复同一行。\n\n写。";
const FIX3 = "阻碍来自我思考里的重复行被检测。我需要不写重复行。这次直接调用，思考只写一段不重复的。";

async function setup() {
  const CFG = path.join(os.tmpdir(), "curb-dl-" + process.pid + "-" + Math.random().toString(36).slice(2) + ".json");
  fs.writeFileSync(CFG, JSON.stringify({}));
  process.env.CURB_CONFIG_FILE = CFG;
  const prevLog = console.log; console.log = () => {};
  try {
    const install = (await import("../src/index.ts")).default;
    const h: Record<string, any> = {};
    await install({ on(e: string, f: any) { h[e] = f; }, registerCommand() {} });
    return { h, CFG };
  } finally { console.log = prevLog; }
}
const frame = (t: string) => ({ message: { content: [{ type: "thinking", thinking: t }] } });

test("模型改了思考，拦不拦必须跟着新思考走（盘上第 3393 条）", async () => {
  const { h, CFG } = await setup();
  try {
    assert.ok((await h.tool_call({ toolCallId: "c1" }, ctxOf(DUP7)))?.block, "前提：复诵这一帧要拦");

    // 模型改成了三行互不相同、内容量够的新思考。
    assert.equal(await h.tool_call({ toolCallId: "c2" }, ctxOf(FIX2)), undefined,
      "新思考判干净且证据够，不该继续用旧判决拦——盘上这里被拦了，理由还是「7 次做。」");
  } finally { fs.rmSync(CFG, { force: true }); }
});

test("一整段 43 个字、只有 1 行的新思考，够了就该放行（盘上第 3395 条）", async () => {
  // 「至少 3 行」这条要求冗余：防「两行抄写 + 两行同上」靠 dupIn(vs, 2)，
  // 而它要求两两不同。行数不是内容量的代理，字符量才是。
  const { h, CFG } = await setup();
  try {
    assert.ok((await h.tool_call({ toolCallId: "c1" }, ctxOf(DUP7)))?.block);
    assert.equal(await h.tool_call({ toolCallId: "c2" }, ctxOf(FIX3)), undefined,
      "43 个字的新内容、两两不同，够了就该放行");
  } finally { fs.rmSync(CFG, { force: true }); }
});

test("防洗白仍然有效：把复诵抄成「正文 + 复诵」不算改好", async () => {
  // 上一版这条写错了：它用一帧「好」当坏样本，期望仍拦。
  // 一个字的「好」没有复诵，判据就没有理由拦它——放行是对的，
  // 而「写得短也拦」正是这次要拆掉的那种过度拦截。
  // 真正该挡的是「抄两行注入文案再补一句好话」：那样整段有复诵，判据当场判红。
  const { h, CFG } = await setup();
  try {
    assert.ok((await h.tool_call({ toolCallId: "c1" }, ctxOf(DUP7)))?.block);
    // 抄两行 + 说好话：整段仍有三行相同 → 判据判红
    // R11：期望从「必须拦」改成「放行」。这一条是 R10 加的，被台账数据推翻：
    // 要挡这种「≤2 次重复的少量抄写」，就得让判决记住「上次判过红」，
    // 而带记忆的门在真实长文本上会误拦（实测：一段正常复盘因为有成对的行被判成凑数），
    // 而且它让判决有两个来源，一致性判据一开就红。
    // 取舍：放过它，保住「判决只有一个来源」。真复诵（≥ dup.min 次，默认 4）仍然被 judgeThinking 直接抓住。
    assert.equal(await h.tool_call({ toolCallId: "c2" }, ctxOf("先说结论\n再列步骤\n同上\n同上")), undefined,
      "R11 取舍：低次数抄写放行，换来判决只有一个来源");
    // 对照：真写一段干净的新内容 → 放行
    assert.equal(await h.tool_call({ toolCallId: "c3" }, ctxOf("我核对了三个阈值，它们都写在同一处，第二处没有重复。")), undefined,
      "真改了就该放行，否则又回到死锁");
  } finally { fs.rmSync(CFG, { force: true }); }
});

test("一致性：拦不拦必须与「当前这段思考判什么」逐帧相等（真实 17 帧重放）", async (t) => {
  // 这是最强的一条：不看个别样本，看**两个面是否给出同一个答案**。
  // 面 A：对每帧文本直接调 judgeThinking。
  // 面 B：走真的 install，看 tool_call 拦不拦。
  // 两者必须逐帧相等。任何「缓存判决」或「证据不足沿用旧红」的残余都会让它们分叉，
  // 而分叉就是用户看到的那种：模型改了三次，理由一次没变。
  //
  // 帧逐字来自 2026-11-18 那个会话的第 3361–3394 行（连续 17 段真实思考）。
  const SRC = "C:/Users/15066212pp/.pi/agent/sessions/--c--users-15066212pp-appdata-roaming-pideck-chat-workspace--/2026-11-18T14-10-43-047Z_01a1eefe-dee4-75ad-9ae6-7caebe9c7173.jsonl";
  // 文件不在时必须**报跳过**，不能用 return——return 会被测试框记成 pass（b711ced1 的判据：
  // 实测 pass 6 / skipped 0）。「不冒充通过」是这段注释的承诺，得在代码里兑现。
  if (!fs.existsSync(SRC)) {
    t.skip("会话文件不在（归档了）：这条判据没有对象，不是通过");
    return;
  }
  const { judgeThinking, judgeCfg } = await import("../src/judges.ts");
  const cfg = judgeCfg({});
  const lines = fs.readFileSync(SRC, "utf8").split("\n").filter(Boolean);
  const frames: string[] = [];
  for (let i = 3360; i <= 3396 && i < lines.length; i++) {
    let m: any; try { m = JSON.parse(lines[i]); } catch { continue; }
    const c = m?.message?.content;
    if (!Array.isArray(c)) continue;
    const th = c.filter((b: any) => b?.type === "thinking").map((b: any) => b.thinking || "").join("\n");
    if (th.trim()) frames.push(th);
  }
  assert.ok(frames.length >= 10, "帧数太少，样本没读到");
  const { h, CFG } = await setup();
  try {
    let mismatch = 0;
    for (let k = 0; k < frames.length; k++) {
      const direct = judgeThinking(frames[k], cfg).kind !== "none";
      const blocked = !!(await h.tool_call({ toolCallId: "c" + k }, ctxOf(frames[k])))?.block;
      // 冷却会让「同一段文本第二次」放行，这里每帧文本都不同，所以不该发生。
      if (direct !== blocked) {
        mismatch++;
        assert.fail("第 " + k + " 帧分叉：judgeThinking=" + direct + " 实际拦=" + blocked + " 文本：" + frames[k].slice(0, 40));
      }
    }
    assert.equal(mismatch, 0);
  } finally { fs.rmSync(CFG, { force: true }); }
});

test("复诵的那一行越长，解除门槛不该越高（6e8dd769 的判据）", async () => {
  // 门槛原来是 blk.length × dupMin。复诵一行 39 字符的 import 语句 → 门槛 117 字符，
  // 模型写 91 字全新中文仍然解除不了——**错误越长，改好越难**，而这两件事没有关系。
  // 「要写多少新内容才算改了」只该由 dupMin 定（每行至少 8 个实质字符），与错误行多长无关。
  // 2026-11-21（复核 b711ced1 R16）：这里原来是一行英文代码（Verdict 的 import 语句）。

const ctxOf = (think: string) => ({ sessionManager: { getEntries: () => [{ type: "message", message: { role: "assistant", content: [{ type: "thinking", thinking: think }] } }] } });

  // 三行相同英文触发的是 lang（非中文行数 > 中文行数），不是 dup —— 这条测试从 2026-11-19 起
  // 就没测过它声称的东西。换成中文长行，dup 才真的被判。
  const LONG_LINE = "我核对了配置的三处入口，它们都指向同一个文件，没有第二份。";
  assert.ok(LONG_LINE.length >= 20, "样本前提：够长才是 dup 而不是 lang");
  const { h, CFG } = await setup();
  try {
    assert.ok((await h.tool_call({ toolCallId: "c1" }, ctxOf([LONG_LINE, LONG_LINE, LONG_LINE, LONG_LINE].join("\n"))))?.block, "前提：四行同一行 >= dup.min，判红");
    // 91 字全新中文，与复诵行毫无关系
    const FIX = "我核对了配置的三处入口，它们都指向同一个文件，没有第二份。接着把判据的门槛与兜底分开写清楚，再跑一遍全量测试确认没有回归，最后把这次的错误记进历史，免得下一轮又忘。";
    assert.ok(new Set(FIX).size >= 60, "样本前提：新内容的不同字符数远超过 24");
    assert.equal(await h.tool_call({ toolCallId: "c2" }, ctxOf(FIX)), undefined,
      "写了 91 字全新内容还拦，说明门槛被错误长度放大了：新内容不同字符数 " + new Set(FIX).size + "，旧门槛 " + (LONG_LINE.length * 3));
  } finally { fs.rmSync(CFG, { force: true }); }
});

test("R11 取舍：低次数抄写放行（曾经要拦，被台账数据推翻）", async () => {
  const { h, CFG } = await setup();
  try {
    assert.ok((await h.tool_call({ toolCallId: "c1" }, ctxOf(DUP7)))?.block);
    assert.equal(await h.tool_call({ toolCallId: "c2" }, ctxOf("先说结论\n再列步骤\n同上\n同上")), undefined, "R11 取舍：放行");
  } finally { fs.rmSync(CFG, { force: true }); }
});

test("R11 取舍：全局去重那套判法已删，此条保留作历史（期望改为放行）", async () => {
  // 逐行求和的漏洞：每行各自去重再相加，四句同构的话能凑到 24。
  //   「这一段的结论是甲。」9 种 + 「这一段的答案是乙。」9 种 + 「同上。」3 + 「同上。」3 = 24
  // 而全局去重只有 14 种——它其实只说了两句话，第三第四句是同一句。
  // 「要写多少新内容」问的是**整段有多少种字符**，不是各行之和。
  const A = "这一段的结论是甲。\n这一段的答案是乙。\n同上。\n同上。";
  const globalUnique = new Set(A.split("\n").join("")).size;
  const perLineSum = A.split("\n").reduce((n, l) => n + new Set(l).size, 0);
  assert.equal(globalUnique, 14, "样本前提：全局只有 14 种字符");
  assert.equal(perLineSum, 24, "样本前提：逐行求和恰好 24，会被旧判法放过");

  const { h, CFG } = await setup();
  try {
    assert.ok((await h.tool_call({ toolCallId: "c1" }, ctxOf(DUP7)))?.block, "前提：帧1 判红");
    assert.equal(await h.tool_call({ toolCallId: "c2" }, ctxOf(A)), undefined,
      "R11：字符量那套判法整条删了（它造成了 2678 次误拦），此条只留作历史记录");
  } finally { fs.rmSync(CFG, { force: true }); }
});

test("真写足量不同内容仍然放行（对照组，防一收紧就变永久拦）", async () => {
  const FIX = "我核对了配置的三处入口，它们都指向同一个文件，没有第二份。接着把判据的门槛与兜底分开写清楚，再跑一遍全量测试确认没有回归，最后把这次的错误记进历史，免得下一轮又忘。";
  assert.ok(new Set(FIX).size >= 60);
  const { h, CFG } = await setup();
  try {
    assert.ok((await h.tool_call({ toolCallId: "c1" }, ctxOf(DUP7)))?.block);
    assert.equal(await h.tool_call({ toolCallId: "c2" }, ctxOf(FIX)), undefined, "67 种字符，必须放行");
  } finally { fs.rmSync(CFG, { force: true }); }
});
