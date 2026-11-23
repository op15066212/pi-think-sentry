// pi 扩展接线：只做分发。
// 五个功能各自一个模块（src/features/），配置读写集中在 src/config.ts。
// 这里没有业务判断，只有「哪个事件交给哪个模块」。
import fs from "node:fs";
import path from "node:path";
import { MODULES, readConfig, writeConfig, configFile, ensureConfig, readProblem } from "./config.ts";
import { validThreshold, MIN_FLOOR } from "./threshold.ts";
import { TRUE_WORDS, FALSE_WORDS, rejectsOf, validUnit } from "./values.ts";
import { detectBinding, label as bindingLabel, type Binding } from "./features/binding.ts";
import { judgeThinking, judgeCfg, type JudgeCfg } from "./judges.ts";
import { templateKeyOf } from "./verdict.ts";
import strip from "./features/strip.ts";
import inject from "./features/inject.ts";
import intercept, { SAY_BLOCK, SAY_LANG } from "./features/intercept.ts";

export { SAY_BLOCK, SAY_LANG };

const trace = (tag: string, data: Record<string, unknown> = {}) => {
  if (!process.env.CURB_TRACE) return;
  process.stderr.write("[pi-think-sentry] " + tag + " " + JSON.stringify(data) + "\n");
};

// 判红与拦截的可读台账（R11）。为什么需要它：用户报「模型改了思考，拦它的理由一直是旧的」，
// 而我在磁盘上重放那段文本得到的是「判干净、该放行」——两者矛盾，光看代码分不出是
// 代码有洞还是进程跑着旧代码。Trace 走 stderr，在 PiDeck 里看不见。
// 这里把「实际判的原文」与「判决」一起落盘，让矛盾可以读出来，不必再猜。
// 有界：只在判红与拦截时写，每次会话量的千分之一；文件超过 2MB 就重开。
const ledgerFile = () => path.join(pluginDir, "ledger", "judgments.jsonl");
const ledger = (rec: Record<string, unknown>) => {
  try {
    const f = ledgerFile();
    fs.mkdirSync(path.dirname(f), { recursive: true });
    try { if (fs.statSync(f).size > 2 * 1024 * 1024) fs.renameSync(f, f + ".1"); } catch {}
    fs.appendFileSync(f, JSON.stringify({ at: new Date().toISOString(), pid: process.pid, ...rec }) + "\n");
  } catch {}
};

// 计数，成对出现才有意义：
//   judgeCalls / turns   判据被算过多少帧（含流式）与处理过多少条回答——前者是帧不是思考，别拿它当分母
//   red   / turns        多少条回答「中途判红过」——判红发生在工具调用之前，不是回答结束时；
//                        2026-11-21 实测：blocked=2 而 red=0，因为两者记的是不同时刻
//   blocked / redCalls   判红之后就地拦下的比例。两者都在 tool_call 这同一个位置各加一，
//                        分母与分子同源（2026-11-22）。此前用 red 当分母：red 的单位是「轮」，
//                        blocked 的单位是「次调用」，比值没有意义（实测 33/150 = 22%，读不出任何东西）
//   cleaned / turns      真删过东西的回答比例
//   opaque / judgeCalls  判据看不见这一段的帧比例（整段落进围栏/缩进）
//   judgeErrors           判据抛过几次。非零就说明有帧根本没判——与「判了但干净」必须分开
// 2026-11-21：原来只有 judgeCalls / blocked / cleaned / injected 四个，任意两个都配不成对，
// 于是「拦得准不准」这个问题在数据里没有答案。计数不是为了数，是为了成对比出来的。
export const stats = {
  judgeCalls: 0, turns: 0, red: 0, blocked: 0, redCalls: 0,
  cleaned: 0, injected: 0, judgeErrors: 0,
  // skippedByBinding：因为后端会拒或会丢而放弃改写的轮数。与 turns 成对。
  skippedByBinding: 0,
  // turnJudgeErrors：turn_end 里判据抛异常的轮数。与 judgeErrors（帧级）分开——
  // 复核说「两处自增混单位」，但删掉一处会丢信息（轮级抛了看不见），所以拆成两个数。
  turnJudgeErrors: 0,
};

const thinkingOf = (msg: any) => (msg?.content || []).filter((c: any) => c?.type === "thinking").map((c: any) => c.thinking || "").join("\n");

