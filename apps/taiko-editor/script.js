// ========== JavaScript: ロジックと描画 ==========

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
    selectedNotes: [],
    // 最後にアクティブだった小節番号
    lastActiveMeasureIdx: 0,
    // タッチ操作用
    touchStartX: 0,
    touchStartY: 0,
    touchStartScrollX: 0,
    touchStartTime: 0,
    isTouchScrolling: false,
    lastPinchDist: 0
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

    // キャンバスの描画バッファを高解像度に
    canvas.width = w * dpr;
    canvas.height = h * dpr;

    // CSS上のサイズはコンテナに合わせる
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

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

// 連打の「長い棒」を描画する関数
function drawRollBar(startX, endX, type, isPreview = false) {
    if (startX > endX) return; // カーソルが開始位置より左にある場合は描画しない

    const height = (type === "6" || type === "9") ? 40 : 26; // 大連打は太くする
    const y = LANE_Y - height / 2;
    const width = endX - startX;

    // 塗りつぶし（プレビュー時は半透明）
    if (type === "7" || type === "9") {
        ctx.fillStyle = isPreview ? "rgba(230, 126, 34, 0.4)" : "#e67e22"; // 風船はオレンジ
    } else {
        ctx.fillStyle = isPreview ? "rgba(241, 196, 15, 0.4)" : "#f1c40f"; // 連打は黄色
    }
    ctx.fillRect(startX, y, width, height);

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
    // 時間順（X座標順）にソート
    allNotes.sort((a, b) => a.absX - b.absX);

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

    // eが押されておらず、連打入力待ち状態ならカーソルまでプレビューを描画
    if (activeRoll && (state.mode === "ROLL" || state.mode === "ROLL_END")) {
        drawRollBar(activeRoll.x, state.cursorX, activeRoll.type, true);
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
    if (state.isSelecting) {
        const minWorldX = Math.min(state.selectStartX, state.selectEndX);
        const maxWorldX = Math.max(state.selectStartX, state.selectEndX);
        const drawStartX = JUDGE_X + minWorldX - state.scrollX;
        const drawWidth = maxWorldX - minWorldX;

        ctx.fillStyle = "rgba(52, 152, 219, 0.3)";
        ctx.fillRect(drawStartX, LANE_Y - 50, drawWidth, 100);
        ctx.strokeStyle = "rgba(52, 152, 219, 0.8)";
        ctx.lineWidth = 1;
        ctx.strokeRect(drawStartX, LANE_Y - 50, drawWidth, 100);
    }
}

function drawNote(x, y, type, val, isSelected = false) {
    if (type === "8") return; // 連打の終点(8)は丸としては描画しない（棒のみ）

    let radius = 20;
    let color = "#000";
    if (["3", "4", "6"].includes(type)) radius = 30;

    if (type === "1" || type === "3") color = "#e74c3c";
    if (type === "2" || type === "4") color = "#3498db";
    if (type === "5" || type === "6") color = "#f1c40f";
    if (type === "7" || type === "9") color = "#e67e22";

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

// ショートカット管理
let shortcuts = {
    don: ['j', 'f'],
    ka: ['k', 'd'],
    roll: ['r'],
    rollEnd: ['e', '8'],
    del: ['0', 'backspace', 'delete']
};

function updateShortcuts() {
    shortcuts.don = document.getElementById('sc-don').value.split(',').map(s => s.trim().toLowerCase());
    shortcuts.ka = document.getElementById('sc-ka').value.split(',').map(s => s.trim().toLowerCase());
    shortcuts.roll = document.getElementById('sc-roll').value.split(',').map(s => s.trim().toLowerCase());
    shortcuts.rollEnd = document.getElementById('sc-roll-end').value.split(',').map(s => s.trim().toLowerCase());
    shortcuts.del = document.getElementById('sc-delete').value.split(',').map(s => s.trim().toLowerCase());
}

document.querySelectorAll('#sidebar input[id^="sc-"]').forEach(el => {
    el.addEventListener('change', updateShortcuts);
});

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

        if (key === '1' || key === '2' || key === '0' || key.startsWith('tpl_')) { state.mode = "NOTE"; state.size = "SMALL"; }
        if (key === '3' || key === '4') { state.mode = "NOTE"; state.size = "LARGE"; }
        if (key === '5') { state.mode = "ROLL"; state.size = "SMALL"; }
        if (key === '6') { state.mode = "ROLL"; state.size = "LARGE"; }
        if (key === '7') { state.mode = "NUM_INPUT"; state.size = "SMALL"; }

        updateStatusBar();
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

resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    resizer.classList.add('active');
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
});

