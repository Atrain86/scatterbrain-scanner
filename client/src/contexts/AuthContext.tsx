import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { migrateUnnamedDb } from '../lib/db';
import { clearAllOtherUsersStorage } from '../lib/userStorage';
import { resetSyncCaches } from '../lib/cloudSync';
import {
  getPriorUserSnapshots,
  deletePriorUserDb,
  type PriorUserSnapshot,
} from '../lib/deviceHandover';

// One-time purge on module load: remove historical global fallback buckets
// (sb_cloud_settings and sb_custom_categories) if they exist. Any old install
// that still has these keys would otherwise carry cross-user residue
// indefinitely — this eliminates it immediately on next app load.
try { localStorage.removeItem('sb_cloud_settings'); } catch { /* non-fatal */ }
try { localStorage.removeItem('sb_custom_categories'); } catch { /* non-fatal */ }

interface AuthUser {
  id: string;
  email: string;
}

// When sign-in encounters prior-user data that isn't verified backed up,
// AuthContext parks the pending user + snapshots here. UI renders a modal;
// user's decision resolves the promise the login/signup awaited.
export interface HandoverConsent {
  pendingUser: AuthUser;
  pendingToken: string;
  priorUsers: PriorUserSnapshot[];
  // Called by the UI when the user chooses to proceed (wipe prior data + sign in)
  onApproveWipe: () => void;
  // Called by the UI when the user chooses NOT to proceed (cancel sign-in)
  onCancel: () => void;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => void;
  error: string;
  clearError: () => void;
  // Non-null when a sign-in is blocked pending consent to wipe prior user data
  pendingHandover: HandoverConsent | null;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  login: async () => {},
  signup: async () => {},
  logout: () => {},
  error: '',
  clearError: () => {},
  pendingHandover: null,
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

// Called when we're about to activate a user session on the device. If any
// prior user has data here, either wipe it (if verified safe) or park a
// HandoverConsent for the UI to resolve. Returns true if it's safe to activate
// the session now, false if the caller should wait for consent.
async function reconcilePriorUsers(
  incoming: AuthUser,
  token: string,
  parkConsent: (c: HandoverConsent | null) => void,
): Promise<'proceed' | 'awaiting-consent'> {
  const priors = await getPriorUserSnapshots(incoming.id);
  if (priors.length === 0) return 'proceed';

  const allVerified = priors.every(p => p.backupVerified);
  if (allVerified) {
    // Safe to wipe silently.
    for (const p of priors) await deletePriorUserDb(p.userId);
    clearAllOtherUsersStorage(incoming.id);
    return 'proceed';
  }

  // Need explicit user consent. Park the state and return a promise the UI
  // will resolve.
  return new Promise<'proceed' | 'awaiting-consent'>(resolve => {
    parkConsent({
      pendingUser: incoming,
      pendingToken: token,
      priorUsers: priors,
      onApproveWipe: async () => {
        for (const p of priors) await deletePriorUserDb(p.userId);
        clearAllOtherUsersStorage(incoming.id);
        parkConsent(null);
        resolve('proceed');
      },
      onCancel: () => {
        parkConsent(null);
        resolve('awaiting-consent'); // signals: don't activate the session
      },
    });
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]                     = useState<AuthUser | null>(null);
  const [isLoading, setLoading]             = useState(true);
  const [error, setError]                   = useState('');
  const [pendingHandover, setPendingHandover] = useState<HandoverConsent | null>(null);

  // On mount: decode token locally first for instant load, verify with server
  // in background. Prior-user reconciliation is NOT run on mount — mount is
  // for the same user resuming their own session. Reconciliation runs only
  // on explicit login/signup where a different user might be arriving.
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) { setLoading(false); return; }

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.id && payload.email) {
        migrateUnnamedDb(payload.id).catch(() => {});
        setUser({ id: payload.id, email: payload.email });
        setLoading(false);
      } else {
        localStorage.removeItem(TOKEN_KEY);
        setLoading(false);
        return;
      }
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      setLoading(false);
      return;
    }

    fetch(`${API_BASE}/api/user/verify`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async r => {
        if (r.status === 401) {
          localStorage.removeItem(TOKEN_KEY);
          setUser(null);
          return;
        }
        if (!r.ok) return;
        const data = await r.json();
        if (data.user) setUser(data.user);
      })
      .catch(() => { /* offline / cold start */ });
  }, []);

  const activate = useCallback(async (token: string, u: AuthUser): Promise<void> => {
    const outcome = await reconcilePriorUsers(u, token, setPendingHandover);
    if (outcome === 'awaiting-consent') {
      // User cancelled at the consent modal. Do not activate the session.
      throw new Error('Sign-in cancelled to preserve prior data.');
    }
    localStorage.setItem(TOKEN_KEY, token);
    await migrateUnnamedDb(u.id);
    setUser(u);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError('');
    const { token, user: u } = await apiFetch('/login', { email, password });
    await activate(token, u);
  }, [activate]);

  const signup = useCallback(async (email: string, password: string) => {
    setError('');
    const { token, user: u } = await apiFetch('/signup', { email, password });
    await activate(token, u);
  }, [activate]);

  const logout = useCallback(() => {
    // Logout clears ONLY: the JWT and in-memory sync caches. It does NOT touch
    // persisted per-user data — the same user re-signing in expects instant
    // access to their receipts. Cross-user cleanup happens on the OTHER user's
    // sign-in, guarded by the handover consent flow. This is the invariant.
    localStorage.removeItem(TOKEN_KEY);
    resetSyncCaches(user?.id);
    setUser(null);
  }, [user]);

  const clearError = useCallback(() => setError(''), []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, logout, error, clearError, pendingHandover }}>
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