const pluginDir = path.join(import.meta.dirname, "..");
/** 日志里带版本：判「跑的到底是哪一版」时，这是唯一自证。 */
const VERSION = (() => { try { return JSON.parse(fs.readFileSync(path.join(pluginDir, "package.json"), "utf8")).version; } catch { return "?"; } })();
const stateFile = () => process.env.CURB_STATE_FILE || path.join(pluginDir, "state.json");

// 会话键：CURB_SESSION_KEY 是测试专用覆盖，优先级最高（2026-11-22）。
// 没有它的时候，PiDeck 跑着就一定设了 PIDECK_SESSION_ID，测试设 PI_SESSION_FILE 完全无效——
// 实测：设 AAA 与 BBB 两个会话，盘上写的都是 PiDeck 的 id，于是「按会话分键」这件事
// 从来没有判据，test/state.test.ts 只能写 find(k => k !== "other") 绕过去。
const sessionKey = () => process.env.CURB_SESSION_KEY
  || process.env.PIDECK_SESSION_ID
  || (process.env.PI_SESSION_FILE ? path.basename(process.env.PI_SESSION_FILE, ".jsonl") : "local");

// 配置什么时候重读：场外手改 settings.json 必须能生效（2026-11-22）。
// 此前只有 install 与命令之后两处读，人改了文件而插件仍用旧值——「配好了 ≠ 生效了」。
// 不进 message_update（实测每轮 1500+ 帧），只在三个边界处各 stat 一次。
let cfg: any = null;
let cfgStamp = -1;
// 判据的配置与 cfg 同源，一次构建（2026-11-22 第二版）：judges 不再持有全局，
// 由这里把 cfg.dup / cfg.lang / cfg.inject 投影成一个 JudgeCfg 传下去。
// 投影只发生在这一处，所以「判据用的门槛」不可能是第二份。
let jcfg: JudgeCfg = judgeCfg();
// R7：这台机器上「改 thinking 会不会被后端拒或丢」。默认按能改起步，
// message_update 拿到 ctx.model 后每次重算（换模型不用重启）。
export let binding: Binding = { capture: true, reason: "unknown", provider: "", api: "", model: "" };
const statStamp = () => { try { return fs.statSync(configFile()).mtimeMs; } catch { return 0; } };

// 「这台机器上改 thinking 会不会被后端拒或丢」只在两处需要知道：
//   message_update 要它来决定拦不拦之后记什么
//   turn_end 要它来决定改不改写
// R8：此前两处各自写一行 detectBinding(...)，都赋值给模块级的 binding——
// 同一个真值两个写入口。合成的这个函数是唯一入口，且带缓存：
// **只有 (provider, api, model, allowGateway) 这四元组变了才重算**，
// 于是 message_update 里不需要 statSync（注释早就说「不进 message_update」，代码之前是进的）。
let bindingKey = "";
const syncBinding = (ctx: any, c: any) => {
  const m = ctx?.model;
  if (!m) return binding;
  const allow = !!c?.binding?.allowGateway;
  const key = [m.provider, m.api, m.id || m.model, allow].join("|");
  if (key !== bindingKey) {
    bindingKey = key;
    binding = detectBinding(m, { allowGateway: allow });
    trace("hook", { h: "binding", key });
  }
  return binding;
};
const applyCfg = (c: any) => {
  cfg = c;
  jcfg = judgeCfg({
    dupOn: c.dup.on, dupMin: c.dup.min,
    langOn: c.lang.on, langDir: c.lang.dir, boundaryMinExempt: c.intercept.boundaryMinExempt,
    // 三份模板都要剥：judgeCfg 按换行切，所以 join 成一行（传数组会被 String() 变成逗号拼接）。
      skip: c.inject.on ? [c.inject.texts.dup, c.inject.texts.lang, c.inject.texts.clean].filter(Boolean).join(String.fromCharCode(10)) : "",
  });
  return c;
};
// 最后一帧的文本与判决：搬到模块级，是为了让 refresh 在配置变化时能重算（2026-11-22 第三版）。
// 此前它们是 install 的闭包变量，配置变了以后旧判决照样被 tool_call 使用——
// 同一次调用里「开关是新配置、判决是旧配置」（实测：手改 dup.min 3→5，仍拦）。
let lastThink = "";
let lastV: any = null;
const refresh = () => {
  const m = statStamp();
  if (m === cfgStamp && cfg) return cfg;
  cfgStamp = m;
  applyCfg(readConfig());
  // 配置变了：上一帧的判决是用旧配置算出来的，必须用新配置重算，不能沿用。
  // 重算而不是清空，是因为文本还在——清空会造出「改配置即绕过拦截」的窗口。
  if (lastThink) lastV = judgeThinking(lastThink, jcfg);
  trace("hook", { h: "config", reload: true, stamp: m });
  return cfg;
};

