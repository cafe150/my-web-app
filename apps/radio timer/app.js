/**
 * SIMPLE BROADCAST TIMER
 * Simple Clock Style - Main Application Script
 */

const DEFAULT_SEGMENTS = [
  { id: 'seg-1', title: 'オープニングトーク', durationSec: 180 },
  { id: 'seg-2', title: '本日のニュース & 天気予報', durationSec: 240 },
  { id: 'seg-3', title: '特集：最新トレンド解説', durationSec: 600 },
  { id: 'seg-4', title: 'リスナーメッセージ紹介', durationSec: 480 },
  { id: 'seg-5', title: 'エンディング & 次回予告', durationSec: 180 }
];

const STORAGE_KEY_SEGMENTS = 'simple_radio_timer_segments';
const STORAGE_KEY_FONT = 'simple_radio_timer_font';
const STORAGE_KEY_FONT_SIZE = 'simple_radio_timer_font_size';

// アプリケーション状態
const state = {
  segments: [],
  currentIndex: 0,
  isRunning: false,
  remainingSeconds: 0,
  plannedSeconds: 0,
  elapsedSeconds: 0,
  lastTimestamp: null,
  animationFrameId: null,
  themeBg: '#000000',
  themeColor: '#ffffff',
  fontSize: '28'
};

// DOM要素参照
const DOM = {
  body: document.body,
  jstTime: document.getElementById('jst_time'),
  currentTitle: document.getElementById('current_title'),
  transitionArrow: document.getElementById('transition_arrow'),
  timerDisplay: document.getElementById('timer_display'),
  timerSign: document.getElementById('timer_sign'),
  timerDigits: document.getElementById('timer_digits'),
  elapsedInfo: document.getElementById('elapsed_info'),
  nextTitleDisplay: document.getElementById('next_title_display'),
  controlBar: document.getElementById('control_bar'),
  bottomDockTrigger: document.getElementById('bottomDockTrigger'),
  btnPlayPause: document.getElementById('btnPlayPause'),
  playIcon: document.getElementById('playIcon'),
  playLabel: document.getElementById('playLabel'),
  btnPrev: document.getElementById('btnPrev'),
  btnNext: document.getElementById('btnNext'),
  btnMinus1m: document.getElementById('btnMinus1m'),
  btnMinus10s: document.getElementById('btnMinus10s'),
  btnPlus10s: document.getElementById('btnPlus10s'),
  btnPlus1m: document.getElementById('btnPlus1m'),
  btnFullscreen: document.getElementById('btnFullscreen'),
  settingsBtn: document.getElementById('settings-btn'),
  modal: document.getElementById('modal'),
  modalCloseBtn: document.getElementById('modalCloseBtn'),
  fontFamilySelect: document.getElementById('font-family'),
  fontSizeInput: document.getElementById('font-size'),
  fontSizeValue: document.getElementById('font-size-value'),
  summaryTotalCount: document.getElementById('summaryTotalCount'),
  summaryTotalDuration: document.getElementById('summaryTotalDuration'),
  sheetTableBody: document.getElementById('sheetTableBody'),
  addSegmentForm: document.getElementById('addSegmentForm'),
  newSegmentTitle: document.getElementById('newSegmentTitle'),
  newSegmentMin: document.getElementById('newSegmentMin'),
  newSegmentSec: document.getElementById('newSegmentSec'),
  btnLoadSample: document.getElementById('btnLoadSample'),
  btnExportJson: document.getElementById('btnExportJson'),
  importJsonInput: document.getElementById('importJsonInput'),
  btnResetTimer: document.getElementById('btnResetTimer'),
  toastNotification: document.getElementById('toastNotification')
};

// =============================================================================
// 時間フォーマット & トースト通知
// =============================================================================
function formatTime(totalSeconds) {
  const isNegative = totalSeconds < 0;
  const absSeconds = Math.abs(Math.round(totalSeconds));
  const minutes = Math.floor(absSeconds / 60);
  const seconds = absSeconds % 60;
  return {
    sign: isNegative ? '-' : '',
    digits: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  };
}

let toastTimeout = null;
function showToast(message) {
  if (toastTimeout) clearTimeout(toastTimeout);
  DOM.toastNotification.textContent = message;
  DOM.toastNotification.classList.add('show');
  toastTimeout = setTimeout(() => {
    DOM.toastNotification.classList.remove('show');
  }, 2000);
}

// =============================================================================
// JST時計 (毎秒更新)
// =============================================================================
function updateJSTClock() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  DOM.jstTime.textContent = `${timeStr} JST`;
}

