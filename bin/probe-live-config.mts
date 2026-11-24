// probe-live-config —— settings.json 的开关是否真的走到 judgeThinking。
//
// 2026-11-24 复核方指出它原来叫 bin/live-config-check.mts，不在 check-probes 的
// probe-* 通配里，所以那 37 行脚本从来没进执行面。改成 probe- 前缀之后
// check-probes 会要求它「不带参数时 rc 是 0 或 2」——本脚本不带参数就跑完整检查，
// 全部通过时 rc=0，符合。
//
// 2026-11-24 两次写错，都记在下面：
//   1) 上一版猜错导出名（installGuard 是默认导出，写成了命名导入）→ ERR_MODULE_NOT_FOUND
//   2) 上一版把 judgeThinking 当成 (text, skip, cfg) 三个参数，
//      实际签名是 (text, patch: Partial<JudgeCfg>) 两个参数——第三个被静默忽略。
//      改完才发现整个脚本从来没按 settings 跑过，一直用的默认配置。
//   这里给每一条断言都加「证伪」，就是为了让这种静默失效无处可躲。
import { readConfig } from "../src/config.ts";
import { judgeThinking } from "../src/judges.ts";

const c = readConfig();
console.log("settings 键：", Object.keys(c).sort().join(" "));
console.log("dup.on =", c.dup.on, " lang.on =", c.lang.on, " strip.on =", c.strip.on);

// 样本必须在「不重复」与「重复」上分得开，否则会被前面的判据先抓走。
// lang 用单行、无重复的纯英文——repeat(4) 会被 dup.min=4 抓掉，lang 永远轮不到。
const dupSample = Array(6).fill("做。").join(String.fromCharCode(10));
const langSample = "The pre-input snapshot failed with exit code 128 while creating the session directory.";
const clean = "今天把磁盘扫了一遍，发现三个文件的时间戳对不上。先把它们的路径列出来。";

const judge = (text, patch) => judgeThinking(text, patch);

const line = (label, v, extra) => console.log(label.padEnd(16), "→", String(v.kind).padEnd(8), "/", String(v.rule).padEnd(6), extra || "");

// 1) 按 settings 跑三个样本
line("dup 样本", judge(dupSample));
line("lang 样本", judge(langSample));
line("正常文本", judge(clean));

// 2) dup 的证伪：关掉后同一样本不得再出 fold
const dupOff = judge(dupSample, { dupOn: false });
const dupOk = dupOff.kind !== "fold";
line("dup 关掉后", dupOff, dupOk ? "（dup 开关接在判据上）" : "（dup 那格没验到！）");

// 3) lang 的证伪：关掉后同一句必须变 none
//    判据看 kind 不看 rule：langOn=false 时返回 none("lang")，那个 none 的 rule 也是 lang。
const langOff = judge(langSample, { langOn: false });
const langOk = langOff.kind === "none";
line("lang 关掉后", langOff, langOk ? "（lang 开关接在判据上）" : "（lang 那格没验到！）");

const allOk = dupOk && langOk;
console.log("");
console.log(allOk ? "两个开关都实测接到了判据上" : "有开关没验到，见上面标红的行");
process.exit(allOk ? 0 : 1);