// state 与 settings.json 不是一类东西，判据是「写进去的东西是谁产生的」：
//   配置是人手写的——丢了要人重写，不可逆，所以读失败必须停下写；
//   这份是插件自己的计数——机器写的、可重建，丢了只是从 0 开始。
// 所以这里保留三合一（损坏 = 空 = 不存在），而 config.ts 换成了两态。
// 2026-11-21 实测过这个取舍：把 state.json 写成坏 JSON，拦截照常发生（tool_call 仍返回
// block），只有计数从 0 起。如果哪天这里开始存「行为」而不是「观测」，这个取舍就得翻。
const readState = () => {
  try {
    const v = JSON.parse(fs.readFileSync(stateFile(), "utf8"))[sessionKey()];
    if (v && typeof v === "object") return v;
  } catch {}
  return {};
};

// 一次写盘带全部计数；顺手丢掉一天前的旧会话，免得文件无限长。
const writeState = () => {
  try {
    fs.mkdirSync(path.dirname(stateFile()), { recursive: true });
    let all = {} as Record<string, any>;
    try { all = JSON.parse(fs.readFileSync(stateFile(), "utf8")); } catch {}
    all[sessionKey()] = { ...stats, at: Date.now() };
    const kept = {} as Record<string, any>;
    for (const [k, v] of Object.entries(all)) {
      if (Number(v?.at || 0) > Date.now() - 86400000) kept[k] = v;
    }
    fs.writeFileSync(stateFile(), JSON.stringify(kept));
  } catch {}
};

// 命令行的值按 defaults 的类型解析：**解析失败就不写文件**（2026-11-22 第二版）。
// 此前 number 分支直接 Number(raw)：NaN 写进配置后 JSON.stringify 变 null，
// threshold 把 null 当「没配」静默兜底——命令返回 {"min":3}，看起来成功了。
// boolean 分支同理：任何不是 false/off 的字串都变 true。
// 现在类型知识只来自 defaults（一处），校验与写入在同一个函数里。
const parseValue = (d: any, raw: string): { ok: true; v: any } | { ok: false; why: string } => {
  // R8：写入侧按 defaults 的类型归一化，三种类型各一支。
  // 此前只有 number 一支，boolean 与 string 原样写字符串——于是配置里出现 "cooldown": "false"，
  // 读的时候要靠 asBool 宽容解释才能生效。能生效不等于对了：defaults 说它是布尔，
  // 盘上却存着字符串，第三份代码（比如人自己写的脚本）读到就会分叉。
  // 读与写认同一组词（values.ts 的 TRUE_WORDS / FALSE_WORDS），才谈得上互逆。
  if (typeof d === "boolean") {
    const s = raw.trim().toLowerCase();
    if (TRUE_WORDS.includes(s)) return { ok: true, v: true };
    if (FALSE_WORDS.includes(s)) return { ok: true, v: false };
    return { ok: false, why: "开关只认 " + TRUE_WORDS.concat(FALSE_WORDS).join("/") + "，收到 " + JSON.stringify(raw) + "。没有写入。" };
  }
  if (typeof d === "number") {
    // 同一个 number 有两种取值域，按 **defaults 的形状**分派（默认值是小数 → 比例；
    // 默认值是 >= 1 的整数 → 门槛/条数）。此前一律走 validThreshold，
    // 于是 think-sentry lang ratio 0.5 被拒，报错说「不小于 2 的整数」——
    // 而手写 {"ratio": 0} 被 asUnit 接受。同一个键两个取值域，命令行与手写会分叉。
    const isUnit = Number.isInteger(d) === false && d > 0 && d < 1;
    if (isUnit) {
      const u = validUnit(raw);
      if (u === null) return { ok: false, why: "比例必须在 0 到 1 之间（含 0 与 1），收到 " + JSON.stringify(raw) + "。没有写入。" };
      return { ok: true, v: u };
    }
    const v = validThreshold(raw);
    if (v === null) return { ok: false, why: "数字必须是不小于 " + MIN_FLOOR + " 的整数，收到 " + JSON.stringify(raw) + "。没有写入。" };
    return { ok: true, v };
  }
  // 对象类（inject.texts）没有「一行命令行写进去」的形状：说清楚，别让人以为改成功了。
  if (typeof d === "object" && d !== null) {
    return { ok: false, why: "这个键是对象，命令行改不了。用 think-sentry " + "<模块> 看当前值，或直接编辑配置文件。" };
  }
  return { ok: true, v: raw };
};

