/**
 * 家系図作成Webアプリケーション
 * メインキャンバス描画エンジン（様式A・様式B・様式C 完全対応）
 * パン・ズーム制御、世代ジャンプナビゲーション連動
 */

window.KakeizuRenderer = (function () {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function createSvgElement(tag, attrs = {}) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, String(v));
    }
    return el;
  }

  /**
   * 各人物ノードの person.isDirectLine（直系ハイライト・朱線強調フラグ）を評価
   */
  function evaluateLineageStatus(person) {
    return {
      isHighlight: Boolean(person && person.isDirectLine),
      isDimmed: false
    };
  }

  // ===========================================================================
  // 様式A：先祖トーナメント型（添付画像1 完全準拠）
  // ===========================================================================
  function renderStyleA(project, stageEl, callbacks) {
    const width = 1480;
    const height = 860;
    stageEl.style.width = `${width}px`;
    stageEl.style.height = `${height}px`;

    const svg = createSvgElement('svg', {
      class: 'tree-svg-layer',
      width,
      height,
      viewBox: `0 0 ${width} ${height}`
    });

    const nodesLayer = document.createElement('div');
    nodesLayer.className = 'tree-nodes-layer';

    const nodeW = 54;
    const nodeH = 126;

    // 世代ごとのY座標（5世が上、1世本人が下：添付画像1の階段状トーナメント配置）
    const genY = {
      5: 40,   // 高祖父母（16名）
      4: 185,  // 曽祖父母（8名）
      3: 355,  // 祖父母（4名）
      2: 525,  // 父母（2名）
      1: 695   // 本人（1名）
    };

    // 添付画像1と同じく左が女性（母系側・妻）、右が男性（父系側・夫）の16スロットX中心座標
    // 左半分（母方8名）と右半分（父方8名）の間に中央ギャップを設ける
    const slotOrderGen5 = [
      // 母方8名（左から右へ：高祖母・高祖父のペア×4）
      'mmmm', 'mmmf', 'mmfm', 'mmff', 'mfmm', 'mfmf', 'mffm', 'mfff',
      // 父方8名（左から右へ：高祖母・高祖父のペア×4、一番右が①高祖父）
      'fmmm', 'fmmf', 'fmfm', 'fmff', 'ffmm', 'ffmf', 'fffm', 'ffff'
    ];

    const coords = {};
    slotOrderGen5.forEach((id, idx) => {
      const groupGap = idx >= 8 ? 56 : 0;
      const cx = 75 + idx * 82 + groupGap;
      coords[id] = { cx, y: genY[5], gen: 5 };
    });

    // 4世（曽祖父母 8名）：各ペアの中間より少し子側へ配置（添付画像1のT字オフセット）
    const gen4Pairs = [
      { mId: 'mmm', fId: 'mmf', mParents: ['mmmm', 'mmmf'], fParents: ['mmfm', 'mmff'] },
      { mId: 'mfm', fId: 'mff', mParents: ['mfmm', 'mfmf'], fParents: ['mffm', 'mfff'] },
      { mId: 'fmm', fId: 'fmf', mParents: ['fmmm', 'fmmf'], fParents: ['fmfm', 'fmff'] },
      { mId: 'ffm', fId: 'fff', mParents: ['ffmm', 'ffmf'], fParents: ['fffm', 'ffff'] }
    ];

    gen4Pairs.forEach(pair => {
      const mMid = (coords[pair.mParents[0]].cx + coords[pair.mParents[1]].cx) / 2;
      const fMid = (coords[pair.fParents[0]].cx + coords[pair.fParents[1]].cx) / 2;
      coords[pair.mId] = { cx: mMid, y: genY[4], gen: 4, parents: pair.mParents };
      coords[pair.fId] = { cx: fMid, y: genY[4], gen: 4, parents: pair.fParents };
    });

    // 3世（祖父母 4名）
    const gen3Pairs = [
      { mId: 'mm', fId: 'mf', mParents: ['mmm', 'mmf'], fParents: ['mfm', 'mff'] },
      { mId: 'fm', fId: 'ff', mParents: ['fmm', 'fmf'], fParents: ['ffm', 'fff'] }
    ];

    gen3Pairs.forEach(pair => {
      const mMid = (coords[pair.mParents[0]].cx + coords[pair.mParents[1]].cx) / 2;
      const fMid = (coords[pair.fParents[0]].cx + coords[pair.fParents[1]].cx) / 2;
      coords[pair.mId] = { cx: mMid, y: genY[3], gen: 3, parents: pair.mParents };
      coords[pair.fId] = { cx: fMid, y: genY[3], gen: 3, parents: pair.fParents };
    });

    // 2世（父母 2名）
    coords['m'] = {
      cx: (coords['mm'].cx + coords['mf'].cx) / 2,
      y: genY[2],
      gen: 2,
      parents: ['mm', 'mf']
    };
    coords['f'] = {
      cx: (coords['fm'].cx + coords['ff'].cx) / 2,
      y: genY[2],
      gen: 2,
      parents: ['fm', 'ff']
    };

    // 1世（本人）
    coords['self'] = {
      cx: (coords['m'].cx + coords['f'].cx) / 2,
      y: genY[1],
      gen: 1,
      parents: ['m', 'f']
    };

    // トーナメント接続線の描画（通常線を先に描き、直系朱色太線を後から重ねて最前面にする）
    const allChildIds = ['self', 'm', 'f', 'mm', 'mf', 'fm', 'ff', 'mmm', 'mmf', 'mfm', 'mff', 'fmm', 'fmf', 'ffm', 'fff'];

    allChildIds.forEach(childId => {
      const cPos = coords[childId];
      if (!cPos || !cPos.parents) return;
      const [leftParentId, rightParentId] = cPos.parents;
      const lPos = coords[leftParentId];
      const rPos = coords[rightParentId];

      const childPerson = project.people[childId];
      const leftPerson = project.people[leftParentId];
      const rightPerson = project.people[rightParentId];
      if (!childPerson || (!leftPerson && !rightPerson)) return;

      const childStatus = evaluateLineageStatus(childPerson);
      const leftStatus = evaluateLineageStatus(leftPerson);
      const rightStatus = evaluateLineageStatus(rightPerson);

      const barY = lPos.y + nodeH * 0.52;
      const leftEdgeX = lPos.cx + nodeW / 2;
      const rightEdgeX = rPos.cx - nodeW / 2;

      if (childId === 'self') {
        // 本人と父母の接続（添付画像1の下部コの字＋中央垂線）
        const joinY = lPos.y + nodeH + 26;
        const isLeftDirect = Boolean(leftPerson && leftStatus.isHighlight);
        const isRightDirect = Boolean(rightPerson && rightStatus.isHighlight);
        const isStemDirect = childStatus.isHighlight || isLeftDirect || isRightDirect;

        if (leftPerson) {
          // 母（左）から中央へ
          svg.appendChild(createSvgElement('path', {
            d: `M ${lPos.cx} ${lPos.y + nodeH} L ${lPos.cx} ${joinY} L ${cPos.cx} ${joinY}`,
            fill: 'none',
            stroke: isLeftDirect ? '#B22D25' : '#594E4A',
            'stroke-width': isLeftDirect ? 4.5 : 3
          }));
        }
        if (rightPerson) {
          // 父（右）から中央へ
          svg.appendChild(createSvgElement('path', {
            d: `M ${rPos.cx} ${rPos.y + nodeH} L ${rPos.cx} ${joinY} L ${cPos.cx} ${joinY}`,
            fill: 'none',
            stroke: isRightDirect ? '#B22D25' : '#594E4A',
            'stroke-width': isRightDirect ? 4.5 : 3
          }));
        }
        // 中央から本人上端への垂線
        svg.appendChild(createSvgElement('line', {
          x1: cPos.cx,
          y1: joinY,
          x2: cPos.cx,
          y2: cPos.y,
          stroke: isStemDirect ? '#B22D25' : '#594E4A',
          'stroke-width': isStemDirect ? 4.5 : 3
        }));
      } else {
        // 父母・祖父母・曽祖父母・高祖父母のT字接続
        const isLeftDirect = Boolean(leftPerson && leftStatus.isHighlight);
        const isRightDirect = Boolean(rightPerson && rightStatus.isHighlight);

        if (leftPerson) {
          svg.appendChild(createSvgElement('line', {
            x1: leftEdgeX,
            y1: barY,
            x2: cPos.cx,
            y2: barY,
            stroke: isLeftDirect ? '#B22D25' : '#594E4A',
            'stroke-width': isLeftDirect ? 4.5 : 3
          }));
        }

        if (rightPerson) {
          // 子X〜右親までの水平線
          svg.appendChild(createSvgElement('line', {
            x1: cPos.cx,
            y1: barY,
            x2: rightEdgeX,
            y2: barY,
            stroke: isRightDirect ? '#B22D25' : '#594E4A',
            'stroke-width': isRightDirect ? 4.5 : 3
          }));
        }

        // 子ノード上端への垂直線
        const isVertDirect = isLeftDirect || isRightDirect || childStatus.isHighlight;
        svg.appendChild(createSvgElement('line', {
          x1: cPos.cx,
          y1: barY,
          x2: cPos.cx,
          y2: cPos.y,
          stroke: isVertDirect ? '#B22D25' : '#594E4A',
          'stroke-width': isVertDirect ? 4.5 : 3
        }));
      }
    });

    // =========================================================================
    // ユーザー追加ノード・配偶者・兄弟・子孫・6世以上の動的配置（様式A拡張）
    // =========================================================================
    const nodePositions = {};
    Object.entries(coords).forEach(([id, pos]) => {
      nodePositions[id] = { x: pos.cx - nodeW / 2, y: pos.y, w: nodeW, h: nodeH, cx: pos.cx, gen: pos.gen };
    });

    // 追加ノードの収集（isUserAdded、または追加された6世以上・子孫・兄弟など）
    const extraPeople = Object.values(project.people).filter(p => {
      if (coords[p.id]) return false;
      if (p.id.startsWith('b_') || p.id.startsWith('c_')) return false;
      // 初期付属のspouse/elder_sister/son/daughterはユーザー追加または氏名あり/子孫表示用に含める
      if (['spouse', 'son', 'daughter', 'elder_sister'].includes(p.id)) {
        return Boolean(p.isUserAdded || p.familyName || p.givenName);
      }
      return Boolean(p.isUserAdded);
    });

    // 6世以上や0世以下が存在する場合はステージ上下を拡張
    let topShift = 0;
    const hasGen6Plus = extraPeople.some(p => Number(p.generation) >= 6);
    if (hasGen6Plus) {
      topShift = 155;
      Object.values(nodePositions).forEach(pos => { pos.y += topShift; });
      Object.keys(genY).forEach(k => { genY[k] += topShift; });
      svg.querySelectorAll('line, path').forEach(el => {
        if (el.tagName === 'line') {
          el.setAttribute('y1', Number(el.getAttribute('y1')) + topShift);
          el.setAttribute('y2', Number(el.getAttribute('y2')) + topShift);
        } else if (el.tagName === 'path') {
          const d = el.getAttribute('d').replace(/([ML])\s*([\d.-]+)\s+([\d.-]+)/g, (_, cmd, x, y) => `${cmd} ${x} ${Number(y) + topShift}`);
          el.setAttribute('d', d);
        }
      });
    }

    const extraGenY = { ...genY };
    if (hasGen6Plus) extraGenY[6] = 28;
    const hasGen0 = extraPeople.some(p => Number(p.generation) === 0);
    const hasGenMinus1 = extraPeople.some(p => Number(p.generation) <= -1);
    let finalHeight = height + topShift;
    if (hasGen0) {
      extraGenY[0] = genY[1] + 175;
      finalHeight = Math.max(finalHeight, extraGenY[0] + nodeH + 55);
    }
    if (hasGenMinus1) {
      extraGenY[-1] = (extraGenY[0] || genY[1] + 175) + 175;
      finalHeight = Math.max(finalHeight, extraGenY[-1] + nodeH + 55);
    }

    let finalWidth = width;
    if (extraPeople.length > 0) {
      const occupiedByGen = {};
      Object.values(nodePositions).forEach(pos => {
        occupiedByGen[pos.gen] = occupiedByGen[pos.gen] || [];
        occupiedByGen[pos.gen].push(pos.cx);
      });

      function findFreeCx(gen, preferredCx) {
        const list = occupiedByGen[gen] || [];
        let candidate = preferredCx;
        let step = 0;
        while (list.some(x => Math.abs(x - candidate) < nodeW + 24)) {
          step += 1;
          const offset = Math.ceil(step / 2) * (nodeW + 28);
          candidate = preferredCx + (step % 2 === 1 ? offset : -offset);
          if (candidate < 60) candidate = preferredCx + offset + 60;
        }
        list.push(candidate);
        occupiedByGen[gen] = list;
        finalWidth = Math.max(finalWidth, candidate + nodeW + 80);
        return candidate;
      }

      extraPeople.forEach(p => {
        const g = Number(p.generation ?? 1);
        const y = extraGenY[g] ?? (g > 5 ? 28 : genY[1] + (1 - g) * 175);
        extraGenY[g] = y;
        finalHeight = Math.max(finalHeight, y + nodeH + 55);

        let prefCx = nodePositions['self'].cx;
        if (p.spouseId && nodePositions[p.spouseId]) {
          prefCx = nodePositions[p.spouseId].cx - (nodeW + 28);
        } else if (p.fatherId && nodePositions[p.fatherId]) {
          prefCx = nodePositions[p.fatherId].cx;
        } else if (p.motherId && nodePositions[p.motherId]) {
          prefCx = nodePositions[p.motherId].cx;
        } else {
          // 自分が誰かの親なら子の近くに配置
          const child = Object.values(project.people).find(c => (c.fatherId === p.id || c.motherId === p.id) && nodePositions[c.id]);
          if (child) {
            prefCx = nodePositions[child.id].cx + (p.gender === 'F' ? -45 : 45);
          }
        }
        const cx = findFreeCx(g, prefCx);
        nodePositions[p.id] = { x: cx - nodeW / 2, y, w: nodeW, h: nodeH, cx, gen: g };
      });

      // 追加ノード用のSVG接続線を描画
      extraPeople.forEach(p => {
        const pos = nodePositions[p.id];
        if (!pos) return;
        const isPDirect = Boolean(p.isDirectLine);

        // 配偶者との二重線（重複描画防止のためID比較）
        if (p.spouseId && nodePositions[p.spouseId]) {
          const sp = project.people[p.spouseId];
          const spPos = nodePositions[p.spouseId];
          const alreadyOtherExtra = extraPeople.some(ep => ep.id === p.spouseId);
          if (!alreadyOtherExtra || p.id < p.spouseId) {
            const leftP = pos.cx < spPos.cx ? pos : spPos;
            const rightP = pos.cx < spPos.cx ? spPos : pos;
            const ym = leftP.y + nodeH * 0.5;
            const bothShu = isPDirect && Boolean(sp && sp.isDirectLine);
            const col = bothShu ? '#B22D25' : '#594E4A';
            svg.appendChild(createSvgElement('line', { x1: leftP.x + nodeW, y1: ym - 2.5, x2: rightP.x, y2: ym - 2.5, stroke: col, 'stroke-width': 2 }));
            svg.appendChild(createSvgElement('line', { x1: leftP.x + nodeW, y1: ym + 2.5, x2: rightP.x, y2: ym + 2.5, stroke: col, 'stroke-width': 2 }));
          }
        }

        // 親からこのノードへの接続線（世代が上→下）
        const parentPos = (p.fatherId && nodePositions[p.fatherId]) || (p.motherId && nodePositions[p.motherId]);
        if (parentPos && parentPos.y < pos.y) {
          const midY = (parentPos.y + nodeH + pos.y) / 2;
          svg.appendChild(createSvgElement('path', {
            d: `M ${parentPos.cx} ${parentPos.y + nodeH} L ${parentPos.cx} ${midY} L ${pos.cx} ${midY} L ${pos.cx} ${pos.y}`,
            fill: 'none',
            stroke: isPDirect ? '#B22D25' : '#594E4A',
            'stroke-width': isPDirect ? 3.5 : 2.5
          }));
        }

        // このノードが既存固定ノードの親（6世など）である場合の接続線
        Object.values(project.people).forEach(child => {
          if ((child.fatherId === p.id || child.motherId === p.id) && nodePositions[child.id] && !extraPeople.some(ep => ep.id === child.id)) {
            const cPos = nodePositions[child.id];
            const midY = (pos.y + nodeH + cPos.y) / 2;
            svg.appendChild(createSvgElement('path', {
              d: `M ${pos.cx} ${pos.y + nodeH} L ${pos.cx} ${midY} L ${cPos.cx} ${midY} L ${cPos.cx} ${cPos.y}`,
              fill: 'none',
              stroke: isPDirect ? '#B22D25' : '#594E4A',
              'stroke-width': isPDirect ? 3.5 : 2.5
            }));
          }
        });
      });
    }

    stageEl.style.width = `${finalWidth}px`;
    stageEl.style.height = `${finalHeight}px`;
    svg.setAttribute('width', String(finalWidth));
    svg.setAttribute('height', String(finalHeight));
    svg.setAttribute('viewBox', `0 0 ${finalWidth} ${finalHeight}`);

    // 各ノードのDOM生成
    const defaultRoleById = {
      self: '本人',
      m: '母', f: '父',
      mm: '祖母', mf: '祖父', fm: '祖母', ff: '祖父',
      mmm: '曽祖母', mmf: '曽祖父', mfm: '曽祖母', mff: '曽祖父',
      fmm: '曽祖母', fmf: '曽祖父', ffm: '曽祖母', fff: '曽祖父'
    };

    const renderedCoordsA = {};
    Object.entries(nodePositions).forEach(([id, pos]) => {
      const person = project.people[id];
      if (!person) return;
      renderedCoordsA[id] = pos;

      const status = evaluateLineageStatus(person);
      const nodeEl = document.createElement('div');
      nodeEl.className = `person-node style-a ${status.isHighlight ? 'direct-line' : ''} ${id === (project.rootPersonId || 'self') ? 'is-root-person' : ''}`;
      if (callbacks.selectedId === id) nodeEl.classList.add('selected');
      nodeEl.dataset.personId = id;
      nodeEl.dataset.generation = String(pos.gen);
      nodeEl.style.left = `${pos.x}px`;
      nodeEl.style.top = `${pos.y}px`;
      nodeEl.style.width = `${nodeW}px`;
      nodeEl.style.height = `${nodeH}px`;

      const roleText = person.roleLabel || defaultRoleById[id] || '先祖';
      const fullName = `${person.familyName || ''}${person.givenName || ''}`.trim();

      nodeEl.innerHTML = `
        <div style="display:flex;flex-direction:row-reverse;align-items:center;justify-content:center;height:100%;">
          <span class="node-role-label">${roleText}</span>
          ${fullName ? `<span class="node-person-name">${fullName}</span>` : ''}
        </div>
        <button type="button" class="node-add-trigger" title="親族・次世代スロットを追加" data-add-for="${id}">＋</button>
      `;

      if (person.birthDate || person.birthPlace || person.originKuni) {
        const yearShort = KakeizuData.formatDateByMode(person.birthDate, project.eraDisplayMode, true);
        const placeText = person.originKuni ? `${person.birthPlace || ''}(${person.originKuni})` : person.birthPlace;
        const cap = document.createElement('div');
        cap.className = 'node-meta-caption';
        cap.textContent = [yearShort, placeText].filter(Boolean).join(' / ');
        nodeEl.appendChild(cap);
      }

      nodeEl.addEventListener('click', (e) => {
        if (e.target.closest('.node-add-trigger')) {
          e.stopPropagation();
          callbacks.onQuickAddClick(id, e.target.closest('.node-add-trigger'));
          return;
        }
        callbacks.onSelectPerson(id);
      });

      nodesLayer.appendChild(nodeEl);
    });

    stageEl.innerHTML = '';
    stageEl.appendChild(svg);
    stageEl.appendChild(nodesLayer);

    return {
      width: finalWidth,
      height: finalHeight,
      genYMap: extraGenY,
      nodeCoords: renderedCoordsA
    };
  }

  // ===========================================================================
  // 様式B：法務・直系軸型（親族呼称・相続関係説明図スタイル / 添付画像2 完全準拠）
  // ===========================================================================
  function renderStyleB(project, stageEl, callbacks) {
    const width = 1460;
    const height = 1660;
    stageEl.style.width = `${width}px`;
    stageEl.style.height = `${height}px`;

    const svg = createSvgElement('svg', {
      class: 'tree-svg-layer',
      width,
      height,
      viewBox: `0 0 ${width} ${height}`
    });

    const nodesLayer = document.createElement('div');
    nodesLayer.className = 'tree-nodes-layer';

    // 外周点線枠（添付画像2準拠）
    const boardFrame = document.createElement('div');
    boardFrame.className = 'style-b-board';
    boardFrame.style.left = '24px';
    boardFrame.style.top = '20px';
    boardFrame.style.width = `${width - 48}px`;
    boardFrame.style.height = `${height - 40}px`;
    nodesLayer.appendChild(boardFrame);

    // 右上タイトル枠「親族 呼び名一覧」
    const titleBox = document.createElement('div');
    titleBox.className = 'style-b-title-box';
    titleBox.style.right = '70px';
    titleBox.style.top = '42px';
    titleBox.textContent = '親族　呼び名一覧';
    nodesLayer.appendChild(titleBox);

    // 中央縦一直線の直系親族強調軸（青帯 #D6E4F0）
    const bandTop = document.createElement('div');
    bandTop.className = 'style-b-direct-band';
    bandTop.style.left = '372px';
    bandTop.style.top = '34px';
    bandTop.style.width = '184px';
    bandTop.style.height = '760px';
    nodesLayer.appendChild(bandTop);

    // 息子・嫁・娘の横広がり青帯
    const bandChildRow = document.createElement('div');
    bandChildRow.className = 'style-b-direct-band';
    bandChildRow.style.left = '208px';
    bandChildRow.style.top = '790px';
    bandChildRow.style.width = '348px';
    bandChildRow.style.height = '112px';
    nodesLayer.appendChild(bandChildRow);

    // 孫〜仍孫までの直系卑属青帯
    const bandDesc = document.createElement('div');
    bandDesc.className = 'style-b-direct-band';
    bandDesc.style.left = '372px';
    bandDesc.style.top = '900px';
    bandDesc.style.width = '184px';
    bandDesc.style.height = '710px';
    nodesLayer.appendChild(bandDesc);

    // 右下の青帯凡例「枠内は直系親族」
    const legendBand = document.createElement('div');
    legendBand.style.position = 'absolute';
    legendBand.style.right = '120px';
    legendBand.style.bottom = '110px';
    legendBand.style.display = 'flex';
    legendBand.style.alignItems = 'center';
    legendBand.style.gap = '16px';
    legendBand.innerHTML = `
      <div style="width:95px;height:52px;background:#D6E4F0;border:1px solid #C8C5BC;"></div>
      <div style="font-family:var(--font-sans);font-size:20px;font-weight:700;color:#1C2024;line-height:1.35;">枠内は<br>直系親族</div>
    `;
    nodesLayer.appendChild(legendBand);

    // 世代Y座標マップ（上：6世尊属 〜 中央：1世本人 〜 下：-6世仍孫）
    const rowY = {
      7: 48,    // 高祖父の祖父・祖母 (6親等)
      6: 155,   // 高祖父の父・母 (5親等)
      5: 265,   // 高祖父・高祖母・高祖伯叔父母 (4〜5親等)
      4: 380,   // 曽祖父・曽祖母・曽祖伯叔父母 (3〜4親等)
      3: 495,   // 祖父・祖母・大伯叔父母・族伯叔父母 (2〜5親等)
      2: 610,   // 父・母・伯叔父母・従伯叔父母 (1〜5親等)
      1: 725,   // 本人・配偶者・兄弟姉妹・いとこ・はとこ (0〜6親等)
      0: 815,   // 息子・嫁・婿・娘・甥姪・従甥姪
      '-1': 920,// 孫・又甥姪・従甥姪孫
      '-2': 1025,// 曽孫・曽姪孫
      '-3': 1130,// 玄孫・玄姪孫
      '-4': 1235,// 来孫
      '-5': 1340,// 昆孫
      '-6': 1445 // 仍孫
    };

    const boxW = 66;
    const boxH = 84;

    // 添付画像2のすべての親族ノード定義（既存の人物データがあれば統合表示）
    const styleBNodes = [
      // Row 7: 高祖父の祖父母
      { id: 'b_g6_m', x: 384, y: rowY[7], gen: 7, role: '高祖父の祖母', ruby: 'こうそふのそぼ', deg: '6親等', inBand: true },
      { id: 'b_g6_f', x: 472, y: rowY[7], gen: 7, role: '高祖父の祖父', ruby: 'こうそふのそふ', deg: '6親等', inBand: true },

      // Row 6: 高祖父の父母
      { id: 'b_g5_m', x: 384, y: rowY[6], gen: 6, role: '高祖父の母', ruby: 'こうそふのはは', deg: '5親等', inBand: true },
      { id: 'b_g5_f', x: 472, y: rowY[6], gen: 6, role: '高祖父の父', ruby: 'こうそふのちち', deg: '5親等', inBand: true },

      // Row 5: 高祖父母世代
      { id: 'b_g4_ua', x: 218, y: rowY[5], gen: 5, role: '高祖叔母', ruby: 'こうそしゅくぼ', deg: '5親等' },
      { id: 'b_g4_uu', x: 298, y: rowY[5], gen: 5, role: '高祖叔父', ruby: 'こうそしゅくふ', deg: '5親等' },
      { id: 'fffm',    x: 384, y: rowY[5], gen: 5, role: '高祖母',   ruby: 'こうそぼ',       deg: '4親等', inBand: true },
      { id: 'ffff',    x: 472, y: rowY[5], gen: 5, role: '高祖父',   ruby: 'こうそふ',       deg: '4親等', inBand: true },
      { id: 'b_g4_oa', x: 558, y: rowY[5], gen: 5, role: '高祖伯母', ruby: 'こうそはくぼ',   deg: '5親等' },
      { id: 'b_g4_ou', x: 638, y: rowY[5], gen: 5, role: '高祖伯父', ruby: 'こうそはくふ',   deg: '5親等' },

      // Row 4: 曽祖父母世代
      { id: 'b_g3_ua', x: 218, y: rowY[4], gen: 4, role: '曽祖叔母', ruby: 'そうそしゅくぼ', deg: '4親等' },
      { id: 'b_g3_uu', x: 298, y: rowY[4], gen: 4, role: '曽祖叔父', ruby: 'そうそしゅくふ', deg: '4親等' },
      { id: 'ffm',     x: 384, y: rowY[4], gen: 4, role: '曽祖母',   ruby: 'そうそぼ',       deg: '3親等', inBand: true },
      { id: 'fff',     x: 472, y: rowY[4], gen: 4, role: '曽祖父',   ruby: 'そうそふ',       deg: '3親等', inBand: true },
      { id: 'b_g3_oa', x: 558, y: rowY[4], gen: 4, role: '曽祖伯母', ruby: 'そうそはくぼ',   deg: '4親等' },
      { id: 'b_g3_sp', x: 1020, y: rowY[4], gen: 4, role: '配偶者',  ruby: 'はいぐうしゃ',   deg: '4親等姻族' },
      { id: 'b_g3_ou', x: 1106, y: rowY[4], gen: 4, role: '曽祖伯父', ruby: 'そうそはくふ',  deg: '4親等' },

      // Row 3: 祖父母世代
      { id: 'b_g2_ua', x: 218, y: rowY[3], gen: 3, role: '大叔母',   ruby: 'おおおば',       deg: '3親等' },
      { id: 'c_granduncle_kazuhiko', x: 298, y: rowY[3], gen: 3, role: '大叔父', ruby: 'おおおじ', deg: '3親等' },
      { id: 'fm',      x: 384, y: rowY[3], gen: 3, role: '祖母',     ruby: 'そぼ',           deg: '2親等', inBand: true },
      { id: 'ff',      x: 472, y: rowY[3], gen: 3, role: '祖父',     ruby: 'そふ',           deg: '2親等', inBand: true },
      { id: 'c_aunt_michiko', x: 558, y: rowY[3], gen: 3, role: '大伯母', ruby: 'おおおば', deg: '3親等' },
      { id: 'b_g2_sp', x: 950, y: rowY[3], gen: 3, role: '配偶者',   ruby: 'はいぐうしゃ',   deg: '3親等姻族' },
      { id: 'b_g2_ou', x: 1036, y: rowY[3], gen: 3, role: '大伯父',  ruby: 'おおおじ',       deg: '3親等' },
      { id: 'b_g2_ca', x: 1132, y: rowY[3], gen: 3, role: '族伯祖母', ruby: 'いとこおおおば', deg: '5親等' },
      { id: 'b_g2_cu', x: 1212, y: rowY[3], gen: 3, role: '族伯祖父', ruby: 'いとこおおおじ', deg: '5親等' },

      // Row 2: 父母世代
      { id: 'b_g1_ua', x: 218, y: rowY[2], gen: 2, role: '叔母',     ruby: 'おば',           deg: '3親等' },
      { id: 'c_uncle_kazuhiro', x: 298, y: rowY[2], gen: 2, role: '叔父', ruby: 'おじ',     deg: '3親等' },
      { id: 'm',       x: 384, y: rowY[2], gen: 2, role: '母',       ruby: 'はは',           deg: '1親等', inBand: true },
      { id: 'f',       x: 472, y: rowY[2], gen: 2, role: '父',       ruby: 'ちち',           deg: '1親等', inBand: true },
      { id: 'b_g1_oa', x: 558, y: rowY[2], gen: 2, role: '伯母',     ruby: 'おば',           deg: '3親等' },
      { id: 'b_g1_sp', x: 936, y: rowY[2], gen: 2, role: '配偶者',   ruby: 'はいぐうしゃ',   deg: '3親等姻族' },
      { id: 'b_g1_ou', x: 1022, y: rowY[2], gen: 2, role: '伯父',    ruby: 'おじ',           deg: '3親等' },
      { id: 'c_2nd_haruka', x: 1118, y: rowY[2], gen: 2, role: '伯従母', ruby: 'いとこおば', deg: '4親等' },
      { id: 'c_2nd_yoshihiko', x: 1196, y: rowY[2], gen: 2, role: '伯従父', ruby: 'いとこおじ', deg: '4親等' },
      { id: 'b_g1_c2a', x: 1274, y: rowY[2], gen: 2, role: '従姉妹違', ruby: 'いとこちがい', deg: '5親等' },
      { id: 'b_g1_c2u', x: 1352, y: rowY[2], gen: 2, role: '従兄弟違', ruby: 'いとこちがい', deg: '5親等' },

      // Row 1: 本人・兄弟・いとこ・はとこ世代
      { id: 'b_ys',    x: 42,  y: rowY[1], gen: 1, role: '妹',       ruby: 'いもうと',       deg: '2親等' },
      { id: 'b_yb_sp', x: 120, y: rowY[1], gen: 1, role: '義弟',     ruby: 'ぎてい',         deg: '2親等姻族' },
      { id: 'b_ys_sp', x: 204, y: rowY[1], gen: 1, role: '義妹',     ruby: 'ぎまい',         deg: '2親等姻族' },
      { id: 'b_yb',    x: 288, y: rowY[1], gen: 1, role: '弟',       ruby: 'おとうと',       deg: '2親等' },
      { id: 'spouse',  x: 384, y: rowY[1], gen: 1, role: '配偶者',   ruby: 'はいぐうしゃ',   deg: '配偶者', inBand: true },
      { id: 'self',    x: 472, y: rowY[1], gen: 1, role: '本人',     ruby: 'ほんにん',       deg: '本人', isSelf: true, inBand: true },
      { id: 'elder_sister', x: 558, y: rowY[1], gen: 1, role: '姉',  ruby: 'あね',           deg: '2親等' },
      { id: 'b_es_sp', x: 642, y: rowY[1], gen: 1, role: '姉婿',     ruby: 'あねむこ',       deg: '2親等姻族' },
      { id: 'b_eb_sp', x: 726, y: rowY[1], gen: 1, role: '嫂',       ruby: 'あによめ',       deg: '2親等姻族' },
      { id: 'b_eb',    x: 808, y: rowY[1], gen: 1, role: '兄',       ruby: 'あに',           deg: '2親等' },
      { id: 'c_cousin_kiyomi', x: 896, y: rowY[1], gen: 1, role: '従姉妹', ruby: 'いとこ',   deg: '4親等' },
      { id: 'c_cousin_husband_ichiro', x: 978, y: rowY[1], gen: 1, role: '配偶者', ruby: 'はいぐうしゃ', deg: '4親等姻族' },
      { id: 'c_cousin_kazutetsu', x: 1060, y: rowY[1], gen: 1, role: '従兄弟', ruby: 'いとこ', deg: '4親等' },
      { id: 'b_hatoko_f', x: 1148, y: rowY[1], gen: 1, role: '再従姉妹', ruby: 'はとこ',     deg: '6親等' },
      { id: 'c_2nd_daisuke', x: 1226, y: rowY[1], gen: 1, role: '再従兄弟', ruby: 'はとこ',  deg: '6親等' },

      // Row 0: 子（息子・嫁・娘）・甥姪・従甥姪世代
      { id: 'daughter', x: 218, y: rowY[0], gen: 0, role: '娘',      ruby: 'むすめ',         deg: '1親等', inBand: true },
      { id: 'b_son_in_law', x: 304, y: rowY[0], gen: 0, role: '婿',  ruby: 'むこ',           deg: '1親等姻族' },
      { id: 'b_dau_in_law', x: 384, y: rowY[0], gen: 0, role: '嫁',  ruby: 'よめ',           deg: '1親等姻族', inBand: true },
      { id: 'son',      x: 472, y: rowY[0], gen: 0, role: '息子',    ruby: 'むすこ',         deg: '1親等', inBand: true },
      { id: 'b_niece',  x: 686, y: rowY[0], gen: 0, role: '姪',      ruby: 'めい',           deg: '3親等' },
      { id: 'b_neph_sp', x: 766, y: rowY[0], gen: 0, role: '配偶者', ruby: 'はいぐうしゃ',   deg: '3親等姻族' },
      { id: 'b_nephew', x: 848, y: rowY[0], gen: 0, role: '甥',      ruby: 'おい',           deg: '3親等' },
      { id: 'b_c_niece', x: 984, y: rowY[0], gen: 0, role: '従姪',   ruby: 'いとこめい',     deg: '5親等' },
      { id: 'c_cousin_child_taro', x: 1064, y: rowY[0], gen: 0, role: '従甥', ruby: 'いとこおい', deg: '5親等' },
      { id: 'b_c_diff_f', x: 1144, y: rowY[0], gen: 0, role: '従姉妹違', ruby: 'いとこちがい', deg: '5親等' },
      { id: 'b_c_diff_m', x: 1224, y: rowY[0], gen: 0, role: '従兄弟違', ruby: 'いとこちがい', deg: '5親等' },

      // Row -1: 孫・又甥姪・従甥姪孫
      { id: 'b_grandchild', x: 428, y: rowY['-1'], gen: -1, role: '孫', ruby: 'まご', deg: '2親等', inBand: true },
      { id: 'b_gniece', x: 766, y: rowY['-1'], gen: -1, role: '又姪（姪孫）', ruby: 'まためい（てっそん）', deg: '4親等' },
      { id: 'b_gnephew', x: 848, y: rowY['-1'], gen: -1, role: '又甥（姪孫）', ruby: 'またおい（てっそん）', deg: '4親等' },
      { id: 'b_c_gniece', x: 984, y: rowY['-1'], gen: -1, role: '従姪孫', ruby: 'じゅうてっそん', deg: '6親等' },
      { id: 'b_c_gnephew', x: 1064, y: rowY['-1'], gen: -1, role: '従甥孫', ruby: 'じゅうてっそん', deg: '6親等' },

      // Row -2: 曽孫・曽姪孫
      { id: 'b_ggchild', x: 428, y: rowY['-2'], gen: -2, role: '曽孫', ruby: 'ひまご', deg: '3親等', inBand: true },
      { id: 'b_ggnephew', x: 848, y: rowY['-2'], gen: -2, role: '曽姪孫', ruby: 'そうてっそん', deg: '5親等' },

      // Row -3: 玄孫・玄姪孫
      { id: 'b_gggchild', x: 428, y: rowY['-3'], gen: -3, role: '玄孫', ruby: 'やしゃご', deg: '4親等', inBand: true },
      { id: 'b_gggnephew', x: 848, y: rowY['-3'], gen: -3, role: '玄姪孫', ruby: 'げんてっそん', deg: '6親等' },

      // Row -4 〜 -6: 来孫・昆孫・仍孫
      { id: 'b_raisun', x: 428, y: rowY['-4'], gen: -4, role: '来孫', ruby: 'らいそん', deg: '5親等', inBand: true },
      { id: 'b_konsun', x: 428, y: rowY['-5'], gen: -5, role: '昆孫', ruby: 'こんそん', deg: '6親等', inBand: true },
      { id: 'b_josun',  x: 428, y: rowY['-6'], gen: -6, role: '仍孫', ruby: 'じょうそん', deg: '7親等', inBand: true }
    ];

    const mapById = {};
    styleBNodes.forEach(n => {
      mapById[n.id] = n;
    });

    // 夫婦二重線および親子接続線の描画（isDirectLine有効時は朱線 #B22D25 強調）
    function isPersonDirect(id) {
      return Boolean(project.people[id] && project.people[id].isDirectLine);
    }

    function drawMarriageLine(id1, id2) {
      if (!project.people[id1] || !project.people[id2]) return null;
      const a = mapById[id1];
      const b = mapById[id2];
      if (!a || !b) return null;
      const x1 = a.x + boxW;
      const x2 = b.x;
      const ym = a.y + boxH / 2;
      const isShu = isPersonDirect(id1) && isPersonDirect(id2);
      const strokeColor = isShu ? '#B22D25' : '#1C2024';
      const strokeW = isShu ? 2.5 : 1.8;
      svg.appendChild(createSvgElement('line', { x1, y1: ym - 3, x2, y2: ym - 3, stroke: strokeColor, 'stroke-width': strokeW }));
      svg.appendChild(createSvgElement('line', { x1, y1: ym + 3, x2, y2: ym + 3, stroke: strokeColor, 'stroke-width': strokeW }));
      return { midX: (x1 + x2) / 2, midY: ym, isParentDirect: isPersonDirect(id1) || isPersonDirect(id2) };
    }

    function drawParentToChildren(p1, p2, childIds, railOffset = 18) {
      const p1Exists = Boolean(mapById[p1] && project.people[p1]);
      const p2Exists = Boolean(mapById[p2] && project.people[p2]);
      if (!p1Exists && !p2Exists) return;

      let m = null;
      if (p1Exists && p2Exists) {
        m = drawMarriageLine(p1, p2);
      } else {
        const singleId = p1Exists ? p1 : p2;
        const singleNode = mapById[singleId];
        m = {
          midX: singleNode.x + boxW / 2,
          midY: singleNode.y + boxH,
          isParentDirect: isPersonDirect(singleId)
        };
      }
      const validChildIds = childIds.filter(cid => mapById[cid] && project.people[cid]);
      if (!m || !validChildIds.length) return;
      const firstChild = mapById[validChildIds[0]];
      const railY = firstChild.y - railOffset;
      const hasDirectChild = validChildIds.some(cid => isPersonDirect(cid));
      const stemShu = m.isParentDirect && hasDirectChild;

      svg.appendChild(createSvgElement('line', {
        x1: m.midX, y1: m.midY + (p1Exists && p2Exists ? 3 : 0),
        x2: m.midX, y2: railY,
        stroke: stemShu ? '#B22D25' : '#1C2024', 'stroke-width': stemShu ? 3.5 : 1.8
      }));

      const xs = validChildIds.map(cid => mapById[cid].x + boxW / 2).concat([m.midX]);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);

      if (maxX > minX) {
        svg.appendChild(createSvgElement('line', {
          x1: minX, y1: railY,
          x2: maxX, y2: railY,
          stroke: '#1C2024', 'stroke-width': 1.8
        }));
      }

      validChildIds.forEach(cid => {
        const c = mapById[cid];
        const cShu = isPersonDirect(cid);
        if (cShu && m.isParentDirect) {
          // 親から直系子へのレール区間も朱線で上書き強調
          svg.appendChild(createSvgElement('line', {
            x1: m.midX, y1: railY,
            x2: c.x + boxW / 2, y2: railY,
            stroke: '#B22D25', 'stroke-width': 3.5
          }));
        }
        svg.appendChild(createSvgElement('line', {
          x1: c.x + boxW / 2, y1: railY,
          x2: c.x + boxW / 2, y2: c.y,
          stroke: cShu ? '#B22D25' : '#1C2024', 'stroke-width': cShu ? 3.5 : 1.8
        }));
      });
    }

    function hasAllNodes(...ids) {
      return ids.every(id => Boolean(mapById[id] && project.people[id]));
    }

    // 直系尊属・傍系の接続
    drawParentToChildren('b_g6_m', 'b_g6_f', ['b_g5_f'], 16);
    drawParentToChildren('b_g5_m', 'b_g5_f', ['b_g4_ua', 'b_g4_uu', 'ffff', 'b_g4_oa', 'b_g4_ou'], 18);
    drawParentToChildren('fffm', 'ffff', ['b_g3_ua', 'b_g3_uu', 'fff', 'b_g3_oa', 'b_g3_ou'], 18);
    drawParentToChildren('ffm', 'fff', ['b_g2_ua', 'c_granduncle_kazuhiko', 'ff', 'c_aunt_michiko', 'b_g2_ou'], 18);
    drawParentToChildren('b_g3_sp', 'b_g3_ou', ['b_g2_ca', 'b_g2_cu'], 18);
    drawParentToChildren('fm', 'ff', ['b_g1_ua', 'c_uncle_kazuhiro', 'f', 'b_g1_oa', 'b_g1_ou'], 18);
    drawParentToChildren('b_g2_sp', 'b_g2_ou', ['c_2nd_haruka', 'c_2nd_yoshihiko'], 18);

    // 族伯祖父 -> 従兄弟違
    if (hasAllNodes('b_g2_cu', 'b_g1_c2u', 'b_g1_c2a')) {
      svg.appendChild(createSvgElement('path', {
        d: `M ${mapById['b_g2_cu'].x + boxW / 2} ${mapById['b_g2_cu'].y + boxH} L ${mapById['b_g2_cu'].x + boxW / 2} ${rowY[2] - 16} L ${mapById['b_g1_c2u'].x + boxW / 2} ${rowY[2] - 16} L ${mapById['b_g1_c2u'].x + boxW / 2} ${rowY[2]}`,
        fill: 'none', stroke: '#1C2024', 'stroke-width': 1.8
      }));
      svg.appendChild(createSvgElement('line', {
        x1: mapById['b_g1_c2a'].x + boxW / 2, y1: rowY[2] - 16,
        x2: mapById['b_g1_c2a'].x + boxW / 2, y2: rowY[2],
        stroke: '#1C2024', 'stroke-width': 1.8
      }));
    }

    // 父母 -> 本人・兄弟姉妹
    drawParentToChildren('m', 'f', ['b_ys', 'b_yb', 'self', 'elder_sister', 'b_eb'], 18);
    drawMarriageLine('b_ys', 'b_yb_sp');
    drawMarriageLine('b_ys_sp', 'b_yb');
    drawMarriageLine('elder_sister', 'b_es_sp');

    // 兄・嫂 -> 甥・姪
    drawParentToChildren('b_eb_sp', 'b_eb', ['b_niece', 'b_nephew'], 18);
    // 伯父・配偶者 -> いとこ
    drawParentToChildren('b_g1_sp', 'b_g1_ou', ['c_cousin_kiyomi', 'c_cousin_kazutetsu'], 18);
    // 伯従父 -> はとこ
    if (hasAllNodes('c_2nd_yoshihiko', 'b_hatoko_f', 'c_2nd_daisuke')) {
      svg.appendChild(createSvgElement('path', {
        d: `M ${mapById['c_2nd_yoshihiko'].x + boxW / 2} ${mapById['c_2nd_yoshihiko'].y + boxH} L ${mapById['c_2nd_yoshihiko'].x + boxW / 2} ${rowY[1] - 16} L ${mapById['b_hatoko_f'].x + boxW / 2} ${rowY[1] - 16} L ${mapById['b_hatoko_f'].x + boxW / 2} ${rowY[1]}`,
        fill: 'none', stroke: '#1C2024', 'stroke-width': 1.8
      }));
      svg.appendChild(createSvgElement('line', {
        x1: mapById['c_2nd_daisuke'].x + boxW / 2, y1: rowY[1] - 16,
        x2: mapById['c_2nd_daisuke'].x + boxW / 2, y2: rowY[1],
        stroke: '#1C2024', 'stroke-width': 1.8
      }));
    }

    // 本人・配偶者 -> 娘・息子
    drawParentToChildren('spouse', 'self', ['daughter', 'son'], 14);
    drawMarriageLine('daughter', 'b_son_in_law');
    // 息子・嫁 -> 孫
    drawParentToChildren('b_dau_in_law', 'son', ['b_grandchild'], 16);

    // 甥・配偶者 -> 又甥・又姪
    drawParentToChildren('b_neph_sp', 'b_nephew', ['b_gniece', 'b_gnephew'], 16);

    // 従兄弟・配偶者 -> 従甥・従姪
    drawParentToChildren('c_cousin_husband_ichiro', 'c_cousin_kazutetsu', ['b_c_niece', 'c_cousin_child_taro'], 16);
    // 従兄弟 -> 従兄弟違
    if (hasAllNodes('c_cousin_kazutetsu', 'b_c_diff_m', 'b_c_diff_f')) {
      svg.appendChild(createSvgElement('path', {
        d: `M ${mapById['c_cousin_kazutetsu'].x + boxW / 2} ${mapById['c_cousin_kazutetsu'].y + boxH} L ${mapById['c_cousin_kazutetsu'].x + boxW / 2} ${rowY[0] - 16} L ${mapById['b_c_diff_m'].x + boxW / 2} ${rowY[0] - 16} L ${mapById['b_c_diff_m'].x + boxW / 2} ${rowY[0]}`,
        fill: 'none', stroke: '#1C2024', 'stroke-width': 1.8
      }));
      svg.appendChild(createSvgElement('line', {
        x1: mapById['b_c_diff_f'].x + boxW / 2, y1: rowY[0] - 16,
        x2: mapById['b_c_diff_f'].x + boxW / 2, y2: rowY[0],
        stroke: '#1C2024', 'stroke-width': 1.8
      }));
    }

    // 孫 -> 曽孫 -> 玄孫 -> 来孫 -> 昆孫 -> 仍孫 の直系縦ライン
    const chainMain = ['b_grandchild', 'b_ggchild', 'b_gggchild', 'b_raisun', 'b_konsun', 'b_josun'];
    for (let i = 0; i < chainMain.length - 1; i++) {
      if (!hasAllNodes(chainMain[i], chainMain[i + 1])) continue;
      const topN = mapById[chainMain[i]];
      const botN = mapById[chainMain[i + 1]];
      svg.appendChild(createSvgElement('line', {
        x1: topN.x + boxW / 2, y1: topN.y + boxH,
        x2: botN.x + boxW / 2, y2: botN.y,
        stroke: '#1C2024', 'stroke-width': 1.8
      }));
    }

    // 又甥 -> 曽姪孫 -> 玄姪孫
    const chainNeph = ['b_gnephew', 'b_ggnephew', 'b_gggnephew'];
    for (let i = 0; i < chainNeph.length - 1; i++) {
      if (!hasAllNodes(chainNeph[i], chainNeph[i + 1])) continue;
      const topN = mapById[chainNeph[i]];
      const botN = mapById[chainNeph[i + 1]];
      svg.appendChild(createSvgElement('line', {
        x1: topN.x + boxW / 2, y1: topN.y + boxH,
        x2: botN.x + boxW / 2, y2: botN.y,
        stroke: '#1C2024', 'stroke-width': 1.8
      }));
    }

    // 従甥 -> 従甥孫・従姪孫
    if (hasAllNodes('c_cousin_child_taro', 'b_c_gniece', 'b_c_gnephew')) {
      svg.appendChild(createSvgElement('path', {
        d: `M ${mapById['c_cousin_child_taro'].x + boxW / 2} ${mapById['c_cousin_child_taro'].y + boxH} L ${mapById['c_cousin_child_taro'].x + boxW / 2} ${rowY['-1'] - 14} L ${mapById['b_c_gniece'].x + boxW / 2} ${rowY['-1'] - 14} L ${mapById['b_c_gniece'].x + boxW / 2} ${rowY['-1']}`,
        fill: 'none', stroke: '#1C2024', 'stroke-width': 1.8
      }));
      svg.appendChild(createSvgElement('line', {
        x1: mapById['b_c_gnephew'].x + boxW / 2, y1: rowY['-1'] - 14,
        x2: mapById['b_c_gnephew'].x + boxW / 2, y2: rowY['-1'],
        stroke: '#1C2024', 'stroke-width': 1.8
      }));
    }

    // ユーザー追加ノードの配置（様式B）
    const styleBMap = {};
    styleBNodes.forEach(item => { styleBMap[item.id] = item; });
    const rootId = project.rootPersonId || 'self';

    const extraBNodes = Object.values(project.people).filter(p => !styleBMap[p.id] && p.isUserAdded && !p.id.startsWith('c_'));
    let finalWidthB = width;
    let finalHeightB = height;

    if (extraBNodes.length > 0) {
      const occupiedBX = {};
      styleBNodes.forEach(n => {
        occupiedBX[n.gen] = occupiedBX[n.gen] || [];
        occupiedBX[n.gen].push(n.x);
      });

      extraBNodes.forEach(p => {
        const g = Number(p.generation ?? 1);
        const y = rowY[g] ?? (g > 7 ? 48 - (g - 7) * 105 : 1445 + (-6 - g) * 105);
        rowY[g] = y;
        const list = occupiedBX[g] || [];
        let x = 1280;
        const anchor = (p.spouseId && styleBMap[p.spouseId]) || (p.fatherId && styleBMap[p.fatherId]) || (p.motherId && styleBMap[p.motherId]);
        if (anchor) x = anchor.x + boxW + 24;
        while (list.some(ox => Math.abs(ox - x) < boxW + 18)) {
          x += boxW + 22;
        }
        list.push(x);
        occupiedBX[g] = list;
        finalWidthB = Math.max(finalWidthB, x + boxW + 70);
        finalHeightB = Math.max(finalHeightB, y + boxH + 70);

        const newItem = {
          id: p.id,
          x,
          y,
          gen: g,
          role: p.roleLabel || '親族',
          ruby: p.roleRuby || '',
          deg: p.degreeLabel || '',
          inBand: Boolean(p.isDirectLine),
          isSelf: p.id === rootId
        };
        styleBNodes.push(newItem);
        styleBMap[p.id] = newItem;
        mapById[p.id] = newItem;
      });

      // 追加ノードの接続線
      extraBNodes.forEach(p => {
        const item = styleBMap[p.id];
        if (!item) return;
        if (p.spouseId && mapById[p.spouseId]) {
          const sp = mapById[p.spouseId];
          if (item.x > sp.x) drawMarriageLine(p.spouseId, p.id);
          else drawMarriageLine(p.id, p.spouseId);
        }
        const parentId = p.fatherId || p.motherId;
        if (parentId && mapById[parentId]) {
          const par = mapById[parentId];
          const midY = (par.y + boxH + item.y) / 2;
          const isShu = Boolean(p.isDirectLine && project.people[parentId]?.isDirectLine);
          svg.appendChild(createSvgElement('path', {
            d: `M ${par.x + boxW / 2} ${par.y + boxH} L ${par.x + boxW / 2} ${midY} L ${item.x + boxW / 2} ${midY} L ${item.x + boxW / 2} ${item.y}`,
            fill: 'none',
            stroke: isShu ? '#B22D25' : '#1C2024',
            'stroke-width': isShu ? 3 : 1.8
          }));
        }
      });

      stageEl.style.width = `${finalWidthB}px`;
      stageEl.style.height = `${finalHeightB}px`;
      svg.setAttribute('width', String(finalWidthB));
      svg.setAttribute('height', String(finalHeightB));
      svg.setAttribute('viewBox', `0 0 ${finalWidthB} ${finalHeightB}`);
      boardFrame.style.width = `${finalWidthB - 48}px`;
      boardFrame.style.height = `${finalHeightB - 40}px`;
    }

    const INHERIT_BADGE_MAP = {
      decedent: { text: '被相続人', cls: 'inherit-decedent' },
      heir: { text: '相続人', cls: 'inherit-heir' },
      renounced: { text: '放棄', cls: 'inherit-renounced' },
      divided: { text: '分割済', cls: 'inherit-divided' },
      successive: { text: '数次', cls: 'inherit-successive' }
    };

    const nodeCoordsB = {};

    // ノード要素を生成（プロジェクトに実在する人物のみ描画）
    styleBNodes.forEach(item => {
      const person = project.people[item.id];
      if (!person) return;
      const isDirect = Boolean(person && person.isDirectLine);
      const isRoot = item.id === rootId;
      const nodeEl = document.createElement('div');
      nodeEl.className = `person-node style-b ${isRoot ? 'is-self' : ''} ${item.inBand ? 'in-direct-band' : ''} ${isDirect ? 'direct-line' : ''}`;
      if (callbacks.selectedId === item.id) nodeEl.classList.add('selected');
      nodeEl.dataset.personId = item.id;
      nodeEl.dataset.generation = String(item.gen);
      nodeEl.style.left = `${item.x}px`;
      nodeEl.style.top = `${item.y}px`;
      nodeEl.style.width = `${boxW}px`;
      nodeEl.style.height = `${boxH}px`;

      nodeCoordsB[item.id] = { x: item.x, y: item.y, w: boxW, h: boxH, gen: item.gen };

      const fullName = `${person.familyName || ''}${person.givenName || ''}`.trim();
      const inh = person.inheritanceStatus && INHERIT_BADGE_MAP[person.inheritanceStatus];

      nodeEl.innerHTML = `
        <span class="degree-badge">${person.degreeLabel || item.deg}</span>
        ${inh ? `<span class="inherit-status-badge ${inh.cls}">${inh.text}</span>` : ''}
        <div class="style-b-content">
          <span class="style-b-ruby-col">${person.roleRuby || item.ruby}</span>
          <span class="style-b-main-col">${person.roleLabel || item.role}</span>
          ${fullName ? `<span class="style-b-subname-col">${fullName}</span>` : ''}
        </div>
        <button type="button" class="node-add-trigger" title="親族情報を編集・追加" data-add-for="${item.id}">＋</button>
      `;

      if (person.birthDate || person.deathDate) {
        const bStr = person.birthDate ? KakeizuData.formatDateByMode(person.birthDate, project.eraDisplayMode, true) : '';
        const dStr = person.deathDate ? `〜${KakeizuData.formatDateByMode(person.deathDate, project.eraDisplayMode, true)}` : '';
        const cap = document.createElement('div');
        cap.className = 'node-meta-caption style-b-meta';
        cap.textContent = `${bStr}${dStr}`;
        nodeEl.appendChild(cap);
      }

      nodeEl.addEventListener('click', (e) => {
        if (e.target.closest('.node-add-trigger')) {
          e.stopPropagation();
          callbacks.onQuickAddClick(item.id, e.target.closest('.node-add-trigger'));
          return;
        }
        callbacks.onSelectPerson(item.id);
      });

      nodesLayer.appendChild(nodeEl);
    });

    stageEl.innerHTML = '';
    stageEl.appendChild(svg);
    stageEl.appendChild(nodesLayer);

    return {
      width: finalWidthB,
      height: finalHeightB,
      genYMap: rowY,
      nodeCoords: nodeCoordsB
    };
  }

  // ===========================================================================
  // 様式C：伝統家譜型（夫婦並列・点線世代区切りスタイル / 添付画像3 完全準拠）
  // ===========================================================================
  function renderStyleC(project, stageEl, callbacks) {
    const width = 1480;
    const height = 980;
    stageEl.style.width = `${width}px`;
    stageEl.style.height = `${height}px`;

    const svg = createSvgElement('svg', {
      class: 'tree-svg-layer',
      width,
      height,
      viewBox: `0 0 ${width} ${height}`
    });

    const nodesLayer = document.createElement('div');
    nodesLayer.className = 'tree-nodes-layer';

    // 最上部の金襴表題枠「〇〇家 家系図」（添付画像3準拠）
    const plaque = document.createElement('div');
    plaque.className = 'style-c-title-plaque';
    plaque.style.left = `${(width - 470) / 2}px`;
    plaque.style.top = '32px';
    plaque.style.width = '470px';
    plaque.style.height = '64px';
    plaque.textContent = project.title || '田中家 家系図';
    nodesLayer.appendChild(plaque);

    // 家紋（様式C表題左横）
    const crestObj = (KakeizuData.FAMILY_CRESTS || []).find(c => c.id === project.familyCrest);
    if (crestObj && crestObj.id !== 'none' && crestObj.svgInner) {
      const crestBox = document.createElement('div');
      crestBox.className = 'style-c-crest-box';
      crestBox.style.left = `${(width - 470) / 2 - 76}px`;
      crestBox.style.top = '36px';
      crestBox.title = `家紋：${crestObj.label}`;
      crestBox.innerHTML = `<svg width="56" height="56" viewBox="0 0 48 48">${crestObj.svgInner}</svg>`;
      nodesLayer.appendChild(crestBox);
    }

    // 家訓（様式C表題右横または下部）
    if (project.familyMotto && project.familyMotto.trim()) {
      const mottoBox = document.createElement('div');
      mottoBox.className = 'style-c-motto-box';
      mottoBox.style.left = `${(width + 470) / 2 + 20}px`;
      mottoBox.style.top = '34px';
      mottoBox.textContent = `家訓：${project.familyMotto.trim()}`;
      nodesLayer.appendChild(mottoBox);
    }

    const nodeW = 44;
    const nodeH = 114;

    // 世代ごとのY座標（上から最古の先祖 -> 下へ子孫を展開：添付画像3完全準拠）
    const genY = {
      4: 146, // 最上段（田中和夫・(佐藤)花子）
      3: 312, // 第2段（田中和也・(中田)恵子、山田一・(田中)道子、田中和彦・(斎藤)良子）
      2: 478, // 第3段（田中誠也・(加藤)美穂、田中和弘・(藤原)美春、田中博一・(太田)春香、田中義彦・(岡田)翔子、田中愛子）
      1: 644, // 第4段（田中美咲、田中太一、田中清美、田中和哲、(田中)数子・佐藤一郎、田中大輔・(佐藤)花子、田中義男、田中和義・(佐藤)花子）
      0: 810  // 第5段（佐藤太郎、田中春奈、および本人の子）
    };

    // 添付画像3の配置座標（各人物のX座標）
    const layoutC = [
      // 第1段（世代4：曽祖父母）
      { id: 'fff', x: 686, y: genY[4], gen: 4 },
      { id: 'ffm', x: 776, y: genY[4], gen: 4 },

      // 第2段（世代3：祖父母・大伯叔父母）
      { id: 'ff',                    x: 324, y: genY[3], gen: 3 },
      { id: 'fm',                    x: 414, y: genY[3], gen: 3 },
      { id: 'c_uncle_hajime',        x: 640, y: genY[3], gen: 3 },
      { id: 'c_aunt_michiko',        x: 732, y: genY[3], gen: 3 },
      { id: 'c_granduncle_kazuhiko', x: 1142, y: genY[3], gen: 3 },
      { id: 'c_grandaunt_ryoko',     x: 1232, y: genY[3], gen: 3 },

      // 第3段（世代2：父母・叔父母・従伯叔父母）
      { id: 'f',               x: 232, y: genY[2], gen: 2 },
      { id: 'm',               x: 322, y: genY[2], gen: 2 },
      { id: 'c_uncle_kazuhiro', x: 506, y: genY[2], gen: 2 },
      { id: 'c_aunt_miharu',   x: 596, y: genY[2], gen: 2 },
      { id: 'c_2nd_hiroichi',  x: 904, y: genY[2], gen: 2 },
      { id: 'c_2nd_haruka',    x: 996, y: genY[2], gen: 2 },
      { id: 'c_2nd_yoshihiko', x: 1186, y: genY[2], gen: 2 },
      { id: 'c_2nd_shoko',     x: 1278, y: genY[2], gen: 2 },
      { id: 'c_2nd_aiko',      x: 1376, y: genY[2], gen: 2 },

      // 第4段（世代1：本人・姉・いとこ・はとこ）
      { id: 'elder_sister',            x: 232, y: genY[1], gen: 1 },
      { id: 'self',                    x: 324, y: genY[1], gen: 1 },
      { id: 'c_cousin_kiyomi',         x: 440, y: genY[1], gen: 1 },
      { id: 'c_cousin_kazutetsu',      x: 552, y: genY[1], gen: 1 },
      { id: 'c_cousin_kazuko',         x: 666, y: genY[1], gen: 1 },
      { id: 'c_cousin_husband_ichiro', x: 758, y: genY[1], gen: 1 },
      { id: 'c_2nd_daisuke',           x: 950, y: genY[1], gen: 1 },
      { id: 'c_2nd_hanako2',           x: 1040, y: genY[1], gen: 1 },
      { id: 'c_2nd_yoshio',            x: 1188, y: genY[1], gen: 1 },
      { id: 'c_2nd_kazuyoshi',         x: 1278, y: genY[1], gen: 1 },
      { id: 'c_2nd_hanako3',           x: 1368, y: genY[1], gen: 1 },

      // 第5段（世代0：子世代）
      { id: 'c_cousin_child_taro', x: 712, y: genY[0], gen: 0 },
      { id: 'c_2nd_haruna',        x: 995, y: genY[0], gen: 0 }
    ];

    // ユーザーがウィザードや「＋」ボタンで追加したカスタム人物も衝突回避しながら自動配置
    const placedIds = new Set(layoutC.map(item => item.id));
    const occupiedCX = {};
    layoutC.forEach(item => {
      occupiedCX[item.gen] = occupiedCX[item.gen] || [];
      occupiedCX[item.gen].push(item.x);
    });

    let finalWidthC = width;
    let finalHeightC = height;

    const extraPeopleC = Object.values(project.people).filter(p => {
      if (placedIds.has(p.id)) return false;
      if (p.id.startsWith('b_')) return false;
      if (p.generation >= 5 && !p.isUserAdded) return false;
      if (['fmf', 'fmm', 'mff', 'mfm', 'mmf', 'mmm', 'mf', 'mm'].includes(p.id) && !p.isUserAdded) return false;
      if (['spouse', 'son', 'daughter'].includes(p.id) && !p.isUserAdded) return false;
      return true;
    });

    function findFreeXC(gen, preferredX) {
      const list = occupiedCX[gen] || [];
      let x = Math.max(60, preferredX);
      while (list.some(ox => Math.abs(ox - x) < nodeW + 30)) {
        x += nodeW + 38;
      }
      list.push(x);
      occupiedCX[gen] = list;
      finalWidthC = Math.max(finalWidthC, x + nodeW + 80);
      return x;
    }

    extraPeopleC.forEach(p => {
      const g = Number(p.generation ?? 1);
      if (genY[g] === undefined) {
        genY[g] = g > 4 ? 146 : 810 + (-g) * 166;
      }
      const y = genY[g];
      finalHeightC = Math.max(finalHeightC, y + nodeH + 70);

      let prefX = 80;
      const anchor = (p.spouseId && layoutC.find(i => i.id === p.spouseId))
        || (p.fatherId && layoutC.find(i => i.id === p.fatherId))
        || (p.motherId && layoutC.find(i => i.id === p.motherId));
      if (anchor) {
        prefX = anchor.x + nodeW + 36;
      }
      const x = findFreeXC(g, prefX);
      layoutC.push({ id: p.id, x, y, gen: g });
      placedIds.add(p.id);
    });

    if (finalWidthC !== width || finalHeightC !== height) {
      stageEl.style.width = `${finalWidthC}px`;
      stageEl.style.height = `${finalHeightC}px`;
      svg.setAttribute('width', String(finalWidthC));
      svg.setAttribute('height', String(finalHeightC));
      svg.setAttribute('viewBox', `0 0 ${finalWidthC} ${finalHeightC}`);
    }

    // 世代区切り水平点線ガイド（添付画像3準拠）
    const dashedGuideYs = [278, 444, 610, 776];
    Object.keys(genY).map(Number).filter(g => g < 0).forEach(g => {
      dashedGuideYs.push(genY[g] - 34);
    });
    dashedGuideYs.forEach(gy => {
      svg.appendChild(createSvgElement('line', {
        x1: 50,
        y1: gy,
        x2: finalWidthC - 50,
        y2: gy,
        stroke: '#D0CECA',
        'stroke-width': 1.5,
        'stroke-dasharray': '5,5'
      }));
    });

    const posMap = {};
    layoutC.forEach(item => {
      if (project.people[item.id]) {
        posMap[item.id] = item;
      }
    });

    // 夫婦間の横接続線 + 子どもたちへの分岐線を描画（直系ハイライト時は朱線 #B22D25 強調）
    function isDirectC(id) {
      return Boolean(project.people[id] && project.people[id].isDirectLine);
    }

    function connectCoupleAndChildren(leftId, rightId, childIds = [], branchYOffset = 22) {
      const l = posMap[leftId];
      const r = posMap[rightId];
      if (!l && !r) return;

      let midX = 0;
      let midY = 0;
      const coupleDirect = isDirectC(leftId) || isDirectC(rightId);
      const bothDirect = isDirectC(leftId) && isDirectC(rightId);

      if (l && r) {
        const x1 = l.x + nodeW;
        const x2 = r.x;
        midX = (x1 + x2) / 2;
        midY = l.y + nodeH * 0.45;
        // 夫婦を結ぶ横線
        svg.appendChild(createSvgElement('line', {
          x1, y1: midY,
          x2, y2: midY,
          stroke: bothDirect ? '#B22D25' : '#1C2024',
          'stroke-width': bothDirect ? 3.5 : 2
        }));
      } else {
        const single = l || r;
        midX = single.x + nodeW / 2;
        midY = single.y + nodeH;
      }

      const validChildren = childIds.filter(cid => posMap[cid]);
      if (!validChildren.length) return;

      const firstChild = posMap[validChildren[0]];
      const railY = firstChild.y - branchYOffset;
      const anyChildDirect = validChildren.some(cid => isDirectC(cid));
      const stemShu = coupleDirect && anyChildDirect;

      // 夫婦の中央から下の水平レールへ垂線
      svg.appendChild(createSvgElement('line', {
        x1: midX, y1: midY,
        x2: midX, y2: railY,
        stroke: stemShu ? '#B22D25' : '#1C2024',
        'stroke-width': stemShu ? 3.8 : 2
      }));

      if (validChildren.length === 1 && Math.abs((firstChild.x + nodeW / 2) - midX) < 4) {
        const cShu = isDirectC(validChildren[0]);
        svg.appendChild(createSvgElement('line', {
          x1: midX, y1: railY,
          x2: midX, y2: firstChild.y,
          stroke: cShu ? '#B22D25' : '#1C2024',
          'stroke-width': cShu ? 3.8 : 2
        }));
      } else {
        const childCenters = validChildren.map(cid => posMap[cid].x + nodeW / 2).concat([midX]);
        const minX = Math.min(...childCenters);
        const maxX = Math.max(...childCenters);

        svg.appendChild(createSvgElement('line', {
          x1: minX, y1: railY,
          x2: maxX, y2: railY,
          stroke: '#1C2024',
          'stroke-width': 2
        }));

        validChildren.forEach(cid => {
          const c = posMap[cid];
          const cShu = isDirectC(cid);
          if (cShu && coupleDirect) {
            svg.appendChild(createSvgElement('line', {
              x1: midX, y1: railY,
              x2: c.x + nodeW / 2, y2: railY,
              stroke: '#B22D25',
              'stroke-width': 3.8
            }));
          }
          svg.appendChild(createSvgElement('line', {
            x1: c.x + nodeW / 2, y1: railY,
            x2: c.x + nodeW / 2, y2: c.y,
            stroke: cShu ? '#B22D25' : '#1C2024',
            'stroke-width': cShu ? 3.8 : 2
          }));
        });
      }
    }

    // 添付画像3の全ての婚姻＆親子関係を描画
    connectCoupleAndChildren('fff', 'ffm', ['ff', 'c_aunt_michiko', 'c_granduncle_kazuhiko'], 20);
    connectCoupleAndChildren('c_uncle_hajime', 'c_aunt_michiko', []);
    connectCoupleAndChildren('ff', 'fm', ['f', 'c_uncle_kazuhiro'], 20);
    connectCoupleAndChildren('c_granduncle_kazuhiko', 'c_grandaunt_ryoko', ['c_2nd_haruka', 'c_2nd_yoshihiko', 'c_2nd_aiko'], 20);
    connectCoupleAndChildren('f', 'm', ['elder_sister', 'self'], 20);
    connectCoupleAndChildren('c_uncle_kazuhiro', 'c_aunt_miharu', ['c_cousin_kiyomi', 'c_cousin_kazutetsu', 'c_cousin_kazuko'], 20);
    connectCoupleAndChildren('c_cousin_kazuko', 'c_cousin_husband_ichiro', ['c_cousin_child_taro'], 20);
    connectCoupleAndChildren('c_2nd_hiroichi', 'c_2nd_haruka', ['c_2nd_daisuke'], 20);
    connectCoupleAndChildren('c_2nd_daisuke', 'c_2nd_hanako2', ['c_2nd_haruna'], 20);
    connectCoupleAndChildren('c_2nd_yoshihiko', 'c_2nd_shoko', ['c_2nd_yoshio', 'c_2nd_kazuyoshi'], 20);
    connectCoupleAndChildren('c_2nd_kazuyoshi', 'c_2nd_hanako3', []);

    // ユーザー追加ノードの夫婦線・親子線も自動描画
    const drawnExtraCouples = new Set();
    Object.values(project.people).forEach(p => {
      if (!p.isUserAdded) return;
      const cPos = posMap[p.id];
      if (!cPos) return;

      // 配偶者との横線
      if (p.spouseId && posMap[p.spouseId]) {
        const pairKey = [p.id, p.spouseId].sort().join(':');
        if (!drawnExtraCouples.has(pairKey)) {
          drawnExtraCouples.add(pairKey);
          const spPos = posMap[p.spouseId];
          const leftPos = cPos.x < spPos.x ? cPos : spPos;
          const rightPos = cPos.x < spPos.x ? spPos : cPos;
          const ym = leftPos.y + nodeH * 0.45;
          const bothShu = isDirectC(p.id) && isDirectC(p.spouseId);
          svg.appendChild(createSvgElement('line', {
            x1: leftPos.x + nodeW,
            y1: ym,
            x2: rightPos.x,
            y2: ym,
            stroke: bothShu ? '#B22D25' : '#1C2024',
            'stroke-width': bothShu ? 3.5 : 2
          }));
        }
      }

      // 親子線（両親とも居れば夫婦中点から、片親なら親下端から）
      const fPos = p.fatherId ? posMap[p.fatherId] : null;
      const mPos = p.motherId ? posMap[p.motherId] : null;
      if (fPos || mPos) {
        let startX = 0;
        let startY = 0;
        if (fPos && mPos && Math.abs(fPos.y - mPos.y) < 4) {
          const leftP = fPos.x < mPos.x ? fPos : mPos;
          const rightP = fPos.x < mPos.x ? mPos : fPos;
          startX = (leftP.x + nodeW + rightP.x) / 2;
          startY = leftP.y + nodeH * 0.45;
        } else {
          const singleP = fPos || mPos;
          startX = singleP.x + nodeW / 2;
          startY = singleP.y + nodeH;
        }
        const railY = cPos.y - 20;
        const isShu = isDirectC(p.id) && (isDirectC(p.fatherId) || isDirectC(p.motherId));
        svg.appendChild(createSvgElement('path', {
          d: `M ${startX} ${startY} L ${startX} ${railY} L ${cPos.x + nodeW / 2} ${railY} L ${cPos.x + nodeW / 2} ${cPos.y}`,
          fill: 'none',
          stroke: isShu ? '#B22D25' : '#1C2024',
          'stroke-width': isShu ? 3.5 : 2
        }));
      }
    });

    const nodeCoordsC = {};

    // 各ノードのDOM描画（夫・男性＝水色 #B8D4E8、妻・女性＝桃色 #F9C2E6、旧姓は（旧姓）名前）
    layoutC.forEach(item => {
      const person = project.people[item.id];
      if (!person) return;

      const isFemale = person.gender === 'F';
      const isDirect = Boolean(person.isDirectLine);
      const nodeEl = document.createElement('div');
      nodeEl.className = `person-node style-c ${isFemale ? 'female' : 'male'} ${isDirect ? 'direct-line' : ''} ${item.id === (project.rootPersonId || 'self') ? 'is-root-person' : ''}`;
      if (callbacks.selectedId === item.id) nodeEl.classList.add('selected');
      nodeEl.dataset.personId = item.id;
      nodeEl.dataset.generation = String(item.gen);
      nodeEl.style.left = `${item.x}px`;
      nodeEl.style.top = `${item.y}px`;
      nodeEl.style.width = `${nodeW}px`;
      nodeEl.style.height = `${nodeH}px`;

      nodeCoordsC[item.id] = { x: item.x, y: item.y, w: nodeW, h: nodeH, gen: item.gen };

      let displayVerticalName = '';
      if (person.maidenName) {
        displayVerticalName = `（${person.maidenName}）${person.givenName || ''}`;
      } else {
        displayVerticalName = `${person.familyName || ''}　${person.givenName || ''}`.trim();
      }

      nodeEl.innerHTML = `
        ${isDirect ? '<span class="direct-shu-badge">直系</span>' : ''}
        <div class="style-c-name-vertical">${displayVerticalName}</div>
        <button type="button" class="node-add-trigger" title="親族・次世代スロットを追加" data-add-for="${item.id}">＋</button>
      `;

      if (person.birthDate || person.buddhistName) {
        const bYear = person.birthDate ? KakeizuData.formatDateByMode(person.birthDate, project.eraDisplayMode, true) : '';
        const cap = document.createElement('div');
        cap.className = 'node-meta-caption style-c-meta';
        cap.textContent = [bYear, person.buddhistName].filter(Boolean).join(' / ');
        nodeEl.appendChild(cap);
      }

      nodeEl.addEventListener('click', (e) => {
        if (e.target.closest('.node-add-trigger')) {
          e.stopPropagation();
          callbacks.onQuickAddClick(item.id, e.target.closest('.node-add-trigger'));
          return;
        }
        callbacks.onSelectPerson(item.id);
      });

      nodesLayer.appendChild(nodeEl);
    });

    stageEl.innerHTML = '';
    stageEl.appendChild(svg);
    stageEl.appendChild(nodesLayer);

    return {
      width: finalWidthC,
      height: finalHeightC,
      genYMap: genY,
      nodeCoords: nodeCoordsC
    };
  }

  function renderTree(project, stageEl, callbacks) {
    if (project.styleMode === 'B') {
      return renderStyleB(project, stageEl, callbacks);
    }
    if (project.styleMode === 'C') {
      return renderStyleC(project, stageEl, callbacks);
    }
    return renderStyleA(project, stageEl, callbacks);
  }

  return {
    renderTree
  };
})();
