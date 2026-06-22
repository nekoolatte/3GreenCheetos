import express from 'express';
import cors from 'cors';
import { searchSoundCloud, resolveSoundCloudStream, searchSoundCloudPlaylists, getSoundCloudPlaylistTracks, getSoundCloudArtistTracks, searchSoundCloudArtists } from './resolvers/soundcloud.js';
import { searchYouTube, resolveYouTubeStream } from './resolvers/youtube.js';
import { searchSpotify, resolveSpotifyUrl, searchSpotifyArtists, getSpotifyArtistTracks, searchSpotifyPlaylists } from './resolvers/spotify.js';
import authRouter from './auth.js';
import userRouter from './user.js';

const app = express();

app.use(cors({
  origin: [
    'https://nekoolatte.nya.je',
    'https://3-green-cheetos.vercel.app',
    'https://3-green-cheetos-lattesoftware.vercel.app',
    'http://localhost:5173',
    'http://localhost:3001',
  ],
}));
app.use(express.json());

app.use(authRouter);
app.use(userRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/soundcloud/search', async (req, res) => {
  try {
    const { q, limit } = req.query;
    if (!q) return res.status(400).json({ error: 'Missing query param "q"' });
    const results = await searchSoundCloud(q, Number(limit) || 50);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/soundcloud/stream', async (req, res) => {
  try {
    const { url, id } = req.query;
    if (!url && !id) return res.status(400).json({ error: 'Missing query param "url" or "id"' });
    const stream = await resolveSoundCloudStream(url, id);
    res.json(stream);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/youtube/search', async (req, res) => {
  try {
    const { q, limit } = req.query;
    if (!q) return res.status(400).json({ error: 'Missing query param "q"' });
    const results = await searchYouTube(q, Number(limit) || 50);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/youtube/stream', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Missing query param "url"' });
    const stream = await resolveYouTubeStream(url);
    res.json(stream);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/spotify/resolve', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Missing query param "url"' });
    const stream = await resolveSpotifyUrl(url);
    res.json(stream);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/spotify/search', async (req, res) => {
  try {
    const { q, limit } = req.query;
    if (!q) return res.status(400).json({ error: 'Missing query param "q"' });
    const results = await searchSpotify(q, Number(limit) || 50);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/soundcloud/hls-proxy', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Missing query param "url"' });
    const m3u8Res = await fetch(url);
    if (!m3u8Res.ok) return res.status(m3u8Res.status).json({ error: 'Failed to fetch m3u8' });
    let body = await m3u8Res.text();
    const baseUrl = '';
    body = body.replace(/(?:^|\s)((?!#)(?!https:)[^\s]+\.(?:ts|m4s|mp4|cmfv|cmfa)[^\s]*)/gm, (match, segment) => {
      return match.replace(segment, `${baseUrl}/api/soundcloud/segment-proxy?url=${encodeURIComponent(segment)}`);
    });
    body = body.replace(/URI="((?!https:)[^"]+\.(?:ts|m4s|mp4|cmfv|cmfa)[^"]*)"/g, (match, segment) => {
      return match.replace(segment, `${baseUrl}/api/soundcloud/segment-proxy?url=${encodeURIComponent(segment)}`);
    });
    body = body.replace(/URI="(https:[^"]+)"/g, (match, url) => {
      return match.replace(url, `${baseUrl}/api/soundcloud/segment-proxy?url=${encodeURIComponent(url)}`);
    });
    body = body.replace(/^(https:[^\s]+\.(?:ts|m4s|mp4|cmfv|cmfa)[^\s]*)$/gm, (url) => {
      return `${baseUrl}/api/soundcloud/segment-proxy?url=${encodeURIComponent(url)}`;
    });
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(body);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/soundcloud/segment-proxy', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Missing query param "url"' });
    const segRes = await fetch(url);
    if (!segRes.ok) return res.status(segRes.status).json({ error: 'Failed to fetch segment' });
    res.setHeader('Content-Type', segRes.headers.get('content-type') || 'video/mp2t');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const reader = segRes.body.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) { res.end(); return; }
        res.write(value);
      }
    };
    await pump();
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

app.get('/api/download', async (req, res) => {
  try {
    const { url, service, title } = req.query;
    if (!url) return res.status(400).json({ error: 'Missing query param "url"' });

    let streamData;
    if (service === 'soundcloud') {
      streamData = await resolveSoundCloudStream(url);
    } else if (service === 'youtube' || service === 'spotify') {
      streamData = await resolveYouTubeStream(url);
    } else {
      return res.status(400).json({ error: 'Invalid service' });
    }

    if (!streamData?.streamUrl) {
      return res.status(404).json({ error: 'No stream available' });
    }

    const streamUrl = streamData.streamUrl;
    const isHls = streamUrl.includes('.m3u8') || streamUrl.includes('media-streaming.soundcloud.cloud');

    const safeName = (title || 'download').replace(/[^a-zA-Z0-9 _-]/g, '_').substring(0, 100);

    if (isHls) {
      const m3u8Res = await fetch(streamUrl);
      if (!m3u8Res.ok) return res.status(m3u8Res.status).json({ error: 'Failed to fetch HLS playlist' });
      const m3u8Text = await m3u8Res.text();
      const baseUrl = streamUrl.substring(0, streamUrl.lastIndexOf('/') + 1);
      const segmentLines = m3u8Text.split('\n').filter(l => l.trim() && !l.startsWith('#'));
      const segmentUrls = segmentLines.map(line => line.startsWith('http') ? line : baseUrl + line);

      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}.mp3"`);
      res.setHeader('Access-Control-Allow-Origin', '*');

      for (const segUrl of segmentUrls) {
        const segRes = await fetch(segUrl);
        if (!segRes.ok) continue;
        const reader = segRes.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      }
      res.end();
      return;
    }

    const ext = streamUrl.includes('audio/mp4') || streamUrl.includes('.m4a') ? 'm4a' : 'mp3';
    const filename = `${safeName}.${ext}`;

    const upstream = await fetch(streamUrl);
    if (!upstream.ok) return res.status(upstream.status).json({ error: 'Failed to fetch stream' });

    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'audio/mpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Access-Control-Allow-Origin', '*');

    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) { res.end(); return; }
      res.write(value);
    }
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

app.get('/api/soundcloud/playlists', async (req, res) => {
  try {
    const { q, limit } = req.query;
    if (!q) return res.status(400).json({ error: 'Missing query param "q"' });
    res.json(await searchSoundCloudPlaylists(q, Number(limit) || 20));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/soundcloud/playlist-tracks', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Missing query param "url"' });
    res.json(await getSoundCloudPlaylistTracks(url));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/soundcloud/artists', async (req, res) => {
  try {
    const { q, limit } = req.query;
    if (!q) return res.status(400).json({ error: 'Missing query param "q"' });
    res.json(await searchSoundCloudArtists(q, Number(limit) || 10));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/soundcloud/artist-tracks', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Missing query param "url"' });
    res.json(await getSoundCloudArtistTracks(url));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/spotify/playlists', async (req, res) => {
  try {
    const { q, limit } = req.query;
    if (!q) return res.status(400).json({ error: 'Missing query param "q"' });
    res.json(await searchSpotifyPlaylists(q, Number(limit) || 20));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/spotify/artists', async (req, res) => {
  try {
    const { q, limit } = req.query;
    if (!q) return res.status(400).json({ error: 'Missing query param "q"' });
    res.json(await searchSpotifyArtists(q, Number(limit) || 10));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/spotify/artist-tracks', async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) return res.status(400).json({ error: 'Missing query param "name"' });
    res.json(await getSpotifyArtistTracks(name));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default app;
