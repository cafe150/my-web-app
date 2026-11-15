/**
 * 家系図作成Webアプリケーション
 * 6. 出力・エクスポート機能
 * - 公用・行政提出対応PDF（A4/A3、カラー/モノクロ印刷フォーマット）
 * - 画像出力（高解像度ベクターSVG / ラスタPNG）
 * - データバックアップ（JSONエクスポート / インポート）
 */

window.KakeizuExporter = (function () {
  function sanitizeFilename(name) {
    return (name || '家系図').replace(/[\\/:*?"<>|\s]+/g, '_');
  }

  function escapeXml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderVerticalColumn(text, x, topY, height, fontSize, fill, fontFamily = "'Noto Serif JP', serif", fontWeight = '700') {
    const chars = Array.from(String(text || ''));
    if (!chars.length) return '';
    const step = Math.min(fontSize + 2, (height - 10) / Math.max(1, chars.length));
    const startY = topY + (height - (chars.length - 1) * step) / 2 + fontSize * 0.36;
    return chars.map((ch, idx) => {
      return `<text x="${x}" y="${(startY + idx * step).toFixed(1)}" text-anchor="middle" font-family="${fontFamily}" font-size="${fontSize}" font-weight="${fontWeight}" fill="${fill}">${escapeXml(ch)}</text>`;
    }).join('');
  }

  /**
   * 現在のステージ状態からスタンドアロンSVG文字列を生成（画面表示を高精度再現）
   */
  function buildStandaloneSvgString(stageEl, project) {
    const w = parseInt(stageEl.style.width, 10) || 1480;
    const h = parseInt(stageEl.style.height, 10) || 980;
    const baseSvg = stageEl.querySelector('svg.tree-svg-layer');
    const linesMarkup = baseSvg ? baseSvg.innerHTML : '';

    let bgMarkup = '';
    let nodesSvgMarkup = '';

    // 様式B 外周点線枠・タイトル枠・青帯
    const board = stageEl.querySelector('.style-b-board');
    if (board) {
      const bx = parseFloat(board.style.left) || 24;
      const by = parseFloat(board.style.top) || 20;
      const bw = parseFloat(board.style.width) || (w - 48);
      const bh = parseFloat(board.style.height) || (h - 40);
      bgMarkup += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="none" stroke="#8C8982" stroke-width="2" stroke-dasharray="6,6" />`;
    }

    stageEl.querySelectorAll('.style-b-direct-band').forEach(band => {
      const bx = parseFloat(band.style.left) || 0;
      const by = parseFloat(band.style.top) || 0;
      const bw = parseFloat(band.style.width) || 0;
      const bh = parseFloat(band.style.height) || 0;
      bgMarkup += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="#D6E4F0" />`;
    });

    const bTitleBox = stageEl.querySelector('.style-b-title-box');
    if (bTitleBox) {
      bgMarkup += `
        <g>
          <rect x="${w - 310}" y="42" width="240" height="48" fill="#FFFFFF" stroke="#1C2024" stroke-width="2" />
          <text x="${w - 190}" y="73" text-anchor="middle" font-family="'Noto Serif JP', serif" font-size="22" font-weight="700" fill="#1C2024">${escapeXml(bTitleBox.textContent || '親族　呼び名一覧')}</text>
        </g>
        <g>
          <rect x="${w - 310}" y="${h - 150}" width="95" height="52" fill="#D6E4F0" stroke="#C8C5BC" stroke-width="1" />
          <text x="${w - 200}" y="${h - 128}" font-family="'Noto Sans JP', sans-serif" font-size="18" font-weight="700" fill="#1C2024">枠内は</text>
          <text x="${w - 200}" y="${h - 104}" font-family="'Noto Sans JP', sans-serif" font-size="18" font-weight="700" fill="#1C2024">直系親族</text>
        </g>
      `;
    }

    // 様式Cの金襴表題枠・家紋・家訓
    const plaque = stageEl.querySelector('.style-c-title-plaque');
    if (plaque) {
      const px = parseFloat(plaque.style.left) || 505;
      const py = parseFloat(plaque.style.top) || 32;
      const pw = parseFloat(plaque.style.width) || 470;
      const ph = parseFloat(plaque.style.height) || 64;
      const text = plaque.textContent || project.title || '';
      bgMarkup += `
        <g>
          <rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="#FFE07D" stroke="#1C2024" stroke-width="4" />
          <text x="${px + pw / 2}" y="${py + ph / 2 + 10}" text-anchor="middle" font-family="'Noto Serif JP', serif" font-size="28" font-weight="700" fill="#1C2024">${escapeXml(text)}</text>
        </g>
      `;

      const crestBox = stageEl.querySelector('.style-c-crest-box svg');
      if (crestBox) {
        const cx = parseFloat(stageEl.querySelector('.style-c-crest-box').style.left) || (px - 76);
        const cy = parseFloat(stageEl.querySelector('.style-c-crest-box').style.top) || (py + 4);
        bgMarkup += `<g transform="translate(${cx}, ${cy}) scale(1.166)">${crestBox.innerHTML}</g>`;
      }

      const mottoBox = stageEl.querySelector('.style-c-motto-box');
      if (mottoBox) {
        const mx = parseFloat(mottoBox.style.left) || (px + pw + 20);
        const my = parseFloat(mottoBox.style.top) || (py + 2);
        bgMarkup += `
          <g>
            <rect x="${mx}" y="${my}" width="250" height="58" rx="4" fill="#FCFBF9" stroke="#C8C5BC" stroke-width="1.5" />
            <text x="${mx + 12}" y="${my + 35}" font-family="'Noto Serif JP', serif" font-size="14" font-weight="700" fill="#1C2024">${escapeXml(mottoBox.textContent)}</text>
          </g>
        `;
      }
    }

    // 各人物ノードをSVG要素へシリアライズ
    stageEl.querySelectorAll('.person-node').forEach(node => {
      const nx = parseFloat(node.style.left) || 0;
      const ny = parseFloat(node.style.top) || 0;
      const nw = parseFloat(node.style.width) || 54;
      const nh = parseFloat(node.style.height) || 120;
      const id = node.dataset.personId;
      const p = (project.people && project.people[id]) || {};

      let fill = '#FFFFFF';
      let stroke = '#1C2024';
      let strokeWidth = 2;
      let textColor = '#1C2024';
      let rx = 0;

      if (node.classList.contains('style-a')) {
        rx = 10;
        textColor = '#FFFFFF';
        if (node.classList.contains('direct-line')) {
          fill = '#b3000d';
          stroke = '#B22D25';
          strokeWidth = 3;
        } else {
          fill = '#594E4A';
          stroke = '#594E4A';
        }

        const roleText = p.roleLabel || '';
        const fullName = `${p.familyName || ''}${p.givenName || ''}`.trim();
        let innerTextSvg = '';
        if (fullName) {
          innerTextSvg += renderVerticalColumn(roleText, nx + nw * 0.68, ny + 4, nh - 8, 12, textColor);
          innerTextSvg += renderVerticalColumn(fullName, nx + nw * 0.30, ny + 4, nh - 8, 12, '#FFE07D');
        } else {
          innerTextSvg += renderVerticalColumn(roleText, nx + nw / 2, ny + 4, nh - 8, 14, textColor);
        }

        const capEl = node.querySelector('.node-meta-caption');
        const capSvg = capEl
          ? `<rect x="${nx - 14}" y="${ny + nh + 4}" width="${nw + 28}" height="16" rx="3" fill="#FCFBF9" stroke="#C8C5BC" stroke-width="1" />
             <text x="${nx + nw / 2}" y="${ny + nh + 15}" text-anchor="middle" font-family="'Noto Sans JP', sans-serif" font-size="9.5" fill="#1C2024">${escapeXml(capEl.textContent)}</text>`
          : '';

        nodesSvgMarkup += `
          <g>
            <rect x="${nx}" y="${ny}" width="${nw}" height="${nh}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />
            ${innerTextSvg}
            ${capSvg}
          </g>
        `;
      } else if (node.classList.contains('style-b')) {
        if (node.classList.contains('is-self')) {
          fill = '#FFFF00';
        } else if (node.classList.contains('in-direct-band')) {
          fill = '#EBF2F8';
        }
        if (node.classList.contains('direct-line')) {
          stroke = '#B22D25';
          strokeWidth = 2.5;
        }

        const degText = p.degreeLabel || node.querySelector('.degree-badge')?.textContent || '';
        const rubyText = p.roleRuby || node.querySelector('.style-b-ruby-col')?.textContent || '';
        const roleText = p.roleLabel || node.querySelector('.style-b-main-col')?.textContent || '';
        const fullName = `${p.familyName || ''}${p.givenName || ''}`.trim();
        const inhEl = node.querySelector('.inherit-status-badge');

        const degSvg = degText
          ? `<rect x="${nx + 2}" y="${ny - 15}" width="${Math.max(32, degText.length * 9 + 8)}" height="14" rx="3" fill="#FFFFFF" stroke="#1C2024" stroke-width="1" />
             <text x="${nx + 4 + Math.max(28, degText.length * 9) / 2}" y="${ny - 5}" text-anchor="middle" font-family="'Noto Sans JP', sans-serif" font-size="8.5" font-weight="700" fill="#1C2024">${escapeXml(degText)}</text>`
          : '';

        const inhSvg = inhEl
          ? `<rect x="${nx + nw - 40}" y="${ny - 15}" width="40" height="14" rx="3" fill="#4653A2" />
             <text x="${nx + nw - 20}" y="${ny - 5}" text-anchor="middle" font-family="'Noto Sans JP', sans-serif" font-size="8" font-weight="700" fill="#FFFFFF">${escapeXml(inhEl.textContent)}</text>`
          : '';

        let colsSvg = '';
        colsSvg += renderVerticalColumn(rubyText, nx + nw * 0.78, ny + 4, nh - 8, 8.5, '#525860', "'Noto Sans JP', sans-serif", '500');
        colsSvg += renderVerticalColumn(roleText, nx + nw * 0.48, ny + 4, nh - 8, 12.5, '#1C2024');
        if (fullName) {
          colsSvg += renderVerticalColumn(fullName, nx + nw * 0.18, ny + 4, nh - 8, 10, '#4653A2');
        }

        const capEl = node.querySelector('.node-meta-caption');
        const capSvg = capEl
          ? `<text x="${nx + nw / 2}" y="${ny + nh + 12}" text-anchor="middle" font-family="'Noto Sans JP', sans-serif" font-size="8.5" fill="#525860">${escapeXml(capEl.textContent)}</text>`
          : '';

        nodesSvgMarkup += `
          <g>
            <rect x="${nx}" y="${ny}" width="${nw}" height="${nh}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />
            ${degSvg}
            ${inhSvg}
            ${colsSvg}
            ${capSvg}
          </g>
        `;
      } else {
        // 様式C
        fill = node.classList.contains('female') ? '#F9C2E6' : '#B8D4E8';
        if (node.classList.contains('direct-line')) {
          stroke = '#B22D25';
          strokeWidth = 3;
        }
        const labelMain = p.maidenName
          ? `（${p.maidenName}）${p.givenName || ''}`
          : `${p.familyName || ''}　${p.givenName || ''}`.trim();
        const charsSvg = renderVerticalColumn(labelMain, nx + nw / 2, ny + 6, nh - 12, 13, '#1C2024');
        const directBadge = node.classList.contains('direct-line')
          ? `<rect x="${nx + nw / 2 - 14}" y="${ny - 10}" width="28" height="14" rx="3" fill="#B3000D" stroke="#FFFFFF" stroke-width="1" />
             <text x="${nx + nw / 2}" y="${ny}" text-anchor="middle" font-family="'Noto Sans JP', sans-serif" font-size="8.5" font-weight="700" fill="#FFFFFF">直系</text>`
          : '';
        const capEl = node.querySelector('.node-meta-caption');
        const capSvg = capEl
          ? `<text x="${nx + nw / 2}" y="${ny + nh + 13}" text-anchor="middle" font-family="'Noto Sans JP', sans-serif" font-size="9" fill="#525860">${escapeXml(capEl.textContent)}</text>`
          : '';

        nodesSvgMarkup += `
          <g>
            <rect x="${nx}" y="${ny}" width="${nw}" height="${nh}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />
            ${charsSvg}
            ${directBadge}
            ${capSvg}
          </g>
        `;
      }
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="100%" height="100%" fill="#F7F6F2" />
  ${bgMarkup}
  ${linesMarkup}
  ${nodesSvgMarkup}
</svg>`;
  }

  /**
   * ベクターSVGファイルとしてダウンロード保存
   */
  function downloadSvg(stageEl, project) {
    const svgString = buildStandaloneSvgString(stageEl, project);
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sanitizeFilename(project.title)}_様式${project.styleMode}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * 高解像度PNG画像としてダウンロード保存
   */
  function downloadPng(stageEl, project) {
    const svgString = buildStandaloneSvgString(stageEl, project);
    const w = parseInt(stageEl.style.width, 10) || 1480;
    const h = parseInt(stageEl.style.height, 10) || 980;
    const scale = 2; // 高解像度2倍出力

    const img = new Image();
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = function () {
      const canvas = document.createElement('canvas');
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      canvas.toBlob((pngBlob) => {
        if (!pngBlob) return;
        const pngUrl = URL.createObjectURL(pngBlob);
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = `${sanitizeFilename(project.title)}_様式${project.styleMode}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(pngUrl);
      }, 'image/png');
    };
    img.src = url;
  }

  /**
   * 公用・行政提出対応PDF出力（A4 / A3 用紙サイズ指定、カラー / モノクロ対応）
   */
  function exportOfficialPdf(stageEl, project, options = { paperSize: 'A4', colorMode: 'color' }) {
    const paperSize = options.paperSize || 'A4';
    const isMonochrome = options.colorMode === 'mono';

    let printStyleEl = document.getElementById('dynamic-print-page-style');
    if (!printStyleEl) {
      printStyleEl = document.createElement('style');
      printStyleEl.id = 'dynamic-print-page-style';
      document.head.appendChild(printStyleEl);
    }

    const orientation = project.styleMode === 'B' ? 'portrait' : 'landscape';
    printStyleEl.textContent = `
      @page {
        size: ${paperSize} ${orientation};
        margin: 10mm;
      }
    `;

    if (isMonochrome) {
      document.body.classList.add('print-monochrome');
    } else {
      document.body.classList.remove('print-monochrome');
    }

    // 印刷時に全体が収まるよう一時的にトランスフォーム調整
    const prevTransform = stageEl.style.transform;
    const targetScale = paperSize === 'A3' ? 0.88 : 0.62;
    stageEl.style.transform = `translate(10px, 10px) scale(${targetScale})`;

    setTimeout(() => {
      window.print();
      stageEl.style.transform = prevTransform;
      document.body.classList.remove('print-monochrome');
    }, 150);
  }

  /**
   * ローカル保存用JSONファイルの書き出し（エクスポート）
   */
  function exportJson(project) {
    const jsonStr = JSON.stringify(project, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sanitizeFilename(project.title)}_backup.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * 人物一覧CSV書き出し（BOM付きUTF-8）
   */
  function exportCsv(project) {
    const header = ['ID', '世代', '続柄', '親等', '姓', '名', 'ふりがな', '旧姓', '性別', '生年月日', '没年月日', '出身地', '旧国名', '本籍地/最後の住所', '相続区分', '戒名/法名', '墓所/菩提寺', '備考'];
    const escCsv = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const rows = Object.values(project.people || {}).map(p => [
      p.id,
      p.generation,
      p.roleLabel,
      p.degreeLabel,
      p.familyName,
      p.givenName,
      `${p.familyKana || ''} ${p.givenKana || ''}`.trim(),
      p.maidenName,
      p.gender === 'F' ? '女性' : '男性',
      p.birthDate,
      p.deathDate,
      p.birthPlace,
      p.originKuni,
      p.honsekiAddress,
      p.inheritanceStatus,
      p.buddhistName,
      p.tombLocation,
      p.notes
    ].map(escCsv).join(','));

    const csvContent = '\uFEFF' + [header.map(escCsv).join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sanitizeFilename(project.title)}_人物一覧.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return {
    buildStandaloneSvgString,
    downloadSvg,
    downloadPng,
    exportOfficialPdf,
    exportJson,
    exportCsv
  };
})();
