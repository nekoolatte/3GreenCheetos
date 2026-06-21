import 'dotenv/config';
import app from './app.js';
import { initDB } from './db.js';

const PORT = process.env.PORT || 3001;

await initDB();

app.listen(PORT, () => {
  console.log(`3 Green Cheetos API running on http://localhost:${PORT}`);
});
