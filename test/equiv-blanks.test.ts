// 变异巡检第一轮判错的四条 + verdict.ts:19 的真空白。
// 每条测试对应一个「翻掉运算符测试仍全绿」的坐标；这些测试在位，下一轮 mutate
// 不再把它们当成已清账的等价变异。等价的那一条（cut.ts:11 i<lines.length）
// 没有测试：splice(len,1) 对越界下标不动数组，split/join 恒等，152 组输入零差异。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { Verdict } = await import("../src/verdict.ts");
const { readConfig, readProblem, writeConfig } = await import("../src/config.ts");
const dup = (await import("../src/features/dup.ts")).default;
const intercept = (await import("../src/features/intercept.ts")).default;
const strip = (await import("../src/features/strip.ts")).default;
const lang = (await import("../src/features/lang.ts")).default;

test("verdict: isNum 对 NaN 与 Infinity 也拦（verdict.ts:19 的 && 翻成 || 必须红）", () => {
  const ev = { blk: null, reps: 0, why: "w", dups: [] };
  for (const bad of [NaN, Infinity, -Infinity]) {
    assert.throws(() => Verdict.parse({ kind: "none", tag: "clean", rule: "dup", ev: { ...ev, reps: bad } }),
      /ev\.reps/, "reps=" + String(bad) + " 应抛");
    assert.throws(() => Verdict.parse({ kind: "retract", rule: "lang",
      ev: { cjk: bad, lat: 0, lines: 1, dir: "zh", sample: null } }),
      /ev\.cjk/, "cjk=" + String(bad) + " 应抛");
  }
});

test("config: 文件内容是 JSON null 时判 broken（config.ts:57 第一个 || 翻成 && 必须红）", () => {
  const tmp = path.join(os.tmpdir(), "curb-null-" + process.pid + ".json");
  process.env.CURB_CONFIG_FILE = tmp;
  try {
    fs.writeFileSync(tmp, "null");
    readConfig();
    assert.equal(readProblem(), "broken", "null 也算坏文件：写回去会丢东西");
  } finally { try { fs.rmSync(tmp, { force: true }); } catch {} }
});



test("strip: 空 thinking 块不被塞占位文案（strip.ts:41 的 && 翻成 || 必须红）", () => {
  const v = { kind: "strip", rule: "dup", ev: { blk: null, reps: 3, why: "w", dups: [["甲", 3, [0, 1, 2]]] } };
  const content = [{ type: "thinking", thinking: "甲\n甲\n甲\n甲\n甲" }, { type: "thinking", thinking: "" }];
  const r = strip.clean(content, v, 3);
  assert.equal(r.cleaned, true);
  assert.equal(r.content[1].thinking, "", "空块没被删，不该得到占位文案");
});

test("writeConfig: 模块段是数组或字符串时不把下标键写进配置（config.ts:104 两处 && 翻成 || 必须红）", () => {
  const tmp = path.join(os.tmpdir(), "curb-idx-" + process.pid + ".json");
  process.env.CURB_CONFIG_FILE = tmp;
  try {
    for (const [raw, keys] of [["[1,2]", ["min", "on"]], ["\"abc\"", ["min", "on"]]]) {
      fs.writeFileSync(tmp, "{\"dup\":" + raw + "}");
      writeConfig("dup", {});
      assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(tmp, "utf8")).dup).sort(), keys,
        "段=" + raw + " 写回后不该多出下标键");
    }
  } finally { try { fs.rmSync(tmp, { force: true }); } catch {} }
});

test("strip: dups 含越界行号（offset+n）时不给空块塞占位（strip.ts:41 的 < 翻成 <= 必须红）", () => {
  // 形状：第一块 3 行全重复，第二块是空 thinking。dups 的行号越界到 4 = offset(3)+n(1)。
  // 越界行号只能来自畸形的 Verdict（Verdict.parse 不校验行号范围）——
  // 与 verdict.ts 注释里「畸形 ev 静默给出反向指令」是同一类风险。
  const v = { kind: "strip", rule: "dup", ev: { blk: null, reps: 4, why: "w", dups: [["甲", 5, [0, 1, 2, 3, 4, 5]]] } };
  const content = [{ type: "thinking", thinking: "甲\n甲\n甲\n甲\n甲\n甲" }, { type: "thinking", thinking: "" }];
  const r = strip.clean(content, v, 3);
  assert.equal(r.content[1].thinking, "", "越界行号不该让空块看起来「被删过」");
});
