/**
 * PCパーツ解説＆学習サイト メインスクリプト
 */

document.addEventListener('DOMContentLoaded', () => {
  initScrollProgress();
  initTableOfContents();
  initMobileMenu();
  initBottleneckSimulator();
  initRequirementChecker();
  initNetworkDiagnoser();
  initChecklist();
  initGlossarySearch();

  // Lucideアイコンの初期化（CDN経由で読み込まれている場合）
  if (window.lucide) {
    window.lucide.createIcons();
  }
});

/**
 * 1. スクロールプログレスバーの制御
 */
function initScrollProgress() {
  const progressBar = document.getElementById('scroll-progress');
  if (!progressBar) return;

  window.addEventListener('scroll', () => {
    const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = (window.scrollY / totalHeight) * 100;
    progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
  }, { passive: true });
}

/**
 * 2. サイドバー目次のアクティブ監視
 */
function initTableOfContents() {
  const tocLinks = document.querySelectorAll('.toc-link');
  const sections = document.querySelectorAll('section[id]');
  if (!tocLinks.length || !sections.length) return;

  const observerOptions = {
    root: null,
    rootMargin: '-20% 0px -70% 0px',
    threshold: 0
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute('id');
        tocLinks.forEach(link => {
          if (link.getAttribute('href') === `#${id}`) {
            link.classList.add('active');
          } else {
            link.classList.remove('active');
          }
        });
      }
    });
  }, observerOptions);

  sections.forEach(section => observer.observe(section));
}

/**
 * 3. モバイル目次ドロワーのトグル
 */
function initMobileMenu() {
  const toggleBtn = document.getElementById('mobile-toc-toggle');
  const menu = document.getElementById('mobile-toc-drawer');
  const closeBtn = document.getElementById('mobile-toc-close');
  const overlay = document.getElementById('mobile-toc-overlay');

  if (!toggleBtn || !menu) return;

  const openDrawer = () => {
    menu.classList.remove('translate-x-full');
    overlay.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  };

  const closeDrawer = () => {
    menu.classList.add('translate-x-full');
    overlay.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  };

  toggleBtn.addEventListener('click', openDrawer);
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  if (overlay) overlay.addEventListener('click', closeDrawer);

  // リンクをクリックしたら閉じる
  document.querySelectorAll('#mobile-toc-drawer a').forEach(link => {
    link.addEventListener('click', closeDrawer);
  });
}

/**
 * 4. ボトルネックシミュレーター
 */
