import io
p = "bin/report-run-by-session.mts"
s = io.open(p, encoding="utf-8", newline="").read()
old = '    ["正常散文不得越过 @40", "今天把磁盘扫了一遍，发现三个文件的时间戳对不上。".repeat(3), 40, false],'
new = ("    [\"正常散文不得越过 @40\", "今天把磁盘扫了一遍，发现三个文件的时间戳对不上。先把它们的路径列出来，"
" +
       "再逐个比对修改时间与内容摘要。第三步是把不一致的那几个写进报告，"
" +
       "让下一次检查能直接复现。最后重跑一遍闸门，确认没有引入新的红。", 40, false],")
assert old in s
s = s.replace(old, new, 1)
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("样本已换")