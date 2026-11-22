// R8：配置的「写进去」与「读出来」必须是同一个映射。
//
// 这一组坏样本全部来自实测（2026-11-22），不是设想：
//   命令 think-sentry intercept cooldown false 写入字符串 "false"，
//   configure 判 === false 为假，冷却仍然开着，而命令返回值看起来是成功。
// 判法：写一个值，读回来必须**等于**写的那个值；写不合法的东西，必须**留痕**而不是静默兜底。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { asBool, asUnit, asCount, asEnum, asObject, clearRejects, rejectsOf } from "../src/values.ts";
import intercept from "../src/features/intercept.ts";
import lang from "../src/features/lang.ts";
import binding from "../src/features/binding.ts";
import dup from "../src/features/dup.ts";

test("布尔：字符串 false 必须读成 false，不是 true", () => {
  clearRejects();
  assert.equal(asBool(true, "false"), false);
  assert.equal(asBool(true, "off"), false);
  assert.equal(asBool(true, "0"), false);
  assert.equal(asBool(false, "true"), true);
  assert.equal(asBool(false, "on"), true);
  assert.equal(asBool(false, "1"), true);
  assert.equal(asBool(true, false), false);
  assert.equal(asBool(false, true), true);
  assert.deepEqual(rejectsOf(), [], "认识的值不该记账");
});

test("布尔：不认识的值退回默认，并留痕", () => {
  clearRejects();
  assert.equal(asBool(true, "maybe"), true);
  assert.deepEqual(rejectsOf(), [{ key: "", raw: '"maybe"' }]);
  clearRejects();
  assert.equal(asBool(false, "也许是"), false);
  assert.equal(rejectsOf().length, 1, "中文乱写也要留痕");
});

test("布尔：没配（undefined / null / 空串）不记账", () => {
  clearRejects();
  assert.equal(asBool(true, undefined), true);
  assert.equal(asBool(true, null), true);
  assert.equal(asBool(true, ""), true);
  assert.deepEqual(rejectsOf(), [], "空串是「清空」，不是「配错」");
});

test("比例：空串退回默认，0 是合法值", () => {
  clearRejects();
  assert.equal(asUnit(0.3, ""), 0.3, "空串曾经被 Number 变成 0，判据随之退化");
  assert.equal(asUnit(0.3, 0), 0, "0 是合法值：它意味着「关掉这条比例」");
  assert.equal(asUnit(0.3, "0.5"), 0.5);
  assert.equal(asUnit(0.3, 1), 1);
  assert.deepEqual(rejectsOf(), []);
  // R9 第三版：越界不再「夹到边界」，而是拒绝并记账。
  // 理由是命令行对同一个值的处理必须一致——think-sentry lang ratio 1.5 被拒（不写入），
  // 如果手写 1.5 被静默夹成 1，两边就又分叉了。夹值会把「配错」变成「配了另一个值」。
  assert.equal(asUnit(0.3, 1.5), 0.3, "越界退回默认，不夹");
  assert.equal(asUnit(0.3, -1), 0.3, "越界退回默认，不夹");
  assert.equal(rejectsOf().length, 2, "两次越界都要记账");
});

test("比例：非数字留痕", () => {
  clearRejects();
  assert.equal(asUnit(0.3, "abc"), 0.3);
  assert.equal(rejectsOf().length, 1);
});

test("条数：空串退回默认，低于下界留痕", () => {
  clearRejects();
  assert.equal(asCount(3, ""), 3);
  assert.equal(asCount(3, 5), 5);
  assert.equal(asCount(3, 0), 3);
  assert.equal(rejectsOf().length, 1, "0 低于下界，要记账");
});

test("枚举：认不出退回默认，方向写错不能让判据反向", () => {
  clearRejects();
  assert.equal(asEnum("zh", "en", ["zh", "en"]), "en");
  assert.equal(asEnum("zh", "fr", ["zh", "en"]), "zh");
  assert.equal(rejectsOf().length, 1);
});

test("对象：数组与标量都算配错", () => {
  clearRejects();
  assert.deepEqual(asObject({ a: 1 }), { a: 1 });
  assert.deepEqual(asObject("x", "k"), {});
  assert.deepEqual(asObject([1], "k"), {});
  assert.equal(rejectsOf().length, 2);
});

// ===== 六个模块的 configure 与 values 必须一致：命令写什么，读回来就是什么 =====



test("binding：allowGateway 写成字符串 true 必须真的放开", () => {
  assert.equal(binding.configure({ allowGateway: "true" }).allowGateway, true);
  assert.equal(binding.configure({ allowGateway: "false" }).allowGateway, false);
  assert.equal(binding.configure({}).allowGateway, false);
});



test("dup：on 写成字符串 false 必须真的关掉", () => {
  assert.equal(dup.configure({ on: "false" }).on, false);
  assert.equal(dup.configure({ on: true }).on, true);
});

