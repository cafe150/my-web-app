// 音符タイプごとの共通設定
const NOTE_CONFIG = {
    "1": { color: "#e74c3c", isLarge: false }, // ドン
    "2": { color: "#3498db", isLarge: false }, // カッ
    "3": { color: "#e74c3c", isLarge: true },  // 大ドン
    "4": { color: "#3498db", isLarge: true },  // 大カッ
    "5": { color: "#f1c40f", isLarge: false }, // 連打
    "6": { color: "#f1c40f", isLarge: true },  // 大連打
    "7": { color: "#e67e22", isLarge: false }, // 風船
    "9": { color: "#e67e22", isLarge: true }   // くすだま
};

// --- 1. 状態管理 (State) ---
const state = {
    mode: "NOTE",       // NOTE, ROLL, NUM_INPUT
    size: "SMALL",      // SMALL, LARGE
    isSnapEnabled: true,
    currentCourse: "Oni",
    currentBranch: "normal",
    zoomLevel: 1.0,
    scrollX: 0,
    basePxPerBeat: 100,
    tempCount: "",
    cursorX: 0,
    cursorY: 0,
    pendingNote: null,
    isInsideCanvas: false,
    // オーディオ関連
    audioBuffer: null,
    waveformData: null,
    audioSource: null,
    audioContext: null,
    isPlaying: false,
    playStartTime: 0,
    playStartScrollX: 0,
    playAnimationId: null,
    isContinuousMode: false,
    // 一括選択用
    isSelecting: false,
    selectStartX: 0,
    selectEndX: 0,
    selectRawStartX: 0,
    selectedMeasureRange: null, // { start: 0, end: 3 }
    selectedNotes: [],
    // 左クリックスライド選択判定用
    isLeftMouseDown: false,
    mouseDownClientX: 0,
    mouseDownClientY: 0,
    mouseDownRawWorldX: 0,
    mouseDownEvent: null,
    // 最後にアクティブだった小節番号
    lastActiveMeasureIdx: 0,
    // タッチ操作用
    touchStartX: 0,
    touchStartY: 0,
    touchStartScrollX: 0,
    touchStartTime: 0,
    isTouchScrolling: false,
    lastPinchDist: 0,
    // 右サイドバー関連
    rightSidebarTab: "visual",
    isRightSidebarCollapsed: false,
    rightSidebarWidth: "300px"
};

// --- 2. データ構造 (DataManager) ---
const createEmptyMeasure = () => ({
    signature: [4, 4],
    subdivision: 16,
    notes: { normal: [], expert: [], master: [] },
    events: [],
    // ギミック設定 (null = 変化なし/前の小節を継承)
    bpmChange: null,      // この小節からのBPM (例: 180)
    bpmChangeOffset: 0.0, // 小節内の位置 (0.0~0.99)
    scroll: null,         // HS変化 (例: 2.0)
    scrollOffset: 0.0,    // 小節内の位置 (0.0~0.99)
    gogoStart: false,     // この小節でゴーゴータイム開始
    gogoEnd: false        // この小節でゴーゴータイム終了
});

const defaultSongData = {
    header: { title: "New Song", subtitle: "", wave: "", bpm: 120, offset: 0, demostart: "" },
    courses: {
        Oni: [createEmptyMeasure(), createEmptyMeasure(), createEmptyMeasure(), createEmptyMeasure()],
        Ura: [createEmptyMeasure(), createEmptyMeasure(), createEmptyMeasure(), createEmptyMeasure()],
        Hard: [createEmptyMeasure()],
        Normal: [createEmptyMeasure()],
        Easy: [createEmptyMeasure()]
    }
};

let songData = defaultSongData;

try {
    const saved = localStorage.getItem('taikoEditorData');
    if (saved) {
        songData = JSON.parse(saved);
        if (!songData.header) songData.header = defaultSongData.header;
        if (!songData.courses) songData.courses = defaultSongData.courses;
    }
} catch (e) {
    console.error("Failed to load saved data", e);
}

// --- 履歴管理（Undo / Redo） ---
const MAX_UNDO_STACK = 40;
let undoStack = [];
let redoStack = [];

function pushHistory() {
    try {
        const snapshot = JSON.stringify(songData);
        if (undoStack.length > 0 && undoStack[undoStack.length - 1] === snapshot) {
            return;
        }
        undoStack.push(snapshot);
        if (undoStack.length > MAX_UNDO_STACK) {
            undoStack.shift();
        }
        redoStack = []; // 新たな変更でRedoスタックをクリア
        updateUndoRedoButtons();
    } catch (e) {
        console.warn("Failed to push history", e);
    }
}

function undo() {
    if (undoStack.length === 0) return;
    try {
        const currentSnapshot = JSON.stringify(songData);
        redoStack.push(currentSnapshot);
        const prevSnapshot = undoStack.pop();
        songData = JSON.parse(prevSnapshot);
        draw();
        updateStatusBar();
        updateUndoRedoButtons();
    } catch (e) {
        console.warn("Failed to undo", e);
    }
}

function redo() {
    if (redoStack.length === 0) return;
    try {
        const currentSnapshot = JSON.stringify(songData);
        undoStack.push(currentSnapshot);
        const nextSnapshot = redoStack.pop();
        songData = JSON.parse(nextSnapshot);
        draw();
        updateStatusBar();
        updateUndoRedoButtons();
    } catch (e) {
        console.warn("Failed to redo", e);
    }
}

function updateUndoRedoButtons() {
    const undoBtn = document.getElementById('btn-undo');
    const redoBtn = document.getElementById('btn-redo');
    if (undoBtn) {
        undoBtn.disabled = (undoStack.length === 0);
        undoBtn.style.opacity = (undoStack.length === 0) ? "0.35" : "1";
    }
    if (redoBtn) {
        redoBtn.disabled = (redoStack.length === 0);
        redoBtn.style.opacity = (redoStack.length === 0) ? "0.35" : "1";
    }
}

// --- 小節ジャンプ・トランスポートコントロール ---
function jumpToMeasure(mIdx) {
    const measures = songData.courses[state.currentCourse] || [];
    if (measures.length === 0) return;
    const positions = calculateMeasurePositions(measures);
    const targetIdx = Math.max(0, Math.min(positions.length - 1, mIdx));
    if (positions[targetIdx]) {
        state.scrollX = positions[targetIdx].startX;
        draw();
        updateStatusBar();
    }
}

function prevMeasure() {
    const measures = songData.courses[state.currentCourse] || [];
    const positions = calculateMeasurePositions(measures);
    let curIdx = 0;
    for (let i = 0; i < positions.length; i++) {
        if (positions[i].startX <= state.scrollX + 5) {
            curIdx = i;
        } else {
            break;
        }
    }
    jumpToMeasure(curIdx - 1);
}

function nextMeasure() {
    const measures = songData.courses[state.currentCourse] || [];
    const positions = calculateMeasurePositions(measures);
    let curIdx = 0;
    for (let i = 0; i < positions.length; i++) {
        if (positions[i].startX <= state.scrollX + 5) {
            curIdx = i;
        } else {
            break;
        }
    }
    jumpToMeasure(curIdx + 1);
}

function rewindToStart() {
    jumpToMeasure(0);
}

let saveTimeout = null;
function autoSave() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        try {
            // サイドバーのヘッダー設定も保存
            const titleEl = document.getElementById('cfg-title');
            if (titleEl) {
                songData.header.title = titleEl.value;
                songData.header.subtitle = document.getElementById('cfg-subtitle').value;
                songData.header.bpm = document.getElementById('cfg-bpm').value;
                songData.header.offset = document.getElementById('cfg-offset').value;
                songData.header.wave = document.getElementById('cfg-wave').value;
                songData.header.demostart = document.getElementById('cfg-demostart').value;
            }
            localStorage.setItem('taikoEditorData', JSON.stringify(songData));
        } catch (e) {
            console.warn("Autosave failed", e);
        }
    }, 1000);
}

// --- 3. 描画管理 (CanvasManager) ---
const canvas = document.getElementById("editor-canvas");
const ctx = canvas.getContext("2d");
const wrapper = document.getElementById("canvas-wrapper");
const JUDGE_X = 150;
const LANE_Y = 100;

function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const w = wrapper.clientWidth;
    const h = wrapper.clientHeight;

    if (w === 0 || h === 0) return;

    // キャンバスの描画バッファを高解像度に
    canvas.width = w * dpr;
    canvas.height = h * dpr;

    // CSS上のサイズはコンテナ幅に合わせる（固定pxをセットせず100%にして親の縮小を阻害しない）
    canvas.style.width = '100%';
    canvas.style.height = '100%';

    // 描画コンテキストをスケーリング（以降の描画命令はそのまま使える）
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    draw();
}
window.addEventListener('resize', resizeCanvas);

function calculateMeasurePositions(courseMeasures) {
    let currentX = 0;
    const positions = [];
    for (let i = 0; i < courseMeasures.length; i++) {
        const m = courseMeasures[i];
        const width = (m.signature[0] / m.signature[1]) * 4 * state.basePxPerBeat * state.zoomLevel;
        positions.push({ startX: currentX, width: width, measure: m });
        currentX += width;
    }
    return positions;
}

// ワールドX座標から小節インデックスを検索する
function getMeasureIndexAtWorldX(worldX, positions) {
    if (!positions || positions.length === 0) return 0;
    for (let i = 0; i < positions.length; i++) {
        const pos = positions[i];
        if (worldX >= pos.startX && worldX < pos.startX + pos.width) {
            return i;
        }
    }
    if (worldX < positions[0].startX) return 0;
    return positions.length - 1;
}

// ワールドX座標を該当小節内の 1/4（四分の一・拍単位）境界へスナップする
function snapWorldXToQuarterMeasure(worldX, positions, mode = 'round') {
    if (!positions || positions.length === 0) return worldX;
    if (worldX <= positions[0].startX) return positions[0].startX;
    const lastPos = positions[positions.length - 1];
    if (worldX >= lastPos.startX + lastPos.width) return lastPos.startX + lastPos.width;

    const mIdx = getMeasureIndexAtWorldX(worldX, positions);
    const pos = positions[mIdx];
    const relX = worldX - pos.startX;
    const step = pos.width / 4; // 1小節の1/4（四分の一）幅

    let stepIdx;
    if (mode === 'floor') {
        stepIdx = Math.floor(relX / step);
    } else if (mode === 'ceil') {
        stepIdx = Math.ceil(relX / step);
    } else {
        stepIdx = Math.round(relX / step);
    }

    stepIdx = Math.max(0, Math.min(4, stepIdx));
    return pos.startX + stepIdx * step;
}

// 連打の「長い棒」を描画する関数
function drawRollBar(startX, endX, type, isPreview = false) {
    if (startX > endX) return;

    const conf = NOTE_CONFIG[type];
    const height = (conf && conf.isLarge) ? 40 : 26;
    const y = LANE_Y - height / 2;
    const width = endX - startX;

    const baseColor = conf ? conf.color : "#f1c40f";
    ctx.save();
    if (isPreview) {
        ctx.globalAlpha = 0.4;
    }
    ctx.fillStyle = baseColor;
    ctx.fillRect(startX, y, width, height);
    ctx.restore();

    // 上下の枠線
    ctx.strokeStyle = isPreview ? "rgba(255, 255, 255, 0.4)" : "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(endX, y);
    ctx.moveTo(startX, y + height);
    ctx.lineTo(endX, y + height);
    ctx.stroke();
}

function ensureEnoughMeasures() {
    const measures = songData.courses[state.currentCourse];
    let totalWidth = 0;
    for (const m of measures) {
        totalWidth += (m.signature[0] / m.signature[1]) * 4 * state.basePxPerBeat * state.zoomLevel;
    }
    const visibleRightEdge = state.scrollX + wrapper.clientWidth;
    while (totalWidth < visibleRightEdge + 1000) {
        const newMeasure = createEmptyMeasure();
        measures.push(newMeasure);
        totalWidth += (newMeasure.signature[0] / newMeasure.signature[1]) * 4 * state.basePxPerBeat * state.zoomLevel;
    }
}

function updateStatusBar() {
    const measures = songData.courses[state.currentCourse];
    const positions = calculateMeasurePositions(measures);
    const snap = getSnapPosition(state.cursorX, positions);

    // レーンに近い場合（灰色のプレビュー音符が出る範囲）のみ小節情報を更新し、
    // 離れた場合は最後にいた小節を維持する
    if (Math.abs(state.cursorY - LANE_Y) <= 80 && snap.measureIdx !== -1) {
        state.lastActiveMeasureIdx = snap.measureIdx;
    }

    const measureIdx = state.lastActiveMeasureIdx;
    const measureDisplay = measureIdx >= 0 ? measureIdx + 1 : "-";

    const modeJa = { NOTE: "音符", ROLL: "連打", NUM_INPUT: "打数入力", ROLL_END: "連打終了待ち" };
    const sizeJa = { SMALL: "小", LARGE: "大" };

    // 現在の小節の分音符を取得
    let subdivInfo = "";
    if (measureIdx >= 0 && measureIdx < measures.length) {
        const m = measures[measureIdx];
        subdivInfo = ` | ${m.subdivision}分`;
    }

    document.getElementById('status-timeline').innerText = `小節: ${measureDisplay}`;
    document.getElementById('status-mode').innerText = `モード: ${modeJa[state.mode] || state.mode} | サイズ: ${sizeJa[state.size] || state.size} | スナップ: ${state.isSnapEnabled ? 'ON' : 'OFF'}${subdivInfo}`;
}

function draw() {
    autoSave();
    ensureEnoughMeasures();
    const cw = wrapper.clientWidth;
    const ch = wrapper.clientHeight;
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, cw, ch);

    // レーン背景
    ctx.fillStyle = "#333";
    ctx.fillRect(0, LANE_Y - 40, cw, 80);

    // 波形表示
    drawWaveform();

    const measures = songData.courses[state.currentCourse];
    const positions = calculateMeasurePositions(measures);

    // 【重要】画面外の音符も含めてすべての音符の絶対X座標を計算する（連打の開始点を逃さないため）
    const allNotes = [];
    positions.forEach((pos, mIdx) => {
        const drawX = JUDGE_X + pos.startX - state.scrollX;
        const gridSpacing = pos.width / pos.measure.subdivision;
        const notes = pos.measure.notes[state.currentBranch];
        notes.forEach(note => {
            allNotes.push({ ...note, measureIdx: mIdx, absX: drawX + (note.posIndex * gridSpacing) });
        });
    });
    // 時間順（小節・位置順）にソート
    allNotes.sort((a, b) => {
        if (a.measureIdx !== b.measureIdx) return a.measureIdx - b.measureIdx;
        return a.posIndex - b.posIndex;
    });

    // --- 連打（黄色い棒）の描画 ---
    let activeRoll = null;
    allNotes.forEach(note => {
        if (note.type === "5" || note.type === "6" || note.type === "7" || note.type === "9") {
            activeRoll = { x: note.absX, type: note.type }; // 連打開始
        } else if (note.type === "8" && activeRoll) {
            drawRollBar(activeRoll.x, note.absX, activeRoll.type); // 終了が来たら棒を描画
            activeRoll = null;
        }
    });

    // 連打入力・終了待ち状態ならカーソル（またはスナップ位置）までプレビューを描画
    if (activeRoll && (state.mode === "ROLL" || state.mode === "ROLL_END")) {
        const snap = getSnapPosition(state.cursorX, positions);
        const endX = (snap && snap.exactX !== undefined) ? snap.exactX : state.cursorX;
        if (endX >= activeRoll.x) {
            drawRollBar(activeRoll.x, endX, activeRoll.type, true);
        }
    }

    // --- グリッド線の描画（画面内のみ） ---
    let isInGogo = false;
    positions.forEach((pos, mIdx) => {
        const drawX = JUDGE_X + pos.startX - state.scrollX;

        // 画面外でもゴーゴー状態を追跡
        if (drawX + pos.width < 0 || drawX > wrapper.clientWidth) {
            if (pos.measure.gogoStart !== false) isInGogo = true;
            if (pos.measure.gogoEnd !== false) isInGogo = false;
            return;
        }

        // ゴーゴータイム中のレーン背景ハイライト
        if (pos.measure.gogoStart !== false) isInGogo = true;

        let highlightStartX = drawX;
        let highlightWidth = pos.width;

        if (pos.measure.gogoStart !== false) {
            highlightStartX = drawX + (pos.width * pos.measure.gogoStart);
            highlightWidth = pos.width - (pos.width * pos.measure.gogoStart);
        }
        if (pos.measure.gogoEnd !== false) {
            const endX = drawX + (pos.width * pos.measure.gogoEnd);
            highlightWidth = endX - highlightStartX;
        }

        if (isInGogo || pos.measure.gogoStart !== false) {
            ctx.fillStyle = "rgba(243, 156, 18, 0.15)";
            if (highlightWidth > 0) {
                ctx.fillRect(highlightStartX, LANE_Y - 50, highlightWidth, 100);
            }
        }

        if (pos.measure.gogoEnd !== false) isInGogo = false;

        const gridSpacing = pos.width / pos.measure.subdivision;
        for (let i = 0; i < pos.measure.subdivision; i++) {
            const lineX = drawX + (i * gridSpacing);
            ctx.beginPath();
            ctx.moveTo(lineX, LANE_Y - 40);
            ctx.lineTo(lineX, LANE_Y + 40);
            ctx.strokeStyle = (i === 0) ? "#fff" : (i % (pos.measure.subdivision / pos.measure.signature[0]) === 0) ? "#888" : "#444";
            ctx.lineWidth = (i === 0) ? 2 : 1;
            ctx.stroke();

            // 小節番号と細分数の表示 (小節先頭の上部)
            if (i === 0) {
                ctx.fillStyle = "#888";
                ctx.font = "bold 10px sans-serif";
                ctx.textAlign = "left";
                let mLabel = `${mIdx + 1}`;
                if (pos.measure.subdivision !== 16) {
                    mLabel += ` [${pos.measure.subdivision}分]`;
                }
                ctx.fillText(mLabel, lineX + 3, LANE_Y - 44);
            }
        }

        // --- ギミックマーカーの描画 ---
        const hasGimmick = pos.measure.bpmChange !== null || pos.measure.scroll !== null || pos.measure.gogoStart !== false || pos.measure.gogoEnd !== false;
        if (hasGimmick) {
            let markerY = LANE_Y - 55;
            ctx.font = "bold 11px sans-serif";
            ctx.textAlign = "left";

            // 三角インジケーター（先頭用）
            const drawTriangle = (x) => {
                ctx.beginPath();
                ctx.moveTo(x, LANE_Y - 42);
                ctx.lineTo(x + 6, LANE_Y - 48);
                ctx.lineTo(x, LANE_Y - 54);
                ctx.fillStyle = "#f39c12";
                ctx.fill();
            };

            if (pos.measure.bpmChange !== null) {
                const markerX = drawX + (pos.width * (pos.measure.bpmChangeOffset || 0));
                ctx.fillStyle = "#e74c3c";
                ctx.fillText(`♩${pos.measure.bpmChange}`, markerX + 2, markerY);
                drawTriangle(markerX);
                markerY -= 14;
            }
            if (pos.measure.scroll !== null) {
                const markerX = drawX + (pos.width * (pos.measure.scrollOffset || 0));
                ctx.fillStyle = "#3498db";
                ctx.fillText(`HS${pos.measure.scroll}x`, markerX + 2, markerY);
                drawTriangle(markerX);
                markerY -= 14;
            }
            // 拍子がデフォルト(4/4)と異なる場合
            if (pos.measure.signature[0] !== 4 || pos.measure.signature[1] !== 4) {
                ctx.fillStyle = "#2ecc71";
                ctx.fillText(`${pos.measure.signature[0]}/${pos.measure.signature[1]}`, drawX + 2, markerY);
                drawTriangle(drawX);
            }

            // ゴーゴーマーカーはオフセットを考慮
            if (pos.measure.gogoStart !== false) {
                const markerX = drawX + (pos.width * pos.measure.gogoStart);
                ctx.fillStyle = "#f39c12";
                ctx.fillText("🔥GO!", markerX + 2, LANE_Y - 55);
                drawTriangle(markerX);
            }
            if (pos.measure.gogoEnd !== false) {
                const markerX = drawX + (pos.width * pos.measure.gogoEnd);
                ctx.fillStyle = "#95a5a6";
                ctx.fillText("⏹END", markerX + 2, LANE_Y - 69);
                drawTriangle(markerX);
            }
        }
    });

    // --- 音符（丸）の描画（画面内のみ） ---
    allNotes.forEach(note => {
        if (note.absX >= -50 && note.absX <= wrapper.clientWidth + 50) {
            const isSelected = state.selectedNotes && state.selectedNotes.some(sn => sn.measureIdx === note.measureIdx && sn.gridIdx === note.posIndex);
            drawNote(note.absX, LANE_Y, note.type, note.val, isSelected);
        }
    });

    // 判定枠
    ctx.beginPath();
    ctx.arc(JUDGE_X, LANE_Y, 30, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 4;
    ctx.stroke();

    // スナップガイド
    if (state.mode !== "NUM_INPUT") {
        drawCursorGuide(positions);
    }

    // --- 選択範囲の矩形描画 ---
    const minWorldX = Math.min(state.selectStartX, state.selectEndX);
    const maxWorldX = Math.max(state.selectStartX, state.selectEndX);
    const isRangeActive = state.isSelecting || (state.selectedMeasureRange && minWorldX !== maxWorldX) || (state.selectedNotes.length > 0 && minWorldX !== maxWorldX);

    if (isRangeActive && minWorldX !== maxWorldX) {
        const drawStartX = JUDGE_X + minWorldX - state.scrollX;
        const drawWidth = maxWorldX - minWorldX;

        ctx.fillStyle = "rgba(52, 152, 219, 0.22)";
        ctx.fillRect(drawStartX, LANE_Y - 50, drawWidth, 100);
        ctx.strokeStyle = "rgba(52, 152, 219, 0.85)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(drawStartX, LANE_Y - 50, drawWidth, 100);

        // 選択された小節範囲のガイドバッジ
        if (state.selectedMeasureRange) {
            const sM = state.selectedMeasureRange.start + 1;
            const eM = state.selectedMeasureRange.end + 1;
            const label = sM === eM ? `第 ${sM} 小節` : `第 ${sM} 〜 ${eM} 小節 (${eM - sM + 1}小節)`;
            ctx.fillStyle = "#3498db";
            ctx.font = "bold 11px sans-serif";
            ctx.textAlign = "left";
            ctx.fillText(`📐 ${label} [Mキーで変更]`, Math.max(10, drawStartX + 4), LANE_Y - 56);
        }
    }
    updateRightSidebarPreview();
}

