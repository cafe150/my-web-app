/**
 * Spotify Web API Client
 * SpotifyTool: 並行フェッチ、レート制限(429 Retry-After)対応、401トークン再取得リトライ、デモモード切替
 */

import { AuthState, refreshAccessToken } from './auth.js';
import * as MockData from './mockData.js';

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

// エンドポイント定数定義
const ENDPOINTS = {
  ME: '/me',
  PLAYER: '/me/player',
  RECENTLY_PLAYED: '/me/player/recently-played',
  TOP_TRACKS: '/me/top/tracks',
  TOP_ARTISTS: '/me/top/artists',
  SAVED_TRACKS: '/me/tracks',
  SAVED_ALBUMS: '/me/albums',
  PLAYLISTS: '/me/playlists',
  TRACKS_BATCH: '/tracks',
  ARTISTS_BATCH: '/artists'
};

/**
 * レート制限対応・トークン自動リフレッシュ付き共通Fetchラッパー
 * @param {string} endpoint
 * @param {number} retryCount
 * @returns {Promise<any>}
 */
async function spotifyFetch(endpoint, retryCount = 0) {
  if (AuthState.isDemo()) {
    return getMockDataForEndpoint(endpoint);
  }

  const token = AuthState.getAccessToken();
  if (!token) {
    throw new Error('アクセストークンが存在しません。再ログインしてください。');
  }

  const url = endpoint.startsWith('http') ? endpoint : `${SPOTIFY_API_BASE}${endpoint}`;

  try {
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    // 204 No Content (再生中の曲がない場合など)
    if (res.status === 204) {
      return null;
    }

    // 429 Too Many Requests (レート制限対応)
    if (res.status === 429) {
      const retryAfterSeconds = parseInt(res.headers.get('Retry-After') || '2', 10);
      console.warn(`[API 429] Rate limited. Retrying after ${retryAfterSeconds}s...`);
      if (retryCount < 3) {
        await new Promise(resolve => setTimeout(resolve, retryAfterSeconds * 1000));
        return spotifyFetch(endpoint, retryCount + 1);
      }
      throw new Error(`Spotify APIのレート制限に達しました。${retryAfterSeconds}秒後に再試行してください。`);
    }

    // 401 Unauthorized (トークン失効)
    if (res.status === 401 && retryCount === 0) {
      console.log('[API 401] Token expired. Attempting refresh...');
      try {
        const newAccessToken = await refreshAccessToken();
        if (newAccessToken) {
          AuthState.setAccessToken(newAccessToken);
          return spotifyFetch(endpoint, retryCount + 1);
        }
      } catch (refreshErr) {
        console.warn('[API 401] Token refresh failed:', refreshErr);
      }
      throw new Error('セッションの有効期限が切れました。再度ログインしてください。');
    }

    // 403 Forbidden (スコープ不足等)
    if (res.status === 403) {
      window.dispatchEvent(new CustomEvent('spotify:auth_forbidden', {
        detail: { message: '認可スコープが不足しています。一度ログアウトして再ログインしてください。' }
      }));
      throw new Error('Spotify API 403 Forbidden: 認可スコープまたは権限が不足しています。');
    }

    if (!res.ok) {
      const errorBody = await res.text();
      throw new Error(`Spotify API Error [${res.status}]: ${errorBody}`);
    }

    return await res.json();
  } catch (err) {
    if (AuthState.isDemo()) {
      return getMockDataForEndpoint(endpoint);
    }
    throw err;
  }
}

/**
 * デモ用モックデータのルーティング
 * @param {string} endpoint
 * @returns {any}
 */
function getMockDataForEndpoint(endpoint) {
  if (endpoint.includes(ENDPOINTS.RECENTLY_PLAYED)) return MockData.mockRecentlyPlayed;
  if (endpoint.includes(ENDPOINTS.PLAYER)) return MockData.mockPlayback;
  if (endpoint.includes(ENDPOINTS.TOP_TRACKS)) {
    if (endpoint.includes('short_term')) return MockData.mockTopTracks.short_term;
    if (endpoint.includes('long_term')) return MockData.mockTopTracks.long_term;
    return MockData.mockTopTracks.medium_term;
  }
  if (endpoint.includes(ENDPOINTS.TOP_ARTISTS)) {
    if (endpoint.includes('short_term')) return MockData.mockTopArtists.short_term;
    if (endpoint.includes('long_term')) return MockData.mockTopArtists.long_term;
    return MockData.mockTopArtists.medium_term;
  }
  if (endpoint.includes(ENDPOINTS.SAVED_TRACKS)) return MockData.mockSavedTracks;
  if (endpoint.includes(ENDPOINTS.SAVED_ALBUMS)) return MockData.mockSavedAlbums;
  if (endpoint.includes(ENDPOINTS.PLAYLISTS)) return MockData.mockPlaylists;
  if (endpoint.includes(ENDPOINTS.ME)) return MockData.mockUser;
  return null;
}

/**
 * 人気度(popularity)が0で返却された場合のバッチ取得補完ヘルパー
 * @param {Array<Object>} items
 * @param {'tracks' | 'artists'} itemType
 * @returns {Promise<Array<Object>>}
 */
