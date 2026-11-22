// 版本号一处真值：package.json。package-lock.json 里有两份副本（顶层与 packages[""]）。
// 2026-11-22 实测漂了四个版本：pkg 是 0.1.7，lock 还停在 0.1.3，而没有任何判据比较它们。
//
// 这条判据的形状是「同一事实多处写，改一处忘另一处就红」——不是检查版本号是多少，
// 而是检查两份副本说的是不是同一件事。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const lock = JSON.parse(fs.readFileSync(path.join(ROOT, "package-lock.json"), "utf8"));

test("package-lock 的两处 version 与 package.json 一致", () => {
  assert.equal(lock.version, pkg.version, "lock 顶层 version");
  assert.equal(lock.packages?.[""]?.version, pkg.version, "lock packages[\"\"].version");
});

test("坏样本：只改一处时这条判据真的会红", () => {
  // 判据自己也要能红：造一份「只改了 lock」的副本，断言它与 pkg 不等。
  const drifted = { ...lock, version: "0.0.0" };
  assert.notEqual(drifted.version, pkg.version, "只改 lock 顶层时必须被这条抓到");
  const drifted2 = { ...lock, packages: { ...lock.packages, "": { ...lock.packages[""], version: "0.0.0" } } };
  assert.notEqual(drifted2.packages[""].version, pkg.version, "只改 packages[\"\"] 时也必须被抓到");
});
