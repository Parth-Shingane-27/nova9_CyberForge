"""Dashboard sign-in. Implements the contract the frontend expects (frontend/src/auth/auth.ts):

    GET  /api/auth/me            200 {"email","name"?} | 401
    GET  /api/auth/login?next=P  start sign-in (Google OAuth, or the guarded local demo login)
    GET  /api/auth/callback      Google redirect target
    POST /api/auth/local-login   local demo login submit (AUTH_MODE=local only)
    POST /api/auth/logout        end the session (requires the CSRF header)

Identity is decided here, on the server. A successful Google sign-in is NOT access to anyone's Gmail or to
Workspace audit data; this module only decides who may open the dashboard.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import html
import logging
import secrets
import threading
import time
from urllib.parse import parse_qs, urlencode

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response

from ..config import CONSUMER_DOMAINS, Settings
from .sessions import SessionStore, SessionUser

audit = logging.getLogger("traceguard.audit")

SESSION_COOKIE = "tg_session"
OAUTH_COOKIE = "tg_oauth"
CSRF_HEADER = "x-traceguard-csrf"
DEFAULT_NEXT = "/console"
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
PENDING_TTL = 600  # seconds to complete the Google round trip


def safe_next(value: str | None) -> str:
    """Same-origin absolute paths only; anything else becomes the default (prevents open redirects)."""
    if not value or not value.startswith("/") or value.startswith("//") or "\\" in value or any(c in value for c in "\r\n\x00"):
        return DEFAULT_NEXT
    if value == "/" or value.startswith("/signin") or value.startswith("/api/"):
        return DEFAULT_NEXT
    return value


def authorize_identity(claims: dict, s: Settings) -> tuple[bool, str]:
    """Server-side authorization of a verified Google identity. Returns (allowed, internal reason)."""
    email = str(claims.get("email") or "").strip().lower()
    if not email or "@" not in email:
        return False, "no email claim"
    if claims.get("email_verified") is not True:
        return False, "email not verified"
    if email.rpartition("@")[2] != s.allowed_domain:
        return False, "domain not allowed"
    if s.allowed_emails and email not in s.allowed_emails:
        return False, "email not on allowlist"
    if s.allowed_domain not in CONSUMER_DOMAINS and claims.get("hd") != s.allowed_domain:
        return False, "hosted-domain claim mismatch"  # Workspace accounts must carry the matching hd claim
    return True, "ok"


def local_login_allowed(email: str, s: Settings) -> bool:
    email = email.strip().lower()
    return email.rpartition("@")[2] == s.allowed_domain and (not s.allowed_emails or email in s.allowed_emails)


# --- Google calls, isolated so tests can replace them -------------------------------------------------
def exchange_code(s: Settings, code: str, verifier: str) -> str:
    """Trade the authorization code for a raw ID token."""
    resp = httpx.post(
        GOOGLE_TOKEN_URL,
        data={
            "code": code, "client_id": s.google_client_id, "client_secret": s.google_client_secret,
            "redirect_uri": s.oauth_redirect_uri, "grant_type": "authorization_code", "code_verifier": verifier,
        },
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()["id_token"]


def verify_id_token(s: Settings, raw: str) -> dict:
    """Verifies signature, issuer, audience and expiry with Google's public keys."""
    from google.auth.transport import requests as g_requests
    from google.oauth2 import id_token

    return id_token.verify_oauth2_token(raw, g_requests.Request(), s.google_client_id)


# ------------------------------------------------------------------------------------------------------
class _Throttle:
    """Tiny in-memory failure limiter for the local passcode."""

    def __init__(self, limit: int = 5, window: int = 300, clock=time.monotonic):
        self.limit, self.window, self.clock = limit, window, clock
        self._fails: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def blocked(self, key: str) -> bool:
        with self._lock:
            now = self.clock()
            recent = [t for t in self._fails.get(key, []) if now - t < self.window]
            self._fails[key] = recent
            return len(recent) >= self.limit

    def fail(self, key: str) -> None:
        with self._lock:
            self._fails.setdefault(key, []).append(self.clock())


