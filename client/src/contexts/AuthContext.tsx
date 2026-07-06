import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { purgeLegacyDexieDb } from '../lib/db';
import { clearUserStorage } from '../lib/userStorage';

// Purge the historical global `sb_cloud_settings` localStorage bucket that used
// to hold Drive OAuth tokens with no user binding. See account-freshness audit
// Finding 1: prior code both wrote to and read from this global bucket, which
// caused Drive credentials to bleed to the next user on a shared browser.
// Run at module load so it's cleaned up on the very first render.
try { localStorage.removeItem('sb_cloud_settings'); } catch { /* Safari private mode */ }

interface AuthUser {
  id: string;
  email: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => void;
  error: string;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  login: async () => {},
  signup: async () => {},
  logout: () => {},
  error: '',
  clearError: () => {},
});

const TOKEN_KEY = 'sb_auth_token';
const API_BASE  = import.meta.env.VITE_API_URL ?? '';

async function apiFetch(path: string, body: object): Promise<{ token: string; user: AuthUser }> {
  const res = await fetch(`${API_BASE}/api/user${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data as { token: string; user: AuthUser };
}

/**
 * On sign-in, if the DEVICE has leftover data for OTHER users (someone else
 * signed in on this browser before), we defensively purge every foreign
 * per-user localStorage key and every foreign Dexie DB, keeping only the
 * incoming user's data (if any). This is the belt-and-suspenders companion to
 * the sign-out flush — catches the "closed the tab without logging out" case.
 *
 * See account-freshness audit Finding 3.
 */
async function enforceUserIsolationOnSignIn(userId: string): Promise<void> {
  const { clearAllOtherUsersStorage } = await import('../lib/userStorage');
  const { deleteAllOtherUserDbs } = await import('../lib/db');
  clearAllOtherUsersStorage(userId);
  await deleteAllOtherUserDbs(userId).catch(() => { /* best-effort */ });
}

/**
 * Full local flush on sign-out. Removes:
 *   - The JWT
 *   - Every sb_u{userId}_* localStorage key for the departing user
 *   - The departing user's Dexie DB
 *   - In-memory caches (dbCache entry, receiptsFolderIdCache entry)
 * Drive data is UNTOUCHED — this only clears LOCAL state.
 */
async function flushOnSignOut(userId: string): Promise<void> {
  const { deleteUserDb } = await import('../lib/db');
  const { clearFolderIdCache } = await import('../lib/cloudSync');
  clearUserStorage(userId);
  clearFolderIdCache(userId);
  await deleteUserDb(userId).catch(() => { /* best-effort */ });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]         = useState<AuthUser | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [error, setError]       = useState('');

  // On mount: decode token locally first for instant load, verify with server in background
  useEffect(() => {
    // Foundational cleanup: purge the legacy pre-namespacing Dexie DB
    // ('scatterbrain') that used to be copied into every new user's DB by the
    // now-removed migrateUnnamedDb(). See account-freshness audit Finding 2.
    purgeLegacyDexieDb().catch(() => { /* best-effort */ });

    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) { setLoading(false); return; }

    // Step 1: decode JWT locally — instant, no network needed
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.id && payload.email) {
        setUser({ id: payload.id, email: payload.email });
        setLoading(false); // show the app immediately
      } else {
        localStorage.removeItem(TOKEN_KEY);
        setLoading(false);
        return;
      }
    } catch {
      // Malformed token — clear it and show login
      localStorage.removeItem(TOKEN_KEY);
      setLoading(false);
      return;
    }

    // Step 2: verify with server in background — only acts on explicit 401
    fetch(`${API_BASE}/api/user/verify`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async r => {
        if (r.status === 401) {
          // Server explicitly rejected the token — log out (with full flush)
          try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            if (payload.id) await flushOnSignOut(payload.id);
          } catch { /* fall through */ }
          localStorage.removeItem(TOKEN_KEY);
          setUser(null);
          return;
        }
        if (!r.ok) return; // server error / cold start — keep local user, ignore
        const data = await r.json();
        if (data.user) {
          // Update with canonical server user data (email change etc.)
          setUser(data.user);
        }
      })
      .catch(() => {
        // Network offline or Render cold start — local user stays, no action
      });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError('');
    const { token, user: u } = await apiFetch('/login', { email, password });
    localStorage.setItem(TOKEN_KEY, token);
    await enforceUserIsolationOnSignIn(u.id);
    setUser(u);
  }, []);

  const signup = useCallback(async (email: string, password: string) => {
    setError('');
    const { token, user: u } = await apiFetch('/signup', { email, password });
    localStorage.setItem(TOKEN_KEY, token);
    await enforceUserIsolationOnSignIn(u.id);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    // Capture id before we clear state so the flush runs against the right user.
    const departingId = user?.id;
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    if (departingId) void flushOnSignOut(departingId);
  }, [user]);

  const clearError = useCallback(() => setError(''), []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, logout, error, clearError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function useAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
