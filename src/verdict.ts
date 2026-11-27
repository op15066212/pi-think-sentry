// 判据输出与 context 的形状。手写校验，不用 zod：依赖清到零，形状只在一个地方说。
//
// ── 类型（2026-11-23 重构：从「两条正交轴 + 运行时检查」改成依赖和类型）────────────
//
// 旧形状：kind（动作）× rule（来源）两条**独立**轴，允许 3×3 组合，
// 但其中 strip×lang、retract×dup 等根本不成立，靠 parse 里 if 链在运行时挡。
// 结果是：加一种来源（inline）时，必须在 parse 里松开一条 if、在 CHECKS 里加一份、
// 在 strip.clean 里再加一条 `if (rule === "inline")`——**三处各改一次，漏一处不会报错**。
//
// 新形状：判决是**依赖和类型**（Σ-类型），证据的形状随构造子变化：
//
//   Γ ⊢ 判决 : Verdict            Verdict = Σ(k : Kind). EvOf(k)
//   Kind      = none | strip | retract
//   （fold 2026-11-27 删除：inline / run / shape 三个 rule 都不再产生判决，于是没有任何一处产生 fold。）
//   EvOf(none)    = NoneEv        { line? }
//   EvOf(strip)   = DupEv         { blk, reps, why, dups, line }      deps = 行号
//   EvOf(retract) = LangEv        { cjk, lat, lines, dir, sample, line }
//
//   RuleOf : Kind → Set Rule       -- 构造子决定来源的取值集合
//   RuleOf(none)    = { dup, inline, lang }
//   RuleOf(strip)   = { dup }
//   RuleOf(retract) = { lang }
//
// 「strip 配 inline」这个组合**在类型里不存在**，所以没有可写的运行时检查——
// 不是「检查了才不出现」，是「写不出来」。
// 曾经的理由是「fold 的动作（折叠一段、保留该行其余内容）与 strip 不同」，
// 但 fold 从来没有产生点——那句话描述的是一个不会发生的情况，所以 2026-11-27 一起删了。
//
// 穷尽性：每个消费点（strip.clean / 统计）都用 switch 覆盖 Kind，
// default 走 assertNever。加一个 kind 而漏改一处 → tsc 报错（`never` 不可赋值）。
// 这是「删掉一条会红」的类型版：不是跑测试才发现，是编译就红。
//
// 畸形输入一律抛：判据写错要立刻发现，静默通过会让「clean」与「没判」混成一件事。
//
// R12：删掉了第三条轴 tag（clean / opaque）。opaque 是「判据看不见这段，所以不更新判决」——
// 那是防御（挡「贴围栏让判据失明再报干净」），不是使用者要的判据。
// 删掉之后：整段落在围栏里的思考，投票行数为 0，off=0、keep=0、0 > 0 不成立 → 判 clean。
// 模型因此可以靠贴代码解除一次判红。写进 README 的已知边界，不假装它不存在。

const bad = (why: any) => { throw new Error("verdict: " + why); };
const isNum = (x: any) => typeof x === "number" && Number.isFinite(x);

export type Kind = "none" | "strip" | "retract";
// prefix 曾经是一个规则名，但它就是 shape 的行首维度（配置键名沿用旧名）。
// 一个判据两个入口 = 同一真值两处各写一遍，所以名字收成一个：shape。
export type Rule = "dup" | "inline" | "lang" | "run" | "shape";

/** 构造子的穷尽清单。顺序即文档顺序，不再单独维护一份 KINDS 字符串数组。 */
export const KINDS: readonly Kind[] = ["none", "strip", "retract"];

/** 处置强度：多条判据同时成立时，报强度最高的那条。
 *
 *  这是**设计声明**，不是从代码里测出来的。理由是处置的不可逆程度：
 *    retract  这一轮不采用 —— 整轮的输出都不进上下文，代价最大也最彻底
 *    strip    删掉若干行   —— 只改认定的那几行，其余保留
 *    none     不动
 *  所以 3 > 2 > 0。要推翻它，需要造出「某场景下 strip 比 retract 更该赢」的输入；
 *  至今没造出来，按未验证记（写在 check-rules-coverage 的注释里）。
 *
 *  放在这里的原因：它与 KINDS 是同一件事的两面（有哪些构造子 / 它们怎么比），
 *  分两个文件写就会分叉——而分叉之后矩阵会静默按 0 处理新构造子，不报错。
 *  判据：check-rules-coverage 验「KINDS 与 STRENGTH 的键集合相等」。
 */