function initBottleneckSimulator() {
  const cpuSelect = document.getElementById('sim-cpu');
  const gpuSelect = document.getElementById('sim-gpu');
  const resolutionSelect = document.getElementById('sim-resolution');
  const resultCard = document.getElementById('sim-result');

  if (!cpuSelect || !gpuSelect || !resolutionSelect || !resultCard) return;

  const updateSimulation = () => {
    const cpuTier = parseInt(cpuSelect.value, 10); // 1: 低, 2: 中, 3: 高
    const gpuTier = parseInt(gpuSelect.value, 10); // 1: 低, 2: 中, 3: 高
    const res = resolutionSelect.value; // 'fhd', 'wqhd', '4k'

    let cpuLoad = 0;
    let gpuLoad = 0;
    let statusTitle = '';
    let statusClass = '';
    let explanation = '';
    let advice = '';

    // 解像度によるGPU負荷重み付け
    const resMultiplier = res === '4k' ? 1.4 : (res === 'wqhd' ? 1.2 : 1.0);

    // シミュレーションロジック
    if (cpuTier < gpuTier) {
      // CPUボトルネック
      cpuLoad = 100;
      gpuLoad = Math.round(Math.min(95, (cpuTier / gpuTier) * 65 * resMultiplier));
      statusTitle = '⚠️ CPUボトルネックが発生中！';
      statusClass = 'border-amber-500 bg-amber-50 text-amber-900';
      explanation = '高性能なグラフィックボードに対してCPUの演算速度が追いついていません。グラボが「次の描画指示待ち」となり、GPU本来の性能を持て余しています。激しい戦闘や高フレームレート時に激しいカクつき（スタッター）が発生しやすくなります。';
      advice = '【改善案】グラボを下げる必要はありませんが、CPUを1〜2世代新しい上位モデルに換装することでfpsが大幅に向上します。';
    } else if (cpuTier > gpuTier) {
      // GPU律速（ゲーミングPCとして最も理想的・正常）
      gpuLoad = 99;
      cpuLoad = Math.round(Math.max(35, (gpuTier / cpuTier) * 60));
      statusTitle = '✅ GPU律速（ゲーミングPCとして最も理想的な状態）';
      statusClass = 'border-emerald-500 bg-emerald-50 text-emerald-900';
      explanation = 'グラフィックボードが能力の限界（95〜99%）までしっかり働き、CPUにはゲーム以外の処理（Discord通話や録画など）を行う余裕が残っています。非常に健全で安定した組み合わせです。';
      advice = '【アドバイス】もし画質やfpsをもっと上げたい場合は、純粋にグラフィックボードを上位モデルに買い替えるだけで性能が素直に伸びます。';
    } else {
      // バランス良好
      if (res === '4k') {
        gpuLoad = 99;
        cpuLoad = Math.round(cpuTier === 3 ? 55 : (cpuTier === 2 ? 70 : 85));
      } else {
        gpuLoad = 96;
        cpuLoad = Math.round(cpuTier === 3 ? 65 : (cpuTier === 2 ? 75 : 90));
      }
      statusTitle = '🌟 高いバランスで調和しています';
      statusClass = 'border-blue-500 bg-blue-50 text-blue-900';
      explanation = 'CPUとGPUの能力ランクがぴったり揃っており、無駄な投資のない美しい組み合わせです。解像度やゲーム設定に応じた最大のパフォーマンスが得られます。';
      advice = '【アドバイス】電源ユニットのワット数（推奨容量×1.5倍程度）と、CPUクーラーの冷却能力が十分確保できているかを確認してください。';
    }

    resultCard.className = `p-5 rounded-xl border-2 transition-all ${statusClass}`;
    resultCard.innerHTML = `
      <div class="flex items-center gap-2 font-bold text-lg mb-2">
        <span>${statusTitle}</span>
      </div>
      <div class="space-y-3 mb-4">
        <div>
          <div class="flex justify-between text-xs font-semibold mb-1">
            <span>CPU使用率</span>
            <span class="font-mono">${cpuLoad}%</span>
          </div>
          <div class="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
            <div class="meter-fill h-2.5 rounded-full ${cpuLoad >= 95 ? 'bg-amber-600' : 'bg-slate-700'}" style="width: ${cpuLoad}%"></div>
          </div>
        </div>
        <div>
          <div class="flex justify-between text-xs font-semibold mb-1">
            <span>GPU（グラボ）使用率</span>
            <span class="font-mono">${gpuLoad}%</span>
          </div>
          <div class="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
            <div class="meter-fill h-2.5 rounded-full ${gpuLoad >= 90 ? 'bg-emerald-600' : 'bg-amber-500'}" style="width: ${gpuLoad}%"></div>
          </div>
        </div>
      </div>
      <p class="text-sm leading-relaxed mb-3">${explanation}</p>
      <div class="p-3 bg-white/80 rounded-lg text-xs leading-relaxed font-medium">
        ${advice}
      </div>
    `;
  };

  cpuSelect.addEventListener('change', updateSimulation);
  gpuSelect.addEventListener('change', updateSimulation);
  resolutionSelect.addEventListener('change', updateSimulation);
  updateSimulation();
}

/**
 * 5. 用途別おすすめパーツ診断ツール
 */
