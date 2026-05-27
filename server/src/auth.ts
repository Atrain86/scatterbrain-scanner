import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createClient } from '@libsql/client';

const JWT_SECRET  = process.env.JWT_SECRET || 'sb-dev-secret-change-in-prod';
const JWT_EXPIRES = '90d';

function getDb() {
  const url   = process.env.TURSO_URL;
  const token = process.env.TURSO_TOKEN;
  if (!url || !token) throw new Error('TURSO_URL and TURSO_TOKEN must be set');
  return createClient({ url, authToken: token });
}

// Create users table on startup if it doesn't exist
export async function initDb(): Promise<void> {
  try {
    const db = getDb();
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id           TEXT PRIMARY KEY,
        email        TEXT UNIQUE NOT NULL,
        passwordHash TEXT NOT NULL,
        createdAt    TEXT NOT NULL
      )
    `);
    console.log('[auth] Turso DB ready');
  } catch (err) {
    console.error('[auth] DB init failed:', (err as Error).message);
  }
}

function makeToken(id: string, email: string): string {
  return jwt.sign({ id, email }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

const router = Router();

router.post('/signup', async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) { res.status(400).json({ error: 'Email and password required' }); return; }
  if (password.length < 6)  { res.status(400).json({ error: 'Password must be at least 6 characters' }); return; }

  try {
    const db           = getDb();
    const emailLower   = email.toLowerCase().trim();
    const existing     = await db.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [emailLower] });
    if (existing.rows.length > 0) { res.status(409).json({ error: 'An account with that email already exists' }); return; }

    const passwordHash = await bcrypt.hash(password, 12);
    const id           = makeId();
    const createdAt    = new Date().toISOString();

    await db.execute({
      sql:  'INSERT INTO users (id, email, passwordHash, createdAt) VALUES (?, ?, ?, ?)',
      args: [id, emailLower, passwordHash, createdAt],
    });

    res.json({ token: makeToken(id, emailLower), user: { id, email: emailLower } });
  } catch (err) {
    console.error('[auth] signup error:', err);
    res.status(500).json({ error: 'Server error during signup' });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) { res.status(400).json({ error: 'Email and password required' }); return; }

  try {
    const db         = getDb();
    const emailLower = email.toLowerCase().trim();
    const result     = await db.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [emailLower] });

    if (result.rows.length === 0) { res.status(401).json({ error: 'Invalid email or password' }); return; }

    const row          = result.rows[0];
    const passwordHash = row.passwordHash as string;
    const ok           = await bcrypt.compare(password, passwordHash);
    if (!ok) { res.status(401).json({ error: 'Invalid email or password' }); return; }

    const id = row.id as string;
    res.json({ token: makeToken(id, emailLower), user: { id, email: emailLower } });
  } catch (err) {
    console.error('[auth] login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

router.post('/verify', (req: Request, res: Response) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) { res.status(401).json({ error: 'No token' }); return; }
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as { id: string; email: string };
    res.json({ user: { id: payload.id, email: payload.email } });
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

const ADMIN_EMAILS = ['cortespainter@gmail.com'];

router.get('/admin/users', async (req: Request, res: Response) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as { id: string; email: string };
    if (!ADMIN_EMAILS.includes(payload.email.toLowerCase())) {
      res.status(403).json({ error: 'Forbidden' }); return;
    }
    const db = getDb();
    const result = await db.execute('SELECT id, email, createdAt FROM users ORDER BY createdAt DESC');
    res.json({ users: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