// =============================================================================
// タイマーコアエンジン
// =============================================================================
function setCurrentSegment(index, resetTime = true) {
  if (state.segments.length === 0) return;
  state.currentIndex = Math.max(0, Math.min(index, state.segments.length - 1));
  const current = state.segments[state.currentIndex];

  state.plannedSeconds = current.durationSec;
  if (resetTime) {
    state.remainingSeconds = current.durationSec;
    state.elapsedSeconds = 0;
  }
  state.lastTimestamp = performance.now();
  renderTimerUI();
}

function startTimer() {
  if (state.isRunning) return;
  state.isRunning = true;
  state.lastTimestamp = performance.now();
  DOM.playIcon.textContent = '⏸';
  DOM.playLabel.textContent = '一時停止';
  tick();
}

function pauseTimer() {
  if (!state.isRunning) return;
  state.isRunning = false;
  if (state.animationFrameId) {
    cancelAnimationFrame(state.animationFrameId);
    state.animationFrameId = null;
  }
  DOM.playIcon.textContent = '▶';
  DOM.playLabel.textContent = '再開';
}

function togglePlayPause() {
  if (state.isRunning) {
    pauseTimer();
  } else {
    startTimer();
  }
}

function tick() {
  if (!state.isRunning) return;
  const now = performance.now();
  const deltaSec = (now - state.lastTimestamp) / 1000;
  state.lastTimestamp = now;

  state.remainingSeconds -= deltaSec;
  state.elapsedSeconds += deltaSec;

  renderTimerUI();
  state.animationFrameId = requestAnimationFrame(tick);
}

function adjustTime(secondsToAdd) {
  state.remainingSeconds += secondsToAdd;
  renderTimerUI();
  const prefix = secondsToAdd > 0 ? '+' : '';
  showToast(`${prefix}${secondsToAdd}秒 調整`);
}

function nextSegment() {
  if (state.segments.length === 0) return;
  if (state.currentIndex < state.segments.length - 1) {
    setCurrentSegment(state.currentIndex + 1, true);
    showToast(`▶ 次へ: ${state.segments[state.currentIndex].title}`);
  } else {
    pauseTimer();
    showToast('すべてのコーナーが終了しました');
  }
}

function prevSegment() {
  if (state.currentIndex > 0) {
    setCurrentSegment(state.currentIndex - 1, true);
    showToast(`◀ 前へ: ${state.segments[state.currentIndex].title}`);
  }
}

// =============================================================================
// UI レンダリング (文字盤・警告色)
// =============================================================================
function renderTimerUI() {
  if (state.segments.length === 0) return;
  const current = state.segments[state.currentIndex];
  const next = state.segments[state.currentIndex + 1];

  // 1. 上部タイトル
  DOM.currentTitle.textContent = current.title;

  // 2. 下部: 次のタイトル
  if (next) {
    const nextFormatted = formatTime(next.durationSec);
    DOM.nextTitleDisplay.textContent = `次のコーナー：${next.title} (${nextFormatted.digits})`;
    DOM.transitionArrow.style.opacity = '0.7';
  } else {
    DOM.nextTitleDisplay.textContent = '次のコーナー：番組終了';
    DOM.transitionArrow.style.opacity = '0.2';
  }

  // 3. 経過時間表示
  const elapsedFormatted = formatTime(state.elapsedSeconds);
  const plannedFormatted = formatTime(state.plannedSeconds);
  DOM.elapsedInfo.textContent = `経過 ${elapsedFormatted.digits} / ${plannedFormatted.digits}`;

  // 4. 文字盤 (MM:SS / 超過マイナス)
  const remaining = state.remainingSeconds;
  const formatted = formatTime(remaining);

  DOM.timerSign.textContent = formatted.sign;
  DOM.timerDigits.textContent = formatted.digits;

  // 5. 指定段階色判定 (文字色は常に白、1分〜0秒は黄色に統一、超過は赤色)
  const root = document.documentElement;
  if (remaining < 0) {
    // 超過: 背景色 #E9524E (赤色)
    root.style.setProperty('--bg-color', 'var(--stage-overtime-bg)');
    DOM.transitionArrow.classList.add('active');
  } else if (remaining <= 60) {
    // 残り1分〜0秒: 背景色 #FEBE00 (黄色に統一)
    root.style.setProperty('--bg-color', 'var(--stage-1m-bg)');
    DOM.transitionArrow.classList.add('active');
  } else {
    // 開始時・通常時 (残り > 60秒): 背景色 #98D88F (ミントグリーン)
    root.style.setProperty('--bg-color', 'var(--stage-start-bg)');
    DOM.transitionArrow.classList.remove('active');
  }

  // 文字色・タイマー文字盤は常に白
  root.style.setProperty('--text-color', '#ffffff');
  root.style.setProperty('--timer-color', '#ffffff');
}