const requirementProfiles = {
  fps: {
    title: '競技系FPS（Apex, VALORANT, Overwatch等）',
    description: '瞬時のエイムと視線移動が命。画質よりも高フレームレート（144fps〜240fps+）と低遅延（Frame Timeの最小化）を最優先します。',
    budgetFocus: 'CPU：30% / GPU：40% / モニター：20% / その他：10%',
    priority: [
      { name: 'GPU（グラボ）', rank: '最優先 ★★★★★', desc: 'RTX 4060〜4070クラス。フルHDでの高fps維持。' },
      { name: 'CPU', rank: '最重要 ★★★★★', desc: '高fps下ではCPU負荷が爆増するため、シングルコア性能が高いCore i5/i7またはRyzen 7 7800X3Dが理想。' },
      { name: 'モニター', rank: '必須 ★★★★★', desc: '144Hz〜240Hz以上、応答速度1ms（Fast TNまたは高速IPS）、DisplayPort接続。' },
      { name: 'メモリ', rank: '重要 ★★★★☆', desc: '16GB〜32GB（デュアルチャネル必須）。' }
    ],
    recommendedSpecs: {
      cpu: 'Intel Core i5-14400F / AMD Ryzen 5 7500F 以上',
      gpu: 'GeForce RTX 4060 / 4060 Ti',
      ram: '16GB〜32GB (DDR4/DDR5)',
      storage: 'NVMe SSD 1TB',
      psu: '650W〜750W (Bronze/Gold)'
    }
  },
  aaa: {
    title: '重量級AAA・オープンワールド（サイバーパンク, モンスターハンター等）',
    description: '超美麗グラフィック、レイトレーシング、広大なワールドの探索を楽しむ構成。莫大なテクスチャと光線計算を処理する圧倒的GPUパワーが必要です。',
    budgetFocus: 'GPU：55% / CPU：20% / メモリ・SSD：15% / その他：10%',
    priority: [
      { name: 'GPU（グラボ）', rank: '命より大事 ★★★★★', desc: 'RTX 4070 SUPER〜4080クラス。VRAM 12GB〜16GB以上が必須。' },
      { name: 'ストレージ (SSD)', rank: '最重要 ★★★★☆', desc: 'Gen4 NVMe M.2 SSD（2TB推奨）。オープンワールドのロード時間を激減させる。' },
      { name: 'メモリ (RAM)', rank: '最重要 ★★★★☆', desc: '32GB推奨（16GBでは最新大作でメモリ枯渇のスタッター発生リスクあり）。' },
      { name: '電源ユニット', rank: '重要 ★★★★☆', desc: '750W〜850W Gold認証。高負荷時の電力急変動に耐える心臓。' }
    ],
    recommendedSpecs: {
      cpu: 'Intel Core i7-14700 / AMD Ryzen 7 7700X',
      gpu: 'GeForce RTX 4070 Ti SUPER / RTX 4080',
      ram: '32GB (DDR5)',
      storage: 'Gen4 NVMe SSD 2TB',
      psu: '750W〜850W (Gold)'
    }
  },
  streamer: {
    title: 'ゲーム実況配信 ＆ 動画編集（Premiere, DaVinci, OBS同時起動）',
    description: 'ゲームをプレイしながら配信ソフト（OBS）、ブラウザ、Discord、VTuberアバター等を同時起動する過酷なマルチタスク環境です。',
    budgetFocus: 'CPU：30% / GPU：30% / メモリ：20% / ストレージ：20%',
    priority: [
      { name: 'メモリ (RAM)', rank: '最重要 ★★★★★', desc: '最低32GB、できれば64GB。複数ソフトの同時展開で机の広さが絶対正義。' },
      { name: 'CPU', rank: '最重要 ★★★★★', desc: '多コア・多スレッド（Core i7/i9, Ryzen 9）。エンコードや背景切り抜きを軽快に処理。' },
      { name: 'GPU（グラボ）', rank: '重要 ★★★★☆', desc: 'NVENC（ハードウェアエンコーダー）搭載のGeForceグラボが配信負荷を肩代わり。' },
      { name: 'ストレージ', rank: '大容量必須 ★★★★☆', desc: 'システム用SSD 1TB ＋ 録画素材用大容量SSD 2〜4TB。' }
    ],
    recommendedSpecs: {
      cpu: 'Intel Core i7-14700K / AMD Ryzen 9 7900X',
      gpu: 'GeForce RTX 4070 以上',
      ram: '32GB〜64GB',
      storage: 'NVMe SSD 1TB (OS) + 2TB (素材用)',
      psu: '850W (Gold)'
    }
  },
  office: {
    title: '一般事務・レポート作成・日常ユース（ブラウジング、Office、動画鑑賞）',
    description: 'ゲームや重い動画編集を行わない日常使い。グラボは不要（CPU内蔵で十分）で、SSDと適正メモリによるレスポンス快適化が最もコスパに直結します。',
    budgetFocus: 'SSD＋メモリ：40% / CPU：40% / その他：20%（グラボ予算0円）',
    priority: [
      { name: 'ストレージ (SSD)', rank: '最重要 ★★★★★', desc: 'NVMe SSD必須。電源ONから数秒で起動し、すべての動作がサクサクになります。' },
      { name: 'メモリ (RAM)', rank: '重要 ★★★★☆', desc: '16GB推奨（タブを大量に開いても固まらない安心容量）。' },
      { name: 'CPU', rank: '適正 ★★★☆☆', desc: 'Intel Core i3/i5、Ryzen 3/5の内蔵グラフィック付きで十分。' },
      { name: 'GPU（グラボ）', rank: '不要 ★☆☆☆☆', desc: '独立グラボは不要。数万円の節約になり電気代も大幅削減。' }
    ],
    recommendedSpecs: {
      cpu: 'Intel Core i3-13100 / AMD Ryzen 5 5600G (内蔵グラフィックス)',
      gpu: '不要（CPU内蔵グラフィックスを使用）',
      ram: '16GB (DDR4)',
      storage: 'NVMe SSD 500GB〜1TB',
      psu: '400W〜500W'
    }
  }
};