window.addEventListener('mouseup', (e) => {
    if (isResizing) {
        isResizing = false;
        resizer.classList.remove('active');
        document.body.style.cursor = 'default';
        resizeCanvas();
    }
    // 右ドラッグ終了処理
    if (e.button === 2 && state.isSelecting) {
        state.isSelecting = false;
        updateSelection();
        draw();
    }
    // 連打のドラッグ終了処理
    if (isDraggingRoll && e.button === 0) {
        placeNoteData("8");
        isDraggingRoll = false;
        draw();
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
    draw();
    updateStatusBar();
});

wrapper.addEventListener('mousedown', (e) => {
    if (e.button === 2) {
        // 右クリックで範囲選択開始
        state.isSelecting = true;
        const rect = wrapper.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        state.selectStartX = mouseX + state.scrollX - JUDGE_X;
        state.selectEndX = state.selectStartX;
        state.selectedNotes = [];
        draw();
        return;
    }

    if (e.button !== 0) return; // 左クリックと右クリック以外は無視
    if (e.target !== canvas) {
        // UIパネル等をクリックした場合は選択解除する
        if (state.selectedNotes.length > 0) {
            state.selectedNotes = [];
            draw();
        }
        return;
    }

    // レーン（置くところ）以外をクリックした場合は音符を配置しない
    const rect = wrapper.getBoundingClientRect();
    const mouseY = e.clientY - rect.top;
    if (Math.abs(mouseY - LANE_Y) > 80) {
        if (state.selectedNotes.length > 0) {
            state.selectedNotes = [];
            draw();
        }
        return;
    }

    if (state.mode === "NUM_INPUT") {
        cancelNumberInput();
        // ここでreturnせず続行すると、クリックした場所に新しい音符が置かれる
        // ユーザーの「どっか押した時に消える」という要望には「消してそのまま別の操作ができる」のが自然
    }

    if (state.mode === "ROLL_END") {
        placeNoteData("8");
        state.mode = "NOTE";
        draw();
        updateStatusBar();
        return;
    }

    if (currentTool === '5' || currentTool === '6') {
        placeNoteData(currentTool);
        isDraggingRoll = true;
    } else if (currentTool === '7' || currentTool === '9') {
        startNumberInput(currentTool);
    } else if (currentTool && currentTool.startsWith('tpl_')) {
        placeTemplate(currentTool);
    } else if (currentTool) {
        placeNoteData(currentTool);
    }
    draw();
});

wrapper.addEventListener('mousemove', (e) => {
    if (e.target !== canvas) return;
    const rect = wrapper.getBoundingClientRect();
    state.cursorX = e.clientX - rect.left;
    state.cursorY = e.clientY - rect.top;

    if (state.isSelecting) {
        state.selectEndX = state.cursorX + state.scrollX - JUDGE_X;
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
    const key = e.key.toLowerCase();
    state.isSnapEnabled = !e.shiftKey;

    // スペースキーで再生/停止（入力フィールドにフォーカスがある場合は除外）
    if (e.key === ' ' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        togglePlayback();
        return;
    }

    // cキーで連続配置モード切り替え
    if (key === 'c' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        toggleContinuousMode();
        return;
    }

    // 左右の矢印キーで選択中の音符をずらす
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && state.selectedNotes.length > 0 && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        shiftSelectedNotes(e.key === 'ArrowRight' ? 1 : -1);
        return;
    }

    if (state.mode === "NUM_INPUT") return;

    let insertType = null;
    let isShortcut = false;

    // 数字キーによる直接入力とモード切り替え（ツール選択のみ）
    if (key === '1') { insertType = "1"; state.mode = "NOTE"; state.size = "SMALL"; }
    else if (key === '2') { insertType = "2"; state.mode = "NOTE"; state.size = "SMALL"; }
    else if (key === '3') { insertType = "3"; state.mode = "NOTE"; state.size = "LARGE"; }
    else if (key === '4') { insertType = "4"; state.mode = "NOTE"; state.size = "LARGE"; }
    else if (key === '5') { insertType = "5"; state.mode = "ROLL"; state.size = "SMALL"; }
    else if (key === '6') { insertType = "6"; state.mode = "ROLL"; state.size = "LARGE"; }
    else if (key === '7' || key === '9') { setActiveTool(key); state.mode = "NOTE"; }

    // カスタムショートカットの判定 (配置アクション)
    if (!insertType) {
        // 入力フォームにフォーカスがある場合はショートカットを無効化
        if (!['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
            if (shortcuts.don.includes(key)) { insertType = state.size === "SMALL" ? "1" : "3"; isShortcut = true; }
            else if (shortcuts.ka.includes(key)) { insertType = state.size === "SMALL" ? "2" : "4"; isShortcut = true; }
            else if (shortcuts.roll.includes(key)) {
                state.mode = "ROLL";
                insertType = state.size === "SMALL" ? "5" : "6";
                isShortcut = true;
            }
            else if (shortcuts.rollEnd.includes(key)) { insertType = "8"; isShortcut = true; }
            else if (shortcuts.del.includes(key)) { insertType = "0"; isShortcut = true; }
        }
    }

    updateStatusBar();

    // ツールアイコンの選択状態を更新（8以外）
    if (insertType && insertType !== "8" && state.mode !== "NUM_INPUT") {
        setActiveTool(insertType);
    }

    // カーソルがキャンバス内にある場合のみ、ショートカットキー(jfkd等)によって音符を配置する
    if (isShortcut && state.mode !== "NUM_INPUT" && state.isInsideCanvas) {
        // レーンから離れている場合は配置しない
        if (Math.abs(state.cursorY - LANE_Y) > 80) return;

        placeNoteData(insertType);

        // 連続配置モードがONなら、現在のスナップ幅の分だけ右へ自動スクロールする
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

        if (insertType === "8" && state.mode === "ROLL_END") {
            state.mode = "NOTE";
            updateStatusBar();
        }
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

    // 小節の最後で連打が終わっていない場合、その小節の最後に8を置く（次の小節へ持ち越さない仕様にする場合）
    // ※TJAの仕様によりますが、ここでは「音符がないまま曲が終わる」のを防ぐため最後に8を入れる
    if (inRoll && rollStartNode) {
        // 曲の最後の小節の末尾を取得
        const lastM = measures.length - 1;
        const lastG = measures[lastM].subdivision - 1;
        // 開始点と終了点が同じでない場合のみ追加
        if (!(rollStartNode.measureIdx === lastM && rollStartNode.gridIdx === lastG)) {
            correctionsAdd.push({ measureIdx: lastM, gridIdx: lastG, type: "8" });
        }
    }

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
function startNumberInput(type) {
    const popup = document.getElementById('num-input-popup');
    const input = document.getElementById('note-value-input');

    popup.style.display = 'block';
    popup.style.left = (state.cursorX + 20) + 'px';
    popup.style.top = (LANE_Y + 40) + 'px';

    input.value = "";
    input.focus();

    state.mode = "NUM_INPUT";

    const measures = songData.courses[state.currentCourse];
    const positions = calculateMeasurePositions(measures);
    const snap = getSnapPosition(state.cursorX, positions);

    state.pendingNote = {
        type: type,
        measureIdx: snap.measureIdx,
        gridIdx: snap.gridIdx
    };
    updateStatusBar();
}

document.getElementById('note-value-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.stopPropagation();
        e.preventDefault();
        const val = e.target.value;
        if (val && !isNaN(val)) {
            finishNumberInput(val);
        } else {
            cancelNumberInput();
        }
    } else if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        cancelNumberInput();
    }
});

function finishNumberInput(val) {
    if (state.pendingNote && state.pendingNote.measureIdx !== -1) {
        const { measureIdx, gridIdx, type } = state.pendingNote;
        const targetArray = songData.courses[state.currentCourse][measureIdx].notes[state.currentBranch];

        const existingIdx = targetArray.findIndex(n => n.posIndex === gridIdx);
        const newNote = { type: type, posIndex: gridIdx, val: val };

        if (existingIdx !== -1) targetArray[existingIdx] = newNote;
        else targetArray.push(newNote);

        // 自動的に整合性を整える（8を補完するなど）
        normalizeRolls(songData.courses[state.currentCourse], state.currentBranch);
    }

    document.getElementById('num-input-popup').style.display = 'none';
    state.mode = "NOTE"; // 連続配置しやすいよう、ROLL_ENDではなくNOTEに戻す
    state.pendingNote = null;
    draw();
    updateStatusBar();
}

function cancelNumberInput() {
    document.getElementById('num-input-popup').style.display = 'none';
    state.mode = "NOTE";
    state.pendingNote = null;
    draw();
    updateStatusBar();
}

// 一括選択の更新処理
function updateSelection() {
    state.selectedNotes = [];
    const minX = Math.min(state.selectStartX, state.selectEndX);
    const maxX = Math.max(state.selectStartX, state.selectEndX);

    const measures = songData.courses[state.currentCourse];
    const positions = calculateMeasurePositions(measures);

    positions.forEach((pos, mIdx) => {
        const gridSpacing = pos.width / pos.measure.subdivision;
        const notes = pos.measure.notes[state.currentBranch];
        notes.forEach(note => {
            const worldX = pos.startX + (note.posIndex * gridSpacing);
            if (worldX >= minX && worldX <= maxX) {
                state.selectedNotes.push({ measureIdx: mIdx, gridIdx: note.posIndex, type: note.type, val: note.val });
            }
        });
    });
}

// --- 7.5 ギミック設定モーダルの制御 ---
const gimmickOverlay = document.getElementById('gimmick-overlay');
let gimmickTargetMeasureIdx = -1;

function updateGimmickPanelFields() {
    const startVal = parseFloat(document.getElementById('gimmick-target-start').value);
    const startIdx = Math.max(0, Math.floor(startVal) - 1);
    
    if (isNaN(startIdx)) return;

    const measures = songData.courses[state.currentCourse];
    while (measures.length <= startIdx) {
        measures.push(createEmptyMeasure());
    }

    const measure = measures[startIdx];

    const bpmEnable = document.getElementById('gimmick-bpm-enable');
    const bpmVal = document.getElementById('gimmick-bpm-val');
    bpmEnable.checked = measure.bpmChange !== null;
    bpmVal.value = measure.bpmChange || '';
    bpmVal.disabled = !bpmEnable.checked;

    document.getElementById('gimmick-sig-num').value = measure.signature[0];
    document.getElementById('gimmick-sig-den').value = measure.signature[1];

    const scrollEnable = document.getElementById('gimmick-scroll-enable');
    const scrollVal = document.getElementById('gimmick-scroll-val');
    scrollEnable.checked = measure.scroll !== null && measure.scroll !== undefined;
    scrollVal.value = measure.scroll || '';
    scrollVal.disabled = !scrollEnable.checked;

    document.getElementById('gimmick-gogo-start').checked = measure.gogoStart !== false;
    document.getElementById('gimmick-gogo-end').checked = measure.gogoEnd !== false;

    // subdivisionを読み込み
    document.getElementById('gimmick-subdivision').value = measure.subdivision;
    const presetSelect = document.getElementById('gimmick-subdivision-preset');
    if (Array.from(presetSelect.options).some(o => o.value == measure.subdivision)) {
        presetSelect.value = measure.subdivision;
    }
}

function openGimmickPanel() {
    let startVal = state.lastActiveMeasureIdx + 1.0;
    let endVal = state.lastActiveMeasureIdx + 1.0;

    // 範囲選択がある場合、小数の正確な位置を計算する
    if (state.selectedNotes.length > 0) {
        const measures = songData.courses[state.currentCourse];
        let minTime = Infinity;
        let maxTime = -Infinity;
        state.selectedNotes.forEach(n => {
            const m = measures[n.measureIdx];
            const time = n.measureIdx + (n.posIndex / m.subdivision);
            if (time < minTime) minTime = time;
            if (time > maxTime) maxTime = time;
        });
        startVal = Math.round((minTime + 1) * 10) / 10; // 1-indexed for UI
        endVal = Math.round((maxTime + 1) * 10) / 10;
    }

    document.getElementById('gimmick-target-start').value = startVal;
    document.getElementById('gimmick-target-end').value = endVal;

    updateGimmickPanelFields();
    gimmickOverlay.classList.add('active');
}

// 開始位置が変更されたらフィールドを更新
document.getElementById('gimmick-target-start').addEventListener('change', () => {
    updateGimmickPanelFields();
});

// 分割数プリセットが変更されたら数値枠に反映
document.getElementById('gimmick-subdivision-preset').addEventListener('change', (e) => {
    document.getElementById('gimmick-subdivision').value = e.target.value;
});

// チェックボックスでinputのdisabledを制御
document.getElementById('gimmick-bpm-enable').addEventListener('change', function () {
    document.getElementById('gimmick-bpm-val').disabled = !this.checked;
});
document.getElementById('gimmick-scroll-enable').addEventListener('change', function () {
    document.getElementById('gimmick-scroll-val').disabled = !this.checked;
});

// ボタンからモーダルを開く
document.getElementById('btn-gimmick').addEventListener('click', () => {
    openGimmickPanel();
});

// 閉じる
document.getElementById('gimmick-close').addEventListener('click', () => {
    gimmickOverlay.classList.remove('active');
});
gimmickOverlay.addEventListener('click', (e) => {
    if (e.target === gimmickOverlay) gimmickOverlay.classList.remove('active');
});

// 適用ボタン
document.getElementById('gimmick-apply').addEventListener('click', () => {
    const startInput = parseFloat(document.getElementById('gimmick-target-start').value);
    const endInput = parseFloat(document.getElementById('gimmick-target-end').value);

    if (isNaN(startInput) || isNaN(endInput)) return;

    const startIdx = Math.max(0, Math.floor(startInput) - 1);
    const startOffset = Math.round((startInput - Math.floor(startInput)) * 10) / 10;

    const endIdx = Math.max(0, Math.floor(endInput) - 1);
    const endOffset = Math.round((endInput - Math.floor(endInput)) * 10) / 10;

    const measures = songData.courses[state.currentCourse];
    while (measures.length <= Math.max(startIdx, endIdx)) {
        measures.push(createEmptyMeasure());
    }

    const startM = measures[startIdx];
    const endM = measures[endIdx];

    // BPM
    const bpmEnable = document.getElementById('gimmick-bpm-enable').checked;
    const bpmVal = parseFloat(document.getElementById('gimmick-bpm-val').value);
    if (bpmEnable && !isNaN(bpmVal)) {
        startM.bpmChange = bpmVal;
        startM.bpmChangeOffset = startOffset;
    } else if (!bpmEnable) {
        startM.bpmChange = null;
    }

    // Scroll
    const scrollEnable = document.getElementById('gimmick-scroll-enable').checked;
    const scrollVal = parseFloat(document.getElementById('gimmick-scroll-val').value);
    if (scrollEnable && !isNaN(scrollVal)) {
        startM.scroll = scrollVal;
        startM.scrollOffset = startOffset;
    } else if (!scrollEnable) {
        startM.scroll = null;
    }

    // Signature and Subdivision (開始位置の小節に適用)
    const sigNum = parseInt(document.getElementById('gimmick-sig-num').value) || 4;
    const sigDen = parseInt(document.getElementById('gimmick-sig-den').value) || 4;
    startM.signature = [sigNum, sigDen];
    startM.subdivision = parseInt(document.getElementById('gimmick-subdivision').value) || 16;

    // Go-Go Start
    if (document.getElementById('gimmick-gogo-start').checked) {
        startM.gogoStart = startOffset;
    }
    // Go-Go End
    if (document.getElementById('gimmick-gogo-end').checked) {
        endM.gogoEnd = endOffset;
    }

    gimmickOverlay.classList.remove('active');
    draw();
});

// リセット
document.getElementById('gimmick-reset').addEventListener('click', () => {
    const startInput = parseFloat(document.getElementById('gimmick-target-start').value);
    const endInput = parseFloat(document.getElementById('gimmick-target-end').value);

    if (!isNaN(startInput) && !isNaN(endInput)) {
        const startIdx = Math.max(0, Math.floor(startInput) - 1);
        const endIdx = Math.max(0, Math.floor(endInput) - 1);
        const measures = songData.courses[state.currentCourse];

        for (let i = startIdx; i <= endIdx; i++) {
            if (i < measures.length) {
                measures[i].bpmChange = null;
                measures[i].scroll = null;
                measures[i].gogoStart = false;
                measures[i].gogoEnd = false;
            }
        }
    }
    gimmickOverlay.classList.remove('active');
    draw();
});



// --- 8. TJAエクスポート関連 ---

// 難易度のマッピング（エディタ内部名 → TJA COURSE名）
const courseMap = {
    Ura: "Edit",
    Oni: "Oni",
    Hard: "Hard",
    Normal: "Normal",
    Easy: "Easy"
};

// 小節のデータを TJA 文字列行に変換する
function measureToTjaLine(measure, branch) {
    const notes = measure.notes[branch];
    if (!notes || notes.length === 0) {
        return ","; // 空小節
    }

    // subdivision 分のバッファを用意（全て0で初期化）
    const buf = new Array(measure.subdivision).fill("0");

    notes.forEach(n => {
        if (n.posIndex >= 0 && n.posIndex < measure.subdivision) {
            buf[n.posIndex] = n.type;
        }
    });

    const line = buf.join("");

    // 末尾の0を削除して最小化（TJA形式では文字数＝細分数なので最小公倍数で良い）
    // ただし正確な細分数を保つためそのまま出力する
    return line + ",";
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

    // 入力欄が変更されたら即座に保存予約
    ['cfg-title', 'cfg-subtitle', 'cfg-bpm', 'cfg-offset', 'cfg-wave', 'cfg-demostart'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', autoSave);
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

        const events = [];
        if (m.gogoStart !== false) {
            events.push({ type: '#GOGOSTART', idx: Math.round(m.gogoStart * m.subdivision) });
        }
        if (m.gogoEnd !== false) {
            events.push({ type: '#GOGOEND', idx: Math.round(m.gogoEnd * m.subdivision) });
        }
        if (m.bpmChange !== null) {
            events.push({ type: `#BPMCHANGE ${m.bpmChange}`, idx: Math.round((m.bpmChangeOffset || 0) * m.subdivision) });
        }
        if (m.scroll !== null) {
            events.push({ type: `#SCROLL ${m.scroll}`, idx: Math.round((m.scrollOffset || 0) * m.subdivision) });
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

// 全難易度分の完全なTJAテキストを生成する
function generateFullTja() {
    // サイドバーから最新の値を読み取る
    const title = document.getElementById('cfg-title').value || "New Song";
    const subtitle = document.getElementById('cfg-subtitle').value;
    const wave = document.getElementById('cfg-wave').value;
    const bpm = document.getElementById('cfg-bpm').value || "120";
    const offset = document.getElementById('cfg-offset').value || "0";
    const demostart = document.getElementById('cfg-demostart').value;
    const songvol = document.getElementById('cfg-songvol').value;
    const sevol = document.getElementById('cfg-sevol').value;
    const scoremode = document.getElementById('cfg-scoremode').value;

    const levelUra = document.getElementById('cfg-level-ura').value || "1";
    const levelOni = document.getElementById('cfg-level-oni').value || "1";
    const levelHard = document.getElementById('cfg-level-hard').value || "1";
    const levelNormal = document.getElementById('cfg-level-normal').value || "1";
    const levelEasy = document.getElementById('cfg-level-easy').value || "1";

    const headerLines = [];
    headerLines.push(`TITLE:${title}`);
    if (subtitle) headerLines.push(`SUBTITLE:${subtitle}`);
    if (wave) headerLines.push(`WAVE:${wave}`);
    headerLines.push(`BPM:${bpm}`);
    headerLines.push(`OFFSET:${offset}`);
    if (demostart) headerLines.push(`DEMOSTART:${demostart}`);
    if (songvol !== "100") headerLines.push(`SONGVOL:${songvol}`);
    if (sevol !== "100") headerLines.push(`SEVOL:${sevol}`);
    headerLines.push(`SCOREMODE:${scoremode}`);
    headerLines.push("");

    const levelMap = { Ura: levelUra, Oni: levelOni, Hard: levelHard, Normal: levelNormal, Easy: levelEasy };
    const courseOrder = ["Ura", "Oni", "Hard", "Normal", "Easy"];
    const courseBlocks = [];

    courseOrder.forEach(course => {
        const measures = songData.courses[course];
        if (measures) {
            const block = generateCourseTja(course, measures, levelMap[course]);
            if (block) courseBlocks.push(block);
        }
    });

    return headerLines.join("\n") + courseBlocks.join("\n");
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
            while(tempo < 70) tempo *= 2;
            while(tempo > 240) tempo /= 2;
            
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
    } catch(e) {
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

function startPlayback() {
    if (!state.audioBuffer || !state.audioContext) return;

    // AudioSource を作成
    state.audioSource = state.audioContext.createBufferSource();
    state.audioSource.buffer = state.audioBuffer;
    state.audioSource.connect(state.audioContext.destination);

    const offset = parseFloat(document.getElementById('cfg-offset').value) || 0;
    const bpm = parseFloat(document.getElementById('cfg-bpm').value) || 120;
    const pxPerBeat = state.basePxPerBeat * state.zoomLevel;
    const pxPerSecond = pxPerBeat * (bpm / 60);

    // 現在のスクロール位置から再生開始時間を計算
    // offsetがプラスなら曲は後から始まるため、スクロール位置から引く
    const currentTime = state.scrollX / pxPerSecond - offset;
    
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
    btn.textContent = "⏸ 停止 (Space)";
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
    btn.textContent = "▶ 再生 (Space)";
    btn.classList.remove('playing');
}

// 再生中の追尾アニメーション
function playbackAnimation() {
    if (!state.isPlaying) return;

    const offset = parseFloat(document.getElementById('cfg-offset').value) || 0;
    const bpm = parseFloat(document.getElementById('cfg-bpm').value) || 120;
    const pxPerBeat = state.basePxPerBeat * state.zoomLevel;
    const pxPerSecond = pxPerBeat * (bpm / 60);

    // 現在の再生時間を取得（曲の0:00位置からの経過時間）
    const currentAudioTime = state.audioContext.currentTime - state.playStartTime;
    // 再生位置をスクロール座標に変換（曲の経過時間 + オフセット = 譜面の時間）
    const targetScrollX = (currentAudioTime + offset) * pxPerSecond;

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
document.getElementById('btn-play').addEventListener('click', () => {
    togglePlayback();
});

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
        parseTJA(text);
        
        // 読み込み完了後にUIを更新
        document.getElementById('cfg-title').value = songData.header.title || "";
        document.getElementById('cfg-subtitle').value = songData.header.subtitle || "";
        document.getElementById('cfg-bpm').value = songData.header.bpm || 120;
        document.getElementById('cfg-offset').value = songData.header.offset || 0;
        document.getElementById('cfg-wave').value = songData.header.wave || "";
        document.getElementById('cfg-demostart').value = songData.header.demostart || "";

        state.currentCourse = "Oni"; // デフォルトでおにを開く
        const courseSelect = document.querySelectorAll('.course-tab');
        courseSelect.forEach(tab => {
            if (tab.dataset.course === "Oni") tab.classList.add('active');
            else tab.classList.remove('active');
        });

        // 保存予約と再描画
        autoSave();
        draw();
    };
    // Shift_JISで読み込む（日本のTJAで主流）
    reader.readAsText(file, 'Shift_JIS');
});

function parseTJA(text) {
    const lines = text.split(/\r?\n/);
    
    // 新しいsongDataの雛形を作成
    const newSongData = {
        header: { title: "New Song", subtitle: "", wave: "", bpm: 120, offset: 0, demostart: "" },
        courses: {
            Oni: [], Ura: [], Hard: [], Normal: [], Easy: []
        }
    };

    let currentCourse = null;
    let inStart = false;
    let currentMeasure = createEmptyMeasure();
    let currentBranch = 'normal'; // 'normal', 'expert', 'master'
    let measureTokens = [];
    let targetMeasureIdx = 0;
    let branchStartIdx = 0;

    const courseTypeMap = {
        '0': 'Easy', 'easy': 'Easy',
        '1': 'Normal', 'normal': 'Normal',
        '2': 'Hard', 'hard': 'Hard',
        '3': 'Oni', 'oni': 'Oni',
        '4': 'Ura', 'edit': 'Ura', 'ura': 'Ura'
    };

    const finalizeMeasure = () => {
        const notesOnly = measureTokens.filter(t => t.type === 'note');
        let sub = notesOnly.length;
        if (sub === 0) sub = 16; 
        currentMeasure.subdivision = sub;

        let noteIdx = 0;
        measureTokens.forEach(t => {
            if (t.type === 'note') {
                if (t.val !== '0') {
                    currentMeasure.notes[currentBranch].push({
                        posIndex: noteIdx,
                        type: t.val,
                        val: 0
                    });
                }
                noteIdx++;
            } else if (t.type === '#GOGOSTART') {
                currentMeasure.gogoStart = sub > 0 ? noteIdx / sub : 0;
            } else if (t.type === '#GOGOEND') {
                currentMeasure.gogoEnd = sub > 0 ? noteIdx / sub : 0;
            } else if (t.type === '#MEASURE') {
                const parts = t.val.split('/');
                if (parts.length === 2) currentMeasure.signature = [parseInt(parts[0]), parseInt(parts[1])];
            } else if (t.type === '#BPMCHANGE') {
                currentMeasure.bpmChange = parseFloat(t.val);
            } else if (t.type === '#SCROLL') {
                currentMeasure.scroll = parseFloat(t.val);
            }
        });

        const courseArr = newSongData.courses[currentCourse];
        if (courseArr) {
            if (targetMeasureIdx < courseArr.length) {
                // すでに小節が存在する場合は分岐マージ
                if (currentBranch === 'normal') {
                    courseArr[targetMeasureIdx] = currentMeasure;
                } else {
                    courseArr[targetMeasureIdx].notes[currentBranch] = currentMeasure.notes[currentBranch];
                }
            } else {
                courseArr.push(currentMeasure);
            }
        }

        targetMeasureIdx++;

        // 次の小節の準備
        const nextMeasure = createEmptyMeasure();
        nextMeasure.signature = [...currentMeasure.signature];
        currentMeasure = nextMeasure;
        measureTokens = [];
    };

    lines.forEach(rawLine => {
        let line = rawLine.split('//')[0].trim();
        if (!line) return;

        if (!inStart) {
            const match = line.match(/^([A-Z]+):(.*)$/i);
            if (match) {
                const key = match[1].toUpperCase();
                const val = match[2].trim();
                
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
            if (line === '#START') {
                inStart = true;
                if (!currentCourse) currentCourse = 'Oni';
                currentBranch = 'normal';
                currentMeasure = createEmptyMeasure();
                measureTokens = [];
                targetMeasureIdx = 0;
                branchStartIdx = 0;
            }
            return;
        }

        if (line === '#END') {
            inStart = false;
            if (measureTokens.length > 0) finalizeMeasure();
            return;
        }

        if (line.startsWith('#BRANCHSTART')) {
            if (measureTokens.length > 0) finalizeMeasure();
            branchStartIdx = targetMeasureIdx;
            return;
        } else if (line === '#N') {
            if (measureTokens.length > 0) finalizeMeasure();
            currentBranch = 'normal';
            targetMeasureIdx = branchStartIdx;
            currentMeasure = createEmptyMeasure(); // リセット
            if (targetMeasureIdx > 0 && newSongData.courses[currentCourse] && newSongData.courses[currentCourse][targetMeasureIdx-1]) {
                currentMeasure.signature = [...newSongData.courses[currentCourse][targetMeasureIdx-1].signature];
            }
            return;
        } else if (line === '#E') {
            if (measureTokens.length > 0) finalizeMeasure();
            currentBranch = 'expert';
            targetMeasureIdx = branchStartIdx;
            currentMeasure = createEmptyMeasure();
            if (targetMeasureIdx > 0 && newSongData.courses[currentCourse] && newSongData.courses[currentCourse][targetMeasureIdx-1]) {
                currentMeasure.signature = [...newSongData.courses[currentCourse][targetMeasureIdx-1].signature];
            }
            return;
        } else if (line === '#M') {
            if (measureTokens.length > 0) finalizeMeasure();
            currentBranch = 'master';
            targetMeasureIdx = branchStartIdx;
            currentMeasure = createEmptyMeasure();
            if (targetMeasureIdx > 0 && newSongData.courses[currentCourse] && newSongData.courses[currentCourse][targetMeasureIdx-1]) {
                currentMeasure.signature = [...newSongData.courses[currentCourse][targetMeasureIdx-1].signature];
            }
            return;
        }

        // ギミックコマンド
        if (line.startsWith('#MEASURE')) {
            measureTokens.push({ type: '#MEASURE', val: line.replace('#MEASURE', '').trim() });
            return;
        }
        if (line.startsWith('#BPMCHANGE')) {
            measureTokens.push({ type: '#BPMCHANGE', val: line.replace('#BPMCHANGE', '').trim() });
            return;
        }
        if (line.startsWith('#SCROLL')) {
            measureTokens.push({ type: '#SCROLL', val: line.replace('#SCROLL', '').trim() });
            return;
        }
        if (line === '#GOGOSTART') {
            measureTokens.push({ type: '#GOGOSTART' });
            return;
        }
        if (line === '#GOGOEND') {
            measureTokens.push({ type: '#GOGOEND' });
            return;
        }

        // 音符データ
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === ',') {
                finalizeMeasure();
            } else if (/[0-9]/.test(char)) {
                measureTokens.push({ type: 'note', val: char });
            }
        }
    });

    // 空の難易度にデフォルトを詰める
    Object.keys(newSongData.courses).forEach(key => {
        if (newSongData.courses[key].length === 0) {
            newSongData.courses[key] = [createEmptyMeasure()];
        }
    });

    songData = newSongData;
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