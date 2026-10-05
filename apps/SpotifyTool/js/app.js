/**
 * Main Application Orchestrator
 * SpotifyTool: イベント制御、ポーリングループ、初期化フロー、状態管理
 */

import { 
  AuthState, 
  initAuth, 
  loginWithSpotify, 
  logout, 
  fetchServerConfig, 
  saveClientId, 
  getSavedClientId, 
  getDefaultRedirectUri 
} from './auth.js';
import * as API from './api.js';
import * as UI from './ui.js';

// 設定定数
const CONFIG = {
  POLLING_INTERVAL_MS: 6000,   // Active Playerポーリング周期 (6秒)
  HISTORY_FETCH_DELAY_MS: 800, // 曲変更検知後のSpotify側反映待ち時間 (ms)
  RECENT_ITEMS_LIMIT: 50,      // 再生履歴取得件数
  TOP_ITEMS_LIMIT: 20          // トップ項目取得件数
};

// アプリケーション全体の状態管理 (AppState)
const AppState = {
  currentTopType: 'tracks',       // 'tracks' | 'artists'
  currentTopRange: 'medium_term', // 'short_term' | 'medium_term' | 'long_term'
  cachedTopTracks: {},
  cachedTopArtists: {},
  cachedRecentlyPlayed: null,
  playerPollingTimer: null,
  lastTrackId: null,
  lastProgressMs: 0,
  isUpdatingHistoryOnly: false
};

// 起動時エントリーポイント
window.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await checkConfigAndInit();
});

/**
 * サーバー設定取得と認証初期化フロー
 */
async function checkConfigAndInit() {
  const config = await fetchServerConfig();
  updateConfigModalStatus(config);

  const auth = await initAuth();

  if (auth.error) {
    UI.showNotification(`認証エラー: ${auth.error}`, 'error');
  }

  if (auth.authenticated && !auth.isDemo) {
    // 1. Spotify本番アカウント認証済み
    updateAuthUI('live');
    await loadDashboardData();
    startPlaybackPolling();
    UI.showNotification('Spotifyアカウントと接続しました！', 'success');
  } else if (auth.isDemo) {
    // 2. ユーザーがデモモードを選択中
    updateAuthUI('demo');
    await loadDashboardData();
    startPlaybackPolling();
    UI.showNotification('デモモードで表示しています。いつでも「Spotifyでログイン」が可能です。', 'info');
  } else {
    // 3. 未認証（初回アクセスまたはログアウト後）
    updateAuthUI('unauth');
    renderUnauthenticatedPlaceholders();
  }
}

/**
 * 未認証時のプレースホルダー描画
 */
function renderUnauthenticatedPlaceholders() {
  UI.renderHeader(null, false);
  UI.renderActivePlayer(null);
  UI.renderRecentlyPlayed({ items: [] });
  UI.renderTopItems({ items: [] }, { items: [] }, AppState.currentTopType, AppState.currentTopRange);
  UI.renderLibrary({ tracks: { total: 0, items: [] }, albums: { total: 0, items: [] } });
  UI.renderPlaylists({ total: 0, items: [] });
}

/**
 * ダッシュボード全データ一括フェッチ＆描画
 */
async function loadDashboardData() {
  showGlobalLoader(true);
  try {
    const data = await API.fetchAllDashboardData(AppState.currentTopRange);

    // キャッシュ保存
    AppState.cachedTopTracks[AppState.currentTopRange] = data.topTracks;
    AppState.cachedTopArtists[AppState.currentTopRange] = data.topArtists;
    AppState.cachedRecentlyPlayed = data.recentlyPlayed;

    // 各セクションのレンダリング
    UI.renderHeader(data.profile, AuthState.isDemo());
    UI.renderActivePlayer(data.playback);
    UI.renderRecentlyPlayed(data.recentlyPlayed);
    UI.renderTopItems(
      data.topTracks, 
      data.topArtists, 
      AppState.currentTopType, 
      AppState.currentTopRange, 
      AppState.cachedRecentlyPlayed
    );
    UI.renderLibrary(data.library);
    UI.renderPlaylists(data.playlists);

    // 初回再生トラックIDの初期化
    AppState.lastTrackId = data.playback?.item?.id || null;
    AppState.lastProgressMs = data.playback?.progress_ms || 0;

    updateSyncTimestamp();
  } catch (err) {
    console.error('Failed to load dashboard data:', err);
    UI.showNotification(`データ取得エラー: ${err.message}`, 'error');
  } finally {
    showGlobalLoader(false);
  }
}

/**
 * Active Player（再生状況）の差分監視 & 曲変更・再生終了の検知
 */
