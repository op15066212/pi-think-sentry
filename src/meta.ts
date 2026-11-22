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
  readonly prop: string;
  readonly 形成: string;
  readonly 引入: string;
  readonly 消去: string;
  readonly 反例: string;
}

export const RULES: readonly Rule[] = [
  {
    prop: "同一行出现次数 ≥ dup.min 时判红",
    形成: "dup.min 在 src/defaults.ts（默认 4）",
    引入: "judges.ts 的 dup 判据；npm test 期望 rc=0",
    消去: "test/ 里 dup 用例与 ledger 回放算同一件事",
    反例: "四行都是「做。」：min=4 时判红",
  },
  {
    prop: "非目标语言的行数 > 目标语言的行数时判红",
    形成: "lang.dir 在 config.ts，围栏与缩进不计",
    引入: "judges.ts 的 lang 判据；npm test 期望 rc=0",
    消去: "同一块换 dir=zh 与 dir=en，方向应对调",
    反例: "整块英文思考、中文只有一行",
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
