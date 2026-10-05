/**
 * SpotifyTool UI Renderer
 * 各セクションのDOMレンダリング、イコライザー演出、プログレスバー、タブ切替
 */

// XSSサニタイズ
export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ミリ秒 -> 分:秒 フォーマット
export function formatMs(ms) {
  if (!ms || isNaN(ms)) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// 相対時間フォーマット
export function formatRelativeTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const diffSec = Math.floor((now - date) / 1000);

  if (diffSec < 60) return 'たった今';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}分前`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}時間前`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}日前`;
  return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
}

// 1. Header: ユーザー属性レンダリング
export function renderHeader(profile, isDemo = false) {
  const container = document.getElementById('user-profile-card');
  if (!container) return;

  if (!profile) {
    container.innerHTML = `
      <div class="user-profile-empty">
        <div class="user-avatar-placeholder">?</div>
        <div>
          <h2 class="user-name">未接続</h2>
          <p class="user-meta">Spotifyアカウントにログインしてください</p>
        </div>
      </div>
    `;
    return;
  }

  const avatarUrl = profile.images?.[0]?.url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150';
  const isPremium = profile.product === 'premium';
  const followers = profile.followers?.total?.toLocaleString('ja-JP') || '0';

  container.innerHTML = `
    <div class="user-profile-flex">
      <div class="user-avatar-wrapper">
        <img src="${avatarUrl}" alt="${escapeHtml(profile.display_name)}" class="user-avatar-img" />
        ${isPremium ? '<span class="premium-badge-icon" title="Spotify Premium">★</span>' : ''}
      </div>
      <div class="user-details">
        <div class="user-title-row">
          <h1 class="user-display-name">${escapeHtml(profile.display_name || 'Spotify ユーザー')}</h1>
          <span class="user-plan-badge ${isPremium ? 'plan-premium' : 'plan-free'}">
            ${isPremium ? 'PREMIUM' : 'FREE'}
          </span>
          ${isDemo ? '<span class="demo-badge">DEMO MODE</span>' : ''}
        </div>
        <div class="user-stats-bar">
          <span class="stat-pill"><strong>ID:</strong> ${escapeHtml(profile.id)}</span>
          <span class="stat-pill"><strong>Country:</strong> 🌐 ${escapeHtml(profile.country || 'JP')}</span>
          <span class="stat-pill"><strong>Followers:</strong> ${followers}</span>
          ${profile.external_urls?.spotify ? `
            <a href="${profile.external_urls.spotify}" target="_blank" rel="noreferrer" class="stat-link">
              Spotifyで開く ↗
            </a>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

// 2. Active: 再生状況レンダリング
let activeProgressInterval = null;
let currentProgressMs = 0;
let currentDurationMs = 0;
let isCurrentlyPlaying = false;

export function renderActivePlayer(playback) {
  const container = document.getElementById('active-player-content');
  if (!container) return;

  if (activeProgressInterval) {
    clearInterval(activeProgressInterval);
    activeProgressInterval = null;
  }

  // 再生中でない、またはデバイスが非アクティブな場合
  if (!playback || !playback.item) {
    container.innerHTML = `
      <div class="player-idle-state">
        <div class="idle-icon-pulse">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
          </svg>
        </div>
        <div class="idle-text-block">
          <h3>現在再生中の曲はありません</h3>
          <p>お使いのSpotifyアプリ（PC、スマートフォン等）で楽曲を再生すると、ここにリアルタイムに表示されます。</p>
        </div>
      </div>
    `;
    return;
  }

  const track = playback.item;
  const album = track.album || {};
  const albumImg = album.images?.[0]?.url || album.images?.[1]?.url || '';
  const artists = (track.artists || []).map(a => a.name).join(', ');
  const device = playback.device || {};

  currentProgressMs = playback.progress_ms || 0;
  currentDurationMs = track.duration_ms || 1;
  isCurrentlyPlaying = Boolean(playback.is_playing);

  const percent = Math.min(100, Math.max(0, (currentProgressMs / currentDurationMs) * 100));

  container.innerHTML = `
    <div class="player-card">
      <div class="player-left">
        <div class="player-album-art-wrap">
          <img src="${albumImg}" alt="${escapeHtml(track.name)}" class="player-album-img ${isCurrentlyPlaying ? 'spinning-glow' : ''}" />
          ${isCurrentlyPlaying ? `
            <div class="equalizer-bars" title="Playing">
              <span class="eq-bar bar1"></span>
              <span class="eq-bar bar2"></span>
              <span class="eq-bar bar3"></span>
              <span class="eq-bar bar4"></span>
            </div>
          ` : ''}
        </div>
        <div class="player-info">
          <div class="player-status-badge">
            <span class="status-indicator ${isCurrentlyPlaying ? 'playing' : 'paused'}"></span>
            ${isCurrentlyPlaying ? 'REPRODUCING' : 'PAUSED'}
          </div>
          <h2 class="player-track-title" title="${escapeHtml(track.name)}">${escapeHtml(track.name)}</h2>
          <p class="player-track-artist">${escapeHtml(artists)}</p>
          <p class="player-album-title">${escapeHtml(album.name || '')} (${album.release_date?.slice(0, 4) || ''})</p>
        </div>
      </div>

      <div class="player-center-progress">
        <div class="player-progress-bar-container">
          <span class="time-label" id="current-time-label">${formatMs(currentProgressMs)}</span>
          <div class="progress-track">
            <div class="progress-fill" id="player-progress-fill" style="width: ${percent.toFixed(2)}%;"></div>
          </div>
          <span class="time-label">${formatMs(currentDurationMs)}</span>
        </div>
      </div>

      <div class="player-right-device">
        <div class="device-pill">
          <span class="device-icon">
            ${getDeviceIcon(device.type)}
          </span>
          <div class="device-text">
            <span class="device-name">${escapeHtml(device.name || 'Unknown Device')}</span>
            <span class="device-type">${escapeHtml(device.type || 'Speaker')}</span>
          </div>
        </div>

        <div class="volume-container">
          <span class="volume-icon">🔊</span>
          <div class="volume-bar-track">
            <div class="volume-bar-fill" style="width: ${device.volume_percent ?? 50}%;"></div>
          </div>
          <span class="volume-text">${device.volume_percent ?? '--'}%</span>
        </div>
      </div>
    </div>
  `;

  // 再生中ならクライアント側で1秒毎にプログレスバーを滑らかに進める
  if (isCurrentlyPlaying) {
    let hasEmittedFinishEvent = false;
    activeProgressInterval = setInterval(() => {
      currentProgressMs += 1000;
      if (currentProgressMs >= currentDurationMs) {
        currentProgressMs = currentDurationMs;
        if (!hasEmittedFinishEvent) {
          hasEmittedFinishEvent = true;
          // 曲の再生終了を検知して即時イベント発火
          window.dispatchEvent(new CustomEvent('spotify:track_finished', {
            detail: { trackId: playback?.item?.id }
          }));
        }
      }
      const newPercent = Math.min(100, (currentProgressMs / currentDurationMs) * 100);
      const fillEl = document.getElementById('player-progress-fill');
      const timeEl = document.getElementById('current-time-label');
      if (fillEl) fillEl.style.width = `${newPercent.toFixed(2)}%`;
      if (timeEl) timeEl.textContent = formatMs(currentProgressMs);
    }, 1000);
  }
}

/**
 * 再生履歴が自動更新された際の視覚ハイライトアニメーション
 */
export function highlightHistoryUpdate() {
  const container = document.getElementById('history-list');
  const countBadge = document.getElementById('history-count');
  if (container) {
    container.classList.remove('history-updated-flash');
    // リフロー強制でアニメーション再発火
    void container.offsetWidth;
    container.classList.add('history-updated-flash');
    setTimeout(() => container.classList.remove('history-updated-flash'), 1600);
  }
  if (countBadge) {
    countBadge.classList.remove('badge-pulse');
    void countBadge.offsetWidth;
    countBadge.classList.add('badge-pulse');
    setTimeout(() => countBadge.classList.remove('badge-pulse'), 1600);
  }
}

function getDeviceIcon(type = '') {
  const lower = type.toLowerCase();
  if (lower.includes('computer')) return '💻';
  if (lower.includes('smartphone') || lower.includes('phone')) return '📱';
  if (lower.includes('speaker')) return '🔈';
  if (lower.includes('cast') || lower.includes('tv')) return '📺';
  return '🎧';
}

// 3. History: 直近の再生履歴レンダリング
export function renderRecentlyPlayed(historyData) {
  const container = document.getElementById('history-list');
  const countBadge = document.getElementById('history-count');
  if (!container) return;

  const items = historyData?.items || [];
  if (countBadge) countBadge.textContent = `${items.length}曲`;

  if (items.length === 0) {
    container.innerHTML = `<div class="empty-placeholder">再生履歴がありません</div>`;
    return;
  }

  container.innerHTML = items.map((item, idx) => {
    const track = item.track || {};
    const albumImg = track.album?.images?.[2]?.url || track.album?.images?.[0]?.url || '';
    const artists = (track.artists || []).map(a => a.name).join(', ');
    const relativeTime = formatRelativeTime(item.played_at);

    return `
      <div class="history-item">
        <span class="history-rank">${idx + 1}</span>
        <img src="${albumImg}" alt="${escapeHtml(track.name)}" class="history-thumb" loading="lazy" />
        <div class="history-info">
          <div class="history-name" title="${escapeHtml(track.name)}">${escapeHtml(track.name)}</div>
          <div class="history-artist">${escapeHtml(artists)}</div>
        </div>
        <div class="history-meta">
          <span class="history-time" title="${item.played_at}">${relativeTime}</span>
          <span class="history-duration">${formatMs(track.duration_ms)}</span>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * 期間・順位・楽曲/アーティストの固有ハッシュ・世界人気度・直近再生履歴に応じた
 * パーソナル親和度スコア (15〜100) を算出
 */
export function calculatePersonalScore(item, idx, total, timeRange = 'medium_term', recentIds = new Set()) {
  const safeTotal = Math.max(1, total - 1);
  const rankRatio = idx / safeTotal; // 0.0 (1位) 〜 1.0 (最下位)

  // 1. 期間ごとの特性カーブ定義
  // short_term (4週間): ヘビロテ重視。上位3曲が突出、下位へ急降下 (98 -> 32)
  // medium_term (6ヶ月): バランス型。安定した推移 (96 -> 46)
  // long_term (全期間): 殿堂入り愛聴曲。全体的に高スコアをキープ (99 -> 62)
  let maxScore, minScore, curvePower;
  if (timeRange === 'short_term') {
    maxScore = 98;
    minScore = 32;
    curvePower = 1.35;
  } else if (timeRange === 'long_term') {
    maxScore = 99;
    minScore = 62;
    curvePower = 0.72;
  } else {
    maxScore = 96;
    minScore = 46;
    curvePower = 1.02;
  }

  // 順位カーブによる基礎スコア
  const rankDrop = Math.pow(rankRatio, curvePower) * (maxScore - minScore);
  let score = maxScore - rankDrop;

  // 2. 楽曲/アーティスト固有の決定論的シード（ハッシュ）による個別揺らぎ (±3.5点)
  const seedKey = String(item.id || item.name || idx);
  let hash = 0;
  for (let i = 0; i < seedKey.length; i++) {
    hash = (hash * 31 + seedKey.charCodeAt(i)) & 0xffffffff;
  }
  const variance = ((Math.abs(hash) % 70) - 35) / 10;

  // 期間ごとの固有位相シフト（同じ曲でも期間ごとにスコアが自然に変化）
  const rangeShift = timeRange === 'short_term' ? 1.8 : (timeRange === 'long_term' ? -1.2 : 0.4);
  score += variance + rangeShift;

  // 3. Spotify Global Popularity (0〜100) がある場合の加点
  const rawPop = Number(item.popularity);
  if (!isNaN(rawPop) && rawPop > 0) {
    score += (rawPop - 50) * 0.08;
  }

  // 4. 直近再生（Recently Played）履歴ボーナス
  if (item.id && recentIds.has(item.id)) {
    const recentBonus = timeRange === 'short_term' ? 5 : 2;
    score += recentBonus;
  }

  // 5. 順位秩序の維持ガード（1位から下位へなだらかに降下）
  const rankMax = Math.max(minScore, Math.round(maxScore + 2 - (idx * ((maxScore - minScore) / safeTotal) * 0.92)));
  const rankMin = Math.max(15, rankMax - 12);
  score = Math.min(rankMax, Math.max(rankMin, score));

  if (idx === 0) {
    score = Math.max(timeRange === 'long_term' ? 98 : (timeRange === 'short_term' ? 97 : 95), score);
  }

  return Math.min(100, Math.max(15, Math.round(score)));
}

// スコア帯に応じたバーグラデーション色
function getScoreGradient(score) {
  if (score >= 90) return 'linear-gradient(90deg, #1db954, #1ed760)';
  if (score >= 78) return 'linear-gradient(90deg, #10b981, #34d399)';
  if (score >= 65) return 'linear-gradient(90deg, #06b6d4, #38bdf8)';
  return 'linear-gradient(90deg, #8b5cf6, #a78bfa)';
}

// 期間日本語名
function getRangeLabel(timeRange) {
  switch (timeRange) {
    case 'short_term': return '4週間親和度';
    case 'long_term': return '全期間愛聴度';
    default: return '6ヶ月親和度';
  }
}

// 4. Analytics: トップ項目レンダリング (Tracks / Artists)
export function renderTopItems(tracksData, artistsData, activeType = 'tracks', timeRange = 'medium_term', recentlyPlayedData = null) {
  const container = document.getElementById('top-items-grid');
  if (!container) return;

  // 最近再生されたアイテムIDの抽出
  const recentIds = new Set();
  if (recentlyPlayedData?.items && Array.isArray(recentlyPlayedData.items)) {
    recentlyPlayedData.items.forEach(rp => {
      if (rp.track?.id) recentIds.add(rp.track.id);
      if (rp.track?.artists) {
        rp.track.artists.forEach(a => { if (a.id) recentIds.add(a.id); });
      }
    });
  }

  // データオブジェクトに付与された timeRange があればそちらを優先
  const resolvedRange = (activeType === 'tracks' ? tracksData?.timeRange : artistsData?.timeRange) || timeRange;
  const periodLabel = getRangeLabel(resolvedRange);

  if (activeType === 'tracks') {
    const items = tracksData?.items || [];
    if (items.length === 0) {
      container.innerHTML = `<div class="empty-placeholder">トップトラックのデータがありません</div>`;
      return;
    }

    const total = items.length;

    container.innerHTML = items.map((track, idx) => {
      const albumImg = track.album?.images?.[1]?.url || track.album?.images?.[0]?.url || '';
      const artists = (track.artists || []).map(a => a.name).join(', ');
      
      const score = calculatePersonalScore(track, idx, total, resolvedRange, recentIds);
      const rawPop = Number(track.popularity);
      const popBadge = (!isNaN(rawPop) && rawPop > 0) ? `<span class="pop-sub-badge" title="Spotify世界人気度">世界人気: ${rawPop}</span>` : '';
      const barGradient = getScoreGradient(score);

      return `
        <div class="top-card top-track-card">
          <div class="top-card-rank">#${idx + 1}</div>
          <img src="${albumImg}" alt="${escapeHtml(track.name)}" class="top-card-img" loading="lazy" />
          <div class="top-card-body">
            <h4 class="top-card-title" title="${escapeHtml(track.name)}">${escapeHtml(track.name)}</h4>
            <p class="top-card-sub">${escapeHtml(artists)}</p>
            <div class="popularity-row">
              <div class="pop-label-group">
                <span class="pop-label">${periodLabel}: <strong>${score}</strong>/100</span>
                ${popBadge}
              </div>
              <div class="pop-bar-bg">
                <div class="pop-bar-fill" style="width: ${score}%; background: ${barGradient};"></div>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  } else {
    // artists
    const items = artistsData?.items || [];
    if (items.length === 0) {
      container.innerHTML = `<div class="empty-placeholder">トップアーティストのデータがありません</div>`;
      return;
    }

    const total = items.length;

    container.innerHTML = items.map((artist, idx) => {
      const img = artist.images?.[1]?.url || artist.images?.[0]?.url || '';
      const genres = (artist.genres || []).slice(0, 3).join(' • ') || 'Pop / Rock';
      const followers = artist.followers?.total ? artist.followers.total.toLocaleString('ja-JP') : '--';
      
      const score = calculatePersonalScore(artist, idx, total, resolvedRange, recentIds);
      const rawPop = Number(artist.popularity);
      const popBadge = (!isNaN(rawPop) && rawPop > 0) ? `<span class="pop-sub-badge" title="Spotify世界人気度">世界人気: ${rawPop}</span>` : '';
      const barGradient = getScoreGradient(score);

      return `
        <div class="top-card top-artist-card">
          <div class="top-card-rank">#${idx + 1}</div>
          <img src="${img}" alt="${escapeHtml(artist.name)}" class="top-card-img artist-round" loading="lazy" />
          <div class="top-card-body">
            <h4 class="top-card-title" title="${escapeHtml(artist.name)}">${escapeHtml(artist.name)}</h4>
            <p class="top-card-sub">${escapeHtml(genres)}</p>
            <div class="artist-followers">フォロワー: ${followers}</div>
            <div class="popularity-row">
              <div class="pop-label-group">
                <span class="pop-label">${periodLabel}: <strong>${score}</strong>/100</span>
                ${popBadge}
              </div>
              <div class="pop-bar-bg">
                <div class="pop-bar-fill" style="width: ${score}%; background: ${barGradient};"></div>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }
}

// 5. Library: ライブラリ統計レンダリング
export function renderLibrary(libraryData) {
  const tracksContainer = document.getElementById('library-tracks-list');
  const albumsContainer = document.getElementById('library-albums-grid');
  const totalLikedCount = document.getElementById('total-liked-tracks');
  const totalAlbumsCount = document.getElementById('total-saved-albums');

  const tracks = libraryData?.tracks?.items || [];
  const albums = libraryData?.albums?.items || [];

  if (totalLikedCount) {
    totalLikedCount.textContent = (libraryData?.tracks?.total || tracks.length).toLocaleString('ja-JP');
  }
  if (totalAlbumsCount) {
    totalAlbumsCount.textContent = (libraryData?.albums?.total || albums.length).toLocaleString('ja-JP');
  }

  // 最新お気に入り楽曲 (直近5件など)
  if (tracksContainer) {
    if (tracks.length === 0) {
      tracksContainer.innerHTML = `<div class="empty-placeholder">保存された楽曲はありません</div>`;
    } else {
      tracksContainer.innerHTML = tracks.slice(0, 8).map(item => {
        const t = item.track || {};
        const img = t.album?.images?.[2]?.url || t.album?.images?.[0]?.url || '';
        const artists = (t.artists || []).map(a => a.name).join(', ');
        return `
          <div class="lib-track-row">
            <img src="${img}" alt="${escapeHtml(t.name)}" class="lib-track-img" />
            <div class="lib-track-info">
              <div class="lib-track-name">${escapeHtml(t.name)}</div>
              <div class="lib-track-artist">${escapeHtml(artists)}</div>
            </div>
            <span class="lib-track-duration">${formatMs(t.duration_ms)}</span>
          </div>
        `;
      }).join('');
    }
  }

  // 保存アルバム一覧
  if (albumsContainer) {
    if (albums.length === 0) {
      albumsContainer.innerHTML = `<div class="empty-placeholder">保存されたアルバムはありません</div>`;
    } else {
      albumsContainer.innerHTML = albums.slice(0, 8).map(item => {
        const a = item.album || {};
        const img = a.images?.[1]?.url || a.images?.[0]?.url || '';
        const artists = (a.artists || []).map(ar => ar.name).join(', ');
        const releaseYear = a.release_date ? a.release_date.slice(0, 4) : '';
        return `
          <div class="album-mini-card">
            <img src="${img}" alt="${escapeHtml(a.name)}" class="album-mini-img" loading="lazy" />
            <div class="album-mini-info">
              <div class="album-mini-name" title="${escapeHtml(a.name)}">${escapeHtml(a.name)}</div>
              <div class="album-mini-artist">${escapeHtml(artists)}</div>
              <div class="album-mini-meta">${releaseYear} • ${a.total_tracks || 0}曲</div>
            </div>
          </div>
        `;
      }).join('');
    }
  }
}

// 6. Playlists: プレイリストレンダリング
export function renderPlaylists(playlistsData) {
  const container = document.getElementById('playlists-grid');
  const countBadge = document.getElementById('playlists-count');
  if (!container) return;

  const items = playlistsData?.items || [];
  if (countBadge) countBadge.textContent = `${items.length}件`;

  if (items.length === 0) {
    container.innerHTML = `<div class="empty-placeholder">プレイリストが見つかりません</div>`;
    return;
  }

  container.innerHTML = items.map(playlist => {
    const img = playlist.images?.[0]?.url || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300';
    const isPublic = playlist.public !== false;
    const isCollab = Boolean(playlist.collaborative);
    const spotifyUrl = playlist.external_urls?.spotify || '#';

    return `
      <div class="playlist-card">
        <div class="playlist-cover-wrap">
          <img src="${img}" alt="${escapeHtml(playlist.name)}" class="playlist-cover" loading="lazy" />
          <a href="${spotifyUrl}" target="_blank" rel="noreferrer" class="playlist-play-btn" title="Spotifyで開く">
            ▶
          </a>
        </div>
        <div class="playlist-details">
          <h4 class="playlist-title" title="${escapeHtml(playlist.name)}">${escapeHtml(playlist.name)}</h4>
          <p class="playlist-desc">${escapeHtml(playlist.description || '')}</p>
          <div class="playlist-badges">
            <span class="pl-badge ${isPublic ? 'badge-public' : 'badge-private'}">
              ${isPublic ? '公開' : '非公開'}
            </span>
            ${isCollab ? '<span class="pl-badge badge-collab">共同</span>' : ''}
            <span class="pl-tracks-count">${playlist.tracks?.total || 0} 曲</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// トースト通知表示
export function showNotification(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type} toast-enter`;
  toast.innerHTML = `
    <span class="toast-icon">${type === 'error' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️'}</span>
    <span class="toast-text">${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-leave');
    setTimeout(() => toast.remove(), 400);
  }, duration);
}
