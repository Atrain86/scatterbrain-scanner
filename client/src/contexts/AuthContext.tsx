import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { migrateUnnamedDb } from '../lib/db';

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]         = useState<AuthUser | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [error, setError]       = useState('');

  // On mount: decode token locally first for instant load, verify with server in background
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) { setLoading(false); return; }

    // Step 1: decode JWT locally — instant, no network needed
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.id && payload.email) {
        migrateUnnamedDb(payload.id).catch(() => {});
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
          // Server explicitly rejected the token — log out
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
    await migrateUnnamedDb(u.id);
    setUser(u);
  }, []);

  const signup = useCallback(async (email: string, password: string) => {
    setError('');
    const { token, user: u } = await apiFetch('/signup', { email, password });
    localStorage.setItem(TOKEN_KEY, token);
    await migrateUnnamedDb(u.id);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

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
