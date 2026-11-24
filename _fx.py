import io
p = "README.md"
s = io.open(p, encoding="utf-8", newline="").read()
old = """分会话明细见

### 这一节自己翻过四次车，记在这里"""
new = """分会话明细见 `bin/probe-run-by-session.mts`（现名 `bin/probe-run-by-session.mts`，
`--selftest` 三条坏样本；不带参数时打印该会话的两档判红率）。

### 这一节自己翻过四次车，记在这里"""
assert old in s, "断句没找到"
s = s.replace(old, new, 1)
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("补回")