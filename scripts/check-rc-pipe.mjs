#!/usr/bin/env node
// check-rc-pipe.mjs —— 报退出码的那一行不许有管道。
//
// 为什么有（2026-11-25，pi 插件2 建议）：
// 我验 sign.mjs 时写的是：
//
//   node bin/sign.mjs 修改方 test | tail -3; echo "rc=$?"
//
// 印出 rc=0 —— 那是 tail 的退出码，不是 node 的。判据明明是红的，读出来是绿的。
// 注：注入面 Ax2 那条原文就是「报 rc 不给命令；管道末端 rc 是 tail 的」，我自己写的自己踩。
//
// 这条能机械判：**同一行里既有管道又有 $? 引用**，就是拿错了码。
// 正确写法是把输出重定向到文件，再单独读 $?。
//
// 扫的地方：仓库里所有 .md 的 bash 块，以及 bin/ 与 scripts/ 下的 .mjs 里的注释示例。
// 不扫测试断言里的字符串——那里没有 shell。
//
// rc: 0 干净｜1 有命中｜2 没有可扫的文档
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const walk = (d, out = []) => {
  if (!fs.existsSync(d)) return out;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      walk(p, out);
    } else if (/\.(md|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
};

/** 一行是不是「同时有管道与 $?」——这是唯一要判的形状。 */
export function badLine(line) {
  // 忽略纯注释行与 markdown 表格行：它们不是可执行示例。
  if (/^\s*(\/\/|#)/.test(line)) return false;
  // 只认单个 |；|| 是逻辑或，"|" 在引号里也不算（"a|b" 是字符串）。
  const stripped = line.replace(/"[^"]*"/g, "").replace(/'[^']*'/g, "");
  const hasPipe = /(^|[^|])\|([^|]|$)/.test(stripped);
  // markdown 表格的 | 不算管道：以 | 开头或 | 结尾的行跳过。
  if (!hasPipe) return false;
  // $? 或 ${PIPESTATUS 混用也算：判据是「同一行里取退出码」。
  return /\$\?/.test(line) || /\$\{PIPESTATUS/.test(line);
}

export function check(files) {
  const problems = [];
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    const rel = path.relative(here, f).split(path.sep).join("/");
    let inFence = false;
    text.split(/\r?\n/).forEach((line, i) => {
      // markdown 只扫代码块内部：正文里叙述「我曾经用过 X | Y」不算示例。
      // 2026-11-25 第一版扫全文，HISTORY 那段讲我自己假绿的文字被当成示例命中。
      if (f.startsWith('.md') || f.endsWith(".md")) {
        if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; return; }
        if (!inFence) return;
      }
      if (badLine(line)) problems.push(rel + ":" + (i + 1) + "  " + line.trim());
    });
  }
  return problems;
}

// isMain 保护（2026-11-25）：别的脚本要 import badLine 做精确输入测试时，
// 原来会连带跑主流程并 exit。同一个修法我在 check-doc-accuracy 里做过，这里漏了。
// 两边都归一成正斜杠再比：fileURLToPath 在 Windows 上返回反斜杠，
// 只归一右边的话永远不等（我第一版就写错了，于是导入时主流程照跑）。
const norm = (x) => String(x || "").replace(/\\/g, "/");
const isMain = !!process.argv[1] && norm(fileURLToPath(import.meta.url)) === norm(process.argv[1]);
if (isMain && process.argv.includes("--selftest")) {
  // 好样本：重定向后单独读 rc
  const good = ['node x.mjs > /tmp/o.txt 2>&1', 'echo "rc=$?"'];
  // 坏样本：管道末端取 rc——就是我自己犯的那一次
  const bad = ['node x.mjs | tail -3; echo "rc=$?"'];
  // 六种形状逐一钉住（2026-11-25）。每一条都做过变异：关掉对应那行防线，
  // 这个形状立刻翻成 true。所以这六条不是凑数，是一条形状对一条防线。
  const SHAPES = [
    ["真该命中（管道 + $?）", 'node x.mjs | tail -3; echo "rc=$?"', true],
    ["|| 是逻辑或不是管道", 'cd x || exit 1; echo $?', false],
    ["引号里的 | 不算", 'echo "a|b"; echo $?', false],
    ["注释行不算", '// node x | tail; echo $?', false],
    ["markdown 表格不算", '| a | b |', false],
    ["重定向后取 rc 不算", 'node x > /tmp/o 2>&1; echo $?', false],
  ];
  const cases = [
    ["重定向后单独读 rc → 不该命中", good.some(badLine) === false],
    ["管道后同一行取 rc → 必须命中", bad.some(badLine) === true],
    ["markdown 表格行 → 不该命中", badLine("| a | b |") === false],
    ["注释行 → 不该命中", badLine("// node x | grep y; echo $?") === false],
  ];
  for (const [name, line, want] of SHAPES) cases.push(["形状：" + name, badLine(line) === want]);
  let n = 0;
  for (const [name, ok] of cases) { if (!ok) n++; console.log((ok ? "PASS  " : "FAIL  ") + name); }
  console.log(n === 0 ? "selftest: 坏样本红、好样本绿" : "selftest: " + n + " 条不符");
  process.exit(n === 0 ? 0 : 1);
}

const files = [];
for (const d of ["src", "bin", "scripts", "test"]) files.push(...walk(path.join(here, d)));
for (const f of ["README.md", "HISTORY.md", "SETTINGS.md", "DESIGN.md"]) {
  const p = path.join(here, f);
  if (fs.existsSync(p)) files.push(p);
}
if (!files.length) { console.error("check-rc-pipe: 没有可扫的文件（rc=2）"); process.exit(2); }

const problems = isMain ? check(files) : [];
if (isMain) {
  const problems = check(files);
  for (const p of problems) console.log("红  " + p);
  console.log("check-rc-pipe: " + files.length + " 个文件，命中 " + problems.length + " 处");
  process.exit(problems.length === 0 ? 0 : 1);
}
