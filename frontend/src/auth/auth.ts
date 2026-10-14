/**
 * Frontend side of the PLANNED backend auth contract (see ../../../README.md section 13).
 * The backend does not exist in this repository yet, so these endpoints are an assumption to be
 * confirmed when it lands. The frontend never decides who is authorised: it only asks the server.
 *
 *   GET  /api/auth/me            200 {"email": string, "name"?: string}   | 401/403 = not signed in or not allowed
 *   GET  /api/auth/login?next=P  backend starts Google OAuth (or the clearly marked local demo login),
 *                                verifies the ID token and allowlist server-side, sets an HttpOnly session
 *                                cookie, then redirects the browser to the same-origin path P
 *   POST /api/auth/logout        clears the server-side session (requires header X-TraceGuard-CSRF: 1)
 */
export interface User { email: string; name?: string }

export type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; user: User }
  | { status: 'anonymous' }
  | { status: 'unavailable'; reason: string };

export const DEFAULT_DESTINATION = '/console';

/** Only same-origin absolute paths are accepted as post-login destinations (prevents open redirects). */
export function safeNext(next: string | null | undefined): string {
  if (!next) return DEFAULT_DESTINATION;
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\') || /[\r\n]/.test(next)) return DEFAULT_DESTINATION;
  if (next === '/' || next.startsWith('/signin')) return DEFAULT_DESTINATION;
  return next;
}

export function loginUrl(next: string): string {
  return `/api/auth/login?next=${encodeURIComponent(safeNext(next))}`;
}

function isUser(v: unknown): v is User {
  return typeof v === 'object' && v !== null && typeof (v as { email?: unknown }).email === 'string';
}

export async function fetchSession(signal?: AbortSignal): Promise<AuthState> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include', headers: { Accept: 'application/json' }, signal });
    if (res.status === 401 || res.status === 403) return { status: 'anonymous' };
    if (!res.ok) return { status: 'unavailable', reason: `The authentication service answered ${res.status}.` };
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('application/json')) return { status: 'unavailable', reason: 'The authentication service returned an unexpected response.' };
    const body: unknown = await res.json();
    return isUser(body) ? { status: 'authenticated', user: body } : { status: 'unavailable', reason: 'The authentication service returned an unexpected response.' };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return { status: 'loading' };
    return { status: 'unavailable', reason: 'The authentication service could not be reached.' };
  }
}

export async function endSession(): Promise<void> {
  // the custom header is the CSRF check: a cross-site form post cannot set it
  try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include', headers: { 'X-TraceGuard-CSRF': '1' } }); } catch { /* the session check below decides the outcome */ }
}