function initRequirementChecker() {
  const profileContainer = document.getElementById('requirement-profile-output');
  const buttons = document.querySelectorAll('.req-btn');

  if (!profileContainer || !buttons.length) return;

  const renderProfile = (key) => {
    const data = requirementProfiles[key] || requirementProfiles.fps;
    profileContainer.innerHTML = `
      <div class="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-sm animate-fadeIn">
        <div class="border-b border-slate-100 pb-4 mb-6">
          <span class="inline-block px-3 py-1 bg-orange-100 text-orange-700 font-semibold text-xs rounded-full mb-2">おすすめ診断結果</span>
          <h4 class="text-xl sm:text-2xl font-bold text-slate-900">${data.title}</h4>
          <p class="text-slate-600 text-sm mt-2">${data.description}</p>
        </div>

        <div class="mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">おすすめ予算配分の目安</div>
          <div class="text-sm font-semibold text-slate-800">${data.budgetFocus}</div>
        </div>

        <h5 class="font-bold text-slate-800 text-sm mb-3">🔥 どこにお金をかけるべきか？（パーツ別優先度）</h5>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          ${data.priority.map(p => `
            <div class="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
              <div class="flex justify-between items-center mb-1">
                <span class="font-bold text-sm text-slate-900">${p.name}</span>
                <span class="text-xs font-semibold text-orange-600 bg-orange-50 px-2 py-0.5 rounded">${p.rank}</span>
              </div>
              <p class="text-xs text-slate-600 leading-relaxed">${p.desc}</p>
            </div>
          `).join('')}
        </div>

        <h5 class="font-bold text-slate-800 text-sm mb-3">📋 推奨スペック構成目安</h5>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs border border-slate-200 rounded-lg overflow-hidden">
            <tbody class="divide-y divide-slate-100">
              <tr class="bg-slate-50"><th class="py-2.5 px-4 font-semibold text-slate-700 w-32">CPU</th><td class="py-2.5 px-4 font-mono text-slate-800">${data.recommendedSpecs.cpu}</td></tr>
              <tr><th class="py-2.5 px-4 font-semibold text-slate-700">GPU (グラボ)</th><td class="py-2.5 px-4 font-mono text-slate-800">${data.recommendedSpecs.gpu}</td></tr>
              <tr class="bg-slate-50"><th class="py-2.5 px-4 font-semibold text-slate-700">メモリ (RAM)</th><td class="py-2.5 px-4 font-mono text-slate-800">${data.recommendedSpecs.ram}</td></tr>
              <tr><th class="py-2.5 px-4 font-semibold text-slate-700">ストレージ</th><td class="py-2.5 px-4 font-mono text-slate-800">${data.recommendedSpecs.storage}</td></tr>
              <tr class="bg-slate-50"><th class="py-2.5 px-4 font-semibold text-slate-700">電源ユニット</th><td class="py-2.5 px-4 font-mono text-slate-800">${data.recommendedSpecs.psu}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
  };

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => {
        b.classList.remove('bg-slate-900', 'text-white', 'shadow-md');
        b.classList.add('bg-white', 'text-slate-700', 'border-slate-200');
      });
      btn.classList.add('bg-slate-900', 'text-white', 'shadow-md');
      btn.classList.remove('bg-white', 'text-slate-700');
      const key = btn.dataset.target;
      renderProfile(key);
    });
  });

  // 初期表示
  renderProfile('fps');
}

/**
 * 6. 回線状況判定シミュレーター
 */
function initNetworkDiagnoser() {
  const pingInput = document.getElementById('net-ping');
  const speedInput = document.getElementById('net-speed');
  const btn = document.getElementById('net-diagnose-btn');
  const resultCard = document.getElementById('net-result');

  if (!pingInput || !speedInput || !btn || !resultCard) return;

  const runDiagnosis = () => {
    const ping = parseFloat(pingInput.value) || 0;
    const speed = parseFloat(speedInput.value) || 0;

    let title = '';
    let statusClass = '';
    let explanation = '';
    let advice = '';

    if (ping <= 15 && speed >= 100) {
      title = '🌟 即実戦OK！プロ・競技FPS最高水準（極めて優秀）';
      statusClass = 'border-emerald-500 bg-emerald-50 text-emerald-950';
      explanation = `Ping値が ${ping}ms と極めて低く、ダウンロード速度も ${speed}Mbps 出ています。Apex LegendsやVALORANTなどのシビアな競技FPSでも「弾抜け」「同期ズレ」「遅延」の心配は皆無です。`;
      advice = '【実戦アドバイス】文句なしの最強環境です！デバイスやPCの性能を100%発揮してランクマッチに挑めます。';
    } else if (ping <= 30 && speed >= 50) {
      title = '✅ 合格ライン！一般的なオンラインゲーム快適（実戦OK）';
      statusClass = 'border-blue-500 bg-blue-50 text-blue-950';
      explanation = `Ping値 ${ping}ms、速度 ${speed}Mbps。一般的なオンライン対戦、MMORPG（FF14等）、格闘ゲーム、モンスターハンター等を快適にプレイできる良好な状態です。`;
      advice = '【アドバイス】ほとんどのゲームで一切の不満なくプレイ可能です。競技FPSで極限の1位を目指す場合は、ルーター設定（IPv6 IPoE接続）を見直すとさらにPingが下がる可能性があります。';
    } else if (ping <= 50) {
      title = '⚠️ 要注意！カジュアルプレイ向け（競技FPSでは撃ち負け・弾抜けの恐れ）';
      statusClass = 'border-amber-500 bg-amber-50 text-amber-950';
      explanation = `Ping値が ${ping}ms とやや高めです。協力ゲームやRPGなら問題ありませんが、ミリ秒単位で戦うFPSでは「先に撃ったのに負けた」「敵が少し引っかかる」と感じる場面が出てきます。`;
      advice = '【改善案】Wi-Fi接続なら直ちに有線LANケーブル（CAT6）に切り替えてください。また、家族が動画配信（NetflixやYouTube）を同時に見ていないか確認しましょう。';
    } else {
      title = '🚨 危険水準！VDSL方式やWi-Fiの可能性大（回線見直し必須）';
      statusClass = 'border-rose-500 bg-rose-50 text-rose-950';
      explanation = `Ping値が ${ping}ms、速度 ${speed}Mbps と非常に厳しく、ゲーム内で「ワープ」「弾すり抜け」「頻繁な切断」が発生する危険な状態です。`;
      advice = '【至急改善が必要】マンションの電話線配線（VDSL方式）や、アパート備え付けの無料回線、古いCAT5ケーブルが原因である可能性大です。有線化の徹底、または光配線方式への工事・個別回線の引き込みを強く推奨します。';
    }

    resultCard.className = `p-5 rounded-xl border-2 transition-all mt-4 ${statusClass}`;
    resultCard.innerHTML = `
      <div class="font-bold text-sm sm:text-base flex items-center gap-2 mb-2">
        <span>${title}</span>
      </div>
      <p class="text-xs sm:text-sm leading-relaxed mb-3">${explanation}</p>
      <div class="p-3 bg-white/90 rounded-lg text-xs font-medium leading-relaxed border border-slate-200/80">
        ${advice}
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
  };

  btn.addEventListener('click', runDiagnosis);
  pingInput.addEventListener('input', runDiagnosis);
  speedInput.addEventListener('input', runDiagnosis);

  // 初期判定表示
  runDiagnosis();
}