// 命令：think-sentry <模块> <键> <值>。键来自模块自己的 defaults，不另列一份。
const runCommand = (args: any) => {
  const a = String(args || "").trim();
  const c = readConfig();
  if (!a) {
    // 把「配置文件读坏了」直接放进输出：人改坏了得能看见，不然插件只是安静地用默认值跑。
    // rejected 同理：门槛给了值但不合法时会被静默兜底，这里把次数摆出来。
    // R7：第一项就是 capture——配置里写了 inject.text 却因为是 Anthropic/responses 而不生效时，
    // 人得在这儿看出来，而不是以为改写生效了。
    return JSON.stringify({
      capture: bindingLabel(binding),
      ...stats, lang: c.lang.dir, config: c, file: configFile(),
      problem: readProblem(), rejects: rejectsOf(),
    });
  }
  const parts = a.split(/\s+/);
  const name = parts[0];
  const m = MODULES.find((x) => x.name === name);
  if (!m) {
    return "可用模块：" + MODULES.map((x) => x.name).join("、") + "。用法：think-sentry <模块> <键> <值>";
  }
  const key = parts[1];
  if (!key) return JSON.stringify({ [name]: c[name] });
  const raw = parts.slice(2).join(" ");
  let patch = null;
  if (key === "on" || key === "off") {
    // 第三段会被静默忽略（"dup on maybe" 曾经照样写成 on:true）。多余参数必须说出来。
    if (parts.length > 2) return "开关的用法是「" + name + " on」或「" + name + " off」，不接受第三个参数。没有写入。";
    patch = { on: key === "on" };
  }
  else if ((m.defaults as Record<string, any>)[key] !== undefined) {
    const parsed = parseValue((m.defaults as Record<string, any>)[key], raw);
    if (!parsed.ok) return parsed.why;
    patch = { [key]: parsed.v };
  }
  if (!patch) {
    return "未知键：" + key + "。可用：" + Object.keys(m.defaults).join("、");
  }
  const next = writeConfig(name, patch);
  return JSON.stringify({ [name]: next });
};

