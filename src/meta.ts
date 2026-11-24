/**
 * 元理论：依赖类型理论（唯一）。
 *
 * 一条规则 = 一个类型；说它成立 = 指得出住在这个类型里的居民。没有居民就不成立。
 * 四件缺一不算规则：形成（词落到盘上可查的东西）· 引入（命令 + 期望 rc）·
 * 消去（换第二个入口算一遍，得同一个答案）· 反例（一个具体输入，喂进去就为假）。
 *
 * 这个文件是思维哨兵的元理论声明本身：下面的 RULES 就是它的居民。
 */

export const META = "依赖类型理论" as const;

export type Piece = "形成" | "引入" | "消去" | "反例";

export interface Rule {
  /** 与 verdict.rule 或机制名对齐，供 check-rules-coverage 校验。 */
  readonly id?: string;
  /** verdict = 产生判决的判据；mechanism = 机制约束（不产生 rule）。 */
  readonly kind?: "verdict" | "mechanism";
  /** 这条规则约束的文件（相对 src/），判据会验它存在。 */
  // 一条判据常常由两件组成：配置单元（features/xxx.ts）与实现（algo/xxx.ts）。
  // 只允许一个字符串时，实现那一侧无法被点名，check-rules-coverage 就漏掉它。
  readonly module?: string | readonly string[];
  readonly prop: string;
  readonly 形成: string;
  readonly 引入: string;
  readonly 消去: string;
  readonly 反例: string;
}

/**
 * 口径上限（Ax4：说得出射程）。
 *
 * 这个数组里每一条都是**字符级**判据。它们抓得到「同一串字符重复」（dup）
 * 与「语言不匹配」（lang），抓不到「同一件事换措辞反复推演」。
 *
 * 后者是用户 2026-11-24 指着屏幕指出的那类（「务实：」前缀层层叠加，
 * 同一件事从头推五遍）。为它试过的量有八个：单段行首集中（shape）、
 * 段内残句 3-gram、段内末句 3-gram、段内整体 n-gram（unified 的 ngram 维）、
 * 跨行词共享、罕见 token 重复、行首前缀嵌套深度、跨段首句 3-gram。
 *
 * 八个在 6 个会话 17,667 段上都与正常写作重叠——
 * 「务实：」与「关键：」都长这样，退化也长这样，不退化也长这样。
 * 不是门槛没调好，是信号与「是否退化」之间没有因果关系。
 *
 * 所以这一栏是空的，而且看得出来为什么空。写在这里而不是留给下一个人去试第九个量。
 */
export const SCOPE_LIMIT = {
  catches: ["同一串字符重复出现（dup）", "语言不匹配（lang）"],
  misses: ["同一件事换措辞反复推演（语义重复）"],
  tried: 8,
  measured: "6 个会话 17,667 段，八个量全部与正常写作重叠",
  why: "字符级手段抓不到语义同一性。不是门槛问题，是信号选错。",
} as const;

