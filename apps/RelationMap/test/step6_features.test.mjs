// Step 6 付加機能・完了基準の検証: node test/step6_features.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calcSyncScore } from "../src/logic.js";
import { getCommonTagHint, getSynergyHint, getDefaultHint } from "../src/hints.js";

const dictionary = JSON.parse(readFileSync(new URL("../data/tags.json", import.meta.url), "utf8"));

console.log("=== Step 6 付加機能・演出の総合検証 ===\n");

// 1. シンクロ率スコア計算の検証
console.log("[1. シンクロ率（%）算出ロジックの検証]");
// パターンA: 共通1組、シナジー1組、総タグ3個 -> (1*2 + 1) / 3 * 100 = 100%
const scoreA = calcSyncScore(1, 1, 3);
assert.equal(scoreA, 100);
console.log(`  - 共通1組, シナジー1組, 総タグ3個 => ${scoreA}% (期待値: 100%) [PASS]`);

// パターンB: 共通1組、シナジー0組、総タグ3個 -> (1*2 + 0) / 3 * 100 = 67%
const scoreB = calcSyncScore(1, 0, 3);
assert.equal(scoreB, 67);
console.log(`  - 共通1組, シナジー0組, 総タグ3個 => ${scoreB}% (期待値: 67%) [PASS]`);

// パターンC: タグ0件の場合
const scoreC = calcSyncScore(0, 0, 0);
assert.equal(scoreC, 0);
console.log(`  - タグ0件 => ${scoreC}% (期待値: 0%) [PASS]\n`);

// 2. 対話ヒントの検証（完了基準：共通点を押すと「話してみよう」等の問いかけが表示されること）
console.log("[2. 対話ヒントの生成検証]");
const hintNight = getCommonTagHint("夜型", dictionary);
console.log(`  - 共通点「夜型」のヒント:`);
console.log(`    タイトル: ${hintNight.title}`);
console.log(`    本文: ${hintNight.body}`);
assert.ok(hintNight.body.includes("話してみ") || hintNight.body.includes("聞いてみ"), "対話の問いかけ文が含まれること");
console.log("    => [PASS] 完了基準: 共通点の対話ヒントが正しく生成される\n");

const hintSynergy = getSynergyHint("嫉妬深い", "一途");
console.log(`  - 相補ペア「嫉妬深い ↔ 一途」のヒント:`);
console.log(`    タイトル: ${hintSynergy.title}`);
console.log(`    本文: ${hintSynergy.body}`);
assert.ok(hintSynergy.body.includes("安心") || hintSynergy.body.includes("誠実"), "相補の価値を伝える文が含まれること");
console.log("    => [PASS] シナジーの対話ヒントが正しく生成される\n");

// 3. デフォルトサマリーヒント
const defHint = getDefaultHint(["夜型"], [{ user: "嫉妬深い", target: "一途" }], 100);
console.log(`  - 全体サマリーヒント: ${defHint.body}`);
assert.ok(defHint.body.includes("100%"));
console.log("    => [PASS] シンクロ率を含む全体サマリーが正しく生成される\n");

console.log("=== Step 6 全テスト項目をクリアしました！ ===");
