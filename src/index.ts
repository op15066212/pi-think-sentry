// pi 扩展接线：只做分发。
// 功能各自一个模块（src/features/，清单见 src/config.ts 的 MODULES），配置读写集中在 src/config.ts。
// 这里没有业务判断，只有「哪个事件交给哪个模块」。
import fs from "node:fs";
import path from "node:path";
import { MODULES, readConfig, writeConfig, configFile, ensureConfig, readProblem } from "./config.ts";
import { validThreshold, MIN_FLOOR } from "./threshold.ts";
import { TRUE_WORDS, FALSE_WORDS, rejectsOf, validUnit } from "./values.ts";
import { detectBinding, label as bindingLabel, type Binding } from "./features/binding.ts";
import { judgeThinking, judgeCfg, type JudgeCfg } from "./judges.ts";
import intercept, { SAY_BLOCK, SAY_LANG } from "./features/intercept.ts";
import { planSignatureCleanup, planSignatureCleanupIncremental, type CleanupState } from "./algo/signature.ts";
import { branchEntries } from "./algo/branch.ts";

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
// 台账位置可用环境变量覆盖：与 stateFile 同一写法，测试要把台账指到临时文件才能断言「不虚高」。
const ledgerFile = () => process.env.PI_THINK_SENTRY_LEDGER || path.join(pluginDir, "ledger", "judgments.jsonl");
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
// 2026-11-21：原来只有四个数，任意两个都配不成对，
// 于是「拦得准不准」这个问题在数据里没有答案。计数不是为了数，是为了成对比出来的。
export const stats = {
  judgeCalls: 0, turns: 0, red: 0, blocked: 0, redCalls: 0,
  cleaned: 0, judgeErrors: 0,
  // skippedByBinding：因为后端会拒或会丢而放弃改写的轮数。与 turns 成对。
  skippedByBinding: 0,
  // turnJudgeErrors：turn_end 里判据抛异常的轮数。与 judgeErrors（帧级）分开——
  // 复核说「两处自增混单位」，但删掉一处会丢信息（轮级抛了看不见），所以拆成两个数。
  turnJudgeErrors: 0,
};

const thinkingOf = (msg: any) => (msg?.content || []).filter((c: any) => c?.type === "thinking").map((c: any) => c.thinking || "").join("\n");

const pluginDir = path.join(import.meta.dirname, "..");

// 代码指纹（2026-11-23）：用户问「为什么没拦住」，第一件要排除的是「跑的是旧代码」。
// 此前只有 VERSION（package.json 里的字符串），改代码不改版本号就分不出来——
// 而「改了没重启」是最常见的假故障，也是唯一一个不修代码就能好的。
// 记入口文件与判据文件的 mtime；/think-sentry 再读一次盘上的 mtime 比对。
const CODE_FILES = ["src/index.ts", "src/judges.ts", "src/verdict.ts", "src/features/strip.ts"];
const codeStamp = () => {
  const out = [];
  for (const f of CODE_FILES) {
    try { out.push(f + "@" + Math.round(fs.statSync(path.join(pluginDir, f)).mtimeMs)); }
    catch { out.push(f + "@?"); }
  }
  return out.join(" ");
};
const LOADED_STAMP = codeStamp();
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
// 由这里把 cfg.dup / cfg.lang 投影成一个 JudgeCfg 传下去。
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
  // 2026-11-24 修：这里此前只传了 dupOn 与 langOn，于是 run / prefix(shape) / unified
  // 三个开关即使配置里写了 on:true 也不会生效——判据写了、测了，生产里从没跑过。
  // 「配好了 ≠ 生效了」这一条在插件内部同样成立。
  jcfg = judgeCfg({
    dupOn: c.dup.on, dupMin: c.dup.min,
    langOn: c.lang.on, langDir: c.lang.dir, boundaryMinExempt: c.intercept.boundaryMinExempt,
  });
  return c;
};
// 2026-11-27 删掉三个死状态：lastThink / lastV / lastRedThink。
// 它们来自 2026-11-22 那一版（每帧预判、tool_call 时查 lastV）。
// 判据改成 tool_call 现场判之后，本文件第 318 行附近的注释已经写着「原来那一堆
// lastThink / lastV / redFrames / sawRed 都没了」——注释说删了，变量还在，而且没人发现：
//   lastThink     只在声明处 = ""，从不写非空  → 恒空
//   lastV         只在 if (lastThink) 里写     → 那个分支永不执行，恒 null
//   lastRedThink  只在声明处 = ""              → 恒空
// 发现它的是一条新判据（check-rules-coverage 的 staleModuleState）：
// 模块级 let 若除声明处没有任何赋值，它就恒等于初值——那要么是死状态，要么该写 const。
const refresh = () => {
  const m = statStamp();
  if (m === cfgStamp && cfg) return cfg;
  cfgStamp = m;
  applyCfg(readConfig());
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
  // 2026-11-25：这里原来有一段「这个键是对象，命令行改不了」的分支，
  // 唯一需要它的形状是 inject.texts。注入删掉之后没有对象型字段了，分支随之删除——
  // 留着它是「没有读者的代码」，而它保护的误用已经写不出来。
  return { ok: true, v: raw };
};

