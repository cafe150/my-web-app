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
                const match = rest.match(/^#([A-Za-z0-9_]+)(?:[\s:]+([^\r\n,#]*))?/);
                if (match) {
                    const rawName = match[1];
                    const rawArgs = match[2] !== undefined ? match[2].trim() : '';
                    tokens.push({
                        type: 'COMMAND',
                        name: rawName.toUpperCase(),
                        args: rawArgs,
                        raw: match[0]
                    });
                    i += match[0].length;
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


module.exports = { TjaTokenizer, TjaParser };
