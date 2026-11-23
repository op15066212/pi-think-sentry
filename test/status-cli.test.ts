// CLI 是「我自己能看」的判据：不需要 pi 进程、不需要人贴输出。
// 三条断言：退出码 0、门槛四行、台账一节存在、每行不溢出。
//
// 这个文件曾经用 heredoc 写进来，`\b` 被 shell 变成退格符、`\d` 被吞成 `d`，
// 正则静默失效（不报错、只是匹配不上）。所以判据里也有「判据自己」这一层。
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const bin = path.join(import.meta.dirname, "..", "bin", "status.mjs");

test("bin/status.mjs：rc=0，输出门槛与台账两节", () => {
  // 台账指到临时空文件：否则这个测试读的是真实台账，数值天天变，断的是环境不是代码。
  const TMP = path.join(os.tmpdir(), "status-cli-" + process.pid + ".jsonl");
  fs.writeFileSync(TMP, "");
  const prev = process.env.PI_THINK_SENTRY_LEDGER;
  process.env.PI_THINK_SENTRY_LEDGER = TMP;
  try {
    let out = "";
    try {
      out = execFileSync(process.execPath, [bin], { encoding: "utf8", env: process.env });
    } catch (e: any) {
      assert.fail("退出码非 0：" + e.status + " " + e.stderr);
    }
    assert.match(out, /^capture (on|off)\b/m, "第一行要能看出 capture，实际：" + out);
    assert.match(out, /^dup \d+/m, "要有 dup 门槛，实际：" + out);
    assert.match(out, /^台账 /m, "要有台账一节，实际：" + out);
    for (const l of out.split("\n")) {
      assert.ok(l.length <= 44, "每行 ≤ 44，实际 " + l.length + "：" + l);
    }
  } finally {
    if (prev === undefined) delete process.env.PI_THINK_SENTRY_LEDGER;
    else process.env.PI_THINK_SENTRY_LEDGER = prev;
    fs.rmSync(TMP, { force: true });
  }
});