def _pkce_challenge(verifier: str) -> str:
    return base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def build_router(s: Settings, store: SessionStore) -> APIRouter:
    router = APIRouter(prefix="/api/auth")
    pending: dict[str, dict] = {}  # state -> {verifier, nonce, next, exp}
    pending_lock = threading.Lock()
    throttle = _Throttle()

    def set_session(resp: Response, user: SessionUser) -> None:
        resp.set_cookie(SESSION_COOKIE, store.create(user), max_age=s.session_ttl_seconds, httponly=True,
                        secure=s.cookie_secure, samesite="lax", path="/")

    def no_store(resp: Response) -> Response:
        resp.headers["Cache-Control"] = "no-store"
        return resp

    @router.get("/me")
    def me(request: Request):
        user = store.get(request.cookies.get(SESSION_COOKIE))
        if user is None:
            return no_store(JSONResponse({"detail": "unauthenticated"}, status_code=401))
        body = {"email": user.email}
        if user.name:
            body["name"] = user.name
        return no_store(JSONResponse(body))

    @router.get("/login")
    def login(request: Request, next: str | None = None):
        nxt = safe_next(next)
        if s.auth_mode == "local":
            return no_store(HTMLResponse(_local_login_page(nxt, error=False)))

        state, nonce, verifier = (secrets.token_urlsafe(24) for _ in range(3))
        with pending_lock:
            now = time.monotonic()
            for k in [k for k, v in pending.items() if v["exp"] < now]:
                del pending[k]
            pending[state] = {"verifier": verifier, "nonce": nonce, "next": nxt, "exp": now + PENDING_TTL}
        params = {
            "client_id": s.google_client_id, "redirect_uri": s.oauth_redirect_uri, "response_type": "code",
            "scope": "openid email profile", "state": state, "nonce": nonce,
            "code_challenge": _pkce_challenge(verifier), "code_challenge_method": "S256",
            "prompt": "select_account",
        }
        resp = RedirectResponse(f"{GOOGLE_AUTH_URL}?{urlencode(params)}", status_code=303)
        # binds the flow to this browser, so a callback replayed from another browser is rejected
        resp.set_cookie(OAUTH_COOKIE, state, max_age=PENDING_TTL, httponly=True, secure=s.cookie_secure, samesite="lax", path="/api/auth")
        return no_store(resp)

    def reject(reason: str, request: Request) -> Response:
        audit.warning("sign-in rejected ip=%s reason=%s", _client_ip(request), reason)
        resp = RedirectResponse("/signin?error=not_authorized", status_code=303)
        resp.delete_cookie(OAUTH_COOKIE, path="/api/auth")
        return no_store(resp)

    @router.get("/callback")
    def callback(request: Request, code: str | None = None, state: str | None = None, error: str | None = None):
        if s.auth_mode != "google":
            return Response(status_code=404)
        if error or not code or not state:
            return reject("google returned an error or missing parameters", request)
        cookie_state = request.cookies.get(OAUTH_COOKIE)
        if not cookie_state or not hmac.compare_digest(cookie_state, state):
            return reject("state does not match the browser cookie", request)
        with pending_lock:
            flow = pending.pop(state, None)
        if flow is None or flow["exp"] < time.monotonic():
            return reject("unknown or expired state", request)
        try:
            claims = verify_id_token(s, exchange_code(s, code, flow["verifier"]))
        except Exception as exc:  # signature, audience, expiry, network: all mean "no"
            return reject(f"token exchange or verification failed: {type(exc).__name__}", request)
        if claims.get("nonce") != flow["nonce"]:
            return reject("nonce mismatch", request)
        ok, why = authorize_identity(claims, s)
        if not ok:
            return reject(why, request)
        user = SessionUser(email=str(claims["email"]).lower(), name=claims.get("name"))
        resp = RedirectResponse(flow["next"], status_code=303)
        resp.delete_cookie(OAUTH_COOKIE, path="/api/auth")
        set_session(resp, user)
        audit.info("sign-in ok email=%s ip=%s", user.email, _client_ip(request))
        return no_store(resp)

    @router.post("/local-login")
    async def local_login(request: Request):
        if s.auth_mode != "local":
            return Response(status_code=404)
        form = {k: v[0] for k, v in parse_qs((await request.body()).decode("utf-8", "replace"), keep_blank_values=True).items()}
        nxt = safe_next(form.get("next"))
        ip = _client_ip(request)
        if throttle.blocked(ip):
            audit.warning("local sign-in throttled ip=%s", ip)
            return no_store(HTMLResponse(_local_login_page(nxt, error=True), status_code=429))
        email = (form.get("email") or "").strip().lower()
        pass_ok = hmac.compare_digest((form.get("passcode") or "").encode(), s.local_login_passcode.encode())
        if not (pass_ok and local_login_allowed(email, s)):
            throttle.fail(ip)
            audit.warning("local sign-in rejected ip=%s", ip)
            return no_store(HTMLResponse(_local_login_page(nxt, error=True), status_code=401))
        resp = RedirectResponse(nxt, status_code=303)
        set_session(resp, SessionUser(email=email))
        audit.info("local sign-in ok email=%s ip=%s", email, ip)
        return no_store(resp)

    @router.post("/logout")
    def logout(request: Request):
        # A custom header cannot be set by a cross-site form post, so its presence is the CSRF check.
        if request.headers.get(CSRF_HEADER) != "1":
            return JSONResponse({"detail": "missing csrf header"}, status_code=403)
        sid = request.cookies.get(SESSION_COOKIE)
        user = store.get(sid)
        store.delete(sid)
        if user:
            audit.info("sign-out email=%s", user.email)
        resp = Response(status_code=204)
        resp.delete_cookie(SESSION_COOKIE, path="/")
        return no_store(resp)

    return router


