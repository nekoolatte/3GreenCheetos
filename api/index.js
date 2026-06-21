import app from '../server/app.js';
import { initDB } from '../server/db.js';

let dbReady = false;

async function ensureDB() {
  if (!dbReady) {
    try {
      await initDB();
      dbReady = true;
    } catch (e) {
      console.error('DB init failed:', e.message);
    }
  }
}

export default async function handler(req, res) {
  await ensureDB();
  return app(req, res);
}