/**
 * 7. 購入前チェックリスト
 */
function initChecklist() {
  const checkboxes = document.querySelectorAll('.checklist-item input[type="checkbox"]');
  const countDisplay = document.getElementById('checklist-count');
  const totalCount = checkboxes.length;

  if (!checkboxes.length || !countDisplay) return;

  const updateCount = () => {
    let checkedCount = 0;
    checkboxes.forEach((cb, idx) => {
      if (cb.checked) checkedCount++;
      // ローカルストレージに保存
      try {
        localStorage.setItem(`pc_checklist_${idx}`, cb.checked ? 'true' : 'false');
      } catch (e) {}
    });
    countDisplay.textContent = `${checkedCount} / ${totalCount}`;
    if (checkedCount === totalCount) {
      countDisplay.classList.add('text-emerald-600', 'font-bold');
    } else {
      countDisplay.classList.remove('text-emerald-600');
    }
  };

  // 復元
  checkboxes.forEach((cb, idx) => {
    try {
      if (localStorage.getItem(`pc_checklist_${idx}`) === 'true') {
        cb.checked = true;
      }
    } catch (e) {}
    cb.addEventListener('change', updateCount);
  });

  updateCount();
}

/**
 * 7. 用語クイック検索機能
 */
const glossaryData = [
  { term: 'CPU', ruby: 'シーピーユー', desc: '中央処理装置。PC全体の指揮官・頭脳。演算、AI行動、当たり判定などを担当。' },
  { term: 'GPU / グラフィックボード', ruby: 'ジーピーユー / グラボ', desc: '画像処理装置。3Dモデルや光の反射（レイトレ）を毎秒何百回も描画する専属の画家。' },
  { term: 'RAM (メモリ)', ruby: 'ラム / メモリ', desc: '主記憶装置。作業机の広さ。開いているアプリやゲームの一時データを保持する。' },
  { term: 'SSD (NVMe M.2)', ruby: 'エスエスディー', desc: '補助記憶装置。超高速な本棚・書庫。OSの起動やゲームのロード時間を劇的に短縮する。' },
  { term: 'マザーボード', ruby: 'マザーボード', desc: '主要基盤。オフィスの床・神経網。すべてのパーツを物理・電子的に接続する。' },
  { term: '電源ユニット (PSU)', ruby: 'デンゲンユニット', desc: '心臓・血液ポンプ。コンセントの交流を直流に変換し各パーツへ安定供給する。' },
  { term: 'ボトルネック', ruby: 'ボトルネック', desc: 'どこか1つのパーツが低性能なせいで、他の高性能パーツが能力を発揮できず全体の足を引っ張る現象。' },
  { term: 'fps (フレームレート)', ruby: 'エフピーエス', desc: '1秒間に画面が何コマ書き換わるかの数値。60fpsより144fps・240fpsの方が滑らかで敵の動きを素早く捉えられる。' },
  { term: 'Frame Time', ruby: 'フレームタイム', desc: '1フレーム（コマ）を描画するために許された時間。60fpsは約16.6ms、144fpsは約6.94msしかない。' },
  { term: 'レイトレーシング', ruby: 'レイトレーシング', desc: '光の反射や影を1本ずつ物理計算して超リアルな映像を作る技術。膨大な計算パワーを消費する。' },
  { term: 'VRAM', ruby: 'ブイラム', desc: 'グラフィックボード専用の高速メモリ。4Kテクスチャやレイトレ処理時に大量に消費される。' },
  { term: 'スタッター', ruby: 'スタッター', desc: 'ゲーム中に画面が一瞬ピクッと止まる現象。メモリ不足やCPUの指示遅れ（ボトルネック）で発生する。' },
  { term: 'DisplayPort (DP)', ruby: 'ディスプレイポート', desc: 'ゲーミングPCに最適な映像端子規格。高リフレッシュレートと可変同期（G-SYNC等）を完全サポート。' },
  { term: 'HDMI 2.1', ruby: 'エイチディーエムアイ', desc: '最新のHDMI規格。4K 120Hz〜144Hz伝送に対応。従来のHDMI 2.0では高画質高fpsが出ない場合がある。' },
  { term: 'リフレッシュレート (Hz)', ruby: 'ヘルツ', desc: 'モニターが1秒間に画面を書き換えられる回数。144Hzなら毎秒144回表示可能。' },
  { term: '応答速度 (GtG)', ruby: 'オウトウソクド', desc: '液晶素子が色を切り替える速度。1ms以下がゲーミングの理想で、遅いと残像（ブレ）が出る。' },
  { term: 'サーマルスロットリング', ruby: 'サーマルスロットリング', desc: 'パーツが高熱になりすぎて故障を防ぐために、自動で性能を強制的に落とす安全機能。冷却が超重要。' },
  { term: 'TGP (Total Graphics Power)', ruby: 'ティージーピー', desc: 'GPUに供給される最大消費電力。ノートPC版グラボは発熱を抑えるためTGPが極限まで削られており、同じ名称でもデスクトップ版より著しく性能が落ちる原因。' },
  { term: 'ラップトップGPU (ノート版グラボ)', ruby: 'ラップトップジーピーユー', desc: 'ノートPC専用の小型・低電力GPU。名称がデスクトップ版と同じでも内部構造や動作周波数が別物で、実性能は2〜3ランク下のデスクトップグラボと同等になる。' },
  { term: 'ゲーミングノートの落とし穴', ruby: 'ゲーミングノートノオトシアナ', desc: '持ち運べそうに見えてACアダプタが激重、パーツ交換や修理が一切不可、排熱地獄で爆音＆寿命が短いという致命的弱点の総称。ゲーム目的なら「格安モニター＋デスクトップ」が絶対的におすすめ。' },
  { term: 'Ping (レイテンシ)', ruby: 'ピン / レイテンシ', desc: '自分のPCからゲームサーバーにデータを送り、返事が来るまでの往復応答時間（ミリ秒 ms）。数値が小さいほどラグがなく、15ms以下なら最高。' },
  { term: 'パケットロス (パケロス)', ruby: 'パケットロス', desc: '送信したデータの一部がネットの途中で消滅・脱落する現象。「弾が当たらない」「敵がワープする」最大の原因。Wi-Fiだと多発する。' },
  { term: 'ジッター (Jitter)', ruby: 'ジッター', desc: 'Ping値の「揺らぎ・ブレ」。平均Pingが良くてもジッターが大きいと、突然カクッと止まったり同期ズレが起きてゲームにならない。' },
  { term: 'VDSL方式', ruby: 'ブイディーエスエル', desc: 'マンション共用部から各部屋までを昔の「電話線」で繋ぐ配線方式。最大100Mbps上限でノイズに弱く、現代のオンラインゲームには耐えられない。' },
  { term: 'CAT6 / CAT6A (LANケーブル)', ruby: 'キャットシックス', desc: '最大1Gbps〜10Gbpsに対応した家庭用有線LANケーブルの標準規格。安価でノイズ耐性に優れ、ゲーム用に最も適している。' },
  { term: '光コラボ (光コラボレーション)', ruby: 'ヒカリコラボ', desc: 'NTTの光ファイバー回線を借りて通信事業者（ドコモ光、SoftBank光等）がプロバイダと一体提供する回線。全国対応でスマホ割も効く王道。' },
  { term: '電力会社系光回線 (コミュファ光等)', ruby: 'デンリョクガイシャケイヒカリカイセン', desc: '電力会社が独自に保有する光ファイバー網を利用した光回線。NTT網と混雑せず夜間も超高速・低Pingで料金も割安。作者おすすめ！' },
  { term: 'ダークファイバー (独自回線)', ruby: 'ダークファイバー', desc: 'NTTの予備回線などを自社設備で運用するauひかりやNURO光。爆速だが提供エリアが狭い。' },
  { term: '置くだけWi-Fi (ホームルーター) の罠', ruby: 'オクダケワイファイノワナ', desc: '「工事不要で光と同じ」と営業される据え置き型モバイルルーター。モバイル電波（4G/5G）を受信するため、対戦ゲームではPingの乱高下とパケットロスが発生しやすく、ゲーム用途には非推奨。' }
];

