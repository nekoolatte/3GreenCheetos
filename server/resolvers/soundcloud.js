import SoundCloud from 'soundcloud-scraper';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const client = new SoundCloud.Client();
let cachedKey = null;
let keyExpiry = 0;

async function getApiKey() {
  if (cachedKey && Date.now() < keyExpiry) return cachedKey;
  const Util = SoundCloud.default?.Util || SoundCloud.Util;
  cachedKey = await Util.keygen();
  keyExpiry = Date.now() + 10 * 60 * 1000;
  return cachedKey;
}

async function refreshApiKey() {
  const Util = SoundCloud.default?.Util || SoundCloud.Util;
  cachedKey = await Util.keygen();
  keyExpiry = Date.now() + 10 * 60 * 1000;
  return cachedKey;
}

function mapTrack(track) {
  return {
    id: String(track.id),
    title: track.title,
    artist: track.user?.username || 'Unknown',
    duration: track.duration,
    thumbnail: track.artwork_url?.replace('-large', '-t500x500') || null,
    url: track.permalink_url,
    plays: track.playback_count,
  };
}

export async function searchSoundCloud(query, limit = 50) {
  const key = await getApiKey();
  let allTracks = [];
  let nextUrl = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&client_id=${key}&limit=20&offset=0`;

  while (allTracks.length < limit) {
    const res = await fetch(nextUrl);
    if (!res.ok) break;
    const data = await res.json();
    if (!data.collection?.length) break;
    allTracks.push(...data.collection.map(mapTrack));
    if (!data.next_href) break;
    nextUrl = data.next_href.includes('client_id') ? data.next_href : data.next_href + '&client_id=' + key;
  }

  return allTracks.slice(0, limit);
}

async function resolveStreamFromTranscodings(transcodings, key) {
  const preferred = ['progressive', 'hls', 'encrypted-hls'];
  const sorted = [...transcodings].sort((a, b) => {
    const ai = preferred.indexOf(a.format?.protocol);
    const bi = preferred.indexOf(b.format?.protocol);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  for (const t of sorted) {
    const proto = t.format?.protocol;
    if (!proto) continue;
    if (t.format?.mime_type && !t.format.mime_type.startsWith('audio/')) continue;

    try {
      const res = await fetch(`${t.url}?client_id=${key}`);
      if (!res.ok) continue;
      const data = await res.json();
      if (data.url) return { url: data.url, protocol: proto === 'encrypted-hls' ? 'hls' : proto };
    } catch {}
  }
  return null;
}

async function tryFetchTranscoding(url, key) {
  const attempts = [
    `${url}?client_id=${key}`,
    url,
  ];
  for (const attempt of attempts) {
    try {
      const res = await fetch(attempt, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.url) return data.url;
    } catch {}
  }
  return null;
}

function extractTrackId(url) {
  const match = url.match(/tracks?\/(\d+)/);
  if (match) return match[1];
  return null;
}

async function resolveUrl(url, key) {
  const res = await fetch('https://api-v2.soundcloud.com/resolve?url=' + encodeURIComponent(url) + '&client_id=' + key);
  if (!res.ok) return null;
  return res.json();
}

async function searchBySlug(url, key) {
  const parts = url.replace(/\/+$/, '').split('/');
  const slug = parts[parts.length - 1];
  if (!slug) return null;
  const res = await fetch(`https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(slug)}&client_id=${key}&limit=10`);
  if (!res.ok) return null;
  const data = await res.json();
  const normalizedUrl = url.toLowerCase().replace(/\/+$/, '');
  const match = (data.collection || []).find(t => t.permalink_url?.toLowerCase().replace(/\/+$/, '') === normalizedUrl);
  if (match) {
    const trackRes = await fetch(`https://api-v2.soundcloud.com/tracks/${match.id}?client_id=${key}`);
    if (trackRes.ok) return trackRes.json();
  }
  return null;
}

