import SoundCloud from 'soundcloud-scraper';

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
  for (const t of transcodings) {
    const proto = t.format?.protocol;
    if (proto !== 'progressive' && proto !== 'hls') continue;
    if (t.format?.mime_type && !t.format.mime_type.startsWith('audio/')) continue;

    try {
      const res = await fetch(`${t.url}?client_id=${key}`);
      if (!res.ok) continue;
      const data = await res.json();
      if (data.url) return { url: data.url, protocol: proto };
    } catch {}
  }
  return null;
}

async function resolveEncryptedHLS(transcodings, key) {
  for (const t of transcodings) {
    const proto = t.format?.protocol;
    if (!proto?.includes('encrypted-hls')) continue;
    if (t.format?.mime_type !== 'audio/mp4; codecs="mp4a.40.2"') continue;
    if (t.quality !== 'sq') continue;

    try {
      const res = await fetch(`${t.url}?client_id=${key}`);
      if (!res.ok) continue;
      const data = await res.json();
      if (data.url) return { url: data.url, protocol: 'hls' };
    } catch {}
  }
  for (const t of transcodings) {
    const proto = t.format?.protocol;
    if (!proto?.includes('encrypted-hls')) continue;
    if (t.format?.mime_type !== 'audio/mp4; codecs="mp4a.40.2"') continue;

    try {
      const res = await fetch(`${t.url}?client_id=${key}`);
      if (!res.ok) continue;
      const data = await res.json();
      if (data.url) return { url: data.url, protocol: 'hls' };
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

export async function resolveSoundCloudStream(url) {
  const trackId = extractTrackId(url);
  let key = await getApiKey();
  let trackData = null;

  if (trackId) {
    const res = await fetch(`https://api-v2.soundcloud.com/tracks/${trackId}?client_id=${key}`);
    if (res.ok) trackData = await res.json();
  } else {
    trackData = await resolveUrl(url, key);
  }

  if (!trackData || !trackData.media) {
    key = await refreshApiKey();
    if (trackId) {
      const res = await fetch(`https://api-v2.soundcloud.com/tracks/${trackId}?client_id=${key}`);
      if (res.ok) trackData = await res.json();
    } else {
      trackData = await resolveUrl(url, key);
    }
  }

  if (!trackData || !trackData.media) {
    const songInfo = await client.getSongInfo(url, { fetchStreamURL: true });
    return {
      id: String(songInfo.id),
      title: songInfo.title,
      artist: songInfo.author?.name || 'Unknown',
      duration: songInfo.duration,
      thumbnail: songInfo.thumbnail,
      streamUrl: songInfo.streamURL || null,
      type: 'hls',
    };
  }

  const transcodings = trackData.media?.transcodings || [];
  let result = await resolveStreamFromTranscodings(transcodings, key);

  if (!result) {
    key = await refreshApiKey();
    result = await resolveStreamFromTranscodings(transcodings, key);
  }

  if (!result) {
    let encResult = await resolveEncryptedHLS(transcodings, key);
    if (!encResult) {
      key = await refreshApiKey();
      encResult = await resolveEncryptedHLS(transcodings, key);
    }
    if (encResult) result = encResult;
  }

  return {
    id: String(trackData.id),
    title: trackData.title,
    artist: trackData.user?.username || 'Unknown',
    duration: trackData.duration,
    thumbnail: trackData.artwork_url?.replace('-large', '-t500x500') || null,
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
  const tracks = resolved.tracks.filter(t => t && t.title).map(mapTrack);
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
  const tracksRes = await fetch(`https://api-v2.soundcloud.com/users/${resolved.id}/tracks?client_id=${key}&limit=50`);
  if (!tracksRes.ok) return { artist, tracks: [] };
  const tracksData = await tracksRes.json();
  const tracks = (tracksData.collection || []).map(mapTrack);
  return { artist, tracks };
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
