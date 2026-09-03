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
import { api } from '@/lib/api';

interface AuthContextValue {
  user: User | null;
  /** True until the cookie session has been checked against the server. */
  booting: boolean;
  login: (email: string, password: string) => Promise<void>;
  /** Resolves with the server's acknowledgement — registration grants no session. */
  register: (payload: {
    name: string;
    email: string;
    password: string;
    company?: string;
    /** Honeypot value; empty for real users. */
    website_url?: string;
  }) => Promise<string>;
  loginWithGoogle: (credential: string) => Promise<void>;
  /** Sign in to the shared demo workspace. */
  loginAsDemo: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);

  /**
   * There is no token to inspect any more — the session cookie is httpOnly and
   * invisible to this code. Asking the server who we are is the only way to
   * know, and it is also the only trustworthy one.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { user: me } = await api.me();
        if (!cancelled) setUser(me);
      } catch {
        // 401 simply means "not signed in"; nothing to clean up client-side.
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { user: next } = await api.login({ email, password });
    setUser(next);
  }, []);

  const register = useCallback(
    async (payload: {
      name: string; email: string; password: string;
      company?: string; website_url?: string;
    }) => {
      const { message } = await api.register(payload);
      return message;
    },
    [],
  );

  const loginWithGoogle = useCallback(async (credential: string) => {
    const { user: next } = await api.google(credential);
    setUser(next);
  }, []);

  const loginAsDemo = useCallback(async () => {
    const { user: next } = await api.demo();
    setUser(next);
  }, []);

  const logout = useCallback(async () => {
    try {
      // Server-side revocation is the part that matters; clearing local state
      // alone would leave the session usable by anyone holding the cookie.
      await api.logout();
    } catch {
      /* Already expired or offline — fall through and clear locally. */
    }
    setUser(null);
    localStorage.removeItem('resumeai-role');
  }, []);

  const refresh = useCallback(async () => {
    try {
      const { user: me } = await api.me();
      setUser(me);
    } catch {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, booting, login, register, loginWithGoogle, loginAsDemo, logout, refresh }),
    [user, booting, login, register, loginWithGoogle, loginAsDemo, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
