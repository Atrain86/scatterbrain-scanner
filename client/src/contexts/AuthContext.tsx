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

export function useAuthFetch() {
  return useCallback(
    (url: string, options: RequestInit = {}) => fetch(url, options),
    []
  );
}
