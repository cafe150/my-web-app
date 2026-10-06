/**
 * Spotify Auth Management Module (PKCE for GitHub Pages & Local Express Fallback)
 * SpotifyTool: サーバーなし（GitHub Pages等の静的ホスティング）でもPKCEフローで直接Spotify認証可能
 */

// ストレージキー定義の一元化
export const STORAGE_KEYS = {
  CLIENT_ID: 'spotify_client_id',
  ACCESS_TOKEN: 'spotify_access_token',
  REFRESH_TOKEN: 'spotify_refresh_token',
  EXPIRES_AT: 'spotify_token_expires_at',
  DEMO_MODE: 'spotifytool_demo',
  PKCE_VERIFIER: 'spotify_pkce_code_verifier',
  PKCE_STATE: 'spotify_pkce_state'
};

const SPOTIFY_AUTH_ENDPOINT = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';

const SCOPES = [
  'user-read-private',
  'user-read-email',
  'user-read-playback-state',
  'user-read-currently-playing',
  'user-read-recently-played',
  'user-top-read',
  'user-library-read',
  'playlist-read-private',
  'playlist-read-collaborative'
].join(' ');

let currentAccessToken = null;
let tokenRefreshTimer = null;
let isDemoMode = false;

export const AuthState = {
  isDemo: () => isDemoMode,
  setDemo: (val) => {
    isDemoMode = Boolean(val);
    sessionStorage.setItem(STORAGE_KEYS.DEMO_MODE, isDemoMode ? '1' : '0');
  },
  getAccessToken: () => currentAccessToken,
  setAccessToken: (token) => {
    currentAccessToken = token;
  }
};

/**
 * 現在のページのURLをRedirect URIとして整形（クエリパラメータやハッシュを除外）
 * @returns {string}
 */
export function getDefaultRedirectUri() {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/index\.html$/, '/');
}

/**
 * 保存されたSpotify Client IDを取得
 * @returns {string}
 */
export function getSavedClientId() {
  return (localStorage.getItem(STORAGE_KEYS.CLIENT_ID) || '').trim();
}

/**
 * Spotify Client IDを保存
 * @param {string} clientId
 */
export function saveClientId(clientId) {
  if (clientId) {
    localStorage.setItem(STORAGE_KEYS.CLIENT_ID, clientId.trim());
  } else {
    localStorage.removeItem(STORAGE_KEYS.CLIENT_ID);
  }
}

/**
 * サーバー設定取得 (/api/config) またはローカル/静的モードの判定
 * @returns {Promise<Object>}
 */
export async function fetchServerConfig() {
  // 1. ローカルExpressサーバーが動作しているか試行
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      const data = await res.json();
      if (data && data.isConfigured) {
        return {
          ...data,
          isServerMode: true
        };
      }
    }
  } catch {
    // 静的ホスティング環境（GitHub Pages等）ではフォールバック
  }

  // 2. ブラウザローカル設定（GitHub Pagesモード）
  const savedClientId = getSavedClientId();
  const redirectUri = getDefaultRedirectUri();

  return {
    isServerMode: false,
    isConfigured: Boolean(savedClientId),
    clientId: savedClientId || null,
    redirectUri: redirectUri,
    scopes: SCOPES.split(' ')
  };
}

/**
 * PKCE用暗号ヘルパー: Code Verifierの生成
 * @param {number} length
 * @returns {string}
 */
function generateRandomString(length = 64) {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return values.reduce((acc, x) => acc + possible[x % possible.length], '');
}

/**
 * PKCE用暗号ヘルパー: SHA-256ダイジェスト & Base64URLエンコード
 * @param {string} codeVerifier
 * @returns {Promise<string>}
 */