// 命令：think-sentry <模块> <键> <值>。键来自模块自己的 defaults，不另列一份。
// 状态行：pi 里的命令与 bin/status.mjs 共用一套格式。
// 两处各写一遍，迟早不一样（这正是「一处可写」要防的）。
// CLI 里 binding 是 unknown、stats 全 0——那是另一个进程的状态，配置文件才是两者的共同事实。
export const statusLines = () => {
  const c = readConfig();
  const stale = LOADED_STAMP !== codeStamp();
  const b = bindingLabel(binding);
  const lines = [
    "capture " + (b.startsWith("on") ? "on" : "off") + "   code " + (stale ? "旧代码(重启)" : "最新"),
    "回合 " + stats.turns + "  红 " + stats.red + "  拦 " + stats.blocked + "  处置 " + stats.cleaned,
    "dup " + c.dup.min + "   lang " + c.lang.dir + "   strip " + c.strip.min,
    "拦截 " + (c.intercept.on ? "开" : "关") + "   清理签名 " + (c.signature.on ? "开/" + c.signature.keepTurns + "轮" : "关"),
  ];
  const problem = readProblem();
  if (problem) lines.push("问题 " + String(JSON.stringify(problem)).slice(0, 34));
  return lines;
};

const runCommand = (args: any) => {
  const a = String(args || "").trim();
  const c = readConfig();
  if (!a) {
    // 把「配置文件读坏了」直接放进输出：人改坏了得能看见，不然插件只是安静地用默认值跑。
    // rejected 同理：门槛给了值但不合法时会被静默兜底，这里把次数摆出来。
    // R7：第一项就是 capture——配置写了却因为是 Anthropic/responses 而不生效时，
    // 人得在这儿看出来，而不是以为改写生效了。
    // 默认 4 行短表，每行 ≤ 44 字符（2026-11-23 用户三次反馈：一坨 JSON 很丑、会溢出、没有复制按钮）。
    // 要机读就加参数：/think-sentry json
    return statusLines().join(String.fromCharCode(10));
  }
  if (a === "json") {
    const stale2 = LOADED_STAMP !== codeStamp();
    return JSON.stringify({
      capture: bindingLabel(binding),
      code: { loaded: LOADED_STAMP, onDisk: codeStamp(), stale: stale2 },
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
  ledger({ v: VERSION, ev: "boot", cwd: import.meta.dirname, config: configFile(), code: LOADED_STAMP });
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

  // 签名清理的水位：只处理「刚过期」的那几条，不每轮把历史重数一遍（2026-11-25）。
  // 与 stats 一样按会话归零：换会话时 entries 换了一套，旧水位没有意义。
  let sigState: CleanupState = { boundary: 0 };
  // 2026-11-26 使用者把范围收到两个：「tool_call 拒绝执行」与「清 thinkingSignature」。
  // 因此这里只注册**两个钩子**。删掉的是 before_agent_start 与 message_update：
  // 前者只为重置帧级状态，后者每帧判一次（流式一段 1268 字符的思考会来几十帧）。
  //
  // 关键改动：判据从「每帧预判、tool_call 时查 lastV」改成 **tool_call 现场判**。
  // 取的是当前分支里最后一条 assistant 的思考（branchEntries，不是文件全集），
  // 判完立刻决定拦不拦 —— 判决与动作在同一次调用里完成，没有中间状态可漂移。
  // 代价（写清楚）：不再有「流式过程中就发现退化」的提前量。收益：每帧一次判据的 CPU
  // 没了，状态机也没了（原来那一堆 lastThink / lastV / redFrames / sawRed 都是为跨帧
  // 传判决而存在，删掉钩子它们同时失去意义）。


  /** 会话历史里最后一条 assistant 消息的 thinking 原文。 */
  const lastAssistantThinking = (entries: any[]): string => {
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i];
      if (e?.type === "message" && e?.message?.role === "assistant") return thinkingOf(e.message);
    }
    return "";
  };

  pi.on("tool_call", async (_event: any, ctx: any) => {
    const c = refresh();
    syncBinding(ctx, c);
    if (!c.intercept.on) return undefined;

    const all: any[] = branchEntries(ctx);
    const think = lastAssistantThinking(all);
    // 没有思考可判就放行。空 thinking 是「思考已输出完、现在在出工具调用」，不是判决。
    if (!think.trim()) return undefined;

    let v: any = null;
    try {
      v = judgeThinking(think, jcfg);
    } catch (e: any) {
      // 判据抛了就放行，但计数必须涨：非零说明有调用根本没判——
      // 「判了但干净」与「没判」必须能分开，否则这个数没有意义。
      stats.judgeErrors++;
      trace("hook", { h: "tool_call", phase: "error", why: String(e?.message || e) });
      return undefined;
    }

    const red = !!(v && v.kind !== "none");
    if (red) { stats.red++; stats.redCalls++; }
    trace("hook", { h: "tool_call", kind: v?.kind ?? null, len: think.length });

    const reason = intercept.reason(v, c.intercept.on);
    if (!reason) { if (red) writeState(); return undefined; }

    stats.blocked++;
    writeState();
    ledger({ v: VERSION, ev: "block", len: think.length, kind: v?.kind ?? null, reps: v?.ev?.reps ?? null, blk: v?.ev?.blk ?? null });
    return { block: true, reason };
  });

  pi.registerCommand?.("think-sentry", {
    description: "pi-think-sentry：查看与修改功能开关和参数",
    handler: async (args: any, ctx: any) => {
      const out = runCommand(args);
      ctx?.ui?.notify?.(out, "info");
      if (args) { applyCfg(readConfig()); cfgStamp = statStamp(); }
      return out;
    },
  });

  // turn_end 只剩一件事：清 thinkingSignature（保留最近 keepTurns 轮）。
  // 这一条是使用者 2026-11-24 明确要的，仍然写 context_edit —— 抹的是签名，不是内容。
  pi.on("turn_end", async (event: any, ctx: any) => {
    const c = refresh();
    syncBinding(ctx, c);
    // 分母只算走完的轮次：中断/报错的回答没有完整结果，计进去会低估拦截率。
    if ((event?.outcome ?? "unknown") === "completed") stats.turns++;
    const entries: any[] = [];
    if (c.signature.on) {
      try {
        // branchEntries() 取当前分支（不是文件全集）；context_edit 的 targetId
        // 能指向任意 entry，所以清历史不需要改 jsonl（B1 边界不变）。
        const all: any[] = branchEntries(ctx);
        // 增量版：幂等修好后第二轮起产出恒为 0，全量扫 26000 条要 4.4ms。
        // 水位停在「上一次的过期区右端」，跨会话归零（见 sigState）。
        const inc = planSignatureCleanupIncremental(all, c.signature.keepTurns, sigState);
        sigState = inc.state;
        for (const ed of inc.edits) entries.push(ed);
        if (inc.edits.length) trace("hook", { h: "turn_end", phase: "signature", cleaned: inc.edits.length });
      } catch (e: any) {
        // 清签名失败不该影响这一轮的其它提案：记一笔，继续。
        trace("hook", { h: "turn_end", phase: "signature-error", why: String(e?.message || e) });
      }
    }
    // 落一次状态：turns 是分母，只在内存里加就等于「本轮没发生过」。
    writeState();
    if (!entries.length) return undefined;
    // 返回 entries 会替换掉「这一轮已经提案的那些」，不是追加（pi 文档：returning entries or
    // continue replaces only that field）。所以必须显式带上 event.entries，否则同时装了别的
    // turn_end 扩展时，它们的提案会被整段盖掉——不是报错，是安静地不生效。
    return { entries: [...(Array.isArray(event?.entries) ? event.entries : []), ...entries] };
  });
}
