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
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// 被签面算 HEAD 还是算工作区（2026-11-25，pi 插件2 提出）。
//
// 答案：算 HEAD。工作区是「正在被写的东西」，签它等于给写到一半的状态作证；
// 而且别人第二天复现不出来——他 checkout 出来的是 HEAD，不是你那天的半成品。
//
// 但这件事不能只写在注释里。判据前，有人报了一个总指纹，另一个人的工作区
// 恰好有未提交改动，于是同一个 commit 算出两个数，谁都没错，谁也没法说服谁。
// 所以这里给两条口径，输出里必须标明是哪一条：
//
//   node bin/fingerprint.mjs            # 工作区（默认，方便日常自查）
//   node bin/fingerprint.mjs --head     # HEAD 展开到临时目录再算（签字只认这条）
//
// 反例：只报数字不报口径——两个人拿同一个 commit 各算一次，一个 47c5a048
// 一个 b27c3ea7，差的是工作区那几行未提交改动。数都对，口径不同。
const ARGV = process.argv.slice(2);
const USE_HEAD = ARGV.includes("--head");

// 自检（2026-11-25）：证明「口径」这件事有判据，而不只是注释里的一句话。
//
// 造一个真反例：往工作区的一个被签文件末尾追加一行，工作区口径的指纹必须变，
// HEAD 口径的指纹必须不变。变完立刻恢复原字节（try/finally，抛异常也恢复）。
//
// 反例本身也是判据：如果两个口径算出来总是一样，这条自检红——
// 说明 --head 其实没生效，或者工作区口径根本没用工作区。
const SELFTEST = ARGV.includes("--selftest");

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let ROOT = REPO;
let HEAD_SHA = "";

if (USE_HEAD) {
  const sha = spawnSync("git", ["-C", REPO, "rev-parse", "HEAD"], { encoding: "utf8" });
  if (sha.status !== 0) { console.error("fingerprint: git rev-parse HEAD 失败（rc=2）"); process.exit(2); }
  HEAD_SHA = sha.stdout.trim();
  const tmp = fs.mkdtempSync(path.join(process.env.TEMP || "/tmp", "fp-head-"));
  // git archive | tar：只取 HEAD 提交里的内容，不碰工作区。
  // 不用 git archive | tar：Windows 上 tar 未必在 PATH，且二进制走管道容易被当文本处理。
  // 改成 git ls-tree 拿清单，再对每个文件 git show HEAD:<path> 取内容。
  const ls = spawnSync("git", ["-C", REPO, "ls-tree", "-r", "--name-only", "HEAD"], { encoding: "utf8", maxBuffer: 1 << 30 });
  if (ls.status !== 0) { console.error("fingerprint: git ls-tree 失败（rc=2）"); process.exit(2); }
  const blobs = ls.stdout.split("\n").filter(Boolean);
  let wrote = 0;
  for (const rel of blobs) {
    const r2 = spawnSync("git", ["-C", REPO, "show", "HEAD:" + rel], { maxBuffer: 1 << 30 });
    if (r2.status !== 0) continue;
    const dst = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, r2.stdout);
    wrote++;
  }
  if (wrote === 0) { console.error("fingerprint: HEAD 里一个文件都没取到（rc=2）"); process.exit(2); }
  ROOT = tmp;
  process.on("exit", () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} });
}
const DIRS = ["src", "test", "bin", "scripts"];
const EXTS = new Set([".ts", ".mts", ".mjs", ".js", ".json"]);