test("每个模块的 configure 都不得因畸形输入抛异常", () => {
  for (const m of [intercept, lang, binding, dup]) {
    for (const bad of [null, undefined, 0, "x", [], { on: {} }, { min: {} }]) {
      assert.doesNotThrow(() => m.configure(bad), m.name + " 遇到 " + JSON.stringify(bad));
    }
  }
});

// ===== 命令路径端到端：走真的 install + 真的命令 handler，不测类 =====

async function runCmd(args: string, cfgPath: string) {
  const prev = process.env.CURB_CONFIG_FILE;
  process.env.CURB_CONFIG_FILE = cfgPath;
  const prevLog = console.log;
  console.log = () => {};
  try {
    const install = (await import("../src/index.ts")).default;
    let cmd: any = null;
    await install({ on() {}, registerCommand(_: string, d: any) { cmd = d; } });
    const ret = await cmd.handler(args, {});
    return { ret: String(ret), cfg: JSON.parse(fs.readFileSync(cfgPath, "utf8")), read: (await import("../src/config.ts")).readConfig() };
  } finally {
    console.log = prevLog;
    if (prev === undefined) delete process.env.CURB_CONFIG_FILE; else process.env.CURB_CONFIG_FILE = prev;
  }
}



test("命令：allowGateway true 写进去的是布尔 true", async () => {
  const f = path.join(os.tmpdir(), "curb-r8-b-" + process.pid + ".json");
  fs.rmSync(f, { force: true });
  try {
    const r = await runCmd("binding allowGateway true", f);
    assert.equal(r.cfg.binding.allowGateway, true);
    assert.equal(typeof r.cfg.binding.allowGateway, "boolean");
  } finally { fs.rmSync(f, { force: true }); }
});



test("命令：对象键走命令行要说清楚，不许假装改成功", async () => {
  const f = path.join(os.tmpdir(), "curb-r8-d-" + process.pid + ".json");
  fs.rmSync(f, { force: true });
  try {
    const r = await runCmd("inject texts x", f);
    assert.match(r.ret, /对象/, "要说清楚这个键是对象");
  } finally { fs.rmSync(f, { force: true }); }
});

// ===== 体检报告只有一份（b711ced1 的判据）=====

test("两个模块各配错一次，两条都要在报告里（不许只留最后一条）", async () => {
  // 修前：threshold.ts 的 lastRejected 是单值，与 values.ts 的 rejects 数组各写一册。
  // {dup:{min:-2}, strip:{min:"x"}} 读完之后 -2 静默消失——它比「没配」更该被看见。
  const CFG = path.join(os.tmpdir(), "curb-r8-e-" + process.pid + ".json");
  const prev = process.env.CURB_CONFIG_FILE;
  process.env.CURB_CONFIG_FILE = CFG;
  fs.writeFileSync(CFG, JSON.stringify({ dup: { min: -2 }, strip: { min: "x" } }));
  try {
    const { readConfig } = await import("../src/config.ts");
    readConfig();
    const r = rejectsOf();
    assert.equal(r.length, 2, "两条都要在，实际：" + JSON.stringify(r));
    assert.ok(r.some((x) => x.raw === "-2"), "dup.min 的 -2 不许消失");
    assert.ok(r.some((x) => x.raw === '"x"'), "strip.min 的 x 不许消失");
  } finally {
    if (prev === undefined) delete process.env.CURB_CONFIG_FILE; else process.env.CURB_CONFIG_FILE = prev;
    fs.rmSync(CFG, { force: true });
  }
});



test("门槛类配错要带模块名：两个模块配成同一个错值，两条记录必须可分", async () => {
  // 两位复核方共同指出的残余：threshold 的记账 key 是个常量 "threshold"，
  // 于是 {dup:{min:-2}, strip:{min:-2}} 的两条记录一模一样——读的人看不出是哪个模块配错的。
  // 这不是格式问题：报告存在的理由就是「告诉人哪里配错了」，丢了模块名就答不了那个问题。
  const CFG = path.join(os.tmpdir(), "curb-r8-g-" + process.pid + ".json");
  const prev = process.env.CURB_CONFIG_FILE;
  process.env.CURB_CONFIG_FILE = CFG;
  fs.writeFileSync(CFG, JSON.stringify({ dup: { min: -2 }, strip: { min: -2 } }));
  try {
    const { readConfig } = await import("../src/config.ts");
    readConfig();
    const keys = rejectsOf().map((x) => x.key);
    assert.equal(keys.length, 2, "两条都要在，实际：" + JSON.stringify(rejectsOf()));
    assert.notEqual(keys[0], keys[1], "两条记录必须靠 key 区分，实际都是：" + keys[0]);
    assert.ok(keys.some((k) => k.startsWith("dup")), "要能看出 dup 配错了");
    assert.ok(keys.some((k) => k.startsWith("strip")), "要能看出 strip 配错了");
  } finally {
    if (prev === undefined) delete process.env.CURB_CONFIG_FILE; else process.env.CURB_CONFIG_FILE = prev;
    fs.rmSync(CFG, { force: true });
  }
});
