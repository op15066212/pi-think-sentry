// 门槛的取值域只在一处定义。此前 dup / strip / judges 三处各写一遍，口径还不一样：
// dup 侧不先 Number()，strip 侧先 Number()。于是配置里写 "5" 在删行侧生效、在判据侧被忽略。
//
// 第二版（2026-11-22）：兜底报告从「被兜了多少次」改成「最后被兜的原值是什么」。
// 次数是重读次数的函数——refresh 挂在三个边界上，长会话里能涨到几千，读不出任何东西。
// 这一条与 blocked/red 是同一类错误，我改第一次的时候重犯了。
//
// 第三版（R9）：这个文件不再自己存报告，门槛类的拒绝与类型类的拒绝合并进 values.ts 的
// rejects 一册。判据是 test/r8.test.ts 末条「两个模块各配错一次，两条都要在报告里」。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { threshold, MIN_FLOOR } from "../src/threshold.ts";
import { clearRejects, rejectsOf } from "../src/values.ts";
import { dupJudge, judgeCfg } from "../src/judges.ts";

test("合法值：数字与数字字符串都认，取整", () => {
  clearRejects();
  assert.equal(threshold(5, 3), 5);
  assert.equal(threshold("5", 3), 5);
  assert.equal(threshold(5.9, 3), 5);
  assert.equal(threshold(MIN_FLOOR, 3), MIN_FLOOR);
  assert.deepEqual(rejectsOf(), [], "合法值不该留下报告");
});

test("不合法：兜底，并把原值记下来（不是次数）", () => {
  clearRejects();
  assert.equal(threshold(1, 3), 3, "低于下界");
  assert.deepEqual(rejectsOf().map((r) => r.raw), ["1"]);
  assert.equal(threshold("abc", 3), 3, "非数字");
  assert.deepEqual(rejectsOf().map((r) => r.raw), ["1", '"abc"'], "两次拒绝都要在，不是只留最后一条");
  assert.equal(threshold(Number.NaN, 3), 3, "NaN");
  assert.deepEqual(rejectsOf().map((r) => r.raw), ["1", '"abc"', "null"], "NaN 经 JSON.stringify 是 null，可读但不可爱");
});

test("没给值不算配错：默认路径不留报告", () => {
  clearRejects();
  assert.equal(threshold(undefined, 3), 3);
  assert.equal(threshold(null, 3), 3);
  assert.deepEqual(rejectsOf(), [], "undefined/null 是「没配」，不是「配错了」");
});

test("报告描述现状而不是历史：readConfig 是它的边界", async () => {
  const CFG = path.join(os.tmpdir(), "curb-thr-cfg-" + process.pid + ".json");
  const prev = process.env.CURB_CONFIG_FILE;
  process.env.CURB_CONFIG_FILE = CFG;
  try {
    const { readConfig } = await import("../src/config.ts");
    fs.writeFileSync(CFG, JSON.stringify({ dup: { on: true, min: "abc" } }));
    readConfig();
    assert.deepEqual(rejectsOf().map((r) => r.raw), ['"abc"'], "读一次坏配置，报告里有它");
    readConfig();
    assert.deepEqual(rejectsOf().map((r) => r.raw), ['"abc"'], "再读一次还是同一句话，不累加");
    fs.writeFileSync(CFG, JSON.stringify({ dup: { on: true, min: 5 } }));
    readConfig();
    assert.deepEqual(rejectsOf(), [], "改回合法之后必须清空，否则它描述的是历史");
  } finally {
    if (prev === undefined) delete process.env.CURB_CONFIG_FILE; else process.env.CURB_CONFIG_FILE = prev;
    fs.rmSync(CFG, { force: true });
  }
});

test("同一个值在判据侧与删行侧得到同一个数（两处口径曾经不同）", () => {
  // 配置从参数进：threshold 把 "2" 变成 2，judgeCfg 把它放进 cfg。
  const v = dupJudge("跑。\n跑。", judgeCfg({ dupMin: threshold("2", 3) }));
  assert.equal(v.kind, "strip", "字符串 \"2\" 必须被当成 2，而不是被忽略成默认 3");
});