// 两个顶层文件要不要进总指纹，判据是「它变是因为代码变了，还是因为运行状态变了」。
//
//   README.md      进。口径上限写在里面，双方认可的是它。它变只因为有人改了字。
//   settings.json  不进。用户改一个开关它就变，指纹跟着变就分不清
//                  「代码改了」与「有人动了配置」。它单独列在输出里给人看。
//   package-lock   不进。npm install 会动它，与代码改动无关。
//
// 2026-11-24（pi 插件2 抓的）：这个常量原来定义了却从未被引用，
// 而注释写着「不进总指纹」、代码又把 settings.json 放进了 files。
// 注释说 A，代码做 B——正是这一路在修的形状。现在它真的被用了。
const VOLATILE = new Set(["settings.json", "SIGN-OFF.md", "package-lock.json"]);

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
// README 与 settings.json 也是行为的一部分：口径上限写在 README 里，开关写在 settings 里。
// 不纳入指纹的话，双方认可的那份文档就没有身份，改一个字谁也看不出来。
for (const f of ["package.json", "tsconfig.json", "README.md", "settings.json", "SIGN-OFF.md"]) {
  const p = path.join(ROOT, f);
  if (fs.existsSync(p)) files.push(p);
}
// 不进总指纹，但要给身份：判红结果取决于 settings.json（prefix.on / run.on /
// lang.dir / inline.min…）。只给文件名等于「指纹能证明代码是哪一版，证明不了
// 那一刻跑的是哪套开关」。——2026-11-24 pi 插件2 指的最后一格。
// 规则与本文件其他数字一致：任何数旁边印上它那份输入的 md5。
const volatileShown = files
  .filter((abs) => VOLATILE.has(path.basename(abs)))
  .map((abs) => {
    const raw = fs.readFileSync(abs);
    // 与 rows 同一处理：行尾不参与身份
    const data = Buffer.from(raw.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
    const h = crypto.createHash("md5").update(data).digest("hex").slice(0, 8);
    return path.relative(ROOT, abs).replace(/\\/g, "/") + "  " + h + "  " + data.length + "B";
  });

const rows = files.filter((abs) => !VOLATILE.has(path.basename(abs)))
  .map((abs) => {
    const rel = path.relative(ROOT, abs).replace(/\\/g, "/");
    const raw = fs.readFileSync(abs);
    // 行尾规范化（2026-11-24，pi 插件2 抓到 cfa4b751 与 a2becc81 对不上之后查出来的根因）：
    // 本仓 core.autocrlf=true，同一次 commit 在不同的 checkout 之后，工作区字节数会差
    // 「行数」那么多（LF -> CRLF 每行多 1 字节）。README 是 545 行，disk 28450 / git 27905，
    // 差的正好 545。指纹算的是工作区字节，于是同一个 commit 能算出两个总指纹。
    //
    // 「同 HEAD + status 0 => 同指纹」这条判据本来是对的，但它有个隐含前提：
    // 工作区字节只由 commit 决定。core.autocrlf=true 打破了这个前提。
    // 修法是指纹只认内容不认行尾：先把 \r\n 规范成 \n 再算 md5 与字节。
    const buf = raw.toString("utf8").replace(/\r\n/g, "\n");
    const data = Buffer.from(buf, "utf8");
    return {
      rel,
      md5: crypto.createHash("md5").update(data).digest("hex"),
      bytes: data.length,
      lines: buf.split("\n").length,
    };
  })
  .sort((a, b) => a.rel.localeCompare(b.rel));

// 总指纹：每行「rel:md5:bytes」按 rel 排序后拼起来再 md5。
// 这样任何一个文件变一个字节，总指纹都变；两个文件互换内容，总指纹也变。
const canonical = rows.map((r) => r.rel + ":" + r.md5 + ":" + r.bytes).join("\n");
const total = crypto.createHash("md5").update(canonical).digest("hex");

if (SELFTEST) {
  // 这里必须用工作区口径算（USE_HEAD 为假）才有意义。
  if (USE_HEAD) { console.error("fingerprint --selftest：不要与 --head 同用（rc=2）"); process.exit(2); }
  const probe = path.join(REPO, "README.md");
  const original = fs.readFileSync(probe);
  let changedMd5 = "";
  try {
    fs.writeFileSync(probe, Buffer.concat([original, Buffer.from("\n<!-- fp-selftest-probe -->\n")]));
    const now = [];
    for (const d of DIRS) now.push(...walk(path.join(REPO, d)));
    for (const f of ["package.json", "tsconfig.json", "README.md", "settings.json", "SIGN-OFF.md"]) {
      const p2 = path.join(REPO, f);
      if (fs.existsSync(p2)) now.push(p2);
    }
    const rows2 = now
      .map((p2) => ({ rel: path.relative(REPO, p2).split(path.sep).join("/"), md5: crypto.createHash("md5").update(fs.readFileSync(p2)).digest("hex"), bytes: fs.statSync(p2).size }))
      .filter((r) => !VOLATILE.has(r.rel))
      .sort((a2, b2) => (a2.rel < b2.rel ? -1 : a2.rel > b2.rel ? 1 : 0));
    changedMd5 = crypto.createHash("md5").update(rows2.map((r) => r.rel + ":" + r.md5 + ":" + r.bytes).join("\n")).digest("hex");
  } finally {
    fs.writeFileSync(probe, original);
  }
  const restored = fs.readFileSync(probe).equals(original);
  const headFp = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--head"], { encoding: "utf8" });
  const mHead = (headFp.stdout || "").match(/总指纹 ([0-9a-f]{32})/);
  const cases = [
    ["改了工作区，工作区口径的指纹必须变", changedMd5 !== total],
    ["HEAD 口径的指纹不受工作区影响", !mHead ? false : mHead[1] !== changedMd5],
    ["探针文件已按原字节恢复", restored],
  ];
  let n = 0;
  for (const [name, ok] of cases) { if (!ok) n++; console.log((ok ? "PASS  " : "FAIL  ") + name); }
  console.log(n === 0 ? "selftest: 两条口径分得开、工作区已复原" : "selftest: " + n + " 条不符");
  process.exit(n === 0 ? 0 : 1);
}

const arg = process.argv[2];

if (arg === "--verify") {
  const want = process.argv[3];
  if (!want) {
    console.error("用法：node bin/fingerprint.mjs --verify <总指纹>");
    process.exit(2);
  }
  const ok = want === total;
  console.log((ok ? "SAME " : "DIFF ") + "现取=" + total + " 期望=" + want + " 口径=" + (USE_HEAD ? "HEAD " + HEAD_SHA.slice(0, 7) : "工作区") + " @ " + new Date().toISOString().replace(/\.\d+Z$/, "Z"));
  process.exit(ok ? 0 : 1);
}

if (arg === "--md") {
  console.log("| 文件 | md5 | 字节 | 行 |");
  console.log("| --- | --- | --- | --- |");
  for (const r of rows) console.log("| `" + r.rel + "` | `" + r.md5.slice(0, 8) + "` | " + r.bytes + " | " + r.lines + " |");
  console.log("");
  console.log("总指纹（" + rows.length + " 个文件，口径 " + (USE_HEAD ? "HEAD " + HEAD_SHA.slice(0, 7) : "工作区") + "）：`" + total + "`");
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
// 采样时刻跟着指纹一起打。
// 2026-11-24（pi 插件2 复核挑出）：「7.5% 与 7.7%」看起来像有人算错，
// 实际是两个时刻、同一份被追加的会话。缺了时刻，两个都对数看起来像有一个错。
const stamp = new Date().toISOString().replace(/\.\d+Z$/, "Z");
console.log("");
console.log("文件数 " + rows.length + "  总字节 " + rows.reduce((a, r) => a + r.bytes, 0));
console.log("总指纹 " + total + "  口径 " + (USE_HEAD ? "HEAD " + HEAD_SHA.slice(0, 7) : "工作区"));
console.log("采样时刻 " + stamp + "   （引用这个指纹时必须连这一行一起引）");
if (volatileShown.length) {
  console.log("不进总指纹（随运行变化）：" + volatileShown.join(" "));
}
