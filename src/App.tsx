import { useState, useRef, useCallback, useEffect } from 'react';
import Hls from 'hls.js';

type Service = 'soundcloud' | 'youtube' | 'spotify';
type ViewMode = 'search' | 'artist' | 'playlist' | 'favorites' | 'playlists';
type SearchTab = 'tracks' | 'artists' | 'playlists';

interface Track {
  id: string;
  title: string;
  artist: string;
  duration: number;
  thumbnail: string | null;
  url?: string;
  streamUrl?: string;
}

interface Artist {
  id: string;
  name: string;
  avatar: string | null;
  trackCount: number;
  followers?: number;
  url?: string;
}

interface Playlist {
  id: number;
  name: string;
  description?: string;
  trackCount?: number;
  artwork?: string | null;
  user?: string;
  tracks?: Track[];
}

interface User {
  id: number;
  email?: string;
  username: string;
  discord_id?: string;
  discord_username?: string;
  discord_avatar?: string;
}

const SERVICES: Record<Service, { name: string; color: string }> = {
  soundcloud: { name: 'SoundCloud', color: '#FF5500' },
  youtube: { name: 'YouTube Music', color: '#FF0000' },
  spotify: { name: 'Spotify', color: '#1DB954' },
};

const isElectron = !!(window as any).electronAPI;
const API = (import.meta.env.VITE_API_URL as string) || '';

function getToken(): string | null {
  return localStorage.getItem('token');
}

function setToken(token: string): void {
  localStorage.setItem('token', token);
}

function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function SearchIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  );
}

function PrevIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
    </svg>
  );
}

function NextIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
    </svg>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg className="w-5 h-5" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

function PlaylistIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
    </svg>
  );
}

