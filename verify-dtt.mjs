#!/usr/bin/env node
// verify-dtt.mjs —— 判 README.md 是否把依赖类型理论当唯一元理论。
// 一条规则就是一个类型：命题 · 引入（命令 + 期望 rc）· 反例（具体输入）· 消去（第二入口）。
// rc: 0 成立｜1 有缺陷｜2 文档缺失
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DOC = path.join(HERE, "README.md");
const SIGN = path.join(HERE, "SIGN-OFF-DTT.md");
const PROCESS = ["未完成", "进行中", "本轮", "上一轮", "刚才", "TODO"];

/** 文档的缺陷清单。空数组 = 这份文档当了元理论该当的样子。 */
export function check(text) {
  const t = String(text || "");
  const miss = [];
  const lines = t.split("\n");

  // 一：元理论节必须在，且点名依赖类型理论
  const head = lines.findIndex((l) => /^##\s*元理论/.test(l));
  if (head < 0) miss.push("缺「## 元理论」节：没有元理论，下面的表只是排字");
  else {
    const body = lines.slice(head, lines.findIndex((l, i) => i > head && /^##\s/.test(l)) < 0 ? lines.length : lines.findIndex((l, i) => i > head && /^##\s/.test(l))).join("\n");
    if (!body.includes("依赖类型理论")) miss.push("元理论节没点名「依赖类型理论」");
    for (const k of ["形成", "引入", "消去", "反例"]) if (!body.includes(k)) miss.push("元理论节没写「" + k + "」这一件");
  }

  // 二：每张带反例列的表，反例格逐行非空
  let tables = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    if (!/^\|/.test(lines[i]) || !/^\|\s*-/.test(lines[i + 1])) continue;
    const head = lines[i].split("|").slice(1, -1).map((s) => s.trim());
    const col = head.findIndex((h) => h.includes("反例") || h.includes("坏样本"));
    if (col < 0) continue;
    tables++;
    for (let j = i + 2; j < lines.length && /^\|/.test(lines[j]); j++) {
      const cells = lines[j].split("|").slice(1, -1).map((s) => s.trim());
      if (!cells[col]) miss.push("第 " + (j + 1) + " 行反例格是空的：" + lines[j].slice(0, 36));
    }
  }
  if (!tables) miss.push("没有一张表带「反例」列：反例先于正例，没有反例的规则不算规则");

  // 三：不写过程词。交付物只留结果。
  const hit = PROCESS.filter((w) => t.includes(w));
  if (hit.length) miss.push("出现过程词：" + hit.join(" "));

  // 四：文档点名的脚本都在盘上。文档写了盘上没有的路径，判这条红。
  const cmds = [...t.matchAll(/node\s+([^\s`"'|)]+\.m?js)/g)].map((m) => m[1]);
  const gone = [...new Set(cmds)].filter((c) => {
    const p = path.isAbsolute(c) ? c : path.join(HERE, c);
    return !fs.existsSync(p);
  });
  if (gone.length) miss.push("文档点名的脚本不在盘上：" + gone.join(" "));

  // 五：签字栏在
  if (!t.includes("SIGN-OFF-DTT.md")) miss.push("没指向 SIGN-OFF-DTT.md：没有签字栏，收敛谁宣布");

  return miss;
}

export function fingerprint() {
  const h = crypto.createHash("sha256");
  for (const f of [DOC, fileURLToPath(import.meta.url)]) h.update(fs.readFileSync(f));
  return h.digest("hex");
}


function selftest() {
  const good = fs.readFileSync(DOC, "utf8");
  const bads = [
    ["删掉元理论节", good.split(/^##\s*元理论.*$/m).join("## 别的东西")],
    ["反例列改名成备注", good.split("| 反例 |").join("| 备注 |").split("| 坏样本 |").join("| 备注 |")],
    ["反例格清空", good.split("「必要时生效」——盘上查不到它在哪生效").join("")],
    ["混进过程词", good + "\n\n本轮已完成，进行中。\n"],
    ["命令指向不存在的脚本", good + "\n\nnode 这个脚本不存在.mjs\n"],
  ];
  let slipped = 0;
  const goodMiss = check(good);
  for (const [why, t] of bads) if (!check(t).length) { console.log("坏样本没变红：" + why); slipped++; }
  const pass = goodMiss.length === 0 && slipped === 0;
  console.log("verify-dtt selftest: " + (pass ? "PASS" : "FAIL") + "（正样本绿=" + (goodMiss.length === 0) + " 坏样本变红=" + (bads.length - slipped) + "/" + bads.length + "）");
  if (goodMiss.length) for (const m of goodMiss) console.log("  正样本缺：" + m);
  return pass ? 0 : 1;
}

if (process.argv.includes("--selftest")) process.exit(selftest());
if (process.argv.includes("--fingerprint")) { console.log(fingerprint()); process.exit(0); }
if (!fs.existsSync(DOC)) { console.error("verify-dtt: 找不到 " + DOC + "（rc=2）"); process.exit(2); }
const miss = check(fs.readFileSync(DOC, "utf8"));
if (miss.length) { console.log("verify-dtt: " + miss.length + " 处不合格"); for (const m of miss) console.log("  - " + m); process.exit(1); }
console.log("verify-dtt: 元理论节齐、四件齐、反例逐行有、无过程词、脚本都在、签字栏在");
process.exit(0);