async function tryYtdlpFallback(url) {
  try {
    const key = await getApiKey();
    const { stdout } = await execFileAsync('yt-dlp', [
      '--no-warnings', '--no-playlist',
      '-f', 'bestaudio/best',
      '-g',
      '--socket-timeout', '15',
      '--extractor-args', `soundcloud:client_id=${key}`,
      url,
    ], { timeout: 20000 });
    const streamUrl = stdout.trim().split('\n')[0];
    if (streamUrl && streamUrl.startsWith('http')) return streamUrl;
  } catch {}
  return null;
}

async function tryYtdlpMetadata(url) {
  try {
    const key = await getApiKey();
    const { stdout } = await execFileAsync('yt-dlp', [
      '--no-warnings', '--no-playlist',
      '--dump-json',
      '--socket-timeout', '15',
      '--extractor-args', `soundcloud:client_id=${key}`,
      url,
    ], { timeout: 20000 });
    return JSON.parse(stdout);
  } catch {}
  return null;
}

export async function resolveSoundCloudStream(url, directId) {
  const trackId = directId || extractTrackId(url);
  let key = await getApiKey();
  let trackData = null;

  if (trackId) {
    const res = await fetch(`https://api-v2.soundcloud.com/tracks/${trackId}?client_id=${key}`);
    if (res.ok) trackData = await res.json();
  } else {
    trackData = await resolveUrl(url, key);
    if (!trackData) trackData = await searchBySlug(url, key);
  }

  if (!trackData || !trackData.media) {
    key = await refreshApiKey();
    if (trackId) {
      const res = await fetch(`https://api-v2.soundcloud.com/tracks/${trackId}?client_id=${key}`);
      if (res.ok) trackData = await res.json();
    } else {
      trackData = await resolveUrl(url, key);
      if (!trackData) trackData = await searchBySlug(url, key);
    }
  }

  if (!trackData || !trackData.media) {
    try {
      const songInfo = await client.getSongInfo(url, { fetchStreamURL: true });
      if (songInfo?.streamURL) {
        return {
          id: String(songInfo.id),
          title: songInfo.title,
          artist: songInfo.author?.name || 'Unknown',
          duration: songInfo.duration,
          thumbnail: songInfo.thumbnail,
          streamUrl: songInfo.streamURL,
          type: 'progressive',
        };
      }
    } catch {}
  }

  if (!trackData) {
    const meta = await tryYtdlpMetadata(url);
    const ytdlpUrl = await tryYtdlpFallback(url);
    if (meta && ytdlpUrl) {
      return {
        id: String(meta.id || trackId || ''),
        title: meta.title || 'Unknown',
        artist: meta.uploader || meta.artist || 'Unknown',
        duration: (meta.duration || 0) * 1000,
        thumbnail: meta.thumbnail || null,
        streamUrl: ytdlpUrl,
        type: 'progressive',
      };
    }
  }

  const transcodings = trackData?.media?.transcodings || [];
  let result = await resolveStreamFromTranscodings(transcodings, key);

  if (!result) {
    key = await refreshApiKey();
    result = await resolveStreamFromTranscodings(transcodings, key);
  }

  if (!result && trackData?.media?.transcodings) {
    for (const t of trackData.media.transcodings) {
      const streamUrl = await tryFetchTranscoding(t.url, key);
      if (streamUrl) {
        const proto = t.format?.protocol;
        result = { url: streamUrl, protocol: proto === 'encrypted-hls' ? 'hls' : proto };
        break;
      }
    }
  }

  if (!result) {
    const ytdlpUrl = await tryYtdlpFallback(trackData?.permalink_url || url);
    if (ytdlpUrl) {
      result = { url: ytdlpUrl, protocol: 'progressive' };
    }
  }

  return {
    id: String(trackData?.id || trackId || ''),
    title: trackData?.title || 'Unknown',
    artist: trackData?.user?.username || 'Unknown',
    duration: trackData?.duration || 0,
    thumbnail: trackData?.artwork_url?.replace('-large', '-t500x500') || null,
    streamUrl: result?.url || null,
    type: result?.protocol || 'hls',
  };
}

