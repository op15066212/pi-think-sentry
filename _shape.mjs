import fs from "node:fs";

const p = "src/algo/shape.ts";
let s = fs.readFileSync(p, "utf8");

// 1) 插入 stripMdPrefix，放在 DIM_LEN 之前
const anchor = "export const DIM_LEN = 3;";
if (!s.includes(anchor)) throw new Error("找不到 DIM_LEN");
const helper = `/**
 * 剥掉行首的 markdown 语法符号，留下「这句话本身」。
 *
 * 2026-11-24 事故（用户指着屏幕说「让你看思维链退化」，我却发现自己判据在乱判）：
 * 2045 段真实思考里 shape 判红 129 段，抽样一看全是结构噪声——
 *
 *   行首「- 」55%      ← markdown 列表符号，不是文字重复
 *   行长「长」100%     ← 列表每行一样长，结构性必然
 *   句首「- 」43%      ← 同一个列表符号
 *   套话「inde」5%     ← 代码标识符 index
 *
 * 真退化与误报的分界就在这里：
 *   真退化   务实： 执行。 完成。
 *   误报     - * 1. > # | \`\`\`
 *
 * 所以统计前先剥语法符号。剥的是**前缀**，不是内容——正文一个字不动。
 * 反例：不剥的话，任何一篇用列表写的正常笔记都会被判成「行首高度集中」。
 */
export function stripMdPrefix(line: string): string {
  let s = String(line || "").trim();
  // 表格行：| a | b | → a | b（首尾竖线是语法，中间的才是分隔）
  if (s.startsWith("|")) s = s.replace(/^\\|+/, "").replace(/\\|+$/, "").trim();
  // 列表、复选框、有序列表、引用、标题，可能叠加（「- - 项目」「> 1. 步骤」）
  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s
      .replace(/^[-*+]\\s+\\[[ xX]\\]\\s+/, "")   // 复选框要先于列表符号
      .replace(/^[-*+]\\s+/, "")
      .replace(/^\\d+[.)]\\s+/, "")
      .replace(/^>+\\s*/, "")
      .replace(/^#{1,6}\\s+/, "")
      .trim();
  }
  return s;
}

export const DIM_LEN = 3;`;
s = s.replace(anchor, helper);

// 2) rows 增加内容列 c
const oldRows = `  const rows = raw
    .map((l) => ({ raw: l, t: l.trim() }))
    .filter((x) => x.t.length >= DIM_LEN && !/^(\`{3,}|~{3,})/.test(x.t));`;
const newRows = `  // c = 剥掉 markdown 语法符号后的内容，行首/行尾/句首/套话都用它；
  // t 与 raw 保留给行长与缩进——那两个维度问的是排版，不是文字。
  const rows = raw
    .map((l) => {
      const t = l.trim();
      return { raw: l, t, c: stripMdPrefix(t) };
    })
    .filter((x) => x.c.length >= DIM_LEN && !/^(\`{3,}|~{3,})/.test(x.t));`;
if (!s.includes(oldRows)) throw new Error("找不到 rows 构造");
s = s.replace(oldRows, newRows);

// 3) 三个文字维度改用 c
const swaps: Array<[string, string]> = [
  [`  const head = topShareOf(rows.map((x) => x.t.slice(0, DIM_LEN)));`,
   `  const head = topShareOf(rows.map((x) => x.c.slice(0, DIM_LEN)));`],
  [`  const tail = topShareOf(rows.map((x) => x.t.slice(-DIM_LEN)));`,
   `  const tail = topShareOf(rows.map((x) => x.c.slice(-DIM_LEN)));`],
  [`  const sents = rows.flatMap((x) => x.t.split(/[。！？!?]/).map((s) => s.trim()).filter((s) => s.length >= 2));`,
   `  const sents = rows.flatMap((x) => x.c.split(/[。！？!?]/).map((s) => s.trim()).filter((s) => s.length >= 2));`],
  [`  const joined = rows.map((x) => x.t).join("\\n");`,
   `  const joined = rows.map((x) => x.c).join("\\n");`],
];
for (const [o, n] of swaps) {
  if (!s.includes(o)) throw new Error("找不到：" + o);
  s = s.replace(o, n);
}

fs.writeFileSync(p, s, "utf8");
console.log("shape.ts：加了 stripMdPrefix，三个文字维度改用剥过前缀的内容");