export const RULES: readonly Rule[] = [
  {
id: "dup", kind: "verdict", module: "features/dup.ts",
    prop: "同一行出现次数 ≥ dup.min 时判红",
    形成: "dup.min 在 src/defaults.ts（默认 4）",
    引入: "node --experimental-strip-types --test test/dup.test.ts；期望 16 条全过、rc=0",
    消去: "test/ 里 dup 用例与 ledger 回放算同一件事",
    反例: "四行都是「做。」：min=4 时判红",
  },
  {
id: "lang", kind: "verdict", module: "features/lang.ts",
    prop: "非目标语言的行数 > 目标语言的行数时判红",
    形成: "lang.dir 在 config.ts，围栏与缩进不计",
    引入: "node --experimental-strip-types --test test/guard.test.ts；期望 12 条全过、rc=0",
    消去: "同一块换 dir=zh 与 dir=en，方向应对调",
    反例: "整块英文思考、中文只有一行",
  },
  // 2026-11-24 审查补：judges.ts 产出三个 rule（dup / inline / lang），
  // meta 原来只声明了两个——inline 这条判据存在、有测试、在跑，却没进规则表。
  // 「规则集闭合」不是修辞：产出里有的，声明里必须也有，否则四件永远缺一件。
  {
id: "inline", kind: "verdict", module: ["features/inline.ts", "features/collapse.ts"],
    prop: "一段内不同句占比 < inline.ratio 且句数 ≥ inline.min 时判红",
    形成: "inline.min / inline.ratio 在 src/defaults.ts（默认 12 / 0.25）",
    引入: "node --experimental-strip-types --test test/collapse.test.ts；期望 11 条全过、rc=0",
    消去: "test/ 里句级用例与真实退化回放算同一件事",
    反例: "一段 40 句只有 3 种：占比 7.5% < 25%，判红",
  },
  // 2026-11-24：整体判据。前两条都先切分（按行、按句），这一条不切分。
  {
id: "run", kind: "verdict", module: "features/run.ts",
    prop: "整段里最长的一条重复 >= run.minLen 时判红（默认 12 字）",
    形成: "run.on / run.minLen 在 src/defaults.ts（默认 false / 12）",
    引入: "node --experimental-strip-types --test test/lz77.test.ts；期望 7 条全过、rc=0",
    消去: "bin/longest-run-probe.mjs 的内置样本与 test/lz77.test.ts 算同一件事",
    反例: "31 行「做。」：最长匹配 89 >= 12，判红",
  },
  // 2026-11-24：结构特征六维投票。前三条判据都看不见「形状」——
  // 截图那段每行以「务实：」开头，dup/inline/run 三条一条都不判。
  {
id: "shape", kind: "verdict", module: ["features/prefix.ts", "algo/shape.ts"],
    prop: "行首/行尾/行长/缩进/句首/套话 六个维度里越线 >= 2 个时判红",
    // 2026-11-24：「prefix」不是一个独立判据，它就是这里的行首维度。
    // 配置键名沿用 prefix 是历史原因（这条最初只管行首），规则名统一叫 shape——
    // 一个判据一个名字，否则同一条判据会有两个入口、两份阈值。
    //
    // 同一天实测结论：**这条判据量错了对象，默认关闭。**
    // 6 个会话 17,638 段上它独有捕获 314 段，按行首前缀分组后「务实：」与「关键：」
    // 在五个量上全部重叠——不是门槛没调好，是「行首词集中」这个信号与「是否退化」
    // 之间没有因果关系。它真正抓得到的整行重复由 dup 管（probe-shape-delta --selftest A 样本）。
    // 保留代码是为了让下一个会话看到结论，而不是重新发明它。
    形成: "prefix.on / prefix.min 在 src/defaults.ts（默认 false / 0.5）。键名沿用 prefix，因为它最初只管行首",
    引入: "node --experimental-strip-types --test test/shape.test.ts；期望 8 条全过、rc=0",
    消去: "bin/probe-shape.mjs 的三个退化样本与两个正常样本各得几票，与 test/shape.test.ts 算同一件事",
    反例: "截图那段 18 行全部以「务实：」开头：行首 100% + 句首 95% = 2 票，判红",
  },
  // 2026-11-24：归一化整体判断。前六条各自切分（按行、按句、按 n-gram），
  // 这一条不切分：把整段看成一张图 + 一个转移矩阵 + 一个置换群 + 一组子结构，
  // 四个量天然在 [0,1]，几何平均成一个分，只需要一个门槛。
  {
id: "unified", kind: "verdict", module: ["features/unified.ts", "algo/unified.ts"],
    prop: "群论 1/p、转移熵、最高频句占比、3/4-gram 重复率 四维几何平均 < 0.60 时判红",
    形成: "minScore 默认 0.60，出自实测间隙：退化 <=0.48，正常 >=0.80，中间没有样本",
    引入: "node --experimental-strip-types --test test/unified.test.ts；期望 19 条全过、rc=0。其中 5 条从 judgeThinking 入口进，专门挡「写了没接线」",
    消去: "用加权和替代几何平均，截图那段从 0.48 变成 0.59 越线变绿——两种合成给出不同判决，说明合成方式是真值来源，不是修辞",
    反例: "18 行全以「务实：」开头：前三维奇高，只有 n-gram 重复率 0.80，几何平均 0.48 < 0.60，判红",
  },
  // 2026-11-24：thinkingSignature 清理。用户要的：
  //   「每一个大轮完成，thinkingSignature 清理签名。这个也配置文件化。
  //    可以选近几个大轮，是否启用它。」
  // 它不是判红，是处置（mechanism）：turn_end 时改历史 entry 的内容。
  // keepTurns 数的是**最小轮**——每一条 assistant 消息算一轮，不是一次对话往返。
  // 一次对话里可能有多个 assistant 消息（工具调用中间那些），按对话往返数会少算。
  {
id: "signature-clean", kind: "mechanism", module: ["features/signature.ts", "algo/signature.ts"],
    prop: "turn_end 清掉最近 keepTurns 个 assistant 轮次之外的 thinkingSignature",
    形成: "signature.on / signature.keepTurns 在 src/defaults.ts（默认 true / 30，上限 300）",
    引入: "node --experimental-strip-types --test test/signature.test.ts；期望 11 条全过、rc=0",
    消去: "planSignatureCleanup 是纯函数：直接喂 entries 数组与 keepTurns，不经 ctx、不碰 IO",
    反例: "keepTurns=0 时若 slice 下标写成 -keepTurns（漏了 max 0），会清掉一条本该保留的",
  },
  {
id: "inject-thinking-only", kind: "mechanism", module: "features/inject.ts",
    prop: "只对 type=thinking 的块动手，别的块原样返回",
    形成: "src/features/inject.ts 与 strip.ts 的 c.type 判断",
    引入: "node --experimental-strip-types --test test/inject.test.ts；期望 5 条全过、rc=0",
    消去: "同一份 content 里放一个 text 块与一个 thinking 块，只有后者变",
    反例: "往 text 块注入提示——正文被污染，用户直接看见",
  },
  {
id: "intercept-en-only", kind: "mechanism", module: "features/intercept.ts",
    prop: "拦截只在 dir === \"en\" 时生效",
    形成: "src/features/intercept.ts 的 SAY_LANG",
    引入: "node --experimental-strip-types --test test/deadlock.test.ts；期望 8 条全过、rc=0",
    消去: "同一块内容换 dir=zh 再跑，方向应反过来",
    反例: "不看 dir 就拦：中文思考被当成英文误判",
  },
  {
id: "strip-empty", kind: "mechanism", module: "features/strip.ts",
    prop: "没有可剥的片段时原样返回，不制造空补丁",
    形成: "src/features/strip.ts 的 want.length 短路",
    引入: "node --experimental-strip-types --test test/empty-frame.test.ts；期望 2 条全过、rc=0",
    消去: "wire 层此时不产生 message_end 替换，下游收不到改动",
    反例: "无判定也返回新数组——下游以为改过，日志里多一条空补丁",
  },
  {
id: "binding-anthropic", kind: "mechanism", module: "features/binding.ts",
    prop: "anthropic / bedrock 系 provider 不抓 thinking（它们不暴露）",
    形成: "src/features/binding.ts 的 detectBinding",
    引入: "node --experimental-strip-types --test test/r7.test.ts；期望 6 条全过、rc=0",
    消去: "provider 与 api 两个字段各含 anthropic 时都判 capture=false",
    反例: "对 anthropic 也开抓：永远抓不到，看起来像「模型不思考」",
  },
];

/** 四件齐不齐。空数组 = 每条规则都有居民。 */
export function audit(rules: readonly Rule[] = RULES): string[] {
  const miss: string[] = [];
  for (const r of rules) {
    for (const k of ["形成", "引入", "消去", "反例"] as Piece[]) {
      if (!r[k] || !r[k].trim()) miss.push(r.prop + " 缺「" + k + "」");
    }
    if (!/(rc|test|node\b)/.test(r.引入)) miss.push(r.prop + " 的引入没给命令或退出码");
    if (r.反例.trim().length < 4) miss.push(r.prop + " 的反例太短，不是具体输入");
  }
  return miss;
}
