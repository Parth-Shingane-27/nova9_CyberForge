import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Icon, Logo } from '../landing/ui';

/**
 * MOUNT POINT for the existing TraceGuard dashboard.
 *
 * No dashboard exists in this repository yet (only the planning docs), so this is a clearly labelled
 * placeholder, not a second dashboard. When the real console lands, render it here and keep the
 * <ProtectedRoute> wrapper in App.tsx. Do not duplicate auth state: use useAuth().
 */
export default function Console() {
  const { state, logout } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { document.title = 'Console — TraceGuard AI'; }, []);
  if (state.status !== 'authenticated') return null; // ProtectedRoute already guards this

  // navigate first: once the session state flips, ProtectedRoute would otherwise redirect to /signin
  const signOut = async () => { navigate('/', { replace: true }); await logout(); };

  return (
    <div className="min-h-screen bg-obsidian">
      <header className="border-b border-line bg-surface/60">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link to="/" className="flex items-center gap-3" aria-label="TraceGuard AI home"><Logo /><span className="font-semibold">TraceGuard AI</span></Link>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-[16rem] truncate text-sm text-muted sm:block" title={state.user.email}>{state.user.email}</span>
            <button type="button" onClick={() => void signOut()} className="rounded-lg border border-line px-3 py-2 text-sm font-medium transition hover:border-cyan/60">Sign out</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
        <div className="glass hairline-top rounded-3xl p-8">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-warn"><Icon name="alert" className="h-4 w-4" />Placeholder</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">You are signed in</h1>
          <p className="mt-3 leading-relaxed text-muted">
            The investigation console is not implemented in this repository yet. This route is where the existing dashboard mounts
            (<span className="font-mono text-ice">src/pages/Console.tsx</span>), behind the same server-verified session.
          </p>
        </div>
      </main>
    </div>
  );
}
