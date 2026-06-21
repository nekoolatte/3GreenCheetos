import { Router } from 'express';
import { authMiddleware } from './auth.js';
import {
  getFavorites, addFavorite, removeFavorite,
  getPlaylists, createPlaylist, deletePlaylist,
  getPlaylistTracks, addTrackToPlaylist, removeTrackFromPlaylist,
} from './db.js';

const router = Router();

router.get('/api/favorites', authMiddleware, async (req, res) => {
  try {
    const favorites = await getFavorites(req.user.id);
    res.json(favorites);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/favorites', authMiddleware, async (req, res) => {
  try {
    const { track_id, title, artist, thumbnail, url, service, duration } = req.body;
    if (!track_id || !title || !service) return res.status(400).json({ error: 'Missing required fields' });
    const ok = await addFavorite(req.user.id, { id: track_id, title, artist, thumbnail, url, service, duration });
    res.json({ ok });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/favorites', authMiddleware, async (req, res) => {
  try {
    const { track_id, service } = req.query;
    if (!track_id || !service) return res.status(400).json({ error: 'Missing track_id or service' });
    const ok = await removeFavorite(req.user.id, track_id, service);
    res.json({ ok });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/playlists', authMiddleware, async (req, res) => {
  try {
    const playlists = await getPlaylists(req.user.id);
    res.json(playlists);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/playlists', authMiddleware, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const playlist = await createPlaylist(req.user.id, name, description);
    res.json(playlist);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/playlists/:id', authMiddleware, async (req, res) => {
  try {
    const ok = await deletePlaylist(Number(req.params.id), req.user.id);
    res.json({ ok });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/playlists/:id/tracks', authMiddleware, async (req, res) => {
  try {
    const tracks = await getPlaylistTracks(Number(req.params.id));
    res.json(tracks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/playlists/:id/tracks', authMiddleware, async (req, res) => {
  try {
    const { track_id, title, artist, thumbnail, url, service, duration } = req.body;
    if (!track_id || !title || !service) return res.status(400).json({ error: 'Missing required fields' });
    const ok = await addTrackToPlaylist(Number(req.params.id), { id: track_id, title, artist, thumbnail, url, service, duration });
    res.json({ ok });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/playlists/:playlistId/tracks/:trackId', authMiddleware, async (req, res) => {
  try {
    const ok = await removeTrackFromPlaylist(Number(req.params.trackId));
    res.json({ ok });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