export async function searchSoundCloudPlaylists(query, limit = 20) {
  const key = await getApiKey();
  const res = await fetch(`https://api-v2.soundcloud.com/search/playlists?q=${encodeURIComponent(query)}&client_id=${key}&limit=${limit}&offset=0`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.collection || []).map(p => ({
    id: String(p.id),
    title: p.title,
    description: p.description || '',
    artwork: p.artwork_url?.replace('-large', '-t500x500') || null,
    trackCount: p.track_count,
    user: p.user?.username || 'Unknown',
    url: p.permalink_url,
  }));
}

export async function getSoundCloudPlaylistTracks(playlistUrl) {
  const key = await getApiKey();
  const resolved = await resolveUrl(playlistUrl, key);
  if (!resolved || !resolved.tracks) return { playlist: null, tracks: [] };
  const playlist = {
    id: String(resolved.id),
    title: resolved.title,
    description: resolved.description || '',
    artwork: resolved.artwork_url?.replace('-large', '-t500x500') || null,
    trackCount: resolved.track_count,
    user: resolved.user?.username || 'Unknown',
  };

  const fullTracks = [];
  const missingIds = [];
  for (const t of resolved.tracks) {
    if (t && typeof t === 'object' && t.title) {
      fullTracks.push(t);
    } else if (t && t.id) {
      missingIds.push(t.id);
    }
  }

  if (missingIds.length > 0) {
    const batchSize = 50;
    for (let i = 0; i < missingIds.length; i += batchSize) {
      const batch = missingIds.slice(i, i + batchSize);
      try {
        const res = await fetch(`https://api-v2.soundcloud.com/tracks?ids=${batch.join(',')}&client_id=${key}&limit=${batchSize}`);
        if (res.ok) {
          const fetched = await res.json();
          fullTracks.push(...(Array.isArray(fetched) ? fetched : []));
        }
      } catch {}
    }
  }

  const orderedTracks = fullTracks.sort((a, b) => {
    const aIdx = resolved.tracks.findIndex(t => t?.id === a.id);
    const bIdx = resolved.tracks.findIndex(t => t?.id === b.id);
    return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
  });

  const tracks = orderedTracks.filter(t => t && t.title).map(mapTrack);
  return { playlist, tracks };
}

export async function getSoundCloudArtistTracks(artistUrl) {
  const key = await getApiKey();
  const resolved = await resolveUrl(artistUrl, key);
  if (!resolved) return { artist: null, tracks: [] };
  const artist = {
    id: String(resolved.id),
    name: resolved.username || resolved.display_name || 'Unknown',
    avatar: resolved.avatar_url?.replace('-large', '-t500x500') || null,
    trackCount: resolved.track_count,
    followers: resolved.followers_count || 0,
    description: resolved.description || '',
    url: resolved.permalink_url,
  };
  let allTracks = [];
  let nextUrl = `https://api-v2.soundcloud.com/users/${resolved.id}/tracks?client_id=${key}&limit=200&offset=0`;
  while (nextUrl) {
    const tracksRes = await fetch(nextUrl);
    if (!tracksRes.ok) break;
    const tracksData = await tracksRes.json();
    if (!tracksData.collection?.length) break;
    allTracks.push(...tracksData.collection.map(mapTrack));
    if (!tracksData.next_href) break;
    nextUrl = tracksData.next_href.includes('client_id') ? tracksData.next_href : tracksData.next_href + '&client_id=' + key;
  }
  return { artist, tracks: allTracks };
}

export async function searchSoundCloudArtists(query, limit = 10) {
  const key = await getApiKey();
  const res = await fetch(`https://api-v2.soundcloud.com/search/users?q=${encodeURIComponent(query)}&client_id=${key}&limit=${limit}&offset=0`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.collection || []).map(u => ({
    id: String(u.id),
    name: u.username || u.display_name || 'Unknown',
    avatar: u.avatar_url?.replace('-large', '-t500x500') || null,
    trackCount: u.track_count || 0,
    followers: u.followers_count || 0,
    url: u.permalink_url,
  }));
}