async function pollActivePlayback() {
  try {
    const playback = await API.getPlaybackState();
    UI.renderActivePlayer(playback);

    const currentTrackId = playback?.item?.id || null;
    const isPlaying = Boolean(playback?.is_playing);
    const currentProgress = playback?.progress_ms || 0;
    const durationMs = playback?.item?.duration_ms || 0;

    // 初回初期化
    if (AppState.lastTrackId === null && currentTrackId) {
      AppState.lastTrackId = currentTrackId;
      AppState.lastProgressMs = currentProgress;
      return;
    }

    // 【曲が変わったフラグの判定】
    // 1. 曲IDが別の曲に切り替わった (曲A -> 曲B)
    const isTrackSwitched = Boolean(currentTrackId && AppState.lastTrackId && currentTrackId !== AppState.lastTrackId);

    // 2. 1曲リピート再生で同じ曲の先頭に巻き戻った (終了間際 -> 冒頭)
    const isTrackLooped = Boolean(
      currentTrackId && AppState.lastTrackId &&
      currentTrackId === AppState.lastTrackId &&
      AppState.lastProgressMs > (durationMs * 0.75) &&
      currentProgress < (durationMs * 0.25)
    );

    // 3. 曲を最後まで再生して停止した (曲があった状態から停止、進捗が終了間際)
    const isTrackEndedAndStopped = Boolean(
      AppState.lastTrackId && (!isPlaying || !currentTrackId) &&
      AppState.lastProgressMs > (durationMs * 0.8)
    );

    const isTrackChangedFlag = isTrackSwitched || isTrackLooped || isTrackEndedAndStopped;

    if (isTrackChangedFlag) {
      console.log(`[Playback Detection] Track change/finish flag TRIGGERED! (prev: ${AppState.lastTrackId}, now: ${currentTrackId})`);
      // 曲が変わったフラグに基づき、「再生履歴」項目だけをピンポイント自動更新
      await updateRecentlyPlayedOnly();
    }

    // 次回比較用にステートを保持
    AppState.lastTrackId = currentTrackId;
    AppState.lastProgressMs = currentProgress;

  } catch (err) {
    console.warn('[Polling] Active player update failed:', err);
  }
}

/**
 * 曲変更フラグ成立時:「再生履歴」項目のみをピンポイント更新
 */
async function updateRecentlyPlayedOnly() {
  if (AppState.isUpdatingHistoryOnly) return;
  AppState.isUpdatingHistoryOnly = true;

  try {
    // Spotify側の再生履歴テーブル反映ラグを考慮して少し待機
    await new Promise(resolve => setTimeout(resolve, CONFIG.HISTORY_FETCH_DELAY_MS));

    const recentData = await API.getRecentlyPlayed(CONFIG.RECENT_ITEMS_LIMIT);
    if (recentData && Array.isArray(recentData.items)) {
      AppState.cachedRecentlyPlayed = recentData;
      // 再生履歴セクションのみを再描画
      UI.renderRecentlyPlayed(recentData);
      // 自動更新アニメーションハイライト
      UI.highlightHistoryUpdate();

      // Top Itemsの直近再生ブースト（キャッシュから再描画・APIリクエスト不要）も同期
      const tracks = AppState.cachedTopTracks[AppState.currentTopRange];
      const artists = AppState.cachedTopArtists[AppState.currentTopRange];
      if (tracks && artists) {
        UI.renderTopItems(tracks, artists, AppState.currentTopType, AppState.currentTopRange, AppState.cachedRecentlyPlayed);
      }

      console.log('[Playback] Recently Played updated successfully.');
    }
  } catch (err) {
    console.warn('[Playback] Failed to update recently played only:', err);
  } finally {
    AppState.isUpdatingHistoryOnly = false;
  }
}

/**
 * Active Player 定期ポーリング開始
 */
function startPlaybackPolling() {
  if (AppState.playerPollingTimer) clearInterval(AppState.playerPollingTimer);
  AppState.playerPollingTimer = setInterval(pollActivePlayback, CONFIG.POLLING_INTERVAL_MS);
}

/**
 * UI上の認証ステータス反映
 * @param {'live' | 'demo' | 'unauth'} mode
 */
