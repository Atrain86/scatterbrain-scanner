import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { migrateUnnamedDb } from '../lib/db';
import { loadCloudSettings, saveCloudSettings } from '../hooks/useCloudAuth';

function migrateCloudSettings(userId: string) {
  const unnamespaced = loadCloudSettings(undefined);
  const hasData = unnamespaced.googleDrive?.connected || unnamespaced.dropbox?.connected;
  if (!hasData) return;
  const userSettings = loadCloudSettings(userId);
  const merged = {
    googleDrive: unnamespaced.googleDrive?.connected ? unnamespaced.googleDrive : userSettings.googleDrive,
    dropbox:     unnamespaced.dropbox?.connected     ? unnamespaced.dropbox     : userSettings.dropbox,
    primaryProvider: unnamespaced.primaryProvider || userSettings.primaryProvider,
    autoSync: userSettings.autoSync,
  };
  saveCloudSettings(merged, userId);
}

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

  // On mount: verify stored token
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) { setLoading(false); return; }

    fetch(`${API_BASE}/api/user/verify`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(async data => {
        if (data.user) {
          await migrateUnnamedDb(data.user.id);
          setUser(data.user);
        } else {
          localStorage.removeItem(TOKEN_KEY);
        }
      })
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError('');
    const { token, user: u } = await apiFetch('/login', { email, password });
    localStorage.setItem(TOKEN_KEY, token);
    await migrateUnnamedDb(u.id);
    migrateCloudSettings(u.id);
    setUser(u);
  }, []);

  const signup = useCallback(async (email: string, password: string) => {
    setError('');
    const { token, user: u } = await apiFetch('/signup', { email, password });
    localStorage.setItem(TOKEN_KEY, token);
    await migrateUnnamedDb(u.id);
    migrateCloudSettings(u.id);
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
