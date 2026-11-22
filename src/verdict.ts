// 判据输出与 context 的形状。手写校验，不用 zod：依赖清到零，形状只在一个地方说。
//
// 三个字段是三条互不相干的轴：
//   kind = 动作（none 什么都不做 / strip 删行 / retract 撤回）
//   rule = 来源（dup 复诵 / lang 语言）
// 畸形输入一律抛：判据写错要立刻发现，静默通过会让「clean」与「没判」混成一件事。
//
// R12：删掉了第三条轴 tag（clean / opaque）。opaque 是「判据看不见这段，所以不更新判决」——
// 那是防御（挡「贴围栏让判据失明再报干净」），不是使用者要的判据。
// 删掉之后：整段落在围栏里的思考，投票行数为 0，off=0、keep=0、0 > 0 不成立 → 判 clean。
// 模型因此可以靠贴代码解除一次判红。写进 README 的已知边界，不假装它不存在。

const bad = (why: any) => { throw new Error("verdict: " + why); };
const isNum = (x: any) => typeof x === "number" && Number.isFinite(x);

const KINDS = ["none", "strip", "retract"];

// 每种 kind 用哪份注入模板。与 KINDS 同一张表：加一种 kind 时这里缺一列就是 undefined。
export const TEMPLATE_OF: Record<string, "dup" | "lang" | "clean"> = {
  none: "clean",
  strip: "dup",
  retract: "lang",
};

// 形状校验按 rule 查表：类与分派是同一张表。
const CHECKS: Record<string, (ev: any) => void> = {
  lang(ev: any) {
    for (const k of ["cjk", "lat", "lines"]) if (!isNum(ev[k])) bad("ev." + k);
    if (ev.dir !== "zh" && ev.dir !== "en") bad("ev.dir 只能是 zh 或 en");
    if (!(ev.sample === null || typeof ev.sample === "string")) bad("ev.sample 只能是字符串或 null");
    checkLine(ev);
  },
  dup(ev: any) {
    if (ev.blk !== null && typeof ev.blk !== "string") bad("ev.blk");
    if (!isNum(ev.reps)) bad("ev.reps");
    if (typeof ev.why !== "string") bad("ev.why");
    if (!Array.isArray(ev.dups)) bad("ev.dups 不是数组");
    for (const d of ev.dups) {
      if (!Array.isArray(d) || d.length !== 3) bad("ev.dups 项形状");
      if (typeof d[0] !== "string") bad("ev.dups[].行");
      if (!isNum(d[1])) bad("ev.dups[].次数");
      if (!Array.isArray(d[2]) || !d[2].every(isNum)) bad("ev.dups[].行号");
    }
    checkLine(ev);
  },
};

// ev.line 是给模板用的指针：可空，一旦给了必须是正整数。
const checkLine = (ev: any) => {
  if (ev.line === undefined || ev.line === null) return;
  if (!(isNum(ev.line) && ev.line >= 1)) bad("ev.line");
};

const RULES = Object.keys(CHECKS);

export const Verdict = {
  parse(v: any) {
    if (!v || typeof v !== "object") bad("不是对象");
    if (v.forced !== undefined && v.forced !== true) bad("forced 只能是 true 或缺席");
    if (!KINDS.includes(v.kind)) bad("未知 kind " + v.kind);
    if (!RULES.includes(v.rule)) bad("未知 rule " + v.rule);
    if (v.kind === "strip") {
      if (v.rule !== "dup") bad("strip 只可能是 dup，实际 " + v.rule);
      CHECKS.dup(v.ev);
      return v;
    }
    if (v.kind === "retract") {
      if (v.rule !== "lang") bad("retract 只可能是 lang");
      CHECKS.lang(v.ev);
      return v;
    }
    CHECKS[v.rule](v.ev);
    return v;
  },
};