function updateAuthUI(mode) {
  const loginBtn = document.getElementById('btn-login');
  const logoutBtn = document.getElementById('btn-logout');
  const demoToggle = document.getElementById('btn-toggle-demo');
  const liveIndicator = document.getElementById('live-status-indicator');
  const heroBanner = document.getElementById('unauth-hero-banner');

  if (mode === 'live') {
    loginBtn?.classList.add('hidden');
    logoutBtn?.classList.remove('hidden');
    if (logoutBtn) logoutBtn.textContent = 'ログアウト';
    demoToggle?.classList.remove('hidden');
    if (demoToggle) demoToggle.textContent = 'デモデータに切替';
    if (liveIndicator) {
      liveIndicator.className = 'status-badge-dot live';
      liveIndicator.title = 'Spotify API リアルタイム連携中';
    }
    heroBanner?.classList.add('hidden');
  } else if (mode === 'demo') {
    loginBtn?.classList.remove('hidden');
    logoutBtn?.classList.remove('hidden');
    if (logoutBtn) logoutBtn.textContent = 'デモ終了';
    demoToggle?.classList.remove('hidden');
    if (demoToggle) demoToggle.textContent = 'デモ終了';
    if (liveIndicator) {
      liveIndicator.className = 'status-badge-dot demo';
      liveIndicator.title = 'デモデータ表示中';
    }
    heroBanner?.classList.add('hidden');
  } else {
    loginBtn?.classList.remove('hidden');
    logoutBtn?.classList.add('hidden');
    demoToggle?.classList.remove('hidden');
    if (demoToggle) demoToggle.textContent = 'デモを試す';
    if (liveIndicator) {
      liveIndicator.className = 'status-badge-dot';
      liveIndicator.title = '未接続';
    }
    heroBanner?.classList.remove('hidden');
  }
}

/**
 * イベントリスナー設定
 */
function setupEventListeners() {
  // 認証 & ログインボタン
  document.getElementById('btn-login')?.addEventListener('click', handleLoginAction);
  document.getElementById('hero-btn-login')?.addEventListener('click', handleLoginAction);

  // Client ID 保存ボタン (モーダル内)
  document.getElementById('btn-save-client-id')?.addEventListener('click', async () => {
    const input = document.getElementById('input-client-id');
    const val = input ? input.value.trim() : '';
    if (!val) {
      UI.showNotification('Client IDを入力してください', 'error');
      return;
    }
    saveClientId(val);
    UI.showNotification('Spotify Client IDを保存しました！', 'success');
    const config = await fetchServerConfig();
    updateConfigModalStatus(config);
  });

  // Redirect URI コピーボタン (モーダル内)
  document.getElementById('btn-copy-redirect-uri')?.addEventListener('click', async () => {
    const redirectUri = getDefaultRedirectUri();
    try {
      await navigator.clipboard.writeText(redirectUri);
      UI.showNotification('Redirect URIをクリップボードにコピーしました！', 'success');
    } catch {
      const tempInput = document.createElement('input');
      tempInput.value = redirectUri;
      document.body.appendChild(tempInput);
      tempInput.select();
      document.execCommand('copy');
      document.body.removeChild(tempInput);
      UI.showNotification('Redirect URIをコピーしました！', 'success');
    }
  });

  // ヒーローバナー「デモモードで試してみる」ボタン
  document.getElementById('hero-btn-demo')?.addEventListener('click', async () => {
    AuthState.setDemo(true);
    updateAuthUI('demo');
    await loadDashboardData();
    startPlaybackPolling();
    UI.showNotification('デモモードを開始しました', 'info');
  });

  // ログアウト / デモ終了ボタン
  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    if (AuthState.isDemo()) {
      AuthState.setDemo(false);
      updateAuthUI('unauth');
      if (AppState.playerPollingTimer) clearInterval(AppState.playerPollingTimer);
      checkConfigAndInit();
      UI.showNotification('デモモードを終了しました', 'info');
    } else {
      if (confirm('Spotifyとの連携を解除してログアウトしますか？')) {
        await logout();
      }
    }
  });

  // ナビバー デモトグルボタン
  document.getElementById('btn-toggle-demo')?.addEventListener('click', async () => {
    if (AuthState.isDemo()) {
      AuthState.setDemo(false);
      await checkConfigAndInit();
      UI.showNotification('デモモードを終了しました', 'info');
    } else {
      AuthState.setDemo(true);
      updateAuthUI('demo');
      await loadDashboardData();
      startPlaybackPolling();
      UI.showNotification('デモモードに切り替えました', 'info');
    }
  });

  // 手動リフレッシュボタン
  document.getElementById('btn-refresh-all')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-refresh-all');
    btn?.classList.add('spinning');
    await loadDashboardData();
    setTimeout(() => btn?.classList.remove('spinning'), 600);
    UI.showNotification('ダッシュボードのデータを最新に更新しました', 'success');
  });

  // 設定モーダル開閉
  const modal = document.getElementById('config-modal');
  document.getElementById('btn-open-config')?.addEventListener('click', () => {
    modal?.classList.remove('hidden');
  });
  document.getElementById('btn-close-config')?.addEventListener('click', () => {
    modal?.classList.add('hidden');
  });
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  });

  // Analytics タブ: Tracks / Artists 切り替え
  document.querySelectorAll('.tab-btn-type').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      document.querySelectorAll('.tab-btn-type').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      AppState.currentTopType = e.currentTarget.dataset.type;
      await updateTopItemsView();
    });
  });

  // Analytics タブ: 期間切り替え (short_term / medium_term / long_term)
  document.querySelectorAll('.tab-btn-range').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      document.querySelectorAll('.tab-btn-range').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      AppState.currentTopRange = e.currentTarget.dataset.range;
      await updateTopItemsView();
    });
  });

  // スコープ不足エラーカスタムイベント
  window.addEventListener('spotify:auth_forbidden', (e) => {
    UI.showNotification(e.detail?.message || '権限が不足しています。再認証が必要です。', 'error', 8000);
  });

  // 曲の再生終了検知カスタムイベント
  window.addEventListener('spotify:track_finished', async () => {
    console.log('[Event] Track finished event received! Polling playback to update history...');
    await pollActivePlayback();
  });
}

