// Step 4 総合検証テスト: node test/suggest_full.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalize, searchTags } from "../src/suggest.js";

const dictionary = JSON.parse(readFileSync(new URL("../data/tags.json", import.meta.url), "utf8"));

console.log("=== Step 4 インクリメンタル・サジェスト検証 ===");

// 1. 基本一致判定
const q1 = "しっと";
const res1 = searchTags(q1, dictionary, []);
console.log(`クエリ: "${q1}" -> 候補件数: ${res1.length}`);
assert.ok(res1.length > 0, "候補が見つかること");
assert.equal(res1[0].item.name, "嫉妬深い", "第一候補が「嫉妬深い」であること");
assert.equal(res1[0].matchedKeyword, "しっと", "マッチしたキーワードが「しっと」であること");
console.log("  [PASS] 完了基準: 「しっと」と打つと「嫉妬深い」が先頭に現れる");

// 2. カタカナ・平仮名の表記揺れ
const q2 = "シット";
const res2 = searchTags(q2, dictionary, []);
assert.equal(res2[0].item.name, "嫉妬深い");
console.log("  [PASS] カタカナ「シット」でも正規化されてヒットする");

// 3. 部分一致
const q3 = "きき";
const res3 = searchTags(q3, dictionary, []);
assert.equal(res3[0].item.name, "聞き上手");
console.log("  [PASS] 平仮名「きき」で「聞き上手（ききじょうず）」がヒットする");

// 4. 重複タグ除外
const res4 = searchTags("しっと", dictionary, ["嫉妬深い"]);
assert.equal(res4.length, 0, "すでに登録済みの場合は候補から除外される");
console.log("  [PASS] 登録済みタグの除外処理が機能している");

// 5. 複数件マッチとスコアリング（夜型・朝型など）
const q5 = "型";
const res5 = searchTags(q5, dictionary, []);
assert.ok(res5.length >= 2, "「型」で2件以上ヒットする");
const names = res5.map(r => r.item.name);
assert.ok(names.includes("夜型") && names.includes("朝型"));
console.log(`  [PASS] 「型」で「夜型」「朝型」が正しく抽出される: ${names.join(", ")}`);

// 6. 最大表示件数リミット（8件）
const q6 = "い";
const res6 = searchTags(q6, dictionary, [], 5);
assert.ok(res6.length <= 5, "上限指定(5件)が機能している");
console.log(`  [PASS] 上限件数の制御が機能している (${res6.length}件抽出)`);

console.log("\n全 6 項目 PASS: Step 4 サジェスト機能の要件および完了基準を満たしています！");
