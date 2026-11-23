import io

p = 'C:/Users/15066212pp/.pi/agent/extensions/pi-think-sentry/scripts/e2e-real.mjs'
s = io.open(p, encoding='utf-8', newline='').read()

start = s.index("ok(/坍缩成|全部重复已删/.test(after), '有处置标记');")
end = s.index('\n', start) + 1

new = """// 标记不是每条路都有：fold（折叠）总是留标记；strip（删行）只有删空了才留。
// 断言按判决分支写，否则测的是「标记存不存在」，不是「处置对不对」。
if (v.kind === 'fold') ok(/坍缩成/.test(after), 'fold 留折叠标记');
else ok((after.match(/^做。$/gm) || []).length < target.n, 'strip 之后重复行变少：' + target.n + ' → ' + (after.match(/^做。$/gm) || []).length);
"""
s = s[:start] + new + s[end:]

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('断言已按分支改写')
