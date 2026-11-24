import test from "node:test";
import assert from "node:assert/strict";
import { META, RULES, audit } from "../src/meta.ts";

test("元理论是依赖类型理论", () => {
  assert.equal(META, "依赖类型理论");
});

// meta.ts 的注释写着「这条规则约束的文件（相对 src/），判据会验它存在」。
// 2026-11-24 审查发现这句是假的：没有这条判据——module 指向不存在的文件也会绿。
// 「形成」格写的是盘上可查的东西，那么它查的东西本身也得被查一次。
test("每个 module 字段指向的文件都存在", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { RULES } = await import("../src/meta.ts");
  const root = path.join(import.meta.dirname, "..", "src");
  const miss = [];
  for (const r of RULES) {
    if (!r.module) continue;
    if (!fs.existsSync(path.join(root, r.module))) miss.push(r.id + " → " + r.module);
  }
  assert.equal(miss.length, 0, "module 指向不存在的文件：" + miss.join("、"));
});

// 规则集闭合：judges.ts 产出的每个 rule 都必须在这张表里有一条。
// 2026-11-24 审查时这条是空的——inline 判据跑了很久，表里根本没有它，
// 「四件齐」于是齐在两条规则上，第三条一条都没有。
// 判法从代码取，不从注释取：注释说有几个就是几个，那是许愿。
test("judges.ts 产出的每个 rule 都在 RULES 里有条目", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { RULES } = await import("../src/meta.ts");
  const src = fs.readFileSync(path.join(import.meta.dirname, "..", "src", "judges.ts"), "utf8");
  const produced = new Set([...src.matchAll(/rule: "([a-z]+)"/g)].map((m) => m[1]));
  const declared = new Set(RULES.filter((r) => r.kind === "verdict").map((r) => r.id));
  const miss = [...produced].filter((r) => !declared.has(r));
  assert.deepEqual(miss, [], "判据产出但没声明：" + miss.join("、"));
  const extra = [...declared].filter((r) => !produced.has(r!));
  assert.deepEqual(extra, [], "声明了但没有判据产出：" + extra.join("、"));
});

test("每条规则四件齐", () => {
  assert.deepEqual(audit(), []);
});

test("缺一件就红", () => {
  const broken = [{ ...RULES[0], 反例: "" }];
  assert.ok(audit(broken).length > 0);
});

test("引入没给命令就红", () => {
  const broken = [{ ...RULES[0], 引入: "已经测过了" }];
  assert.ok(audit(broken).some((m) => m.includes("命令")));
});

// id 唯一：重复的 id 会让「覆盖」这类按 id 对拍的判据静默算错——
// 两条规则共用一个 id，缺一条也看不出来。
test("规则 id 唯一且非空", async () => {
  const { RULES } = await import("../src/meta.ts");
  const ids = RULES.map((r: any) => r.id).filter(Boolean);
  assert.ok(ids.length === RULES.length, "每条规则都该有 id，实际有 " + ids.length + " / " + RULES.length);
  assert.equal(new Set(ids).size, ids.length, "id 有重复：" + ids.join("、"));
});

// 证明项必须精确到这一条（P20 的 2026-11-24 补）：跑全量测试，红了只知道「有一处红」。
// 所以「引入」格必须是单文件命令，不许是 npm test。
test("每条规则的引入是单文件精确命令，不是批次命令", async () => {
  const { RULES } = await import("../src/meta.ts");
  for (const r of RULES) {
    const s = String(r.引入 || "");
    assert.ok(
      /--test test\/[\w-]+\.test\.ts/.test(s),
      (r.id || "(无 id)") + " 的引入不是单文件命令：" + s,
    );
    assert.ok(!/npm test/.test(s), (r.id || "(无 id)") + " 用了批次命令 npm test：" + s);
  }
});
