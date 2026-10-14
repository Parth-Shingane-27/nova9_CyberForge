import { useEffect } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { loginUrl, safeNext } from '../auth/auth';
import { Icon, Logo } from '../landing/ui';

interface LocState { from?: string; unavailable?: string }

export default function SignIn() {
  const { state, refresh } = useAuth();
  const [params] = useSearchParams();
  const loc = useLocation();
  const locState = (loc.state ?? {}) as LocState;
  const next = safeNext(params.get('next') ?? locState.from);

  useEffect(() => { document.title = 'Sign in — TraceGuard AI'; }, []);

  if (state.status === 'authenticated') return <Navigate to={next} replace />;

  const unavailable = state.status === 'unavailable' ? state.reason : locState.unavailable;
  // the server only ever sends a fixed code, never free text, so nothing attacker-controlled is rendered
  const rejected = params.get('error') === 'not_authorized';

  return (
    <div className="relative isolate grid min-h-screen place-items-center overflow-hidden px-5 py-10">
      <div className="bg-aurora absolute inset-0 -z-10" aria-hidden="true" />
      <div className="bg-grid absolute inset-0 -z-10" aria-hidden="true" />
      <main className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-3" aria-label="TraceGuard AI home">
          <Logo className="h-10 w-10" /><span className="text-lg font-semibold tracking-tight">TraceGuard AI</span>
        </Link>

        <div className="glass hairline-top rounded-3xl p-7 sm:p-9">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in to the console</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Access is limited to authorised accounts. Your identity is verified by the server; this page cannot grant access.
          </p>

          {rejected && (
            <div role="alert" className="mt-5 rounded-xl border border-crit/40 bg-crit/10 p-4 text-sm text-crit">
              <p className="flex items-center gap-2 font-medium"><Icon name="lock" className="h-4 w-4" />This account is not authorised</p>
              <p className="mt-1.5 leading-relaxed text-crit/90">Signing in with Google worked, but this account is not on the access list for TraceGuard AI. Try a different account or ask the project team.</p>
            </div>
          )}

          {unavailable && (
            <div role="alert" className="mt-5 rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm text-warn">
              <p className="flex items-center gap-2 font-medium"><Icon name="alert" className="h-4 w-4" />Sign-in is unavailable right now</p>
              <p className="mt-1.5 leading-relaxed text-warn/90">{unavailable} The backend authentication endpoints are planned but may not be running yet.</p>
              <button type="button" onClick={() => void refresh()} className="mt-3 rounded-lg border border-warn/50 px-3 py-1.5 text-xs font-semibold hover:bg-warn/10">Try again</button>
            </div>
          )}

          {state.status === 'loading' ? (
            <p className="mt-6 text-sm text-muted" role="status">Checking your session…</p>
          ) : (
            <a href={loginUrl(next)}
              className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-xl bg-cyan px-5 py-3 text-sm font-semibold text-obsidian transition hover:bg-ice">
              <Icon name="lock" className="h-4 w-4" />Continue to sign in
            </a>
          )}

          <p className="mt-5 text-xs leading-relaxed text-muted">
            The server decides how you sign in (Google OAuth with an allowlist, or a clearly marked local demo login when configured). You will return to <span className="font-mono text-ice">{next}</span> afterwards.
          </p>
        </div>

        <p className="mt-6 text-center text-sm"><Link to="/" className="text-muted transition hover:text-ink">← Back to the overview</Link></p>
      </main>
    </div>
  );
}
