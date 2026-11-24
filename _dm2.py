
import io
p = "src/meta.ts"
s = io.open(p, encoding="utf-8", newline="").read()
n = 0
for rid in ["inline", "run", "shape"]:
    key = 'id: "' + rid + '", kind: "verdict"'
    if key not in s:
        continue
    i = s.index(key)
    start = i
    j = s.rfind("\n", 0, i)
    while j > 0:
        prev_start = s.rfind("\n", 0, j) + 1
        prev = s[prev_start:j]
        if prev.lstrip().startswith("//"):
            start = prev_start
            j = prev_start - 1
        else:
            break
    end = s.index("\n  },\n", i) + len("\n  },\n")
    # 若上一层还留着孤立的 {，一并吃掉
    before = s[:start].rstrip("\n")
    if before.endswith("{"):
        start = len(before) - 1
    s = s[:start] + s[end:]
    n += 1
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("删掉规则条目", n, "条")
