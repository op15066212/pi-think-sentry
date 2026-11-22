// 文档漂移：README 里反引号包着的标识符，必须在 src/ 里真的导出。
//
// 口径：只查 README.md。PR.md 是历史文件（记的是当时那次改动），
// 里面出现已删的 fragJudge 是它的本分，不查它。
// 另查一条：package.json 依赖清空后，README 不该还在描述安装体积。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");

const src = fs.readdirSync(path.join(ROOT, "src"))
  .filter((f) => f.endsWith(".ts"))
  .map((f) => fs.readFileSync(path.join(ROOT, "src", f), "utf8"))
  .join("\n");
const exported = new Set([...src.matchAll(/export (?:const|function|class) (\w+)/g)].map((m) => m[1]));

// 只查「看起来像本项目标识符」的词，避免把普通英文单词当函数名
const SUFFIX = /(?:Judge|LinesOf|stripDupLines|Verdict|FIELDS|CTX|freshCtx)$/;

test("README 里反引号包着的标识符都真的导出", () => {
  const names = new Set();
  for (const m of readme.matchAll(/`([A-Za-z_][\w]*)`/g)) if (SUFFIX.test(m[1])) names.add(m[1]);
  const missing = [...names].filter((n) => !exported.has(n)).sort();
  assert.deepEqual(missing, [], "README 提到但代码里不存在：" + missing.join(", "));
});

test("依赖清空后 README 不再描述安装体积", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const deps = Object.keys(pkg.dependencies || {}).length;
  if (deps > 0) return;   // 有依赖时不约束，这条只在零依赖时生效
  const hits = readme.split("\n")
    .map((l, i) => [i + 1, l])
    .filter(([, l]) => /安装体积|\bMB\b|\bdependencies\b/.test(l) && /(MB|zod|xstate|mdast)/.test(l));
  assert.deepEqual(hits, [], "零依赖了但 README 还在描述体积：" + hits.map(([i]) => i).join(","));
});

test("运行时依赖是 0 个（加回来要同时改 README）", () => {
  // 与上一条分工：上一条管「零依赖时文档不该描述体积」，这条管「依赖数本身」。
  // 分开是为了加回依赖时先在这里红一次，提醒人去看 README，
  // 而不是让体积那条测试同时承担两个职责。
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.deepEqual(Object.keys(pkg.dependencies || {}), [], "运行时依赖回到 0 是设计，加回来要同时改 README");
});

test("README 里不写会漂的测试条数", () => {
  // 「会变的值不进文字，只写怎么算」——条数随时会变，npm test 自己会打印。
  // 写进文档就有两个源，而没有任何东西比较它们（2026-11-17 实测：同一份 README 里
  // 一处写 47 条、一处写 48 条，实际 48）。
  //
  // 口径收窄过一次：第一版抓「数字 + 条」且同行含 test/单测/测试，第一次真实使用就误伤
  // 了变更记录里的一句「连钩子、计数器、三条测试一起删」——那是历史陈述，不是当前条数。
  // 形状「N 条测试」无法区分两者，所以改成只抓「同一条 npm test 注释里的条数」。
  //
  // 两个方向都要有断言：该红的（npm test # 49 条单测）红，不该红的（三条测试一起删）绿。
  const hits = readme.split("\n")
    .map((l, i) => [i + 1, l])
    .filter(([, l]) => /npm test/.test(l) && /\d+\s*条/.test(l));
  assert.deepEqual(hits, [], "README 在 npm test 注释里写了条数：" + hits.map(([i, l]) => i + " 行「" + l.trim().slice(0, 40) + "」").join("，"));
});

test("README 条数判据的两个方向都能判", () => {
  // 坏样本一（该红）：npm test 注释里写条数
  const hit = (line: string) => /npm test/.test(line) && /\d+\s*条/.test(line);
  assert.equal(hit("npm test  # 49 条单测"), true, "命令注释里的条数要红");
  // 坏样本二（不该红）：变更记录里的历史陈述
  assert.equal(hit("| 6650c96 | …连钩子、计数器、三条测试一起删 |"), false, "历史陈述不该红");
  // 坏样本三（该红）：同一行里 npm test 与条数都出现，顺序反过来
  assert.equal(hit("49 条全绿（npm test）"), true, "顺序反过来也要红");
});




