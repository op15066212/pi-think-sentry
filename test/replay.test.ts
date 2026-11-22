// replay.ts 的判据：它接受目录与 --sample，跑完 rc=0 并输出三行分布。
//
// 为什么需要这一条：replay.ts 曾经引用三个已删的判据（fragJudge / transitionJudge / sentencesOf），
// 而 npm test 不含它，于是「52 条全绿」一直是真的，只是覆盖不到这里——再改一次 judges.ts 的导出名，
// 它还会静默崩。这条测试把「脚本能跑」变成可验的。
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// 造一个最小会话目录：一条 jsonl，里面一段会判红的思考 + 一段干净的。
function makeSessions() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-replay-"));
  const lines = [
    JSON.stringify({ message: { role: "assistant", content: [{ type: "thinking", thinking: "做。\n做。\n做。\n做。" }] } }),
    JSON.stringify({ message: { role: "assistant", content: [{ type: "thinking", thinking: "这一段是正常的思考，没有重复行。" }] } }),
  ];
  fs.writeFileSync(path.join(dir, "s.jsonl"), lines.join("\n"));
  return dir;
}

test("replay 能跑：造一个会话目录，断言 rc=0 且输出含三条分布", () => {
  const dir = makeSessions();
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "scripts/replay.ts", dir], {
    encoding: "utf8",
    cwd: path.resolve(import.meta.dirname, ".."),
  });
  try {
    assert.equal(r.status, 0, "replay 应该 rc=0，实际 " + r.status + "\n" + (r.stderr || "").slice(0, 300));
    for (const k of ["none", "strip", "retract"]) {
      assert.ok(r.stdout.includes(k), "输出里应有 " + k + " 那一行，实际：\n" + r.stdout.slice(0, 300));
    }
    // 造进去的那段「做。×3」必须被判 strip——证明它真的跑了判据，不只是打印表头。
    assert.match(r.stdout, /strip\s+1\s/, "造的那段复诵应判 strip，实际输出：\n" + r.stdout.slice(0, 400));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("replay 的 --sample 生效：两段里只取一段时不报错", () => {
  const dir = makeSessions();
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "scripts/replay.ts", dir, "--sample", "1"], {
    encoding: "utf8",
    cwd: path.resolve(import.meta.dirname, ".."),
  });
  try {
    assert.equal(r.status, 0, "带 --sample 也应 rc=0：" + (r.stderr || "").slice(0, 200));
    assert.match(r.stdout, /去重 1 段/, "应只取 1 段，实际：\n" + r.stdout.slice(0, 300));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
