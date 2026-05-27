import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import routes from './routes.js';
import { initDb } from './auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3002');

const app = express();

app.use(cors({
  origin: (origin, cb) => cb(null, true),
  credentials: true,
}));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Serve local uploaded files in dev (fallback when R2 not configured)
app.use('/uploads', express.static(join(process.cwd(), 'uploads')));

// All API routes
app.use('/api', routes);

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Scatterbrain Scanner API running on http://localhost:${PORT}`);
    console.log(`  OpenAI: ${process.env.OPENAI_API_KEY ? '✓' : '✗ (set OPENAI_API_KEY)'}`);
    console.log(`  Turso:  ${process.env.TURSO_URL ? '✓' : '✗ (set TURSO_URL + TURSO_TOKEN)'}`);
    console.log(`  Resend: ${process.env.RESEND_API_KEY ? '✓' : '✗'}`);
  });
});
