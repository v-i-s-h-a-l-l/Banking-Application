import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi, setTokens, clearTokens, getStoredRefreshToken } from './api';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, firstName: string, lastName: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    let isMounted = true;
    const refreshToken = getStoredRefreshToken();
    const accessToken = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;

    if (!refreshToken && !accessToken) {
      setIsLoading(false);
      return;
    }

    async function restoreSession() {
      // 1. If we already have an accessToken, check /auth/me first
      if (accessToken) {
        try {
          const res = await authApi.me();
          if (res?.data?.user && isMounted) {
            setUser(res.data.user);
            setIsLoading(false);
            return;
          }
        } catch {
          // Token expired, fall through to refresh
        }
      }

      // 2. Refresh with refreshToken if available
      if (refreshToken) {
        try {
          const res = await fetch('/api/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          });
          const data = await res.json();
          if (data.success && isMounted) {
            setTokens(data.data.accessToken, data.data.refreshToken);
            const meRes = await authApi.me();
            if (meRes?.data?.user && isMounted) {
              setUser(meRes.data.user);
            }
          } else if (isMounted) {
            clearTokens();
          }
        } catch {
          if (isMounted) clearTokens();
        }
      }

      if (isMounted) setIsLoading(false);
    }

    restoreSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await authApi.login(email, password);
    setTokens(data.data.accessToken, data.data.refreshToken);
    setUser(data.data.user);
  }, []);

  const register = useCallback(
    async (email: string, password: string, firstName: string, lastName: string) => {
      await authApi.register(email, password, firstName, lastName);
      await login(email, password);
    },
    [login],
  );

  const logout = useCallback(async () => {
    const token = getStoredRefreshToken();
    if (token) {
      await authApi.logout(token).catch(() => {});
    }
    clearTokens();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
