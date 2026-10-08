// Step 4: インクリメンタル・サジェスト検索ロジック

/**
 * 入力文字列を小文字・平仮名・半角英数に正規化
 * - カタカナ → 平仮名変換
 * - 全角英数 → 半角英数変換
 * - 大文字 → 小文字変換
 */
export function normalize(text) {
  if (!text) return "";
  return text
    .trim()
    .toLowerCase()
    // 全角英数字 → 半角
    .replace(/[！-～]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0))
    // カタカナ → ひらがな
    .replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/**
 * 辞書から入力クエリに合致するタグ候補を探索
 * @param {string} rawQuery 入力文字列
 * @param {Array<object>} dictionary タグ辞書マスタ
 * @param {Array<string>} existingTags 対象者がすでに追加済みのタグ配列
 * @param {number} limit 最大候補数（デフォルト: 8件）
 * @returns {Array<{ tag: object, matchedKeyword?: string, score: number }>}
 */
export function searchTags(rawQuery, dictionary = [], existingTags = [], limit = 8) {
  const query = normalize(rawQuery);
  if (!query) return [];

  const existingSet = new Set(existingTags);
  const results = [];

  for (const item of dictionary) {
    // 既に追加済みのタグは候補から除外
    if (existingSet.has(item.name)) continue;

    const normName = normalize(item.name);
    const normKeywords = (item.keywords || []).map((k) => normalize(k));

    let score = -1;
    let matchedKeyword = null;

    // 1. タグ名（name）の一致判定
    if (normName === query) {
      score = 100; // 完全一致
    } else if (normName.startsWith(query)) {
      score = 80; // 前方一致
    } else if (normName.includes(query)) {
      score = 60; // 部分一致
    }

    // 2. キーワード（keywords）の一致判定
    for (let i = 0; i < normKeywords.length; i++) {
      const kw = normKeywords[i];
      if (kw === query) {
        if (score < 90) {
          score = 90;
          matchedKeyword = item.keywords[i];
        }
        break;
      } else if (kw.startsWith(query)) {
        if (score < 70) {
          score = 70;
          matchedKeyword = item.keywords[i];
        }
      } else if (kw.includes(query)) {
        if (score < 50) {
          score = 50;
          matchedKeyword = item.keywords[i];
        }
      }
    }

    if (score > 0) {
      results.push({
        item,
        score,
        matchedKeyword,
      });
    }
  }

  // スコア降順にソートして上限件数を抽出
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}