// =============================================================================
// 下部メニュー表示制御 (カーソル接近時のみ表示)
// =============================================================================
document.addEventListener('mousemove', (e) => {
  const triggerZone = 110;
  const isNearBottom = (window.innerHeight - e.clientY) <= triggerZone;
  const isHovered = DOM.controlBar.matches(':hover');

  if (isNearBottom || isHovered) {
    DOM.controlBar.classList.add('is-visible');
  } else {
    DOM.controlBar.classList.remove('is-visible');
  }
});

// =============================================================================
// 設定モーダル (SIMPLE CLOCK スタイル)
// =============================================================================
function openModal() {
  renderSheetTable();
  updateSheetSummary();
  DOM.modal.style.display = 'block';
}

function closeModal() {
  DOM.modal.style.display = 'none';
  renderTimerUI();
}

DOM.settingsBtn.addEventListener('click', openModal);
DOM.modalCloseBtn.addEventListener('click', closeModal);
window.addEventListener('click', (e) => {
  if (e.target === DOM.modal) closeModal();
});

// フォント変更
DOM.fontFamilySelect.addEventListener('change', (e) => {
  const val = e.target.value;
  DOM.body.className = `${val}`;
  localStorage.setItem(STORAGE_KEY_FONT, val);
});

// フォントサイズ変更
DOM.fontSizeInput.addEventListener('input', (e) => {
  const size = e.target.value;
  state.fontSize = size;
  DOM.fontSizeValue.textContent = `${size}vmin`;
  document.documentElement.style.setProperty('--timer-size', `${size}vmin`);
  localStorage.setItem(STORAGE_KEY_FONT_SIZE, size);
});

// =============================================================================
// コーナー一覧テーブル & キューシート編集
// =============================================================================
function updateSheetSummary() {
  DOM.summaryTotalCount.textContent = state.segments.length;
  const totalSec = state.segments.reduce((acc, seg) => acc + (Number(seg.durationSec) || 0), 0);
  const formatted = formatTime(totalSec);
  DOM.summaryTotalDuration.textContent = formatted.digits;
}

function renderSheetTable() {
  DOM.sheetTableBody.innerHTML = '';

  state.segments.forEach((seg, idx) => {
    const tr = document.createElement('tr');
    tr.dataset.index = idx;
    tr.draggable = true;

    if (idx === state.currentIndex) {
      tr.classList.add('active-row');
    }

    const min = Math.floor(seg.durationSec / 60);
    const sec = seg.durationSec % 60;

    tr.innerHTML = `
      <td style="text-align:center;"><span class="drag-handle">☰</span></td>
      <td>
        <input type="text" class="input-cell-title" value="${escapeHtml(seg.title)}" data-index="${idx}">
      </td>
      <td>
        <input type="number" class="input-cell-num input-min" min="0" max="999" value="${min}" data-index="${idx}"> :
        <input type="number" class="input-cell-num input-sec" min="0" max="59" value="${sec}" data-index="${idx}">
      </td>
      <td style="text-align:right;">
        <button type="button" class="btn-icon btn-jump" data-index="${idx}" title="ジャンプ">▶</button>
        <button type="button" class="btn-icon btn-del" data-index="${idx}" title="削除">✕</button>
      </td>
    `;

    DOM.sheetTableBody.appendChild(tr);
  });

  setupDragAndDrop();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

DOM.sheetTableBody.addEventListener('change', (e) => {
  const target = e.target;
  const idx = Number(target.dataset.index);
  if (isNaN(idx) || !state.segments[idx]) return;

  if (target.classList.contains('input-cell-title')) {
    state.segments[idx].title = target.value.trim() || '（無題）';
    saveSegments();
    renderTimerUI();
  } else if (target.classList.contains('input-min') || target.classList.contains('input-sec')) {
    const row = target.closest('tr');
    const min = Math.max(0, parseInt(row.querySelector('.input-min').value, 10) || 0);
    const sec = Math.max(0, Math.min(59, parseInt(row.querySelector('.input-sec').value, 10) || 0));
    state.segments[idx].durationSec = min * 60 + sec;
    saveSegments();
    updateSheetSummary();
    if (idx === state.currentIndex && !state.isRunning) {
      setCurrentSegment(idx, true);
    }
  }
});

DOM.sheetTableBody.addEventListener('click', (e) => {
  const jumpBtn = e.target.closest('.btn-jump');
  if (jumpBtn) {
    const idx = Number(jumpBtn.dataset.index);
    setCurrentSegment(idx, true);
    renderSheetTable();
    return;
  }

  const delBtn = e.target.closest('.btn-del');
  if (delBtn) {
    const idx = Number(delBtn.dataset.index);
    if (state.segments.length <= 1) {
      alert('コーナーを全て削除することはできません。');
      return;
    }
    state.segments.splice(idx, 1);
    if (state.currentIndex >= state.segments.length) {
      state.currentIndex = state.segments.length - 1;
    }
    saveSegments();
    renderSheetTable();
    updateSheetSummary();
    renderTimerUI();
  }
});

// 新規コーナー追加
DOM.addSegmentForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const title = DOM.newSegmentTitle.value.trim();
  const min = Math.max(0, parseInt(DOM.newSegmentMin.value, 10) || 0);
  const sec = Math.max(0, Math.min(59, parseInt(DOM.newSegmentSec.value, 10) || 0));
  if (!title) return;

  state.segments.push({
    id: `seg-${Date.now()}`,
    title: title,
    durationSec: min * 60 + sec || 60
  });

  DOM.newSegmentTitle.value = '';
  saveSegments();
  renderSheetTable();
  updateSheetSummary();
});