function drawNote(x, y, type, val, isSelected = false) {
    if (type === "8") return;

    const conf = NOTE_CONFIG[type];
    if (!conf) return;

    const radius = conf.isLarge ? 30 : 20;
    const color = conf.color;

    // 選択状態のハイライト
    if (isSelected) {
        ctx.beginPath();
        ctx.arc(x, y, radius + 6, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(52, 152, 219, 0.6)";
        ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();

    if (val) {
        ctx.fillStyle = "#fff";
        ctx.font = "14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(val, x, y + 5);
    }
}

function drawCursorGuide(positions) {
    if (Math.abs(state.cursorY - LANE_Y) > 80) return; // レーンから遠い場合は追尾しない

    const { measureIdx, exactX } = getSnapPosition(state.cursorX, positions);
    if (measureIdx === -1) return;

    ctx.beginPath();
    ctx.arc(exactX, LANE_Y, state.size === "LARGE" ? 30 : 20, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 2;
    ctx.stroke();
}

function getSnapPosition(mouseX, positions) {
    const worldX = mouseX + state.scrollX - JUDGE_X;
    for (let i = 0; i < positions.length; i++) {
        const pos = positions[i];
        if (worldX >= pos.startX && worldX < pos.startX + pos.width) {
            const localX = worldX - pos.startX;
            const gridSpacing = pos.width / pos.measure.subdivision;
            let snappedIdx = 0;
            let exactX = mouseX;

            if (state.isSnapEnabled) {
                snappedIdx = Math.round(localX / gridSpacing);
                if (snappedIdx >= pos.measure.subdivision) {
                    // スナップ結果が小節の終端に達した場合、次の小節の先頭として扱う（空白空きバグ対策）
                    if (i + 1 < positions.length) {
                        return { measureIdx: i + 1, gridIdx: 0, exactX: JUDGE_X + positions[i + 1].startX - state.scrollX };
                    } else {
                        snappedIdx = pos.measure.subdivision - 1;
                        exactX = JUDGE_X + pos.startX + (snappedIdx * gridSpacing) - state.scrollX;
                    }
                } else {
                    exactX = JUDGE_X + pos.startX + (snappedIdx * gridSpacing) - state.scrollX;
                }
            } else {
                snappedIdx = localX / gridSpacing;
            }
            return { measureIdx: i, gridIdx: snappedIdx, exactX };
        }
    }
    return { measureIdx: -1, gridIdx: -1, exactX: mouseX };
}

// --- 5. 操作系 (InputManager) ---
const sidebar = document.getElementById('sidebar');
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const resizer = document.getElementById('sidebar-resizer');
let isResizing = false;

// モバイルメニューの開閉
mobileMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    sidebar.classList.toggle('open');
});

// 画面のどこかをクリックした時にサイドバーを閉じる（モバイル用）
window.addEventListener('mousedown', (e) => {
    if (window.innerWidth <= 768 && sidebar.classList.contains('open')) {
        if (!sidebar.contains(e.target) && e.target !== mobileMenuBtn) {
            sidebar.classList.remove('open');
        }
    }
});

// ツール・入力モードの管理
let currentTool = "1";
let isDraggingRoll = false;
let rollDragStartX = 0;
let rollStartInfo = null; // 連打の開始位置 { measureIdx, gridIdx, type }

// --- 全機能ショートカット管理 ---
const SHORTCUTS_STORAGE_KEY = 'taikoEditorCustomShortcuts';

const DEFAULT_SHORTCUTS = {
    don: ['j', 'f'],
    ka: ['k', 'd'],
    bigDon: ['3'],
    bigKa: ['4'],
    roll: ['5', 'r'],
    bigRoll: ['6'],
    balloon: ['7'],
    rollEnd: ['8', 'e'],
    del: ['0', 'backspace', 'delete', 'space', ' '],
    continuous: ['c'],
    quickMeas: ['m', 's'],
    gimmick: ['g'],
    undo: ['ctrl+z'],
    redo: ['ctrl+y'],
    play: ['enter'],
    prevMeas: ['arrowleft'],
    nextMeas: ['arrowright'],
    rewind: ['home'],
    jumpEnd: ['end'],
    guide: ['?', 'f1']
};

let shortcuts = JSON.parse(JSON.stringify(DEFAULT_SHORTCUTS));

function loadShortcuts() {
    try {
        const saved = localStorage.getItem(SHORTCUTS_STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            Object.keys(DEFAULT_SHORTCUTS).forEach(key => {
                if (Array.isArray(parsed[key]) && parsed[key].length > 0) {
                    shortcuts[key] = parsed[key].map(s => s.trim().toLowerCase());
                }
            });
        }
    } catch (e) {
        console.warn("Failed to load shortcuts from localStorage", e);
    }
}

function saveShortcuts() {
    try {
        localStorage.setItem(SHORTCUTS_STORAGE_KEY, JSON.stringify(shortcuts));
    } catch (e) {
        console.warn("Failed to save shortcuts to localStorage", e);
    }
}

// キー配列を表示用文字列（例: "J/F", "Space/0"）にフォーマット
function formatShortcutKeys(keyArr) {
    if (!keyArr || keyArr.length === 0) return '';
    const seen = new Set();
    const formatted = [];
    keyArr.forEach(k => {
        let display = k;
        if (display === ' ' || display === 'space') display = 'Space';
        else if (display === 'arrowleft') display = '←';
        else if (display === 'arrowright') display = '→';
        else if (display === 'enter') display = 'Enter';
        else if (display === 'backspace') display = 'BS';
        else if (display === 'delete') display = 'Del';
        else if (display.length === 1) display = display.toUpperCase();
        else if (display.startsWith('ctrl+')) display = 'Ctrl+' + display.slice(5).toUpperCase();

        if (!seen.has(display.toLowerCase())) {
            seen.add(display.toLowerCase());
            formatted.push(display);
        }
    });
    return formatted.join('/');
}

// キーイベントとのマッチング判定
function matchesShortcut(e, keyArr) {
    if (!keyArr || keyArr.length === 0) return false;
    const k = e.key.toLowerCase();
    for (const pattern of keyArr) {
        const p = pattern.toLowerCase();
        if (p === 'ctrl+z') {
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && k === 'z') return true;
        } else if (p === 'ctrl+y') {
            if ((e.ctrlKey || e.metaKey) && k === 'y') return true;
        } else if (p === 'space' || p === ' ') {
            if (e.key === ' ' || e.code === 'Space') return true;
        } else if (p === 'backspace') {
            if (e.key === 'Backspace') return true;
        } else if (p === 'delete') {
            if (e.key === 'Delete') return true;
        } else if (p === 'enter') {
            if (e.key === 'Enter') return true;
        } else if (p === 'home') {
            if (e.key === 'Home') return true;
        } else if (p === 'end') {
            if (e.key === 'End') return true;
        } else if (p === 'arrowleft') {
            if (e.key === 'ArrowLeft') return true;
        } else if (p === 'arrowright') {
            if (e.key === 'ArrowRight') return true;
        } else if (p === 'f1') {
            if (e.key === 'F1') return true;
        } else if (p === '?') {
            if (e.key === '?' || (e.shiftKey && e.key === '/')) return true;
        } else {
            if (k === p) return true;
        }
    }
    return false;
}

// 下部ボタン・ヘッダーボタン・操作ガイドの表記を動的に更新
function applyShortcutLabels() {
    // 1. 下部ボタンの表記更新
    const setBtnText = (id, iconTitle, keys) => {
        const btn = document.getElementById(id);
        if (btn) {
            const formatted = formatShortcutKeys(keys);
            btn.textContent = formatted ? `${iconTitle}(${formatted})` : iconTitle;
        }
    };
    setBtnText('btn-tool-don', '🔴 ドン', shortcuts.don);
    setBtnText('btn-tool-kat', '🔵 カッ', shortcuts.ka);
    setBtnText('btn-tool-big-don', '🟠 大ドン', shortcuts.bigDon);
    setBtnText('btn-tool-big-kat', '🔷 大カッ', shortcuts.bigKa);
    setBtnText('btn-tool-roll', '🟡 連打', shortcuts.roll);
    setBtnText('btn-tool-big-roll', '🟡 大連打', shortcuts.bigRoll);
    setBtnText('btn-tool-balloon', '🎈 風船', shortcuts.balloon);
    setBtnText('btn-tool-rest', '⬜ 休符/削除', shortcuts.del);
    setBtnText('btn-continuous', '🔄 連続配置', shortcuts.continuous);
    setBtnText('btn-gimmick', '⚙ ギミック設定', shortcuts.gimmick);

    // 2. ヘッダーボタンの表記・tooltip更新
    const playBtn = document.getElementById('btn-play');
    if (playBtn) {
        const playKey = formatShortcutKeys(shortcuts.play) || 'Enter';
        playBtn.textContent = `▶ 再生 (${playKey})`;
        playBtn.title = `再生 / 停止 (${playKey})`;
    }
    const setTooltip = (id, label, keys) => {
        const el = document.getElementById(id);
        if (el) {
            const formatted = formatShortcutKeys(keys);
            el.title = formatted ? `${label} (${formatted})` : label;
        }
    };
    setTooltip('btn-rewind', '先頭小節へ移動', shortcuts.rewind);
    setTooltip('btn-prev-measure', '前の小節へ移動', shortcuts.prevMeas);
    setTooltip('btn-next-measure', '次の小節へ移動', shortcuts.nextMeas);
    setTooltip('btn-undo', '元に戻す', shortcuts.undo);
    setTooltip('btn-redo', 'やり直す', shortcuts.redo);
    setTooltip('btn-guide', '操作ガイド・マニュアルを開く', shortcuts.guide);

    // 3. 操作ガイドモーダル内のショートカット表を動的更新
    const updateGuideCell = (selector, keyArr) => {
        document.querySelectorAll(selector).forEach(el => {
            const keysStr = formatShortcutKeys(keyArr);
            if (keysStr) {
                el.innerHTML = keysStr.split('/').map(k => `<kbd>${k}</kbd>`).join(' / ');
            }
        });
    };
    updateGuideCell('[data-guide-sc="don"]', shortcuts.don);
    updateGuideCell('[data-guide-sc="ka"]', shortcuts.ka);
    updateGuideCell('[data-guide-sc="bigDon"]', shortcuts.bigDon);
    updateGuideCell('[data-guide-sc="bigKa"]', shortcuts.bigKa);
    updateGuideCell('[data-guide-sc="bigDonKa"]', [...shortcuts.bigDon, ...shortcuts.bigKa]);
    updateGuideCell('[data-guide-sc="roll"]', shortcuts.roll);
    updateGuideCell('[data-guide-sc="bigRoll"]', shortcuts.bigRoll);
    updateGuideCell('[data-guide-sc="balloon"]', shortcuts.balloon);
    updateGuideCell('[data-guide-sc="rollEtc"]', [...shortcuts.roll, ...shortcuts.bigRoll, ...shortcuts.balloon]);
    updateGuideCell('[data-guide-sc="delete"]', shortcuts.del);
    updateGuideCell('[data-guide-sc="continuous"]', shortcuts.continuous);
    updateGuideCell('[data-guide-sc="undo"]', shortcuts.undo);
    updateGuideCell('[data-guide-sc="redo"]', shortcuts.redo);
    updateGuideCell('[data-guide-sc="play"]', shortcuts.play);
    updateGuideCell('[data-guide-sc="prevNext"]', [...shortcuts.prevMeas, ...shortcuts.nextMeas]);
    updateGuideCell('[data-guide-sc="homeEnd"]', [...shortcuts.rewind, ...shortcuts.jumpEnd]);
    updateGuideCell('[data-guide-sc="quickMeas"]', shortcuts.quickMeas);
    updateGuideCell('[data-guide-sc="gimmick"]', shortcuts.gimmick);
    updateGuideCell('[data-guide-sc="guide"]', shortcuts.guide);
}

// 起動時に保存済みショートカットをロードしてUIに反映
loadShortcuts();
applyShortcutLabels();

function setActiveTool(key) {
    currentTool = key;
    document.querySelectorAll('.tool-btn').forEach(b => {
        if (b.dataset.key === key) b.classList.add('active-tool');
        else b.classList.remove('active-tool');
    });
}

document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        if (!key) return; // エクスポートボタン等を除外
        setActiveTool(key);

        rollStartInfo = null;
        isDraggingRoll = false;

        if (key === '1' || key === '2' || key === '0' || key.startsWith('tpl_')) { state.mode = "NOTE"; state.size = "SMALL"; }
        if (key === '3' || key === '4') { state.mode = "NOTE"; state.size = "LARGE"; }
        if (key === '5') { state.mode = "ROLL"; state.size = "SMALL"; }
        if (key === '6') { state.mode = "ROLL"; state.size = "LARGE"; }
        if (key === '7') { state.mode = "NUM_INPUT"; state.size = "SMALL"; }

        updateStatusBar();
        draw();
    });
});

// --- 難易度タブ切り替え ---
document.querySelectorAll('#course-tabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const course = tab.dataset.course;
        if (!course || course === state.currentCourse) return;

        state.currentCourse = course;
        state.scrollX = 0;

        // アクティブスタイルの切り替え
        document.querySelectorAll('#course-tabs .tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        draw();
        updateStatusBar();
    });
});

// --- 分岐ボタン切り替え ---
document.querySelectorAll('.branch-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const branch = btn.dataset.branch;
        if (!branch || branch === state.currentBranch) return;

        state.currentBranch = branch;

        // アクティブスタイルの切り替え
        document.querySelectorAll('.branch-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        draw();
        updateStatusBar();
    });
});

// --- 右サイドバー関連の操作ロジック ---
const rightSidebar = document.getElementById('right-sidebar');
const rightResizer = document.getElementById('right-sidebar-resizer');
const rightSidebarToggle = document.getElementById('right-sidebar-toggle');
const rightSidebarOpenBtn = document.getElementById('right-sidebar-open-btn');
let isRightResizing = false;

// タブ切り替え
document.querySelectorAll('.right-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        if (!tab || tab === state.rightSidebarTab) return;

        state.rightSidebarTab = tab;

        // ボタンのアクティブ切り替え
        document.querySelectorAll('.right-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // コンテンツのアクティブ切り替え
        document.querySelectorAll('.right-tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(`right-tab-${tab}`).classList.add('active');

        // プレビューの更新
        updateRightSidebarPreview();
    });
});

// サイドバーを閉じる
function closeRightSidebar() {
    state.isRightSidebarCollapsed = true;

    // 現在の幅を記憶 (有効な幅であれば)
    const currentW = rightSidebar.getBoundingClientRect().width;
    if (currentW >= 150) {
        state.rightSidebarWidth = Math.round(currentW) + 'px';
    }

    rightSidebar.style.width = '0px';
    rightSidebar.style.minWidth = '0px';
    rightSidebar.classList.add('collapsed');

    rightResizer.style.display = 'none';
    rightSidebarOpenBtn.style.display = 'block';

    // モバイル用
    rightSidebar.classList.remove('open');

    // リサイズと再描画
    resizeCanvas();
    setTimeout(() => {
        resizeCanvas();
    }, 320);
}

// サイドバーを開く
function openRightSidebar() {
    state.isRightSidebarCollapsed = false;
    rightSidebar.classList.remove('collapsed');

    // 記憶した幅を復元（最低200px、デフォルト300px）
    const targetW = state.rightSidebarWidth && parseInt(state.rightSidebarWidth, 10) >= 150
        ? state.rightSidebarWidth
        : '300px';
    rightSidebar.style.width = targetW;
    rightSidebar.style.minWidth = '200px';

    rightResizer.style.display = 'block';
    rightSidebarOpenBtn.style.display = 'none';

    // モバイル用
    if (window.innerWidth <= 768) {
        rightSidebar.classList.add('open');
        rightSidebar.style.width = '';
    }

    // リサイズと再描画
    resizeCanvas();
    updateRightSidebarPreview();
    setTimeout(() => {
        resizeCanvas();
        updateRightSidebarPreview();
    }, 320);
}

rightSidebarToggle.addEventListener('click', closeRightSidebar);
rightSidebarOpenBtn.addEventListener('click', openRightSidebar);

// リサイズドラッグ
resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    resizer.classList.add('active');
    document.body.style.cursor = 'col-resize';
});

rightResizer.addEventListener('mousedown', (e) => {
    isRightResizing = true;
    rightResizer.classList.add('active');
    document.body.style.cursor = 'col-resize';
});

