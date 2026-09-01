import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { User } from '@shared/types';
import { api, tokenStore } from '@/lib/api';

interface AuthContextValue {
  user: User | null;
  /** True until the stored token has been checked against the server. */
  booting: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: {
    name: string;
    email: string;
    password: string;
    company?: string;
  }) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);

  // A token in localStorage is a claim, not proof — verify it before trusting it.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!tokenStore.get()) {
        if (!cancelled) setBooting(false);
        return;
      }
      try {
        const { user: me } = await api.me();
        if (!cancelled) setUser(me);
      } catch {
        tokenStore.clear();
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { token, user: next } = await api.login({ email, password });
    tokenStore.set(token);
    setUser(next);
  }, []);

  const register = useCallback(
    async (payload: { name: string; email: string; password: string; company?: string }) => {
      const { token, user: next } = await api.register(payload);
      tokenStore.set(token);
      setUser(next);
    },
    [],
  );

  const loginWithGoogle = useCallback(async (credential: string) => {
    const { token, user: next } = await api.google(credential);
    tokenStore.set(token);
    setUser(next);
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    // Clear per-workspace UI state so the next account starts clean.
    localStorage.removeItem('resumeai-role');
  }, []);

  const value = useMemo(
    () => ({ user, booting, login, register, loginWithGoogle, logout }),
    [user, booting, login, register, loginWithGoogle, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
