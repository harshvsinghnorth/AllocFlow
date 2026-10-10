import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, setUnauthorizedHandler, tokenStore } from './api';
import type { AuthUser, UserRole } from './types';

interface AuthContextValue {
  user: AuthUser | null;
  status: 'loading' | 'authenticated' | 'anonymous';
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  can: (...roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthContextValue['status']>('loading');

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    setStatus('anonymous');
  }, []);

  /**
   * Re-reads the profile from the server. Called on mount to restore a session
   * from a stored token, and after actions that change a user's own scope —
   * booking a room changes `currentRoomId`, which several screens read.
   */
  const refresh = useCallback(async () => {
    if (!tokenStore.get()) {
      setStatus('anonymous');
      return;
    }
    try {
      const me = await api<AuthUser>('/auth/me');
      setUser(me);
      setStatus('authenticated');
    } catch {
      logout();
    }
  }, [logout]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<{ accessToken: string; user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    tokenStore.set(res.accessToken);
    setUser(res.user);
    setStatus('authenticated');
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    void refresh();
  }, [logout, refresh]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      login,
      logout,
      refresh,
      can: (...roles: UserRole[]) => (user ? roles.includes(user.role) : false),
    }),
    [user, status, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>.');
  return ctx;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  STUDENT: 'Student',
  WARDEN: 'Warden',
  SUPERVISOR: 'Supervisor',
  SECURITY: 'Security',
  MESS_STAFF: 'Mess Staff',
  ADMIN: 'Administrator',
};