window.addEventListener('mousemove', (e) => {
    if (isResizing) {
        const newWidth = e.clientX;
        if (newWidth > 150 && newWidth < window.innerWidth / 2) {
            sidebar.style.width = newWidth + 'px';
            resizeCanvas();
        }
        return;
    }
    if (isRightResizing) {
        const newWidth = window.innerWidth - e.clientX;
        if (newWidth > 150 && newWidth < window.innerWidth / 2) {
            rightSidebar.style.width = newWidth + 'px';
            rightSidebar.style.minWidth = newWidth + 'px';
            state.rightSidebarWidth = newWidth + 'px';
            resizeCanvas();
        }
        return;
    }
});

window.addEventListener('mouseup', (e) => {
    if (isResizing) {
        isResizing = false;
        resizer.classList.remove('active');
        document.body.style.cursor = 'default';
        resizeCanvas();
    }
    if (isRightResizing) {
        isRightResizing = false;
        rightResizer.classList.remove('active');
        document.body.style.cursor = 'default';
        resizeCanvas();
    }
    // 右クリックによる範囲選択終了
    if (e.button === 2 && state.isSelecting) {
        state.isSelecting = false;
        updateSelection();
        draw();
        return;
    }
    // 左クリック処理
    if (e.button === 0) {
        if (state.isSelecting) {
            // 左クリックスライドによる選択完了
            state.isSelecting = false;
            state.isLeftMouseDown = false;
            state.mouseDownEvent = null;
            updateSelection();
            draw();
            return;
        }
        if (state.isLeftMouseDown) {
            // スライドしなかった場合（通常の左クリック）
            state.isLeftMouseDown = false;
            const clickEvt = state.mouseDownEvent || e;
            state.mouseDownEvent = null;
            handleCanvasLeftClick(clickEvt);
            return;
        }
    }
    // 連打のドラッグ終了処理
    if (isDraggingRoll && e.button === 0) {
        const dragDist = Math.abs(e.clientX - rollDragStartX);
        if (dragDist > 15 && rollStartInfo) {
            const measures = songData.courses[state.currentCourse];
            const positions = calculateMeasurePositions(measures);
            const snap = getSnapPosition(state.cursorX, positions);
            const isAfterStart = snap.measureIdx !== -1 && (
                (snap.measureIdx > rollStartInfo.measureIdx) ||
                (snap.measureIdx === rollStartInfo.measureIdx && snap.gridIdx > rollStartInfo.gridIdx)
            );
            if (isAfterStart) {
                placeNoteData("8");
                state.mode = (currentTool === '5' || currentTool === '6') ? "ROLL" : "NOTE";
                rollStartInfo = null;
            }
        }
        // クリック＆リリースの場合は8を置かずROLL_ENDモードを維持して2回目のクリック待ちにする
        isDraggingRoll = false;
        draw();
        updateStatusBar();
    }
});

// キャンバス上での右クリックメニューを無効化
canvas.addEventListener('contextmenu', e => e.preventDefault());

wrapper.addEventListener('mouseenter', () => {
    state.isInsideCanvas = true;
});

wrapper.addEventListener('mouseleave', () => {
    state.cursorY = 9999; // 画面外へ
    state.isInsideCanvas = false;
    if (state.isLeftMouseDown && !state.isSelecting) {
        state.isLeftMouseDown = false;
        state.mouseDownEvent = null;
    }
    draw();
    updateStatusBar();
});

// 通常の左クリック時の音符配置・小節クイック設定等の処理
function handleCanvasLeftClick(e) {
    const rect = wrapper.getBoundingClientRect();
    const mouseY = e.clientY - rect.top;
    const mouseX = e.clientX - rect.left;
    const rawWorldX = mouseX + state.scrollX - JUDGE_X;

    // レーンの上部（小節番号やギミック領域）をクリックした場合、その小節を選択してクイック設定を開く
    if (mouseY < LANE_Y - 40) {
        const measures = songData.courses[state.currentCourse];
        const positions = calculateMeasurePositions(measures);
        const mIdx = getMeasureIndexAtWorldX(rawWorldX, positions);
        if (mIdx >= 0 && mIdx < positions.length) {
            state.lastActiveMeasureIdx = mIdx;
            state.selectStartX = positions[mIdx].startX;
            state.selectEndX = positions[mIdx].startX + positions[mIdx].width;
            state.selectedMeasureRange = { start: mIdx, end: mIdx };
            updateSelection();
            draw();
            openMeasureQuickPopup();
        }
        return;
    }

    // レーンの下部をクリックした場合は選択解除
    if (mouseY > LANE_Y + 40) {
        if (state.selectedNotes.length > 0 || state.selectedMeasureRange) {
            state.selectedNotes = [];
            state.selectedMeasureRange = null;
            draw();
        }
        return;
    }

    if (state.mode === "NUM_INPUT") {
        cancelNumberInput();
    }

    if (state.mode === "ROLL_END") {
        const measures = songData.courses[state.currentCourse];
        const positions = calculateMeasurePositions(measures);
        const snap = getSnapPosition(state.cursorX, positions);
        if (snap.measureIdx !== -1) {
            if (rollStartInfo) {
                const isAfterStart = (snap.measureIdx > rollStartInfo.measureIdx) ||
                    (snap.measureIdx === rollStartInfo.measureIdx && snap.gridIdx > rollStartInfo.gridIdx);
                if (!isAfterStart) {
                    return;
                }
            }
            placeNoteData("8");
            state.mode = (currentTool === '5' || currentTool === '6') ? "ROLL" : "NOTE";
            rollStartInfo = null;
            isDraggingRoll = false;
            draw();
            updateStatusBar();
            return;
        }
    }

    if (currentTool === '5' || currentTool === '6') {
        const measures = songData.courses[state.currentCourse];
        const positions = calculateMeasurePositions(measures);
        const snap = getSnapPosition(state.cursorX, positions);
        if (snap.measureIdx !== -1) {
            placeNoteData(currentTool);
            state.mode = "ROLL_END";
            rollStartInfo = { measureIdx: snap.measureIdx, gridIdx: snap.gridIdx, type: currentTool };
            isDraggingRoll = true;
            rollDragStartX = e.clientX;
            draw();
            updateStatusBar();
            return;
        }
    } else if (currentTool === '7' || currentTool === '9') {
        startNumberInput(currentTool);
    } else if (currentTool && currentTool.startsWith('tpl_')) {
        placeTemplate(currentTool);
    } else if (currentTool) {
        placeNoteData(currentTool);
    }
    draw();
}

wrapper.addEventListener('mousedown', (e) => {
    const rect = wrapper.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const rawWorldX = mouseX + state.scrollX - JUDGE_X;

    if (e.button === 2) {
        // 右クリックでも範囲選択開始（1/4小節スナップ）
        state.isSelecting = true;
        state.selectRawStartX = rawWorldX;
        state.selectedNotes = [];

        const measures = songData.courses[state.currentCourse];
        const positions = calculateMeasurePositions(measures);

        if (e.shiftKey) {
            // Shift押下: 自由選択（ピクセル/音符単位）
            state.selectStartX = rawWorldX;
            state.selectEndX = rawWorldX;
        } else {
            // 通常: 1/4小節境界スナップ
            const snapStart = snapWorldXToQuarterMeasure(rawWorldX, positions, 'floor');
            const mIdx = getMeasureIndexAtWorldX(rawWorldX, positions);
            const step = positions[mIdx].width / 4;
            state.selectStartX = snapStart;
            state.selectEndX = snapStart + step;
        }
        updateSelection();
        draw();
        return;
    }

    if (e.button !== 0) return; // 左クリック以外は無視
    if (e.target !== canvas) {
        // UIパネル等をクリックした場合は選択解除する
        if (state.selectedNotes.length > 0 || state.selectedMeasureRange) {
            state.selectedNotes = [];
            state.selectedMeasureRange = null;
            draw();
        }
        return;
    }

    // 連打ツール使用中は連打のドラッグ伸長を優先
    if ((currentTool === '5' || currentTool === '6') && state.mode !== "ROLL_END") {
        const measures = songData.courses[state.currentCourse];
        const positions = calculateMeasurePositions(measures);
        const snap = getSnapPosition(state.cursorX, positions);
        if (snap.measureIdx !== -1) {
            placeNoteData(currentTool);
            state.mode = "ROLL_END";
            rollStartInfo = { measureIdx: snap.measureIdx, gridIdx: snap.gridIdx, type: currentTool };
            isDraggingRoll = true;
            rollDragStartX = e.clientX;
            draw();
            updateStatusBar();
            return;
        }
    }

    // 連打終了点待ちの場合はクリック即時処理
    if (state.mode === "ROLL_END") {
        handleCanvasLeftClick(e);
        return;
    }

    // 通常の左クリック：スライド（ドラッグ）判定の準備
    state.isLeftMouseDown = true;
    state.mouseDownClientX = e.clientX;
    state.mouseDownClientY = e.clientY;
    state.mouseDownRawWorldX = rawWorldX;
    state.mouseDownEvent = e;
});

wrapper.addEventListener('mousemove', (e) => {
    if (e.target !== canvas) return;
    const rect = wrapper.getBoundingClientRect();
    state.cursorX = e.clientX - rect.left;
    state.cursorY = e.clientY - rect.top;

    // 左ボタンスライドによる範囲選択の開始判定（約6px以上動いたら選択モードへ移行）
    if (state.isLeftMouseDown && !state.isSelecting && !isDraggingRoll) {
        const moveDist = Math.hypot(e.clientX - state.mouseDownClientX, e.clientY - state.mouseDownClientY);
        if (moveDist > 6) {
            state.isSelecting = true;
            state.selectRawStartX = state.mouseDownRawWorldX;
            state.selectedNotes = [];
        }
    }

    if (state.isSelecting) {
        const rawCurrentX = state.cursorX + state.scrollX - JUDGE_X;
        const measures = songData.courses[state.currentCourse];
        const positions = calculateMeasurePositions(measures);

        if (e.shiftKey) {
            // Shift押下: 自由選択（ピクセル/音符単位）
            state.selectStartX = Math.min(state.selectRawStartX, rawCurrentX);
            state.selectEndX = Math.max(state.selectRawStartX, rawCurrentX);
        } else {
            // 通常: 1小節内の1/4（四分の一・拍単位）ごとにスナップ
            const minRaw = Math.min(state.selectRawStartX, rawCurrentX);
            const maxRaw = Math.max(state.selectRawStartX, rawCurrentX);

            let snapStart = snapWorldXToQuarterMeasure(minRaw, positions, 'floor');
            let snapEnd = snapWorldXToQuarterMeasure(maxRaw, positions, 'ceil');

            // 同一位置の場合は最低1/4区間を確保
            if (snapStart === snapEnd) {
                const mIdx = getMeasureIndexAtWorldX(minRaw, positions);
                const step = positions[mIdx].width / 4;
                if (rawCurrentX >= state.selectRawStartX) {
                    snapEnd = Math.min(positions[positions.length - 1].startX + positions[positions.length - 1].width, snapStart + step);
                } else {
                    snapStart = Math.max(positions[0].startX, snapEnd - step);
                }
            }

            state.selectStartX = snapStart;
            state.selectEndX = snapEnd;
        }
        updateSelection();
    }

    draw();
    updateStatusBar();
});

wrapper.addEventListener('wheel', (e) => {
    if (e.ctrlKey) {
        e.preventDefault();
        state.zoomLevel += e.deltaY * -0.001;
        state.zoomLevel = Math.max(0.5, Math.min(3.0, state.zoomLevel));
    } else {
        state.scrollX += e.deltaX !== 0 ? e.deltaX : e.deltaY;
        state.scrollX = Math.max(0, state.scrollX);
    }
    draw();
    updateStatusBar();
});

// --- タッチ操作対応 ---
const TOUCH_TAP_THRESHOLD = 10;   // タップ判定の移動量しきい値(px)
const TOUCH_TAP_DURATION = 300;   // タップ判定の最大時間(ms)

wrapper.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
        // ピンチ開始
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        state.lastPinchDist = Math.sqrt(dx * dx + dy * dy);
        e.preventDefault();
        return;
    }

    const touch = e.touches[0];
    const rect = wrapper.getBoundingClientRect();

    state.touchStartX = touch.clientX;
    state.touchStartY = touch.clientY;
    state.touchStartScrollX = state.scrollX;
    state.touchStartTime = Date.now();
    state.isTouchScrolling = false;
    state.isInsideCanvas = true;

    // カーソル位置を更新
    state.cursorX = touch.clientX - rect.left;
    state.cursorY = touch.clientY - rect.top;
}, { passive: false });

wrapper.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
        // ピンチズーム
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (state.lastPinchDist > 0) {
            const scale = dist / state.lastPinchDist;
            state.zoomLevel *= scale;
            state.zoomLevel = Math.max(0.5, Math.min(3.0, state.zoomLevel));
        }
        state.lastPinchDist = dist;
        draw();
        updateStatusBar();
        return;
    }

    const touch = e.touches[0];
    const dx = touch.clientX - state.touchStartX;
    const dy = touch.clientY - state.touchStartY;

    // 一定以上動いたらスクロールとみなす
    if (!state.isTouchScrolling && (Math.abs(dx) > TOUCH_TAP_THRESHOLD || Math.abs(dy) > TOUCH_TAP_THRESHOLD)) {
        state.isTouchScrolling = true;
    }

    if (state.isTouchScrolling) {
        e.preventDefault();
        state.scrollX = state.touchStartScrollX - dx;
        state.scrollX = Math.max(0, state.scrollX);

        const rect = wrapper.getBoundingClientRect();
        state.cursorX = touch.clientX - rect.left;
        state.cursorY = touch.clientY - rect.top;

        draw();
        updateStatusBar();
    }
}, { passive: false });

wrapper.addEventListener('touchend', (e) => {
    if (e.touches.length > 0) {
        // まだ指が残っている場合（ピンチ解除中など）
        state.lastPinchDist = 0;
        return;
    }
    state.lastPinchDist = 0;

    const elapsed = Date.now() - state.touchStartTime;

    // スクロールしていなくて短いタップだった場合 → 音符配置
    if (!state.isTouchScrolling && elapsed < TOUCH_TAP_DURATION) {
        // レーン付近でなければ無視
        if (Math.abs(state.cursorY - LANE_Y) > 80) return;

        if (state.mode === "NUM_INPUT") {
            cancelNumberInput();
        } else if (state.mode === "ROLL_END") {
            placeNoteData("8");
            state.mode = "NOTE";
        } else if (currentTool === '7' || currentTool === '9') {
            startNumberInput(currentTool);
        } else if (currentTool && currentTool.startsWith('tpl_')) {
            placeTemplate(currentTool);
        } else if (currentTool) {
            placeNoteData(currentTool);
        }

        draw();
        updateStatusBar();
    }

    state.isTouchScrolling = false;
});

// キャンバスのデフォルトのタッチスクロールを無効化（ページ全体が動くのを防ぐ）
wrapper.addEventListener('touchmove', (e) => {
    if (e.target === canvas) {
        e.preventDefault();
    }
}, { passive: false });

window.addEventListener('keydown', (e) => {
    state.isSnapEnabled = !e.shiftKey;

    // 入力フォームにフォーカスがある場合はショートカットを無効化
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

    // 1. Undo / Redo
    if (matchesShortcut(e, shortcuts.undo)) {
        e.preventDefault();
        undo();
        return;
    }
    if (matchesShortcut(e, shortcuts.redo)) {
        e.preventDefault();
        redo();
        return;
    }

    // 2. 再生 / 停止
    if (matchesShortcut(e, shortcuts.play)) {
        e.preventDefault();
        togglePlayback();
        return;
    }

    // スペースキー押下時のブラウザスクロール抑止
    if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
    }

    // 3. 連続配置モード切り替え
    if (matchesShortcut(e, shortcuts.continuous)) {
        e.preventDefault();
        toggleContinuousMode();
        return;
    }

    // 4. 前後小節移動（選択音符がある場合はシフト）
    if (matchesShortcut(e, shortcuts.prevMeas)) {
        e.preventDefault();
        if (state.selectedNotes.length > 0) shiftSelectedNotes(-1);
        else prevMeasure();
        return;
    }
    if (matchesShortcut(e, shortcuts.nextMeas)) {
        e.preventDefault();
        if (state.selectedNotes.length > 0) shiftSelectedNotes(1);
        else nextMeasure();
        return;
    }

    // 5. 先頭 / 末尾小節へ移動
    if (matchesShortcut(e, shortcuts.rewind)) {
        e.preventDefault();
        rewindToStart();
        return;
    }
    if (matchesShortcut(e, shortcuts.jumpEnd)) {
        e.preventDefault();
        const measures = songData.courses[state.currentCourse] || [];
        jumpToMeasure(measures.length - 1);
        return;
    }

    // 6. 小節クイック設定 / ギミック一元化ポップアップ
    if (matchesShortcut(e, shortcuts.quickMeas) || matchesShortcut(e, shortcuts.gimmick)) {
        e.preventDefault();
        const popup = document.getElementById('measure-quick-popup');
        if (popup && popup.style.display !== 'none') {
            closeMeasureQuickPopup();
        } else {
            openMeasureQuickPopup();
        }
        return;
    }

    // 7. ガイド開閉
    if (matchesShortcut(e, shortcuts.guide)) {
        e.preventDefault();
        const guideOverlay = document.getElementById('guide-overlay');
        if (guideOverlay) {
            if (guideOverlay.classList.contains('active') && guideOverlay.style.display !== 'none') {
                guideOverlay.style.display = 'none';
                guideOverlay.classList.remove('active');
            } else {
                guideOverlay.style.display = 'flex';
                guideOverlay.classList.add('active');
            }
        }
        return;
    }

    if (e.key === 'Escape') {
        closeMeasureQuickPopup();
    }

    if (state.mode === "NUM_INPUT") return;

    let insertType = null;
    let isShortcut = false;

    // 音符入力判定（大音符・風船・連打含む）
    if (matchesShortcut(e, shortcuts.don)) {
        insertType = state.size === "SMALL" ? "1" : "3";
        isShortcut = true;
    } else if (matchesShortcut(e, shortcuts.ka)) {
        insertType = state.size === "SMALL" ? "2" : "4";
        isShortcut = true;
    } else if (matchesShortcut(e, shortcuts.bigDon)) {
        insertType = "3";
        state.size = "LARGE";
        state.mode = "NOTE";
        isShortcut = true;
    } else if (matchesShortcut(e, shortcuts.bigKa)) {
        insertType = "4";
        state.size = "LARGE";
        state.mode = "NOTE";
        isShortcut = true;
    } else if (matchesShortcut(e, shortcuts.roll)) {
        state.mode = "ROLL";
        insertType = state.size === "SMALL" ? "5" : "6";
        isShortcut = true;
    } else if (matchesShortcut(e, shortcuts.bigRoll)) {
        state.mode = "ROLL";
        state.size = "LARGE";
        insertType = "6";
        isShortcut = true;
    } else if (matchesShortcut(e, shortcuts.balloon)) {
        setActiveTool('7');
        state.mode = "NOTE";
        insertType = "7";
        isShortcut = true;
    } else if (matchesShortcut(e, shortcuts.rollEnd)) {
        insertType = "8";
        isShortcut = true;
    } else if (matchesShortcut(e, shortcuts.del)) {
        insertType = "0";
        isShortcut = true;
    }

    updateStatusBar();

    // ツールアイコンの選択状態を更新（8以外）
    if (insertType && insertType !== "8" && state.mode !== "NUM_INPUT") {
        setActiveTool(insertType);
    }

    // カーソルがキャンバス内にある場合のみ、ショートカットキーによって音符を配置する
    if (isShortcut && state.mode !== "NUM_INPUT" && state.isInsideCanvas) {
        if (Math.abs(state.cursorY - LANE_Y) > 80) return;

        placeNoteData(insertType);

        if (state.isContinuousMode) {
            const measures = songData.courses[state.currentCourse];
            const positions = calculateMeasurePositions(measures);
            const snap = getSnapPosition(state.cursorX, positions);
            if (snap.measureIdx !== -1) {
                const pos = positions[snap.measureIdx];
                const gridSpacing = pos.width / pos.measure.subdivision;
                state.scrollX += gridSpacing;
            }
        }

        if (insertType === "5" || insertType === "6") {
            const measures = songData.courses[state.currentCourse];
            const positions = calculateMeasurePositions(measures);
            const snap = getSnapPosition(state.cursorX, positions);
            if (snap.measureIdx !== -1) {
                state.mode = "ROLL_END";
                rollStartInfo = { measureIdx: snap.measureIdx, gridIdx: snap.gridIdx, type: insertType };
            }
        } else if (insertType === "8") {
            state.mode = (currentTool === '5' || currentTool === '6') ? "ROLL" : "NOTE";
            rollStartInfo = null;
        }
        updateStatusBar();
    }
    draw();
});

