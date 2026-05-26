import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const USERS_FILE = join(__dirname, '../../data/users.json');
const JWT_SECRET = process.env.JWT_SECRET || 'sb-dev-secret-change-in-prod';
const JWT_EXPIRES = '90d';

interface StoredUser {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

function loadUsers(): StoredUser[] {
  try {
    if (!existsSync(USERS_FILE)) { writeFileSync(USERS_FILE, '[]', 'utf8'); return []; }
    return JSON.parse(readFileSync(USERS_FILE, 'utf8')) as StoredUser[];
  } catch { return []; }
}

function saveUsers(users: StoredUser[]): void {
  writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function makeToken(user: StoredUser): string {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

const router = Router();

router.post('/signup', async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) { res.status(400).json({ error: 'Email and password required' }); return; }
  if (password.length < 6)  { res.status(400).json({ error: 'Password must be at least 6 characters' }); return; }

  const users = loadUsers();
  if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
    res.status(409).json({ error: 'An account with that email already exists' }); return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user: StoredUser = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2),
    email: email.toLowerCase().trim(),
    passwordHash,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  saveUsers(users);

  res.json({ token: makeToken(user), user: { id: user.id, email: user.email } });
});

router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) { res.status(400).json({ error: 'Email and password required' }); return; }

  const users = loadUsers();
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase().trim());
  if (!user) { res.status(401).json({ error: 'Invalid email or password' }); return; }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) { res.status(401).json({ error: 'Invalid email or password' }); return; }

  res.json({ token: makeToken(user), user: { id: user.id, email: user.email } });
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

export default router;
