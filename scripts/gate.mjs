#!/usr/bin/env node
// gate.mjs —— 本仓所有判据的总闸。
// 为什么有：check-* 攒到 2 条以上后，靠人记得单跑；漏一条等于那条不存在。
// 判据：跑完本目录全部 check-*.mjs，每个留自己的 rc，任一步非零则 rc=1。
// 反例：往 scripts/ 塞一个返回 1 的 check-zzz.mjs，本闸必须 rc=1 并点名。
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const files = fs.readdirSync(DIR).filter((f) => /^check-.*\.mjs$/.test(f)).sort();
if (!files.length) { console.error('gate: 没有 check-*.mjs（rc=2，环境缺失）'); process.exit(2); }
let bad = 0;
for (const f of files) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(DIR, f)], { stdio: 'inherit', timeout: 300000 });
  const rc = r.status ?? 1;
  console.log((rc === 0 ? 'OK   ' : 'FAIL ') + f + ' rc=' + rc + ' ' + (Date.now() - t0) + 'ms');
  if (rc !== 0) bad++;
}
console.log('gate: ' + files.length + ' 步，失败 ' + bad);
process.exit(bad ? 1 : 0);
