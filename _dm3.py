
import io, re
p = "src/meta.ts"
s = io.open(p, encoding="utf-8", newline="").read()
for rid in ["shape", "run", "inline"]:
    key = 'id: "' + rid + '", kind: "verdict"'
    i = s.index(key)
    # 往前找到开括号行（"  {" 独占一行）
    brace = s.rfind("\n  {\n", 0, i)
    start = brace + 1
    # 再往前若是注释行也吃进来
    j = s.rfind("\n", 0, start - 1)
    while j > 0:
        ps = s.rfind("\n", 0, j) + 1
        line = s[ps:j]
        if line.lstrip().startswith("//"):
            start = ps
            j = ps - 1
        else:
            break
    end = s.index("\n  },\n", i) + len("\n  },\n")
    s = s[:start] + s[end:]
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("三条删净")