window.addEventListener('keyup', (e) => {
    state.isSnapEnabled = !e.shiftKey;
    updateStatusBar();
    draw();
});

// --- 6. データ更新ロジック ---
function placeNoteData(type, val = "") {
    pushHistory();
    const measures = songData.courses[state.currentCourse];

    // 一括選択されている場合は、選択範囲の音符を全て置き換える（または削除する）
    if (state.selectedNotes.length > 0) {
        state.selectedNotes.forEach(sn => {
            const targetArray = measures[sn.measureIdx].notes[state.currentBranch];
            const existingIdx = targetArray.findIndex(n => n.posIndex === sn.gridIdx);

            if (type === "0") {
                if (existingIdx !== -1) targetArray.splice(existingIdx, 1);
            } else {
                const newNote = { type: type, posIndex: sn.gridIdx, val: val };
                if (existingIdx !== -1) {
                    targetArray[existingIdx] = newNote;
                } else {
                    targetArray.push(newNote);
                }
            }
        });

        // 置換後、選択状態を解除する
        state.selectedNotes = [];
        state.isSelecting = false;
        normalizeRolls(measures, state.currentBranch);
        return;
    }

    const positions = calculateMeasurePositions(measures);
    const { measureIdx, gridIdx } = getSnapPosition(state.cursorX, positions);

    if (measureIdx === -1) return;

    const targetArray = measures[measureIdx].notes[state.currentBranch];
    const existingIdx = targetArray.findIndex(n => n.posIndex === gridIdx);

    if (type === "0") {
        // 削除処理
        if (existingIdx !== -1) targetArray.splice(existingIdx, 1);
    } else {
        // 追加・上書き処理
        const newNote = { type: type, posIndex: gridIdx, val: val };
        if (existingIdx !== -1) targetArray[existingIdx] = newNote;
        else targetArray.push(newNote);
    }

    // ★追加：連打の自動分割・整合性チェック処理★
    normalizeRolls(measures, state.currentBranch);
}

// 選択した音符を左右にずらす機能
function shiftSelectedNotes(direction) {
    if (state.selectedNotes.length === 0) return;
    pushHistory();
    const measures = songData.courses[state.currentCourse];
    const branch = state.currentBranch;

    // 左から右へ（マイナスの場合は左端から、プラスの場合は右端から処理すると被りにくいが、一括で入れ替えるのでまとめて処理する）
    const sortedSelected = [...state.selectedNotes].sort((a, b) =>
        (a.measureIdx - b.measureIdx) || (a.gridIdx - b.gridIdx)
    );

    const newPositions = [];

    for (let i = 0; i < sortedSelected.length; i++) {
        let n = sortedSelected[i];
        let newMIdx = n.measureIdx;
        let newGIdx = n.gridIdx + direction;

        if (newGIdx < 0) {
            newMIdx--;
            if (newMIdx < 0) return; // 曲の開始より前には移動できないのでキャンセル
            newGIdx = measures[newMIdx].subdivision - 1;
        } else if (newGIdx >= measures[newMIdx].subdivision) {
            newMIdx++;
            while (newMIdx >= measures.length) {
                measures.push(createEmptyMeasure());
            }
            newGIdx = 0;
        }

        newPositions.push({ ...n, newMIdx, newGIdx });
    }

    // 移動先の位置に移動元の選択音符以外の既存音符がある場合は削除（上書き）として処理する
    // まず選択されている音符をすべて削除
    newPositions.forEach(n => {
        const targetArray = measures[n.measureIdx].notes[branch];
        const idx = targetArray.findIndex(x => x.posIndex === n.gridIdx);
        if (idx !== -1) {
            // 元の配列要素も保存しておく（valを保持するため）
            n.originalNote = targetArray[idx];
            targetArray.splice(idx, 1);
        }
    });

    // 次に新しい位置へ追加
    newPositions.forEach(n => {
        if (!n.originalNote) return; // 削除済みなどで見つからなかった場合は無視
        const targetArray = measures[n.newMIdx].notes[branch];
        const existingIdx = targetArray.findIndex(x => x.posIndex === n.newGIdx);
        const newNote = { type: n.type, posIndex: n.newGIdx, val: n.originalNote.val || "" };

        if (existingIdx !== -1) targetArray[existingIdx] = newNote;
        else targetArray.push(newNote);

        // 選択状態の座標も更新
        const selNote = state.selectedNotes.find(s => s.measureIdx === n.measureIdx && s.gridIdx === n.gridIdx);
        if (selNote) {
            selNote.measureIdx = n.newMIdx;
            selNote.gridIdx = n.newGIdx;
        }
    });

    normalizeRolls(measures, branch);
    draw();
}

function placeTemplate(tplKey) {
    pushHistory();
    const measures = songData.courses[state.currentCourse];
    const positions = calculateMeasurePositions(measures);
    const snap = getSnapPosition(state.cursorX, positions);

    if (snap.measureIdx === -1) return;

    // 動的パース: "tpl_ddk" -> ["1", "1", "2"]
    const patternStr = tplKey.replace('tpl_', '');
    let pattern = [];
    for (let i = 0; i < patternStr.length; i++) {
        if (patternStr[i] === 'd') pattern.push("1");
        if (patternStr[i] === 'k') pattern.push("2");
    }

    let mIdx = snap.measureIdx;
    let gIdx = snap.gridIdx;

    for (let i = 0; i < pattern.length; i++) {
        const targetArray = measures[mIdx].notes[state.currentBranch];
        const existingIdx = targetArray.findIndex(n => n.posIndex === gIdx);
        const newNote = { type: pattern[i], posIndex: gIdx, val: "" };

        if (existingIdx !== -1) targetArray[existingIdx] = newNote;
        else targetArray.push(newNote);

        // 次のグリッドへ進む
        gIdx++;
        if (gIdx >= measures[mIdx].subdivision) {
            mIdx++;
            gIdx = 0;
            if (mIdx >= measures.length) break; // 曲の終端に達したら終了
        }
    }
    normalizeRolls(measures, state.currentBranch);
}

// 連打の整合性を保つ（間に音符が来たら分割する）ロジック
function normalizeRolls(measures, branch) {
    let allNotes = [];

    // 全音符を抽出して一時配列に入れる
    measures.forEach((m, mIdx) => {
        m.notes[branch].forEach(n => {
            allNotes.push({
                measureIdx: mIdx,
                gridIdx: n.posIndex,
                type: n.type,
                // 時間軸（絶対位置）を計算してソート用にする
                time: mIdx + (n.posIndex / m.subdivision)
            });
        });
    });

    // 時間順（左から右へ）ソート
    allNotes.sort((a, b) => a.time - b.time);

    let inRoll = false;
    let rollStartNode = null;
    let correctionsAdd = [];
    let correctionsRemove = [];

    // 左から順に音符をチェック
    allNotes.forEach(note => {
        if (note.type === "5" || note.type === "6" || note.type === "7" || note.type === "9") {
            if (inRoll) {
                // 連打中に新しい連打が始まった場合、直前で前の連打を終了させる
                const prev = getPreviousGridPos(note.measureIdx, note.gridIdx, measures, "8");
                if (prev) correctionsAdd.push(prev);
            }
            inRoll = true;
            rollStartNode = note;
        }
        else if (note.type === "8") {
            if (!inRoll) {
                // 開始点がないのに終了(8)だけある場合は削除候補
                correctionsRemove.push(note);
            }
            inRoll = false;
            rollStartNode = null;
        }
        else if (note.type !== "0") {
            // ドン、カッなどの通常音符が来た場合
            if (inRoll) {
                // 連打の途中に音符が置かれた → 直前で連打を終了させる
                const prev = getPreviousGridPos(note.measureIdx, note.gridIdx, measures, "8");
                if (prev && prev.measureIdx === rollStartNode.measureIdx && prev.gridIdx === rollStartNode.gridIdx) {
                    correctionsRemove.push(rollStartNode);
                } else if (prev) {
                    correctionsAdd.push(prev);
                }
                inRoll = false;
            }
        }
    });

    // ※編集中の一時的な連打（未終了）の最中に曲末尾へ強制的に8を挿入しないようにし、
    // ユーザーが手動で伸ばして再クリックまたはキー入力で終点を決定できるようにする。

    // --- 修正データの適用 ---
    // (以下、既存のcorrectionsRemove/Addの処理)
    correctionsRemove.forEach(rm => {
        const arr = measures[rm.measureIdx].notes[branch];
        const idx = arr.findIndex(n => n.posIndex === rm.gridIdx);
        if (idx !== -1) arr.splice(idx, 1);
    });

    correctionsAdd.forEach(add => {
        const arr = measures[add.measureIdx].notes[branch];
        const idx = arr.findIndex(n => n.posIndex === add.gridIdx);
        if (idx !== -1) {
            arr[idx] = { type: add.type, posIndex: add.gridIdx, val: "" };
        } else {
            arr.push({ type: add.type, posIndex: add.gridIdx, val: "" });
        }
    });
}

// (中略: getPreviousGridPos)

// --- 7. 数値入力ポップアップの処理 (風船など) ---
let lastUsedBalloonCount = 5;

function startNumberInput(type) {
    const popup = document.getElementById('num-input-popup');
    const input = document.getElementById('note-value-input');
    if (!popup || !input) return;

    state.mode = "NUM_INPUT";

    const measures = songData.courses[state.currentCourse];
    const positions = calculateMeasurePositions(measures);
    const snap = getSnapPosition(state.cursorX, positions);

    state.pendingNote = {
        type: type,
        measureIdx: snap.measureIdx,
        gridIdx: snap.gridIdx
    };

    // ポップアップを表示
    popup.style.display = 'flex';

    // 画面外に見切れないよう表示座標をクランプ計算
    const popupWidth = 280;
    const popupHeight = 170;
    let posX = state.cursorX + 20;
    let posY = LANE_Y + 40;

    if (posX + popupWidth > window.innerWidth - 15) {
        posX = Math.max(10, state.cursorX - popupWidth - 10);
    }
    if (posY + popupHeight > window.innerHeight - 15) {
        posY = Math.max(10, LANE_Y - popupHeight - 20);
    }

    popup.style.left = `${posX}px`;
    popup.style.top = `${posY}px`;

    // 直前に入力した打数をセット＆全選択して即座にEnterで決定できるように
    input.value = lastUsedBalloonCount || 5;
    setTimeout(() => {
        input.focus();
        input.select();
    }, 20);

    updateStatusBar();
}

function finishNumberInput(val) {
    const num = parseInt(val, 10);
    const finalVal = (!isNaN(num) && num > 0) ? num : (lastUsedBalloonCount || 5);
    lastUsedBalloonCount = finalVal;

    if (state.pendingNote && state.pendingNote.measureIdx !== -1) {
        const { measureIdx, gridIdx, type } = state.pendingNote;
        const targetArray = songData.courses[state.currentCourse][measureIdx].notes[state.currentBranch];

        const existingIdx = targetArray.findIndex(n => n.posIndex === gridIdx);
        const newNote = { type: type, posIndex: gridIdx, val: String(finalVal) };

        if (existingIdx !== -1) targetArray[existingIdx] = newNote;
        else targetArray.push(newNote);

        // 自動的に整合性を整える
        normalizeRolls(songData.courses[state.currentCourse], state.currentBranch);

        // 風船配置後、連打と同じく終点（8）待ちモードへ移行してプレビューを伸ばせるようにする
        state.mode = "ROLL_END";
        rollStartInfo = { measureIdx, gridIdx, type };
        isDraggingRoll = false;
    } else {
        state.mode = "NOTE";
    }

    const popup = document.getElementById('num-input-popup');
    const input = document.getElementById('note-value-input');
    if (popup) popup.style.display = 'none';
    if (input) input.blur();

    state.pendingNote = null;
    draw();
    updateStatusBar();
}

function cancelNumberInput() {
    const popup = document.getElementById('num-input-popup');
    const input = document.getElementById('note-value-input');
    if (popup) popup.style.display = 'none';
    if (input) input.blur();

    state.mode = "NOTE";
    state.pendingNote = null;
    draw();
    updateStatusBar();
}

// ポップアップの各種イベント登録（初期化）
function initBalloonInputPopup() {
    const input = document.getElementById('note-value-input');
    const okBtn = document.getElementById('num-input-ok');
    const cancelBtn = document.getElementById('num-input-cancel');
    const cancelXBtn = document.getElementById('num-input-cancel-btn');
    const inc1Btn = document.getElementById('num-input-inc1');
    const dec1Btn = document.getElementById('num-input-dec1');
    const inc5Btn = document.getElementById('num-input-inc5');
    const dec5Btn = document.getElementById('num-input-dec5');
    const presetBtns = document.querySelectorAll('.balloon-presets .preset-btn');

    if (!input) return;

    // Enter確定（IME変換中Enterは無視）
    input.addEventListener('keydown', (e) => {
        if (e.isComposing || e.keyCode === 229) return;

        if (e.key === 'Enter') {
            e.stopPropagation();
            e.preventDefault();
            finishNumberInput(input.value);
        } else if (e.key === 'Escape') {
            e.stopPropagation();
            e.preventDefault();
            cancelNumberInput();
        }
    });

    if (okBtn) {
        okBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            finishNumberInput(input.value);
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            cancelNumberInput();
        });
    }
    if (cancelXBtn) {
        cancelXBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            cancelNumberInput();
        });
    }

    // ステッパーボタン（＋/−）
    const adjustVal = (delta) => {
        let cur = parseInt(input.value, 10);
        if (isNaN(cur)) cur = 5;
        cur = Math.max(1, Math.min(999, cur + delta));
        input.value = cur;
        input.focus();
        input.select();
    };

    if (inc1Btn) inc1Btn.addEventListener('click', (e) => { e.stopPropagation(); adjustVal(1); });
    if (dec1Btn) dec1Btn.addEventListener('click', (e) => { e.stopPropagation(); adjustVal(-1); });
    if (inc5Btn) inc5Btn.addEventListener('click', (e) => { e.stopPropagation(); adjustVal(5); });
    if (dec5Btn) dec5Btn.addEventListener('click', (e) => { e.stopPropagation(); adjustVal(-5); });

    // クイックプリセットボタン（3, 5, 7, 10, 15, 20）
    presetBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const val = btn.getAttribute('data-val');
            if (val) {
                input.value = val;
                finishNumberInput(val);
            }
        });
    });
}

initBalloonInputPopup();

// 一括選択の更新処理
function updateSelection() {
    state.selectedNotes = [];
    const minX = Math.min(state.selectStartX, state.selectEndX);
    const maxX = Math.max(state.selectStartX, state.selectEndX);

    const measures = songData.courses[state.currentCourse];
    const positions = calculateMeasurePositions(measures);

    let minMIdx = Infinity;
    let maxMIdx = -Infinity;

    positions.forEach((pos, mIdx) => {
        const mStart = pos.startX;
        const mEnd = pos.startX + pos.width;
        // 小節が選択範囲と交差している場合
        if (mEnd > minX && mStart < maxX) {
            if (mIdx < minMIdx) minMIdx = mIdx;
            if (mIdx > maxMIdx) maxMIdx = mIdx;
        }

        const gridSpacing = pos.width / pos.measure.subdivision;
        const notes = pos.measure.notes[state.currentBranch];
        notes.forEach(note => {
            const worldX = pos.startX + (note.posIndex * gridSpacing);
            if (worldX >= minX && worldX <= maxX) {
                state.selectedNotes.push({ measureIdx: mIdx, gridIdx: note.posIndex, type: note.type, val: note.val });
            }
        });
    });

    if (minMIdx !== Infinity && maxMIdx !== -Infinity) {
        state.selectedMeasureRange = { start: minMIdx, end: maxMIdx };
    } else {
        state.selectedMeasureRange = null;
    }
}

// --- 小節クイック設定ポップアップの制御 ---
function openMeasureQuickPopup() {
    const popup = document.getElementById('measure-quick-popup');
    if (!popup) return;

    const measures = songData.courses[state.currentCourse] || [];
    let startIdx = state.lastActiveMeasureIdx;
    let endIdx = state.lastActiveMeasureIdx;

    if (state.selectedMeasureRange) {
        startIdx = state.selectedMeasureRange.start;
        endIdx = state.selectedMeasureRange.end;
    }

    startIdx = Math.max(0, Math.min(startIdx, measures.length - 1));
    endIdx = Math.max(startIdx, Math.min(endIdx, measures.length - 1));

    const titleEl = document.getElementById('measure-quick-title');
    if (titleEl) {
        if (startIdx === endIdx) {
            const m = measures[startIdx];
            const curSub = m ? m.subdivision : 16;
            const curSig = m ? m.signature.join('/') : '4/4';
            const gimmickTags = [];
            if (m) {
                if (m.gogoStart !== false) gimmickTags.push('🔥GOGO開始');
                if (m.gogoEnd !== false) gimmickTags.push('🛑GOGO終了');
                if (m.scroll !== null) gimmickTags.push(`🏎HS:${m.scroll}x`);
                if (m.bpmChange !== null) gimmickTags.push(`🎵BPM:${m.bpmChange}`);
            }
            const tagStr = gimmickTags.length > 0 ? ` [${gimmickTags.join(' ')}]` : '';
            titleEl.textContent = `小節設定: 第${startIdx + 1}小節 (${curSub}分 | ${curSig})${tagStr}`;
        } else {
            titleEl.textContent = `小節一括設定: 第${startIdx + 1} 〜 第${endIdx + 1}小節 (${endIdx - startIdx + 1}小節選択中)`;
        }
    }

    // 現在の小節の設定値を手入力フィールドへ反映
    const curM = measures[startIdx];
    const bpmInput = document.getElementById('quick-bpm-custom');
    if (bpmInput) {
        if (curM && curM.bpmChange !== null && curM.bpmChange !== undefined) {
            bpmInput.value = curM.bpmChange;
        } else {
            bpmInput.value = '';
        }
        const effBpm = getEffectiveBpmAtMeasure(startIdx);
        bpmInput.placeholder = `現在: ${effBpm || (document.getElementById('cfg-bpm') ? document.getElementById('cfg-bpm').value : 120)}`;
    }
    const scrollInput = document.getElementById('quick-scroll-custom');
    if (scrollInput) {
        if (curM && curM.scroll !== null && curM.scroll !== undefined) {
            scrollInput.value = curM.scroll;
        } else {
            scrollInput.value = '1.2';
        }
    }
    const subInput = document.getElementById('quick-subdiv-custom');
    if (subInput) {
        subInput.value = (curM && curM.subdivision) ? curM.subdivision : 16;
    }

    popup.style.display = 'flex';
}

function closeMeasureQuickPopup() {
    const popup = document.getElementById('measure-quick-popup');
    if (popup) {
        popup.style.display = 'none';
    }
}