/**
 * Analytics セクションのデータ取得・描画切替
 */
async function updateTopItemsView() {
  let tracks = AppState.cachedTopTracks[AppState.currentTopRange];
  let artists = AppState.cachedTopArtists[AppState.currentTopRange];

  if (!tracks || !artists) {
    const container = document.getElementById('top-items-grid');
    if (container) {
      container.innerHTML = '<div class="loading-spinner-row"><div class="mini-spinner"></div> データ取得中...</div>';
    }

    try {
      const [fetchedTracks, fetchedArtists] = await Promise.all([
        API.getTopTracks(AppState.currentTopRange, CONFIG.TOP_ITEMS_LIMIT),
        API.getTopArtists(AppState.currentTopRange, CONFIG.TOP_ITEMS_LIMIT)
      ]);
      tracks = AppState.cachedTopTracks[AppState.currentTopRange] = fetchedTracks;
      artists = AppState.cachedTopArtists[AppState.currentTopRange] = fetchedArtists;
    } catch (err) {
      console.error('Failed to switch top items:', err);
      UI.showNotification(`トップ項目更新エラー: ${err.message}`, 'error');
      return;
    }
  }

  UI.renderTopItems(
    tracks, 
    artists, 
    AppState.currentTopType, 
    AppState.currentTopRange, 
    AppState.cachedRecentlyPlayed
  );
}

/**
 * ログインアクション制御 (Client ID 未設定時はモーダルを開いて案内)
 */
async function handleLoginAction() {
  try {
    await loginWithSpotify();
  } catch (err) {
    if (err.message === 'CLIENT_ID_MISSING') {
      const modal = document.getElementById('config-modal');
      if (modal) modal.classList.remove('hidden');
      UI.showNotification('Spotify Client IDが未設定です。設定ガイドに入力してください。', 'info', 6000);
      const input = document.getElementById('input-client-id');
      if (input) input.focus();
    } else {
      console.error('Login action error:', err);
      UI.showNotification(`ログイン開始エラー: ${err.message}`, 'error');
    }
  }
}

/**
 * グローバルローダー表示制御
 * @param {boolean} show
 */
function showGlobalLoader(show) {
  const loader = document.getElementById('global-loader');
  if (!loader) return;
  if (show) {
    loader.classList.remove('hidden');
  } else {
    loader.classList.add('hidden');
  }
}

/**
 * 最終更新日時の更新
 */
function updateSyncTimestamp() {
  const el = document.getElementById('sync-time');
  if (el) {
    const now = new Date();
    el.textContent = `最終更新: ${now.toLocaleTimeString('ja-JP')}`;
  }
}

/**
 * 設定モーダルのステータス反映
 * @param {Object} config
 */
function updateConfigModalStatus(config) {
  const statusEl = document.getElementById('env-status-badge');
  const redirectUriEl = document.getElementById('config-redirect-uri');
  const clientIdEl = document.getElementById('config-client-id');
  const clientIdInput = document.getElementById('input-client-id');

  const redirectUri = config.redirectUri || getDefaultRedirectUri();

  if (redirectUriEl) {
    redirectUriEl.textContent = redirectUri;
  }

  const savedId = getSavedClientId();
  if (clientIdInput && savedId && !clientIdInput.value) {
    clientIdInput.value = savedId;
  }

  if (statusEl) {
    if (config.isConfigured) {
      statusEl.className = 'status-tag success';
      statusEl.textContent = config.isServerMode ? '✓ Node.js サーバー連携中' : '✓ Client ID 設定済み (GitHub Pages / PKCE)';
    } else {
      statusEl.className = 'status-tag warning';
      statusEl.textContent = '! Client ID 未設定 (デモモード利用可)';
    }
  }

  if (clientIdEl) {
    if (config.clientId) {
      const id = config.clientId;
      clientIdEl.textContent = id.length > 10 ? `${id.slice(0, 6)}...${id.slice(-4)}` : id;
    } else {
      clientIdEl.textContent = '(未設定)';
    }
  }
}
