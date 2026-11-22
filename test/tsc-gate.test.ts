// 「类型检查通过」这句话必须能证伪（R9 第三版，6e8dd769 指出的）。
//
// 我此前每一轮都写「tsc 干净」，用的命令是：
//   npx tsc --noEmit | head -5; echo rc=$?
// 那个 rc 是 head 的退出码，恒 0。而且没有 tsconfig 时 tsc 用默认配置，strict 都没开。
// 也就是说：那句话在报告里出现了很多轮，从来没有被验证过。
//
// 这条判据做两件事，缺一不可：
//   一 好状态必须 rc=0（有 tsconfig、strict 开、文件真被读）
//   二 **塞一个必错文件必须 rc≠0**——没有这一半，「rc=0」与「tsc 没跑」不可区分
// 第二条是「闸门自己也要能红」那条纪律的直接落实。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const runTsc = () => {
  // 不用管道：spawnSync 直接给 status。管道末端拿 rc 是这条判据出生的原因。
  const r = spawnSync(process.execPath, [path.join(ROOT, "node_modules", "typescript", "bin", "tsc"), "-p", path.join(ROOT, "tsconfig.json"), "--noEmit"], { cwd: ROOT, encoding: "utf8" });
  return { status: r.status, out: String(r.stdout || "") + String(r.stderr || "") };
};

test("tsconfig 存在且开 strict：没有它 tsc 的检查面是空的", () => {
  const p = path.join(ROOT, "tsconfig.json");
  assert.ok(fs.existsSync(p), "缺 tsconfig.json 时 tsc 用默认配置，strict 不开");
  const txt = fs.readFileSync(p, "utf8");
  assert.match(txt, /"strict":\s*true/, "strict 必须显式打开");
  assert.match(txt, /"include"/, "必须声明 include，否则检查哪些文件靠猜");
});

test("好状态 rc=0", () => {
  const { status, out } = runTsc();
  assert.equal(status, 0, "tsc 报错：\n" + out.slice(0, 800));
});

test("坏样本 rc≠0：判据自己能红", () => {
  const probe = path.join(ROOT, "src", "__must_fail.ts");
  fs.writeFileSync(probe, 'const x: number = "not a number";\n');
  try {
    const { status, out } = runTsc();
    assert.notEqual(status, 0, "塞了必错文件 tsc 仍然 rc=0，说明这条判据是恒假绿");
    assert.match(out, /error TS/, "要有 error TS 行");
  } finally {
    fs.rmSync(probe, { force: true });
  }
});
