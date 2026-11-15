/**
 * 家系図作成Webアプリケーション
 * 1. プライバシー・セキュリティ: 完全ローカルファースト（IndexedDB / LocalStorage完結）
 * 6. データバックアップ: JSONエクスポート / インポートおよび初期データ構築
 */

window.KakeizuStorage = (function () {
  const DB_NAME = 'WafuModernKakeizuDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'projects';
  const LS_KEY = 'wafu_kakeizu_current_project_v1';
  const LS_MAP_KEY = 'wafu_kakeizu_projects_map_v1';
  const LS_ACTIVE_KEY = 'wafu_kakeizu_active_id_v1';

  function openDB() {
    return new Promise((resolve) => {
      if (!window.indexedDB) {
        resolve(null);
        return;
      }
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = function (e) {
        resolve(e.target.result);
      };
      req.onerror = function () {
        resolve(null);
      };
    });
  }

  function getActiveProjectId() {
    try {
      return localStorage.getItem(LS_ACTIVE_KEY) || 'default_project';
    } catch (e) {
      return 'default_project';
    }
  }

  function setActiveProjectId(id) {
    try {
      localStorage.setItem(LS_ACTIVE_KEY, id);
    } catch (e) {
      console.warn('LocalStorage active key warning:', e);
    }
  }

  function readLsMap() {
    try {
      const rawMap = localStorage.getItem(LS_MAP_KEY);
      if (rawMap) return JSON.parse(rawMap) || {};
      const legacy = localStorage.getItem(LS_KEY);
      if (legacy) {
        const obj = JSON.parse(legacy);
        if (obj && obj.id) return { [obj.id]: obj };
      }
    } catch (e) {
      console.warn('LocalStorage map read warning:', e);
    }
    return {};
  }

  function writeLsMap(map) {
    try {
      localStorage.setItem(LS_MAP_KEY, JSON.stringify(map));
    } catch (e) {
      console.warn('LocalStorage map write warning:', e);
    }
  }

  async function saveProject(projectData) {
    if (!projectData.id) projectData.id = 'default_project';
    projectData.updatedAt = new Date().toISOString();
    setActiveProjectId(projectData.id);

    try {
      localStorage.setItem(LS_KEY, JSON.stringify(projectData));
      const map = readLsMap();
      map[projectData.id] = projectData;
      writeLsMap(map);
    } catch (e) {
      console.warn('LocalStorage save fallback warning:', e);
    }

    const db = await openDB();
    if (!db) return true;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(projectData);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }

  async function loadProjectById(projectId) {
    const id = projectId || getActiveProjectId();
    const db = await openDB();
    if (db) {
      const fromIdb = await new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
      if (fromIdb) {
        setActiveProjectId(fromIdb.id);
        return fromIdb;
      }
    }

    const map = readLsMap();
    if (map[id]) {
      setActiveProjectId(id);
      return map[id];
    }
    return null;
  }

  async function loadProject() {
    const activeId = getActiveProjectId();
    const exact = await loadProjectById(activeId);
    if (exact) return exact;

    const all = await listProjects();
    if (all.length > 0) {
      setActiveProjectId(all[0].id);
      return all[0];
    }
    return null;
  }

  async function listProjects() {
    const map = readLsMap();
    const db = await openDB();
    if (db) {
      const fromIdb = await new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
      fromIdb.forEach(p => {
        if (p && p.id) map[p.id] = p;
      });
    }

    return Object.values(map).sort((a, b) => {
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    });
  }

  async function deleteProject(projectId) {
    const map = readLsMap();
    delete map[projectId];
    writeLsMap(map);

    try {
      const legacy = localStorage.getItem(LS_KEY);
      if (legacy) {
        const obj = JSON.parse(legacy);
        if (obj && obj.id === projectId) localStorage.removeItem(LS_KEY);
      }
    } catch (e) { /* ignore */ }

    const db = await openDB();
    if (!db) return true;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(projectId);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }

  async function duplicateProject(sourceProject, newTitle) {
    const copy = JSON.parse(JSON.stringify(sourceProject));
    copy.id = 'proj_' + Date.now();
    copy.title = newTitle || `${sourceProject.title || '家系図'}（コピー）`;
    copy.createdAt = new Date().toISOString();
    copy.updatedAt = copy.createdAt;
    await saveProject(copy);
    return copy;
  }

  /**
   * 起点人物情報および選択された系統・様式からプロジェクトデータを生成
   * 様式A / 様式B / 様式C それぞれを即座に美しく描画・編集できる統合データ構造
   */
  function createProjectFromWizard({
    projectId = null,
    lineageMode = '1',
    styleMode = 'A',
    familyName = '',
    givenName = '',
    familyKana = '',
    givenKana = '',
    birthDate = '',
    birthPlace = '',
    includeSampleTemplate = false
  } = {}) {
    const fullTitle = familyName ? `${familyName}家 家系図` : 'マイ家系図';
    const people = {};

    function addPerson(id, data) {
      people[id] = Object.assign(
        {
          id,
          familyName: data.familyName ?? '',
          givenName: data.givenName ?? '',
          maidenName: data.maidenName ?? '',
          familyKana: data.familyKana ?? '',
          givenKana: data.givenKana ?? '',
          roleLabel: data.roleLabel ?? '',
          roleRuby: data.roleRuby ?? '',
          degreeLabel: data.degreeLabel ?? '',
          gender: data.gender ?? 'M',
          generation: data.generation ?? 1, // 1=本人, 2=父母, 3=祖父母, 4=曽祖父母, 5=高祖父母, 0以下=子孫
          birthDate: data.birthDate ?? '',
          deathDate: data.deathDate ?? '',
          isDeceased: Boolean(data.isDeceased || data.deathDate),
          birthPlace: data.birthPlace ?? '',
          originKuni: data.originKuni ?? '',
          honsekiAddress: data.honsekiAddress ?? '',
          inheritanceStatus: data.inheritanceStatus ?? 'none',
          buddhistName: data.buddhistName ?? '',
          tombLocation: data.tombLocation ?? '',
          isDirectLine: Boolean(data.isDirectLine),
          lineageGroup: data.lineageGroup ?? 1, // 1:父方父系, 2:母方父系, 3:父方母系, 4:母方母系, 5:傍系
          fatherId: data.fatherId ?? null,
          motherId: data.motherId ?? null,
          spouseId: data.spouseId ?? null,
          notes: data.notes ?? '',
          cBranchKey: data.cBranchKey ?? null
        },
        data
      );
      return people[id];
    }

    // =========================================================================
    // 1世（本人）のみを初期登録（サンプルテンプレート指定時のみ全親族を展開）
    // =========================================================================
    addPerson('self', {
      familyName,
      givenName,
      familyKana,
      givenKana,
      roleLabel: '本人',
      roleRuby: 'ほんにん',
      degreeLabel: '0親等',
      gender: 'M',
      generation: 1,
      birthDate: birthDate || '',
      birthPlace: birthPlace || '',
      isDirectLine: true,
      lineageGroup: 1,
      fatherId: includeSampleTemplate ? 'f' : null,
      motherId: includeSampleTemplate ? 'm' : null,
      spouseId: includeSampleTemplate ? 'spouse' : null,
      notes: includeSampleTemplate ? '家系図の起点人物（1世）' : ''
    });

    if (includeSampleTemplate) {
    // 2世（父母）
    addPerson('f', {
      familyName,
      givenName: '三郎',
      familyKana,
      givenKana: 'さぶろう',
      roleLabel: '父',
      roleRuby: 'ちち',
      degreeLabel: '1親等',
      gender: 'M',
      generation: 2,
      birthDate: '1955-06-10',
      birthPlace: '東京都',
      isDirectLine: true,
      lineageGroup: 1,
      fatherId: 'ff',
      motherId: 'fm',
      spouseId: 'm'
    });

    addPerson('m', {
      familyName,
      givenName: '花子',
      maidenName: '加藤',
      familyKana,
      givenKana: 'はなこ',
      roleLabel: '母',
      roleRuby: 'はは',
      degreeLabel: '1親等',
      gender: 'F',
      generation: 2,
      birthDate: '1957-11-22',
      birthPlace: '神奈川県',
      isDirectLine: false,
      lineageGroup: 2,
      fatherId: 'mf',
      motherId: 'mm',
      spouseId: 'f'
    });

    // 3世（祖父母 4名）
    addPerson('ff', {
      familyName,
      givenName: '五郎',
      familyKana,
      givenKana: 'ごろう',
      roleLabel: '祖父',
      roleRuby: 'そふ',
      degreeLabel: '2親等',
      gender: 'M',
      generation: 3,
      birthDate: '1928-04-02',
      deathDate: '2014-09-18',
      isDeceased: true,
      birthPlace: '東京都',
      isDirectLine: true,
      lineageGroup: 1,
      fatherId: 'fff',
      motherId: 'ffm',
      spouseId: 'fm'
    });

    addPerson('fm', {
      familyName,
      givenName: '恵子',
      maidenName: '中田',
      familyKana,
      givenKana: 'けいこ',
      roleLabel: '祖母',
      roleRuby: 'そぼ',
      degreeLabel: '2親等',
      gender: 'F',
      generation: 3,
      birthDate: '1930-08-19',
      deathDate: '2018-02-05',
      isDeceased: true,
      birthPlace: '埼玉県',
      isDirectLine: false,
      lineageGroup: 3,
      fatherId: 'fmf',
      motherId: 'fmm',
      spouseId: 'ff'
    });

    addPerson('mf', {
      familyName: '加藤',
      givenName: '正雄',
      familyKana: 'かとう',
      givenKana: 'まさお',
      roleLabel: '祖父',
      roleRuby: 'そふ',
      degreeLabel: '2親等',
      gender: 'M',
      generation: 3,
      birthDate: '1927-01-12',
      deathDate: '2010-12-03',
      isDeceased: true,
      birthPlace: '神奈川県',
      isDirectLine: false,
      lineageGroup: 2,
      fatherId: 'mff',
      motherId: 'mfm',
      spouseId: 'mm'
    });

    addPerson('mm', {
      familyName: '加藤',
      givenName: '千代',
      maidenName: '高橋',
      familyKana: 'かとう',
      givenKana: 'ちよ',
      roleLabel: '祖母',
      roleRuby: 'そぼ',
      degreeLabel: '2親等',
      gender: 'F',
      generation: 3,
      birthDate: '1931-05-25',
      birthPlace: '静岡県',
      isDirectLine: false,
      lineageGroup: 4,
      fatherId: 'mmf',
      motherId: 'mmm',
      spouseId: 'mf'
    });

    // 4世（曽祖父母 8名）
    const gen4Specs = [
      { id: 'fff', spouse: 'ffm', gender: 'M', fam: familyName, giv: '六郎', maiden: '', b: '1901-03-15', d: '1982-11-10', pref: '東京都', direct: true, grp: 1, fId: 'ffff', mId: 'fffm' },
      { id: 'ffm', spouse: 'fff', gender: 'F', fam: familyName, giv: '梅子', maiden: '佐藤', b: '1904-07-08', d: '1988-04-21', pref: '千葉県', direct: false, grp: 1, fId: 'ffmf', mId: 'ffmm' },
      { id: 'fmf', spouse: 'fmm', gender: 'M', fam: '中田', giv: '源次郎', maiden: '', b: '1900-09-01', d: '1979-01-15', pref: '埼玉県', direct: false, grp: 3, fId: 'fmff', mId: 'fmfm' },
      { id: 'fmm', spouse: 'fmf', gender: 'F', fam: '中田', giv: 'トミ', maiden: '渡辺', b: '1903-12-11', d: '1985-06-30', pref: '埼玉県', direct: false, grp: 3, fId: 'fmmf', mId: 'fmmm' },
      { id: 'mff', spouse: 'mfm', gender: 'M', fam: '加藤', giv: '重吉', maiden: '', b: '1899-02-19', d: '1975-08-09', pref: '神奈川県', direct: false, grp: 2, fId: 'mfff', mId: 'mffm' },
      { id: 'mfm', spouse: 'mff', gender: 'F', fam: '加藤', giv: 'ハル', maiden: '伊藤', b: '1902-04-04', d: '1984-03-12', pref: '神奈川県', direct: false, grp: 2, fId: 'mfmf', mId: 'mfmm' },
      { id: 'mmf', spouse: 'mmm', gender: 'M', fam: '高橋', giv: '庄太郎', maiden: '', b: '1901-10-20', d: '1980-05-17', pref: '静岡県', direct: false, grp: 4, fId: 'mmff', mId: 'mmfm' },
      { id: 'mmm', spouse: 'mmf', gender: 'F', fam: '高橋', giv: 'キヨ', maiden: '山本', b: '1905-01-28', d: '1991-09-03', pref: '静岡県', direct: false, grp: 4, fId: 'mmmf', mId: 'mmmm' }
    ];

    gen4Specs.forEach(s => {
      addPerson(s.id, {
        familyName: s.fam,
        givenName: s.giv,
        maidenName: s.maiden,
        roleLabel: s.gender === 'M' ? '曽祖父' : '曽祖母',
        roleRuby: s.gender === 'M' ? 'そうそふ' : 'そうそぼ',
        degreeLabel: '3親等',
        gender: s.gender,
        generation: 4,
        birthDate: s.b,
        deathDate: s.d,
        isDeceased: true,
        birthPlace: s.pref,
        isDirectLine: s.direct,
        lineageGroup: s.grp,
        fatherId: s.fId,
        motherId: s.mId,
        spouseId: s.spouse
      });
    });

    // 5世（高祖父母 16名：添付画像1の最上段16ノードに完全対応）
    const gen5Pairs = [
      ['ffff', 'fffm', familyName, '惣右衛門', 'マツ', true, 1, '東京都'],
      ['ffmf', 'ffmm', '佐藤', '嘉兵衛', 'ウメ', false, 1, '千葉県'],
      ['fmff', 'fmfm', '中田', '勘助', 'ヨシ', false, 3, '埼玉県'],
      ['fmmf', 'fmmm', '渡辺', '茂平', 'ツル', false, 3, '埼玉県'],
      ['mfff', 'mffm', '加藤', '藤吉', 'タケ', false, 2, '神奈川県'],
      ['mfmf', 'mfmm', '伊藤', '善蔵', 'スエ', false, 2, '神奈川県'],
      ['mmff', 'mmfm', '高橋', '清左衛門', 'コウ', false, 4, '静岡県'],
      ['mmmf', 'mmmm', '山本', '平八', 'サワ', false, 4, '静岡県']
    ];

    gen5Pairs.forEach(([mId, fId, fam, mGiv, fGiv, isDirect, grp, pref]) => {
      addPerson(mId, {
        familyName: fam,
        givenName: mGiv,
        roleLabel: isDirect ? '①高祖父' : '高祖父',
        roleRuby: 'こうそふ',
        degreeLabel: '4親等',
        gender: 'M',
        generation: 5,
        birthDate: '1872-05-10',
        deathDate: '1945-03-01',
        isDeceased: true,
        birthPlace: pref,
        isDirectLine: isDirect,
        lineageGroup: grp,
        spouseId: fId
      });
      addPerson(fId, {
        familyName: fam,
        givenName: fGiv,
        roleLabel: '高祖母',
        roleRuby: 'こうそぼ',
        degreeLabel: '4親等',
        gender: 'F',
        generation: 5,
        birthDate: '1875-09-14',
        deathDate: '1950-11-20',
        isDeceased: true,
        birthPlace: pref,
        isDirectLine: false,
        lineageGroup: grp,
        spouseId: mId
      });
    });

    // =========================================================================
    // 様式B・様式C 共用の親族・子孫・傍系ノード（添付画像2および画像3に完全対応）
    // =========================================================================
    // 配偶者・姉・弟・息子・娘・孫・曽孫など
    addPerson('spouse', {
      familyName,
      givenName: '彩香',
      maidenName: '鈴木',
      roleLabel: '配偶者',
      roleRuby: 'はいぐうしゃ',
      degreeLabel: '配偶者',
      gender: 'F',
      generation: 1,
      birthDate: '1987-07-20',
      birthPlace: '東京都',
      isDirectLine: true,
      lineageGroup: 1,
      spouseId: 'self'
    });

    addPerson('elder_sister', {
      familyName,
      givenName: '美咲',
      roleLabel: '姉',
      roleRuby: 'あね',
      degreeLabel: '2親等',
      gender: 'F',
      generation: 1,
      birthDate: '1982-04-12',
      birthPlace: '東京都',
      isDirectLine: false,
      lineageGroup: 5,
      fatherId: 'f',
      motherId: 'm'
    });

    addPerson('son', {
      familyName,
      givenName: '二郎',
      familyKana,
      givenKana: 'じろう',
      roleLabel: '息子',
      roleRuby: 'むすこ',
      degreeLabel: '1親等',
      gender: 'M',
      generation: 0,
      birthDate: '2014-05-05',
      birthPlace: '東京都',
      isDirectLine: true,
      lineageGroup: 1,
      fatherId: 'self',
      motherId: 'spouse'
    });

    addPerson('daughter', {
      familyName,
      givenName: '結衣',
      familyKana,
      givenKana: 'ゆい',
      roleLabel: '娘',
      roleRuby: 'むすめ',
      degreeLabel: '1親等',
      gender: 'F',
      generation: 0,
      birthDate: '2017-10-18',
      birthPlace: '東京都',
      isDirectLine: true,
      lineageGroup: 1,
      fatherId: 'self',
      motherId: 'spouse'
    });

    // 様式Cの傍系家族ツリー（サンプル用）
    addPerson('c_aunt_michiko', {
      familyName: '鈴木',
      givenName: '道子',
      maidenName: familyName,
      roleLabel: '大伯母',
      roleRuby: 'おおおば',
      degreeLabel: '3親等',
      gender: 'F',
      generation: 3,
      birthDate: '1931-02-14',
      birthPlace: '東京都',
      lineageGroup: 5,
      fatherId: 'fff',
      motherId: 'ffm',
      spouseId: 'c_uncle_hajime'
    });

    addPerson('c_uncle_hajime', {
      familyName: '鈴木',
      givenName: '一',
      roleLabel: '大伯母の配偶者',
      roleRuby: 'はいぐうしゃ',
      degreeLabel: '3親等姻族',
      gender: 'M',
      generation: 3,
      birthDate: '1929-09-09',
      birthPlace: '東京都',
      lineageGroup: 5,
      spouseId: 'c_aunt_michiko'
    });

    addPerson('c_granduncle_kazuhiko', {
      familyName,
      givenName: '和彦',
      roleLabel: '大叔父',
      roleRuby: 'おおおじ',
      degreeLabel: '3親等',
      gender: 'M',
      generation: 3,
      birthDate: '1934-06-21',
      birthPlace: '東京都',
      lineageGroup: 5,
      fatherId: 'fff',
      motherId: 'ffm',
      spouseId: 'c_grandaunt_ryoko'
    });

    addPerson('c_grandaunt_ryoko', {
      familyName,
      givenName: '良子',
      maidenName: '斎藤',
      roleLabel: '大叔父の配偶者',
      roleRuby: 'はいぐうしゃ',
      degreeLabel: '3親等姻族',
      gender: 'F',
      generation: 3,
      birthDate: '1936-12-03',
      birthPlace: '千葉県',
      lineageGroup: 5,
      spouseId: 'c_granduncle_kazuhiko'
    });

    addPerson('c_uncle_kazuhiro', {
      familyName,
      givenName: '四郎',
      familyKana,
      givenKana: 'しろう',
      roleLabel: '叔父',
      roleRuby: 'おじ',
      degreeLabel: '2親等',
      gender: 'M',
      generation: 2,
      birthDate: '1958-08-15',
      birthPlace: '東京都',
      lineageGroup: 5,
      fatherId: 'ff',
      motherId: 'fm',
      spouseId: 'c_aunt_miharu'
    });

    addPerson('c_aunt_miharu', {
      familyName,
      givenName: '美春',
      maidenName: '藤原',
      roleLabel: '叔父の配偶者',
      roleRuby: 'はいぐうしゃ',
      degreeLabel: '2親等姻族',
      gender: 'F',
      generation: 2,
      birthDate: '1960-03-22',
      birthPlace: '東京都',
      lineageGroup: 5,
      spouseId: 'c_uncle_kazuhiro'
    });

    addPerson('c_cousin_kiyomi', {
      familyName,
      givenName: '清美',
      roleLabel: '従姉妹',
      roleRuby: 'いとこ',
      degreeLabel: '4親等',
      gender: 'F',
      generation: 1,
      birthDate: '1986-07-07',
      birthPlace: '東京都',
      lineageGroup: 5,
      fatherId: 'c_uncle_kazuhiro',
      motherId: 'c_aunt_miharu'
    });

    addPerson('c_cousin_kazutetsu', {
      familyName,
      givenName: '和哲',
      roleLabel: '従兄弟',
      roleRuby: 'いとこ',
      degreeLabel: '4親等',
      gender: 'M',
      generation: 1,
      birthDate: '1988-11-19',
      birthPlace: '東京都',
      lineageGroup: 5,
      fatherId: 'c_uncle_kazuhiro',
      motherId: 'c_aunt_miharu'
    });

    addPerson('c_cousin_kazuko', {
      familyName: '佐藤',
      givenName: '数子',
      maidenName: familyName,
      roleLabel: '従姉妹',
      roleRuby: 'いとこ',
      degreeLabel: '4親等',
      gender: 'F',
      generation: 1,
      birthDate: '1990-02-09',
      birthPlace: '東京都',
      lineageGroup: 5,
      fatherId: 'c_uncle_kazuhiro',
      motherId: 'c_aunt_miharu',
      spouseId: 'c_cousin_husband_ichiro'
    });

    addPerson('c_cousin_husband_ichiro', {
      familyName: '佐藤',
      givenName: '一郎',
      roleLabel: '従姉妹の配偶者',
      roleRuby: 'はいぐうしゃ',
      degreeLabel: '4親等姻族',
      gender: 'M',
      generation: 1,
      birthDate: '1989-05-14',
      birthPlace: '千葉県',
      lineageGroup: 5,
      spouseId: 'c_cousin_kazuko'
    });

    addPerson('c_cousin_child_taro', {
      familyName: '佐藤',
      givenName: '小太郎',
      roleLabel: '従甥',
      roleRuby: 'いとこおい',
      degreeLabel: '5親等',
      gender: 'M',
      generation: 0,
      birthDate: '2016-09-01',
      birthPlace: '千葉県',
      lineageGroup: 5,
      fatherId: 'c_cousin_husband_ichiro',
      motherId: 'c_cousin_kazuko'
    });

    // 右側（和彦・良子夫妻の枝：添付画像3完全再現用）
    addPerson('c_2nd_hiroichi', {
      familyName,
      givenName: '博一',
      roleLabel: '父の従兄弟',
      roleRuby: 'いとこおじ',
      degreeLabel: '4親等',
      gender: 'M',
      generation: 2,
      birthDate: '1960-01-18',
      birthPlace: '東京都',
      lineageGroup: 5,
      spouseId: 'c_2nd_haruka'
    });

    addPerson('c_2nd_haruka', {
      familyName,
      givenName: '春香',
      maidenName: '太田',
      roleLabel: '伯従母',
      roleRuby: 'いとこおば',
      degreeLabel: '4親等',
      gender: 'F',
      generation: 2,
      birthDate: '1962-04-28',
      birthPlace: '東京都',
      lineageGroup: 5,
      fatherId: 'c_granduncle_kazuhiko',
      motherId: 'c_grandaunt_ryoko',
      spouseId: 'c_2nd_hiroichi'
    });

    addPerson('c_2nd_daisuke', {
      familyName,
      givenName: '大輔',
      roleLabel: '再従兄弟',
      roleRuby: 'はとこ',
      degreeLabel: '6親等',
      gender: 'M',
      generation: 1,
      birthDate: '1989-10-10',
      birthPlace: '東京都',
      lineageGroup: 5,
      fatherId: 'c_2nd_hiroichi',
      motherId: 'c_2nd_haruka',
      spouseId: 'c_2nd_hanako2'
    });

    addPerson('c_2nd_hanako2', {
      familyName,
      givenName: '花子',
      maidenName: '佐藤',
      roleLabel: '再従兄弟の配偶者',
      roleRuby: 'はいぐうしゃ',
      degreeLabel: '6親等姻族',
      gender: 'F',
      generation: 1,
      birthDate: '1991-03-03',
      birthPlace: '東京都',
      lineageGroup: 5,
      spouseId: 'c_2nd_daisuke'
    });

    addPerson('c_2nd_haruna', {
      familyName,
      givenName: '春奈',
      roleLabel: '再従姪',
      roleRuby: 'はとこめい',
      degreeLabel: '7親等',
      gender: 'F',
      generation: 0,
      birthDate: '2018-04-12',
      birthPlace: '東京都',
      lineageGroup: 5,
      fatherId: 'c_2nd_daisuke',
      motherId: 'c_2nd_hanako2'
    });

    addPerson('c_2nd_yoshihiko', {
      familyName,
      givenName: '義彦',
      roleLabel: '伯従父',
      roleRuby: 'いとこおじ',
      degreeLabel: '4親等',
      gender: 'M',
      generation: 2,
      birthDate: '1964-07-11',
      birthPlace: '東京都',
      lineageGroup: 5,
      fatherId: 'c_granduncle_kazuhiko',
      motherId: 'c_grandaunt_ryoko',
      spouseId: 'c_2nd_shoko'
    });

    addPerson('c_2nd_shoko', {
      familyName,
      givenName: '翔子',
      maidenName: '岡田',
      roleLabel: '伯従父の配偶者',
      roleRuby: 'はいぐうしゃ',
      degreeLabel: '4親等姻族',
      gender: 'F',
      generation: 2,
      birthDate: '1966-09-25',
      birthPlace: '東京都',
      lineageGroup: 5,
      spouseId: 'c_2nd_yoshihiko'
    });

    addPerson('c_2nd_aiko', {
      familyName,
      givenName: '愛子',
      roleLabel: '伯従母',
      roleRuby: 'いとこおば',
      degreeLabel: '4親等',
      gender: 'F',
      generation: 2,
      birthDate: '1968-12-19',
      birthPlace: '東京都',
      lineageGroup: 5,
      fatherId: 'c_granduncle_kazuhiko',
      motherId: 'c_grandaunt_ryoko'
    });

    addPerson('c_2nd_yoshio', {
      familyName,
      givenName: '義男',
      roleLabel: '再従兄弟',
      roleRuby: 'はとこ',
      degreeLabel: '6親等',
      gender: 'M',
      generation: 1,
      birthDate: '1992-01-23',
      birthPlace: '東京都',
      lineageGroup: 5,
      fatherId: 'c_2nd_yoshihiko',
      motherId: 'c_2nd_shoko'
    });

    addPerson('c_2nd_kazuyoshi', {
      familyName,
      givenName: '和義',
      roleLabel: '再従兄弟',
      roleRuby: 'はとこ',
      degreeLabel: '6親等',
      gender: 'M',
      generation: 1,
      birthDate: '1994-06-30',
      birthPlace: '東京都',
      lineageGroup: 5,
      fatherId: 'c_2nd_yoshihiko',
      motherId: 'c_2nd_shoko',
      spouseId: 'c_2nd_hanako3'
    });

    addPerson('c_2nd_hanako3', {
      familyName,
      givenName: '花子',
      maidenName: '佐藤',
      roleLabel: '再従兄弟の配偶者',
      roleRuby: 'はいぐうしゃ',
      degreeLabel: '6親等姻族',
      gender: 'F',
      generation: 1,
      birthDate: '1995-08-14',
      birthPlace: '東京都',
      lineageGroup: 5,
      spouseId: 'c_2nd_kazuyoshi'
    });
    } // end if (includeSampleTemplate)

    const projectObj = {
      id: projectId || 'default_project',
      title: fullTitle,
      lineageMode: String(lineageMode), // '1' | '2' | '4' | 'all'
      styleMode: String(styleMode),     // 'A' | 'B' | 'C'
      eraDisplayMode: 'wareki',         // 'wareki' | 'seireki' | 'both'
      familyCrest: 'none',
      familyMotto: '',
      rootPersonId: 'self',
      people,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    applyLineagePreset(projectObj, String(lineageMode));
    return projectObj;
  }

  /**
   * 現在の全体構図（直系尊属・傍系親族フル構成）を確認するためのサンプル家系図を生成
   */
  function createSampleProject() {
    const sample = createProjectFromWizard({
      projectId: 'sample_project',
      lineageMode: '4',
      styleMode: 'A',
      familyName: '山田',
      givenName: '太郎',
      familyKana: 'やまだ',
      givenKana: 'たろう',
      birthDate: '1985-03-15',
      birthPlace: '東京都',
      includeSampleTemplate: true
    });
    sample.title = '【見本】山田家 サンプル家系図';
    sample.isSample = true;
    sample.sampleVersion = 2;
    return sample;
  }

  /**
   * 系統モード（1系統 / 2系統 / 4系統 / 全系統）変更時に
   * 各人物ノードの isDirectLine（直系ハイライト・朱線強調フラグ）を一括設定する。
   * 設定後、ユーザーは詳細パネルの「直系ハイライト（朱線強調）」チェックボックスで
   * 個別のノード単位でも自由にON/OFFを切り替え可能。
   */
  function applyLineagePreset(project, lineageMode) {
    if (!project || !project.people) return;
    const mode = String(lineageMode || project.lineageMode || '1');
    project.lineageMode = mode;

    const set1 = new Set(['self', 'f', 'ff', 'fff', 'ffff']);
    const set2 = new Set([...set1, 'm', 'mf', 'mff', 'mfff']);
    const set4 = new Set([...set2, 'fm', 'fmf', 'fmff', 'mm', 'mmf', 'mmff']);
    const setAll = new Set([
      ...set4,
      'fffm', 'ffmm', 'ffmf', 'fmfm', 'fmmf', 'fmmm',
      'mffm', 'mfmm', 'mfmf', 'mmfm', 'mmmf', 'mmmm',
      'spouse', 'son', 'daughter'
    ]);

    Object.entries(project.people).forEach(([id, person]) => {
      if (mode === '1') {
        person.isDirectLine = set1.has(id);
      } else if (mode === '2') {
        person.isDirectLine = set2.has(id);
      } else if (mode === '4') {
        person.isDirectLine = set4.has(id);
      } else {
        person.isDirectLine = setAll.has(id) || Boolean(person.isDirectLine);
      }
    });
  }

  return {
    saveProject,
    loadProject,
    loadProjectById,
    listProjects,
    deleteProject,
    duplicateProject,
    getActiveProjectId,
    setActiveProjectId,
    createProjectFromWizard,
    createSampleProject,
    applyLineagePreset
  };
})();
