import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { endSession, fetchSession, type AuthState } from './auth';

interface AuthValue {
  state: AuthState;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const refresh = useCallback(async () => { setState(await fetchSession()); }, []);

  useEffect(() => {
    const ctl = new AbortController();
    fetchSession(ctl.signal).then((s) => { if (!ctl.signal.aborted) setState(s); });
    return () => ctl.abort();
  }, []);

  // never trust local state after logout: ask the server again
  const logout = useCallback(async () => { await endSession(); setState(await fetchSession()); }, []);

  const value = useMemo(() => ({ state, refresh, logout }), [state, refresh, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
