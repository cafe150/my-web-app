// Step 6 ストレージ保存・復元・リセットの単体テスト: node test/storage.test.mjs
import assert from "node:assert/strict";

// Node環境用のlocalStorageモック
const mockStore = new Map();
global.localStorage = {
  getItem: (k) => mockStore.get(k) ?? null,
  setItem: (k, v) => mockStore.set(k, String(v)),
  removeItem: (k) => mockStore.delete(k),
  clear: () => mockStore.clear(),
};

import { loadState, saveState, clearState, initialState } from "../src/storage.js";

console.log("=== localStorage 保存・復元・リセット検証 ===\n");

// 1. 初期状態の読み込み
const s1 = loadState();
assert.deepEqual(s1, initialState(), "初期状態が正しく返ること");
console.log("  [PASS] 初回ロード時の初期状態復元");

// 2. 保存と復元
s1.user.name = "たろう";
s1.user.tags = ["夜型", "嫉妬深い"];
s1.target.name = "はなこ";
s1.target.tags = ["夜型", "一途"];
saveState(s1);

assert.ok(s1.updatedAt, "updatedAt が付与されていること");

const s2 = loadState();
assert.equal(s2.user.name, "たろう");
assert.deepEqual(s2.user.tags, ["夜型", "嫉妬深い"]);
assert.equal(s2.target.name, "はなこ");
assert.deepEqual(s2.target.tags, ["夜型", "一途"]);
console.log("  [PASS] データの保存および再読み込み復元（リロード耐性）");

// 3. リセット（消去）
clearState();
const s3 = loadState();
assert.deepEqual(s3.user.tags, [], "消去後にタグが空になっていること");
console.log("  [PASS] clearStateによるデータ全消去・初期化");

console.log("\n=== 全ストレージ検証 PASS! ===");