// ドラッグ＆ドロップ並べ替え
let draggedRow = null;
function setupDragAndDrop() {
  const rows = DOM.sheetTableBody.querySelectorAll('tr');
  rows.forEach(row => {
    row.addEventListener('dragstart', (e) => {
      draggedRow = row;
      e.dataTransfer.effectAllowed = 'move';
    });

    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const targetRow = e.currentTarget;
      if (targetRow && targetRow !== draggedRow) {
        const rect = targetRow.getBoundingClientRect();
        const next = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
        DOM.sheetTableBody.insertBefore(draggedRow, next ? targetRow.nextSibling : targetRow);
      }
    });

    row.addEventListener('drop', (e) => {
      e.preventDefault();
      const newSegments = [];
      const currentActiveId = state.segments[state.currentIndex]?.id;
      const rowsAfterDrop = DOM.sheetTableBody.querySelectorAll('tr');

      rowsAfterDrop.forEach(r => {
        const oldIndex = Number(r.dataset.index);
        newSegments.push(state.segments[oldIndex]);
      });

      state.segments = newSegments;
      const newActiveIdx = state.segments.findIndex(s => s.id === currentActiveId);
      state.currentIndex = newActiveIdx !== -1 ? newActiveIdx : 0;

      saveSegments();
      renderSheetTable();
      renderTimerUI();
    });
  });
}

// サンプル読込
DOM.btnLoadSample.addEventListener('click', () => {
  if (confirm('サンプル進行表を読み込みますか？')) {
    pauseTimer();
    state.segments = JSON.parse(JSON.stringify(DEFAULT_SEGMENTS));
    setCurrentSegment(0, true);
    saveSegments();
    renderSheetTable();
    updateSheetSummary();
    showToast('サンプル進行表を復元');
  }
});

// リセット
DOM.btnResetTimer.addEventListener('click', () => {
  if (confirm('先頭コーナーからリセットしますか？')) {
    pauseTimer();
    setCurrentSegment(0, true);
    renderSheetTable();
    showToast('先頭からリセット');
  }
});