export default async function installGuard(pi: any) {
  // 启动即留痕（R11）：这一行是「这个进程加载了哪一版」的唯一自证。
  // 没有它的时候，我只能比进程启动时刻与文件修改时刻——那是推断，不是证据。
  ledger({ v: VERSION, ev: "boot", cwd: import.meta.dirname, config: configFile() });
  ensureConfig();
  applyCfg(readConfig());
  cfgStamp = statStamp();
  // 后门要能看见（2026-11-22）：强制开关让任何非空思考恒红。
  // 此前它只写在注释里，输出里没有——「这次全红」是模型退化还是环境变量没清，从外面分不出来。
  for (const k of ["CURB_FORCE_STRIP", "CURB_FORCE_RETRACT", "CURB_FORCE_EMPTY"]) {
    if (process.env[k]) process.stderr.write("[pi-think-sentry] 警告：" + k + " 开着，判据会把任何非空思考判红（仅测试用）\n");
  }
  const saved = readState();
  // 按会话回填：saved 里没有的键必须归零，不能留着上一个会话的值（2026-11-22）。
  // 只回填不清零时，同一进程换会话会继承前一个会话的计数——CURB_SESSION_KEY 一可控，
  // 这条立刻被 state.test.ts 抓到（BBB 的 blocked 会变成 2）。
  for (const k of Object.keys(stats)) (stats as Record<string, any>)[k] = Number.isFinite(saved[k]) ? saved[k] : 0;

  let lastEntryId: any = null;
  // 本次回答中途是否判红过。判红发生在工具调用前（回答还没结束），到 turn_end 时模型
  // 往往已经改好了，那时再看 lastV 永远是 none——所以必须记「曾经」，不能记「最后」。
  let sawRed = false;

  pi.on("before_agent_start", async () => {
    refresh();
    lastThink = "";
    lastV = null;
    lastEntryId = null;
    sawRed = false;
    trace("hook", { h: "before_agent_start" });
  });

  // 每一帧都判。开哪个模块由 config 决定，judgeThinking 内部按开关走。
  pi.on("message_update", async (event: any, ctx: any) => {
    syncBinding(ctx, cfg);
    stats.judgeCalls++;
    let think = "";
    let v: any = null;
    // trace 分三段：进、出、异常。此前只有一段，判据抛异常时那一行根本不打印，
    // 于是「判据没跑」与「判据跑了判干净」在 stderr 上不可区分——RPC 测试读的正是 stderr。
    // 取文本这一步也放进 try：畸形 message（content 的 getter 抛错）会让 handler 整段崩掉，
    // 崩掉与「判了但干净」必须能分开。
    try {
      think = thinkingOf(event?.message);
      trace("hook", { h: "message_update", phase: "in", len: think.length });
      v = judgeThinking(think, jcfg);
    } catch (e: any) {
      stats.judgeErrors++;
      trace("hook", { h: "message_update", phase: "error", why: String(e?.message || e) });
      return;
    }
    // R12：删掉了「判据看不见这段就不更新判决」（opaque）。那是防御，不是判据。
    // 判干净，但上次判红且本帧内容量不够 → 沿用上次红（防「抄两行 + 两行同上」凑数）。
    // R10：这里的判据是**量**，不是形状。原来那层要求「整段一次复诵都没有」，
    // 真实思考里几乎总有列表项重复，于是 17 段真实连续思考里 15 段永久沿用旧红。
    // 门槛只由 dupMin 定：每行至少 8 个实质字符（R3 复核 b711ced1 的 L7/L8/L9）。
    // R10 第二版（6e8dd769 的判据）：原来还乘了被复诵那一行的长度，
    // 于是复诵一行 39 字符的 import 语句时门槛变成 117——**错误越长，改好越难**，
    // 而「错误行有多长」与「要写多少新内容才算改了」没有关系。实测：91 字全新中文解除不了。
    // R11：这里最后一点「沿用上一次判红」的机制也删掉了。
    //
    // 台账（ledger/judgments.jsonl）把三种门都否掉了，每一种都用真实数据：
    //   一 字符量门（不同字符数 < 24 就沿用旧红）：thin 2678 次、真正的 block 0 次。
    //      模型被拦之后第一反应是写得更短（"成功。极简调用通过。"），越短越拦。
    //   二 复诵迹象门（当前有同一行 ≥2 次就沿用旧红）：真实的长思考里天然有成对的行
    //      （列表项、对照项），实测第 5 帧那段正常复盘就被判成「凑数」。
    //   三 两道门的共同问题：它们让判决有**两个来源**（当前思考 + 上次红的记忆），
    //      而两个来源一定会分叉——一致性判据一开就红。
    //
    // 于是判决只留一个来源：当前这段思考判什么，就拦不拦。
    // 代价写清楚：抄两行注入文案再补一句好话，或者三个占位词，现在都能过。
    // 为什么接受：台账里 2639 次判红全是 ≥9 次的真复诵（414|11 出现 2227 次、634|10 出现 407 次），
    // 一次也不是「低次数抄写」；而每一条防它的门都换来了成百上千次误拦。
    // 判据仍抓 ≥ dupMin（默认 4）次的真复诵，那才是要治的病。
    lastThink = think;
    lastV = v;
    if (v && v.kind !== "none") {
      sawRed = true;
      ledger({ v: VERSION, ev: "red", len: think.length, kind: v.kind, rule: v.rule, reps: v.ev?.reps ?? null, blk: v.ev?.blk ?? null, head: think.slice(0, 160) });
    }
    trace("hook", { h: "message_update", phase: "out", kind: v?.kind ?? null, tag: v?.tag ?? null, forced: !!v?.forced });
  });

  // 判不合格就拦。冷却的键是**判决的身份**（这一块思考的文本），不是调用的身份（R9）。
  //
  // R5 时按 toolCallId 冷却，理由是「同一次调用被反复打回」。实测（数学组1）证明那个键
  // 选错了：模型被拦之后写的是**同一段英文思考**，只是换了个 toolCallId 重试，
  // 于是同一段思考被拦了三次，而模型的第一反应是 "Try a tool that isn't codemode?"
  // ——它在找绕过，不是在改语言。判据变成了障碍。
  //
  // 键换成思考文本之后：同一段思考只拦一次；模型改了思考才再拦。
  // 代价（明确写下）：模型硬顶着不改，第二次就放行。方向是对的——不许无限链（可停）。
  // R12：删掉了冷却（同一段思考只拦一次、超出记 cooled）。那是防御——
  // 挡的是「同一段思考被反复打回」。它一度还把状态冻在最早那一帧（ledger 实测 thin 2678 次）。
  // 现在判决跟着当前思考走，模型改了就走、没改就还拦。没有次数上限，也没有冷却。
  pi.on("tool_call", async (event: any) => {
    const c = refresh();
    const reason = intercept.reason(lastV, c.intercept.on);
    const red = !!(lastV && lastV.kind !== "none");
    if (red) stats.redCalls++;
    trace("hook", { h: "tool_call", kind: lastV?.kind ?? null, blocked: !!reason });
    if (!reason) { if (red) writeState(); return; }
    stats.blocked++;
    writeState();
    ledger({ v: VERSION, ev: "block", len: lastThink.length, kind: lastV?.kind ?? null, reps: lastV?.ev?.reps ?? null, blk: lastV?.ev?.blk ?? null, head: lastThink.slice(0, 160) });
    return { block: true, reason };
  });

  pi.registerCommand?.("think-sentry", {
    description: "pi-think-sentry：查看与修改五个功能的开关和参数",
    handler: async (args: any, ctx: any) => {
      const out = runCommand(args);
      ctx?.ui?.notify?.(out, "info");
      if (args) { applyCfg(readConfig()); cfgStamp = statStamp(); }
      return out;
    },
  });

  pi.on("turn_end", async (event: any, ctx: any) => {
    const c = refresh();
    syncBinding(ctx, c);
    // 后端会拒或会静默丢：只记账，不写 context_edit。
    if (!binding.capture) {
      stats.skippedByBinding++;
      trace("hook", { h: "turn_end", binding: bindingLabel(binding) });
      return;
    }
    const outcome = event?.outcome ?? "unknown";
    if (outcome !== "completed") { trace("hook", { h: "turn_end", skip: outcome }); return; }
    const entryKey = event?.messageEntryId || "";
    if (entryKey !== "" && entryKey === lastEntryId) return;
    lastEntryId = entryKey;

    // 改写的前提是读得出原文数组（2026-11-22 第二版）。不是数组时只记轮次，绝不改写：
    // strip.clean 对非数组兜底成空数组，于是 withMark !== source 恒真，
    // 会生成一条把消息内容清空的 context_edit——那是数据丢失，不是清洗。
    const source = Array.isArray(event?.message?.content) ? event.message.content : null;
    // turn_end 也包 try（2026-11-22 第二版）：message_update 早已包了，这里漏掉了——
    // 同一类「判据抛了就整段崩」在两条路径上必须有同一个收场。抛了仍然往下走：
    // 不删行（v 是 null），注入照旧，轮次照记（否则分母少一条）。
    let v: any = null;
    try { v = judgeThinking(thinkingOf(event?.message), jcfg); }
    catch (e: any) {
            // R7 复核第二轮：两处混单位。拆成两个计数（轮级抛了也要看得见）。
      stats.turnJudgeErrors++;
      trace("hook", { h: "turn_end", phase: "error", why: String(e?.message || e) });
    }
    stats.turns++;
    if (sawRed || (v && v.kind !== "none")) stats.red++;
    trace("hook", { h: "turn_end", kind: v?.kind ?? null });
    if (!source) {
      writeState();
      trace("hook", { h: "turn_end", phase: "skip-non-array" });
      return;
    }

    let content = source;
    if (c.strip.on) {
      const r = strip.clean(source, v, c.strip.min);
      if (r.cleaned) { content = r.content; stats.cleaned++; }
    }

    const before = content;
    // 模板名从 verdict.ts 的表里查，不在调用点写三元（R8）。
    const withMark = c.inject.on ? inject.applyWith(content, c.inject.texts[templateKeyOf(v as any) ?? "clean"] || "", v?.ev) : content;
    if (withMark !== before) stats.injected++;
    writeState();

    const entries = [];
    if (withMark !== source) {
      entries.push({ type: "context_edit", targetId: event.messageEntryId, replacement: { content: withMark } });
    }
    if (!entries.length) return;
    // 返回 entries 会替换掉「这一轮已经提案的那些」，不是追加（pi 文档：returning entries or
    // continue replaces only that field）。所以必须显式带上 event.entries，否则同时装了别的
    // turn_end 扩展时，它们的提案会被整段盖掉——不是报错，是安静地不生效。
    return { entries: [...(Array.isArray(event?.entries) ? event.entries : []), ...entries] };
  });
}
