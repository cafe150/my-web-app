// Step 1: 判定ロジックの核（純粋関数・UI非依存）

/** 共通タグ（積集合）を返す。重複は除去し、自分側の並び順を維持 */
export function findCommonTags(userTags, targetTags) {
  const targetSet = new Set(targetTags);
  return [...new Set(userTags)].filter((tag) => targetSet.has(tag));
}

/**
 * シナジー（相補関係）の組み合わせを返す。
 * 共通タグを除いた固有タグ同士を走査し、辞書 `pairs` にどちらかの方向で
 * 相手のタグ名が含まれていれば相補関係とみなす。
 * @returns {Array<{user: string, target: string}>}
 */
export function findSynergies(userTags, targetTags, dictionary) {
  const common = new Set(findCommonTags(userTags, targetTags));
  const userUnique = [...new Set(userTags)].filter((t) => !common.has(t));
  const targetUnique = [...new Set(targetTags)].filter((t) => !common.has(t));

  const pairsByName = new Map(dictionary.map((d) => [d.name, d.pairs ?? []]));
  const isPair = (a, b) => (pairsByName.get(a) ?? []).includes(b);

  const result = [];
  for (const u of userUnique) {
    for (const t of targetUnique) {
      if (isPair(u, t) || isPair(t, u)) result.push({ user: u, target: t });
    }
  }
  return result;
}

/**
 * 一致度(%) = (共通タグ数 * 2 + シナジー組数) / 総登録ユニークタグ数 * 100
 * @param {number} commonCount 共通タグの個数
 * @param {number} synergyCount 成立している相補ペア数
 * @param {number} totalUniqueTags ふたりが持つユニークなタグの総数（和集合の要素数）
 * @returns {number} 0〜100の整数パーセンテージ
 */
export function calcSyncScore(commonCount, synergyCount, totalUniqueTags) {
  if (!totalUniqueTags || totalUniqueTags <= 0) return 0;
  const rawScore = ((commonCount * 2 + synergyCount) / totalUniqueTags) * 100;
  return Math.min(100, Math.max(0, Math.round(rawScore)));
}