// 分割数（細分数）を一括適用する
function applyQuickSubdivision(newSub) {
    newSub = parseInt(newSub, 10);
    if (isNaN(newSub) || newSub <= 0) return;

    pushHistory();
    const measures = songData.courses[state.currentCourse] || [];
    let startIdx = state.lastActiveMeasureIdx;
    let endIdx = state.lastActiveMeasureIdx;

    if (state.selectedMeasureRange) {
        startIdx = state.selectedMeasureRange.start;
        endIdx = state.selectedMeasureRange.end;
    }

    startIdx = Math.max(0, Math.min(startIdx, measures.length - 1));
    endIdx = Math.max(startIdx, Math.min(endIdx, measures.length - 1));

    for (let mi = startIdx; mi <= endIdx; mi++) {
        const m = measures[mi];
        if (!m) continue;
        const oldSub = m.subdivision || 16;
        if (oldSub !== newSub) {
            m.subdivision = newSub;
            // 既存音符の相対位置（時間比率）を保ってスケール変換
            ['normal', 'expert', 'master'].forEach(b => {
                if (m.notes && m.notes[b]) {
                    m.notes[b].forEach(note => {
                        note.posIndex = Math.round((note.posIndex / oldSub) * newSub);
                    });
                }
            });
        }
    }

    closeMeasureQuickPopup();
    draw();
    updateStatusBar();
    updateRightSidebarPreview();
}

// 拍子を一括適用する
function applyQuickSignature(num, den) {
    num = parseInt(num, 10);
    den = parseInt(den, 10);
    if (isNaN(num) || isNaN(den) || num <= 0 || den <= 0) return;

    pushHistory();
    const measures = songData.courses[state.currentCourse] || [];
    let startIdx = state.lastActiveMeasureIdx;
    let endIdx = state.lastActiveMeasureIdx;

    if (state.selectedMeasureRange) {
        startIdx = state.selectedMeasureRange.start;
        endIdx = state.selectedMeasureRange.end;
    }

    startIdx = Math.max(0, Math.min(startIdx, measures.length - 1));
    endIdx = Math.max(startIdx, Math.min(endIdx, measures.length - 1));

    for (let mi = startIdx; mi <= endIdx; mi++) {
        const m = measures[mi];
        if (m) {
            m.signature = [num, den];
        }
    }

    closeMeasureQuickPopup();
    draw();
    updateStatusBar();
    updateRightSidebarPreview();
}

// ゴーゴータイムを適用する
function applyQuickGogo(action) {
    pushHistory();
    const measures = songData.courses[state.currentCourse] || [];
    let startIdx = state.lastActiveMeasureIdx;
    let endIdx = state.lastActiveMeasureIdx;

    if (state.selectedMeasureRange) {
        startIdx = state.selectedMeasureRange.start;
        endIdx = state.selectedMeasureRange.end;
    }

    startIdx = Math.max(0, Math.min(startIdx, measures.length - 1));
    endIdx = Math.max(startIdx, Math.min(endIdx, measures.length - 1));

    if (action === 'range') {
        // 範囲を丸ごとゴーゴー化（先頭小節先頭でSTART、末尾小節末尾でEND）
        for (let mi = startIdx; mi <= endIdx; mi++) {
            if (measures[mi]) {
                measures[mi].gogoStart = false;
                measures[mi].gogoEnd = false;
            }
        }
        measures[startIdx].gogoStart = 0;
        measures[endIdx].gogoEnd = 1.0;
    } else if (action === 'start') {
        measures[startIdx].gogoStart = 0;
    } else if (action === 'end') {
        measures[endIdx].gogoEnd = 0;
    } else if (action === 'clear') {
        for (let mi = startIdx; mi <= endIdx; mi++) {
            if (measures[mi]) {
                measures[mi].gogoStart = false;
                measures[mi].gogoEnd = false;
            }
        }
    }

    closeMeasureQuickPopup();
    draw();
    updateStatusBar();
    updateRightSidebarPreview();
}

// スクロール速度（HS）を適用する
function applyQuickScroll(scrollVal) {
    pushHistory();
    const measures = songData.courses[state.currentCourse] || [];
    let startIdx = state.lastActiveMeasureIdx;
    let endIdx = state.lastActiveMeasureIdx;

    if (state.selectedMeasureRange) {
        startIdx = state.selectedMeasureRange.start;
        endIdx = state.selectedMeasureRange.end;
    }

    startIdx = Math.max(0, Math.min(startIdx, measures.length - 1));
    endIdx = Math.max(startIdx, Math.min(endIdx, measures.length - 1));

    const val = (scrollVal !== null && !isNaN(scrollVal)) ? parseFloat(scrollVal) : null;

    if (val !== null) {
        measures[startIdx].scroll = val;
        measures[startIdx].scrollOffset = 0;
    } else {
        for (let mi = startIdx; mi <= endIdx; mi++) {
            if (measures[mi]) {
                measures[mi].scroll = null;
                measures[mi].scrollOffset = 0;
            }
        }
    }

    closeMeasureQuickPopup();
    draw();
    updateStatusBar();
    updateRightSidebarPreview();
}

// BPM変化を一括/単一適用する
function applyQuickBpm(bpmVal) {
    pushHistory();
    const measures = songData.courses[state.currentCourse] || [];
    let startIdx = state.lastActiveMeasureIdx;
    let endIdx = state.lastActiveMeasureIdx;

    if (state.selectedMeasureRange) {
        startIdx = state.selectedMeasureRange.start;
        endIdx = state.selectedMeasureRange.end;
    }

    startIdx = Math.max(0, Math.min(startIdx, measures.length - 1));
    endIdx = Math.max(startIdx, Math.min(endIdx, measures.length - 1));

    if (bpmVal === null || bpmVal === undefined || bpmVal === '') {
        for (let mi = startIdx; mi <= endIdx; mi++) {
            if (measures[mi]) {
                measures[mi].bpmChange = null;
                measures[mi].bpmChangeOffset = 0;
            }
        }
    } else {
        const val = parseFloat(bpmVal);
        if (isNaN(val) || val <= 0) return;
        // 開始小節（または選択先頭小節）にBPM変化を設定
        if (measures[startIdx]) {
            measures[startIdx].bpmChange = val;
            measures[startIdx].bpmChangeOffset = 0;
        }
    }

    closeMeasureQuickPopup();
    draw();
    updateStatusBar();
    updateRightSidebarPreview();
}

// ギミック（BPM変化・HS・ゴーゴー）を一括消去する
function applyQuickClearAllGimmicks() {
    pushHistory();
    const measures = songData.courses[state.currentCourse] || [];
    let startIdx = state.lastActiveMeasureIdx;
    let endIdx = state.lastActiveMeasureIdx;

    if (state.selectedMeasureRange) {
        startIdx = state.selectedMeasureRange.start;
        endIdx = state.selectedMeasureRange.end;
    }

    startIdx = Math.max(0, Math.min(startIdx, measures.length - 1));
    endIdx = Math.max(startIdx, Math.min(endIdx, measures.length - 1));

    for (let mi = startIdx; mi <= endIdx; mi++) {
        if (measures[mi]) {
            measures[mi].bpmChange = null;
            measures[mi].bpmChangeOffset = 0;
            measures[mi].scroll = null;
            measures[mi].scrollOffset = 0;
            measures[mi].gogoStart = false;
            measures[mi].gogoEnd = false;
        }
    }

    closeMeasureQuickPopup();
    draw();
    updateStatusBar();
    updateRightSidebarPreview();
}

function initMeasureQuickPopup() {
    // プリセット細分数ボタン
    document.querySelectorAll('#quick-subdiv-btns .quick-preset-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const sub = btn.getAttribute('data-sub');
            if (sub) applyQuickSubdivision(sub);
        });
    });

    // 手入力細分数
    const customApplyBtn = document.getElementById('quick-subdiv-custom-apply');
    const customInput = document.getElementById('quick-subdiv-custom');
    if (customApplyBtn && customInput) {
        customApplyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            applyQuickSubdivision(customInput.value);
        });
        customInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                applyQuickSubdivision(customInput.value);
            }
        });
    }

    // 拍子プリセットボタン
    document.querySelectorAll('#quick-sig-btns .quick-preset-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const sig = btn.getAttribute('data-sig');
            if (sig) {
                const parts = sig.split('/');
                applyQuickSignature(parts[0], parts[1]);
            }
        });
    });

    // ゴーゴータイムボタン群
    document.querySelectorAll('#quick-gogo-btns .quick-preset-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const gogoAction = btn.getAttribute('data-gogo');
            if (gogoAction) applyQuickGogo(gogoAction);
        });
    });

    // BPM変化 手入力適用
    const bpmCustomApplyBtn = document.getElementById('quick-bpm-custom-apply');
    const bpmCustomInput = document.getElementById('quick-bpm-custom');
    if (bpmCustomApplyBtn && bpmCustomInput) {
        bpmCustomApplyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            applyQuickBpm(bpmCustomInput.value);
        });
        bpmCustomInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                applyQuickBpm(bpmCustomInput.value);
            }
        });
    }

    // 基本BPM反映ボタン
    const bpmBaseBtn = document.getElementById('quick-bpm-base-btn');
    if (bpmBaseBtn && bpmCustomInput) {
        bpmBaseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const defaultBpm = parseFloat(document.getElementById('cfg-bpm') ? document.getElementById('cfg-bpm').value : 120) || 120;
            bpmCustomInput.value = defaultBpm;
        });
    }

    // BPM変化 解除
    const bpmClearBtn = document.getElementById('quick-bpm-clear');
    if (bpmClearBtn) {
        bpmClearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            applyQuickBpm(null);
        });
    }

    // スクロール速度（HS）プリセットボタン群
    document.querySelectorAll('#quick-scroll-btns .quick-preset-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const scrollVal = btn.getAttribute('data-scroll');
            if (scrollVal) applyQuickScroll(scrollVal);
        });
    });

    // スクロール速度 手入力適用
    const scrollCustomApplyBtn = document.getElementById('quick-scroll-custom-apply');
    const scrollCustomInput = document.getElementById('quick-scroll-custom');
    if (scrollCustomApplyBtn && scrollCustomInput) {
        scrollCustomApplyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            applyQuickScroll(scrollCustomInput.value);
        });
        scrollCustomInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                applyQuickScroll(scrollCustomInput.value);
            }
        });
    }

    // スクロール速度 解除
    const scrollClearBtn = document.getElementById('quick-scroll-clear');
    if (scrollClearBtn) {
        scrollClearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            applyQuickScroll(null);
        });
    }

    // ギミック全消去
    const allGimmickClearBtn = document.getElementById('quick-all-gimmick-clear');
    if (allGimmickClearBtn) {
        allGimmickClearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm("選択中の小節のギミック（BPM・HS・ゴーゴー）をすべて消去しますか？")) {
                applyQuickClearAllGimmicks();
            }
        });
    }

    // 閉じるボタン
    const closeBtn = document.getElementById('measure-quick-close');
    const cancelBtn = document.getElementById('quick-cancel-btn');
    if (closeBtn) closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closeMeasureQuickPopup(); });
    if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.stopPropagation(); closeMeasureQuickPopup(); });

    // ポップアップ本体クリック時はバブリングを止めて誤操作を防ぐ
    const popup = document.getElementById('measure-quick-popup');
    if (popup) {
        popup.addEventListener('mousedown', (e) => e.stopPropagation());
        popup.addEventListener('click', (e) => e.stopPropagation());
    }
}

initMeasureQuickPopup();

// --- 7.5 小節ギミック・BPMユーティリティ ---
// 指定小節時点での有効なBPMを取得（小節にBPM変化がなければ直前小節のBPMを遡って取得）
function getEffectiveBpmAtMeasure(measureIdx, courseName) {
    const course = courseName || state.currentCourse;
    const measures = songData.courses[course] || [];
    const defaultBpm = parseFloat(document.getElementById('cfg-bpm') ? document.getElementById('cfg-bpm').value : 120) || 120;
    for (let i = Math.min(measureIdx, measures.length - 1); i >= 0; i--) {
        if (measures[i] && measures[i].bpmChange !== null && !isNaN(measures[i].bpmChange) && measures[i].bpmChange > 0) {
            return measures[i].bpmChange;
        }
    }
    return defaultBpm;
}

// ツールバーの「⚙ ギミック設定」ボタン（小節クイック設定と一元化）
const btnGimmick = document.getElementById('btn-gimmick');
if (btnGimmick) {
    btnGimmick.addEventListener('click', () => {
        const popup = document.getElementById('measure-quick-popup');
        if (popup && popup.style.display !== 'none') {
            closeMeasureQuickPopup();
        } else {
            openMeasureQuickPopup();
        }
    });
}



// --- 8. TJAエクスポート関連 ---

// 難易度のマッピング（エディタ内部名 → TJA COURSE名）
const courseMap = {
    Ura: "Edit",
    Oni: "Oni",
    Hard: "Hard",
    Normal: "Normal",
    Easy: "Easy"
};

// 小節のデータを TJA 文字列行に変換する（32分音符や連符、詰めた最適化表記に対応）
function measureToTjaLine(measure, branch) {
    const notes = measure.notes[branch];
    if (!notes || notes.length === 0) {
        return ","; // 空小節
    }

    const sub = measure.subdivision || 16;

    // 有効な音符を正規化位置 (0 <= t < 1) で抽出
    const notePositions = notes.map(n => ({
        pos: n.posIndex / sub,
        type: String(n.type)
    })).filter(n => n.pos >= 0 && n.pos < 1 && n.type !== "0");

    if (notePositions.length === 0) {
        return ",";
    }

    // 一般的な細分数候補（小節文字数）
    const candidateSubdivisions = [
        1, 2, 3, 4, 6, 8, 12, 16, 20, 24, 32, 48, 64, 96, 192
    ];

    // 全ての音符が綺麗にグリッドに乗る最小の細分数を探索（自動約分・最適化）
    let bestSub = Math.max(sub, 16);
    for (const cand of candidateSubdivisions) {
        let allFit = true;
        for (const np of notePositions) {
            const gridPos = np.pos * cand;
            if (Math.abs(gridPos - Math.round(gridPos)) > 0.005) {
                allFit = false;
                break;
            }
        }
        if (allFit) {
            bestSub = cand;
            break;
        }
    }

    // バッファを作成して音符を配置
    const buf = new Array(bestSub).fill("0");
    notePositions.forEach(np => {
        const idx = Math.min(bestSub - 1, Math.max(0, Math.round(np.pos * bestSub)));
        buf[idx] = np.type;
    });

    return buf.join("") + ",";
}

// 末尾の完全空小節をトリミングする関数（ギミック設定がある小節も含める）
function getLastNonEmptyMeasure(measures, branch) {
    for (let i = measures.length - 1; i >= 0; i--) {
        const m = measures[i];
        const notes = m.notes[branch];
        if (notes && notes.length > 0) return i;
        // ギミックが設定されている小節も出力対象
        if (m.bpmChange !== null || m.scroll !== null || m.gogoStart !== false || m.gogoEnd !== false) return i;
        if (m.signature[0] !== 4 || m.signature[1] !== 4) return i;
    }
    return -1;
}

// 風船の打数をBALLOONヘッダー用に集計
function collectBalloons(measures, branch) {
    const balloons = [];
    const allNotes = [];

    measures.forEach((m, mIdx) => {
        m.notes[branch].forEach(n => {
            allNotes.push({
                time: mIdx + (n.posIndex / m.subdivision),
                type: n.type,
                val: n.val
            });
        });
    });

    allNotes.sort((a, b) => a.time - b.time);

    allNotes.forEach(note => {
        if (note.type === "7" || note.type === "9") {
            const count = parseInt(note.val) || 5;
            balloons.push(count);
        }
    });

    return balloons;
}

// 初期化（UI値の復元など）
document.addEventListener('DOMContentLoaded', () => {
    if (songData.header) {
        if (document.getElementById('cfg-title')) document.getElementById('cfg-title').value = songData.header.title || "";
        if (document.getElementById('cfg-subtitle')) document.getElementById('cfg-subtitle').value = songData.header.subtitle || "";
        if (document.getElementById('cfg-bpm')) document.getElementById('cfg-bpm').value = songData.header.bpm || 120;
        if (document.getElementById('cfg-offset')) document.getElementById('cfg-offset').value = songData.header.offset || 0;
        if (document.getElementById('cfg-wave')) document.getElementById('cfg-wave').value = songData.header.wave || "";
        if (document.getElementById('cfg-demostart')) document.getElementById('cfg-demostart').value = songData.header.demostart || "";
    }

    // 入力欄が変更されたら即座に保存予約とプレビュー更新
    const inputElements = [
        'cfg-title', 'cfg-subtitle', 'cfg-bpm', 'cfg-offset', 'cfg-wave', 'cfg-demostart',
        'cfg-songvol', 'cfg-sevol', 'cfg-scoremode',
        'cfg-level-ura', 'cfg-level-oni', 'cfg-level-hard', 'cfg-level-normal', 'cfg-level-easy'
    ];
    inputElements.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => {
                autoSave();
                if (['cfg-bpm', 'cfg-offset'].includes(id)) {
                    draw(); // BPMやOFFSETが変わったら波形のズレやグリッド線を引き直す
                } else {
                    updateRightSidebarPreview();
                }
            });
        }
    });

    draw();
});

// 1つの難易度分のTJAブロックを生成する
function generateCourseTja(courseName, measures, level) {
    // normal 分岐のみ出力（現状のエディタの主要データ）
    const branch = "normal";
    const lastIdx = getLastNonEmptyMeasure(measures, branch);

    if (lastIdx === -1) return ""; // 音符が全くない難易度はスキップ

    const lines = [];
    lines.push(`COURSE:${courseMap[courseName]}`);
    lines.push(`LEVEL:${level || 1}`);

    const balloons = collectBalloons(measures, branch);
    if (balloons.length > 0) {
        lines.push(`BALLOON:${balloons.join(",")}`);
    }

    lines.push("");
    lines.push("#START");

    for (let i = 0; i <= lastIdx; i++) {
        const m = measures[i];

        // --- ギミック命令を小節データの前に挿入 ---
        // 拍子変化 (#MEASURE)
        if (i === 0 || m.signature[0] !== measures[i - 1].signature[0] || m.signature[1] !== measures[i - 1].signature[1]) {
            if (m.signature[0] !== 4 || m.signature[1] !== 4 || i > 0) {
                lines.push(`#MEASURE ${m.signature[0]}/${m.signature[1]}`);
            }
        }

        let tjaLine = measureToTjaLine(m, branch);
        let comma = "";
        if (tjaLine.endsWith(",")) {
            comma = ",";
            tjaLine = tjaLine.slice(0, -1);
        }

        const actualLen = tjaLine.length > 0 ? tjaLine.length : m.subdivision;
        const events = [];
        if (m.gogoStart !== false) {
            events.push({ type: '#GOGOSTART', idx: Math.round(m.gogoStart * actualLen) });
        }
        if (m.gogoEnd !== false) {
            events.push({ type: '#GOGOEND', idx: Math.round(m.gogoEnd * actualLen) });
        }
        if (m.bpmChange !== null) {
            events.push({ type: `#BPMCHANGE ${m.bpmChange}`, idx: Math.round((m.bpmChangeOffset || 0) * actualLen) });
        }
        if (m.scroll !== null) {
            events.push({ type: `#SCROLL ${m.scroll}`, idx: Math.round((m.scrollOffset || 0) * actualLen) });
        }

        events.sort((a, b) => a.idx - b.idx);

        if (events.length === 0) {
            lines.push(tjaLine + comma);
        } else {
            let lastIdx = 0;
            events.forEach(ev => {
                if (ev.idx === 0 && lastIdx === 0) {
                    lines.push(ev.type);
                } else {
                    const chunk = tjaLine.substring(lastIdx, ev.idx);
                    if (chunk.length > 0) lines.push(chunk);
                    lines.push(ev.type);
                    lastIdx = ev.idx;
                }
            });
            const remaining = tjaLine.substring(lastIdx);
            if (remaining.length > 0 || comma) {
                lines.push(remaining + comma);
            }
        }
    }

    lines.push("#END");
    lines.push("");

    return lines.join("\n");
}

