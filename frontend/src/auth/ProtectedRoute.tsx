import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

/**
 * Gate for every console route. Renders children only when the SERVER says the session is valid.
 * Anything else (anonymous, backend down, malformed answer) means no access: fail closed.
 * This is a UX gate; the backend must still authorise every API request itself.
 */
export function ProtectedRoute() {
  const { state } = useAuth();
  const loc = useLocation();

  if (state.status === 'loading') {
    return (
      <div className="grid min-h-screen place-items-center bg-obsidian" role="status" aria-live="polite">
        <div className="flex items-center gap-3 text-sm text-muted">
          <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-cyan" />
          Checking your session…
        </div>
      </div>
    );
  }
  if (state.status !== 'authenticated') {
    const from = loc.pathname + loc.search + loc.hash;
    return <Navigate to="/signin" replace state={{ from, unavailable: state.status === 'unavailable' ? state.reason : undefined }} />;
  }
  return <Outlet />;
}
