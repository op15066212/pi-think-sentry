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
const DIRS = ["src", "test", "bin", "scripts", "docs"];
const EXTS = new Set([".ts", ".mts", ".mjs", ".js", ".json", ".md", ".txt"]);

// 被签面 = 「进 git 的、会影响行为或含义的」文件，减去下面点名排除的四个。
//
// 2026-11-25 之前这里是反过来的：TOP_FILES 手写一张"要签哪些"的清单。
// 那个方向错在默认值——新文件默认不进被签面，于是漏掉不会红。
// 真实发生过的三件事：
//   一 guard 的 DESIGN / SETTINGS / HISTORY 一度从清单里掉了，文件数 25 -> 22，
//      没有任何判据红，签字照样成立（pi 插件2 与我各自独立看到这个数才发现的）；
//   二 verify-dtt.mjs 在仓根，不在 DIRS 也不在清单里，**一条判据从不在被签面**；
//   三 llms.txt / PR.md / .gitignore 同样漏着。
//
// 现在反过来：默认全收，要排除得点名，且点名的理由必须写出来。
// 「签哪些」自动从盘上取，「不签哪些」必须人脸说清——这是 P15 的三种收场
// （跟踪／点名忽略／点名待办），不是四不像。
//
// 反例（判据见 --selftest 的 A 条）：盘上多了个顶层文件而没人处理，
// 它会被自动签进去；想不签就必须在这里加一行并写理由。
const EXCLUDE = new Map([
  ["SIGN-OFF.md", "签字记录本身。进了被签面，加一行就改指纹，就得重签，循环没有尽头。"],
  ["SIGN-OFF-DTT.md", "同上，元理论那套签字记录。"],
  ["package-lock.json", "npm install 会动它，与代码改动无关。"],
  ["settings.json", "用户改一个开关它就变。指纹跟着变就分不清「代码改了」与「有人动了配置」。它单独列在输出里给人看。"],
  // 目录以斜杠结尾。下面两个不进被签面，理由写在这里。
  [".doc-bridge/", "doc-bridge 工具自动生成的知识索引。它随工具重扫而变，不是人写的。"],
  ["reviews/", "只追加的审查记录。验它该读 git log 的历史，不是读一个应当稳定的数；改了旧记录，git 也会显示。"],
]);

/** 一个相对路径是否被 EXCLUDE 点名。目录以斜杠结尾按前缀匹配，其余按文件名匹配。 */
function isExcluded(rel) {
  if (EXCLUDE.has(rel)) return true;
  for (const k of EXCLUDE.keys()) {
    if (k.endsWith("/")) { if (rel.startsWith(k)) return true; }
    else if (k === rel.split("/").pop()) return true;
  }
  return false;
}

// 仍在被签面里但不参与总指纹的（只印 md5 给人看）。
// 与 EXCLUDE 的区别：EXCLUDE 是「不签」；VOLATILE 是「签，但它会随运行变，
// 所以它的字节不能算进那个应当稳定的数」。
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

/** 给一个根目录，返回进被签面的所有绝对路径。默认全收，EXCLUDE 点名的除外。 */
function filesOf(root) {
  const out = [];
  for (const d of DIRS) out.push(...walk(path.join(root, d)));
  // 顶层：除 node_modules / 点开头的目录之外，全部收。
  // 也包括 .gitignore 这类点开头的文件（它决定哪些东西进 git，是有语义的）。
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    if (e.isDirectory()) continue;
    if (isExcluded(e.name)) continue;
    out.push(path.join(root, e.name));
  }
  return out;
}


/**
 * 给一个根目录，返回被签面的每一行 { rel, md5, bytes, lines }。
 *
 * 只有这一处算 row。2026-11-25（pi 插件2 指出）：--selftest 里原先自己又走一遍
 * walk + 手拼 rows + 自己排序，而那一份**漏了行尾规范化**。
 * 于是它算出来的数与主流程算的不是一个量，两个数天然不等，
 * 「HEAD 口径必须不受工作区影响」那条用例拿两个不同源的数比较，恒真、恒绿。
 * 抽成一个函数，主流程与 selftest 都调它，两个值才可能同源、才可能一起红。
 */
function rowsOf(root) {
  const rows = [];
  for (const abs of filesOf(root)) {
    if (VOLATILE.has(path.basename(abs))) continue;
    const rel = path.relative(root, abs).replace(/\\/g, "/");
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
    rows.push({
      rel,
      md5: crypto.createHash("md5").update(data).digest("hex"),
      bytes: data.length,
      lines: buf.split("\n").length,
    });
  }
  return rows.sort((a, b) => a.rel.localeCompare(b.rel));
}

/** 一组 row 的总指纹：每行「rel:md5:bytes」按 rel 排序后拼起来再 md5。
 *  任何一个文件变一个字节，总指纹都变；两个文件互换内容，总指纹也变。 */
function totalOf(rows) {
  return crypto.createHash("md5").update(rows.map((r) => r.rel + ":" + r.md5 + ":" + r.bytes).join("\n")).digest("hex");
}