async function generateCodeChallenge(codeVerifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  const base64Digest = btoa(String.fromCharCode(...new Uint8Array(digest)));
  return base64Digest
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Spotify認証コールバックコードの交換 (PKCE POST https://accounts.spotify.com/api/token)
 * @param {string} code
 * @returns {Promise<Object>}
 */
async function exchangeCodeForToken(code) {
  const clientId = getSavedClientId();
  const codeVerifier = sessionStorage.getItem(STORAGE_KEYS.PKCE_VERIFIER);
  const redirectUri = getDefaultRedirectUri();

  if (!clientId || !codeVerifier) {
    throw new Error('PKCE認可情報（Client IDまたはVerifier）が見つかりません。');
  }

  const payload = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier
  });

  const response = await fetch(SPOTIFY_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: payload.toString()
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error_description || data.error || 'Token交換に失敗しました');
  }

  // セッションストレージからVerifierを削除
  sessionStorage.removeItem(STORAGE_KEYS.PKCE_VERIFIER);
  sessionStorage.removeItem(STORAGE_KEYS.PKCE_STATE);

  // トークン保存
  saveTokens(data);
  return data;
}

/**
 * トークンのローカル保存
 * @param {Object} data
 */
function saveTokens(data) {
  if (data.access_token) {
    currentAccessToken = data.access_token;
    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, data.access_token);
  }
  if (data.refresh_token) {
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, data.refresh_token);
  }
  if (data.expires_in) {
    const expiresAt = Date.now() + data.expires_in * 1000;
    localStorage.setItem(STORAGE_KEYS.EXPIRES_AT, expiresAt.toString());
    scheduleTokenRefresh(data.expires_in);
  }
}

/**
 * リフレッシュトークンを使用したトークン更新 (PKCE)
 * @returns {Promise<string>}
 */
export async function refreshAccessToken() {
  const refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
  const clientId = getSavedClientId();

  // 1. ローカルExpressサーバーがある場合はまずそちらを試行
  try {
    const res = await fetch('/api/auth/refresh', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.accessToken) {
        currentAccessToken = data.accessToken;
        scheduleTokenRefresh(data.expiresIn || 3600);
        return currentAccessToken;
      }
    }
  } catch {
    // サーバーなし環境
  }

  // 2. ブラウザ直接PKCE更新
  if (!refreshToken || !clientId) {
    throw new Error('リフレッシュトークンまたはClient IDがありません');
  }

  const payload = new URLSearchParams({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  });

  const response = await fetch(SPOTIFY_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: payload.toString()
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error_description || data.error || 'トークン更新に失敗しました');
  }

  saveTokens(data);
  return data.access_token;
}

/**
 * 認証ステータスチェック & 初期化
 * @returns {Promise<{authenticated: boolean, isDemo: boolean, error?: string}>}
 */
