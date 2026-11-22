// 命令行写配置：解析失败必须不写文件，并且说出原因。
//
// 2026-11-22 测出的三条静默失效：
//   dup min abc   → Number("abc") = NaN → JSON 里变 null → threshold 把 null 当「没配」
//                   静默兜底成 3，命令还返回 {"min":3}，看起来成功了。
//   dup on maybe  → 只要不是 false/off 就变 true。
//   strip min -1  → 非法值写进文件，只在体检报告里报 -1，配置本身仍是坏的。
// 现在类型知识只来自 defaults（一处），解析与写入在同一个函数里：解析失败 = 不写。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CFG = path.join(os.tmpdir(), "curb-cmd-cfg-" + process.pid + ".json");
process.env.CURB_CONFIG_FILE = CFG;
process.env.CURB_STATE_FILE = path.join(os.tmpdir(), "curb-cmd-state-" + process.pid + ".json");
try { fs.rmSync(CFG, { force: true }); } catch {}

const { default: installGuard } = await import("../src/index.ts");

function fakePi() {
  const commands: Record<string, any> = {};
  return { commands, on() {}, registerCommand(n: string, s: any) { commands[n] = s; } };
}
const read = () => JSON.parse(fs.readFileSync(CFG, "utf8"));

test("非法值：返回原因，配置文件一个字都不变", async () => {
  const pi = fakePi();
  await installGuard(pi);
  const before = fs.readFileSync(CFG, "utf8");
  const cmd = pi.commands["think-sentry"];
  const bad = [
    ["dup min abc", "非数字"],
    ["strip min -1", "低于下界"],
    ["dup on maybe", "多余参数"],
  ];
  for (const [args, why] of bad) {
    const out = await cmd.handler(args, { ui: { notify() {} } });
    assert.equal(typeof out, "string", why + "：应当返回原因");
    assert.ok(!out.trim().startsWith("{"), why + "：不得返回成功形状，实际 " + out);
    assert.ok(out.includes("没有写入"), why + "：原因里要说清没写，实际 " + out);
    assert.equal(fs.readFileSync(CFG, "utf8"), before, why + "：文件不得变");
  }
});

test("合法值：写进去，输出与磁盘一致", async () => {
  const pi = fakePi();
  await installGuard(pi);
  const cmd = pi.commands["think-sentry"];
  const out = await cmd.handler("dup min 5", { ui: { notify() {} } });
  assert.equal(JSON.parse(out).dup.min, 5);
  assert.equal(read().dup.min, 5);
  await cmd.handler("dup off", { ui: { notify() {} } });
  assert.equal(read().dup.on, false, "两段式开关仍要工作");
});