const rows = rowsOf(ROOT);
// 不进总指纹，但要给身份：判红结果取决于 settings.json（prefix.on / run.on /
// lang.dir / inline.min…）。只给文件名等于「指纹能证明代码是哪一版，证明不了
// 那一刻跑的是哪套开关」。——2026-11-24 pi 插件2 指的最后一格。
// 规则与本文件其他数字一致：任何数旁边印上它那份输入的 md5。
const volatileShown = filesOf(ROOT)
  .filter((abs) => VOLATILE.has(path.basename(abs)))
  .map((abs) => {
    const raw = fs.readFileSync(abs);
    // 与 rows 同一处理：行尾不参与身份
    const data = Buffer.from(raw.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
    const h = crypto.createHash("md5").update(data).digest("hex").slice(0, 8);
    return path.relative(ROOT, abs).replace(/\\/g, "/") + "  " + h + "  " + data.length + "B";
  });

const total = totalOf(rows);

if (SELFTEST) {
  // 必须用工作区口径算（USE_HEAD 为假）才有意义。
  if (USE_HEAD) { console.error("fingerprint --selftest：不要与 --head 同用（rc=2）"); process.exit(2); }
  const probe = path.join(REPO, "README.md");
  const original = fs.readFileSync(probe);
  let changed = "";
  let mHead = null;
  // 探针写入**之前**先取一次 HEAD 口径。这是「不变」的基准。
  // 不能拿工作区口径的 total 当基准：工作区可能有未提交改动，两者本来就不同，
  // 那样比出来的差不是探针造成的，判据恒红。
  const headBefore = (() => {
    const r0 = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--head"], { encoding: "utf8" });
    const m0 = (r0.stdout || "").match(/总指纹 ([0-9a-f]{32})/);
    return m0 ? m0[1] : null;
  })();
  try {
    fs.writeFileSync(probe, Buffer.concat([original, Buffer.from("\n<!-- fp-selftest-probe -->\n")]));
    // 同一个函数、同一次进程：探针在盘上时工作区口径的值。
    changed = totalOf(rowsOf(REPO));
    // 探针还在盘上时跑子进程。这是关键：要测的是「它到底读不读工作区」，
    // 就必须让工作区在被测那一刻是脏的。以前放在 finally 之后跑，
    // 等于恢复干净了再问「你会不会被脏东西影响」——问不出东西来。
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--head"], { encoding: "utf8" });
    const m = (r.stdout || "").match(/总指纹 ([0-9a-f]{32})/);
    mHead = m ? m[1] : null;
  } finally {
    fs.writeFileSync(probe, original);
  }
  const restored = fs.readFileSync(probe).equals(original);

  // 三条用例，比较基准只有一个：探针写入**之前**本进程算出的 total。
  //
  // 2026-11-25（pi 插件2 指出，第一次写错）：原来第二条拿 changed 与 mHead 比，
  // 而 changed 是 selftest 自己走一遍算的、mHead 是子进程算的——两套代码、两个量，
  // 天然不等，那条用例恒真恒绿。把 ROOT = tmp 改成 ROOT = REPO 也不红。
  // 现在三条都对着同一个 total 比，变异才红得出来。
  // ===== 判据 A：git 里有、被签面里没有 =====
  // 期望从 git 取，不手写清单：git 已经替你记住哪些文件是项目的一部分。
  // 实现从 filesOf 取。两者不同源，不同步就红。
  // 这条挡的正是 2026-11-25 那个错：guard 抄 sentry 的 TOP_FILES，
  // DESIGN / SETTINGS / HISTORY 从被签面掉了，文件数 25 -> 22，没有任何判据红。
  const gitLs = spawnSync("git", ["-C", REPO, "ls-tree", "-r", "--name-only", "HEAD"], { encoding: "utf8", maxBuffer: 1 << 30 });
  const gitFiles = (gitLs.stdout || "").split("\n").filter(Boolean);
  const collected = new Set(filesOf(REPO).map((a) => path.relative(REPO, a).split(path.sep).join("/")));
  const missed = gitFiles.filter((rel) => !collected.has(rel) && !isExcluded(rel));

  // ===== 判据 B：目录里出现、EXTS 却不认的扩展名 =====
  // 挡的是静默：DIRS 加了 docs 而 EXTS 没有 .md，walk 一个都不收，指纹少一块没人知道。
  const raw = (dir) => {
    if (!fs.existsSync(dir)) return [];
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!e.name.startsWith(".") && e.name !== "node_modules") out.push(...raw(p)); }
      else out.push(p);
    }
    return out;
  };
  const seenExt = new Set();
  for (const d of DIRS) for (const f of raw(path.join(REPO, d))) seenExt.add(path.extname(f));
  const unhandledExt = [...seenExt].filter((e) => e && !EXTS.has(e));
  const FILE = ["package.json", "tsconfig.json", "README.md", "SIGN-OFF.md"];
  const ALWAYS = { "package.json": "package.json", "tsconfig.json": "tsconfig.json", "README.md": "README.md", "SIGN-OFF.md": "SIGN-OFF.md" };

  const cases = [
    ["写了探针，工作区口径的指纹必须变", changed !== total && changed !== ""],
    ["探针在盘上时，HEAD 口径与探针之前相同（它不读工作区）", !mHead || !headBefore ? false : mHead === headBefore],
    ["探针文件已按原字节恢复", restored],
    ["A 判据：git HEAD 里每个文件都被签或被 EXCLUDE 点名（未签：" + missed.slice(0, 4).join(", ") + (missed.length > 4 ? " …共 " + missed.length : "") + "）", missed.length === 0],
    ["B 判据：目录里出现的扩展名都被 EXTS 处理（未处理：" + unhandledExt.join(", ") + "）", unhandledExt.length === 0],
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
