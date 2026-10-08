// Step 1 完了基準の検証: node test/logic.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findCommonTags, findSynergies } from "../src/logic.js";

const dictionary = JSON.parse(readFileSync(new URL("../data/tags.json", import.meta.url), "utf8"));

const user = ["夜型", "嫉妬深い"];
const target = ["夜型", "一途"];

const common = findCommonTags(user, target);
const synergies = findSynergies(user, target, dictionary);
console.log({ common, synergies });

assert.deepEqual(common, ["夜型"]);
assert.deepEqual(synergies, [{ user: "嫉妬深い", target: "一途" }]);

// 逆方向（相手側のpairsにのみ定義）や共通なしのケース
assert.deepEqual(findSynergies(["一途"], ["嫉妬深い"], dictionary), [{ user: "一途", target: "嫉妬深い" }]);
assert.deepEqual(findCommonTags(["a"], ["b"]), []);
assert.deepEqual(findSynergies([], [], dictionary), []);

console.log("OK: Step 1 の完了基準を満たしています");
