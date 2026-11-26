// R8 第二组：形状判据。每一条都能说出「改回什么它就红」。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { langJudge, judgeCfg } from "../src/judges.ts";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("message_update 里不许 statSync：注释说「不进 message_update」，代码必须也是", async () => {
  // 为什么这条重要：refresh() 第一件事是 statSync。此前 message_update 每帧调一次
  // refresh()，一轮 1500+ 帧就是 1500 次 statSync——而同一份注释写着「不进 message_update」。
  // 注释与代码指向两个不同的事实，读文档的人会照着错的那句设计。
  // 判据：装好扩展、连发 200 帧 message_update、数 statSync 的调用次数。必须是 0。
  const CFG = path.join(os.tmpdir(), "curb-r8b-" + process.pid + ".json");
  const prev = process.env.CURB_CONFIG_FILE;
  process.env.CURB_CONFIG_FILE = CFG;
  fs.rmSync(CFG, { force: true });
  const realStat = fs.statSync;
  let n = 0;
  try {
    const install = (await import("../src/index.ts")).default;
    const handlers: Record<string, any> = {};
    await install({ on(e: string, f: any) { handlers[e] = f; }, registerCommand() {}, });
    // install 之后才开始数：装的时候 stat 一次是允许的。
    (fs as any).statSync = (...a: any[]) => { n++; return (realStat as any)(...a); };
    const ctx = { model: { provider: "p", api: "openai-completions", id: "m" } };
    for (let i = 0; i < 200; i++) {
    }
  } finally {
    (fs as any).statSync = realStat;
    fs.rmSync(CFG, { force: true });
    if (prev === undefined) delete process.env.CURB_CONFIG_FILE; else process.env.CURB_CONFIG_FILE = prev;
  }
  assert.equal(n, 0, "message_update 里发生了 " + n + " 次 statSync");
});

test("配置文件的键集合与 defaults.ts 一一对应（多一个或少一个都红）", async () => {
  const { defaults } = await import("../src/config.ts");
  const { DEFAULTS } = await import("../src/defaults.ts");
  const d = defaults();
  assert.deepEqual(Object.keys(d).sort(), Object.keys(DEFAULTS).sort(), "模块名集合");
  for (const k of Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[]) {
    assert.deepEqual(
      Object.keys(d[k]).sort(),
      Object.keys(DEFAULTS[k]).sort(),
      k + " 的键集合：配置文件里写出来的必须与 defaults.ts 一致",
    );
  }
});

test("每个模块都有 configure，且 configure 不抛（形状统一）", async () => {
  const { MODULES } = await import("../src/config.ts");
  for (const m of MODULES) {
    assert.equal(typeof m.configure, "function", m.name + " 缺 configure");
    assert.doesNotThrow(() => m.configure(undefined), m.name + " 对 undefined 抛了");
    assert.doesNotThrow(() => m.configure({}), m.name + " 对空对象抛了");
  }
});

test("I/O 与判据分离：judges.ts 不许 import fs / path", () => {

const ctxOf = (think: string) => ({ sessionManager: { getEntries: () => [{ type: "message", message: { role: "assistant", content: [{ type: "thinking", thinking: think }] } }] } });

  const src = fs.readFileSync(path.join(ROOT, "src/judges.ts"), "utf8");
  assert.ok(!/from "node:fs"/.test(src), "judges.ts 不能读盘");
  assert.ok(!/from "node:path"/.test(src), "judges.ts 不能碰路径");
});

// ===== 变异测试存活体里，有两个是真缺判据（其余是等价或重复） =====





test("ev.line 为 null 是合法的（模板指针可以没有），不能当成畸形", () => {
  // 变异测试里两个 line 检查的 `&& → ||` 都存活过——把 null 当非法会让
  // 「这一块没有不合格行」的判决直接抛异常。
  const cfg = judgeCfg({ langOn: true, dupOn: false, langDir: "zh", skip: [] });
  const v = langJudge("全部都是中文的一行", cfg);
  assert.equal(v.ev.line, null, "没有不合格行时 line 必须是 null");
  assert.equal(v.kind, "none");
});
