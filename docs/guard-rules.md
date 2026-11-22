## 三条规则

| 规则 | 判据（代码位置） | 干预 | 坏样本 ⇒ 期望 |
| --- | --- | --- | --- |
| frag | fragJudge，guard.ts:118。切句后，同一个匹配 /^(?:[\u4e00-\u9fffA-Za-z]{1,2}|[（(]…[)）])$/ 的句子出现 ≥3 次；句子总数 <6 返回 clean/few；三反引号代码块内不统计。scope=both，思考和正文都判。 | 417 行 mode=replace。turn_end 命中 → context_edit(replacement:null) 撤本条 + custom_message(display:false) 说明 + continue:true 重发。若本轮有 toolResults，effMode 降为 append：保留原答，只续写一段（325 行），每 run 一次。 | 「先读文件。做。再改代码。做。然后跑测试。做。」 ⇒ hit/repeat；「做。做。做。」 ⇒ clean/few；代码块里的重复 ⇒ clean |
| lang | langJudge，guard.ts:147。剥掉代码块、行内代码、公式、URL、盘符路径后，拉丁字母 <60 返回 skip；否则 (func≥10 且 lat>cjk) 或 (cjk=0 且 func≥3 且 lat≥200) 即 hit。func 数的是 the/is/that/we/let 这类虚词。scope=thinking。 | 429 行 mode=replace，同 frag 的撤回路径；但只判 turn_end 里的 thinkingOf(event.message)。 | 「Maybe we need to check the total again. But let us cross-check by another method, and it is fine to be careful here because the sum looks off.」 ⇒ hit；「ECU_PART_NUMBER, ECU_SUPPLIER, SOFTWARE_DID」 ⇒ clean（func=0） |
| combo | classCountJudge，guard.ts:175。逐句找「N 个不动点」「N 条 m-循环」，算出 should=fixed+cycles，再找「N 个轨道／等价类」，若 claimed≠should 即 hit。含 错/误/改/应该/而非/修正/漏/对不上/引用/「」/` 的句子整句跳过。scope=text。 | 434 行 mode=replace。命中后撤回正文重写，并按圈数重算给他看（CLAUSE_COMBO，guard.ts:405-409）。 | 「2 个不动点，其余分成两个 3-循环，共 3 个轨道。」 ⇒ hit（should=4）；「2 个不动点加上两个 3-循环，共 4 个轨道。」 ⇒ clean |

三条共用一套预算：retry=2，耗尽后进 COOLDOWN_MS=90 秒冷却，冷却期满重置预算（327-337 行）。同一 messageEntryId 只撤一次（done 集合，338 行）。三条的 say() 文案都要过 strictFragJudge 零容差自审，否则扩展拒绝启动（444-454、470-475 行）。

## 为什么 message_update 判不了 thinking

因为 message_update 递过来的 event.message 是增量片段，不是累积后的完整消息。这一点写在 guard.ts 第 263-266 行的注释里，是 2026-11-13 12:29 的实测结论：thinkingOf 从该事件取到的文本长度只有 3、7、13 个字符，而判据入口有 minLen=60 的下限，于是每一次都被长度门挡回去，判据在结构上从未执行过一次。当时的日志显示有 hit，那是因为 hit 记的是别的路径；真跑起来这个分支一行都没进过，十二个小时里它看起来在工作，实际上判据是死的。

修法是删掉 message_update 监听，把 thinking 挪到 turn_end 判。turn_end 的 event.message 是整条消息，thinkingOf 一次就能拿到全量思考文本，长度门才有意义。代价是判定时机从「边生成边判」推迟到「一轮结束才判」，只能在轮末打断并重发，无法在生成中途刹车。这个代价被接受了，因为增量判定的收益为零：判据根本跑不起来，早判等于没判。同一轮里 thinking 和正文共用 stamped 标记，保证只介入一次，避免两条规则各撤一次。
