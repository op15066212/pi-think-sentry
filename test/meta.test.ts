import test from "node:test";
import assert from "node:assert/strict";
import { META, RULES, audit } from "../src/meta.ts";

test("元理论是依赖类型理论", () => {
  assert.equal(META, "依赖类型理论");
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
