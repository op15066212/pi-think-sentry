// 一次性实测：settings.json 的开关是否真的走到 judgeThinking
// 2026-11-24：上一次写这个探针时猜错了导出名（installGuard 是默认导出，不是命名导出），
// 报 ERR_MODULE_NOT_FOUND。这次不碰 installGuard，直接测判据层。
import { readConfig } from "../src/config.ts";
import { judgeThinking, judgeCfg } from "../src/judges.ts";

const c = readConfig();
console.log("settings 键：", Object.keys(c).sort().join(" "));
console.log("dup.on =", c.dup.on, " lang.on =", c.lang.on, " strip.on =", c.strip.on);

const dupSample = Array(6).fill("做。").join("\n");
const langSample = "The user reports pi-undo pre-input snapshot failed with git init exit code 128.\n".repeat(4);
const clean = "今天把磁盘扫了一遍，发现三个文件的时间戳对不上。先把它们的路径列出来。";

const live = judgeCfg({
  dupOn: c.dup.on, dupMin: c.dup.min,
  langOn: c.lang.on, langDir: c.lang.dir,
});

const show = (label, text) => {
  const v = judgeThinking(text, [], live);
  console.log(label.padEnd(12), "→", v.kind, "/", v.rule);
  return v;
};

show("dup 样本", dupSample);
show("lang 样本", langSample);
show("正常文本", clean);

// 证伪：把 dup 关掉，同一 dup 样本必须不再判红
const dupOff = judgeCfg({ dupOn: false, langOn: c.lang.on, langDir: c.lang.dir });
const v = judgeThinking(dupSample, [], dupOff);
// fold 才是 dup 判据的动作。strip 也产 dup rule（RULE_OF.strip = ["dup"]），
// 所以看 rule 会误判——这是 2026-11-24 我这个探针第一版写错的地方。
const ok = v.kind !== "fold";
console.log("dup 关掉后  →", v.kind, "/", v.rule, ok ? "（开关真的接在判据上）" : "（开关没接上！）");
process.exit(ok ? 0 : 1);