def _local_login_page(next_path: str, error: bool) -> str:
    err = '<p role="alert" class="err">Sign-in failed. Check the email and passcode.</p>' if error else ""
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Local demo login — TraceGuard AI</title>
<style>
body{{margin:0;min-height:100vh;display:grid;place-items:center;background:#080B12;color:#F3F6FB;font:16px/1.5 system-ui,sans-serif}}
main{{width:min(420px,92vw);background:#101725;border:1px solid #263247;border-radius:20px;padding:28px}}
.banner{{background:#2b2110;border:1px solid #F4BD70;color:#F4BD70;border-radius:10px;padding:10px 12px;font-size:13px}}
label{{display:block;margin-top:16px;font-size:14px;color:#A4B0C2}}
input{{width:100%;box-sizing:border-box;margin-top:6px;padding:11px 12px;border-radius:10px;border:1px solid #263247;background:#080B12;color:#F3F6FB;font:inherit}}
input:focus-visible,button:focus-visible{{outline:2px solid #53D8E8;outline-offset:2px}}
button{{margin-top:20px;width:100%;padding:12px;border:0;border-radius:12px;background:#53D8E8;color:#080B12;font:600 15px system-ui;cursor:pointer}}
.err{{color:#FF7185;font-size:14px}}
</style></head><body><main>
<p class="banner"><strong>LOCAL DEMO LOGIN — development only.</strong> This is not production authentication. Production uses Google sign-in with a server-side allowlist.</p>
<h1 style="font-size:22px;margin:18px 0 0">Sign in</h1>{err}
<form method="post" action="/api/auth/local-login">
<input type="hidden" name="next" value="{html.escape(next_path, quote=True)}">
<label>Allow-listed email<input name="email" type="email" autocomplete="username" required></label>
<label>Passcode (set in the server environment)<input name="passcode" type="password" autocomplete="current-password" required></label>
<button type="submit">Sign in</button></form></main></body></html>"""
