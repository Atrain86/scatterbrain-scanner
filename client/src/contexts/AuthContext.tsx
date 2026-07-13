import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { migrateUnnamedDb } from '../lib/db';
import { clearAllOtherUsersStorage, isEstablishedUser, markUserEstablished } from '../lib/userStorage';
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
  // Primary action: keep everything as-is and sign in. Nothing gets deleted.
  // This is what the modal's big button now does.
  onKeepAndProceed: () => void;
  // Secondary (opt-in): wipe the at-risk prior data + sign in. Explicit
  // user action required — modal exposes this as a small "clean up" link.
  onApproveWipe: () => void;
  // Cancel — aborts the sign-in entirely, prior data stays untouched.
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

// Called when we're about to activate a user session on the device.
//
// Two-tier short-circuit before we even build the priors list:
//   1. Established-user bypass: if this userId has successfully activated a
//      session on THIS browser before, they are not a handover risk — they
//      live here. Skip reconciliation entirely. Nothing gets touched, no
//      modal, no prompt. First-time arrivals still fall through.
//   2. Risk-only prompt: for a genuinely first-time arrival, we only prompt
//      if at least one OTHER account on this device has unbacked-up receipts
//      (localReceiptCount > 0 AND !backupVerified). If every other account
//      is either empty or verified-backed-up, there's no data at risk —
//      just proceed silently, leaving their data intact.
//
// When we DO prompt, the default action is now KEEP (not wipe). onApproveWipe
// is still available if the user explicitly chooses to clean up — but the
// modal's primary button just proceeds and preserves everything.
async function reconcilePriorUsers(
  incoming: AuthUser,
  token: string,
  parkConsent: (c: HandoverConsent | null) => void,
): Promise<'proceed' | 'awaiting-consent'> {
  // Tier 1 — established user. Nothing to reconcile; they're already at home.
  if (isEstablishedUser(incoming.id)) return 'proceed';

  const priors = await getPriorUserSnapshots(incoming.id);
  if (priors.length === 0) return 'proceed';

  // Tier 2 — risk gate. Only care about priors with unbacked-up local
  // receipts. Empty accounts and verified-backed-up accounts are safe to
  // leave untouched.
  const atRisk = priors.filter(p => !p.backupVerified && p.localReceiptCount > 0);
  if (atRisk.length === 0) return 'proceed';

  // Genuine first-time arrival with genuinely-at-risk data. Park a consent
  // modal — but note the modal's PRIMARY action is "keep everything & sign
  // in" (no wipe). Wipe is opt-in via the modal's secondary path.
  return new Promise<'proceed' | 'awaiting-consent'>(resolve => {
    parkConsent({
      pendingUser: incoming,
      pendingToken: token,
      priorUsers: atRisk,
      onKeepAndProceed: () => {
        // Primary path: keep prior data untouched, sign in normally.
        parkConsent(null);
        resolve('proceed');
      },
      onApproveWipe: async () => {
        for (const p of atRisk) await deletePriorUserDb(p.userId);
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
  //
  // Also — if the JWT decodes to a valid userId, mark that user as
  // established on this device. This "self-heals" any pre-feature users
  // (like Alan on his current browser): the moment they reload the app,
  // they're recognized as established and the next sign-in won't hit the
  // handover modal. No manual step required.
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) { setLoading(false); return; }

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.id && payload.email) {
        migrateUnnamedDb(payload.id).catch(() => {});
        markUserEstablished(payload.id);
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
    // Successful activation = this user is established on this browser.
    // Future sign-ins as this user will bypass the handover check entirely.
    markUserEstablished(u.id);
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
