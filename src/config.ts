import fs from "node:fs";
import path from "node:path";
import intercept from "./features/intercept.ts";
import dup from "./features/dup.ts";
import lang from "./features/lang.ts";
import inline from "./features/inline.ts";
import strip from "./features/strip.ts";
import inject from "./features/inject.ts";
import bindingMod from "./features/binding.ts";
import { clearRejects } from "./values.ts";

// 五个功能模块，一个功能一个单例。顺序就是配置文件的顺序。
// 加功能只需在这里多一行，读写与兜底不用动。
export const MODULES = [intercept, dup, lang, inline, strip, inject, bindingMod];

const pluginDir = path.join(import.meta.dirname, "..");
export const configFile = () => process.env.CURB_CONFIG_FILE || path.join(pluginDir, "settings.json");

// 默认值从各模块自己的 defaults 拼出来，不在这里另写一份。
export const defaults = () => {
  const out = {} as Record<string, any>;
  for (const m of MODULES) out[m.name] = { ...m.defaults };
  return out;
};

// 旧形状迁移：selfCheck / selfCheckText 曾经平铺在顶层。读的时候挪进 inject，
// 写回去的时候只写新形状，旧键自然消失。
const migrate = (raw: any) => {
  const out = { ...raw };
  if (out.inject === undefined && (out.selfCheck !== undefined || out.selfCheckText !== undefined)) {
    out.inject = {
      on: out.selfCheck === false ? false : true,
      text: typeof out.selfCheckText === "string" ? out.selfCheckText : "",
    };
  }
  delete out.selfCheck;
  delete out.selfCheckText;
  return out;
};

// 读文件的结果只有两种，没有第三种。
//
// 2026-11-21 之前它返回 `{}`，于是「文件不存在」「文件不是合法 JSON」「文件真是空的」
// 三态合一。三个真缺陷都从那个合一里长出来：删行门槛比判据松、注入不幂等、配置被写没。
// 上一个修法是给 writeConfig 加一个 if——那是在类外打分支，只挡住一个调用方。
// 换成这里的两态之后，任何新调用方都拿不到「假装成功」的对象：要么解包 value，
// 要么自己写清楚读不到时怎么办。类型上就不存在「读失败返回一个值」这件事。
type Read =
  | { ok: true; raw: Record<string, any> }
  | { ok: false; why: "missing" | "broken" };

const readRaw = (): Read => {
  let text: string;
  try { text = fs.readFileSync(configFile(), "utf8"); }
  catch { return { ok: false, why: "missing" }; }
  try {
    const v = JSON.parse(text);
    // 合法但不是对象（null / 数组 / 字符串）也算坏：写回去一样会丢东西。
    if (!v || typeof v !== "object" || Array.isArray(v)) return { ok: false, why: "broken" };
    return { ok: true, raw: migrate(v) };
  } catch {
    return { ok: false, why: "broken" };
  }
};

// 读配置时最后一次读失败的原因，给命令输出用。人改坏了配置文件要能看见。
let lastProblem: "missing" | "broken" | null = null;
export const readProblem = () => lastProblem;

// 文件不在就写一份默认的，写一次之后不再覆盖：用户改过的值不能被启动流程冲掉。
export const ensureConfig = () => {
  try {
    const r = readRaw();
    if (r.ok) return;
    if (r.why === "broken") return;   // 坏了不动它：等人来修，别把内容冲掉
    fs.mkdirSync(path.dirname(configFile()), { recursive: true });
    fs.writeFileSync(configFile(), JSON.stringify(defaults(), null, 2) + "\n");
  } catch {}
};

// 读配置：读不到就用默认值。这是**显式降级**——插件必须能起来，
// 但降级只发生在这一层，且原因记在 lastProblem 里，不会悄悄变成一个值往外传。
export const readConfig = () => {
  // 体检报告每次重读都重算：它描述的是「最近读过的这份配置」，不是历史累计。
  // 体检报告只有一册（R8/R9）：门槛类与类型类的拒绝都记在 values.ts 的 rejects 里，
  // 由这一行统一清空。它描述的是「最近读过的这份配置」，不是历史累计。
  clearRejects();
  const r = readRaw();
  lastProblem = r.ok ? null : r.why;
  const raw = r.ok ? r.raw : {};
  const out = {} as Record<string, any>;
  for (const m of MODULES) out[m.name] = m.configure(raw[m.name]);
  return out;
};

// 写配置：只接受该模块 defaults 里声明过的键，别的键忽略。
// 三种状态各走各的路：读到了就合并写回；文件不存在就从默认值起头（首次配置）；
// 文件坏了就一个字都不写——这时候写等于覆盖，而覆盖是删数据。
export const writeConfig = (name: any, patch: any) => {
  const m = MODULES.find((x) => x.name === name);
  if (!m) return null;
  const r = readRaw();
  if (!r.ok && r.why === "broken") {
    return { error: "配置文件不是合法 JSON，没有写入。先修好它再改配置，否则原有内容会被覆盖。" };
  }
  try {
    const raw = r.ok ? { ...r.raw } : {};
    const cur = raw[name] && typeof raw[name] === "object" && !Array.isArray(raw[name]) ? raw[name] : {};
    const next = { ...m.defaults, ...cur };
    for (const k of Object.keys(m.defaults)) if (patch[k] !== undefined) next[k] = patch[k];
    raw[name] = next;
    fs.mkdirSync(path.dirname(configFile()), { recursive: true });
    fs.writeFileSync(configFile(), JSON.stringify(raw, null, 2) + "\n");
  } catch {
    // 写失败必须说出来（2026-11-20，R2 复核 · 会话 31e5cf4e）：只读文件、磁盘满、路径不可写时，
    // 此前这里吞掉异常并照样返回 readConfig()[name]——盘上一个字节没动，输出却是一个正常的模块对象。
    // 它与「写入成功、且新值恰好等于旧值」不可区分；而同一函数的另一种失败（坏 JSON）是带 error 出口的，
    // 两个失败形状不同这件事本身就是缺陷：调用方无法只凭返回值知道「这次到底写没写」。
    return { error: "配置文件写入失败（只读、磁盘满或路径不可写），没有写入。" };
  }
  return readConfig()[name];
};
