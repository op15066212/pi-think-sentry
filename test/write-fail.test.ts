// 写盘失败必须能读出来：配置文件只读时，writeConfig 不能返回一个「看起来成功」的模块对象。
//
// 2026-11-20 R2 复核（会话 31e5cf4e）：实测只读文件下
//   writeConfig("dup", { min: 7 }) 返回 { on: true, min: 3 }，盘上一个字节没动，没有错误出口。
// 同一个函数的另一种失败（配置文件不是合法 JSON）返回 { error: "…" } ——
// 两个失败一个说出来、一个不说，这是「两个状态一个像」。
//
// 判据：把 src/config.ts 里那个 catch 改回 `catch {}` 并照样 return readConfig()[name]，
// 第一条必须红；第二条是它的对照，防止「永远返回 error」冒充修好。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TMP = path.join(os.tmpdir(), "pts-write-fail-" + process.pid + ".json");
process.env.CURB_CONFIG_FILE = TMP;
process.env.CURB_STATE_FILE = path.join(os.tmpdir(), "pts-write-fail-state-" + process.pid + ".json");

const { writeConfig } = await import("../src/config.ts");

const seed = () => {
  fs.rmSync(TMP, { force: true });
  fs.writeFileSync(TMP, JSON.stringify({ dup: { on: true, min: 3 } }));
};
const readonly = (on) => { try { fs.chmodSync(TMP, on ? 0o444 : 0o644); } catch {} };
const readRaw = () => fs.readFileSync(TMP, "utf8");

test("配置文件只读：写入失败必须有出口，返回里读得出 error", () => {
  seed();
  readonly(true);
  try {
    const before = readRaw();
    const out = writeConfig("dup", { min: 7 });
    const after = readRaw();
    assert.equal(before, after, "前提：只读文件确实一个字节没动");
    assert.ok(out && typeof out.error === "string",
      "写失败必须返回 error，实际返回 " + JSON.stringify(out));
  } finally {
    readonly(false);
    fs.rmSync(TMP, { force: true });
  }
});

test("对照：可写文件上写入成功，返回值里不许有 error", () => {
  seed();
  readonly(false);
  try {
    const out = writeConfig("dup", { min: 7 });
    assert.equal(out && out.error, undefined, "成功路径不许出现 error：" + JSON.stringify(out));
    assert.equal(JSON.parse(readRaw()).dup.min, 7, "值要真的落盘");
  } finally {
    fs.rmSync(TMP, { force: true });
  }
});
