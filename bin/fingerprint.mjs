#!/usr/bin/env node
// fingerprint.mjs —— 给「通读并认可」这件事生成一份可复算的指纹。
//
// 为什么需要它：
//   「我读完了、没问题」这句话没有判据——两个人说的可能是两个版本的代码。
//   把每个文件的 md5 与字节数现取一遍，汇总成一个总指纹，双方各算一次，
//   数字相同才说明读的是同一份。
//
// 用法：
//   node bin/fingerprint.mjs            # 表格 + 总指纹
//   node bin/fingerprint.mjs --md       # markdown 表格（贴进签字文件）
//   node bin/fingerprint.mjs --verify <总指纹>   # 只回答「现在的总指纹是不是这个」
//
// 退出码：0 一致｜1 不一致｜2 目录不在

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIRS = ["src", "test", "bin", "scripts"];
const EXTS = new Set([".ts", ".mts", ".mjs", ".js", ".json"]);

// settings.json 会随运行变化（用户改开关），不算「代码」。
// 但它是行为的一部分，所以单独列在后面，不进总指纹。
const VOLATILE = new Set(["settings.json", "package-lock.json"]);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      walk(p, out);
    } else if (EXTS.has(path.extname(e.name))) {
      out.push(p);
    }
  }
  return out;
}

const files = [];
for (const d of DIRS) files.push(...walk(path.join(ROOT, d)));
// 顶层配置文件也是行为的一部分
for (const f of ["package.json", "tsconfig.json"]) {
  const p = path.join(ROOT, f);
  if (fs.existsSync(p)) files.push(p);
}

const rows = files
  .map((abs) => {
    const rel = path.relative(ROOT, abs).replace(/\\/g, "/");
    const buf = fs.readFileSync(abs);
    return {
      rel,
      md5: crypto.createHash("md5").update(buf).digest("hex"),
      bytes: buf.length,
      lines: buf.toString("utf8").split("\n").length,
    };
  })
  .sort((a, b) => a.rel.localeCompare(b.rel));

// 总指纹：每行「rel:md5:bytes」按 rel 排序后拼起来再 md5。
// 这样任何一个文件变一个字节，总指纹都变；两个文件互换内容，总指纹也变。
const canonical = rows.map((r) => r.rel + ":" + r.md5 + ":" + r.bytes).join("\n");
const total = crypto.createHash("md5").update(canonical).digest("hex");

const arg = process.argv[2];

if (arg === "--verify") {
  const want = process.argv[3];
  if (!want) {
    console.error("用法：node bin/fingerprint.mjs --verify <总指纹>");
    process.exit(2);
  }
  const ok = want === total;
  console.log((ok ? "SAME " : "DIFF ") + "现取=" + total + " 期望=" + want);
  process.exit(ok ? 0 : 1);
}

if (arg === "--md") {
  console.log("| 文件 | md5 | 字节 | 行 |");
  console.log("| --- | --- | --- | --- |");
  for (const r of rows) console.log("| `" + r.rel + "` | `" + r.md5.slice(0, 8) + "` | " + r.bytes + " | " + r.lines + " |");
  console.log("");
  console.log("总指纹（" + rows.length + " 个文件）：`" + total + "`");
  process.exit(0);
}

// 默认：分组打印
let lastDir = "";
for (const r of rows) {
  const d = r.rel.includes("/") ? r.rel.split("/")[0] : ".";
  if (d !== lastDir) {
    console.log("\n[" + d + "]");
    lastDir = d;
  }
  console.log("  " + r.md5.slice(0, 8) + "  " + String(r.bytes).padStart(7) + "B  " + String(r.lines).padStart(4) + "L  " + r.rel);
}
console.log("\n文件数 " + rows.length + "  总字节 " + rows.reduce((a, r) => a + r.bytes, 0));
console.log("总指纹 " + total);