// TJAヘッダー情報をサイドバーから取得して生成する共通関数
function generateTjaHeader() {
    const getValue = (id, fallback = "") => {
        const el = document.getElementById(id);
        return el ? el.value : fallback;
    };
    const title = getValue('cfg-title', "New Song");
    const subtitle = getValue('cfg-subtitle');
    const wave = getValue('cfg-wave');
    const bpm = getValue('cfg-bpm', "120");
    const offset = getValue('cfg-offset', "0");
    const demostart = getValue('cfg-demostart');
    const songvol = getValue('cfg-songvol', "100");
    const sevol = getValue('cfg-sevol', "100");
    const scoremode = getValue('cfg-scoremode', "1");

    const headerLines = [`TITLE:${title}`];
    if (subtitle) headerLines.push(`SUBTITLE:${subtitle}`);
    if (wave) headerLines.push(`WAVE:${wave}`);
    headerLines.push(`BPM:${bpm}`);
    headerLines.push(`OFFSET:${offset}`);
    if (demostart) headerLines.push(`DEMOSTART:${demostart}`);
    if (songvol !== "100") headerLines.push(`SONGVOL:${songvol}`);
    if (sevol !== "100") headerLines.push(`SEVOL:${sevol}`);
    headerLines.push(`SCOREMODE:${scoremode}`);
    headerLines.push("");

    return headerLines.join("\n");
}

// 全難易度分の完全なTJAテキストを生成する
function generateFullTja() {
    const header = generateTjaHeader();
    const levelMap = {
        Ura: document.getElementById('cfg-level-ura').value || "1",
        Oni: document.getElementById('cfg-level-oni').value || "1",
        Hard: document.getElementById('cfg-level-hard').value || "1",
        Normal: document.getElementById('cfg-level-normal').value || "1",
        Easy: document.getElementById('cfg-level-easy').value || "1"
    };
    const courseOrder = ["Ura", "Oni", "Hard", "Normal", "Easy"];
    const courseBlocks = [];

    courseOrder.forEach(course => {
        const measures = songData.courses[course];
        if (measures) {
            const block = generateCourseTja(course, measures, levelMap[course]);
            if (block) courseBlocks.push(block);
        }
    });

    return header + courseBlocks.join("\n");
}

// 選択されている難易度のみのTJAテキストを生成する
function generateActiveCourseTja() {
    const header = generateTjaHeader();
    const course = state.currentCourse;
    const levelEl = document.getElementById(`cfg-level-${course.toLowerCase()}`);
    const level = levelEl ? levelEl.value : "1";

    const measures = songData.courses[course];
    let courseBlock = "";
    if (measures) {
        courseBlock = generateCourseTja(course, measures, level);
    }

    return header + courseBlock;
}

// コピー＆ダウンロードの共通イベントバインド関数
function setupTextActions(copyBtnId, downloadBtnId, textGetter, filenameGetter) {
    const copyBtn = document.getElementById(copyBtnId);
    const downloadBtn = document.getElementById(downloadBtnId);

    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            const text = textGetter();
            navigator.clipboard.writeText(text).then(() => {
                const orig = copyBtn.textContent;
                copyBtn.textContent = "✅ コピー完了!";
                setTimeout(() => copyBtn.textContent = orig, 1500);
            });
        });
    }

    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            const text = textGetter();
            const filename = filenameGetter();
            const blob = new Blob([text], { type: 'text/plain; charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
        });
    }
}

// コピー・ダウンロードのアクション設定
setupTextActions(
    'right-tja-copy-btn',
    'right-tja-download-btn',
    () => document.getElementById('right-tja-preview-content').textContent,
    () => {
        const title = document.getElementById('cfg-title').value || "New Song";
        return `${title}_${state.currentCourse}.tja`;
    }
);

// 右サイドバーのプレビューを更新する関数
function updateRightSidebarPreview() {
    if (state.isRightSidebarCollapsed) return;

    if (state.rightSidebarTab === "visual") {
        drawVisualPreview();
    } else if (state.rightSidebarTab === "text") {
        const textContent = document.getElementById('right-tja-preview-content');
        if (textContent) {
            textContent.textContent = generateActiveCourseTja();
        }
    }
}

// すべてのデータを初期状態にリセットする関数
function resetAllData() {
    pushHistory();
    // 1. ローカルストレージのデータを削除
    try {
        localStorage.removeItem('taikoEditorData');
    } catch (e) {
        console.error("Failed to remove saved data from localStorage", e);
    }

    // 2. メモリ内の songData を初期化（defaultSongDataのディープコピー）
    songData = JSON.parse(JSON.stringify(defaultSongData));

    // 3. UI入力フォームの値をデフォルト値に戻す
    const titleEl = document.getElementById('cfg-title');
    if (titleEl) titleEl.value = songData.header.title || "";
    const subtitleEl = document.getElementById('cfg-subtitle');
    if (subtitleEl) subtitleEl.value = songData.header.subtitle || "";
    const bpmEl = document.getElementById('cfg-bpm');
    if (bpmEl) bpmEl.value = songData.header.bpm || 120;
    const offsetEl = document.getElementById('cfg-offset');
    if (offsetEl) offsetEl.value = songData.header.offset || 0;
    const waveEl = document.getElementById('cfg-wave');
    if (waveEl) waveEl.value = songData.header.wave || "";
    const demostartEl = document.getElementById('cfg-demostart');
    if (demostartEl) demostartEl.value = songData.header.demostart || "";

    const songvolEl = document.getElementById('cfg-songvol');
    if (songvolEl) songvolEl.value = 100;
    const sevolEl = document.getElementById('cfg-sevol');
    if (sevolEl) sevolEl.value = 100;
    const scoremodeEl = document.getElementById('cfg-scoremode');
    if (scoremodeEl) scoremodeEl.value = "1";

    const levelUraEl = document.getElementById('cfg-level-ura');
    if (levelUraEl) levelUraEl.value = 1;
    const levelOniEl = document.getElementById('cfg-level-oni');
    if (levelOniEl) levelOniEl.value = 1;
    const levelHardEl = document.getElementById('cfg-level-hard');
    if (levelHardEl) levelHardEl.value = 1;
    const levelNormalEl = document.getElementById('cfg-level-normal');
    if (levelNormalEl) levelNormalEl.value = 1;
    const levelEasyEl = document.getElementById('cfg-level-easy');
    if (levelEasyEl) levelEasyEl.value = 1;

    // 4. 状態の初期化
    state.scrollX = 0;
    stopPlayback();
    state.selectedNotes = [];
    state.isSelecting = false;
    state.audioBuffer = null;
    state.waveformData = null;

    // 音源読込ボタンの表示を戻す
    const importAudioBtn = document.getElementById('btn-import-audio');
    if (importAudioBtn) importAudioBtn.textContent = "🎵 音源読込";
    const audioFileInput = document.getElementById('audio-file-input');
    if (audioFileInput) audioFileInput.value = "";

    // 5. 画面とプレビューの再描画
    draw();
    updateStatusBar();
    updateRightSidebarPreview();
}

// データ削除ボタンのクリックイベント
const clearDataBtn = document.getElementById('btn-clear-data');
if (clearDataBtn) {
    clearDataBtn.addEventListener('click', () => {
        if (confirm("譜面データをすべて削除し、初期状態にリセットしますか？")) {
            resetAllData();
        }
    });
}

// 全体プレビュー（ビジュアル）の描画ロジック
// 全体プレビュー（ビジュアル）の描画ロジック (単一キャンバス版)
function drawVisualPreview() {
    const canvas = document.getElementById('visual-preview-canvas');
    if (!canvas) return;

    const course = state.currentCourse;
    const branch = state.currentBranch;
    const measures = songData.courses[course];
    if (!measures) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.parentElement.clientWidth;
    if (w <= 0) return; // 親要素が折りたたまれている等で幅0の場合は処理しない

    const measureHeight = 32;
    const totalHeight = measures.length * measureHeight;

    // プレビューコンテナのサイズ変更を自動検知して再描画
    const previewContainer = canvas.parentElement;
    if (previewContainer && !previewContainer.dataset.observerAttached && window.ResizeObserver) {
        previewContainer.dataset.observerAttached = "true";
        const ro = new ResizeObserver(() => {
            if (!state.isRightSidebarCollapsed && state.rightSidebarTab === "visual") {
                drawVisualPreview();
            }
        });
        ro.observe(previewContainer);
    }

    // イベントリスナーの一度限りの登録
    if (!canvas.dataset.listenerAttached) {
        canvas.dataset.listenerAttached = "true";
        canvas.addEventListener('click', (e) => {
            const rect = canvas.getBoundingClientRect();
            // クリックされたY座標（キャンバスサイズにスケーリング）
            const clickY = (e.clientY - rect.top) * (canvas.clientHeight / rect.height);
            const idx = Math.floor(clickY / measureHeight);

            const activeCourse = state.currentCourse;
            const activeMeasures = songData.courses[activeCourse];
            if (activeMeasures && idx >= 0 && idx < activeMeasures.length) {
                const positions = calculateMeasurePositions(activeMeasures);
                if (positions[idx]) {
                    state.scrollX = positions[idx].startX;
                    draw();
                    updateStatusBar();
                }
            }
        });
    }

    // キャンバスサイズ設定
    if (canvas.width !== w * dpr || canvas.height !== totalHeight * dpr) {
        canvas.width = w * dpr;
        canvas.height = totalHeight * dpr;
        canvas.style.width = '100%';
        canvas.style.height = totalHeight + 'px';
    }

    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, totalHeight);

    // 背景
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, w, totalHeight);

    let isInGogo = false;

    measures.forEach((m, idx) => {
        const yStart = idx * measureHeight;
        const centerY = yStart + measureHeight / 2;

        // レーン背景
        ctx.fillStyle = '#222';
        ctx.fillRect(30, yStart + 4, w - 30, measureHeight - 8);

        // ゴーゴータイムのハイライト
        if (m.gogoStart !== false) isInGogo = true;

        let gogoStartX = 30;
        let gogoEndX = w;
        if (m.gogoStart !== false) {
            gogoStartX = 30 + m.gogoStart * (w - 30);
        }
        if (m.gogoEnd !== false) {
            gogoEndX = 30 + m.gogoEnd * (w - 30);
        }

        if (isInGogo || m.gogoStart !== false) {
            ctx.fillStyle = 'rgba(243, 156, 18, 0.15)';
            ctx.fillRect(gogoStartX, yStart + 4, gogoEndX - gogoStartX, measureHeight - 8);
        }

        if (m.gogoEnd !== false) isInGogo = false;

        // 小節の区切り線（下横線）
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, yStart + measureHeight - 1);
        ctx.lineTo(w, yStart + measureHeight - 1);
        ctx.stroke();

        // 小節番号の描画
        ctx.fillStyle = '#888';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(idx + 1, 15, centerY + 3);

        const startX = 30; // 判定枠位置
        const drawW = w - startX;

        // 拍のグリッド線
        const beats = m.signature[0];
        const step = drawW / beats;
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 0.5;
        for (let b = 1; b < beats; b++) {
            const gx = startX + b * step;
            ctx.beginPath();
            ctx.moveTo(gx, yStart + 4);
            ctx.lineTo(gx, yStart + measureHeight - 4);
            ctx.stroke();
        }

        // 小節線（先頭の縦の白線）
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(startX, yStart + 4);
        ctx.lineTo(startX, yStart + measureHeight - 4);
        ctx.stroke();

        // 判定枠の簡易表示
        ctx.beginPath();
        ctx.arc(startX, centerY, 4, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // ギミック（ゴーゴー、BPM、HS、拍子、細分数）の描画
        let textOffset = 0;
        ctx.font = '8px sans-serif';
        ctx.textAlign = 'left';

        // 拍子変化
        if (m.signature[0] !== 4 || m.signature[1] !== 4) {
            ctx.fillStyle = '#2ecc71';
            ctx.fillText(`${m.signature[0]}/${m.signature[1]}`, startX + 2, yStart + 12 + textOffset);
            textOffset += 8;
        }

        // 分割数（32分など16分以外の場合）
        if (m.subdivision && m.subdivision !== 16) {
            ctx.fillStyle = '#9b59b6';
            ctx.fillText(`${m.subdivision}分`, startX + 2, yStart + 12 + textOffset);
            textOffset += 8;
        }

        // BPM変化
        if (m.bpmChange !== null) {
            const markerX = startX + (m.bpmChangeOffset || 0) * drawW;
            ctx.fillStyle = '#e74c3c';
            ctx.fillText(`♩${m.bpmChange}`, markerX + 2, yStart + 12 + textOffset);
            textOffset += 8;
        }

        // HS（スクロール）変化
        if (m.scroll !== null) {
            const markerX = startX + (m.scrollOffset || 0) * drawW;
            ctx.fillStyle = '#3498db';
            ctx.fillText(`HS${m.scroll}`, markerX + 2, yStart + 12 + textOffset);
            textOffset += 8;
        }

        // ゴーゴーマーカー
        if (m.gogoStart !== false) {
            const markerX = startX + m.gogoStart * drawW;
            ctx.fillStyle = '#f39c12';
            ctx.fillText('🔥', markerX + 2, yStart + 12 + textOffset);
            textOffset += 8;
        }
        if (m.gogoEnd !== false) {
            const markerX = startX + m.gogoEnd * drawW;
            ctx.fillStyle = '#95a5a6';
            ctx.fillText('⏹', markerX + 2, yStart + 12 + textOffset);
        }

        // 32分音符など高密度小節の補助ガイド線（うっすら表示）
        const sub = m.subdivision || 16;
        if (sub >= 24) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.lineWidth = 0.5;
            const subStep = drawW / sub;
            for (let s = 1; s < sub; s++) {
                if (s % (sub / m.signature[0]) !== 0) {
                    const sx = startX + s * subStep;
                    ctx.beginPath();
                    ctx.moveTo(sx, yStart + 4);
                    ctx.lineTo(sx, yStart + measureHeight - 4);
                    ctx.stroke();
                }
            }
        }

        // 音符
        const notes = m.notes[branch] || [];
        const sortedNotes = [...notes].sort((a, b) => a.posIndex - b.posIndex);

        // 32分や高密度音符でも潰れないよう、音符間隔に応じて半径を動的調整
        const gridPx = drawW / Math.max(sub, 16);
        const densityRadius = Math.min(3.0, Math.max(1.6, gridPx * 0.42));

        let activeRollX = null;
        let activeRollType = null;

        sortedNotes.forEach(note => {
            const noteX = startX + (note.posIndex / sub) * drawW;

            if (['5', '6', '7', '9'].includes(note.type)) {
                activeRollX = noteX;
                activeRollType = note.type;
            } else if (note.type === '8' && activeRollX !== null) {
                drawMiniRollBar(ctx, activeRollX, noteX, centerY, activeRollType);
                activeRollX = null;
            } else if (activeRollX !== null) {
                drawMiniRollBar(ctx, activeRollX, noteX, centerY, activeRollType);
                activeRollX = null;
            }

            if (note.type !== '8') {
                drawMiniNote(ctx, noteX, centerY, note.type, densityRadius);
            }
        });

        if (activeRollX !== null) {
            drawMiniRollBar(ctx, activeRollX, w, centerY, activeRollType);
        }
    });

    ctx.restore();
}

function drawMiniRollBar(ctx, startX, endX, y, type) {
    if (startX >= endX) return;
    const height = ['6', '9'].includes(type) ? 8 : 5;
    const conf = NOTE_CONFIG[type];
    const color = conf ? conf.color : '#f1c40f';
    ctx.fillStyle = color;
    ctx.fillRect(startX, y - height / 2, endX - startX, height);
}

function drawMiniNote(ctx, x, y, type, densityRadius = 3.0) {
    const conf = NOTE_CONFIG[type];
    if (!conf) return;

    const baseR = Math.max(1.6, Math.min(3.2, densityRadius));
    const radius = conf.isLarge ? baseR * 1.35 : baseR;
    const color = conf.color;

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = baseR < 2.5 ? 'rgba(255, 255, 255, 0.75)' : '#fff';
    ctx.lineWidth = baseR < 2.5 ? 0.35 : 0.5;
    ctx.stroke();
}

// --- 9. TJAプレビューモーダルの制御 ---

const tjaOverlay = document.getElementById('tja-preview-overlay');
const tjaContent = document.getElementById('tja-preview-content');

document.getElementById('btn-tja-preview').addEventListener('click', () => {
    const tjaText = generateFullTja();
    tjaContent.textContent = tjaText;
    tjaOverlay.classList.add('active');
});

document.getElementById('tja-close-btn').addEventListener('click', () => {
    tjaOverlay.classList.remove('active');
});

tjaOverlay.addEventListener('click', (e) => {
    if (e.target === tjaOverlay) {
        tjaOverlay.classList.remove('active');
    }
});

document.getElementById('tja-copy-btn').addEventListener('click', () => {
    const text = tjaContent.textContent;
    navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('tja-copy-btn');
        const orig = btn.textContent;
        btn.textContent = "✅ コピー完了!";
        setTimeout(() => btn.textContent = orig, 1500);
    });
});

