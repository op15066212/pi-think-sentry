import { judgeThinking } from "./src/judges.ts";
import strip from "./src/features/strip.ts";
import inject from "./src/features/inject.ts";
import { settle } from "../pi-escape-guard/src/scan.ts";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const BK = "C:/tmp/session-backup-all";
const texts = [];
for (const f of readdirSync(BK).filter((f) => f.endsWith(".jsonl")).slice(0, 3)) {
  for (const line of readFileSync(join(BK, f), "utf8").split("\n")) {
    if (!line.trim()) continue;
    let e; try { e = JSON.parse(line); } catch { continue; }
    const c = e?.message?.content;
    if (Array.isArray(c)) for (const b of c) {
      if (b?.type === "thinking" && typeof b.thinking === "string" && b.thinking.length > 50) texts.push(b.thinking);
      if (b?.type === "text" && typeof b.text === "string" && b.text.length > 50) texts.push(b.text);
    }
    if (texts.length > 3000) break;
  }
  if (texts.length > 3000) break;
}
const chars = texts.reduce((n, t) => n + t.length, 0);
console.log("样本 " + texts.length + " 条，共 " + (chars/1024).toFixed(0) + " KB，平均 " + (chars/texts.length).toFixed(0) + " 字");

function bench(label, fn, R = 3) {
  fn(); // 热身
  const t0 = performance.now();
  for (let r = 0; r < R; r++) fn();
  const t1 = performance.now();
  console.log(label + " 单遍 " + ((t1 - t0) / R).toFixed(1) + " ms");
}
bench("judgeThinking 全样本", () => { for (const t of texts) judgeThinking(t, {}); });
bench("judge+strip 全样本", () => {
  for (const t of texts) {
    const v = judgeThinking(t, {});
    if (v.kind === "none") continue;
    strip.clean([{ type: "thinking", thinking: t }], v, 4);
  }
});
bench("escape-guard settle 全样本", () => { for (const t of texts) settle(t, 6); });
bench("inject.applyWith 全样本", () => { for (const t of texts) inject.applyWith([{ type: "thinking", thinking: t }], "\n[已改：语言]", {}); });
