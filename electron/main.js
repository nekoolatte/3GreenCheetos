import 'dotenv/config';
import { app, BrowserWindow, ipcMain } from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import express from 'express';
import net from 'net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isDev = !app.isPackaged;
let mainWindow = null;

const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';
const LARGE_IMAGE_URL = 'https://cdn.discordapp.com/avatars/1518070691742613585/a1a4e3be67206a382fc48b6ddb5a79df?size=256';

let ipcSocket = null;
let ipcConnected = false;
let ipcAuthenticated = false;
let ipcNonce = 0;
let ipcBuffer = Buffer.alloc(0);

function getIPCPath() {
  if (process.platform === 'win32') {
    return '\\\\?\\pipe\\discord-ipc-0';
  }
  const tmpdir = process.env.TMPDIR || process.env.TEMP || '/tmp';
  return join(tmpdir, 'discord-ipc-0');
}

function sendIPCPacket(op, data) {
  if (!ipcSocket || !ipcConnected) return;
  const payload = Buffer.from(JSON.stringify(data));
  const header = Buffer.alloc(8);
  header.writeInt32LE(op, 0);
  header.writeInt32LE(payload.length, 4);
  ipcSocket.write(Buffer.concat([header, payload]));
}

function parseIPCBuffer() {
  while (ipcBuffer.length >= 8) {
    const op = ipcBuffer.readInt32LE(0);
    const len = ipcBuffer.readInt32LE(4);
    if (ipcBuffer.length < 8 + len) break;
    const data = JSON.parse(ipcBuffer.slice(8, 8 + len).toString());
    ipcBuffer = ipcBuffer.slice(8 + len);
    handleIPCMessage(op, data);
  }
}

function handleIPCMessage(op, data) {
  if (op === 1) {
    const { cmd, evt, data: payload, nonce } = data;
    if (cmd === 'AUTHENTICATE') {
      if (evt === 'READY') {
        ipcAuthenticated = true;
        console.log('[Discord IPC] Authenticated');
      } else {
        console.error('[Discord IPC] Auth failed:', payload);
      }
    } else if (cmd === 'SET_ACTIVITY') {
      if (evt === 'ERROR') {
        console.error('[Discord IPC] SET_ACTIVITY error:', payload);
      }
    }
  }
}

function connectIPC() {
  if (ipcSocket) {
    try { ipcSocket.destroy(); } catch {}
    ipcSocket = null;
  }

  const path = getIPCPath();
  console.log(`[Discord IPC] Connecting to ${path}...`);

  ipcSocket = net.createConnection(path);
  ipcConnected = true;

  ipcSocket.on('connect', () => {
    console.log('[Discord IPC] Connected');
    ipcBuffer = Buffer.alloc(0);
    sendIPCPacket(0, { v: 1, client_id: CLIENT_ID });
  });

  ipcSocket.on('data', (chunk) => {
    ipcBuffer = Buffer.concat([ipcBuffer, chunk]);
    parseIPCBuffer();
  });

  ipcSocket.on('close', () => {
    console.log('[Discord IPC] Disconnected');
    ipcConnected = false;
    ipcAuthenticated = false;
    ipcSocket = null;
    setTimeout(connectIPC, 5000);
  });

  ipcSocket.on('error', (err) => {
    console.error('[Discord IPC] Error:', err.message);
    ipcConnected = false;
  });
}

function setPresence({ title, artist, service }) {
  if (!ipcAuthenticated) return false;

  const serviceNames = { soundcloud: 'SoundCloud', youtube: 'YouTube Music', spotify: 'Spotify' };

  sendIPCPacket(1, {
    cmd: 'SET_ACTIVITY',
    args: {
      activity: {
        details: title || 'Unknown Track',
        state: artist || 'Unknown Artist',
        assets: {
          large_image: LARGE_IMAGE_URL,
          large_text: '3 Green Cheetos',
          small_text: serviceNames[service] || 'Music Player',
        },
        timestamps: { start: Date.now() },
      },
      pid: process.pid,
    },
    nonce: String(++ipcNonce),
  });
  console.log(`[Discord IPC] Presence set: ${title} by ${artist}`);
  return true;
}

function clearPresence() {
  if (!ipcAuthenticated) return false;

  sendIPCPacket(1, {
    cmd: 'SET_ACTIVITY',
    args: { activity: null, pid: process.pid },
    nonce: String(++ipcNonce),
  });
  console.log('[Discord IPC] Presence cleared');
  return true;
}

async function startServer() {
  const { initDB } = await import('../server/db.js');
  const appModule = await import('../server/app.js');
  const app = appModule.default;

  await initDB();

  if (!isDev) {
    app.use(express.static(join(__dirname, '..', 'dist')));
  }

  app.get('/api/discord/status', (_req, res) => {
    res.json({ connected: ipcAuthenticated, clientId: CLIENT_ID || null });
  });

  app.post('/api/discord/presence', async (req, res) => {
    const ok = setPresence(req.body);
    res.json({ ok });
  });

  app.post('/api/discord/clear', async (_req, res) => {
    const ok = clearPresence();
    res.json({ ok });
  });

  return new Promise((resolve) => {
    app.listen(3001, () => {
      console.log('[Server] API running on http://localhost:3001');
      resolve();
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: '3 Green Cheetos',
    icon: join(__dirname, '..', 'public', 'icon.jpg'),
    backgroundColor: '#000000',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadURL('http://localhost:3001');
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await startServer();
  connectIPC();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  clearPresence();
  if (ipcSocket) try { ipcSocket.destroy(); } catch {}
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('discord:setPresence', async (_event, data) => {
  console.log('[IPC] discord:setPresence received:', JSON.stringify(data));
  return setPresence(data);
});

ipcMain.handle('discord:clearPresence', async () => {
  console.log('[IPC] discord:clearPresence received');
  return clearPresence();
});

ipcMain.handle('discord:status', async () => {
  return { connected: ipcAuthenticated, clientId: CLIENT_ID || null };
});
