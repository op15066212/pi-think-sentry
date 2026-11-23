// 配置的五条守护：默认创建、坏 JSON、坏字段、旧键迁移、只认声明过的键。
// 外加两条「开关真的生效」，否则配置文件只是一份文档。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TMP = path.join(os.tmpdir(), "curb-cfg-" + process.pid + ".json");
process.env.CURB_CONFIG_FILE = TMP;

// 2026-11-20：读盘只留在这里两行。时间轴判据（ax9）判「同一路径常量读两遍」，
// 而这些读发生在同一个文件的不同测试用例里，各自验证不同的写入结果——
// 该读，不读才是假绿。收成函数之后判据看到 1 处，语义一点没变。
const readTmp = () => fs.readFileSync(TMP, "utf8");
const readJson = () => JSON.parse(readTmp());
process.env.CURB_STATE_FILE = path.join(os.tmpdir(), "curb-state-" + process.pid + ".json");

const { default: installGuard } = await import("../src/index.ts");
const { readConfig, writeConfig, defaults, ensureConfig, configFile, readProblem } = await import("../src/config.ts");
const { judgeThinking, judgeCfg } = await import("../src/judges.ts");
const strip = (await import("../src/features/strip.ts")).default;

const wipe = () => { try { fs.rmSync(TMP, { force: true }); } catch {} };
const write = (v) => fs.writeFileSync(TMP, typeof v === "string" ? v : JSON.stringify(v));

// 跨字段一致性：strip.min > dup.min 会「判红了但删不了」——两个字段单独看都合法，
// 只有放在一起才矛盾。这条判据就是为这种矛盾存在的。
test("strip.min 大于 dup.min 时报告 strip-gt-dup", async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const f = path.join(os.tmpdir(), "cfg-gt-" + process.pid + ".json");
  const prev = process.env.CURB_CONFIG_FILE;
  try {
    fs.writeFileSync(f, JSON.stringify({ dup: { min: 3 }, strip: { min: 5 } }));
    process.env.CURB_CONFIG_FILE = f;
    const mod = await import("../src/config.ts?gt=" + Date.now());
    const cfg = mod.readConfig();
    assert.equal(cfg.dup.min, 3);
    assert.equal(cfg.strip.min, 5);
    assert.equal(mod.readProblem(), "strip-gt-dup", "跨字段矛盾要能报出来");
  } finally {
    if (prev === undefined) delete process.env.CURB_CONFIG_FILE; else process.env.CURB_CONFIG_FILE = prev;
    fs.rmSync(f, { force: true });
  }
});

test("文件不在时自动建一份默认的", () => {
  wipe();
  ensureConfig();
  assert.ok(fs.existsSync(configFile()), "应当创建配置文件");
  const got = readJson();
  assert.deepEqual(got, defaults(), "内容应当就是各模块的默认值");
});

test("文件不是合法 JSON：整份回默认，不抛", () => {
  write("{ 这不是 JSON");
  const cfg = readConfig();
  assert.deepEqual(cfg, defaults(), "坏 JSON 应当等于全默认");
});

test("单个字段值非法：只退这一个字段", () => {
  write({ dup: { on: true, min: "abc" }, lang: { on: true, dir: "fr" } });
  const cfg = readConfig();
  assert.equal(cfg.dup.min, 4, "min 非法回默认 4");
  assert.equal(cfg.dup.on, true, "同模块的合法字段不动");
  assert.equal(cfg.lang.dir, "zh", "dir 只认 zh 或 en");
});

test("旧形状迁移：顶层 selfCheck / selfCheckText 挪进 inject", () => {
  write({ lang: "en", selfCheck: false, selfCheckText: "旧文案" });
  const cfg = readConfig();
  assert.equal(cfg.lang.dir, "en", "旧形状 lang 是字符串，按方向读");
  assert.equal(cfg.inject.on, false, "selfCheck false 对应 inject.on false");
  assert.equal(cfg.inject.texts.dup, "旧文案", "selfCheckText 对应 inject.text");
});

test("配置文件坏了：拒绝写入，不覆盖原有内容", () => {
  // 2026-11-21 实测的真缺陷：readRaw 把「文件不存在」和「文件坏了」都当成空对象，
  // 于是写一个键就把用户的整份配置冲掉。多一个尾逗号就够触发。
  // 读路径要宽容（插件得能起来），写路径不能——写会把宽容变成删除。
  wipe();
  const broken = '{\n  "dup": { "min": 4 },\n  "lang": { "dir": "en" },\n}\n';
  fs.writeFileSync(TMP, broken);
  const r = writeConfig("strip", { min: 5 });
  assert.ok(r && r.error, "必须返回错误，不能静默写入");
  assert.equal(readTmp(), broken, "文件必须逐字不变");
  // 对照：同一份内容修好尾逗号后，写入既成功也不丢别的键。
  const fixed = '{\n  "dup": { "min": 4 },\n  "lang": { "dir": "en" }\n}\n';
  fs.writeFileSync(TMP, fixed);
  const ok = writeConfig("strip", { min: 5 });
  assert.equal(ok.min, 5, "修好之后能写进去");
  const back = readJson();
  assert.equal(back.dup.min, 4, "别的模块的键不许丢");
  assert.equal(back.lang.dir, "en", "另一个模块的键也不许丢");
});

