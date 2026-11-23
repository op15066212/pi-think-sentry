// 端到端：拿会话里那段真实退化（16:14，8 次「做。」），跑完整链路
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIR = path.join(os.homedir(), '.pi/agent/sessions/--c--users-15066212pp-appdata-roaming-pideck-chat-workspace--');
const sessions = fs.readdirSync(DIR).filter((f) => f.endsWith('.jsonl'))
  .map((f) => ({ f, t: fs.statSync(path.join(DIR, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t);

let target = null;
for (const { f } of sessions) {
  for (const line of fs.readFileSync(path.join(DIR, f), 'utf8').split('\n')) {
    if (!line.includes('做。')) continue;
    let r; try { r = JSON.parse(line); } catch { continue; }
    for (const c of r?.message?.content || []) {
      if (c?.type !== 'thinking') continue;
      const t = String(c.thinking || '');
      const n = (t.match(/^做。$/gm) || []).length;
      if (n >= 7 && (!target || n > target.n)) target = { n, t, f };
    }
  }
}

if (!target) { console.log('没找到样本'); process.exit(1); }
console.log('样本：', target.n, '次「做。」，', target.t.length, '字节，来自', target.f);

const TMP_STATE = path.join(os.tmpdir(), 'curb-e2e-state-' + process.pid + '.json');
const TMP_CFG = path.join(os.tmpdir(), 'curb-e2e-cfg-' + process.pid + '.json');
process.env.CURB_STATE_FILE = TMP_STATE;
process.env.CURB_CONFIG_FILE = TMP_CFG;

const { default: installGuard } = await import('../src/index.ts');
const { fakePi, call } = await import('../test/harness.ts');

fs.writeFileSync(TMP_CFG, JSON.stringify({}));
const pi = fakePi();
await installGuard(pi);

let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); c ? pass++ : fail++; };

// 1 判据：这段必须判红
const { judgeThinking } = await import('../src/judges.ts');
const v = judgeThinking(target.t);
ok(v.kind !== 'none', '判据判红：' + v.kind + ' ' + (v.ev?.why ?? ''));

// 2 拦截链路：同一轮内后续 tool_call 必须被拦
await call(pi, 'before_agent_start', {});
await call(pi, 'message_update', { message: { content: [{ type: 'thinking', thinking: target.t }] } });
// 空 thinking 帧（思考输出完、只剩工具调用）——旧代码在这里洗白判决
await call(pi, 'message_update', { message: { content: [{ type: 'toolCall', id: 't1', name: 'codemode' }] } });
const out = await call(pi, 'tool_call', { toolName: 'codemode', input: {} });
ok(out.some((x) => x && x.block), 'tool_call 被拦（空帧没洗白）');

// 3 折叠：turn_end 把那段换成标记
const edit = await call(pi, 'turn_end', {
  outcome: 'completed',
  messageEntryId: 'e1',
  message: { content: [{ type: 'thinking', thinking: target.t }, { type: 'text', text: '答' }] },
});
const payload = (Array.isArray(edit) ? edit : []).find((x) => x && Array.isArray(x.entries));
const after = payload?.entries?.[0]?.replacement?.content?.[0]?.thinking ?? '';
ok(after.length < target.t.length, '折叠后更短：' + target.t.length + ' → ' + after.length + ' 字节');
// 标记不是每条路都有：fold（折叠）总是留标记；strip（删行）只有删空了才留。
// 断言按判决分支写，否则测的是「标记存不存在」而不是「处置对不对」。
if (v.kind === 'fold') ok(/坍缩成/.test(after), 'fold 留折叠标记');
else ok((after.match(/^做。$/gm) || []).length < target.n, 'strip 之后重复行变少：' + target.n + ' → ' + (after.match(/^做。$/gm) || []).length);

console.log();
console.log(fail ? 'FAIL ' + fail + ' 条' : 'PASS ' + pass + ' 条（真实样本端到端）');
process.exit(fail ? 1 : 0);
