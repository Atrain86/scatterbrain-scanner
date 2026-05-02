import React, { createContext, useContext, useCallback } from 'react';

interface AuthContextValue {
  user: { id: number; email: string; fullName: string } | null;
  isLoading: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: { id: 1, email: '', fullName: '' },
  isLoading: false,
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const logout = useCallback(() => {}, []);
  return (
    <AuthContext.Provider value={{ user: { id: 1, email: '', fullName: '' }, isLoading: false, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export function useAuthFetch() {
  return useCallback(
    (url: string, options: RequestInit = {}) => fetch(`${API_BASE}${url}`, options),
    []
  );
}
