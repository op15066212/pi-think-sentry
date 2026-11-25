#!/usr/bin/env node
// main-probe.mjs —— 判据用的探针：import 一个目标模块，看它会不会在 import 时 exit。
//
// 为什么是独立文件，而不是在判据里拼字符串再写盘（2026-11-25，用户指出）：
// 我原来在 check-main-guard.mjs 里用数组拼出这段源码。拼的时候，路径正则里的反斜杠
// 要穿三层转义：JS 字符串一层、写出的文件文本一层、文件里的正则再一层。
// 我错了四次，最后一次错到判据自己不准——它报「import 时没拿到导出」，
// 而手写同样的探针跑同一条命令是 OK 的。判据自己不准比没有判据更坏：
// 它会让人去改本来没坏的代码。
//
// 现在它是仓里一个真文件：能单独跑、能直接复现、不需要任何转义生成。
//
// 用法：node --experimental-strip-types scripts/main-probe.mjs <相对路径>
// 输出：IMPORTED_OK:<导出名> 或 IMPORT_THREW:<消息>
const target = process.argv[2];
if (!target) {
  console.log("PROBE_USAGE: 缺目标路径");
  process.exit(2);
}

// 反斜杠不写字面量：写成 92，读者不必数转义层数。
const BS = String.fromCharCode(92);
const toPosix = (s) => String(s).split(BS).join("/");
const base = new URL("file:///" + toPosix(process.cwd()) + "/");

try {
  const m = await import(new URL(target, base).href);
  console.log("IMPORTED_OK:" + Object.keys(m).join(","));
} catch (e) {
  console.log("IMPORT_THREW:" + (e && e.message ? e.message : String(e)));
}
