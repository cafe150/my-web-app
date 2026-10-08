// Step 5 本格辞書結合 & パフォーマンステスト: node test/step5_benchmark.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { searchTags } from "../src/suggest.js";
import { findCommonTags, findSynergies } from "../src/logic.js";
import { buildGraphData } from "../src/graph.js";

const dictionary = JSON.parse(readFileSync(new URL("../data/tags.json", import.meta.url), "utf8"));

console.log(`=== Step 5 本格タグ辞書結合テスト（総データ数: ${dictionary.length}件） ===\n`);

// 1. パフォーマンステスト（50ms以内要件の確認）
const testQueries = ["しっと", "こうどう", "まいぺ", "かんぺき", "りょこう", "かふぇ", "さうな", "よる", "あさ", "い"];
const iterations = 500;

const start = performance.now();
for (let i = 0; i < iterations; i++) {
  const q = testQueries[i % testQueries.length];
  searchTags(q, dictionary, ["慎重派"], 8);
}
const elapsed = performance.now() - start;
const avgPerSearch = elapsed / iterations;

console.log(`[パフォーマンス検証]`);
console.log(`  - 試行回数: ${iterations}回`);
console.log(`  - 合計所要時間: ${elapsed.toFixed(2)} ms`);
console.log(`  - 1検索あたりの平均所要時間: ${avgPerSearch.toFixed(3)} ms (要件: 50ms以内)`);
assert.ok(avgPerSearch < 5, "1検索あたり5ms未満で超高速に応答すること");
console.log("  => [PASS] パフォーマンス要件（50ms以内）を大幅にクリア！サクサク検索可能です。\n");

// 2. 多様なワードのサジェスト抽出検証
console.log(`[サジェスト抽出検証]`);
const checkWords = [
  { q: "しんちょう", expected: "慎重派" },
  { q: "こうどう", expected: "行動派" },
  { q: "まいぺ", expected: "マイペース" },
  { q: "かんぺき", expected: "完璧主義" },
  { q: "らっかん", expected: "楽観的" },
];

for (const { q, expected } of checkWords) {
  const res = searchTags(q, dictionary, [], 8);
  assert.ok(res.length > 0, `クエリ「${q}」で候補が返ること`);
  assert.equal(res[0].item.name, expected, `クエリ「${q}」の先頭候補が「${expected}」であること`);
  console.log(`  - "${q}" -> ${res[0].item.name} (${res.length}件ヒット)`);
}
console.log("  => [PASS] 多様なワードのインクリメンタルサジェストが正常に動作。\n");

// 3. 最大件数リミット検証
const resLimit = searchTags("派", dictionary, [], 8);
assert.ok(resLimit.length <= 8, "最大件数8件を超えないこと");
console.log(`[リミット検証] "派" でのヒット件数: ${resLimit.length}件 (最大8件制限内) => [PASS]\n`);

// 4. 未知の自由入力タグの例外処理 & グラフ生成検証
console.log(`[自由入力タグ（辞書外未知ワード）の処理検証]`);
const customUserTags = ["宇宙開発", "自作キーボード", "行動派"];
const customTargetTags = ["宇宙開発", "慎重派", "量子コンピュータ"];

const common = findCommonTags(customUserTags, customTargetTags);
const synergies = findSynergies(customUserTags, customTargetTags, dictionary);

console.log("  - 共通タグ:", common);
console.log("  - シナジー:", synergies);

assert.deepEqual(common, ["宇宙開発"]);
assert.deepEqual(synergies, [{ user: "行動派", target: "慎重派" }]);

// グラフデータ構築が例外なく行えるか
const dummyState = {
  user: { name: "宇宙飛行士", tags: customUserTags },
  target: { name: "エンジニア", tags: customTargetTags },
};
const graphData = buildGraphData(dummyState, common, synergies);
assert.ok(graphData.nodes.length > 0);
assert.ok(graphData.edges.length > 0);
console.log(`  - グラフノード数: ${graphData.nodes.length}, エッジ数: ${graphData.edges.length}`);
console.log("  => [PASS] 未知のタグでも共通点・シナジー判定およびグラフデータ生成が正常に完結。\n");

console.log("=== Step 5 の全検証項目をクリアしました！ ===");