export const STRENGTH: Record<Kind, number> = { none: 0, strip: 2, retract: 3 };

/** RuleOf：每个 kind 允许哪些来源。表即证明——不在这张表里的组合 parse 直接抛。 */
const RULE_OF: Record<Kind, readonly Rule[]> = {
  none: ["dup", "inline", "lang", "run", "shape"],
  strip: ["dup"],
  retract: ["lang"],
};

/** 穷尽性守卫：switch 走到这里说明漏了一个构造子。类型上不可达，运行时报错兜底。 */
export function assertNever(x: never): never {
  throw new Error("verdict: 未穷尽的 kind " + JSON.stringify(x));
}

// ev.line 是给模板用的指针：可空，一旦给了必须是正整数。
const checkLine = (ev: any) => {
  if (ev.line === undefined || ev.line === null) return;
  if (!(isNum(ev.line) && ev.line >= 1)) bad("ev.line");
};

// 重复类证据的形状曾由 strip 与 fold 共用（一方是「重复的行号」，一方是「同一句所在的行号」）；
// fold 删除后只剩 strip 一个使用者，校验器保留，因为 ev 的形状仍来自判据而不是 kind。
// 而不是一个 kind 带一个 scope 标签。
const checkDups = (ev: any, unit: string) => {
  if (ev.blk !== null && typeof ev.blk !== "string") bad("ev.blk");
  if (!isNum(ev.reps)) bad("ev.reps");
  if (typeof ev.why !== "string") bad("ev.why");
  if (!Array.isArray(ev.dups)) bad("ev.dups 不是数组");
  for (const d of ev.dups) {
    if (!Array.isArray(d) || d.length !== 3) bad("ev.dups 项形状");
    if (typeof d[0] !== "string") bad("ev.dups[].单元");
    if (!isNum(d[1])) bad("ev.dups[].次数");
    if (!Array.isArray(d[2]) || !d[2].every(isNum)) bad("ev.dups[].行号");
  }
  checkLine(ev);
};

/** 证据校验：按 **rule** 索引。
 *
 * 为什么不是按 kind（2026-11-23 第五条）：none 也带 rule（它在说「我按哪条判据判的」），
 * 而证据形状由**来源**决定、不由动作决定——`none + dup` 的 ev 就是 DupEv 的形状，
 * 里面 reps 写错也得抛。按 kind 校验会漏掉这一类（旧测试 equiv-blanks 正是抓这个）。
 * kind 只决定「允许哪些 rule」（RULE_OF），不决定形状。
 */
const CHECK: Record<Rule, (ev: any) => void> = {
  dup(ev: any) {
    checkDups(ev, "行");
  },
  inline(ev: any) {
    checkDups(ev, "句");
  },
  run(ev: any) {
    checkDups(ev, "行");
  },
  shape(ev: any) {
    checkDups(ev, "行");
  },
  lang(ev: any) {
    for (const k of ["cjk", "lat", "lines"]) if (!isNum(ev[k])) bad("ev." + k);
    if (ev.dir !== "zh" && ev.dir !== "en") bad("ev.dir 只能是 zh 或 en");
    if (!(ev.sample === null || typeof ev.sample === "string")) bad("ev.sample 只能是字符串或 null");
    checkLine(ev);
  },
};

export interface VerdictV {
  kind: Kind;
  rule: Rule;
  ev: any;
  forced?: true;
}

export const Verdict = {
  parse(v: any): VerdictV {
    if (!v || typeof v !== "object") bad("不是对象");
    if (v.forced !== undefined && v.forced !== true) bad("forced 只能是 true 或缺席");
    // 收窄成 Kind：下面三处索引（RULE_OF / CHECK / 返回值）都要类型化的 key。
    const kind = v.kind as Kind;
    if (!KINDS.includes(kind)) bad("未知 kind " + String(v.kind));
    const rule = v.rule as Rule;
    // RuleOf(kind) 之外一律拒绝：strip×inline 这类组合在类型里不存在，parse 里不该有分支。
    if (!RULE_OF[kind].includes(rule)) {
      bad("kind=" + kind + " 不允许 rule=" + rule + "（允许：" + RULE_OF[kind].join("/") + "）");
    }
    CHECK[rule](v.ev);
    return { kind, rule, ev: v.ev, ...(v.forced === true ? { forced: true as const } : {}) };
  },
};