function VolumeIcon({ volume }: { volume: number }) {
  if (volume === 0) {
    return (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
      </svg>
    );
  }
  if (volume < 0.5) {
    return (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
    </svg>
  );
}

function MusicNoteIcon() {
  return (
    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
    </svg>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authDisplayName, setAuthDisplayName] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [activeService, setActiveService] = useState<Service>('youtube');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchTab, setSearchTab] = useState<SearchTab>('tracks');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [scArtists, setScArtists] = useState<Artist[]>([]);
  const [spArtists, setSpArtists] = useState<Artist[]>([]);
  const [scPlaylists, setScPlaylists] = useState<Playlist[]>([]);
  const [spPlaylists, setSpPlaylists] = useState<Playlist[]>([]);

  const [view, setView] = useState<ViewMode>('search');
  const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);
  const [artistTracks, setArtistTracks] = useState<Track[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<Track[]>([]);

  const [favorites, setFavorites] = useState<any[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [activePlaylistId, setActivePlaylistId] = useState<number | null>(null);
  const [userPlaylistTracks, setUserPlaylistTracks] = useState<Track[]>([]);
  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [addTrackToPlaylist, setAddTrackToPlaylist] = useState<Track | null>(null);

  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const activeServiceRef = useRef(activeService);
  const viewRef = useRef(view);
  const currentTrackRef = useRef(currentTrack);
  const isPlayingRef = useRef(isPlaying);
  const userRef = useRef(user);
  const volumeRef = useRef(volume);

  activeServiceRef.current = activeService;
  viewRef.current = view;
  currentTrackRef.current = currentTrack;
  isPlayingRef.current = isPlaying;
  userRef.current = user;
  volumeRef.current = volume;

  const getAudio = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    return audioRef.current;
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      setToken(token);
      window.history.replaceState({}, '', window.location.pathname);
      window.location.reload();
    }
  }, []);

  useEffect(() => {
    const t = getToken();
    if (!t) return;
    fetch(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${t}` } })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(u => setUser(u))
      .catch(() => { localStorage.removeItem('token'); });
  }, []);

  useEffect(() => {
    if (!user) return;
    fetch(`${API}/api/favorites`, { headers: authHeaders() })
      .then(r => r.json())
      .then(setFavorites)
      .catch(() => {});
    fetch(`${API}/api/playlists`, { headers: authHeaders() })
      .then(r => r.json())
      .then(setPlaylists)
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    const audio = getAudio();
    const onTimeUpdate = () => setProgress(audio.currentTime * 1000);
    const onLoadedMetadata = () => setDuration(audio.duration * 1000);
    const onEnded = () => {
      setIsPlaying(false);
      setDiscord(null, activeServiceRef.current, false);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, [getAudio]);

  useEffect(() => {
    const audio = getAudio();
    audio.volume = volumeRef.current;
  }, []);

  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, []);

  const isFavorited = useCallback((trackId: string) => {
    return favorites.some(f => f.track_id === trackId);
  }, [favorites]);

  const toggleFavorite = useCallback(async (track: Track) => {
    if (!userRef.current) { setShowAuth(true); return; }
    const svc = activeServiceRef.current;
    if (isFavorited(track.id)) {
      await fetch(`${API}/api/favorites?track_id=${encodeURIComponent(track.id)}&service=${svc}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      setFavorites(prev => prev.filter(f => !(f.track_id === track.id && f.service === svc)));
    } else {
      await fetch(`${API}/api/favorites`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_id: track.id, title: track.title, artist: track.artist, thumbnail: track.thumbnail, url: track.url, service: svc, duration: track.duration }),
      });
      setFavorites(prev => [...prev, { track_id: track.id, title: track.title, artist: track.artist, thumbnail: track.thumbnail, url: track.url, service: svc, duration: track.duration }]);
    }
  }, [isFavorited]);

  const setDiscord = useCallback((track: Track | null, service: Service, playing: boolean) => {
    if (!isElectron) return;
    const api = (window as any).electronAPI;
    if (api?.setDiscordPresence) {
      if (playing && track) {
        api.setDiscordPresence({ title: track.title, artist: track.artist, thumbnail: track.thumbnail, service });
      } else {
        api.clearDiscordPresence();
      }
    }
  }, []);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    setError(null);
    setTracks([]);
    setScArtists([]);
    setSpArtists([]);
    setScPlaylists([]);
    setSpPlaylists([]);
    setView('search');
    setSelectedArtist(null);
    setSelectedPlaylist(null);
    try {
      const q = encodeURIComponent(searchQuery);
      const endpoints: Record<Service, string> = {
        soundcloud: `${API}/api/soundcloud/search?q=${q}`,
        youtube: `${API}/api/youtube/search?q=${q}`,
        spotify: `${API}/api/spotify/search?q=${q}`,
      };
      const artistEndpoints: string[] = [];
      const playlistEndpoints: string[] = [];

      if (activeService === 'soundcloud') {
        artistEndpoints.push(`${API}/api/soundcloud/artists?q=${q}`);
        playlistEndpoints.push(`${API}/api/soundcloud/playlists?q=${q}`);
      } else if (activeService === 'spotify') {
        artistEndpoints.push(`${API}/api/spotify/artists?q=${q}`);
        playlistEndpoints.push(`${API}/api/spotify/playlists?q=${q}`);
      }

      const trackRes = await fetch(endpoints[activeService]);
      if (!trackRes.ok) throw new Error(`Search failed (${trackRes.status})`);
      const trackData = await trackRes.json();
      if (trackData.error) throw new Error(trackData.error);
      setTracks(trackData);

      const artistResults = await Promise.allSettled(
        artistEndpoints.map(url => fetch(url).then(r => r.json()))
      );
      const playlistResults = await Promise.allSettled(
        playlistEndpoints.map(url => fetch(url).then(r => r.json()))
      );

      if (activeService === 'soundcloud') {
        const artistData = artistResults[0]?.status === 'fulfilled' ? artistResults[0].value : [];
        if (Array.isArray(artistData)) setScArtists(artistData);
        const plData = playlistResults[0]?.status === 'fulfilled' ? playlistResults[0].value : [];
        if (Array.isArray(plData)) setScPlaylists(plData);
      } else if (activeService === 'youtube') {
        const plData = playlistResults[0]?.status === 'fulfilled' ? playlistResults[0].value : [];
        if (Array.isArray(plData)) setSpPlaylists(plData);
      } else if (activeService === 'spotify') {
        const artistData = artistResults[0]?.status === 'fulfilled' ? artistResults[0].value : [];
        if (Array.isArray(artistData)) setSpArtists(artistData);
        const plData = playlistResults[0]?.status === 'fulfilled' ? playlistResults[0].value : [];
        if (Array.isArray(plData)) setSpPlaylists(plData);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, activeService]);

  const loadArtistTracks = useCallback(async (artist: Artist) => {
    setLoading(true);
    setError(null);
    setSelectedArtist(artist);
    setArtistTracks([]);
    setView('artist');
    try {
      let endpoint = '';
      if (scArtists.some(a => a.id === artist.id)) {
        endpoint = `${API}/api/soundcloud/artist-tracks?url=${encodeURIComponent(artist.url || '')}`;
      } else if (spArtists.some(a => a.id === artist.id)) {
        endpoint = `${API}/api/spotify/artist-tracks?name=${encodeURIComponent(artist.name)}`;
      }
      if (!endpoint) throw new Error('Cannot load tracks for this artist');
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error(`Failed to load artist tracks (${res.status})`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setArtistTracks(Array.isArray(data) ? data : data.tracks || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [scArtists, spArtists]);

  const loadPlaylistTracks = useCallback(async (playlist: Playlist) => {
    setLoading(true);
    setError(null);
    setSelectedPlaylist(playlist);
    setPlaylistTracks([]);
    setView('playlist');
    try {
      if (scPlaylists.some(p => p.id === playlist.id)) {
        const endpoint = `${API}/api/soundcloud/playlist-tracks?url=${encodeURIComponent((playlist as any).url || '')}`;
        const res = await fetch(endpoint);
        if (!res.ok) throw new Error(`Failed to load playlist (${res.status})`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setPlaylistTracks(Array.isArray(data) ? data : data.tracks || []);
      } else {
        setPlaylistTracks(playlist.tracks || []);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [scPlaylists]);

  const loadFavorites = useCallback(() => {
    setView('favorites');
    setSelectedArtist(null);
    setSelectedPlaylist(null);
  }, []);

  const loadUserPlaylists = useCallback(() => {
    setView('playlists');
    setSelectedArtist(null);
    setSelectedPlaylist(null);
  }, []);

  const loadUserPlaylist = useCallback(async (playlistId: number) => {
    setLoading(true);
    setActivePlaylistId(playlistId);
    setUserPlaylistTracks([]);
    try {
      const res = await fetch(`${API}/api/playlists/${playlistId}/tracks`, { headers: authHeaders() });
      const data = await res.json();
      setUserPlaylistTracks(Array.isArray(data) ? data.map((t: any) => ({
        id: t.track_id,
        title: t.title,
        artist: t.artist,
        thumbnail: t.thumbnail,
        url: t.url,
        duration: t.duration,
      })) : []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const createPlaylist = useCallback(async () => {
    if (!newPlaylistName.trim()) return;
    const res = await fetch(`${API}/api/playlists`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newPlaylistName }),
    });
    const p = await res.json();
    setPlaylists(prev => [p, ...prev]);
    setNewPlaylistName('');
    setShowCreatePlaylist(false);
  }, [newPlaylistName]);

  const addToPlaylist = useCallback(async (playlistId: number, track: Track) => {
    if (!userRef.current) { setShowAuth(true); return; }
    const svc = activeServiceRef.current;
    await fetch(`${API}/api/playlists/${playlistId}/tracks`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ track_id: track.id, title: track.title, artist: track.artist, thumbnail: track.thumbnail, url: track.url, service: svc, duration: track.duration }),
    });
    if (activePlaylistId === playlistId) {
      loadUserPlaylist(playlistId);
    }
    setAddTrackToPlaylist(null);
  }, [activePlaylistId, loadUserPlaylist]);

  const playTrack = useCallback(
    async (track: Track) => {
      setLoading(true);
      setError(null);
      try {
        let streamUrl = track.streamUrl;

        if (!streamUrl) {
          const svc = activeServiceRef.current;
          const endpoints: Record<Service, string> = {
            soundcloud: `${API}/api/soundcloud/stream?url=${encodeURIComponent(track.url || '')}`,
            youtube: `${API}/api/youtube/stream?url=${encodeURIComponent(track.url || `https://www.youtube.com/watch?v=${track.id}`)}`,
            spotify: `${API}/api/youtube/stream?url=${encodeURIComponent(track.url || `https://www.youtube.com/watch?v=${track.id}`)}`,
          };
          const res = await fetch(endpoints[svc]);
          if (!res.ok) throw new Error(`Stream resolve failed (${res.status})`);
          const data = await res.json();
          if (data.error) throw new Error(data.error);
          streamUrl = data.streamUrl;
          if (!streamUrl) throw new Error('No stream URL returned');
        }

        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }

        const audio = getAudio();
        const isHls = streamUrl.includes('.m3u8') || streamUrl.includes('media-streaming.soundcloud.cloud');
        if (isHls && Hls.isSupported()) {
          const proxiedUrl = `${API}/api/soundcloud/hls-proxy?url=${encodeURIComponent(streamUrl)}`;
          const hls = new Hls();
          hlsRef.current = hls;
          hls.loadSource(proxiedUrl);
          hls.attachMedia(audio);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            audio.play().catch(() => {});
          });
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) {
              setError('HLS playback failed');
            }
          });
        } else if (isHls && audio.canPlayType('application/vnd.apple.mpegurl')) {
          audio.src = streamUrl;
          await audio.play();
        } else {
          audio.src = streamUrl;
          await audio.play();
        }

        const fullTrack = { ...track, streamUrl };
        setCurrentTrack(fullTrack);
        setIsPlaying(true);
        setDiscord(fullTrack, activeServiceRef.current, true);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [getAudio, setDiscord]
  );

  const togglePlay = useCallback(() => {
    const audio = getAudio();
    if (isPlayingRef.current) {
      audio.pause();
      setIsPlaying(false);
      setDiscord(null, activeServiceRef.current, false);
    } else {
      audio.play().catch(() => {});
      setIsPlaying(true);
      if (currentTrackRef.current) setDiscord(currentTrackRef.current, activeServiceRef.current, true);
    }
  }, [getAudio, setDiscord]);

  const playPrev = useCallback(() => {
    const audio = getAudio();
    audio.currentTime = Math.max(0, audio.currentTime - 10);
  }, [getAudio]);

  const playNext = useCallback(() => {
    const audio = getAudio();
    audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 10);
  }, [getAudio]);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = getAudio();
    if (duration) {
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      audio.currentTime = (pct * duration) / 1000;
      setProgress(pct * duration);
    }
  }, [duration, getAudio]);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setVolume(v);
    const audio = getAudio();
    audio.volume = v;
  }, [getAudio]);

  const handleDownload = useCallback((track: Track) => {
    const svc = activeServiceRef.current;
    const trackUrl = track.url || `https://www.youtube.com/watch?v=${track.id}`;
    const params = new URLSearchParams({ url: trackUrl, service: svc, title: track.title });
    window.open(`${API}/api/download?${params.toString()}`, '_blank');
  }, []);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = authMode === 'login'
        ? { email: authEmail, password: authPassword }
        : { email: authEmail, password: authPassword, username: authDisplayName };
      const res = await fetch(`${API}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setToken(data.token);
      window.location.reload();
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const displayFavorites = favorites.map(f => ({
    id: f.track_id,
    title: f.title,
    artist: f.artist,
    thumbnail: f.thumbnail,
    url: f.url,
    duration: f.duration,
  }));

  const allArtists = [...scArtists, ...spArtists];
  const allPlaylists = [...scPlaylists, ...spPlaylists];

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white overflow-hidden font-sans">
      {showAuth && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50" onClick={() => setShowAuth(false)}>
          <div className="animate-slide-up bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-3xl p-10 w-full max-w-md shadow-2xl shadow-black/50 relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowAuth(false)} className="absolute top-5 right-5 w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/30 hover:text-white transition-all duration-200">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="text-center mb-8">
              <img src={`${import.meta.env.BASE_URL}icon.jpg`} alt="" className="w-16 h-16 rounded-2xl mx-auto mb-4 shadow-lg shadow-green-500/20" />
              <h2 className="text-2xl font-bold mb-1">{authMode === 'login' ? 'Welcome Back' : 'Create Account'}</h2>
              <p className="text-white/40 text-sm">3 Green Cheetos Music Player</p>
            </div>

            {authError && <div className="mb-5 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{authError}</div>}

            <form onSubmit={handleAuthSubmit} className="space-y-3">
              <input
                type="email"
                placeholder="Email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-white placeholder-white/25 outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/20 transition-all duration-200"
              />
              {authMode === 'register' && (
                <input
                  type="text"
                  placeholder="Display Name"
                  value={authDisplayName}
                  onChange={(e) => setAuthDisplayName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-white placeholder-white/25 outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/20 transition-all duration-200"
                />
              )}
              <input
                type="password"
                placeholder="Password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-white placeholder-white/25 outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/20 transition-all duration-200"
              />
              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-50 font-semibold text-sm transition-all duration-200 shadow-lg shadow-green-600/20 hover:shadow-green-500/30"
              >
                {authLoading ? '...' : authMode === 'login' ? 'Login' : 'Register'}
              </button>
            </form>

            <div className="mt-4 text-center text-sm text-white/40">
              {authMode === 'login' ? (
                <>Don't have an account? <button onClick={() => { setAuthMode('register'); setAuthError(''); }} className="text-green-400 hover:text-green-300 transition-colors">Register</button></>
              ) : (
                <>Already have an account? <button onClick={() => { setAuthMode('login'); setAuthError(''); }} className="text-green-400 hover:text-green-300 transition-colors">Login</button></>
              )}
            </div>
          </div>
        </div>
      )}

      {addTrackToPlaylist && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 transition-all duration-200" onClick={() => setAddTrackToPlaylist(null)}>
          <div className="animate-slide-up bg-gray-900/95 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-6 w-full max-w-sm shadow-2xl shadow-black/50" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">Add to Playlist</h3>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {playlists.map(p => (
                <button
                  key={p.id}
                  onClick={() => addToPlaylist(p.id, addTrackToPlaylist)}
                  className="w-full text-left px-4 py-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] text-white/70 hover:text-white transition-all duration-200"
                >
                  {p.name}
                </button>
              ))}
              {playlists.length === 0 && <p className="text-sm text-white/20">No playlists yet</p>}
            </div>
            <button onClick={() => setAddTrackToPlaylist(null)} className="mt-4 w-full py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white/45 text-sm transition-all duration-200">Cancel</button>
          </div>
        </div>
      )}

      <header className="h-16 flex items-center gap-5 px-6 bg-gray-900/40 backdrop-blur-xl border-b border-white/[0.04] flex-shrink-0 z-10">
        <div className="flex items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}icon.jpg`} alt="icon" className="w-9 h-9 rounded-xl shadow-md shadow-black/30 ring-1 ring-white/[0.06]" />
          <span className="text-lg font-bold whitespace-nowrap bg-gradient-to-r from-green-400 to-green-600 bg-clip-text text-transparent">3 Green Cheetos</span>
        </div>

        <div className="flex-1 max-w-2xl mx-4">
          <div className="relative">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-white/20">
              <SearchIcon />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
              placeholder="Search for music..."
              className="w-full pl-12 pr-5 py-2.5 rounded-full bg-white/[0.03] border border-white/[0.05] text-white placeholder-white/20 outline-none focus:border-green-500/40 focus:bg-white/[0.05] focus:shadow-[0_0_0_3px_rgba(34,197,94,0.08)] transition-all duration-300 text-sm"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-3">
              {user.discord_avatar ? (
                <img src={user.discord_avatar} alt="" className="w-8 h-8 rounded-full border border-white/10" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-sm font-bold">
                  {user.username[0]?.toUpperCase()}
                </div>
              )}
              <span className="text-sm text-white/60 hidden md:block">{user.discord_username || user.username}</span>
              <button
                onClick={() => { localStorage.removeItem('token'); window.location.reload(); }}
                className="text-xs text-white/30 hover:text-white/60 transition-colors"
              >
                Logout
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAuth(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-white/50 hover:text-white text-sm transition-all duration-200"
            >
              <UserIcon />
              <span className="hidden sm:inline">Login</span>
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside className="w-[280px] bg-gray-900/30 border-r border-white/[0.04] flex flex-col overflow-hidden flex-shrink-0 backdrop-blur-sm">
          <div className="p-4 flex-1 overflow-y-auto space-y-0.5">
            <div className="text-[10px] text-white/20 uppercase tracking-[0.15em] px-4 py-2 font-semibold">Services</div>
            {(Object.keys(SERVICES) as Service[]).map((key) => (
              <button
                key={key}
                onClick={() => {
                  setActiveService(key);
                  setTracks([]);
                  setScArtists([]);
                  setSpArtists([]);
                  setScPlaylists([]);
                  setSpPlaylists([]);
                  setError(null);
                  setView('search');
                  setActivePlaylistId(null);
                  setUserPlaylistTracks([]);
                }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  view === 'search' && activeService === key
                    ? 'bg-white/[0.06] text-white shadow-sm ring-1 ring-white/[0.04]'
                    : 'text-white/40 hover:bg-white/[0.03] hover:text-white/70'
                }`}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0 shadow-sm" style={{ backgroundColor: SERVICES[key].color }} />
                {SERVICES[key].name}
              </button>
            ))}

            {user && (
              <>
                <div className="text-[10px] text-white/20 uppercase tracking-[0.15em] px-4 py-2 mt-4 font-semibold">Library</div>
                <button
                  onClick={loadFavorites}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-all duration-200 ${
                    view === 'favorites' ? 'bg-white/[0.06] text-white ring-1 ring-white/[0.04]' : 'text-white/40 hover:bg-white/[0.03] hover:text-white/70'
                  }`}
                >
                  <span className="text-red-400">
                    <HeartIcon filled={true} />
                  </span>
                  Favorites
                </button>
                <button
                  onClick={loadUserPlaylists}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-all duration-200 ${
                    view === 'playlists' ? 'bg-white/[0.06] text-white ring-1 ring-white/[0.04]' : 'text-white/40 hover:bg-white/[0.03] hover:text-white/70'
                  }`}
                >
                  <span className="text-green-400">
                    <PlaylistIcon />
                  </span>
                  Playlists
                </button>

                {view === 'playlists' && (
                  <div className="ml-3 space-y-0.5 mt-1">
                    <button
                      onClick={() => setShowCreatePlaylist(true)}
                      className="w-full text-left px-4 py-2 rounded-lg text-sm text-green-400/70 hover:text-green-400 hover:bg-white/[0.03] transition-all duration-200"
                    >
                      + New Playlist
                    </button>
                    {showCreatePlaylist && (
                      <div className="px-2 py-1">
                        <input
                          type="text"
                          placeholder="Playlist name"
                          value={newPlaylistName}
                          onChange={(e) => setNewPlaylistName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') createPlaylist(); if (e.key === 'Escape') setShowCreatePlaylist(false); }}
                          className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-white text-sm placeholder-white/25 outline-none focus:border-green-500/50 transition-all duration-200"
                          autoFocus
                        />
                      </div>
                    )}
                    {playlists.map(p => (
                      <button
                        key={p.id}
                        onClick={() => loadUserPlaylist(p.id)}
                        className={`w-full text-left px-4 py-2 rounded-lg text-sm transition-all duration-200 ${
                          activePlaylistId === p.id ? 'bg-white/[0.06] text-white' : 'text-white/35 hover:text-white/60 hover:bg-white/[0.03]'
                        }`}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </aside>

        <main className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-6">
            {error && (
              <div className="mb-6 px-4 py-3 rounded-xl bg-red-500/[0.08] border border-red-500/15 text-red-400 text-sm backdrop-blur-sm">
                {error}
              </div>
            )}

            {view === 'search' && (
              <div>
                {tracks.length === 0 && !loading && allArtists.length === 0 && allPlaylists.length === 0 && !error && (
                  <div className="flex flex-col items-center justify-center py-24 text-white/15">
                    <div className="w-24 h-24 rounded-3xl bg-white/[0.03] flex items-center justify-center mb-5 ring-1 ring-white/[0.06]">
                      <MusicNoteIcon />
                    </div>
                    <p className="text-xl font-semibold mb-1.5">Search for music</p>
                    <p className="text-sm text-white/20">Find tracks on {SERVICES[activeService].name}</p>
                  </div>
                )}

                {(tracks.length > 0 || allArtists.length > 0 || allPlaylists.length > 0) && (
                  <>
                    <div className="flex items-center gap-2 mb-8">
                      {(['tracks', 'artists', 'playlists'] as SearchTab[]).map((tab) => (
                        <button
                          key={tab}
                          onClick={() => setSearchTab(tab)}
                          className={`px-6 py-2.5 rounded-full text-sm font-medium transition-all duration-200 capitalize ${
                            searchTab === tab
                              ? 'bg-green-500 text-white shadow-lg shadow-green-500/25'
                              : 'bg-white/[0.04] text-white/40 hover:bg-white/[0.08] hover:text-white/70'
                          }`}
                        >
                          {tab} {tab === 'artists' ? `(${allArtists.length})` : tab === 'playlists' ? `(${allPlaylists.length})` : `(${tracks.length})`}
                        </button>
                      ))}
                    </div>

                    {searchTab === 'tracks' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                        {tracks.map((track, i) => (
                          <div
                            key={track.id}
                            className={`animate-fade-in group bg-gradient-to-b from-white/[0.04] to-transparent hover:from-white/[0.07] rounded-2xl p-3.5 transition-all duration-300 hover:shadow-lg hover:shadow-black/20 cursor-pointer ${
                              currentTrack?.id === track.id ? 'ring-2 ring-green-500/40 bg-green-500/5' : ''
                            }`}
                            style={{ animationDelay: `${Math.min(i * 40, 300)}ms` }}
                            onClick={() => playTrack(track)}
                          >
                            <div className="relative mb-3 rounded-xl overflow-hidden">
                              {track.thumbnail ? (
                                <img src={track.thumbnail} alt="" className="w-full aspect-square object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                              ) : (
                                <div className="w-full aspect-square bg-white/[0.03] flex items-center justify-center">
                                  <MusicNoteIcon />
                                </div>
                              )}
                              <button
                                onClick={(e) => { e.stopPropagation(); playTrack(track); }}
                                className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-all duration-300"
                              >
                                <div className="w-14 h-14 rounded-full bg-green-500 flex items-center justify-center shadow-xl shadow-green-500/30 transform scale-75 group-hover:scale-100 transition-transform duration-300">
                                  <PlayIcon />
                                </div>
                              </button>
                            </div>
                            <div className="min-w-0 mb-2 px-1">
                              <div className="text-sm font-semibold truncate text-white/90">{track.title}</div>
                              <div className="text-xs text-white/40 truncate mt-0.5">{track.artist}</div>
                            </div>
                            <div className="flex items-center justify-between px-1">
                              <span className="text-xs text-white/25">{formatTime(track.duration)}</span>
                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleFavorite(track); }}
                                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 ${
                                    isFavorited(track.id)
                                      ? 'text-red-400 hover:text-red-300'
                                      : 'text-white/25 hover:text-red-400 hover:bg-white/[0.06]'
                                  }`}
                                >
                                  <HeartIcon filled={isFavorited(track.id)} />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setAddTrackToPlaylist(track); }}
                                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white/25 hover:text-green-400 hover:bg-white/[0.06] transition-all duration-200"
                                  title="Add to playlist"
                                >
                                  <PlaylistIcon />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDownload(track); }}
                                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white/25 hover:text-green-400 hover:bg-white/[0.06] transition-all duration-200"
                                  title="Download"
                                >
                                  <DownloadIcon />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {searchTab === 'artists' && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
                        {allArtists.map((artist, i) => (
                          <button
                            key={artist.id}
                            onClick={() => loadArtistTracks(artist)}
                            className="animate-fade-in group bg-gradient-to-b from-white/[0.03] to-transparent hover:from-white/[0.06] rounded-2xl p-3.5 transition-all duration-300 hover:shadow-lg hover:shadow-black/20 text-left"
                            style={{ animationDelay: `${Math.min(i * 50, 400)}ms` }}
                          >
                            <div className="relative mb-3">
                              <div className="w-full aspect-square rounded-full overflow-hidden bg-white/[0.03] ring-1 ring-white/[0.06] shadow-lg group-hover:shadow-xl transition-shadow duration-300">
                                {artist.avatar ? (
                                  <img src={artist.avatar} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-white/15">
                                    <UserIcon />
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="text-sm font-semibold truncate text-white/75 group-hover:text-white transition-colors duration-200 mb-1 text-center">{artist.name}</div>
                            <div className="text-xs text-white/25 text-center">{artist.trackCount} tracks</div>
                          </button>
                        ))}
                      </div>
                    )}

                    {searchTab === 'playlists' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                        {allPlaylists.map((playlist, i) => (
                          <button
                            key={playlist.id}
                            onClick={() => loadPlaylistTracks(playlist)}
                            className="animate-fade-in group bg-gradient-to-b from-white/[0.03] to-transparent hover:from-white/[0.06] rounded-2xl p-3.5 transition-all duration-300 hover:shadow-lg hover:shadow-black/20 text-left"
                            style={{ animationDelay: `${Math.min(i * 50, 400)}ms` }}
                          >
                            <div className="relative mb-3 rounded-xl overflow-hidden shadow-md shadow-black/20">
                              {playlist.artwork ? (
                                <img src={playlist.artwork} alt="" className="w-full aspect-square object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                              ) : (
                                <div className="w-full aspect-square bg-white/[0.03] flex items-center justify-center ring-1 ring-white/[0.06]">
                                  <PlaylistIcon />
                                </div>
                              )}
                            </div>
                            <div className="px-1">
                              <div className="text-sm font-semibold truncate text-white/75 group-hover:text-white transition-colors duration-200">{playlist.name}</div>
                              <div className="text-xs text-white/25 mt-1">{playlist.trackCount || 0} tracks{playlist.user ? ` · ${playlist.user}` : ''}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {view === 'artist' && selectedArtist && (
              <div>
                <button
                  onClick={() => { setView('search'); setSelectedArtist(null); }}
                  className="flex items-center gap-2 text-white/35 hover:text-white mb-6 transition-colors duration-200 text-sm"
                >
                  <BackIcon />
                  Back to search
                </button>

                <div className="flex items-end gap-8 mb-10">
                  <div className="w-52 h-52 rounded-3xl overflow-hidden bg-white/[0.03] flex-shrink-0 shadow-2xl shadow-black/40 ring-1 ring-white/[0.06]">
                    {selectedArtist.avatar ? (
                      <img src={selectedArtist.avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/15">
                        <UserIcon />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-white/35 uppercase tracking-widest font-semibold mb-2">Artist</p>
                    <h1 className="text-5xl font-extrabold mb-3 truncate tracking-tight">{selectedArtist.name}</h1>
                    <p className="text-sm text-white/35">{selectedArtist.trackCount} tracks</p>
                    {artistTracks.length > 0 && (
                      <button
                        onClick={() => playTrack(artistTracks[0])}
                        className="mt-5 px-7 py-3.5 rounded-full bg-green-500 hover:bg-green-400 font-semibold text-sm transition-all duration-200 flex items-center gap-2.5 shadow-lg shadow-green-500/25 hover:shadow-green-500/40 hover:scale-[1.02] active:scale-[0.98]"
                      >
                        <PlayIcon /> Play All
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-0.5">
                  {artistTracks.map((track, i) => (
                    <div
                      key={track.id}
                      className={`animate-fade-in flex items-center gap-4 px-4 py-2.5 rounded-xl transition-all duration-200 group ${
                        currentTrack?.id === track.id
                          ? 'bg-green-500/10 text-green-300'
                          : 'hover:bg-white/[0.04] text-white/70 hover:text-white'
                      }`}
                      style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
                    >
                      <span className="text-sm text-white/15 w-6 text-center tabular-nums group-hover:hidden">{i + 1}</span>
                      <button onClick={() => playTrack(track)} className="w-6 text-center hidden group-hover:block">
                        <svg className="w-4 h-4 mx-auto" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                      </button>
                      <button onClick={() => playTrack(track)} className="flex-1 flex items-center gap-4 min-w-0 text-left">
                        {track.thumbnail ? (
                          <img src={track.thumbnail} alt="" className="w-11 h-11 rounded-lg object-cover flex-shrink-0 shadow-sm" loading="lazy" />
                        ) : (
                          <div className="w-11 h-11 rounded-lg bg-white/[0.03] flex items-center justify-center flex-shrink-0">
                            <MusicNoteIcon />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm truncate">{track.title}</div>
                          <div className="text-xs text-white/35 truncate">{track.artist}</div>
                        </div>
                        <span className="text-xs text-white/20 tabular-nums">{formatTime(track.duration)}</span>
                      </button>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleFavorite(track); }}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                            isFavorited(track.id) ? 'text-red-400' : 'text-white/30 hover:text-red-400'
                          }`}
                        >
                          <HeartIcon filled={isFavorited(track.id)} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDownload(track); }}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-green-400 transition-all"
                        >
                          <DownloadIcon />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {view === 'playlist' && selectedPlaylist && (
              <div>
                <button
                  onClick={() => { setView('search'); setSelectedPlaylist(null); }}
                  className="flex items-center gap-2 text-white/35 hover:text-white mb-6 transition-colors duration-200 text-sm"
                >
                  <BackIcon />
                  Back to search
                </button>

                <div className="flex items-end gap-8 mb-10">
                  <div className="w-52 h-52 rounded-3xl overflow-hidden bg-white/[0.03] flex-shrink-0 shadow-2xl shadow-black/40 ring-1 ring-white/[0.06]">
                    {selectedPlaylist.artwork ? (
                      <img src={selectedPlaylist.artwork} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/15">
                        <PlaylistIcon />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-white/35 uppercase tracking-widest font-semibold mb-2">Playlist</p>
                    <h1 className="text-5xl font-extrabold mb-3 truncate tracking-tight">{selectedPlaylist.name}</h1>
                    <p className="text-sm text-white/35">
                      {playlistTracks.length || selectedPlaylist.trackCount || 0} tracks
                      {selectedPlaylist.user ? ` · by ${selectedPlaylist.user}` : ''}
                    </p>
                    {selectedPlaylist.description && <p className="text-sm text-white/25 mt-1.5">{selectedPlaylist.description}</p>}
                    {playlistTracks.length > 0 && (
                      <button
                        onClick={() => playTrack(playlistTracks[0])}
                        className="mt-5 px-7 py-3.5 rounded-full bg-green-500 hover:bg-green-400 font-semibold text-sm transition-all duration-200 flex items-center gap-2.5 shadow-lg shadow-green-500/25 hover:shadow-green-500/40 hover:scale-[1.02] active:scale-[0.98]"
                      >
                        <PlayIcon /> Play All
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-0.5">
                  {playlistTracks.map((track, i) => (
                    <div
                      key={track.id}
                      className={`animate-fade-in flex items-center gap-4 px-4 py-2.5 rounded-xl transition-all duration-200 group ${
                        currentTrack?.id === track.id
                          ? 'bg-green-500/10 text-green-300'
                          : 'hover:bg-white/[0.04] text-white/70 hover:text-white'
                      }`}
                      style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
                    >
                      <span className="text-sm text-white/15 w-6 text-center tabular-nums group-hover:hidden">{i + 1}</span>
                      <button onClick={() => playTrack(track)} className="w-6 text-center hidden group-hover:block">
                        <svg className="w-4 h-4 mx-auto" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                      </button>
                      <button onClick={() => playTrack(track)} className="flex-1 flex items-center gap-4 min-w-0 text-left">
                        {track.thumbnail ? (
                          <img src={track.thumbnail} alt="" className="w-11 h-11 rounded-lg object-cover flex-shrink-0 shadow-sm" loading="lazy" />
                        ) : (
                          <div className="w-11 h-11 rounded-lg bg-white/[0.03] flex items-center justify-center flex-shrink-0">
                            <MusicNoteIcon />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm truncate">{track.title}</div>
                          <div className="text-xs text-white/35 truncate">{track.artist}</div>
                        </div>
                        <span className="text-xs text-white/20 tabular-nums">{formatTime(track.duration)}</span>
                      </button>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleFavorite(track); }}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                            isFavorited(track.id) ? 'text-red-400' : 'text-white/30 hover:text-red-400'
                          }`}
                        >
                          <HeartIcon filled={isFavorited(track.id)} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDownload(track); }}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-green-400 transition-all"
                        >
                          <DownloadIcon />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {view === 'favorites' && (
              <div>
                <h1 className="text-2xl font-bold mb-6 flex items-center gap-3">
                  <span className="text-red-400"><HeartIcon filled={true} /></span>
                  Favorites
                </h1>
                {displayFavorites.length === 0 && !loading && (
                  <div className="flex flex-col items-center justify-center py-24 text-white/15">
                    <div className="w-24 h-24 rounded-3xl bg-white/[0.03] flex items-center justify-center mb-5 ring-1 ring-white/[0.06]">
                      <HeartIcon filled={false} />
                    </div>
                    <p className="text-xl font-semibold mb-1.5">No favorites yet</p>
                    <p className="text-sm text-white/20">Heart tracks to add them here</p>
                  </div>
                )}
                <div className="space-y-0.5">
                  {displayFavorites.map((track) => (
                    <div
                      key={track.id}
                      className={`animate-fade-in flex items-center gap-4 px-4 py-2.5 rounded-xl transition-all duration-200 group ${
                        currentTrack?.id === track.id
                          ? 'bg-green-500/10 text-green-300'
                          : 'hover:bg-white/[0.04] text-white/70 hover:text-white'
                      }`}
                    >
                      <button onClick={() => playTrack(track)} className="flex-1 flex items-center gap-4 min-w-0 text-left">
                        {track.thumbnail ? (
                          <img src={track.thumbnail} alt="" className="w-11 h-11 rounded-lg object-cover flex-shrink-0 shadow-sm" loading="lazy" />
                        ) : (
                          <div className="w-11 h-11 rounded-lg bg-white/[0.03] flex items-center justify-center flex-shrink-0">
                            <MusicNoteIcon />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm truncate">{track.title}</div>
                          <div className="text-xs text-white/35 truncate">{track.artist}</div>
                        </div>
                        <span className="text-xs text-white/20 tabular-nums">{formatTime(track.duration)}</span>
                      </button>
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleFavorite(track); }}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-red-400 hover:text-red-300 transition-all"
                        >
                          <HeartIcon filled={true} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setAddTrackToPlaylist(track); }}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-white/25 hover:text-green-400 hover:bg-white/[0.06] opacity-0 group-hover:opacity-100 transition-all duration-200"
                        >
                          <PlaylistIcon />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDownload(track); }}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-white/25 hover:text-green-400 hover:bg-white/[0.06] opacity-0 group-hover:opacity-100 transition-all duration-200"
                        >
                          <DownloadIcon />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {view === 'playlists' && (
              <div>
                <div className="flex items-center justify-between mb-8">
                  <h1 className="text-2xl font-bold flex items-center gap-3">
                    <span className="text-green-400"><PlaylistIcon /></span>
                    My Playlists
                  </h1>
                  <button
                    onClick={() => setShowCreatePlaylist(true)}
                    className="px-5 py-2.5 rounded-full bg-green-500 hover:bg-green-400 text-sm font-semibold transition-all duration-200 shadow-lg shadow-green-500/20 hover:shadow-green-500/30 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    + New Playlist
                  </button>
                </div>

                {showCreatePlaylist && (
                  <div className="mb-8 flex gap-2">
                    <input
                      type="text"
                      placeholder="Playlist name"
                      value={newPlaylistName}
                      onChange={(e) => setNewPlaylistName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') createPlaylist(); if (e.key === 'Escape') setShowCreatePlaylist(false); }}
                      className="flex-1 px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-white placeholder-white/25 outline-none focus:border-green-500/50 transition-all duration-200"
                      autoFocus
                    />
                    <button onClick={createPlaylist} className="px-6 py-3 rounded-xl bg-green-600 hover:bg-green-500 text-sm font-semibold transition-all duration-200 shadow-lg shadow-green-600/20">Create</button>
                    <button onClick={() => { setShowCreatePlaylist(false); setNewPlaylistName(''); }} className="px-6 py-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white/45 text-sm transition-all duration-200">Cancel</button>
                  </div>
                )}

                {activePlaylistId && userPlaylistTracks.length > 0 && (
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-bold">{playlists.find(p => p.id === activePlaylistId)?.name}</h2>
                      <button
                        onClick={() => { if (userPlaylistTracks.length > 0) playTrack(userPlaylistTracks[0]); }}
                        className="px-5 py-2.5 rounded-full bg-green-500 hover:bg-green-400 text-sm font-semibold transition-all duration-200 flex items-center gap-2 shadow-lg shadow-green-500/20 hover:shadow-green-500/30 hover:scale-[1.02] active:scale-[0.98]"
                      >
                        <PlayIcon /> Play All
                      </button>
                    </div>
                    <div className="space-y-0.5">
                      {userPlaylistTracks.map((track) => (
                        <div
                          key={track.id}
                          className={`animate-fade-in flex items-center gap-4 px-4 py-2.5 rounded-xl transition-all duration-200 group ${
                            currentTrack?.id === track.id
                              ? 'bg-green-500/10 text-green-300'
                              : 'hover:bg-white/[0.04] text-white/70 hover:text-white'
                          }`}
                        >
                          <button onClick={() => playTrack(track)} className="flex-1 flex items-center gap-4 min-w-0 text-left">
                            {track.thumbnail ? (
                              <img src={track.thumbnail} alt="" className="w-11 h-11 rounded-lg object-cover flex-shrink-0 shadow-sm" loading="lazy" />
                            ) : (
                              <div className="w-11 h-11 rounded-lg bg-white/[0.03] flex items-center justify-center flex-shrink-0">
                                <MusicNoteIcon />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="text-sm truncate">{track.title}</div>
                              <div className="text-xs text-white/35 truncate">{track.artist}</div>
                            </div>
                            <span className="text-xs text-white/20 tabular-nums">{formatTime(track.duration)}</span>
                          </button>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleFavorite(track); }}
                              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 ${
                                isFavorited(track.id) ? 'text-red-400 hover:text-red-300' : 'text-white/25 hover:text-red-400 hover:bg-white/[0.06]'
                              }`}
                            >
                              <HeartIcon filled={isFavorited(track.id)} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDownload(track); }}
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-white/25 hover:text-green-400 hover:bg-white/[0.06] transition-all duration-200"
                            >
                              <DownloadIcon />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!activePlaylistId && playlists.length === 0 && !showCreatePlaylist && (
                  <div className="flex flex-col items-center justify-center py-24 text-white/15">
                    <div className="w-24 h-24 rounded-3xl bg-white/[0.03] flex items-center justify-center mb-5 ring-1 ring-white/[0.06]">
                      <PlaylistIcon />
                    </div>
                    <p className="text-xl font-semibold mb-1.5">No playlists yet</p>
                    <p className="text-sm text-white/20">Create a playlist to get started</p>
                  </div>
                )}
              </div>
            )}

            {loading && (
              <div className="flex items-center justify-center py-20">
                <div className="w-10 h-10 border-2 border-green-500/20 border-t-green-500 rounded-full animate-spin" />
              </div>
            )}
          </div>
        </main>
      </div>

      {currentTrack && (
        <div className="h-[88px] bg-gray-900/95 backdrop-blur-xl border-t border-white/[0.04] flex items-center gap-5 px-5 flex-shrink-0 shadow-[0_-4px_30px_rgba(0,0,0,0.4)]">
          <div className="w-14 h-14 rounded-xl overflow-hidden bg-white/[0.03] flex-shrink-0 shadow-lg ring-1 ring-white/[0.04]">
            {currentTrack.thumbnail ? (
              <img src={currentTrack.thumbnail} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/10">
                <MusicNoteIcon />
              </div>
            )}
          </div>

          <div className="w-52 min-w-0">
            <div className="text-sm font-semibold truncate text-white">{currentTrack.title}</div>
            <div className="text-xs text-white/35 truncate mt-0.5">{currentTrack.artist}</div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={playPrev}
              className="w-9 h-9 rounded-full flex items-center justify-center text-white/35 hover:text-white transition-colors duration-200"
            >
              <PrevIcon />
            </button>
            <button
              onClick={togglePlay}
              className="w-11 h-11 rounded-full bg-white flex items-center justify-center text-gray-900 hover:scale-105 active:scale-95 transition-all duration-200 shadow-lg shadow-white/10"
            >
              {isPlaying ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button
              onClick={playNext}
              className="w-9 h-9 rounded-full flex items-center justify-center text-white/35 hover:text-white transition-colors duration-200"
            >
              <NextIcon />
            </button>
          </div>

          <div className="flex-1 flex items-center gap-3 min-w-0 mx-4">
            <span className="text-[11px] text-white/25 w-11 text-right tabular-nums">{formatTime(progress)}</span>
            <div
              className="flex-1 h-1 bg-white/[0.06] rounded-full cursor-pointer group relative transition-all duration-200 hover:h-1.5"
              onClick={handleSeek}
            >
              <div
                className="h-full bg-gradient-to-r from-green-500 to-green-400 rounded-full relative transition-all duration-100"
                style={{ width: `${duration ? (progress / duration) * 100 : 0}%` }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-md shadow-black/30 translate-x-1/2" />
              </div>
            </div>
            <span className="text-[11px] text-white/25 w-11 tabular-nums">{formatTime(duration)}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-white/25">
              <VolumeIcon volume={volume} />
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={handleVolumeChange}
              className="w-20 accent-green-500"
            />
          </div>

          <button
            onClick={() => handleDownload(currentTrack)}
            className="w-9 h-9 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center text-white/35 hover:text-green-400 transition-all duration-200"
            title="Download"
          >
            <DownloadIcon />
          </button>
        </div>
      )}
    </div>
  );
}