function initGlossarySearch() {
  const input = document.getElementById('glossary-search-input');
  const resultsContainer = document.getElementById('glossary-results');

  if (!input || !resultsContainer) return;

  const renderGlossary = (query = '') => {
    const q = query.trim().toLowerCase();
    const filtered = glossaryData.filter(item => {
      if (!q) return true;
      return item.term.toLowerCase().includes(q) || item.ruby.includes(q) || item.desc.includes(q);
    });

    if (filtered.length === 0) {
      resultsContainer.innerHTML = '<div class="col-span-full py-8 text-center text-slate-400 text-sm">該当する用語が見つかりませんでした</div>';
      return;
    }

    resultsContainer.innerHTML = filtered.map(item => `
      <div class="p-4 bg-white rounded-xl border border-slate-200/90 shadow-xs hover:border-orange-300 transition-colors">
        <div class="flex items-baseline gap-2 mb-1">
          <span class="font-bold text-sm text-slate-900">${item.term}</span>
          <span class="text-[11px] text-slate-400 font-mono">${item.ruby}</span>
        </div>
        <p class="text-xs text-slate-600 leading-relaxed">${item.desc}</p>
      </div>
    `).join('');
  };

  input.addEventListener('input', (e) => {
    renderGlossary(e.target.value);
  });

  // 初期一覧表示
  renderGlossary();
}
