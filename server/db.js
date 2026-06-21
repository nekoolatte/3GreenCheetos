import { createClient } from '@libsql/client';
import bcrypt from 'bcryptjs';

const TURSO_URL = process.env.TURSO_URL || 'file:local.db';
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN || '';

const db = createClient({
  url: TURSO_URL,
  ...(TURSO_AUTH_TOKEN ? { authToken: TURSO_AUTH_TOKEN } : {}),
});

export async function initDB() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      username TEXT,
      password_hash TEXT,
      discord_id TEXT UNIQUE,
      discord_username TEXT,
      discord_avatar TEXT,
      discord_access_token TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      track_id TEXT NOT NULL,
      title TEXT NOT NULL,
      artist TEXT,
      thumbnail TEXT,
      url TEXT,
      service TEXT NOT NULL,
      duration INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, track_id, service)
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS playlist_tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id INTEGER NOT NULL,
      track_id TEXT NOT NULL,
      title TEXT NOT NULL,
      artist TEXT,
      thumbnail TEXT,
      url TEXT,
      service TEXT NOT NULL,
      duration INTEGER DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS search_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      query TEXT NOT NULL,
      service TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  console.log('[DB] Initialized');
}

export async function findUserByUsername(username) {
  const result = await db.execute({ sql: 'SELECT * FROM users WHERE username = ?', args: [username] });
  return result.rows[0] || null;
}

export async function findUserByDiscordId(discordId) {
  const result = await db.execute({ sql: 'SELECT * FROM users WHERE discord_id = ?', args: [discordId] });
  return result.rows[0] || null;
}

export async function createUser(email, password, username) {
  const hash = await bcrypt.hash(password, 10);
  const result = await db.execute({ sql: 'INSERT INTO users (email, password_hash, username) VALUES (?, ?, ?)', args: [email, hash, username || email.split('@')[0]] });
  return { id: Number(result.lastInsertRowid), email, username: username || email.split('@')[0] };
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export async function upsertDiscordUser(discordId, username, avatar, accessToken) {
  let user = await findUserByDiscordId(discordId);
  if (user) {
    await db.execute({
      sql: 'UPDATE users SET discord_username = ?, discord_avatar = ?, discord_access_token = ? WHERE discord_id = ?',
      args: [username, avatar, accessToken, discordId],
    });
    user.discord_username = username;
    user.discord_avatar = avatar;
    user.discord_access_token = accessToken;
    return user;
  }
  const result = await db.execute({
    sql: 'INSERT INTO users (discord_id, discord_username, discord_avatar, discord_access_token, username) VALUES (?, ?, ?, ?, ?)',
    args: [discordId, username, avatar, accessToken, `discord_${discordId}`],
  });
  return { id: Number(result.lastInsertRowid), discord_id: discordId, discord_username: username, discord_avatar: avatar, discord_access_token: accessToken, username: `discord_${discordId}` };
}

export async function getUserById(id) {
  const result = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [id] });
  return result.rows[0] || null;
}

export async function getFavorites(userId) {
  const result = await db.execute({ sql: 'SELECT * FROM favorites WHERE user_id = ? ORDER BY created_at DESC', args: [userId] });
  return result.rows;
}

export async function addFavorite(userId, track) {
  try {
    await db.execute({
      sql: 'INSERT INTO favorites (user_id, track_id, title, artist, thumbnail, url, service, duration) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      args: [userId, track.id, track.title, track.artist || null, track.thumbnail || null, track.url || null, track.service, track.duration || 0],
    });
    return true;
  } catch {
    return false;
  }
}

export async function removeFavorite(userId, trackId, service) {
  await db.execute({ sql: 'DELETE FROM favorites WHERE user_id = ? AND track_id = ? AND service = ?', args: [userId, trackId, service] });
  return true;
}

export async function getPlaylists(userId) {
  const result = await db.execute({ sql: 'SELECT * FROM playlists WHERE user_id = ? ORDER BY created_at DESC', args: [userId] });
  return result.rows;
}

export async function createPlaylist(userId, name, description) {
  const result = await db.execute({
    sql: 'INSERT INTO playlists (user_id, name, description) VALUES (?, ?, ?)',
    args: [userId, name, description || null],
  });
  return { id: Number(result.lastInsertRowid), user_id: userId, name, description };
}

export async function deletePlaylist(playlistId, userId) {
  await db.execute({ sql: 'DELETE FROM playlist_tracks WHERE playlist_id = ?', args: [playlistId] });
  await db.execute({ sql: 'DELETE FROM playlists WHERE id = ? AND user_id = ?', args: [playlistId, userId] });
  return true;
}

export async function getPlaylistTracks(playlistId) {
  const result = await db.execute({ sql: 'SELECT * FROM playlist_tracks WHERE playlist_id = ? ORDER BY position', args: [playlistId] });
  return result.rows;
}

export async function addTrackToPlaylist(playlistId, track) {
  const maxPos = await db.execute({ sql: 'SELECT MAX(position) as max_pos FROM playlist_tracks WHERE playlist_id = ?', args: [playlistId] });
  const position = (maxPos.rows[0]?.max_pos ?? -1) + 1;
  await db.execute({
    sql: 'INSERT INTO playlist_tracks (playlist_id, track_id, title, artist, thumbnail, url, service, duration, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    args: [playlistId, track.id, track.title, track.artist || null, track.thumbnail || null, track.url || null, track.service, track.duration || 0, position],
  });
  return true;
}

export async function removeTrackFromPlaylist(playlistTrackId) {
  await db.execute({ sql: 'DELETE FROM playlist_tracks WHERE id = ?', args: [playlistTrackId] });
  return true;
}

export async function findUserByEmail(email) {
  const result = await db.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [email] });
  return result.rows[0] || null;
}

export default db;
