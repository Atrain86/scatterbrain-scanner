import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR   = join(__dirname, '../../data');
const USERS_FILE = join(DATA_DIR, 'users.json');
const JWT_SECRET = process.env.JWT_SECRET || 'sb-dev-secret-change-in-prod';
const JWT_EXPIRES = '90d';

// Google Drive file name used to back up users list
const DRIVE_BACKUP_FILENAME = 'scatterbrain_users_backup.json';

interface StoredUser {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

// ── Google Drive helpers ──────────────────────────────────────────────────────

async function getDriveAccessToken(): Promise<string | null> {
  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_USERS_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type:    'refresh_token',
      }),
    });
    const data = await res.json() as any;
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

async function findDriveFileId(token: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${DRIVE_BACKUP_FILENAME}'+and+trashed=false&spaces=drive&fields=files(id)`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json() as any;
    return data.files?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

async function backupUsersToDrive(users: StoredUser[]): Promise<void> {
  const token = await getDriveAccessToken();
  if (!token) return; // Drive not configured — silent skip

  try {
    const content  = JSON.stringify(users, null, 2);
    const blob     = new Blob([content], { type: 'application/json' });
    const existingId = await findDriveFileId(token);

    if (existingId) {
      // Update existing file
      await fetch(`https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=media`, {
        method:  'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    content,
      });
    } else {
      // Create new file
      const meta = JSON.stringify({ name: DRIVE_BACKUP_FILENAME, mimeType: 'application/json' });
      const form = new FormData();
      form.append('metadata', new Blob([meta], { type: 'application/json' }));
      form.append('file', blob);
      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}` },
        body:    form,
      });
    }
  } catch (err) {
    console.warn('[auth] Drive backup failed:', (err as Error).message);
  }
}

async function restoreUsersFromDrive(): Promise<StoredUser[] | null> {
  const token = await getDriveAccessToken();
  if (!token) return null;

  try {
    const fileId = await findDriveFileId(token);
    if (!fileId) return null;

    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return null;
    return await res.json() as StoredUser[];
  } catch {
    return null;
  }
}

// ── Local file helpers ────────────────────────────────────────────────────────

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadUsers(): StoredUser[] {
  try {
    if (!existsSync(USERS_FILE)) { ensureDataDir(); writeFileSync(USERS_FILE, '[]', 'utf8'); return []; }
    return JSON.parse(readFileSync(USERS_FILE, 'utf8')) as StoredUser[];
  } catch { return []; }
}

function saveUsers(users: StoredUser[]): void {
  ensureDataDir();
  writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
  // Fire-and-forget backup — never blocks the response
  void backupUsersToDrive(users);
}

function makeToken(user: StoredUser): string {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

// ── Startup restore ───────────────────────────────────────────────────────────
// Called once at boot. If users.json is missing (redeploy wiped it), restore from Drive.

export async function restoreUsersIfNeeded(): Promise<void> {
  if (existsSync(USERS_FILE)) return; // already present
  console.log('[auth] users.json missing — attempting restore from Google Drive…');
  const users = await restoreUsersFromDrive();
  if (users && users.length > 0) {
    ensureDataDir();
    writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
    console.log(`[auth] Restored ${users.length} user(s) from Google Drive.`);
  } else {
    console.log('[auth] No Drive backup found — starting with empty users list.');
  }
}

// ── Router ────────────────────────────────────────────────────────────────────

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
    id:           Date.now().toString(36) + Math.random().toString(36).slice(2),
    email:        email.toLowerCase().trim(),
    passwordHash,
    createdAt:    new Date().toISOString(),
  };
  users.push(user);
  saveUsers(users);

  res.json({ token: makeToken(user), user: { id: user.id, email: user.email } });
});

router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) { res.status(400).json({ error: 'Email and password required' }); return; }

  const users = loadUsers();
  const user  = users.find(u => u.email.toLowerCase() === email.toLowerCase().trim());
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
