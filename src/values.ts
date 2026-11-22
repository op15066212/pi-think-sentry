// 配置值的类型层：raw → 值，类型由 defaults 决定。
//
// 为什么要有这一层（2026-11-22 R8）：此前每个 feature 的 configure 各写一遍
// `r.on === false ? false : true`、`Number.isFinite(n) ? n : 3`。这带来两个实测缺陷：
//   1 命令 `think-sentry intercept cooldown false` 写进去的是字符串 "false"，
//     configure 判 === false 为假，于是**冷却仍然开着，而命令返回 {${key}: true} 看起来成功了**。
//     反方向同样：`binding allowGateway true` 写字符串 "true"，网关仍然关着。
//   2 配置里写 `"ratio": ""`（清空某个值最常见的写法）时 Number("") 是 0，
//     于是行内下限变 0（判据退化）、块级下限变 0（块级判据永不判红）。**判据半失效，没有任何提示。**
// 两处的共同形状是：同一个值在「写进去」与「读出来」两侧用不同的规则解释。修法不是给
// 每个 feature 补一条 if，而是把「raw 是什么类型」这件事只判一次。
//
// 三态分清楚：没配（undefined/null/空串）→ 默认值，不记账；
//           配了且合法 → 归一化成默认值的类型；
//           配了但不合法 → 默认值 + 记一笔（给人看的体检报告）。
// 判据（test/r8.test.ts 前八条）：删掉任何一条记账，那一条坏样本就变成静默兜底。

type Reject = { key: string; raw: string };

let rejects: Reject[] = [];
/** 读配置的入口调用：报告描述的是「最近读过的那份配置」，不是历史累计。 */
export const clearRejects = () => { rejects = []; };
export const rejectsOf = () => rejects.slice();
/** 记账。**导出**：threshold.ts 的门槛类拒绝也记进这一册（R9 第二版）。 */
export const reject = (key: string, raw: any) => { rejects.push({ key, raw: JSON.stringify(raw) }); };

/** 没配：三种写法都算「这个键没被赋值」。空串是手写配置里最常见的「清空」。 */
const absent = (raw: any) => raw === undefined || raw === null || raw === "";

// 真值/假值各点名一遍。写入侧（index.ts 的命令行）复用同一张表：
// 读与写认同一组词，才谈得上互逆。
export const TRUE_WORDS = ["true", "1", "on", "yes"];
export const FALSE_WORDS = ["false", "0", "off", "no"];
const TRUE = new Set(TRUE_WORDS);
const FALSE = new Set(FALSE_WORDS);

/**
 * raw → boolean。真值与假值各自点名，**不认识的抛给记账，不猜**。
 * 此前 `=== false ? false : true` 的后果：写 "false" 得到 true，写 "no" 也得到 true。
 */
export function asBool(def: boolean, raw: any, key = ""): boolean {
  if (absent(raw)) return def;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw !== 0;
  if (typeof raw === "string") {
    const s = raw.trim().toLowerCase();
    if (TRUE.has(s)) return true;
    if (FALSE.has(s)) return false;
  }
  reject(key, raw);
  return def;
}

/**
 * raw → 0..1 的数（比例类）。夹值在这里做一次。
 * 0 是合法值（不是「没配」）：`langLineRatio: 0` 就是「关掉行内比例判据」的旧行为，要认。
 */
/** 比例的取值域：0..1，含端点，认小数。**只有这一处**——命令行与手写配置都问它。 */
export const validUnit = (raw: any): number | null => {
  if (absent(raw)) return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n) || n < 0 || n > 1) return null;
  return n;
};

export function asUnit(def: number, raw: any, key = ""): number {
  if (absent(raw)) return def;
  const n = validUnit(raw);
  if (n === null) { reject(key, raw); return def; }
  return n;
}

/**
 * raw → 不小于 floor 的整数（条数类）。上限没意义（豁免越多越保守）。
 * 与 threshold.ts 的分工：那边是**门槛**（dup.min / strip.min，语义是「够几次就判」），
 * 这边是**条数**（boundaryMinExempt，语义是「至少几行才算看不见」）。两者取值域相同，
 * 但报错的措辞不同，所以不合成一个——合成之后「门槛」这个词会指两件事。
 */
export function asCount(def: number, raw: any, key = "", floor = 1): number {
  if (absent(raw)) return def;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < floor) { reject(key, raw); return def; }
  return n;
}

/** raw → 字符串。非字符串一律记账退回默认，不让 `{}` 混进文本。 */
export function asText(def: string, raw: any, key = ""): string {
  if (absent(raw)) return def;
  if (typeof raw === "string") return raw;
  reject(key, raw);
  return def;
}

/** raw → 限定枚举，认不出就退回默认并记账。空串算没配。 */
export function asEnum<T extends string>(def: T, raw: any, allowed: readonly T[], key = ""): T {
  if (absent(raw)) return def;
  if (typeof raw === "string" && (allowed as readonly string[]).includes(raw)) return raw as T;
  reject(key, raw);
  return def;
}

/** raw → 对象（不含数组）。数组与标量都算配错：`texts` 写成字符串会让三个模板同时消失。 */
export function asObject(raw: any, key = ""): Record<string, any> {
  if (absent(raw)) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, any>;
  reject(key, raw);
  return {};
}
