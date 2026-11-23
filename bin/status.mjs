// 从命令行直接看状态，不需要 pi 进程，也不需要人替我把输出贴过来。
//
// 存在理由（2026-11-23，使用者两次问「所有数据你自己可以查看」）：
// /think-sentry 是 pi 内部命令，agent 在 bash 里调不到它，
// 只能写一个临时测试去模拟——那等于每次都要绕一圈。
//
// 两种数据分开读：
//   配置 —— 磁盘上的 settings.json，命令与 CLI 的共同事实
//   台账 —— ledger/judgments.jsonl，磁盘上的历史，只有 CLI 读得到（pi 进程里是内存计数）
//
// 退出码：0 正常，1 台账读不出（那是判据失败，不是环境缺失），2 配置文件不存在
import fs from "node:fs";
import path from "node:path";
import { statusLines } from "../src/index.ts";

const dir = path.join(import.meta.dirname, "..");
// 与环境变量同一口径：测试要能把台账指到临时文件，否则断的是「今天的真实数字」而不是代码。
const ledger = process.env.PI_THINK_SENTRY_LEDGER || path.join(dir, "ledger", "judgments.jsonl");

const out = [];

// 一 配置与门槛（与 /think-sentry 同一条 code path）
for (const l of statusLines()) out.push(l);

// 二 台账：磁盘上的真实历史，按轮次去重后的次数
try {
  const rows = fs.readFileSync(ledger, "utf8").trim().split("\n").filter(Boolean)
    .map((s) => { try { return JSON.parse(s); } catch { return null; } })
    .filter(Boolean);
  const red = rows.filter((r) => r.ev === "red");
  const block = rows.filter((r) => r.ev === "block");
  // 去重口径与运行时一致：同一条 red 可能来自流式的多帧
  const uniq = new Set(red.map((r) => r.at.slice(0, 19) + r.len + (r.blk || "")));
  const byRule = {};
  for (const r of red) byRule[r.rule] = (byRule[r.rule] || 0) + 1;
  const last = red.length ? red[red.length - 1].at.slice(0, 16).replace("T", " ") : "无";
  out.push("");
  out.push("台账 " + red.length + " 红 / " + block.length + " 拦");
  out.push("去重后 " + uniq.size + " 次");
  out.push("按规则 " + Object.entries(byRule).map(([k, v]) => k + ":" + v).join(" "));
  out.push("最后一次 " + last);
} catch {
  out.push("");
  out.push("台账 读不到（" + ledger + "）");
  process.exitCode = 1;
}

console.log(out.join("\n"));