export async function initAuth() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  const authError = params.get('error') || params.get('auth_error');

  // URLからSpotifyの認可クエリをクリアしてクリーンなURLに戻す
  if (code || authError || params.get('authenticated')) {
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  if (authError) {
    console.error('Spotify auth error:', authError);
    return { authenticated: false, isDemo: false, error: authError };
  }

  // PKCE認可コードが返ってきた場合
  if (code) {
    const savedState = sessionStorage.getItem(STORAGE_KEYS.PKCE_STATE);
    if (savedState && state !== savedState) {
      return { authenticated: false, isDemo: false, error: 'Stateの検証に失敗しました。' };
    }

    try {
      await exchangeCodeForToken(code);
      isDemoMode = false;
      sessionStorage.removeItem(STORAGE_KEYS.DEMO_MODE);
      return { authenticated: true, isDemo: false };
    } catch (err) {
      console.error('Code exchange failed:', err);
      return { authenticated: false, isDemo: false, error: err.message };
    }
  }

  // 1. ローカルストレージに既存の有効なPKCEトークンがあるかチェック
  const savedToken = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  const expiresAt = parseInt(localStorage.getItem(STORAGE_KEYS.EXPIRES_AT) || '0', 10);
  const hasRefreshToken = Boolean(localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN));

  if (savedToken) {
    if (Date.now() < expiresAt - 60000) {
      // まだ有効
      currentAccessToken = savedToken;
      isDemoMode = false;
      sessionStorage.removeItem(STORAGE_KEYS.DEMO_MODE);
      scheduleTokenRefresh(Math.floor((expiresAt - Date.now()) / 1000));
      return { authenticated: true, isDemo: false };
    } else if (hasRefreshToken) {
      // 期限切れだがリフレッシュ可能
      try {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          isDemoMode = false;
          sessionStorage.removeItem(STORAGE_KEYS.DEMO_MODE);
          return { authenticated: true, isDemo: false };
        }
      } catch (err) {
        console.warn('Auto refresh failed on init:', err);
      }
    }
  }

  // 2. Expressサーバー側のセッションクッキーがあるかフォールバック確認
  try {
    const res = await fetch('/api/auth/token');
    if (res.ok) {
      const data = await res.json();
      if (data.authenticated && data.accessToken) {
        currentAccessToken = data.accessToken;
        isDemoMode = false;
        sessionStorage.removeItem(STORAGE_KEYS.DEMO_MODE);
        scheduleTokenRefresh(data.expiresIn || 3600);
        return { authenticated: true, isDemo: false };
      }
    }
  } catch {
    // サーバーなし環境
  }

  // 3. デモモードフラグ確認
  // 旧キー互換用
  const savedDemo = sessionStorage.getItem(STORAGE_KEYS.DEMO_MODE) || sessionStorage.getItem('spotify_dashboard_demo');
  if (savedDemo === '1') {
    isDemoMode = true;
    return { authenticated: false, isDemo: true };
  }

  // 4. 未認証
  isDemoMode = false;
  return { authenticated: false, isDemo: false };
}

/**
 * 自動リフレッシュのスケジュール
 * @param {number} expiresInSeconds
 */
function scheduleTokenRefresh(expiresInSeconds) {
  if (tokenRefreshTimer) clearTimeout(tokenRefreshTimer);

  const refreshDelayMs = Math.max(10000, (expiresInSeconds - 90) * 1000);

  tokenRefreshTimer = setTimeout(async () => {
    try {
      await refreshAccessToken();
    } catch (err) {
      console.error('[Auth] Error during token refresh:', err);
    }
  }, refreshDelayMs);
}

/**
 * Spotifyログイン開始 (ブラウザ完結PKCEフロー)
 */
export async function loginWithSpotify() {
  sessionStorage.removeItem(STORAGE_KEYS.DEMO_MODE);
  sessionStorage.removeItem('spotify_dashboard_demo');

  // Client IDの確認
  const clientId = getSavedClientId();
  if (!clientId) {
    throw new Error('CLIENT_ID_MISSING');
  }

  // PKCE パラメータ生成
  const codeVerifier = generateRandomString(64);
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateRandomString(16);
  const redirectUri = getDefaultRedirectUri();

  sessionStorage.setItem(STORAGE_KEYS.PKCE_VERIFIER, codeVerifier);
  sessionStorage.setItem(STORAGE_KEYS.PKCE_STATE, state);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SCOPES,
    redirect_uri: redirectUri,
    state: state,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    show_dialog: 'true'
  });

  window.location.href = `${SPOTIFY_AUTH_ENDPOINT}?${params.toString()}`;
}

/**
 * ログアウト
 */
export async function logout() {
  if (tokenRefreshTimer) clearTimeout(tokenRefreshTimer);
  currentAccessToken = null;
  isDemoMode = false;

  localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.EXPIRES_AT);
  sessionStorage.removeItem(STORAGE_KEYS.DEMO_MODE);
  sessionStorage.removeItem('spotify_dashboard_demo');
  sessionStorage.removeItem(STORAGE_KEYS.PKCE_VERIFIER);
  sessionStorage.removeItem(STORAGE_KEYS.PKCE_STATE);

  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // サーバーなし環境
  }

  window.location.href = getDefaultRedirectUri();
}