// JSON保存
DOM.btnExportJson.addEventListener('click', () => {
  const exportData = {
    segments: state.segments
  };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `radio_sheet.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// JSON読込
DOM.importJsonInput.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target.result);
      if (Array.isArray(data.segments)) {
        state.segments = data.segments;
        pauseTimer();
        setCurrentSegment(0, true);
        saveSegments();
        renderSheetTable();
        updateSheetSummary();
        showToast('JSONを読み込みました');
      }
    } catch (err) {
      alert('ファイルの解析に失敗しました。');
    }
  };
  reader.readAsText(file);
});

// =============================================================================
// コントロールボタン・ショートカット
// =============================================================================
DOM.btnPlayPause.addEventListener('click', togglePlayPause);
DOM.btnNext.addEventListener('click', nextSegment);
DOM.btnPrev.addEventListener('click', prevSegment);
DOM.btnMinus1m.addEventListener('click', () => adjustTime(-60));
DOM.btnMinus10s.addEventListener('click', () => adjustTime(-10));
DOM.btnPlus10s.addEventListener('click', () => adjustTime(10));
DOM.btnPlus1m.addEventListener('click', () => adjustTime(60));

function isCurrentlyFullscreen() {
  return !!(document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement);
}

function toggleFullscreen() {
  const doc = document;
  const docEl = doc.documentElement;

  if (!isCurrentlyFullscreen()) {
    const requestMethod = docEl.requestFullscreen ||
                          docEl.webkitRequestFullscreen ||
                          docEl.mozRequestFullScreen ||
                          docEl.msRequestFullscreen;
    if (requestMethod) {
      try {
        const p = requestMethod.call(docEl);
        if (p && p.catch) {
          p.then(() => {
            showToast('全画面表示を開始');
          }).catch((err) => {
            console.warn('Fullscreen request rejected:', err);
            showToast('全画面表示が制限されています（F11キーをお使いください）');
          });
        }
      } catch (err) {
        console.warn('Fullscreen call error:', err);
      }
    } else {
      showToast('ブラウザが全画面APIに対応していません（F11キーをお使いください）');
    }
  } else {
    const exitMethod = doc.exitFullscreen ||
                       doc.webkitExitFullscreen ||
                       doc.mozCancelFullScreen ||
                       doc.msExitFullscreen;
    if (exitMethod) {
      try {
        const p = exitMethod.call(doc);
        if (p && p.catch) {
          p.then(() => {
            showToast('全画面表示を終了');
          }).catch((err) => {
            console.warn('Exit fullscreen rejected:', err);
          });
        }
      } catch (err) {
        console.warn('Exit fullscreen error:', err);
      }
    }
  }
}

function updateFullscreenIcon() {
  if (isCurrentlyFullscreen()) {
    DOM.btnFullscreen.textContent = '✕';
    DOM.btnFullscreen.title = '全画面解除 [F / Esc]';
  } else {
    DOM.btnFullscreen.textContent = '⛶';
    DOM.btnFullscreen.title = '全画面 [F]';
  }
}

['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(evt => {
  document.addEventListener(evt, updateFullscreenIcon);
});

DOM.btnFullscreen.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleFullscreen();
});

// 右上矢印のクリックで次へ進む
DOM.transitionArrow.addEventListener('click', (e) => {
  e.stopPropagation();
  nextSegment();
});

// キーボードショートカット
document.addEventListener('keydown', (e) => {
  // 入力フォーム操作中はタイマーショートカットを無効化
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

  // モーダルが開いている時のエスケープキー処理
  if (DOM.modal.style.display === 'block') {
    if (e.key === 'Escape') closeModal();
    return;
  }

  // EnterキーまたはNキーで次へ進む
  if (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.key === 'n' || e.code === 'KeyN') {
    e.preventDefault();
    nextSegment();
    return;
  }

  // Spaceキーで再生/一時停止
  if (e.code === 'Space' || e.key === ' ') {
    e.preventDefault();
    togglePlayPause();
    return;
  }

  // Pキーで前へ
  if (e.code === 'KeyP' || e.key === 'p') {
    e.preventDefault();
    prevSegment();
    return;
  }

  // Fキーで全画面
  if (e.code === 'KeyF' || e.key === 'f') {
    e.preventDefault();
    toggleFullscreen();
    return;
  }
});

// =============================================================================
// ストレージ永続化 & 初期化
// =============================================================================
function loadSavedSegments() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SEGMENTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        state.segments = parsed;
        return;
      }
    }
  } catch (err) {}
  state.segments = JSON.parse(JSON.stringify(DEFAULT_SEGMENTS));
}

function saveSegments() {
  try {
    localStorage.setItem(STORAGE_KEY_SEGMENTS, JSON.stringify(state.segments));
  } catch (err) {}
}

function init() {
  updateJSTClock();
  setInterval(updateJSTClock, 500);

  // 文字色を白に、初期背景色を開始時色(#98D88F)に設定
  document.documentElement.style.setProperty('--bg-color', 'var(--stage-start-bg)');
  document.documentElement.style.setProperty('--text-color', '#ffffff');
  document.documentElement.style.setProperty('--timer-color', '#ffffff');

  // フォント復元
  const savedFont = localStorage.getItem(STORAGE_KEY_FONT);
  if (savedFont) {
    DOM.body.className = savedFont;
    DOM.fontFamilySelect.value = savedFont;
  }

  // フォントサイズ復元
  const savedSize = localStorage.getItem(STORAGE_KEY_FONT_SIZE);
  if (savedSize) {
    state.fontSize = savedSize;
    DOM.fontSizeInput.value = savedSize;
    DOM.fontSizeValue.textContent = `${savedSize}vmin`;
    document.documentElement.style.setProperty('--timer-size', `${savedSize}vmin`);
  }

  loadSavedSegments();
  setCurrentSegment(0, true);
}

init();