document.getElementById('tja-download-btn').addEventListener('click', () => {
    const text = tjaContent.textContent;
    const title = document.getElementById('cfg-title').value || "New Song";
    const blob = new Blob([text], { type: 'text/plain; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title}.tja`;
    a.click();
    URL.revokeObjectURL(url);
});

// --- TJA出力（拡張子選択ポップアップ） ---
const exportOverlay = document.getElementById('tja-export-overlay');

function downloadTjaAs(ext) {
    const tjaText = generateFullTja();
    const title = document.getElementById('cfg-title').value || "New Song";
    const blob = new Blob([tjaText], { type: 'text/plain; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title}${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    exportOverlay.classList.remove('active');
}

document.getElementById('btn-export').addEventListener('click', () => {
    exportOverlay.classList.add('active');
});

document.getElementById('export-tja').addEventListener('click', () => {
    downloadTjaAs('.tja');
});

document.getElementById('export-txt').addEventListener('click', () => {
    downloadTjaAs('.txt');
});

document.getElementById('export-cancel').addEventListener('click', () => {
    exportOverlay.classList.remove('active');
});

exportOverlay.addEventListener('click', (e) => {
    if (e.target === exportOverlay) {
        exportOverlay.classList.remove('active');
    }
});

// 初期描画
resizeCanvas();

// --- 10. 音楽管理 (AudioManager) ---

// 波形データを生成（AudioBuffer → 間引きデータ配列）
function generateWaveformData(audioBuffer) {
    const rawData = audioBuffer.getChannelData(0); // モノラルまたは左チャンネル
    const sampleRate = audioBuffer.sampleRate;
    const bpm = parseFloat(document.getElementById('cfg-bpm').value) || 120;
    const pxPerBeat = state.basePxPerBeat * state.zoomLevel;
    const pxPerSecond = pxPerBeat * (bpm / 60);
    const totalPx = Math.ceil(audioBuffer.duration * pxPerSecond);

    // 1ピクセルごとの最大/最小値を計算
    const data = [];
    for (let px = 0; px < totalPx; px++) {
        const startSample = Math.floor((px / pxPerSecond) * sampleRate);
        const endSample = Math.floor(((px + 1) / pxPerSecond) * sampleRate);
        let min = 1, max = -1;
        for (let s = startSample; s < endSample && s < rawData.length; s++) {
            if (rawData[s] < min) min = rawData[s];
            if (rawData[s] > max) max = rawData[s];
        }
        data.push({ min, max });
    }
    return data;
}

// 波形を描画する関数
function drawWaveform() {
    if (!state.waveformData) return;

    const offset = parseFloat(document.getElementById('cfg-offset').value) || 0;
    const bpm = parseFloat(document.getElementById('cfg-bpm').value) || 120;
    const pxPerBeat = state.basePxPerBeat * state.zoomLevel;
    const pxPerSecond = pxPerBeat * (bpm / 60);

    // プラスなら曲が後から再生（波形は右へズレる）、マイナスなら曲が手前に再生（波形は左へズレる）
    const offsetPx = offset * pxPerSecond;
    const waveStartX = JUDGE_X + offsetPx - state.scrollX;

    const waveformHeight = 60;
    const centerY = LANE_Y;

    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = "#2ecc71";
    ctx.lineWidth = 1;

    ctx.beginPath();
    for (let px = 0; px < state.waveformData.length; px++) {
        const screenX = waveStartX + px;
        if (screenX < -1 || screenX > canvas.width + 1) continue;

        const d = state.waveformData[px];
        const yTop = centerY + d.min * waveformHeight;
        const yBot = centerY + d.max * waveformHeight;

        ctx.moveTo(screenX, yTop);
        ctx.lineTo(screenX, yBot);
    }
    ctx.stroke();
    ctx.restore();
}

// 楽曲インポート処理
document.getElementById('btn-import-audio').addEventListener('click', () => {
    document.getElementById('audio-file-input').click();
});

// 曲の冒頭の無音時間を検出する
function detectLeadingSilence(audioBuffer, threshold = 0.005) {
    const data = audioBuffer.getChannelData(0); // 左チャンネルを使用
    for (let i = 0; i < data.length; i++) {
        if (Math.abs(data[i]) > threshold) {
            return i / audioBuffer.sampleRate;
        }
    }
    return 0;
}

async function detectBPM(audioBuffer) {
    try {
        const offlineContext = new OfflineAudioContext(1, audioBuffer.length, audioBuffer.sampleRate);
        const source = offlineContext.createBufferSource();
        source.buffer = audioBuffer;

        // ローパスフィルタでキック等の低音を強調
        const filter = offlineContext.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 150;

        source.connect(filter);
        filter.connect(offlineContext.destination);
        source.start(0);

        const filteredBuffer = await offlineContext.startRendering();
        const data = filteredBuffer.getChannelData(0);

        // ピークの最大値を取得
        let maxVal = 0;
        for (let i = 0; i < data.length; i++) {
            if (Math.abs(data[i]) > maxVal) maxVal = Math.abs(data[i]);
        }

        // 閾値を設定してピーク位置（サンプルインデックス）を抽出
        const threshold = maxVal * 0.8;
        const peaks = [];
        const skipSamples = Math.floor(audioBuffer.sampleRate / 4); // 240BPM相当以上の速さの連打は無視

        for (let i = 0; i < data.length; i++) {
            if (data[i] > threshold) {
                peaks.push(i);
                i += skipSamples;
            }
        }

        if (peaks.length < 2) return null;

        // ピーク間の間隔からBPMを計算し、多数決をとる
        const intervals = {};
        for (let i = 1; i < peaks.length; i++) {
            const interval = peaks[i] - peaks[i - 1];
            let tempo = Math.round(60 / (interval / audioBuffer.sampleRate));

            // テンポが遅すぎる場合は倍取り（8分を4分と誤認した場合など）、早すぎる場合は半切り
            while (tempo < 70) tempo *= 2;
            while (tempo > 240) tempo /= 2;

            tempo = Math.round(tempo);
            if (tempo >= 70 && tempo <= 240) {
                intervals[tempo] = (intervals[tempo] || 0) + 1;
            }
        }

        let bestBpm = null;
        let maxCount = 0;
        for (const bpm in intervals) {
            if (intervals[bpm] > maxCount) {
                maxCount = intervals[bpm];
                bestBpm = parseInt(bpm);
            }
        }

        return bestBpm;
    } catch (e) {
        console.error("BPM detection failed:", e);
        return null;
    }
}

document.getElementById('audio-file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // WAVEフィールドにファイル名を自動入力
    document.getElementById('cfg-wave').value = file.name;

    // AudioContext 初期化
    if (!state.audioContext) {
        state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    // ボタン表示を処理中に変更
    const btn = document.getElementById('btn-import-audio');
    btn.textContent = "⏳ 読み込み・解析中...";

    // ファイルをデコード
    const arrayBuffer = await file.arrayBuffer();
    state.audioBuffer = await state.audioContext.decodeAudioData(arrayBuffer);

    // BPMを自動測定
    const detectedBpm = await detectBPM(state.audioBuffer);
    const currentBpmInput = document.getElementById('cfg-bpm');
    // 現在のBPMがデフォルト(120)または空の場合のみ、自動測定結果を反映する
    if (detectedBpm && (currentBpmInput.value === "120" || currentBpmInput.value === "")) {
        currentBpmInput.value = detectedBpm;
    }

    // 無音地帯の検出と自動OFFSET調整
    const silenceDuration = detectLeadingSilence(state.audioBuffer);
    if (silenceDuration > 0.02) { // 0.02秒以上の無音がある場合
        if (confirm(`曲の冒頭に約 ${silenceDuration.toFixed(3)} 秒の無音を検出しました。\nこの無音分を詰めて（OFFSETをマイナス方向に調整して）読み込みますか？`)) {
            const offsetInput = document.getElementById('cfg-offset');
            const currentOffset = parseFloat(offsetInput.value) || 0;
            // 無音分だけOFFSETを引き、曲を「手前」に持ってくる
            offsetInput.value = (currentOffset - silenceDuration).toFixed(3);
        }
    }

    // 波形データ生成
    state.waveformData = generateWaveformData(state.audioBuffer);

    // ボタン表示更新
    btn.textContent = `🎵 ${file.name}`;

    draw();
});

// 再生/停止切り替え
function togglePlayback() {
    if (state.isPlaying) {
        stopPlayback();
    } else {
        startPlayback();
    }
}

// --- 可変BPM（途中のBPM変化）対応の再生タイミング計算 ---

// 譜面全体の小節およびBPM変化区間の時間マップを構築
function getMeasureTimingMap(measures) {
    const baseBpm = parseFloat(document.getElementById('cfg-bpm').value) || 120;
    const pxPerBeat = state.basePxPerBeat * state.zoomLevel;
    const positions = calculateMeasurePositions(measures);

    let currentBpm = baseBpm;
    let accumulatedTime = 0; // 秒

    // 各小節ごとの時間情報
    const timingList = [];

    for (let i = 0; i < positions.length; i++) {
        const pos = positions[i];
        const m = pos.measure;
        const totalBeats = (m.signature[0] / m.signature[1]) * 4;

        // この小節でBPM変化があるか
        if (m.bpmChange !== null && !isNaN(m.bpmChange) && m.bpmChange > 0) {
            const offset = Math.max(0, Math.min(0.999, m.bpmChangeOffset || 0));
            const beatsBefore = totalBeats * offset;
            const beatsAfter = totalBeats * (1 - offset);

            const durationBefore = beatsBefore * (60 / currentBpm);
            currentBpm = m.bpmChange;
            const durationAfter = beatsAfter * (60 / currentBpm);

            timingList.push({
                measureIdx: i,
                startX: pos.startX,
                width: pos.width,
                startTime: accumulatedTime,
                duration: durationBefore + durationAfter,
                splitOffset: offset,
                splitX: pos.startX + pos.width * offset,
                splitTime: accumulatedTime + durationBefore,
                bpmBefore: currentBpm,
                bpmAfter: m.bpmChange
            });
            accumulatedTime += durationBefore + durationAfter;
        } else {
            const duration = totalBeats * (60 / currentBpm);
            timingList.push({
                measureIdx: i,
                startX: pos.startX,
                width: pos.width,
                startTime: accumulatedTime,
                duration: duration,
                splitOffset: null,
                bpm: currentBpm
            });
            accumulatedTime += duration;
        }
    }

    return { timingList, totalTime: accumulatedTime, finalBpm: currentBpm };
}

// 譜面時間 (秒) から スクロール位置 (px) を計算
function getScrollXFromTime(timeInSeconds, measures) {
    if (timeInSeconds <= 0) return 0;
    const { timingList, finalBpm } = getMeasureTimingMap(measures);
    const pxPerBeat = state.basePxPerBeat * state.zoomLevel;

    for (let i = 0; i < timingList.length; i++) {
        const t = timingList[i];
        if (timeInSeconds >= t.startTime && timeInSeconds < t.startTime + t.duration) {
            if (t.splitOffset !== null) {
                if (timeInSeconds < t.splitTime) {
                    const ratio = (timeInSeconds - t.startTime) / (t.splitTime - t.startTime || 1);
                    return t.startX + (t.splitX - t.startX) * ratio;
                } else {
                    const ratio = (timeInSeconds - t.splitTime) / ((t.startTime + t.duration) - t.splitTime || 1);
                    return t.splitX + (t.startX + t.width - t.splitX) * ratio;
                }
            } else {
                const ratio = (timeInSeconds - t.startTime) / (t.duration || 1);
                return t.startX + t.width * ratio;
            }
        }
    }

    // 最後の小節以降
    if (timingList.length > 0) {
        const last = timingList[timingList.length - 1];
        const extraTime = timeInSeconds - (last.startTime + last.duration);
        const pxPerSecond = pxPerBeat * (finalBpm / 60);
        return (last.startX + last.width) + extraTime * pxPerSecond;
    }

    const baseBpm = parseFloat(document.getElementById('cfg-bpm').value) || 120;
    return timeInSeconds * (pxPerBeat * (baseBpm / 60));
}

// スクロール位置 (px) から 譜面時間 (秒) を計算
function getTimeFromScrollX(scrollX, measures) {
    if (scrollX <= 0) return 0;
    const { timingList, finalBpm } = getMeasureTimingMap(measures);
    const pxPerBeat = state.basePxPerBeat * state.zoomLevel;

    for (let i = 0; i < timingList.length; i++) {
        const t = timingList[i];
        if (scrollX >= t.startX && scrollX < t.startX + t.width) {
            if (t.splitOffset !== null) {
                if (scrollX < t.splitX) {
                    const ratio = (scrollX - t.startX) / (t.splitX - t.startX || 1);
                    return t.startTime + (t.splitTime - t.startTime) * ratio;
                } else {
                    const ratio = (scrollX - t.splitX) / ((t.startX + t.width) - t.splitX || 1);
                    return t.splitTime + ((t.startTime + t.duration) - t.splitTime) * ratio;
                }
            } else {
                const ratio = (scrollX - t.startX) / (t.width || 1);
                return t.startTime + t.duration * ratio;
            }
        }
    }

    // 最後の小節以降
    if (timingList.length > 0) {
        const last = timingList[timingList.length - 1];
        const extraX = scrollX - (last.startX + last.width);
        const pxPerSecond = pxPerBeat * (finalBpm / 60);
        return (last.startTime + last.duration) + (extraX / (pxPerSecond || 1));
    }

    const baseBpm = parseFloat(document.getElementById('cfg-bpm').value) || 120;
    return scrollX / (pxPerBeat * (baseBpm / 60) || 1);
}

function startPlayback() {
    if (!state.audioBuffer || !state.audioContext) return;

    // AudioSource を作成
    state.audioSource = state.audioContext.createBufferSource();
    state.audioSource.buffer = state.audioBuffer;
    state.audioSource.connect(state.audioContext.destination);

    const offset = parseFloat(document.getElementById('cfg-offset').value) || 0;
    const measures = songData.courses[state.currentCourse] || [];

    // 現在のスクロール位置から再生開始時間を計算（可変BPM対応）
    const songTime = getTimeFromScrollX(state.scrollX, measures);
    const currentTime = songTime - offset;

    let playDelay = 0;
    let audioStartTime = 0;

    if (currentTime < 0) {
        // 曲が後から始まる場合（まだ再生位置に達していない）
        playDelay = -currentTime;
        audioStartTime = 0;
    } else {
        // 曲がすでに始まっている場合
        playDelay = 0;
        audioStartTime = currentTime;
    }

    state.audioSource.start(state.audioContext.currentTime + playDelay, audioStartTime);
    state.playStartTime = state.audioContext.currentTime + playDelay - audioStartTime;
    state.isPlaying = true;

    // ボタン更新
    const btn = document.getElementById('btn-play');
    btn.textContent = "⏸ 停止 (Enter)";
    btn.classList.add('playing');

    // 再生終了イベント
    state.audioSource.onended = () => {
        if (state.isPlaying) stopPlayback();
    };

    // 追尾アニメーション開始
    playbackAnimation();
}

function stopPlayback() {
    if (state.audioSource) {
        try { state.audioSource.stop(); } catch (e) { }
        state.audioSource = null;
    }

    state.isPlaying = false;
    if (state.playAnimationId) {
        cancelAnimationFrame(state.playAnimationId);
        state.playAnimationId = null;
    }

    // ボタン更新
    const btn = document.getElementById('btn-play');
    btn.textContent = "▶ 再生 (Enter)";
    btn.classList.remove('playing');
}

// 再生中の追尾アニメーション
function playbackAnimation() {
    if (!state.isPlaying) return;

    const offset = parseFloat(document.getElementById('cfg-offset').value) || 0;
    const measures = songData.courses[state.currentCourse] || [];

    // 現在の再生時間を取得（曲の0:00位置からの経過時間）
    const currentAudioTime = state.audioContext.currentTime - state.playStartTime;
    // 再生位置をスクロール座標に変換（曲の経過時間 + オフセット = 譜面の時間、可変BPM対応）
    const songTime = currentAudioTime + offset;
    const targetScrollX = getScrollXFromTime(songTime, measures);

    state.scrollX = Math.max(0, targetScrollX);

    // 再生位置ライン（赤い縦線）を判定枠の位置に表示
    draw();

    // 再生中は赤い縦線を描画
    ctx.save();
    ctx.strokeStyle = "#e74c3c";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(JUDGE_X, 0);
    ctx.lineTo(JUDGE_X, canvas.height);
    ctx.stroke();
    ctx.restore();

    updateStatusBar();

    state.playAnimationId = requestAnimationFrame(playbackAnimation);
}

// 再生ボタンのクリック
const btnPlay = document.getElementById('btn-play');
if (btnPlay) {
    btnPlay.addEventListener('click', () => {
        togglePlayback();
    });
}

// --- トランスポートバー＆履歴ボタンの初期化 ---
function initTransportAndHistory() {
    const undoBtn = document.getElementById('btn-undo');
    const redoBtn = document.getElementById('btn-redo');
    const rewindBtn = document.getElementById('btn-rewind');
    const prevMeasBtn = document.getElementById('btn-prev-measure');
    const nextMeasBtn = document.getElementById('btn-next-measure');

    if (undoBtn) undoBtn.addEventListener('click', undo);
    if (redoBtn) redoBtn.addEventListener('click', redo);
    if (rewindBtn) rewindBtn.addEventListener('click', rewindToStart);
    if (prevMeasBtn) prevMeasBtn.addEventListener('click', prevMeasure);
    if (nextMeasBtn) nextMeasBtn.addEventListener('click', nextMeasure);

    updateUndoRedoButtons();
}

initTransportAndHistory();

// 連続配置モードの切り替え
const btnContinuous = document.getElementById('btn-continuous');
btnContinuous.addEventListener('click', () => {
    toggleContinuousMode();
});

function toggleContinuousMode() {
    state.isContinuousMode = !state.isContinuousMode;
    if (state.isContinuousMode) {
        btnContinuous.classList.add('active');
        btnContinuous.innerHTML = "🔄 連続配置 (ON)";
    } else {
        btnContinuous.classList.remove('active');
        btnContinuous.innerHTML = "🔄 連続配置(C)";
    }
}

// --- 9. TJAインポート処理 ---
document.getElementById('btn-import-tja').addEventListener('click', () => {
    document.getElementById('tja-file-input').click();
});

document.getElementById('tja-file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        const text = event.target.result;
        const loadedCourse = parseTJA(text);

        // 読み込み完了後にUIを更新
        document.getElementById('cfg-title').value = songData.header.title || "";
        document.getElementById('cfg-subtitle').value = songData.header.subtitle || "";
        document.getElementById('cfg-bpm').value = songData.header.bpm || 120;
        document.getElementById('cfg-offset').value = songData.header.offset || 0;
        document.getElementById('cfg-wave').value = songData.header.wave || "";
        document.getElementById('cfg-demostart').value = songData.header.demostart || "";

        state.currentCourse = loadedCourse || "Oni"; // 読込対象の難易度を開く
        const courseTabs = document.querySelectorAll('.course-tabs .tab');
        courseTabs.forEach(tab => {
            if (tab.dataset.course === state.currentCourse) tab.classList.add('active');
            else tab.classList.remove('active');
        });

        // 保存予約と再描画
        autoSave();
        draw();
    };
    // Shift_JISで読み込む（日本のTJAで主流）
    reader.readAsText(file, 'Shift_JIS');
});

// --- 9.5 TJA トークナイザー & パーサー (Tokenizer & Parser) ---

/**
 * TJA トークナイザー（字句解析器）
 * ヘッダーブロックと譜面本体ブロックを厳密に分離し、
 * タイトルやサブタイトル内の記号・数字・コマンド風文字列による誤作動を完全に防止する。
 */
class TjaTokenizer {
    // 譜面ブロック内の文字列をトークン列に変換する
    static tokenizeChartLine(line) {
        const tokens = [];
        let i = 0;
        const len = line.length;

        while (i < len) {
            const ch = line[i];

            // コメントの開始 (//) -> 行末までコメントなのでスキップ
            if (ch === '/' && line[i + 1] === '/') {
                break;
            }

            // コマンドの開始 (#)
            if (ch === '#') {
                const rest = line.substring(i);
                // コマンド名を取得（英字・数字）
                const cmdMatch = rest.match(/^#([A-Za-z0-9_]+)/);
                if (cmdMatch) {
                    const rawName = cmdMatch[1].toUpperCase();
                    let rawArgs = '';
                    let matchLen = cmdMatch[0].length;

                    const afterCmd = rest.substring(matchLen);
                    if (['BPMCHANGE', 'SCROLL', 'DELAY'].includes(rawName)) {
                        const argM = afterCmd.match(/^[\s:]*([0-9.-]+)/);
                        if (argM) {
                            rawArgs = argM[1];
                            matchLen += argM[0].length;
                        }
                    } else if (rawName === 'MEASURE') {
                        const argM = afterCmd.match(/^[\s:]*([0-9]+\s*\/\s*[0-9]+)/);
                        if (argM) {
                            rawArgs = argM[1];
                            matchLen += argM[0].length;
                        }
                    } else if (rawName === 'BRANCHSTART') {
                        const argM = afterCmd.match(/^[\s:]*([^\r\n,#]*)/);
                        if (argM) {
                            rawArgs = argM[1].trim();
                            matchLen += argM[0].length;
                        }
                    } else {
                        // 引数なしコマンド (GOGOSTART, GOGOEND, N, E, M, SECTION 等)
                        const spaceM = afterCmd.match(/^[\s]+/);
                        if (spaceM) {
                            matchLen += spaceM[0].length;
                        }
                    }

                    tokens.push({
                        type: 'COMMAND',
                        name: rawName,
                        args: rawArgs,
                        raw: rest.substring(0, matchLen)
                    });
                    i += matchLen;
                    continue;
                }
                i++;
                continue;
            }

            // 小節区切り (,)
            if (ch === ',') {
                tokens.push({ type: 'COMMA' });
                i++;
                continue;
            }

            // 音符数字 (0-9)
            if (ch >= '0' && ch <= '9') {
                tokens.push({ type: 'NOTE', val: ch });
                i++;
                continue;
            }

            // 空白文字などはスキップ
            i++;
        }

        return tokens;
    }

    // ヘッダー行を安全にパースする（TITLE, SUBTITLE, BPM 等）
    // ※ タイトル値の中に '#' や ',' や数字があっても純粋な文字列として保護する
    static parseHeaderLine(line) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('//')) return null;

        // 行末のコメントを慎重に除去（ただし http:// や https:// の // は保護）
        let cleanLine = trimmed;
        const commentIdx = cleanLine.search(/(?<!https?:)\s+\/\//);
        if (commentIdx !== -1) {
            cleanLine = cleanLine.substring(0, commentIdx).trim();
        }

        // KEY: VALUE 形式を検出
        const colonIdx = cleanLine.indexOf(':');
        if (colonIdx > 0) {
            const key = cleanLine.substring(0, colonIdx).trim().toUpperCase();
            const val = cleanLine.substring(colonIdx + 1).trim();
            // 妥当なヘッダーキー名（英数字のみ）か検証
            if (/^[A-Z0-9_]+$/.test(key)) {
                return { key, val };
            }
        }

        return null;
    }
}

/**
 * TJA パーサー（構文解析器）
 */
class TjaParser {
    static parse(text) {
        const lines = text.split(/\r?\n/);

        const newSongData = {
            header: { title: "New Song", subtitle: "", wave: "", bpm: 120, offset: 0, demostart: "" },
            courses: {
                Oni: [], Ura: [], Hard: [], Normal: [], Easy: []
            }
        };

        const courseTypeMap = {
            '0': 'Easy', 'easy': 'Easy',
            '1': 'Normal', 'normal': 'Normal',
            '2': 'Hard', 'hard': 'Hard',
            '3': 'Oni', 'oni': 'Oni',
            '4': 'Ura', 'edit': 'Ura', 'ura': 'Ura'
        };

        let currentCourse = 'Oni';
        let inChart = false;
        let currentBranch = 'normal'; // 'normal', 'expert', 'master'
        let currentMeasure = createEmptyMeasure();
        let measureTokens = [];
        let targetMeasureIdx = 0;
        let branchStartIdx = 0;
        let firstBpmChangeFound = null;

        const finalizeMeasure = () => {
            const notesOnly = measureTokens.filter(t => t.type === 'NOTE');
            let sub = notesOnly.length;
            if (sub === 0) sub = 16;
            currentMeasure.subdivision = sub;

            let noteIdx = 0;
            measureTokens.forEach(t => {
                if (t.type === 'NOTE') {
                    if (t.val !== '0') {
                        currentMeasure.notes[currentBranch].push({
                            posIndex: noteIdx,
                            type: t.val,
                            val: 0
                        });
                    }
                    noteIdx++;
                } else if (t.type === 'COMMAND') {
                    const offset = sub > 0 ? (noteIdx / sub) : 0;
                    switch (t.name) {
                        case 'BPMCHANGE': {
                            const bpm = parseFloat(t.args);
                            if (!isNaN(bpm) && bpm > 0) {
                                currentMeasure.bpmChange = bpm;
                                currentMeasure.bpmChangeOffset = offset;
                                if (firstBpmChangeFound === null) firstBpmChangeFound = bpm;
                            }
                            break;
                        }
                        case 'SCROLL': {
                            const sc = parseFloat(t.args);
                            if (!isNaN(sc)) {
                                currentMeasure.scroll = sc;
                                currentMeasure.scrollOffset = offset;
                            }
                            break;
                        }
                        case 'MEASURE': {
                            const parts = t.args.split('/');
                            if (parts.length === 2) {
                                const num = parseInt(parts[0], 10);
                                const den = parseInt(parts[1], 10);
                                if (!isNaN(num) && !isNaN(den) && num > 0 && den > 0) {
                                    currentMeasure.signature = [num, den];
                                }
                            }
                            break;
                        }
                        case 'GOGOSTART': {
                            currentMeasure.gogoStart = offset;
                            break;
                        }
                        case 'GOGOEND': {
                            currentMeasure.gogoEnd = offset;
                            break;
                        }
                    }
                }
            });

            const courseArr = newSongData.courses[currentCourse];
            if (courseArr) {
                if (targetMeasureIdx < courseArr.length) {
                    if (currentBranch === 'normal') {
                        courseArr[targetMeasureIdx] = currentMeasure;
                    } else {
                        courseArr[targetMeasureIdx].notes[currentBranch] = currentMeasure.notes[currentBranch];
                        // ギミック設定の共有・補完
                        if (currentMeasure.bpmChange !== null && courseArr[targetMeasureIdx].bpmChange === null) {
                            courseArr[targetMeasureIdx].bpmChange = currentMeasure.bpmChange;
                            courseArr[targetMeasureIdx].bpmChangeOffset = currentMeasure.bpmChangeOffset;
                        }
                        if (currentMeasure.scroll !== null && courseArr[targetMeasureIdx].scroll === null) {
                            courseArr[targetMeasureIdx].scroll = currentMeasure.scroll;
                            courseArr[targetMeasureIdx].scrollOffset = currentMeasure.scrollOffset;
                        }
                    }
                } else {
                    courseArr.push(currentMeasure);
                }
            }

            targetMeasureIdx++;

            const nextMeasure = createEmptyMeasure();
            nextMeasure.signature = [...currentMeasure.signature];
            currentMeasure = nextMeasure;
            measureTokens = [];
        };

        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            const rawLine = lines[lineIdx];
            const trimmed = rawLine.trim();
            if (!trimmed) continue;

            // 1. ヘッダー状態（#START 前、または #END 後）
            // ※ TITLE や SUBTITLE の中に '#' や ',' が含まれていても安全に解析する
            if (!inChart) {
                // #START コマンドを検出
                if (/^#START\b/i.test(trimmed)) {
                    inChart = true;
                    currentBranch = 'normal';
                    currentMeasure = createEmptyMeasure();
                    measureTokens = [];
                    targetMeasureIdx = 0;
                    branchStartIdx = 0;
                    continue;
                }

                // ヘッダー行の安全な解析
                const headerEntry = TjaTokenizer.parseHeaderLine(trimmed);
                if (headerEntry) {
                    const { key, val } = headerEntry;
                    if (key === 'TITLE') newSongData.header.title = val;
                    else if (key === 'SUBTITLE') newSongData.header.subtitle = val;
                    else if (key === 'BPM') newSongData.header.bpm = parseFloat(val) || 120;
                    else if (key === 'OFFSET') newSongData.header.offset = parseFloat(val) || 0;
                    else if (key === 'WAVE') newSongData.header.wave = val;
                    else if (key === 'DEMOSTART') newSongData.header.demostart = parseFloat(val) || 0;
                    else if (key === 'COURSE') {
                        const cLower = val.toLowerCase();
                        currentCourse = courseTypeMap[cLower] || 'Oni';
                    }
                }
                continue;
            }

            // 2. 譜面データ状態（#START 〜 #END）
            // #END コマンドを検出
            if (/^#END\b/i.test(trimmed)) {
                inChart = false;
                if (measureTokens.length > 0) finalizeMeasure();
                continue;
            }

            // 分岐制御コマンドの先行チェック（行頭）
            if (/^#BRANCHSTART\b/i.test(trimmed)) {
                if (measureTokens.length > 0) finalizeMeasure();
                branchStartIdx = targetMeasureIdx;
                continue;
            } else if (/^#N\b/i.test(trimmed)) {
                if (measureTokens.length > 0) finalizeMeasure();
                currentBranch = 'normal';
                targetMeasureIdx = branchStartIdx;
                currentMeasure = createEmptyMeasure();
                if (targetMeasureIdx > 0 && newSongData.courses[currentCourse] && newSongData.courses[currentCourse][targetMeasureIdx - 1]) {
                    currentMeasure.signature = [...newSongData.courses[currentCourse][targetMeasureIdx - 1].signature];
                }
                continue;
            } else if (/^#E\b/i.test(trimmed)) {
                if (measureTokens.length > 0) finalizeMeasure();
                currentBranch = 'expert';
                targetMeasureIdx = branchStartIdx;
                currentMeasure = createEmptyMeasure();
                if (targetMeasureIdx > 0 && newSongData.courses[currentCourse] && newSongData.courses[currentCourse][targetMeasureIdx - 1]) {
                    currentMeasure.signature = [...newSongData.courses[currentCourse][targetMeasureIdx - 1].signature];
                }
                continue;
            } else if (/^#M\b/i.test(trimmed)) {
                if (measureTokens.length > 0) finalizeMeasure();
                currentBranch = 'master';
                targetMeasureIdx = branchStartIdx;
                currentMeasure = createEmptyMeasure();
                if (targetMeasureIdx > 0 && newSongData.courses[currentCourse] && newSongData.courses[currentCourse][targetMeasureIdx - 1]) {
                    currentMeasure.signature = [...newSongData.courses[currentCourse][targetMeasureIdx - 1].signature];
                }
                continue;
            }

            // 行内の音符・インラインギミック・カンマをトークナイザーで字句解析
            const tokens = TjaTokenizer.tokenizeChartLine(trimmed);
            tokens.forEach(token => {
                if (token.type === 'COMMA') {
                    finalizeMeasure();
                } else {
                    measureTokens.push(token);
                }
            });
        }

        // ヘッダーBPMが未指定で、最初の小節でBPM変化があった場合はヘッダーBPMに補完
        if ((!newSongData.header.bpm || newSongData.header.bpm === 120) && firstBpmChangeFound !== null) {
            newSongData.header.bpm = firstBpmChangeFound;
        }

        // 空の難易度にデフォルトを詰める
        Object.keys(newSongData.courses).forEach(key => {
            if (newSongData.courses[key].length === 0) {
                newSongData.courses[key] = [createEmptyMeasure()];
            }
        });

        return { songData: newSongData, activeCourse: currentCourse };
    }
}

function parseTJA(text) {
    const result = TjaParser.parse(text);
    songData = result.songData;
    return result.activeCourse;
}

// 数値入力ポップアップ以外をクリックした時にキャンセルするグローバルリスナー
window.addEventListener('mousedown', (e) => {
    if (state.mode === "NUM_INPUT") {
        const popup = document.getElementById('num-input-popup');
        // クリックされた要素がポップアップ本体、またはその子要素でなければキャンセル
        if (popup && !popup.contains(e.target)) {
            cancelNumberInput();
        }
    }
}, true);

// --- 11. リリースノート管理 ---
const CURRENT_RELEASE_VERSION = "2026-09-29-v4";

function initReleaseNotes() {
    const overlay = document.getElementById('release-notes-overlay');
    const closeBtn = document.getElementById('release-notes-close');
    const okBtn = document.getElementById('release-notes-ok');

    if (!overlay) return;

    const dismissReleaseNotes = () => {
        overlay.classList.remove('active');
        try {
            localStorage.setItem('taikoEditorReleaseReadVersion', CURRENT_RELEASE_VERSION);
        } catch (e) {
            console.warn("Failed to save release notes status", e);
        }
    };

    if (closeBtn) {
        closeBtn.addEventListener('click', dismissReleaseNotes);
    }
    if (okBtn) {
        okBtn.addEventListener('click', dismissReleaseNotes);
    }

    // モーダル背景クリックでも閉じる
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            dismissReleaseNotes();
        }
    });

    // 初回起動時または更新フラグ（未読バージョン）がある場合に表示
    try {
        const lastRead = localStorage.getItem('taikoEditorReleaseReadVersion');
        if (lastRead !== CURRENT_RELEASE_VERSION) {
            overlay.classList.add('active');
        }
    } catch (e) {
        console.warn("Failed to check release notes status", e);
    }
}

initReleaseNotes();

// --- 12. 操作ガイド・マニュアル管理 ---
function initGuideModal() {
    const guideOverlay = document.getElementById('guide-overlay');
    const guideBtn = document.getElementById('btn-guide');
    const closeBtn = document.getElementById('guide-close-btn');
    const prevBtn = document.getElementById('guide-prev-btn');
    const nextBtn = document.getElementById('guide-next-btn');
    const pageBadge = document.getElementById('guide-page-badge');
    const tabBtns = document.querySelectorAll('.guide-tab-btn');
    const pages = document.querySelectorAll('.guide-page');

    if (!guideOverlay) return;

    const TOTAL_PAGES = 5;
    const PAGE_TITLES = {
        1: "1 / 5 音符入力",
        2: "2 / 5 プレビュー",
        3: "3 / 5 設定・ギミック",
        4: "4 / 5 入出力・再生",
        5: "5 / 5 全操作一覧"
    };

    let currentPage = 5; // 初回起動時・再オープン時ともに「最後の一覧 (5)」をデフォルトに

    function setGuidePage(pageNum) {
        if (pageNum < 1) pageNum = 1;
        if (pageNum > TOTAL_PAGES) pageNum = TOTAL_PAGES;
        currentPage = pageNum;

        // ページの表示切り替え
        pages.forEach(p => {
            const pageId = parseInt(p.getAttribute('data-page'), 10);
            p.classList.toggle('active', pageId === currentPage);
        });

        // 下部タブのアクティブ状態更新
        tabBtns.forEach(btn => {
            const target = parseInt(btn.getAttribute('data-target'), 10);
            btn.classList.toggle('active', target === currentPage);
        });

        // バッジ更新
        if (pageBadge) {
            pageBadge.textContent = PAGE_TITLES[currentPage] || `${currentPage} / ${TOTAL_PAGES}`;
        }

        // 前へ / 次へ ボタンの文言・状態更新
        if (prevBtn) {
            prevBtn.disabled = (currentPage === 1);
            prevBtn.style.opacity = (currentPage === 1) ? '0.5' : '1';
        }
        if (nextBtn) {
            if (currentPage === TOTAL_PAGES) {
                nextBtn.textContent = '最初に戻る ↺';
            } else {
                nextBtn.textContent = '次へ ▶';
            }
        }
    }

    function openGuideModal(targetPage = 5) {
        setGuidePage(targetPage);
        guideOverlay.style.display = 'flex';
        guideOverlay.classList.add('active');
    }

    function closeGuideModal() {
        guideOverlay.style.display = 'none';
        guideOverlay.classList.remove('active');
    }

    // ボタンクリックイベント
    if (guideBtn) {
        guideBtn.addEventListener('click', () => openGuideModal(5));
    }
    if (closeBtn) {
        closeBtn.addEventListener('click', closeGuideModal);
    }
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                setGuidePage(currentPage - 1);
            }
        });
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            if (currentPage < TOTAL_PAGES) {
                setGuidePage(currentPage + 1);
            } else {
                setGuidePage(1); // 最終ページからは最初に戻る
            }
        });
    }

    // 下部のページ選択タブ
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = parseInt(btn.getAttribute('data-target'), 10);
            if (!isNaN(target)) {
                setGuidePage(target);
            }
        });
    });

    // モーダル背景クリックで閉じる
    guideOverlay.addEventListener('click', (e) => {
        if (e.target === guideOverlay) {
            closeGuideModal();
        }
    });

    // キーボードショートカット
    window.addEventListener('keydown', (e) => {
        const isGuideOpen = guideOverlay.classList.contains('active') && guideOverlay.style.display !== 'none';

        if (isGuideOpen) {
            if (e.key === 'Escape') {
                e.preventDefault();
                closeGuideModal();
                return;
            }
            if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
                e.preventDefault();
                if (currentPage > 1) setGuidePage(currentPage - 1);
                return;
            }
            if (e.key === 'ArrowRight' || e.key === 'PageDown') {
                e.preventDefault();
                if (currentPage < TOTAL_PAGES) setGuidePage(currentPage + 1);
                else setGuidePage(1);
                return;
            }
            if (e.key === '?' || (e.shiftKey && e.key === '/') || e.key === 'F1') {
                e.preventDefault();
                closeGuideModal();
                return;
            }
        } else {
            // ガイド非表示時
            if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
            if (e.key === '?' || (e.shiftKey && e.key === '/') || e.key === 'F1') {
                e.preventDefault();
                openGuideModal(5);
                return;
            }
        }
    });
}

