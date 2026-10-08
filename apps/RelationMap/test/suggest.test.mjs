// Step 4 単体テスト: node test/suggest.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalize, searchTags } from "../src/suggest.js";

const dictionary = JSON.parse(readFileSync(new URL("../data/tags.json", import.meta.url), "utf8"));

// 1. 正規化のテスト
assert.equal(normalize("　シット　"), "しっと");
assert.equal(normalize("ABC"), "abc");

// 2. 完了基準: 「しっと」と打った段階で「嫉妬深い」が返ること
const res1 = searchTags("しっと", dictionary, []);
assert.ok(res1.length > 0, "候補が存在すること");
assert.equal(res1[0].item.name, "嫉妬深い", "先頭候補が「嫉妬深い」であること");

// 3. カタカナ「シット」でもヒットすること
const res2 = searchTags("シット", dictionary, []);
assert.equal(res2[0].item.name, "嫉妬深い");

// 4. 重複タグ除外: すでに対象カラムに追加済みのタグは除外されること
const res3 = searchTags("しっと", dictionary, ["嫉妬深い"]);
assert.equal(res3.some(r => r.item.name === "嫉妬深い"), false, "既存タグ「嫉妬深い」は候補から除外されること");

// 5. 部分一致のテスト: 「型」で「夜型」「朝型」が返ること
const res4 = searchTags("型", dictionary, []);
const names = res4.map(r => r.item.name);
assert.ok(names.includes("夜型"));
assert.ok(names.includes("朝型"));

// 6. 空文字・空白のみは空配列
assert.deepEqual(searchTags("", dictionary, []), []);
assert.deepEqual(searchTags("   ", dictionary, []), []);

console.log("OK: Step 4 サジェストロジックのテストをすべて通過しました！");
