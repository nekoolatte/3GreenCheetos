import { YouTube } from 'youtube-sr';

const SPOTIFY_OEMBED = 'https://open.spotify.com/oembed';

async function fetchSpotifyMetadata(url) {
  const res = await fetch(`${SPOTIFY_OEMBED}?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`Spotify oEmbed failed: ${res.status}`);
  const data = await res.json();
  const title = data.title || '';
  const parts = title.split(' - ');
  const artist = parts.length > 1 ? parts[0].trim() : '';
  const track = parts.length > 1 ? parts.slice(1).join(' - ').trim() : title;
  return {
    title: track,
    artist,
    thumbnail: data.thumbnail_url || null,
  };
}

export async function searchSpotify(query, limit = 20) {
  const searchQuery = `${query} audio`;
  const results = await YouTube.search(searchQuery, { limit, type: 'video' });

  return results.map((vid) => ({
    id: vid.id,
    title: vid.title,
    artist: vid.channel?.name || 'Unknown',
    duration: vid.duration || 0,
    thumbnail: vid.thumbnail?.url || null,
    url: vid.url,
    source: 'spotify-proxy',
  }));
}

export async function resolveSpotifyUrl(url) {
  const meta = await fetchSpotifyMetadata(url);

  const searchQuery = meta.artist
    ? `${meta.artist} ${meta.title} audio`
    : `${meta.title} audio`;

  const results = await searchSpotify(searchQuery, 20);
  if (!results.length) throw new Error('No matching audio found for this Spotify track');

  return { ...results[0], title: meta.title, artist: meta.artist, thumbnail: meta.thumbnail || results[0].thumbnail };
}

export async function resolveSpotifyFromSearch(query) {
  const results = await searchSpotify(query, 20);
  if (!results.length) throw new Error('No matching audio found');
  return results[0];
}

export async function searchSpotifyArtists(query, limit = 10) {
  const searchQuery = `${query} music artist`;
  const results = await YouTube.search(searchQuery, { limit, type: 'video' });
  const seen = new Set();
  const artists = [];
  for (const vid of results) {
    const name = vid.channel?.name || vid.uploader?.name || 'Unknown';
    if (seen.has(name)) continue;
    seen.add(name);
    artists.push({
      id: vid.channel?.id || vid.id || '',
      name,
      avatar: vid.channel?.image?.url || vid.channel?.avatar?.url || vid.thumbnail?.url || null,
      trackCount: 0,
      url: vid.channel?.url || vid.url || '',
    });
  }
  return artists;
}

export async function getSpotifyArtistTracks(artistName) {
  const searchQuery = `${artistName} official music`;
  const results = await YouTube.search(searchQuery, { limit: 30, type: 'video' });
  const tracks = results.map((vid) => ({
    id: vid.id,
    title: vid.title,
    artist: artistName,
    duration: vid.duration || 0,
    thumbnail: vid.thumbnail?.url || null,
    url: vid.url,
    source: 'spotify-proxy',
  }));
  return { artist: { name: artistName, avatar: null }, tracks };
}

export async function searchSpotifyPlaylists(query, limit = 20) {
  const searchQuery = `${query} playlist`;
  const results = await YouTube.search(searchQuery, { limit, type: 'video' });
  return [{
    id: `yt-${Date.now()}`,
    title: query + ' - YouTube Mix',
    description: `YouTube results for "${query}"`,
    artwork: results[0]?.thumbnail?.url || null,
    trackCount: results.length,
    user: 'YouTube',
    tracks: results.map((vid) => ({
      id: vid.id,
      title: vid.title,
      artist: vid.channel?.name || 'Unknown',
      duration: vid.duration || 0,
      thumbnail: vid.thumbnail?.url || null,
      url: vid.url,
      source: 'spotify-proxy',
    })),
  }];
}