initGuideModal();

// --- 13. 環境設定モーダル管理 ---
function initSettingsModal() {
    const overlay = document.getElementById('settings-overlay');
    const openBtn = document.getElementById('btn-settings');
    const closeBtn = document.getElementById('settings-close-btn');
    const cancelBtn = document.getElementById('settings-cancel-btn');
    const saveBtn = document.getElementById('settings-save-btn');
    const resetBtn = document.getElementById('settings-reset-btn');

    if (!overlay) return;

    const INPUT_MAP = {
        don: 'sc-set-don',
        ka: 'sc-set-ka',
        bigDon: 'sc-set-big-don',
        bigKa: 'sc-set-big-ka',
        roll: 'sc-set-roll',
        bigRoll: 'sc-set-big-roll',
        balloon: 'sc-set-balloon',
        rollEnd: 'sc-set-roll-end',
        del: 'sc-set-delete',
        continuous: 'sc-set-continuous',
        quickMeas: 'sc-set-quick-meas',
        gimmick: 'sc-set-gimmick',
        undo: 'sc-set-undo',
        redo: 'sc-set-redo',
        play: 'sc-set-play',
        prevMeas: 'sc-set-prev-meas',
        nextMeas: 'sc-set-next-meas',
        rewind: 'sc-set-rewind',
        jumpEnd: 'sc-set-jump-end',
        guide: 'sc-set-guide'
    };

    function populateInputs(source) {
        Object.entries(INPUT_MAP).forEach(([key, inputId]) => {
            const input = document.getElementById(inputId);
            if (input && source[key]) {
                input.value = source[key].filter(k => k !== ' ').join(', ');
            }
        });
    }

    function openSettingsModal() {
        populateInputs(shortcuts);
        overlay.style.display = 'flex';
        overlay.classList.add('active');
    }

    function closeSettingsModal() {
        overlay.style.display = 'none';
        overlay.classList.remove('active');
    }

    if (openBtn) {
        openBtn.addEventListener('click', openSettingsModal);
    }
    if (closeBtn) {
        closeBtn.addEventListener('click', closeSettingsModal);
    }
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeSettingsModal);
    }

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeSettingsModal();
        }
    });

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (confirm("すべてのショートカット設定を初期設定に戻しますか？")) {
                populateInputs(DEFAULT_SHORTCUTS);
            }
        });
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            Object.entries(INPUT_MAP).forEach(([key, inputId]) => {
                const input = document.getElementById(inputId);
                if (input) {
                    const rawArr = input.value.split(',').map(s => s.trim().toLowerCase()).filter(s => s.length > 0);
                    if (rawArr.length > 0) {
                        shortcuts[key] = rawArr.flatMap(s => s === 'space' ? ['space', ' '] : [s]);
                    } else if (DEFAULT_SHORTCUTS[key]) {
                        shortcuts[key] = [...DEFAULT_SHORTCUTS[key]];
                    }
                }
            });
            saveShortcuts();
            applyShortcutLabels();
            closeSettingsModal();
        });
    }

    window.addEventListener('keydown', (e) => {
        if (overlay.classList.contains('active') && overlay.style.display !== 'none') {
            if (e.key === 'Escape') {
                e.preventDefault();
                closeSettingsModal();
            }
        }
    });
}

initSettingsModal();