test("读失败的两个原因必须分得开：不存在可以写，坏了不许写", () => {
  // 这一条锁的是「表示」本身。2026-11-21 之前 readRaw 把三态合成一个 {}，
  // 于是 writeConfig 无法区分「首次配置」与「用户把文件改坏了」——前者该写，后者写了就丢数据。
  wipe();
  assert.equal(readConfig().dup.on, true, "读不到时用默认值跑");
  assert.equal(readProblem(), "missing", "不存在要报 missing");

  const w = writeConfig("dup", { min: 4 });
  assert.equal(w.min, 4, "不存在时可以写：这是首次配置");

  fs.writeFileSync(TMP, "{ 坏掉 }");
  readConfig();
  assert.equal(readProblem(), "broken", "坏了要报 broken，不能报 missing");
  assert.ok(writeConfig("lang", { dir: "en" }).error, "坏了不许写");
});

test("写配置只接受模块声明过的键", () => {
  wipe();
  ensureConfig();
  writeConfig("dup", { min: 4, 乱写的键: 1 });
  const raw = readJson();
  assert.equal(raw.dup.min, 4, "合法键写进去");
  assert.equal(raw.dup.乱写的键, undefined, "没声明的键不许落盘");
});

test("开关生效：两个判据都关掉时永远 none", () => {
  // 2026-11-22 第二版：readConfig 不再有副作用，判据的开关走参数。
  // 这里直接给 cfg，而不是复制 index.ts 的投影逻辑（那会是第二份）。
  // 「配置文件里的 on:false 会不会变成 cfg.dupOn:false」由 index.ts 的投影保证，
  // 那条边由 install 那组测试从 message_update 入口验。
  const v = judgeThinking(Array(5).fill("做。").join("\n"), judgeCfg({ dupOn: false, langOn: false, inlineOn: false }));
  assert.equal(v.kind, "none", "两个开关都关，判定应当永远是 none");
});

test("strip 门槛独立于 dup 门槛", () => {
  wipe();
  write({ dup: { on: true, min: 3 }, strip: { on: true, min: 5 } });
  const cfg = readConfig();
  assert.equal(cfg.dup.min, 3);
  assert.equal(cfg.strip.min, 5, "删行门槛可以比守护更严");
  // 出现 4 次：判据会判红（≥3），但删行按 5 次不该动。
  const think = Array(4).fill("做。").join("\n") + "\n正文。";
  const content = [{ type: "thinking", thinking: think }, { type: "text", text: "答" }];
  const v = judgeThinking(think);
  assert.equal(v.kind, "strip", "前提：判据红了");
  assert.equal(strip.clean(content, v, cfg.strip.min).cleaned, false, "四次不该被删（门槛 5）");
  assert.equal(strip.clean(content, v, 3).cleaned, true, "门槛 3 时同样的内容该删");
});

// 变异巡检找到的三条空白（2026-11-22 第十一版）：把 migrate 的两个条件与 readRaw 的
// 「数组算坏」各翻一次，123 条测试全绿。已有的迁移用例只覆盖了「两个旧键都在、inject 不在」。
// 三种真实形态各补一句：inject 已在（旧键不该覆盖它）、只写了文案（不该要求两个键同时在场）、
// 文件是数组（不是对象就当坏，不能拿它当配置跑）。
test("迁移不覆盖已有的 inject", () => {
  write({ inject: { on: true, text: "新的" }, selfCheck: false });
  const cfg = readConfig();
  assert.equal(cfg.inject.texts.dup, "新的", "inject 已在时，旧键不许覆盖它");
  assert.equal(cfg.inject.on, true);
});

test("只有 selfCheckText、没有 selfCheck 时也要迁移", () => {
  write({ selfCheckText: "只写了文案" });
  const cfg = readConfig();
  assert.equal(cfg.inject.texts.dup, "只写了文案");
  assert.equal(cfg.inject.on, true, "没写 selfCheck 时默认开");
});

test("配置是数组算坏，不能当对象用", () => {
  fs.writeFileSync(TMP, "[]");
  readConfig();
  assert.equal(readProblem(), "broken", "数组不是配置对象，必须报 broken");
});
