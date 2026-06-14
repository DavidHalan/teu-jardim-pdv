import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { AuthUser, LoginResponse } from '@teu-jardim/shared';
import { api } from '../lib/api';
import { authStore } from './auth-store';

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  useEffect(() => {
    authStore.hydrate();
  }, []);

  const state = useSyncExternalStore(authStore.subscribe, authStore.getState, authStore.getState);

  const value: AuthContextValue = {
    user: state.user,
    isAuthenticated: Boolean(state.token),
    login: async (username, password) => {
      const res = await api.post<LoginResponse>('/auth/login', { username, password });
      authStore.set(res.accessToken, res.user);
    },
    logout: () => authStore.clear(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  return ctx;
}