async function enrichItemsPopularity(items, itemType) {
  if (!Array.isArray(items) || items.length === 0 || AuthState.isDemo()) {
    return items;
  }

  const zeroPopItems = items.filter(item => !item.popularity || item.popularity === 0);
  if (zeroPopItems.length === 0) {
    return items;
  }

  try {
    const ids = items.map(item => item.id).filter(Boolean).slice(0, 50).join(',');
    if (!ids) return items;

    const endpoint = itemType === 'tracks' 
      ? `${ENDPOINTS.TRACKS_BATCH}?ids=${ids}` 
      : `${ENDPOINTS.ARTISTS_BATCH}?ids=${ids}`;
    
    const detailData = await spotifyFetch(endpoint);
    const detailList = (itemType === 'tracks' ? detailData?.tracks : detailData?.artists) || [];
    
    if (Array.isArray(detailList)) {
      const detailMap = new Map(detailList.filter(Boolean).map(item => [item.id, item]));
      return items.map(item => {
        const enriched = detailMap.get(item.id);
        if (enriched && enriched.popularity > 0) {
          return { ...item, popularity: enriched.popularity };
        }
        return item;
      });
    }
  } catch (err) {
    console.warn(`[API] ${itemType} details enrichment fallback skipped:`, err);
  }

  return items;
}

/**
 * 1. プロフィール情報
 * @returns {Promise<Object>}
 */
export async function getProfile() {
  return await spotifyFetch(ENDPOINTS.ME);
}

/**
 * 2. 現在の再生状況 (Active Player)
 * @returns {Promise<Object|null>}
 */
export async function getPlaybackState() {
  return await spotifyFetch(ENDPOINTS.PLAYER);
}

/**
 * 3. 直近の再生履歴 (Recently Played, 最大50件)
 * @param {number} limit
 * @returns {Promise<Object>}
 */
export async function getRecentlyPlayed(limit = 50) {
  return await spotifyFetch(`${ENDPOINTS.RECENTLY_PLAYED}?limit=${limit}`);
}

/**
 * 4. トップトラック (Top Tracks: short_term, medium_term, long_term)
 * @param {string} timeRange
 * @param {number} limit
 * @returns {Promise<Object>}
 */
export async function getTopTracks(timeRange = 'medium_term', limit = 20) {
  const data = await spotifyFetch(`${ENDPOINTS.TOP_TRACKS}?time_range=${timeRange}&limit=${limit}`);
  if (data && Array.isArray(data.items)) {
    data.timeRange = timeRange;
    data.items = await enrichItemsPopularity(data.items, 'tracks');
  }
  return data;
}

/**
 * 5. トップアーティスト (Top Artists: short_term, medium_term, long_term)
 * @param {string} timeRange
 * @param {number} limit
 * @returns {Promise<Object>}
 */
export async function getTopArtists(timeRange = 'medium_term', limit = 20) {
  const data = await spotifyFetch(`${ENDPOINTS.TOP_ARTISTS}?time_range=${timeRange}&limit=${limit}`);
  if (data && Array.isArray(data.items)) {
    data.timeRange = timeRange;
    data.items = await enrichItemsPopularity(data.items, 'artists');
  }
  return data;
}

/**
 * 6. 保存済みライブラリ (Tracks & Albums)
 * @returns {Promise<{tracks: Object, albums: Object}>}
 */
export async function getLibraryStats() {
  const [tracks, albums] = await Promise.all([
    spotifyFetch(`${ENDPOINTS.SAVED_TRACKS}?limit=20`),
    spotifyFetch(`${ENDPOINTS.SAVED_ALBUMS}?limit=20`)
  ]);
  return { tracks, albums };
}

/**
 * 7. プレイリスト一覧
 * @param {number} limit
 * @returns {Promise<Object>}
 */
export async function getPlaylists(limit = 50) {
  return await spotifyFetch(`${ENDPOINTS.PLAYLISTS}?limit=${limit}`);
}

/**
 * 8. 画面初期化用: 全カテゴリ並行データフェッチ
 * @param {string} topTimeRange
 * @returns {Promise<Object>}
 */
export async function fetchAllDashboardData(topTimeRange = 'medium_term') {
  const results = await Promise.allSettled([
    getProfile(),
    getPlaybackState(),
    getRecentlyPlayed(50),
    getTopTracks(topTimeRange, 20),
    getTopArtists(topTimeRange, 20),
    getLibraryStats(),
    getPlaylists(50)
  ]);

  return {
    profile: results[0].status === 'fulfilled' ? results[0].value : null,
    playback: results[1].status === 'fulfilled' ? results[1].value : null,
    recentlyPlayed: results[2].status === 'fulfilled' ? results[2].value : null,
    topTracks: results[3].status === 'fulfilled' ? results[3].value : null,
    topArtists: results[4].status === 'fulfilled' ? results[4].value : null,
    library: results[5].status === 'fulfilled' ? results[5].value : null,
    playlists: results[6].status === 'fulfilled' ? results[6].value : null
  };
}
