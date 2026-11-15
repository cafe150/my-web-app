/**
 * 家系図作成Webアプリケーション
 * メインアプリケーションコントローラー
 */

(function () {
  const state = {
    project: null,
    selectedPersonId: 'self',
    currentRegionTab: 'kanto',
    activeGenJump: 1,
    zoom: 0.85,
    panX: 40,
    panY: 20,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    lastRenderMetrics: { width: 1480, height: 860, genYMap: {}, nodeCoords: {} },
    undoStack: [],
    redoStack: [],
    lastTextSnapshotTime: 0,
    wizard: {
      step: 1,
      lineageMode: '1',
      styleMode: 'A',
      familyName: '田中',
      givenName: '太一',
      familyKana: 'たなか',
      givenKana: 'たいち',
      birthDate: '1985-03-15'
    }
  };

  // DOM参照ヘルパー
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function showToast(msg) {
    const t = $('#toastNotification');
    if (!t) return;
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      t.classList.add('hidden');
    }, 2600);
  }

  // ===========================================================================
  // Undo / Redo 履歴管理 ＆ 汎用確認ダイアログ
  // ===========================================================================
  const MAX_HISTORY = 30;

  function updateUndoRedoButtons() {
    const undoBtn = $('#undoBtn');
    const redoBtn = $('#redoBtn');
    if (undoBtn) undoBtn.disabled = state.undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = state.redoStack.length === 0;
  }

  function pushHistorySnapshot() {
    if (!state.project) return;
    state.undoStack.push(JSON.stringify(state.project));
    if (state.undoStack.length > MAX_HISTORY) {
      state.undoStack.shift();
    }
    state.redoStack = [];
    updateUndoRedoButtons();
  }

  function pushHistoryDebounced() {
    const now = Date.now();
    if (now - state.lastTextSnapshotTime > 800) {
      pushHistorySnapshot();
    }
    state.lastTextSnapshotTime = now;
  }

  function clearHistory() {
    state.undoStack = [];
    state.redoStack = [];
    updateUndoRedoButtons();
  }

  async function performUndo() {
    if (!state.undoStack.length) return;
    state.redoStack.push(JSON.stringify(state.project));
    state.project = JSON.parse(state.undoStack.pop());
    if (!state.project.people[state.selectedPersonId]) {
      state.selectedPersonId = state.project.rootPersonId || 'self';
    }
    await KakeizuStorage.saveProject(state.project);
    updateUndoRedoButtons();
    refreshAllUI(false);
    showToast('操作を元に戻しました');
  }

  async function performRedo() {
    if (!state.redoStack.length) return;
    state.undoStack.push(JSON.stringify(state.project));
    state.project = JSON.parse(state.redoStack.pop());
    if (!state.project.people[state.selectedPersonId]) {
      state.selectedPersonId = state.project.rootPersonId || 'self';
    }
    await KakeizuStorage.saveProject(state.project);
    updateUndoRedoButtons();
    refreshAllUI(false);
    showToast('操作をやり直しました');
  }

  let _confirmAction = null;
  function openConfirmDialog({ title = '操作の確認', message = '実行してよろしいですか？', okText = '実行する', onConfirm }) {
    $('#confirmModalTitle').textContent = title;
    $('#confirmModalMessage').textContent = message;
    $('#confirmOkBtn').textContent = okText;
    _confirmAction = onConfirm || null;
    $('#confirmModal').classList.remove('hidden');
  }

  function closeConfirmDialog() {
    $('#confirmModal').classList.add('hidden');
    _confirmAction = null;
  }

  // ===========================================================================
  // 初期化フロー
  // ===========================================================================
  async function initApp() {
    const saved = await KakeizuStorage.loadProject();
    if (saved && saved.people) {
      state.project = saved;
    } else {
      state.project = KakeizuStorage.createProjectFromWizard({
        projectId: 'default_project',
        lineageMode: '1',
        styleMode: 'A'
      });
      await KakeizuStorage.saveProject(state.project);
      // 初回起動時は導入3ステップウィザードを表示
      openWizardModal();
    }

    initFamilyCrestOptions();
    bindHeaderEvents();
    bindCanvasEvents();
    bindDrawerEvents();
    bindWizardEvents();
    bindExportEvents();
    bindSearchEvents();
    bindProjectsModalEvents();
    bindPeopleListModalEvents();
    bindTutorialEvents();
    bindConfirmAndKeyboardEvents();

    renderRegionTabs();
    refreshAllUI(true);
    updateUndoRedoButtons();
  }

  function initFamilyCrestOptions() {
    const sel = $('#editFamilyCrest');
    if (!sel || !KakeizuData.FAMILY_CRESTS) return;
    sel.innerHTML = '';
    KakeizuData.FAMILY_CRESTS.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.label;
      sel.appendChild(opt);
    });
  }

  // ===========================================================================
  // 全体UI同期・再描画
  // ===========================================================================
  function refreshAllUI(resetView = false) {
    const p = state.project;
    if (!p) return;

    // ヘッダー同期
    const titleInput = $('#treeTitleInput');
    if (titleInput && document.activeElement !== titleInput) {
      titleInput.value = p.title || '田中家 家系図';
    }

    const lineageSelect = $('#lineageModeSelect');
    if (lineageSelect) lineageSelect.value = p.lineageMode || '1';

    $$('.style-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.style === p.styleMode);
    });

    $$('.era-switch-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.eraMode === (p.eraDisplayMode || 'wareki'));
    });

    // キャンバス左下の系統ウォーターマーク更新（添付画像1の「1系統」表記等）
    const lineageLabels = {
      '1': '1系統',
      '2': '2系統',
      '4': '4系統',
      'all': '全系統'
    };
    const styleLabels = {
      'A': '様式A：先祖トーナメント型（先祖遡りツリー）',
      'B': '様式B：法務・直系軸型（親族呼称・相続関係説明図）',
      'C': '様式C：伝統家譜型（夫婦並列・点線世代区切り）'
    };
    $('#lineageWatermark').textContent = lineageLabels[p.lineageMode] || '1系統';
    $('#styleWatermarkSub').textContent = styleLabels[p.styleMode] || '';

    // 凡例ボックスを現在の様式に合わせて更新
    updateLegendBox(p.styleMode);

    // メインキャンバス描画
    const stageEl = $('#canvasStage');
    state.lastRenderMetrics = KakeizuRenderer.renderTree(p, stageEl, {
      selectedId: state.selectedPersonId,
      onSelectPerson: (personId) => {
        selectPerson(personId, true);
      },
      onQuickAddClick: (personId, btnEl) => {
        openQuickAddPopover(personId, btnEl);
      }
    });

    if (resetView) {
      fitCanvasToViewport();
    } else {
      applyCanvasTransform();
    }

    // 左サイドバー（世代ジャンプナビゲーション）更新
    renderGenerationSidebar();

    // 詳細編集パネルが開いていれば同期
    if (state.selectedPersonId && p.people[state.selectedPersonId]) {
      populateDrawerForm(p.people[state.selectedPersonId]);
    }
  }

  function updateLegendBox(styleMode) {
    const box = $('#canvasLegendBox');
    if (!box) return;
    if (styleMode === 'A') {
      box.innerHTML = `
        <div class="legend-row"><span class="legend-swatch" style="background:#b3000d;border-color:#B22D25;"></span><span>直系ハイライト系統（朱線強調）</span></div>
        <div class="legend-row"><span class="legend-swatch" style="background:#594E4A;"></span><span>先祖ノード（クリックで詳細編集・＋で追加）</span></div>
      `;
    } else if (styleMode === 'B') {
      box.innerHTML = `
        <div class="legend-row"><span class="legend-swatch" style="background:#FFFF00;"></span><span>起点（本人 0親等）</span></div>
        <div class="legend-row"><span class="legend-swatch" style="background:#D6E4F0;"></span><span>直系親族強調軸（尊属〜卑属）</span></div>
      `;
    } else {
      box.innerHTML = `
        <div class="legend-row"><span class="legend-swatch" style="background:#B8D4E8;"></span><span>夫・男性（水色）</span></div>
        <div class="legend-row"><span class="legend-swatch" style="background:#F9C2E6;"></span><span>妻・女性（桃色・カッコ内は旧姓）</span></div>
      `;
    }
  }

  // ===========================================================================
  // 左サイドバー（世代ジャンプナビゲーション & リアルタイムハイライト）
  // ===========================================================================
  function renderGenerationSidebar() {
    const listEl = $('#generationList');
    if (!listEl || !state.project) return;

    const peopleArr = Object.values(state.project.people);
    const countByGen = (g) => peopleArr.filter(p => Number(p.generation) === g && (p.familyName || p.givenName || p.roleLabel)).length;

    const genDefs = [
      { gen: 5, title: '5世（高祖父母）', desc: '4親等尊属・16スロット' },
      { gen: 4, title: '4世（曽祖父母）', desc: '3親等尊属・8スロット' },
      { gen: 3, title: '3世（祖父母）',   desc: '2親等尊属・大伯叔父母' },
      { gen: 2, title: '2世（父母）',     desc: '1親等尊属・伯叔父母' },
      { gen: 1, title: '1世（本人）',     desc: '起点本人・配偶者・兄弟' },
      { gen: 0, title: '子世代（息子・娘）', desc: '1親等卑属・甥姪' }
    ];

    if (state.project.styleMode === 'B') {
      genDefs.unshift({ gen: 7, title: '6〜7世（高祖父の祖父母）', desc: '5〜6親等尊属' });
      genDefs.push({ gen: -1, title: '孫〜仍孫世代', desc: '直系卑属（孫・曽孫・玄孫等）' });
    }

    listEl.innerHTML = '';
    genDefs.forEach(def => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `gen-jump-btn ${state.activeGenJump === def.gen ? 'active' : ''}`;
      btn.dataset.gen = String(def.gen);

      const cnt = countByGen(def.gen);
      btn.innerHTML = `
        <div class="gen-jump-main">
          <span class="gen-jump-title">${def.title}</span>
          <span class="gen-jump-desc">${def.desc}</span>
        </div>
        <span class="gen-count-badge">${cnt}名</span>
      `;

      btn.addEventListener('click', () => {
        jumpToGeneration(def.gen);
      });

      listEl.appendChild(btn);
    });
  }

  function jumpToGeneration(gen) {
    state.activeGenJump = gen;
    $$('.gen-jump-btn').forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.gen) === gen);
    });

    const viewport = $('#canvasViewport');
    const stageEl = $('#canvasStage');
    if (!viewport || !stageEl) return;

    const targetY = state.lastRenderMetrics.genYMap[gen] ?? 350;
    const viewH = viewport.clientHeight;
    const viewW = viewport.clientWidth;

    const targetPanY = viewH / 2 - (targetY + 60) * state.zoom;
    const targetPanX = (viewW - state.lastRenderMetrics.width * state.zoom) / 2;

    animateCanvasPan(targetPanX, targetPanY);
  }

  function animateCanvasPan(targetX, targetY) {
    const startX = state.panX;
    const startY = state.panY;
    const duration = 260;
    const startTime = performance.now();

    function step(now) {
      const t = Math.min(1, (now - startTime) / duration);
      const ease = 1 - Math.pow(1 - t, 3);
      state.panX = startX + (targetX - startX) * ease;
      state.panY = startY + (targetY - startY) * ease;
      applyCanvasTransform();
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /**
   * パン操作に応じて現在画面中央付近にある世代をリアルタイムハイライト
   */
  function updateActiveGenFromViewport() {
    const viewport = $('#canvasViewport');
    if (!viewport || !state.lastRenderMetrics.genYMap) return;
    const centerStageY = (viewport.clientHeight / 2 - state.panY) / state.zoom;

    let closestGen = state.activeGenJump;
    let minDiff = Infinity;
    for (const [gStr, gy] of Object.entries(state.lastRenderMetrics.genYMap)) {
      const diff = Math.abs(centerStageY - (Number(gy) + 55));
      if (diff < minDiff) {
        minDiff = diff;
        closestGen = Number(gStr);
      }
    }

    if (closestGen !== state.activeGenJump) {
      state.activeGenJump = closestGen;
      $$('.gen-jump-btn').forEach(btn => {
        btn.classList.toggle('active', Number(btn.dataset.gen) === closestGen);
      });
    }
  }

  // ===========================================================================
  // キャンバス パン・ズーム操作
  // ===========================================================================
  function applyCanvasTransform() {
    const stageEl = $('#canvasStage');
    if (!stageEl) return;
    stageEl.style.transform = `translate(${Math.round(state.panX)}px, ${Math.round(state.panY)}px) scale(${state.zoom.toFixed(3)})`;
    const zoomLabel = $('#zoomLevelDisplay');
    if (zoomLabel) zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
  }

  function fitCanvasToViewport() {
    const viewport = $('#canvasViewport');
    if (!viewport) return;
    const vw = viewport.clientWidth || 1000;
    const vh = viewport.clientHeight || 720;
    const sw = state.lastRenderMetrics.width || 1480;
    const sh = state.lastRenderMetrics.height || 860;

    // 登録人数が少ない場合（本人のみ等）は表示されているノード周辺を見やすく中央表示
    const coordsList = Object.values(state.lastRenderMetrics.nodeCoords || {});
    if (coordsList.length > 0 && coordsList.length <= 5) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      coordsList.forEach(c => {
        const w = c.w || 80;
        const h = c.h || 110;
        if (c.x < minX) minX = c.x;
        if (c.x + w > maxX) maxX = c.x + w;
        if (c.y < minY) minY = c.y;
        if (c.y + h > maxY) maxY = c.y + h;
      });
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      state.zoom = Math.max(0.75, Math.min(1.0, (vw - 80) / Math.max(420, maxX - minX + 180)));
      state.panX = vw / 2 - centerX * state.zoom;
      state.panY = vh / 2 - centerY * state.zoom;
      applyCanvasTransform();
      return;
    }

    const scaleX = (vw - 60) / sw;
    const scaleY = (vh - 60) / sh;
    state.zoom = Math.max(0.45, Math.min(1.05, Math.min(scaleX, scaleY)));

    if (state.project && state.project.styleMode === 'B') {
      // 様式Bは縦に長いため本人（中央）付近を見やすく初期表示
      state.zoom = Math.max(0.68, Math.min(0.92, scaleX));
      state.panX = (vw - sw * state.zoom) / 2;
      state.panY = 30;
    } else {
      state.panX = (vw - sw * state.zoom) / 2;
      state.panY = (vh - sh * state.zoom) / 2;
    }
    applyCanvasTransform();
  }

  function bindCanvasEvents() {
    const viewport = $('#canvasViewport');
    if (!viewport) return;

    viewport.addEventListener('mousedown', (e) => {
      if (e.target.closest('.person-node') || e.target.closest('.quick-add-popover')) return;
      closeQuickAddPopover();
      state.isDragging = true;
      state.dragStartX = e.clientX - state.panX;
      state.dragStartY = e.clientY - state.panY;
      viewport.classList.add('dragging');
    });

    window.addEventListener('mousemove', (e) => {
      if (!state.isDragging) return;
      state.panX = e.clientX - state.dragStartX;
      state.panY = e.clientY - state.dragStartY;
      applyCanvasTransform();
      updateActiveGenFromViewport();
    });

    window.addEventListener('mouseup', () => {
      if (state.isDragging) {
        state.isDragging = false;
        viewport.classList.remove('dragging');
      }
    });

    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.08 : -0.08;
      const nextZoom = Math.max(0.35, Math.min(2.0, state.zoom + delta));
      const rect = viewport.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      state.panX = mouseX - ((mouseX - state.panX) / state.zoom) * nextZoom;
      state.panY = mouseY - ((mouseY - state.panY) / state.zoom) * nextZoom;
      state.zoom = nextZoom;
      applyCanvasTransform();
      updateActiveGenFromViewport();
    }, { passive: false });
  }

  // ===========================================================================
  // ノード下部の「＋」アイコン：次世代・親族スロット即時追加ポップオーバー
  // ===========================================================================
  function openQuickAddPopover(personId, triggerBtn) {
    const pop = $('#quickAddPopover');
    if (!pop) return;
    const person = state.project.people[personId];
    const nameLabel = person ? (`${person.familyName || ''}${person.givenName || ''}`.trim() || person.roleLabel) : '選択ノード';

    $('#quickAddTargetName').textContent = `「${nameLabel}」の親族追加・編集`;
    pop.dataset.targetId = personId;

    const rect = triggerBtn.getBoundingClientRect();
    pop.style.left = `${Math.min(window.innerWidth - 220, Math.max(16, rect.left - 60))}px`;
    pop.style.top = `${Math.min(window.innerHeight - 230, rect.bottom + 8)}px`;
    pop.classList.remove('hidden');
  }

  function closeQuickAddPopover() {
    const pop = $('#quickAddPopover');
    if (pop) pop.classList.add('hidden');
  }

  function handleQuickAddRelation(basePersonId, relationType) {
    closeQuickAddPopover();
    const p = state.project;
    const base = p.people[basePersonId];
    if (!base) return;

    if (relationType === 'edit') {
      selectPerson(basePersonId, true);
      return;
    }

    // 既存の親IDが定義されている場合はそのノードを選択して編集パネルを開く
    if (relationType === 'father' && base.fatherId && p.people[base.fatherId]) {
      selectPerson(base.fatherId, true);
      showToast('父親スロットを選択しました。右側パネルで詳細を入力できます。');
      return;
    }
    if (relationType === 'mother' && base.motherId && p.people[base.motherId]) {
      selectPerson(base.motherId, true);
      showToast('母親スロットを選択しました。右側パネルで詳細を入力できます。');
      return;
    }
    if (relationType === 'spouse' && base.spouseId && p.people[base.spouseId]) {
      selectPerson(base.spouseId, true);
      showToast('配偶者スロットを選択しました。右側パネルで詳細を入力できます。');
      return;
    }

    // 新規人物ノードを生成して追加（直系トーナメント標準IDが空いていれば優先割り当て）
    pushHistorySnapshot();
    const pickPreferredSlotId = (baseId, relType, peopleMap) => {
      let candidate = null;
      if (relType === 'father') {
        candidate = baseId === 'self' ? 'f' : (/^[fm]{1,3}$/.test(baseId) ? `${baseId}f` : null);
      } else if (relType === 'mother') {
        candidate = baseId === 'self' ? 'm' : (/^[fm]{1,3}$/.test(baseId) ? `${baseId}m` : null);
      } else if (relType === 'spouse' && baseId === 'self') {
        candidate = 'spouse';
      } else if (relType === 'son' && baseId === 'self') {
        candidate = 'son';
      } else if (relType === 'daughter' && baseId === 'self') {
        candidate = 'daughter';
      } else if (relType === 'sister' && baseId === 'self') {
        candidate = 'elder_sister';
      }
      if (candidate && !peopleMap[candidate]) return candidate;
      return 'person_' + Date.now();
    };
    const newId = pickPreferredSlotId(basePersonId, relationType, p.people);
    let newGen = base.generation || 1;
    let roleLabel = '親族';
    let roleRuby = '';
    let degreeLabel = '';
    let gender = 'M';
    let fatherId = null;
    let motherId = null;
    let spouseId = null;

    if (relationType === 'father') {
      newGen = (base.generation || 1) + 1;
      roleLabel = '父';
      roleRuby = 'ちち';
      gender = 'M';
      base.fatherId = newId;
    } else if (relationType === 'mother') {
      newGen = (base.generation || 1) + 1;
      roleLabel = '母';
      roleRuby = 'はは';
      gender = 'F';
      base.motherId = newId;
    } else if (relationType === 'spouse') {
      newGen = base.generation || 1;
      roleLabel = '配偶者';
      roleRuby = 'はいぐうしゃ';
      degreeLabel = '配偶者';
      gender = base.gender === 'M' ? 'F' : 'M';
      spouseId = basePersonId;
      base.spouseId = newId;
    } else if (relationType === 'brother' || relationType === 'sister') {
      newGen = base.generation || 1;
      roleLabel = relationType === 'brother' ? '兄弟' : '姉妹';
      roleRuby = relationType === 'brother' ? 'きょうだい' : 'しまい';
      degreeLabel = '2親等';
      gender = relationType === 'brother' ? 'M' : 'F';
      fatherId = base.fatherId || null;
      motherId = base.motherId || null;
    } else if (relationType === 'son' || relationType === 'daughter') {
      newGen = (base.generation || 1) - 1;
      roleLabel = relationType === 'son' ? '息子' : '娘';
      roleRuby = relationType === 'son' ? 'むすこ' : 'むすめ';
      gender = relationType === 'son' ? 'M' : 'F';
      if (base.gender === 'M') {
        fatherId = basePersonId;
        motherId = base.spouseId || null;
      } else {
        motherId = basePersonId;
        fatherId = base.spouseId || null;
      }
    }

    p.people[newId] = {
      id: newId,
      familyName: base.familyName || '',
      givenName: '',
      maidenName: '',
      familyKana: base.familyKana || '',
      givenKana: '',
      roleLabel,
      roleRuby,
      degreeLabel,
      gender,
      generation: newGen,
      birthDate: '',
      deathDate: '',
      isDeceased: false,
      birthPlace: base.birthPlace || '',
      originKuni: base.originKuni || '',
      honsekiAddress: '',
      inheritanceStatus: 'none',
      buddhistName: '',
      tombLocation: '',
      isDirectLine: relationType === 'brother' || relationType === 'sister' ? false : Boolean(base.isDirectLine),
      lineageGroup: base.lineageGroup || 1,
      fatherId,
      motherId,
      spouseId,
      notes: '',
      isUserAdded: true
    };

    KakeizuStorage.saveProject(p);
    refreshAllUI(false);
    selectPerson(newId, true);
    showToast(`「${roleLabel}」スロットを新規追加しました`);
  }

  // ===========================================================================
  // ヘッダー・ツールバー イベント
  // ===========================================================================
  function bindHeaderEvents() {
    $('#undoBtn')?.addEventListener('click', performUndo);
    $('#redoBtn')?.addEventListener('click', performRedo);

    $('#treeTitleInput').addEventListener('input', (e) => {
      pushHistoryDebounced();
      state.project.title = e.target.value;
      KakeizuStorage.saveProject(state.project);
      const plaque = $('.style-c-title-plaque');
      if (plaque) plaque.textContent = state.project.title;
    });

    $('#lineageModeSelect').addEventListener('change', (e) => {
      pushHistorySnapshot();
      state.project.lineageMode = e.target.value;
      KakeizuStorage.applyLineagePreset(state.project, e.target.value);
      KakeizuStorage.saveProject(state.project);
      refreshAllUI(false);
      showToast(`記録系統を「${e.target.options[e.target.selectedIndex].text}」に切り替え、直系ハイライトを更新しました`);
    });

    $$('.style-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.project.styleMode = btn.dataset.style;
        KakeizuStorage.saveProject(state.project);
        refreshAllUI(true);
      });
    });

    $$('.era-switch-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.project.eraDisplayMode = btn.dataset.eraMode;
        KakeizuStorage.saveProject(state.project);
        refreshAllUI(false);
      });
    });

    $('#zoomInBtn').addEventListener('click', () => {
      state.zoom = Math.min(2.0, state.zoom + 0.12);
      applyCanvasTransform();
    });

    $('#zoomOutBtn').addEventListener('click', () => {
      state.zoom = Math.max(0.35, state.zoom - 0.12);
      applyCanvasTransform();
    });

    $('#zoomLevelDisplay').addEventListener('click', () => {
      fitCanvasToViewport();
    });

    $('#openWizardBtn').addEventListener('click', () => {
      openWizardModal();
    });

    $('#openSampleBtn')?.addEventListener('click', () => {
      openOrCreateSampleProject();
    });

    // ポップオーバー内のアクションボタン
    $$('.quick-add-item').forEach(itemBtn => {
      itemBtn.addEventListener('click', () => {
        const targetId = $('#quickAddPopover').dataset.targetId;
        const rel = itemBtn.dataset.rel;
        if (targetId && rel) {
          handleQuickAddRelation(targetId, rel);
        }
      });
    });
  }

  // ===========================================================================
  // 右側 詳細編集スライドパネル（和暦・西暦相互変換 & 地方別都道府県タイルUI）
  // ===========================================================================
  function selectPerson(personId, openDrawer = true) {
    state.selectedPersonId = personId;
    $$('.person-node').forEach(el => {
      el.classList.toggle('selected', el.dataset.personId === personId);
    });

    const person = state.project.people[personId];
    if (person) {
      populateDrawerForm(person);
      if (openDrawer) {
        $('#detailDrawer').classList.remove('closed');
      }
    }
  }

  function populateDrawerForm(person) {
    $('#drawerRoleSubtitle').textContent = `${person.roleLabel || '人物'} ${person.degreeLabel ? `（${person.degreeLabel}）` : ''}`;
    $('#drawerPersonTitle').textContent = `${person.familyName || ''}${person.givenName || ''}`.trim() || person.roleLabel || '人物情報編集';

    $('#editFamilyName').value = person.familyName || '';
    $('#editGivenName').value = person.givenName || '';
    $('#editFamilyKana').value = person.familyKana || '';
    $('#editGivenKana').value = person.givenKana || '';
    $('#editMaidenName').value = person.maidenName || '';
    $('#editRoleLabel').value = person.roleLabel || '';
    $('#editGender').value = person.gender || 'M';
    $('#editDirectLine').checked = Boolean(person.isDirectLine);
    $('#editIsDeceased').checked = Boolean(person.isDeceased || person.deathDate);
    $('#editOriginKuni').value = person.originKuni || '';
    $('#editInheritanceStatus').value = person.inheritanceStatus || 'none';
    $('#editHonsekiAddress').value = person.honsekiAddress || '';
    $('#editBuddhistName').value = person.buddhistName || '';
    $('#editTombLocation').value = person.tombLocation || '';
    $('#editNotes').value = person.notes || '';

    if ($('#editFamilyCrest')) $('#editFamilyCrest').value = state.project.familyCrest || 'none';
    if ($('#editFamilyMotto')) $('#editFamilyMotto').value = state.project.familyMotto || '';

    const setRootBtn = $('#setAsRootBtn');
    if (setRootBtn) {
      const isCurrentRoot = person.id === (state.project.rootPersonId || 'self');
      setRootBtn.disabled = isCurrentRoot;
      setRootBtn.textContent = isCurrentRoot
        ? '現在の起点人物（本人 / 被相続人）です'
        : 'この人物を起点（本人 / 被相続人）に切り替える';
    }

    // 生年月日・没年月日の西暦＆和暦双方向フィールド同期
    syncDateFieldsFromIso('birth', person.birthDate || '');
    syncDateFieldsFromIso('death', person.deathDate || '');
    updateDateWarnings(person);
    updateAgeBanner(person);
    updateMemorialScheduleUI(person);

    // 出身地（地方別タブ＆都道府県タイル選択）同期
    const pref = person.birthPlace || '';
    $('#selectedPrefBadge').textContent = pref || '未設定';
    const regionId = KakeizuData.findRegionByPref(pref || '東京都');
    state.currentRegionTab = regionId;
    renderRegionTabs();
    renderPrefectureTiles(pref);

    // 削除ボタンのラベル更新
    const delBtn = $('#deletePersonBtn');
    if (delBtn) {
      const rootId = state.project.rootPersonId || 'self';
      const canRemoveNode = person.id !== rootId && person.id !== 'self' && (Boolean(person.isUserAdded) || state.project.styleMode === 'C');
      delBtn.textContent = canRemoveNode ? 'この人物ノードを削除' : 'この人物の入力内容を削除';
    }
  }

  function syncDateFieldsFromIso(prefix, isoStr) {
    const gregYearEl = $(`#${prefix}GregYear`);
    const eraSelectEl = $(`#${prefix}EraSelect`);
    const eraYearEl = $(`#${prefix}EraYear`);
    const monthEl = $(`#${prefix}Month`);
    const dayEl = $(`#${prefix}Day`);
    const previewEl = $(`#${prefix}DatePreview`);

    if (!isoStr) {
      gregYearEl.value = '';
      eraYearEl.value = '';
      monthEl.value = '';
      dayEl.value = '';
      previewEl.textContent = '未入力（西暦または元号年のどちらからでも自動変換されます）';
      return;
    }

    const [y, m, d] = isoStr.split('-').map(Number);
    gregYearEl.value = y || '';
    monthEl.value = m || 1;
    dayEl.value = d || 1;

    const w = KakeizuData.gregorianToWareki(y, m, d);
    if (w && w.eraId !== 'seireki') {
      eraSelectEl.value = w.eraId;
      eraYearEl.value = w.eraYear;
    }

    const mode = state.project ? state.project.eraDisplayMode : 'wareki';
    previewEl.textContent = `表示表記：${KakeizuData.formatDateByMode(isoStr, mode)}`;
  }

  function updateDateWarnings(person, extraCheck = null, prefixForExtra = null) {
    const birthWarnEl = $('#birthDateWarning');
    const deathWarnEl = $('#deathDateWarning');
    if (!birthWarnEl || !deathWarnEl) return;

    const birthMsgs = [];
    const deathMsgs = [];

    if (extraCheck && prefixForExtra === 'birth') {
      birthMsgs.push(...extraCheck.errors, ...extraCheck.warnings);
    }
    if (extraCheck && prefixForExtra === 'death') {
      deathMsgs.push(...extraCheck.errors, ...extraCheck.warnings);
    }

    const orderCheck = KakeizuData.validateBirthDeathOrder(person.birthDate, person.deathDate);
    if (!orderCheck.valid && orderCheck.message) {
      deathMsgs.push(orderCheck.message);
    }

    if (birthMsgs.length) {
      birthWarnEl.textContent = birthMsgs.join(' / ');
      birthWarnEl.classList.remove('hidden');
    } else {
      birthWarnEl.classList.add('hidden');
    }

    if (deathMsgs.length) {
      deathWarnEl.textContent = deathMsgs.join(' / ');
      deathWarnEl.classList.remove('hidden');
    } else {
      deathWarnEl.classList.add('hidden');
    }
  }

  function updateMemorialScheduleUI(person) {
    const box = $('#memorialScheduleBox');
    const list = $('#memorialScheduleList');
    if (!box || !list) return;

    if (!person || !person.deathDate) {
      box.classList.add('hidden');
      list.innerHTML = '';
      return;
    }

    const items = KakeizuData.calculateMemorialSchedule(person.deathDate);
    if (!items.length) {
      box.classList.add('hidden');
      return;
    }

    box.classList.remove('hidden');
    list.innerHTML = items.map(it => {
      const cls = it.isNext ? 'next' : (it.isPast ? 'past' : '');
      const badge = it.isNext ? '【次回】' : (it.isPast ? '済' : '予定');
      return `<div class="memorial-item ${cls}"><span>${it.label}</span><span>${it.dateText}（${badge}）</span></div>`;
    }).join('');
  }

  function handleDateInputChanged(prefix, sourceType) {
    const person = state.project.people[state.selectedPersonId];
    if (!person) return;
    pushHistoryDebounced();

    const gregYearEl = $(`#${prefix}GregYear`);
    const eraSelectEl = $(`#${prefix}EraSelect`);
    const eraYearEl = $(`#${prefix}EraYear`);
    const monthEl = $(`#${prefix}Month`);
    const dayEl = $(`#${prefix}Day`);
    const previewEl = $(`#${prefix}DatePreview`);

    let y = Number(gregYearEl.value);
    const rawM = monthEl.value === '' ? 1 : Number(monthEl.value);
    const rawD = dayEl.value === '' ? 1 : Number(dayEl.value);

    const valRes = KakeizuData.validateDateInputs({
      year: y,
      month: rawM,
      day: rawD,
      eraId: eraSelectEl.value,
      eraYear: eraYearEl.value,
      sourceType
    });

    const m = Math.max(1, Math.min(12, rawM || 1));
    const d = Math.max(1, Math.min(31, rawD || 1));

    if (sourceType === 'wareki') {
      const converted = KakeizuData.warekiToGregorian(eraSelectEl.value, eraYearEl.value, m, d);
      if (converted) {
        y = converted.year;
        gregYearEl.value = y;
      }
    } else {
      if (y >= 1804) {
        const w = KakeizuData.gregorianToWareki(y, m, d);
        if (w && w.eraId !== 'seireki') {
          eraSelectEl.value = w.eraId;
          eraYearEl.value = w.eraYear;
        }
      }
    }

    if (!y || y < 1000 || valRes.errors.length > 0) {
      if (!y || y < 1000) {
        if (prefix === 'birth') person.birthDate = '';
        else person.deathDate = '';
        previewEl.textContent = '未入力';
      } else {
        previewEl.textContent = '入力値を確認してください';
      }
    } else {
      const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (prefix === 'birth') person.birthDate = iso;
      else {
        person.deathDate = iso;
        person.isDeceased = true;
        $('#editIsDeceased').checked = true;
      }
      previewEl.textContent = `表示表記：${KakeizuData.formatDateByMode(iso, state.project.eraDisplayMode)}`;
    }

    updateDateWarnings(person, valRes, prefix);
    updateAgeBanner(person);
    updateMemorialScheduleUI(person);
    saveAndRefreshNodes();
  }

  function updateAgeBanner(person) {
    const banner = $('#ageSummaryBanner');
    if (!banner) return;
    const info = KakeizuData.calculateAgeInfo(person.birthDate, person.deathDate, person.isDeceased);
    if (!info) {
      banner.textContent = '生年月日を入力すると満年齢・享年（数え年）を自動算出します';
    } else {
      banner.textContent = info.summaryText;
    }
  }

  // 4.1 出身地選択（地方別タブ＋都道府県タイル＋旧国名サジェスト）
  function renderRegionTabs() {
    const container = $('#regionTabsContainer');
    if (!container) return;
    container.innerHTML = '';

    KakeizuData.REGIONS.forEach(reg => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `region-tab-btn ${state.currentRegionTab === reg.id ? 'active' : ''}`;
      btn.textContent = reg.label;
      btn.addEventListener('click', () => {
        state.currentRegionTab = reg.id;
        renderRegionTabs();
        const currentPerson = state.project.people[state.selectedPersonId];
        renderPrefectureTiles(currentPerson ? currentPerson.birthPlace : '');
      });
      container.appendChild(btn);
    });
  }

  function renderPrefectureTiles(selectedPref) {
    const grid = $('#prefectureTilesGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const reg = KakeizuData.REGIONS.find(r => r.id === state.currentRegionTab) || KakeizuData.REGIONS[1];
    reg.prefs.forEach(pref => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `pref-tile-btn ${pref === selectedPref ? 'selected' : ''}`;
      btn.textContent = pref;
      btn.addEventListener('click', () => {
        selectPrefectureForCurrentPerson(pref);
      });
      grid.appendChild(btn);
    });
  }

  function selectPrefectureForCurrentPerson(pref, kuniName = null) {
    const person = state.project.people[state.selectedPersonId];
    if (!person) return;
    pushHistorySnapshot();
    person.birthPlace = pref;
    if (kuniName) {
      const formattedKuni = kuniName.endsWith('国') ? kuniName : `${kuniName}国`;
      person.originKuni = formattedKuni;
      if ($('#editOriginKuni')) $('#editOriginKuni').value = formattedKuni;
    }
    $('#selectedPrefBadge').textContent = pref;
    const regId = KakeizuData.findRegionByPref(pref);
    state.currentRegionTab = regId;
    renderRegionTabs();
    renderPrefectureTiles(pref);
    saveAndRefreshNodes();
  }

  function deleteSelectedPerson() {
    const targetId = state.selectedPersonId;
    const p = state.project;
    if (!p || !targetId || !p.people[targetId]) return;

    const person = p.people[targetId];
    const displayLabel = `${person.familyName || ''}${person.givenName || ''}`.trim() || person.roleLabel || '選択人物';
    const rootId = p.rootPersonId || 'self';
    const canRemoveNode = targetId !== rootId && targetId !== 'self' && (Boolean(person.isUserAdded) || p.styleMode === 'C');

    openConfirmDialog({
      title: canRemoveNode ? '人物ノードの削除確認' : '人物入力データの初期化確認',
      message: canRemoveNode
        ? `「${displayLabel}」の人物ノードを家系図から削除しますか？（元に戻すことも可能です）`
        : `「${displayLabel}」の入力データをすべて消去（初期化）しますか？`,
      okText: canRemoveNode ? '削除する' : '初期化する',
      onConfirm: () => {
        pushHistorySnapshot();
        if (canRemoveNode) {
          delete p.people[targetId];
          Object.values(p.people).forEach(other => {
            if (other.fatherId === targetId) other.fatherId = null;
            if (other.motherId === targetId) other.motherId = null;
            if (other.spouseId === targetId) other.spouseId = null;
          });
          state.selectedPersonId = rootId;
          KakeizuStorage.saveProject(p);
          refreshAllUI(false);
          selectPerson(rootId, true);
          showToast(`「${displayLabel}」の人物ノードを削除しました`);
        } else {
          person.familyName = '';
          person.givenName = '';
          person.familyKana = '';
          person.givenKana = '';
          person.maidenName = '';
          person.birthDate = '';
          person.deathDate = '';
          person.isDeceased = false;
          person.birthPlace = '';
          person.originKuni = '';
          person.honsekiAddress = '';
          person.inheritanceStatus = 'none';
          person.buddhistName = '';
          person.tombLocation = '';
          person.notes = '';
          if (targetId !== rootId && targetId !== 'self') {
            person.isDirectLine = false;
          }
          KakeizuStorage.saveProject(p);
          refreshAllUI(false);
          populateDrawerForm(person);
          showToast(`「${displayLabel}」の入力データを削除（初期化）しました`);
        }
      }
    });
  }

  function bindDrawerEvents() {
    $('#closeDrawerBtn').addEventListener('click', () => {
      $('#detailDrawer').classList.add('closed');
    });

    const delBtn = $('#deletePersonBtn');
    if (delBtn) {
      delBtn.addEventListener('click', deleteSelectedPerson);
    }

    const setRootBtn = $('#setAsRootBtn');
    if (setRootBtn) {
      setRootBtn.addEventListener('click', () => {
        const targetId = state.selectedPersonId;
        const person = state.project.people[targetId];
        if (!person) return;
        const nameLabel = `${person.familyName || ''}${person.givenName || ''}`.trim() || person.roleLabel || 'この人物';
        openConfirmDialog({
          title: '起点人物（被相続人）の切り替え',
          message: `「${nameLabel}」を起点（本人 / 被相続人）として、親族全員の世代・親等・続柄呼称を再計算しますか？`,
          okText: '切り替えて再計算',
          onConfirm: () => {
            pushHistorySnapshot();
            state.project.rootPersonId = targetId;
            KakeizuData.recalculateKinshipFromRoot(state.project.people, targetId);
            KakeizuStorage.saveProject(state.project);
            refreshAllUI(false);
            populateDrawerForm(state.project.people[targetId]);
            showToast(`起点人物を「${nameLabel}」に切り替え、親等を再計算しました`);
          }
        });
      });
    }

    const textBindings = [
      ['#editFamilyName', 'familyName'],
      ['#editGivenName', 'givenName'],
      ['#editFamilyKana', 'familyKana'],
      ['#editGivenKana', 'givenKana'],
      ['#editMaidenName', 'maidenName'],
      ['#editRoleLabel', 'roleLabel'],
      ['#editGender', 'gender'],
      ['#editOriginKuni', 'originKuni'],
      ['#editInheritanceStatus', 'inheritanceStatus'],
      ['#editHonsekiAddress', 'honsekiAddress'],
      ['#editBuddhistName', 'buddhistName'],
      ['#editTombLocation', 'tombLocation'],
      ['#editNotes', 'notes']
    ];

    textBindings.forEach(([selector, key]) => {
      const el = $(selector);
      if (!el) return;
      const evt = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(evt, () => {
        const person = state.project.people[state.selectedPersonId];
        if (!person) return;
        if (evt === 'change') pushHistorySnapshot();
        else pushHistoryDebounced();
        person[key] = el.value;
        $('#drawerPersonTitle').textContent = `${person.familyName || ''}${person.givenName || ''}`.trim() || person.roleLabel;
        saveAndRefreshNodes();
      });
    });

    $('#editFamilyCrest')?.addEventListener('change', (e) => {
      pushHistorySnapshot();
      state.project.familyCrest = e.target.value;
      saveAndRefreshNodes();
      showToast('家紋の設定を更新しました');
    });

    $('#editFamilyMotto')?.addEventListener('input', (e) => {
      pushHistoryDebounced();
      state.project.familyMotto = e.target.value;
      saveAndRefreshNodes();
    });

    $('#editDirectLine').addEventListener('change', (e) => {
      const person = state.project.people[state.selectedPersonId];
      if (!person) return;
      pushHistorySnapshot();
      person.isDirectLine = e.target.checked;
      saveAndRefreshNodes();
      const label = `${person.familyName || ''}${person.givenName || ''}`.trim() || person.roleLabel || '選択ノード';
      showToast(`「${label}」の直系ハイライト（朱線強調）を${person.isDirectLine ? 'ON' : 'OFF'}にしました`);
    });

    $('#editIsDeceased').addEventListener('change', (e) => {
      const person = state.project.people[state.selectedPersonId];
      if (!person) return;
      pushHistorySnapshot();
      person.isDeceased = e.target.checked;
      updateAgeBanner(person);
      saveAndRefreshNodes();
    });

    // 生年月日・没年月日の双方向イベント
    ['birth', 'death'].forEach(prefix => {
      $(`#${prefix}GregYear`).addEventListener('input', () => handleDateInputChanged(prefix, 'gregorian'));
      $(`#${prefix}Month`).addEventListener('input', () => handleDateInputChanged(prefix, 'gregorian'));
      $(`#${prefix}Day`).addEventListener('input', () => handleDateInputChanged(prefix, 'gregorian'));
      $(`#${prefix}EraSelect`).addEventListener('change', () => handleDateInputChanged(prefix, 'wareki'));
      $(`#${prefix}EraYear`).addEventListener('input', () => handleDateInputChanged(prefix, 'wareki'));
    });

    // 旧国名（武蔵・山城・薩摩など）サジェスト検索イベント
    const kuniInput = $('#kuniSearchInput');
    const suggestBox = $('#kuniSuggestList');
    if (kuniInput && suggestBox) {
      const renderKuniChips = (query) => {
        const matches = query
          ? KakeizuData.searchByKuniOrPref(query)
          : [
              { kuniLabel: '武蔵', pref: '東京都' },
              { kuniLabel: '相模', pref: '神奈川県' },
              { kuniLabel: '尾張', pref: '愛知県' },
              { kuniLabel: '山城', pref: '京都府' },
              { kuniLabel: '摂津', pref: '大阪府' },
              { kuniLabel: '薩摩', pref: '鹿児島県' }
            ];

        suggestBox.innerHTML = '';
        matches.slice(0, 8).forEach(m => {
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'kuni-chip';
          chip.textContent = `${m.kuniLabel} → ${m.pref}`;
          chip.addEventListener('click', () => {
            selectPrefectureForCurrentPerson(m.pref, m.kuniLabel);
            showToast(`旧国名「${m.kuniLabel}」から「${m.pref}」を選択しました`);
          });
          suggestBox.appendChild(chip);
        });
      };

      kuniInput.addEventListener('input', (e) => {
        renderKuniChips(e.target.value);
      });
      renderKuniChips('');
    }
  }

  function saveAndRefreshNodes() {
    KakeizuStorage.saveProject(state.project);
    const stageEl = $('#canvasStage');
    state.lastRenderMetrics = KakeizuRenderer.renderTree(state.project, stageEl, {
      selectedId: state.selectedPersonId,
      onSelectPerson: (personId) => selectPerson(personId, true),
      onQuickAddClick: (personId, btnEl) => openQuickAddPopover(personId, btnEl)
    });
    renderGenerationSidebar();
  }

  // ===========================================================================
  // 2. 新規作成ウィザード（3ステップ初期設定フロー）
  // ===========================================================================
  function openWizardModal() {
    state.wizard.step = 1;
    if ($('#wizFullName')) $('#wizFullName').value = '';
    if ($('#wizFullKana')) $('#wizFullKana').value = '';
    if ($('#wizBirthDate')) $('#wizBirthDate').value = '';
    if ($('#wizBirthPreview')) $('#wizBirthPreview').textContent = '和暦変換：生年月日を入力すると自動表示されます';
    updateWizardStepView();
    $('#wizardModal').classList.remove('hidden');
  }

  function closeWizardModal() {
    $('#wizardModal').classList.add('hidden');
  }

  function updateWizardStepView() {
    const s = state.wizard.step;
    $$('.step-pill').forEach(pill => {
      pill.classList.toggle('active', Number(pill.dataset.step) === s);
    });
    $$('.wizard-step-pane').forEach(pane => {
      pane.classList.toggle('hidden', Number(pane.dataset.stepPane) !== s);
    });

    $('#wizardPrevBtn').style.visibility = s === 1 ? 'hidden' : 'visible';
    $('#wizardNextBtn').textContent = s === 3 ? 'この設定で家系図を作成開始' : '次のステップへ進む →';
  }

  function bindWizardEvents() {
    $('#closeWizardBtn').addEventListener('click', closeWizardModal);

    // ステップ1：系統カード選択
    $$('[data-wizard-lineage]').forEach(card => {
      card.addEventListener('click', () => {
        state.wizard.lineageMode = card.dataset.wizardLineage;
        $$('[data-wizard-lineage]').forEach(c => c.classList.toggle('selected', c === card));
      });
    });

    // ステップ2：様式カード選択
    $$('[data-wizard-style]').forEach(card => {
      card.addEventListener('click', () => {
        state.wizard.styleMode = card.dataset.wizardStyle;
        $$('[data-wizard-style]').forEach(c => c.classList.toggle('selected', c === card));
      });
    });

    // ステップ3：起点人物の和暦・西暦プレビュー
    const updateWizardDatePreview = () => {
      const val = $('#wizBirthDate').value;
      if (!val) {
        $('#wizBirthPreview').textContent = '和暦変換：生年月日を入力すると自動表示されます';
        return;
      }
      $('#wizBirthPreview').textContent = `和暦変換：${KakeizuData.formatDateByMode(val, 'both')}`;
    };
    $('#wizBirthDate').addEventListener('input', updateWizardDatePreview);
    updateWizardDatePreview();

    $('#wizardPrevBtn').addEventListener('click', () => {
      if (state.wizard.step > 1) {
        state.wizard.step -= 1;
        updateWizardStepView();
      }
    });

    $('#wizardNextBtn').addEventListener('click', async () => {
      if (state.wizard.step < 3) {
        state.wizard.step += 1;
        updateWizardStepView();
        return;
      }

      // ステップ3完了 -> 新規プロジェクトとして作成（既存の家系図は保持）
      const fullName = ($('#wizFullName').value || '').trim();
      const nameParts = fullName ? fullName.split(/\s+/) : [];
      const familyName = nameParts[0] || '';
      const givenName = nameParts.slice(1).join('') || '';

      const fullKana = ($('#wizFullKana').value || '').trim();
      const kanaParts = fullKana ? fullKana.split(/\s+/) : [];
      const familyKana = kanaParts[0] || '';
      const givenKana = kanaParts.slice(1).join('') || '';

      const birthDate = $('#wizBirthDate').value || '';

      state.project = KakeizuStorage.createProjectFromWizard({
        projectId: 'proj_' + Date.now(),
        lineageMode: state.wizard.lineageMode,
        styleMode: state.wizard.styleMode,
        familyName,
        givenName,
        familyKana,
        givenKana,
        birthDate
      });

      await KakeizuStorage.saveProject(state.project);
      clearHistory();
      closeWizardModal();
      state.selectedPersonId = 'self';
      refreshAllUI(true);
      selectPerson('self', true);
      showToast(`${state.project.title}（様式${state.project.styleMode}）を新規作成しました`);
    });
  }

  // ===========================================================================
  // 6. 保存・エクスポートモーダル イベント
  // ===========================================================================
  function bindExportEvents() {
    $('#openExportModalBtn').addEventListener('click', () => {
      $('#exportModal').classList.remove('hidden');
    });

    $('#closeExportModalBtn').addEventListener('click', () => {
      $('#exportModal').classList.add('hidden');
    });

    $('#execPdfExportBtn').addEventListener('click', () => {
      const paperSize = $('#pdfPaperSizeSelect').value || 'A4';
      const colorMode = $('#pdfColorModeSelect').value || 'color';
      $('#exportModal').classList.add('hidden');
      KakeizuExporter.exportOfficialPdf($('#canvasStage'), state.project, { paperSize, colorMode });
    });

    $('#execPngExportBtn').addEventListener('click', () => {
      KakeizuExporter.downloadPng($('#canvasStage'), state.project);
      showToast('PNG高解像度画像を出力しました');
    });

    $('#execSvgExportBtn').addEventListener('click', () => {
      KakeizuExporter.downloadSvg($('#canvasStage'), state.project);
      showToast('ベクターSVGファイルを出力しました');
    });

    $('#execJsonExportBtn').addEventListener('click', () => {
      KakeizuExporter.exportJson(state.project);
      showToast('バックアップJSONファイルを書き出しました');
    });

    $('#jsonImportFileInput').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const imported = JSON.parse(ev.target.result);
          if (imported && imported.people) {
            openConfirmDialog({
              title: 'JSONバックアップの読み込み確認',
              message: `「${imported.title || '家系図'}」を読み込みますか？現在のプロジェクトとして保存・表示されます。`,
              okText: '読み込む',
              onConfirm: async () => {
                pushHistorySnapshot();
                if (!imported.id) imported.id = 'proj_' + Date.now();
                state.project = imported;
                state.selectedPersonId = imported.rootPersonId || 'self';
                await KakeizuStorage.saveProject(state.project);
                $('#exportModal').classList.add('hidden');
                refreshAllUI(true);
                showToast('JSONバックアップデータを読み込みました');
              }
            });
          } else {
            showToast('JSONファイルの形式が正しくありません');
          }
        } catch (err) {
          showToast('JSONの解析に失敗しました');
        }
        e.target.value = '';
      };
      reader.readAsText(file);
    });
  }

  // ===========================================================================
  // 5. 人物検索 & クイックジャンプ
  // ===========================================================================
  function focusAndSelectPerson(personId) {
    selectPerson(personId, true);
    const viewport = $('#canvasViewport');
    const coords = state.lastRenderMetrics.nodeCoords && state.lastRenderMetrics.nodeCoords[personId];
    if (viewport && coords) {
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;
      const targetPanX = vw / 2 - (coords.x + coords.w / 2) * state.zoom;
      const targetPanY = vh / 2 - (coords.y + coords.h / 2) * state.zoom;
      animateCanvasPan(targetPanX, targetPanY);
    }
  }

  function bindSearchEvents() {
    const input = $('#personSearchInput');
    const resultsBox = $('#personSearchResults');
    if (!input || !resultsBox) return;

    const renderSearchResults = (q) => {
      const query = (q || '').trim().toLowerCase();
      if (!query || !state.project) {
        resultsBox.classList.add('hidden');
        resultsBox.innerHTML = '';
        return;
      }

      const matches = Object.values(state.project.people).filter(p => {
        const haystack = [
          p.familyName,
          p.givenName,
          p.familyKana,
          p.givenKana,
          p.maidenName,
          p.roleLabel,
          p.birthPlace,
          p.originKuni,
          p.buddhistName
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(query);
      });

      resultsBox.innerHTML = '';
      if (!matches.length) {
        resultsBox.innerHTML = '<div class="search-result-item"><span class="search-result-meta">該当する人物が見つかりません</span></div>';
        resultsBox.classList.remove('hidden');
        return;
      }

      matches.slice(0, 15).forEach(p => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'search-result-item';
        const fullName = `${p.familyName || ''}${p.givenName || ''}`.trim() || '（氏名未入力）';
        item.innerHTML = `
          <span class="search-result-name">${fullName}</span>
          <span class="search-result-meta">${p.roleLabel || ''} / ${p.generation}世 ${p.birthPlace ? `/ ${p.birthPlace}` : ''}</span>
        `;
        item.addEventListener('click', () => {
          resultsBox.classList.add('hidden');
          input.value = '';
          focusAndSelectPerson(p.id);
        });
        resultsBox.appendChild(item);
      });
      resultsBox.classList.remove('hidden');
    };

    input.addEventListener('input', (e) => renderSearchResults(e.target.value));
    input.addEventListener('focus', (e) => { if (e.target.value) renderSearchResults(e.target.value); });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.sidebar-search-box')) {
        resultsBox.classList.add('hidden');
      }
    });
  }

  // ===========================================================================
  // 3. 複数家系図プロジェクト管理モーダル
  // ===========================================================================
  async function renderProjectsModalList() {
    const container = $('#projectsListContainer');
    if (!container) return;
    const list = await KakeizuStorage.listProjects();
    const activeId = state.project ? state.project.id : '';

    container.innerHTML = '';
    if (!list.length) {
      container.innerHTML = '<p style="font-size:13px;color:var(--ink-muted);">保存された家系図はありません。</p>';
      return;
    }

    list.forEach(proj => {
      const isActive = proj.id === activeId;
      const peopleCount = Object.values(proj.people || {}).filter(p => p.familyName || p.givenName).length;
      const updated = proj.updatedAt ? new Date(proj.updatedAt).toLocaleString('ja-JP') : '';
      const card = document.createElement('div');
      card.className = `project-card ${isActive ? 'active' : ''}`;
      card.innerHTML = `
        <div class="project-card-info">
          <div class="project-card-title">${proj.title || '無題の家系図'} ${isActive ? '<span style="font-size:11px;color:var(--accent-indigo);">（編集中）</span>' : ''}</div>
          <div class="project-card-meta">様式${proj.styleMode || 'A'} / ${proj.lineageMode || '1'}系統 / 登録 ${peopleCount}名 / 更新: ${updated}</div>
        </div>
        <div class="project-card-actions">
          ${!isActive ? `<button type="button" class="btn btn-sm btn-primary" data-proj-switch="${proj.id}">開く</button>` : ''}
          <button type="button" class="btn btn-sm" data-proj-dup="${proj.id}">複製</button>
          ${list.length > 1 ? `<button type="button" class="btn btn-sm btn-danger-outline" data-proj-del="${proj.id}">削除</button>` : ''}
        </div>
      `;
      container.appendChild(card);
    });

    container.querySelectorAll('[data-proj-switch]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const target = await KakeizuStorage.loadProjectById(btn.dataset.projSwitch);
        if (target) {
          state.project = target;
          state.selectedPersonId = target.rootPersonId || 'self';
          clearHistory();
          $('#projectsModal').classList.add('hidden');
          refreshAllUI(true);
          showToast(`「${target.title}」に切り替えました`);
        }
      });
    });

    container.querySelectorAll('[data-proj-dup]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const src = await KakeizuStorage.loadProjectById(btn.dataset.projDup);
        if (src) {
          const copy = await KakeizuStorage.duplicateProject(src);
          state.project = copy;
          clearHistory();
          await renderProjectsModalList();
          refreshAllUI(false);
          showToast(`「${copy.title}」を複製しました`);
        }
      });
    });

    container.querySelectorAll('[data-proj-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.projDel;
        openConfirmDialog({
          title: '家系図プロジェクトの削除',
          message: 'この家系図プロジェクトを削除しますか？この操作は元に戻せません。',
          okText: '削除する',
          onConfirm: async () => {
            await KakeizuStorage.deleteProject(targetId);
            if (state.project && state.project.id === targetId) {
              const nextProj = await KakeizuStorage.loadProject();
              if (nextProj) {
                state.project = nextProj;
                state.selectedPersonId = nextProj.rootPersonId || 'self';
                clearHistory();
                refreshAllUI(true);
              }
            }
            await renderProjectsModalList();
            showToast('家系図プロジェクトを削除しました');
          }
        });
      });
    });
  }

  async function openOrCreateSampleProject() {
    if (state.project && !state.project.isSample) {
      await KakeizuStorage.saveProject(state.project);
    }
    let sampleProj = await KakeizuStorage.loadProjectById('sample_project');
    if (!sampleProj || !sampleProj.people || sampleProj.sampleVersion !== 2) {
      sampleProj = KakeizuStorage.createSampleProject();
      await KakeizuStorage.saveProject(sampleProj);
    }
    state.project = sampleProj;
    state.selectedPersonId = sampleProj.rootPersonId || 'self';
    clearHistory();
    refreshAllUI(true);
    showToast('サンプル構図を表示しました（「家系図管理」から自分の家系図にいつでも戻せます）');
  }

  function bindProjectsModalEvents() {
    $('#openProjectsModalBtn')?.addEventListener('click', async () => {
      await renderProjectsModalList();
      $('#projectsModal').classList.remove('hidden');
    });

    $('#closeProjectsModalBtn')?.addEventListener('click', () => {
      $('#projectsModal').classList.add('hidden');
    });

    $('#projectsSampleBtn')?.addEventListener('click', async () => {
      $('#projectsModal').classList.add('hidden');
      await openOrCreateSampleProject();
    });

    $('#projectsNewWizardBtn')?.addEventListener('click', () => {
      $('#projectsModal').classList.add('hidden');
      openWizardModal();
    });
  }

  // ===========================================================================
  // 5 & 6. 人物一覧・CSV出力・法定相続分試算ガイドモーダル
  // ===========================================================================
  function renderPeopleListModal(filterText = '') {
    const p = state.project;
    if (!p) return;

    // 法定相続分試算
    const rootId = p.rootPersonId || 'self';
    const inhResult = KakeizuData.calculateLegalInheritance(p.people, rootId);
    const rankBadge = $('#inheritanceRankBadge');
    const guideEl = $('#inheritanceGuideContent');
    if (rankBadge && guideEl) {
      rankBadge.textContent = inhResult.rankLabel;
      const heirsHtml = inhResult.heirs.length
        ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;">` +
          inhResult.heirs.map(h => {
            const name = `${h.person.familyName || ''}${h.person.givenName || ''}`.trim() || h.person.roleLabel;
            return `<div style="background:#fff;border:1px solid var(--ink-border);border-radius:4px;padding:6px 10px;">
              <strong>${name}</strong>（${h.relation}）: <span style="color:var(--highlight-crimson);font-weight:700;">${h.share}</span>（約${h.percent}%）
            </div>`;
          }).join('') + `</div>`
        : '<p style="color:var(--ink-muted);margin-top:4px;">該当する法定相続人が登録されていません。</p>';

      const renouncedHtml = inhResult.renounced.length
        ? `<div style="margin-top:6px;font-size:11px;color:var(--ink-muted);">相続放棄除外：${inhResult.renounced.map(r => `${r.familyName || ''}${r.givenName || ''}`.trim() || r.roleLabel).join('、')}</div>`
        : '';

      guideEl.innerHTML = `<div>被相続人（起点）：<strong>${inhResult.rootName}</strong></div>${heirsHtml}${renouncedHtml}`;
    }

    // テーブル描画
    const tbody = $('#peopleTableBody');
    if (!tbody) return;
    const q = (filterText || '').trim().toLowerCase();
    const inhLabelMap = { none: '-', decedent: '被相続人', heir: '相続人', divided: '分割済', renounced: '相続放棄', successive: '数次相続' };

    const rows = Object.values(p.people)
      .filter(person => {
        if (!person.familyName && !person.givenName && !person.isUserAdded) return false;
        if (!q) return true;
        const text = [person.familyName, person.givenName, person.familyKana, person.givenKana, person.roleLabel, person.birthPlace, person.originKuni, person.buddhistName]
          .filter(Boolean).join(' ').toLowerCase();
        return text.includes(q);
      })
      .sort((a, b) => Number(b.generation) - Number(a.generation));

    tbody.innerHTML = '';
    rows.forEach(person => {
      const tr = document.createElement('tr');
      const fullName = `${person.familyName || ''} ${person.givenName || ''}`.trim() || '（未入力）';
      const ageInfo = KakeizuData.calculateAgeInfo(person.birthDate, person.deathDate, person.isDeceased);
      const bStr = person.birthDate ? KakeizuData.formatDateByMode(person.birthDate, p.eraDisplayMode) : '-';
      const place = [person.birthPlace, person.originKuni ? `(${person.originKuni})` : ''].filter(Boolean).join(' ') || '-';
      const bud = [person.buddhistName, person.tombLocation].filter(Boolean).join(' / ') || '-';

      tr.innerHTML = `
        <td>${person.generation}世</td>
        <td>${person.roleLabel || '-'} ${person.degreeLabel ? `<small>(${person.degreeLabel})</small>` : ''}</td>
        <td><strong>${fullName}</strong>${person.maidenName ? ` <small>(旧姓:${person.maidenName})</small>` : ''}</td>
        <td>${bStr}</td>
        <td>${ageInfo ? ageInfo.summaryText : '-'}</td>
        <td>${place}</td>
        <td>${inhLabelMap[person.inheritanceStatus || 'none'] || '-'}</td>
        <td>${bud}</td>
      `;
      tr.addEventListener('click', () => {
        $('#peopleListModal').classList.add('hidden');
        focusAndSelectPerson(person.id);
      });
      tbody.appendChild(tr);
    });
  }

  function bindPeopleListModalEvents() {
    $('#openPeopleListBtn')?.addEventListener('click', () => {
      $('#peopleTableFilterInput').value = '';
      renderPeopleListModal('');
      $('#peopleListModal').classList.remove('hidden');
    });

    $('#closePeopleListModalBtn')?.addEventListener('click', () => {
      $('#peopleListModal').classList.add('hidden');
    });

    $('#peopleTableFilterInput')?.addEventListener('input', (e) => {
      renderPeopleListModal(e.target.value);
    });

    $('#execCsvExportBtn')?.addEventListener('click', () => {
      KakeizuExporter.exportCsv(state.project);
      showToast('人物一覧CSVファイルを出力しました');
    });
  }

  // ===========================================================================
  // チュートリアルモーダル & インタラクティブ・ガイドツアー
  // ===========================================================================
  const TUTORIAL_STEPS = [
    {
      title: '1. キャンバス操作と人物選択',
      body: 'キャンバス上をドラッグすると自由に見渡せ、マウスホイールや右上の倍率コントローラーで拡大・縮小できます。人物カードをクリックすると、詳細情報の編集パネルが開きます。',
      getTarget: () => $('.person-node') || $('#canvasViewport')
    },
    {
      title: '2. 親族の追加（＋ボタン）',
      body: '人物カードの右上にある「＋」ボタンをクリックすると、父・母・配偶者・兄弟姉妹・息子・娘をワンクリックで追加できます。最初は「本人」1名から必要な家族だけを広げていけます。',
      getTarget: () => $('.person-node .node-add-trigger') || $('.person-node') || $('#canvasViewport')
    },
    {
      title: '3. 詳細編集・和暦変換・旧国検索',
      body: '右側のパネルでは氏名・ふりがな・旧姓のほか、江戸後期〜令和の和暦西暦自動変換、享年・年忌法要の計算、旧国名サジェストによる出身地選択、直系ハイライト（朱線）の個別ON/OFF、起点（被相続人）の切り替えができます。',
      onBefore: () => {
        if (state.project && state.project.people) {
          const targetId = state.selectedPersonId && state.project.people[state.selectedPersonId]
            ? state.selectedPersonId
            : (state.project.rootPersonId || 'self');
          if (state.project.people[targetId]) {
            selectPerson(targetId, false);
          }
        }
      },
      getTarget: () => $('#detailDrawer')
    },
    {
      title: '4. 3つの表示様式＆系統ハイライト',
      body: '「様式A：先祖トーナメント型」「様式B：法務・直系軸型」「様式C：伝統家譜型」を用途に合わせて切り替えられます。左の「系統」プルダウンでは1〜4系統の直系朱線強調を一括設定できます。',
      onBefore: () => {
        $('#detailDrawer')?.classList.remove('open');
      },
      getTarget: () => $('.style-tabs') || $('#lineageModeSelect')
    },
    {
      title: '5. サンプル構図で全体見本を確認',
      body: '「山田 太郎」家をモデルにした完成見本をいつでも表示できます。ご自身の家系図とは別データとして保存されるため、データが消えることはありません。',
      getTarget: () => $('#openSampleBtn')
    },
    {
      title: '6. 人物検索＆一覧・法定相続分試算',
      body: '「人物一覧・相続」から登録メンバーの絞り込み検索・CSV出力、および起点人物を被相続人とした場合の民法上の法定相続分の試算結果を確認できます。左サイドバーの世代ジャンプも便利です。',
      getTarget: () => $('#openPeopleListBtn')
    },
    {
      title: '7. 複数保存とPDF・画像・JSON出力',
      body: 'データはブラウザ内に自動保存され、「家系図管理」で複数プロジェクトを管理できます。「保存・出力」からA4/A3印刷用PDF・PNG・SVG・JSONを書き出せます（戻る/やり直しは Ctrl+Z / Ctrl+Y 対応）。',
      getTarget: () => $('#openExportModalBtn')
    }
  ];

  let tutorialTourIndex = -1;

  function openTutorialModal() {
    $('#tutorialModal')?.classList.remove('hidden');
  }

  function closeTutorialModal() {
    $('#tutorialModal')?.classList.add('hidden');
  }

  function positionTutorialStep(index) {
    const step = TUTORIAL_STEPS[index];
    if (!step) return;

    if (typeof step.onBefore === 'function') {
      step.onBefore();
    }

    const overlay = $('#tutorialOverlay');
    const ring = $('#tutorialHighlightRing');
    const pop = $('#tutorialPopover');
    if (!overlay || !ring || !pop) return;

    const targetEl = step.getTarget ? step.getTarget() : null;
    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 720;

    let rect = { left: vw / 2 - 160, top: vh / 2 - 80, right: vw / 2 + 160, bottom: vh / 2 + 80, width: 320, height: 160 };
    if (targetEl && typeof targetEl.getBoundingClientRect === 'function') {
      const r = targetEl.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        rect = r;
      }
    }

    const pad = 6;
    const hlLeft = Math.max(4, rect.left - pad);
    const hlTop = Math.max(4, rect.top - pad);
    const hlWidth = Math.min(vw - hlLeft - 4, rect.width + pad * 2);
    const hlHeight = Math.min(vh - hlTop - 4, rect.height + pad * 2);

    ring.style.left = `${Math.round(hlLeft)}px`;
    ring.style.top = `${Math.round(hlTop)}px`;
    ring.style.width = `${Math.round(hlWidth)}px`;
    ring.style.height = `${Math.round(hlHeight)}px`;

    $('#tutorialStepBadge').textContent = `${index + 1} / ${TUTORIAL_STEPS.length}`;
    $('#tutorialProgressFill').style.width = `${Math.round(((index + 1) / TUTORIAL_STEPS.length) * 100)}%`;
    $('#tutorialStepTitle').textContent = step.title;
    $('#tutorialStepBody').textContent = step.body;

    const prevBtn = $('#tutorialPrevBtn');
    const nextBtn = $('#tutorialNextBtn');
    if (prevBtn) prevBtn.disabled = index === 0;
    if (nextBtn) nextBtn.textContent = index === TUTORIAL_STEPS.length - 1 ? '完了する' : '次へ →';

    pop.classList.remove('hidden');
    const popRect = pop.getBoundingClientRect();
    const popW = popRect.width || 360;
    const popH = popRect.height || 220;
    const gap = 14;

    let popLeft = hlLeft;
    let popTop = hlTop + hlHeight + gap;

    if (popTop + popH > vh - 12) {
      // 下に収まらない場合は上に配置、上も狭ければ左または中央へ
      if (hlTop - popH - gap >= 12) {
        popTop = hlTop - popH - gap;
      } else if (hlLeft - popW - gap >= 12) {
        popLeft = hlLeft - popW - gap;
        popTop = Math.max(12, Math.min(vh - popH - 12, hlTop));
      } else {
        popTop = Math.max(12, vh - popH - 16);
      }
    }
    popLeft = Math.max(12, Math.min(vw - popW - 12, popLeft));

    pop.style.left = `${Math.round(popLeft)}px`;
    pop.style.top = `${Math.round(popTop)}px`;
  }

  function startTutorialTour() {
    closeTutorialModal();
    tutorialTourIndex = 0;
    $('#tutorialOverlay')?.classList.remove('hidden');
    $('#tutorialPopover')?.classList.remove('hidden');
    positionTutorialStep(0);
  }

  function endTutorialTour() {
    tutorialTourIndex = -1;
    $('#tutorialOverlay')?.classList.add('hidden');
    $('#tutorialPopover')?.classList.add('hidden');
  }

  function bindTutorialEvents() {
    $('#openTutorialBtn')?.addEventListener('click', openTutorialModal);
    $('#closeTutorialModalBtn')?.addEventListener('click', closeTutorialModal);
    $('#tutorialModal')?.addEventListener('click', (e) => {
      if (e.target === $('#tutorialModal')) closeTutorialModal();
    });
    $('#startInteractiveTourBtn')?.addEventListener('click', startTutorialTour);
    $('#tutorialCloseTourBtn')?.addEventListener('click', endTutorialTour);
    $('#tutorialSkipBtn')?.addEventListener('click', endTutorialTour);

    $('#tutorialPrevBtn')?.addEventListener('click', () => {
      if (tutorialTourIndex > 0) {
        tutorialTourIndex -= 1;
        positionTutorialStep(tutorialTourIndex);
      }
    });

    $('#tutorialNextBtn')?.addEventListener('click', () => {
      if (tutorialTourIndex < TUTORIAL_STEPS.length - 1) {
        tutorialTourIndex += 1;
        positionTutorialStep(tutorialTourIndex);
      } else {
        endTutorialTour();
        showToast('チュートリアルが完了しました。さっそく家系図を作成してみましょう！');
      }
    });

    window.addEventListener('resize', () => {
      if (tutorialTourIndex >= 0) {
        positionTutorialStep(tutorialTourIndex);
      }
    });
  }

  // ===========================================================================
  // 確認ダイアログ & キーボードショートカット
  // ===========================================================================
  function bindConfirmAndKeyboardEvents() {
    $('#confirmCancelBtn')?.addEventListener('click', closeConfirmDialog);
    $('#confirmCancelXBtn')?.addEventListener('click', closeConfirmDialog);
    $('#confirmOkBtn')?.addEventListener('click', async () => {
      const fn = _confirmAction;
      closeConfirmDialog();
      if (fn) await fn();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeQuickAddPopover();
        closeConfirmDialog();
        endTutorialTour();
        closeTutorialModal();
        $('#projectsModal')?.classList.add('hidden');
        $('#peopleListModal')?.classList.add('hidden');
        $('#exportModal')?.classList.add('hidden');
        return;
      }

      const tag = document.activeElement && document.activeElement.tagName;
      const isEditingText = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);
      if (isEditingText) return;

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        performUndo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault();
        performRedo();
      }
    });
  }

  window.addEventListener('DOMContentLoaded', initApp);
})();
