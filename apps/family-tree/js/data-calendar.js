/**
 * 家系図作成Webアプリケーション
 * 4.1 出身地選択（地方別都道府県データ・旧国名サジェスト辞書）
 * 4.2 和暦・西暦双方向変換エンジン（改元年月日厳密判定・満年齢・享年・数え年算出）
 */

window.KakeizuData = (function () {
  // ---------------------------------------------------------------------------
  // 4.1 地方別分類・収録都道府県（仕様書4.1準拠）
  // ---------------------------------------------------------------------------
  const REGIONS = [
    {
      id: 'hokkaido_tohoku',
      label: '北海道・東北',
      prefs: ['北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県']
    },
    {
      id: 'kanto',
      label: '関東',
      prefs: ['東京都', '神奈川県', '埼玉県', '千葉県', '茨城県', '栃木県', '群馬県']
    },
    {
      id: 'chubu',
      label: '中部',
      prefs: ['愛知県', '静岡県', '岐阜県', '三重県', '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県']
    },
    {
      id: 'kinki',
      label: '近畿',
      prefs: ['大阪府', '京都府', '兵庫県', '奈良県', '滋賀県', '和歌山県']
    },
    {
      id: 'chugoku_shikoku',
      label: '中国・四国',
      prefs: ['鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県']
    },
    {
      id: 'kyushu_okinawa',
      label: '九州・沖縄',
      prefs: ['福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県']
    },
    {
      id: 'others',
      label: 'その他',
      prefs: ['海外', '不明・不詳']
    }
  ];

  // 旧国名（令制国）サジェスト検索辞書
  const KUNI_DICTIONARY = [
    { kuni: '蝦夷・渡島・石狩・十勝・釧路・根室・北見・日高・胆振・後志・天塩', reading: 'えぞ・おしま・いしかり', prefs: ['北海道'] },
    { kuni: '陸奥（津軽・南部）', reading: 'むつ・みちのく・つがる', prefs: ['青森県', '岩手県', '宮城県', '福島県'] },
    { kuni: '陸中・陸前・磐城・岩代', reading: 'りくちゅう・りくぜん・いわき・いわしろ', prefs: ['岩手県', '宮城県', '福島県'] },
    { kuni: '出羽・羽後・羽前', reading: 'でわ・うご・うぜん', prefs: ['秋田県', '山形県'] },
    { kuni: '武蔵', reading: 'むさし', prefs: ['東京都', '埼玉県', '神奈川県'] },
    { kuni: '相模', reading: 'さがみ', prefs: ['神奈川県'] },
    { kuni: '安房・上総・下総', reading: 'あわ・かずさ・しもうさ', prefs: ['千葉県', '茨城県'] },
    { kuni: '常陸', reading: 'ひたち', prefs: ['茨城県'] },
    { kuni: '下野', reading: 'しもつけ', prefs: ['栃木県'] },
    { kuni: '上野', reading: 'こうずけ', prefs: ['群馬県'] },
    { kuni: '尾張・三河', reading: 'おわり・みかわ', prefs: ['愛知県'] },
    { kuni: '駿河・遠江・伊豆', reading: 'するが・とおとうみ・いず', prefs: ['静岡県', '東京都'] },
    { kuni: '美濃・飛騨', reading: 'みの・ひだ', prefs: ['岐阜県'] },
    { kuni: '伊勢・伊賀・志摩・紀伊', reading: 'いせ・いが・しま・きい', prefs: ['三重県', '和歌山県'] },
    { kuni: '越後・佐渡', reading: 'えちご・さど', prefs: ['新潟県'] },
    { kuni: '越中', reading: 'えっちゅう', prefs: ['富山県'] },
    { kuni: '加賀・能登', reading: 'かが・のと', prefs: ['石川県'] },
    { kuni: '越前・若狭', reading: 'えちぜん・わかさ', prefs: ['福井県'] },
    { kuni: '甲斐', reading: 'かい', prefs: ['山梨県'] },
    { kuni: '信濃', reading: 'しなの', prefs: ['長野県'] },
    { kuni: '山城・丹波・丹後', reading: 'やましろ・たんば・たんご', prefs: ['京都府', '兵庫県'] },
    { kuni: '摂津・河内・和泉', reading: 'せっつ・かわち・いずみ', prefs: ['大阪府', '兵庫県'] },
    { kuni: '播磨・但馬・淡路', reading: 'はりま・たじま・あわじ', prefs: ['兵庫県'] },
    { kuni: '大和', reading: 'やまと', prefs: ['奈良県'] },
    { kuni: '近江', reading: 'おうみ', prefs: ['滋賀県'] },
    { kuni: '因幡・伯耆', reading: 'いなば・ほうき', prefs: ['鳥取県'] },
    { kuni: '出雲・石見・隠岐', reading: 'いずも・いわみ・おき', prefs: ['島根県'] },
    { kuni: '備前・備中・美作', reading: 'びぜん・びっちゅう・みまさか', prefs: ['岡山県'] },
    { kuni: '安芸・備後', reading: 'あき・びんご', prefs: ['広島県'] },
    { kuni: '長門・周防', reading: 'ながと・すおう', prefs: ['山口県'] },
    { kuni: '阿波', reading: 'あわ', prefs: ['徳島県'] },
    { kuni: '讃岐', reading: 'さぬき', prefs: ['香川県'] },
    { kuni: '伊予', reading: 'いよ', prefs: ['愛媛県'] },
    { kuni: '土佐', reading: 'とさ', prefs: ['高知県'] },
    { kuni: '筑前・筑後・豊前', reading: 'ちくぜん・ちくご・ぶぜん', prefs: ['福岡県', '大分県'] },
    { kuni: '肥前・壱岐・対馬', reading: 'ひぜん・いき・つしま', prefs: ['佐賀県', '長崎県'] },
    { kuni: '肥後', reading: 'ひご', prefs: ['熊本県'] },
    { kuni: '豊後', reading: 'ぶんご', prefs: ['大分県'] },
    { kuni: '日向', reading: 'ひゅうが', prefs: ['宮崎県'] },
    { kuni: '薩摩・大隅', reading: 'さつま・おおすみ', prefs: ['鹿児島県'] },
    { kuni: '琉球', reading: 'りゅうきゅう', prefs: ['沖縄県'] }
  ];

  function searchByKuniOrPref(query) {
    const q = (query || '').trim();
    if (!q) return [];
    const results = [];
    for (const item of KUNI_DICTIONARY) {
      if (
        item.kuni.includes(q) ||
        item.reading.includes(q) ||
        item.prefs.some(p => p.includes(q))
      ) {
        for (const pref of item.prefs) {
          results.push({
            kuniLabel: item.kuni.split('・')[0],
            fullKuni: item.kuni,
            pref: pref
          });
        }
      }
    }
    // 重複排除
    const seen = new Set();
    return results.filter(r => {
      const key = r.pref + ':' + r.fullKuni;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function findRegionByPref(pref) {
    for (const reg of REGIONS) {
      if (reg.prefs.includes(pref)) return reg.id;
    }
    return 'kanto';
  }

  // ---------------------------------------------------------------------------
  // 4.2 和暦・西暦の相互変換および改元年判定ロジック（江戸後期〜令和対応）
  // ---------------------------------------------------------------------------
  // 改元年境界（月日単位で厳密判定）
  const ERAS = [
    { id: 'reiwa',  name: '令和', startYear: 2019, startMonth: 5,  startDay: 1,  endYear: 9999, endMonth: 12, endDay: 31 },
    { id: 'heisei', name: '平成', startYear: 1989, startMonth: 1,  startDay: 8,  endYear: 2019, endMonth: 4,  endDay: 30 },
    { id: 'showa',  name: '昭和', startYear: 1926, startMonth: 12, startDay: 25, endYear: 1989, endMonth: 1,  endDay: 7 },
    { id: 'taisho', name: '大正', startYear: 1912, startMonth: 7,  startDay: 30, endYear: 1926, endMonth: 12, endDay: 24 },
    { id: 'meiji',  name: '明治', startYear: 1868, startMonth: 9,  startDay: 8,  endYear: 1912, endMonth: 7,  endDay: 29 },
    { id: 'keio',   name: '慶応', startYear: 1865, startMonth: 5,  startDay: 1,  endYear: 1868, endMonth: 9,  endDay: 7 },
    { id: 'genji',  name: '元治', startYear: 1864, startMonth: 3,  startDay: 27, endYear: 1865, endMonth: 4,  endDay: 30 },
    { id: 'bunkyu', name: '文久', startYear: 1861, startMonth: 3,  startDay: 29, endYear: 1864, endMonth: 3,  endDay: 26 },
    { id: 'manen',  name: '万延', startYear: 1860, startMonth: 4,  startDay: 8,  endYear: 1861, endMonth: 3,  endDay: 28 },
    { id: 'ansei',  name: '安政', baseYear: 1854, startYear: 1855, startMonth: 1,  startDay: 15, endYear: 1860, endMonth: 4,  endDay: 7 },
    { id: 'kaei',   name: '嘉永', startYear: 1848, startMonth: 4,  startDay: 1,  endYear: 1855, endMonth: 1,  endDay: 14 },
    { id: 'koka',   name: '弘化', baseYear: 1844, startYear: 1845, startMonth: 1,  startDay: 9,  endYear: 1848, endMonth: 3,  endDay: 31 },
    { id: 'tempo',  name: '天保', baseYear: 1830, startYear: 1831, startMonth: 1,  startDay: 23, endYear: 1845, endMonth: 1,  endDay: 8 },
    { id: 'bunsei', name: '文政', startYear: 1818, startMonth: 5,  startDay: 26, endYear: 1831, endMonth: 1,  endDay: 22 },
    { id: 'bunka',  name: '文化', startYear: 1804, startMonth: 3,  startDay: 22, endYear: 1818, endMonth: 5,  endDay: 25 }
  ];

  function toDateInt(y, m, d) {
    const yy = Number(y) || 0;
    const mm = Number(m) || 1;
    const dd = Number(d) || 1;
    return yy * 10000 + mm * 100 + dd;
  }

  /**
   * 西暦 (year, month, day) から和暦オブジェクトへ変換
   * 例: 1989年1月7日 -> 昭和64年1月7日, 1989年1月8日 -> 平成元年1月8日
   */
  function gregorianToWareki(year, month = 1, day = 1) {
    const y = Number(year);
    const m = Number(month) || 1;
    const d = Number(day) || 1;
    if (!y || y < 1000) return null;

    const target = toDateInt(y, m, d);
    for (const era of ERAS) {
      const start = toDateInt(era.startYear, era.startMonth, era.startDay);
      const end = toDateInt(era.endYear, era.endMonth, era.endDay);
      if (target >= start && target <= end) {
        const baseY = era.baseYear || era.startYear;
        const eraYear = y - baseY + 1;
        return {
          eraId: era.id,
          eraName: era.name,
          eraYear: eraYear,
          eraYearText: eraYear === 1 ? '元' : String(eraYear),
          year: y,
          month: m,
          day: d
        };
      }
    }
    return {
      eraId: 'seireki',
      eraName: '西暦',
      eraYear: y,
      eraYearText: String(y),
      year: y,
      month: m,
      day: d
    };
  }

  /**
   * 和暦 (eraNameまたはeraId, eraYear, month, day) から西暦へ変換
   */
  function warekiToGregorian(eraKey, eraYear, month = 1, day = 1) {
    const ey = Number(eraYear);
    if (!ey || ey < 1) return null;
    const era = ERAS.find(e => e.id === eraKey || e.name === eraKey);
    if (!era) return null;
    const baseY = era.baseYear || era.startYear;
    const gregYear = baseY + ey - 1;
    return {
      year: gregYear,
      month: Number(month) || 1,
      day: Number(day) || 1
    };
  }

  /**
   * 仕様書 4.2 表示切り替え対応フォーマッタ
   * mode: 'wareki'（和暦優先） | 'seireki'（西暦優先） | 'both'（併記）
   * - 例（和暦優先）: 昭和15年3月15日 (1940)
   * - 例（併記）: 昭和15年（1940年）3月15日
   * - 例（西暦優先）: 1940年3月15日 (昭和15年)
   */
  function formatDateByMode(dateStr, mode = 'wareki', shortForNode = false) {
    if (!dateStr) return '';
    const parts = String(dateStr).split('-').map(Number);
    const y = parts[0];
    const m = parts[1] || 1;
    const d = parts[2] || 1;
    if (!y) return '';

    const w = gregorianToWareki(y, m, d);
    if (!w) return `${y}年${m}月${d}日`;

    const wYearStr = `${w.eraName}${w.eraYearText}年`;
    if (shortForNode) {
      if (mode === 'seireki') return `${y}年`;
      if (mode === 'both') return `${wYearStr}(${y})`;
      return `${wYearStr}`;
    }

    if (mode === 'wareki') {
      return `${wYearStr}${m}月${d}日 (${y})`;
    } else if (mode === 'both') {
      return `${wYearStr}（${y}年）${m}月${d}日`;
    } else {
      return `${y}年${m}月${d}日 (${wYearStr})`;
    }
  }

  /**
   * 仕様書 4.2 年齢・享年自動算出
   * - 存命者: 満年齢を自動演算
   * - 故人: 享年（満年齢および数え年）を自動算出・表示
   */
  function calculateAgeInfo(birthDateStr, deathDateStr, isDeceased = false) {
    if (!birthDateStr) return null;
    const bParts = birthDateStr.split('-').map(Number);
    if (!bParts[0]) return null;
    const bYear = bParts[0];
    const bMonth = bParts[1] || 1;
    const bDay = bParts[2] || 1;

    if (isDeceased || deathDateStr) {
      if (!deathDateStr) {
        return {
          status: '故人',
          summaryText: '故人（没年月日未入力）'
        };
      }
      const dParts = deathDateStr.split('-').map(Number);
      if (!dParts[0]) return null;
      const dYear = dParts[0];
      const dMonth = dParts[1] || 1;
      const dDay = dParts[2] || 1;

      let fullAge = dYear - bYear;
      if (dMonth < bMonth || (dMonth === bMonth && dDay < bDay)) {
        fullAge -= 1;
      }
      fullAge = Math.max(0, fullAge);
      // 数え年 = 没年 - 生年 + 1
      const kazoeAge = Math.max(1, dYear - bYear + 1);

      return {
        status: '故人',
        fullAge,
        kazoeAge,
        summaryText: `享年：満${fullAge}歳（数え${kazoeAge}歳）`
      };
    } else {
      const now = new Date();
      const cYear = now.getFullYear();
      const cMonth = now.getMonth() + 1;
      const cDay = now.getDate();

      let fullAge = cYear - bYear;
      if (cMonth < bMonth || (cMonth === bMonth && cDay < bDay)) {
        fullAge -= 1;
      }
      fullAge = Math.max(0, fullAge);
      return {
        status: '存命',
        fullAge,
        summaryText: `存命：満${fullAge}歳`
      };
    }
  }

  // ---------------------------------------------------------------------------
  // 8. 日付妥当性チェック・江戸期対応バリデーション
  // ---------------------------------------------------------------------------
  function getDaysInMonth(year, month) {
    if (month === 2) {
      const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
      return isLeap ? 29 : 28;
    }
    if ([4, 6, 9, 11].includes(month)) return 30;
    return 31;
  }

  function validateDateInputs({ year, month, day, eraId, eraYear, sourceType } = {}) {
    const warnings = [];
    const errors = [];

    const m = Number(month);
    const d = Number(day);
    let y = Number(year);

    if (sourceType === 'wareki' && eraId && eraYear) {
      const era = ERAS.find(e => e.id === eraId || e.name === eraId);
      const ey = Number(eraYear);
      if (era && ey >= 1) {
        const baseY = era.baseYear || era.startYear;
        y = baseY + ey - 1;
        const maxEraYear = era.endYear === 9999 ? 999 : (era.endYear - baseY + 1);
        if (ey > maxEraYear) {
          warnings.push(`${era.name}${ey}年は在位期間外です（${era.name}は${maxEraYear}年まで）`);
        } else if (m && d) {
          const targetInt = toDateInt(y, m, d);
          const startInt = toDateInt(era.startYear, era.startMonth, era.startDay);
          const endInt = toDateInt(era.endYear, era.endMonth, era.endDay);
          if (targetInt < startInt || targetInt > endInt) {
            warnings.push(`${era.name}${ey}年${m}月${d}日は改元日の境界外です（正しい元号をご確認ください）`);
          }
        }
      }
    }

    if (y && (y < 1500 || y > 2100)) {
      errors.push('西暦年は1500〜2100年の範囲で入力してください');
    }
    if (month !== undefined && month !== '' && (isNaN(m) || m < 1 || m > 12)) {
      errors.push('月は1〜12の範囲で入力してください');
    }
    if (day !== undefined && day !== '' && y && m >= 1 && m <= 12) {
      const maxD = getDaysInMonth(y, m);
      if (isNaN(d) || d < 1 || d > maxD) {
        errors.push(`${y}年${m}月は1〜${maxD}日の範囲です`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  function validateBirthDeathOrder(birthDateStr, deathDateStr) {
    if (!birthDateStr || !deathDateStr) return { valid: true, message: '' };
    const [by, bm, bd] = birthDateStr.split('-').map(Number);
    const [dy, dm, dd] = deathDateStr.split('-').map(Number);
    if (!by || !dy) return { valid: true, message: '' };
    if (toDateInt(dy, dm || 1, dd || 1) < toDateInt(by, bm || 1, bd || 1)) {
      return { valid: false, message: '警告：没年月日が生年月日よりも前になっています' };
    }
    return { valid: true, message: '' };
  }

  // ---------------------------------------------------------------------------
  // 7. 伝統家譜・供養：年忌法要スケジュール計算 ＆ 家紋プリセット
  // ---------------------------------------------------------------------------
  const MEMORIAL_YEARS = [
    { label: '一周忌', offset: 1 },
    { label: '三回忌', offset: 2 },
    { label: '七回忌', offset: 6 },
    { label: '十三回忌', offset: 12 },
    { label: '十七回忌', offset: 16 },
    { label: '二十三回忌', offset: 22 },
    { label: '二十七回忌', offset: 26 },
    { label: '三十三回忌', offset: 32 },
    { label: '五十回忌', offset: 49 }
  ];

  function calculateMemorialSchedule(deathDateStr) {
    if (!deathDateStr) return [];
    const parts = String(deathDateStr).split('-').map(Number);
    const dy = parts[0];
    const dm = parts[1] || 1;
    const dd = parts[2] || 1;
    if (!dy) return [];

    const now = new Date();
    const todayInt = toDateInt(now.getFullYear(), now.getMonth() + 1, now.getDate());
    let nextMarked = false;

    return MEMORIAL_YEARS.map(item => {
      const targetYear = dy + item.offset;
      const w = gregorianToWareki(targetYear, dm, dd);
      const warekiStr = w && w.eraId !== 'seireki' ? `${w.eraName}${w.eraYearText}年` : `${targetYear}年`;
      const targetInt = toDateInt(targetYear, dm, dd);
      const isPast = targetInt < todayInt;
      let isNext = false;
      if (!isPast && !nextMarked) {
        isNext = true;
        nextMarked = true;
      }
      return {
        label: item.label,
        year: targetYear,
        month: dm,
        day: dd,
        wareki: warekiStr,
        dateText: `${warekiStr}（${targetYear}年）${dm}月${dd}日`,
        isPast,
        isNext
      };
    });
  }

  const FAMILY_CRESTS = [
    { id: 'none', label: '家紋なし', svgInner: '' },
    {
      id: 'mokko',
      label: '丸に木瓜',
      svgInner: '<circle cx="24" cy="24" r="21" fill="none" stroke="#1C2024" stroke-width="2.4"/><path d="M24 8 C29 8 31 14 27 17 C31 14 39 16 39 24 C39 32 31 34 27 31 C31 34 29 40 24 40 C19 40 17 34 21 31 C17 34 9 32 9 24 C9 16 17 14 21 17 C17 14 19 8 24 8 Z" fill="none" stroke="#1C2024" stroke-width="2"/><circle cx="24" cy="24" r="4" fill="#1C2024"/>'
    },
    {
      id: 'katabami',
      label: '丸に片喰',
      svgInner: '<circle cx="24" cy="24" r="21" fill="none" stroke="#1C2024" stroke-width="2.4"/><path d="M24 22 C18 13 13 10 18 7 C22 5 24 10 24 14 C24 10 26 5 30 7 C35 10 30 13 24 22 Z" fill="#1C2024"/><path d="M24 24 C15 21 9 22 9 28 C9 33 15 31 19 28 C15 32 15 38 20 39 C24 40 24 33 24 28 Z" fill="#1C2024"/><path d="M24 24 C33 21 39 22 39 28 C39 33 33 31 29 28 C33 32 33 38 28 39 C24 40 24 33 24 28 Z" fill="#1C2024"/>'
    },
    {
      id: 'takanoha',
      label: '丸に違い鷹の羽',
      svgInner: '<circle cx="24" cy="24" r="21" fill="none" stroke="#1C2024" stroke-width="2.4"/><path d="M12 35 L33 11 L36 14 L15 38 Z" fill="#1C2024"/><path d="M36 35 L15 11 L12 14 L33 38 Z" fill="#1C2024"/><circle cx="24" cy="24" r="3" fill="#F7F6F2" stroke="#1C2024" stroke-width="1.5"/>'
    },
    {
      id: 'kiri',
      label: '五三桐',
      svgInner: '<path d="M24 6 C21 11 21 17 24 20 C27 17 27 11 24 6 Z M15 12 C13 16 14 21 18 23 C19 19 18 15 15 12 Z M33 12 C30 15 29 19 30 23 C34 21 35 16 33 12 Z" fill="#1C2024"/><path d="M10 34 C12 26 19 23 24 23 C29 23 36 26 38 34 C33 31 28 32 24 36 C20 32 15 31 10 34 Z" fill="#1C2024"/>'
    },
    {
      id: 'umebachi',
      label: '丸に梅鉢',
      svgInner: '<circle cx="24" cy="24" r="21" fill="none" stroke="#1C2024" stroke-width="2.4"/><circle cx="24" cy="12" r="5" fill="#1C2024"/><circle cx="35" cy="20" r="5" fill="#1C2024"/><circle cx="31" cy="33" r="5" fill="#1C2024"/><circle cx="17" cy="33" r="5" fill="#1C2024"/><circle cx="13" cy="20" r="5" fill="#1C2024"/><circle cx="24" cy="24" r="3.5" fill="#F7F6F2" stroke="#1C2024" stroke-width="1.5"/>'
    },
    {
      id: 'tachibana',
      label: '丸に橘',
      svgInner: '<circle cx="24" cy="24" r="21" fill="none" stroke="#1C2024" stroke-width="2.4"/><circle cx="24" cy="21" r="6" fill="#1C2024"/><path d="M12 31 C16 25 22 25 24 29 C26 25 32 25 36 31 C31 35 27 34 24 31 C21 34 17 35 12 31 Z" fill="#1C2024"/>'
    }
  ];

  // ---------------------------------------------------------------------------
  // 6. 起点（被相続人）切り替え時の親等・続柄再計算 & 法定相続分試算
  // ---------------------------------------------------------------------------
  function getChildrenOf(people, parentId) {
    return Object.values(people).filter(p => p.fatherId === parentId || p.motherId === parentId);
  }

  function recalculateKinshipFromRoot(people, newRootId) {
    if (!people || !people[newRootId]) return;
    const visited = new Map();
    const queue = [{ id: newRootId, path: [], inLaw: false, genOffset: 0, degree: 0 }];
    visited.set(newRootId, queue[0]);

    while (queue.length > 0) {
      const cur = queue.shift();
      const p = people[cur.id];
      if (!p) continue;

      const neighbors = [];
      if (p.fatherId && people[p.fatherId]) {
        neighbors.push({ id: p.fatherId, step: 'F', genDelta: 1, degDelta: 1, inLaw: cur.inLaw });
      }
      if (p.motherId && people[p.motherId]) {
        neighbors.push({ id: p.motherId, step: 'M', genDelta: 1, degDelta: 1, inLaw: cur.inLaw });
      }
      if (p.spouseId && people[p.spouseId]) {
        neighbors.push({ id: p.spouseId, step: 'S', genDelta: 0, degDelta: 0, inLaw: true });
      }
      getChildrenOf(people, cur.id).forEach(child => {
        neighbors.push({ id: child.id, step: 'C', genDelta: -1, degDelta: 1, inLaw: cur.inLaw });
      });

      neighbors.forEach(nb => {
        if (!visited.has(nb.id)) {
          const next = {
            id: nb.id,
            path: cur.path.concat(nb.step),
            inLaw: nb.inLaw,
            genOffset: cur.genOffset + nb.genDelta,
            degree: cur.degree + nb.degDelta
          };
          visited.set(nb.id, next);
          queue.push(next);
        }
      });
    }

    const rootBirth = people[newRootId].birthDate || '';
    const patternRoles = {
      '': ['本人', 'ほんにん', '0親等'],
      'S': ['配偶者', 'はいぐうしゃ', '配偶者'],
      'F': ['父', 'ちち', '1親等'],
      'M': ['母', 'はは', '1親等'],
      'FF': ['祖父', 'そふ', '2親等'],
      'FM': ['祖母', 'そぼ', '2親等'],
      'MF': ['祖父', 'そふ', '2親等'],
      'MM': ['祖母', 'そぼ', '2親等'],
      'FFF': ['曽祖父', 'そうそふ', '3親等'],
      'FFM': ['曽祖母', 'そうそぼ', '3親等'],
      'FMF': ['曽祖父', 'そうそふ', '3親等'],
      'FMM': ['曽祖母', 'そうそぼ', '3親等'],
      'MFF': ['曽祖父', 'そうそふ', '3親等'],
      'MFM': ['曽祖母', 'そうそぼ', '3親等'],
      'MMF': ['曽祖父', 'そうそふ', '3親等'],
      'MMM': ['曽祖母', 'そうそぼ', '3親等'],
      'CC': ['孫', 'まご', '2親等'],
      'CCC': ['曽孫', 'ひまご', '3親等'],
      'CCCC': ['玄孫', 'やしゃご', '4親等']
    };

    visited.forEach((info, id) => {
      const person = people[id];
      if (!person) return;
      person.generation = 1 + info.genOffset;
      const code = info.path.join('');

      if (patternRoles[code]) {
        person.roleLabel = patternRoles[code][0];
        person.roleRuby = patternRoles[code][1];
        person.degreeLabel = patternRoles[code][2];
      } else if (code === 'C') {
        person.roleLabel = person.gender === 'F' ? '娘' : '息子';
        person.roleRuby = person.gender === 'F' ? 'むすめ' : 'むすこ';
        person.degreeLabel = '1親等';
      } else if (code === 'FC' || code === 'MC') {
        const isOlder = person.birthDate && rootBirth && person.birthDate < rootBirth;
        if (person.gender === 'F') {
          person.roleLabel = isOlder ? '姉' : '妹';
          person.roleRuby = isOlder ? 'あね' : 'いもうと';
        } else {
          person.roleLabel = isOlder ? '兄' : '弟';
          person.roleRuby = isOlder ? 'あに' : 'おとうと';
        }
        person.degreeLabel = '2親等';
      } else if (code === 'FFC' || code === 'FMC' || code === 'MFC' || code === 'MMC') {
        person.roleLabel = person.gender === 'F' ? '伯母/叔母' : '伯父/叔父';
        person.roleRuby = person.gender === 'F' ? 'おば' : 'おじ';
        person.degreeLabel = '3親等';
      } else if (code === 'FCC' || code === 'MCC') {
        person.roleLabel = person.gender === 'F' ? '姪' : '甥';
        person.roleRuby = person.gender === 'F' ? 'めい' : 'おい';
        person.degreeLabel = '3親等';
      } else if (/^[FM]{4}$/.test(code)) {
        person.roleLabel = person.gender === 'F' ? '高祖母' : '高祖父';
        person.roleRuby = person.gender === 'F' ? 'こうそぼ' : 'こうそふ';
        person.degreeLabel = '4親等';
      } else if (/^S/.test(code) || info.inLaw) {
        person.roleLabel = code.endsWith('S') ? '配偶者' : '姻族';
        person.roleRuby = code.endsWith('S') ? 'はいぐうしゃ' : 'いんぞく';
        person.degreeLabel = `${info.degree}親等姻族`;
      } else if (info.degree === 4 && info.genOffset === 0) {
        person.roleLabel = person.gender === 'F' ? '従姉妹' : '従兄弟';
        person.roleRuby = 'いとこ';
        person.degreeLabel = '4親等';
      } else {
        person.roleLabel = info.genOffset > 0 ? '尊属' : (info.genOffset < 0 ? '卑属' : '親族');
        person.roleRuby = '';
        person.degreeLabel = `${info.degree}親等`;
      }

      // 直系フラグは父・母・祖父母等（F/Mのみ、またはCのみ、または本人）ならON
      const isBloodDirect = code === '' || /^[FM]+$/.test(code) || /^C+$/.test(code);
      person.isDirectLine = isBloodDirect;
    });
  }

  function gcd(a, b) {
    return b === 0 ? a : gcd(b, a % b);
  }
  function formatFraction(num, den) {
    const g = gcd(num, den);
    const n = num / g;
    const d = den / g;
    return d === 1 ? `${n}` : `${n}/${d}`;
  }

  function calculateLegalInheritance(people, rootId) {
    const root = people[rootId];
    if (!root) return { heirs: [], summary: '起点人物が見つかりません', renounced: [] };

    const renounced = [];
    const isRenounced = (p) => p && p.inheritanceStatus === 'renounced';

    // 配偶者
    let spouse = null;
    if (root.spouseId && people[root.spouseId]) {
      const sp = people[root.spouseId];
      if (isRenounced(sp)) {
        renounced.push(sp);
      } else if (!sp.isDeceased) {
        spouse = sp;
      }
    }

    // 第1順位：子（死亡時は代襲相続で孫を探索）
    function collectIssueHeirs(parentId) {
      const children = getChildrenOf(people, parentId);
      const result = [];
      children.forEach(c => {
        if (isRenounced(c)) {
          renounced.push(c);
          return; // 相続放棄は代襲しない
        }
        if (!c.isDeceased) {
          result.push({ person: c, isRepresentative: parentId !== rootId });
        } else {
          const reps = collectIssueHeirs(c.id);
          reps.forEach(r => result.push({ person: r.person, isRepresentative: true }));
        }
      });
      return result;
    }

    const issueHeirs = collectIssueHeirs(rootId);
    let rankLabel = '';
    let bloodHeirs = [];

    if (issueHeirs.length > 0) {
      rankLabel = '第1順位（子・直系卑属）';
      bloodHeirs = issueHeirs;
    } else {
      // 第2順位：直系尊属（父母 -> 祖父母）
      const parents = [root.fatherId, root.motherId].map(id => people[id]).filter(Boolean);
      const validParents = parents.filter(p => {
        if (isRenounced(p)) { renounced.push(p); return false; }
        return !p.isDeceased;
      });
      if (validParents.length > 0) {
        rankLabel = '第2順位（直系尊属：父母）';
        bloodHeirs = validParents.map(p => ({ person: p, isRepresentative: false }));
      } else {
        const gpIds = new Set();
        parents.forEach(p => {
          if (p.fatherId) gpIds.add(p.fatherId);
          if (p.motherId) gpIds.add(p.motherId);
        });
        const validGps = Array.from(gpIds).map(id => people[id]).filter(p => p && !p.isDeceased && !isRenounced(p));
        if (validGps.length > 0) {
          rankLabel = '第2順位（直系尊属：祖父母）';
          bloodHeirs = validGps.map(p => ({ person: p, isRepresentative: false }));
        } else {
          // 第3順位：兄弟姉妹（死亡時は甥・姪が代襲）
          const siblingMap = new Map();
          [root.fatherId, root.motherId].filter(Boolean).forEach(pid => {
            getChildrenOf(people, pid).forEach(sib => {
              if (sib.id !== rootId) siblingMap.set(sib.id, sib);
            });
          });
          const sibHeirs = [];
          siblingMap.forEach(sib => {
            if (isRenounced(sib)) { renounced.push(sib); return; }
            if (!sib.isDeceased) {
              sibHeirs.push({ person: sib, isRepresentative: false });
            } else {
              getChildrenOf(people, sib.id).forEach(nieceNephew => {
                if (isRenounced(nieceNephew)) { renounced.push(nieceNephew); return; }
                if (!nieceNephew.isDeceased) {
                  sibHeirs.push({ person: nieceNephew, isRepresentative: true });
                }
              });
            }
          });
          if (sibHeirs.length > 0) {
            rankLabel = '第3順位（兄弟姉妹・甥姪）';
            bloodHeirs = sibHeirs;
          }
        }
      }
    }

    const heirs = [];
    if (spouse && bloodHeirs.length === 0) {
      heirs.push({ person: spouse, relation: '配偶者', share: '1（全額）', percent: 100 });
      rankLabel = '配偶者のみ';
    } else if (spouse && bloodHeirs.length > 0) {
      let spNum = 1, spDen = 2, blNum = 1, blDen = 2;
      if (rankLabel.startsWith('第2順位')) {
        spNum = 2; spDen = 3; blNum = 1; blDen = 3;
      } else if (rankLabel.startsWith('第3順位')) {
        spNum = 3; spDen = 4; blNum = 1; blDen = 4;
      }
      heirs.push({
        person: spouse,
        relation: '配偶者',
        share: formatFraction(spNum, spDen),
        percent: Math.round((spNum / spDen) * 1000) / 10
      });
      bloodHeirs.forEach(item => {
        const den = blDen * bloodHeirs.length;
        heirs.push({
          person: item.person,
          relation: item.isRepresentative ? `${item.person.roleLabel || '代襲'}（代襲）` : (item.person.roleLabel || '血族相続人'),
          share: formatFraction(blNum, den),
          percent: Math.round((blNum / den) * 1000) / 10
        });
      });
    } else if (!spouse && bloodHeirs.length > 0) {
      bloodHeirs.forEach(item => {
        const den = bloodHeirs.length;
        heirs.push({
          person: item.person,
          relation: item.isRepresentative ? `${item.person.roleLabel || '代襲'}（代襲）` : (item.person.roleLabel || '血族相続人'),
          share: formatFraction(1, den),
          percent: Math.round((1 / den) * 1000) / 10
        });
      });
    } else {
      rankLabel = '該当する法定相続人なし';
    }

    return {
      rootName: `${root.familyName || ''}${root.givenName || ''}`.trim() || root.roleLabel || '本人',
      rankLabel,
      heirs,
      renounced
    };
  }

  return {
    REGIONS,
    KUNI_DICTIONARY,
    ERAS,
    FAMILY_CRESTS,
    searchByKuniOrPref,
    findRegionByPref,
    gregorianToWareki,
    warekiToGregorian,
    formatDateByMode,
    calculateAgeInfo,
    validateDateInputs,
    validateBirthDeathOrder,
    calculateMemorialSchedule,
    recalculateKinshipFromRoot,
    calculateLegalInheritance
  };
})();
