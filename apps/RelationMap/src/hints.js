// Step 6: 理解度促進・対話アシスト（対話ヒント生成モジュール）

/**
 * 共通タグ選択時の対話ヒント
 */
export function getCommonTagHint(tag, dictionary = []) {
  const dictItem = dictionary.find((d) => d.name === tag);
  const category = dictItem?.category;

  // カテゴリ別の対話の切り口テンプレート
  if (category === "lifestyle") {
    return {
      sign: "共鳴",
      title: `「${tag}」のライフスタイル`,
      body: `「${tag}」がふたりの共通点です。普段の生活リズムや休日の過ごし方、心地よいペースについて共感し合いながら話してみましょう。`,
    };
  }
  if (category === "values_social" || category === "values_work") {
    return {
      sign: "共感",
      title: `大切にしている価値観「${tag}」`,
      body: `ふたりとも「${tag}」という価値観を持っています。どんなきっかけでそう考えるようになったのか、お互いの人生観や大切にしている想いを聞いてみましょう。`,
    };
  }
  if (category === "hobby") {
    return {
      sign: "趣味",
      title: `共通の楽しみ「${tag}」`,
      body: `「${tag}」がふたりの共通の関心事です！最近おすすめのスポットやお気に入りの過ごし方について情報交換してみると会話が弾みそうです。`,
    };
  }
  if (category === "communication" || category === "romance") {
    return {
      sign: "心通",
      title: `人との関わり方「${tag}」`,
      body: `人と接する上で、ふたりとも「${tag}」な一面を共有しています。お互いが安心できる接し方や、心地よい距離感について確かめ合ってみましょう。`,
    };
  }

  // デフォルト
  return {
    sign: "共通",
    title: `ふたりをつなぐ「${tag}」`,
    body: `「${tag}」がふたりの共通点です。普段どんな場面でそれを感じるか、互いの具体的なエピソードについて話してみましょう。`,
  };
}

/**
 * シナジー（相補ペア）選択時の対話ヒント
 */
export function getSynergyHint(userTag, targetTag) {
  const specialHints = {
    "一途↔嫉妬深い": "一途な誠実さが、相手の不安をやさしく包み込む安心の関係性です。日頃の感謝や素直な気持ちを言葉にして伝えてみましょう。",
    "嫉妬深い↔一途": "一途な誠実さが、相手の不安をやさしく包み込む安心の関係性です。日頃の感謝や素直な気持ちを言葉にして伝えてみましょう。",
    "行動派↔慎重派": "フットワークの軽さと慎重な計画性が絶妙に補い合っています。何かを計画する際、両方の視点を出し合うと最高の選択ができます。",
    "慎重派↔行動派": "フットワークの軽さと慎重な計画性が絶妙に補い合っています。何かを計画する際、両方の視点を出し合うと最高の選択ができます。",
    "協調性が高い↔マイペース": "自分軸を持つ心地よさと、周りを気遣う優しさが調和しています。互いのペースを尊重しながら、無理のない過ごし方を話してみましょう。",
    "マイペース↔協調性が高い": "自分軸を持つ心地よさと、周りを気遣う優しさが調和しています。互いのペースを尊重しながら、無理のない過ごし方を話してみましょう。",
    "聞き上手↔話すのが好き": "話したい気持ちと聴きたい姿勢が自然に噛み合う最高のパートナーシップです。最近あった楽しかった話をじっくり語り合ってみましょう。",
    "話すのが好き↔聞き上手": "話したい気持ちと聴きたい姿勢が自然に噛み合う最高のパートナーシップです。最近あった楽しかった話をじっくり語り合ってみましょう。",
    "完璧主義↔楽観的": "細部まで妥協しないこだわりと、「なんとかなる」という柔軟性が互いを救い合います。肩の力を抜いて助け合えるポイントを探してみましょう。",
    "楽観的↔完璧主義": "細部まで妥協しないこだわりと、「なんとかなる」という柔軟性が互いを救い合います。肩の力を抜いて助け合えるポイントを探してみましょう。",
    "直感重視↔論理的": "豊かなひらめきと筋道立てた分析が揃った強力なタッグです。お互いの考え方に「なるほど」と耳を傾けてみましょう。",
    "論理的↔直感重視": "豊かなひらめきと筋道立てた分析が揃った強力なタッグです。お互いの考え方に「なるほど」と耳を傾けてみましょう。",
  };

  const key1 = `${userTag}↔${targetTag}`;
  const key2 = `${targetTag}↔${userTag}`;
  const body =
    specialHints[key1] ||
    specialHints[key2] ||
    `「${userTag}」と「${targetTag}」は、互いの個性が引き立て合う相補関係（シナジー）です。違いを面白がりながら、お互いに助け合える場面について語り合ってみましょう。`;

  return {
    sign: "相補",
    title: `引き立て合う個性「${userTag}」×「${targetTag}」`,
    body,
  };
}

/**
 * 人物ノード選択時の対話ヒント
 */
export function getPersonHint(personName, tags, isUser = false) {
  if (tags.length === 0) {
    return {
      sign: "人物",
      title: `${personName}さんのプロフィール`,
      body: `まだタグが登録されていません。関心のあることや性格・習慣を上の入力欄から追加してみましょう。`,
    };
  }
  return {
    sign: "人物",
    title: `${personName}さんのタグ一覧（${tags.length}件）`,
    body: `登録タグ：【${tags.join("、 ")}】。この中から気になるタグをクリックすると、より詳しい対話のヒントが表示されます。`,
  };
}

/**
 * 初期状態・全体サマリーヒント
 */
export function getDefaultHint(commonTags = [], synergies = [], syncScore = 0) {
  if (commonTags.length === 0 && synergies.length === 0) {
    return {
      sign: "心得",
      title: "ふたりを結ぶ対話のヒント",
      body: "グラフ上の「共通点（金）」や「相補関係（緑の点線）」をクリックすると、ふたりの会話を深める切り口が表示されます。",
    };
  }

  let summaryText = `現在、共通点が ${commonTags.length} 件、相補関係が ${synergies.length} 組見つかっています（シンクロ率 ${syncScore}%）。`;
  if (commonTags.length > 0) {
    summaryText += ` まずは共通点「${commonTags[0]}」を切り口に、日常の過ごし方について話してみましょう。`;
  } else if (synergies.length > 0) {
    summaryText += ` お互いの違いが活きる「${synergies[0].user}」と「${synergies[0].target}」の関係性に注目してみましょう。`;
  }

  return {
    sign: "心得",
    title: `ふたりの結びつき（シンクロ率 ${syncScore}%）`,
    body: summaryText,
  };
}
