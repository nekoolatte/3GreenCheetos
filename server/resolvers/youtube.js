import { YouTube } from 'youtube-sr';
import { Innertube, Platform, Log } from 'youtubei.js';

Log.setLevel(Log.Level.WARNING);

let innertubeInstance = null;

async function getInnertube() {
  if (innertubeInstance) return innertubeInstance;
  Platform.shim.eval = async (data) => {
    const fn = new Function(data.output);
    return fn();
  };
  innertubeInstance = await Innertube.create({
    generate_session_locally: true,
    client_type: 'MWEB',
  });
  return innertubeInstance;
}

export async function searchYouTube(query, limit = 20) {
  const results = await YouTube.search(query, { limit, type: 'video' });
  return results.map((vid) => ({
    id: vid.id,
    title: vid.title,
    artist: vid.channel?.name || 'Unknown',
    duration: vid.duration || 0,
    thumbnail: vid.thumbnail?.url || null,
    url: vid.url,
  }));
}

function extractVideoId(urlOrId) {
  if (/^[a-zA-Z0-9_-]{11}$/.test(urlOrId)) return urlOrId;
  const match = urlOrId.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

async function tryInvidious(videoId) {
  const instances = [
    'https://inv.nadeko.net',
    'https://invidious.fdn.fr',
    'https://vid.puffyan.us',
    'https://invidious.privacyredirect.com',
    'https://y.com.sb',
    'https://inv.tux.pizza',
    'https://invidious.protokoll-11.de',
  ];
  for (const instance of instances) {
    try {
      const res = await fetch(`${instance}/api/v1/videos/${videoId}?fields=title,author,lengthSeconds,adaptiveFormats,videoId`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const audioFormats = (data.adaptiveFormats || []).filter(
        (f) => f.type?.startsWith('audio/') && f.url
      );
      if (!audioFormats.length) continue;
      audioFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      const best = audioFormats[0];
      return {
        id: data.videoId || videoId,
        title: data.title || 'Unknown',
        artist: data.author || 'YouTube',
        duration: (data.lengthSeconds || 0) * 1000,
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        streamUrl: best.url,
        type: best.type?.includes('webm') ? 'webm' : 'mp4',
      };
    } catch {
      continue;
    }
  }
  return null;
}

async function tryYtdlCore(videoUrl) {
  const ytdl = await import('@distube/ytdl-core');
  const info = await ytdl.default.getInfo(videoUrl);
  const format = ytdl.default.chooseFormat(info.formats, { quality: 'highestaudio' });
  if (!format?.url) throw new Error('No format with URL found');
  return {
    id: info.videoDetails.videoId || '',
    title: info.videoDetails.title || 'Unknown',
    artist: info.videoDetails.author?.name || 'YouTube',
    duration: (Number(info.videoDetails.lengthSeconds) || 0) * 1000,
    thumbnail: info.videoDetails.thumbnail?.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${info.videoDetails.videoId}/hqdefault.jpg`,
    streamUrl: format.url,
    type: format.mimeType?.includes('audio/webm') ? 'webm' : 'mp4',
  };
}

async function tryYtDlp(videoUrl) {
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const execFileAsync = promisify(execFile);
  const { stdout } = await execFileAsync('yt-dlp', [
    '-f', 'bestaudio',
    '--dump-json',
    '--no-warnings',
    '--no-playlist',
    videoUrl,
  ], { timeout: 30000 });
  const info = JSON.parse(stdout.trim());
  const streamUrl = info.url || info.request_url;
  if (!streamUrl) throw new Error('No stream URL');
  return {
    id: info.id || '',
    title: info.title || 'Unknown',
    artist: info.uploader || info.channel || 'YouTube',
    duration: (info.duration || 0) * 1000,
    thumbnail: info.thumbnail || `https://i.ytimg.com/vi/${info.id}/hqdefault.jpg`,
    streamUrl,
    type: info.acodec?.includes('opus') ? 'webm' : 'mp4',
  };
}

async function tryYoutubeJs(videoId) {
  const yt = await getInnertube();
  const format = await yt.getStreamingData(videoId, { type: 'audio', quality: 'best' });
  const streamUrl = format.url;
  if (!streamUrl) throw new Error('No stream URL in format');
  const info = await yt.getBasicInfo(videoId);
  return {
    id: videoId,
    title: info.basic_info.title || 'Unknown',
    artist: info.basic_info.channel?.name || 'YouTube',
    duration: (info.basic_info.duration || 0) * 1000,
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    streamUrl,
    type: format.mime_type?.includes('audio/webm') ? 'webm' : 'mp4',
  };
}

export async function resolveYouTubeStream(urlOrId) {
  let videoUrl = urlOrId;
  if (!videoUrl.startsWith('http')) {
    videoUrl = `https://www.youtube.com/watch?v=${videoUrl}`;
  }

  const videoId = extractVideoId(videoUrl) || videoUrl;

  try {
    return await tryYtdlCore(videoUrl);
  } catch {}

  try {
    const invidious = await tryInvidious(videoId);
    if (invidious) return invidious;
  } catch {}

  try {
    return await tryYoutubeJs(videoId);
  } catch {}

  try {
    return await tryYtDlp(videoUrl);
  } catch {}

  throw new Error('All YouTube stream methods failed');
}
