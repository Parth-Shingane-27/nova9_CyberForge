"""Tests for dashboard sign-in. Google calls are replaced; no network and no real credentials are used."""
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient

from traceguard.api import auth as auth_mod
from traceguard.api.main import create_app
from traceguard.api.sessions import SessionStore, SessionUser
from traceguard.config import ConfigError, Settings

ALLOWED = frozenset({"member.one@gmail.com", "member.two@gmail.com"})
PASSCODE = "correct-horse-battery"


def google_settings(**kw) -> Settings:
    base = dict(auth_mode="google", allowed_domain="gmail.com", allowed_emails=ALLOWED, google_client_id="cid.example",
                google_client_secret="secret.example", oauth_redirect_uri="http://localhost:5173/api/auth/callback",
                session_ttl_seconds=3600, cookie_secure=True)
    base.update(kw)
    s = Settings(**base)
    s.validate()
    return s


def local_settings(**kw) -> Settings:
    base = dict(auth_mode="local", allowed_domain="gmail.com", allowed_emails=ALLOWED, allow_local_demo_login=True,
                local_login_passcode=PASSCODE, cookie_secure=False)
    base.update(kw)
    s = Settings(**base)
    s.validate()
    return s


def client(settings, **kw) -> TestClient:
    # Secure cookies are (correctly) only sent over https, so the test client matches the setting.
    base = "https://localhost" if settings.cookie_secure else "http://localhost"
    return TestClient(create_app(settings, **kw), follow_redirects=False, base_url=base)


# ---------------------------------------------------------------- configuration fails closed
def test_gmail_domain_without_allowlist_refuses_to_start():
    with pytest.raises(ConfigError):
        google_settings(allowed_emails=frozenset())


def test_allowlist_entries_must_match_domain():
    with pytest.raises(ConfigError):
        google_settings(allowed_emails=frozenset({"someone@other.example"}))


def test_google_mode_requires_client_config():
    with pytest.raises(ConfigError):
        google_settings(google_client_id="")


def test_local_mode_requires_explicit_flag_passcode_and_acknowledged_http():
    with pytest.raises(ConfigError):
        local_settings(allow_local_demo_login=False)
    with pytest.raises(ConfigError):
        local_settings(local_login_passcode="short")
    with pytest.raises(ConfigError):
        local_settings(cookie_secure=True)


def test_from_env_reads_values():
    s = Settings.from_env({"AUTH_MODE": "google", "ALLOWED_DOMAIN": "Example.EDU", "GOOGLE_CLIENT_ID": "a",
                           "GOOGLE_CLIENT_SECRET": "b", "OAUTH_REDIRECT_URI": "http://x/cb", "SESSION_TTL_MINUTES": "5"})
    assert s.allowed_domain == "example.edu" and s.session_ttl_seconds == 300


# ---------------------------------------------------------------- redirect safety
@pytest.mark.parametrize("bad", ["//evil.example", "https://evil.example", "/\\evil.example", "javascript:alert(1)",
                                 "/ok\r\nSet-Cookie: x=1", "", None, "/signin", "/api/auth/logout"])
def test_safe_next_rejects_unsafe_values(bad):
    assert auth_mod.safe_next(bad) == "/console"


def test_safe_next_keeps_internal_paths():
    assert auth_mod.safe_next("/console/incidents?id=1") == "/console/incidents?id=1"


# ---------------------------------------------------------------- identity authorization
def claims(**kw):
    c = {"email": "member.one@gmail.com", "email_verified": True, "name": "Member One"}
    c.update(kw)
    return c


@pytest.mark.parametrize("override,ok", [
    ({}, True),
    ({"email_verified": False}, False),
    ({"email_verified": "true"}, False),          # must be the boolean True
    ({"email": "stranger@gmail.com"}, False),      # right domain, not on the allowlist
    ({"email": "member.one@other.example"}, False),
    ({"email": ""}, False),
    ({"email": "MEMBER.ONE@GMAIL.COM"}, True),
])
def test_authorize_identity_consumer(override, ok):
    assert auth_mod.authorize_identity(claims(**override), google_settings())[0] is ok


def test_authorize_identity_workspace_requires_matching_hd():
    s = google_settings(allowed_domain="example.edu", allowed_emails=frozenset())
    good = {"email": "a@example.edu", "email_verified": True, "hd": "example.edu"}
    assert auth_mod.authorize_identity(good, s)[0] is True
    assert auth_mod.authorize_identity({**good, "hd": "evil.example"}, s)[0] is False
    assert auth_mod.authorize_identity({k: v for k, v in good.items() if k != "hd"}, s)[0] is False


# ---------------------------------------------------------------- session store
def test_session_expires_absolutely():
    now = [0.0]
    st = SessionStore(10, clock=lambda: now[0])
    sid = st.create(SessionUser("a@x.y"))
    assert st.get(sid) is not None
    now[0] = 11
    assert st.get(sid) is None and st.get("nonsense") is None and st.get(None) is None


# ---------------------------------------------------------------- local demo login flow
def local_login(c, email="member.one@gmail.com", passcode=PASSCODE, nxt="/console"):
    return c.post("/api/auth/local-login", content=f"email={email}&passcode={passcode}&next={nxt}",
                  headers={"content-type": "application/x-www-form-urlencoded"})


def test_me_is_401_when_anonymous():
    r = client(local_settings()).get("/api/auth/me")
    assert r.status_code == 401 and r.headers["cache-control"] == "no-store"


def test_local_login_page_is_clearly_marked_and_escapes_next():
    r = client(local_settings()).get("/api/auth/login", params={"next": '/x"><script>alert(1)</script>'})
    assert "LOCAL DEMO LOGIN" in r.text and "not production authentication" in r.text and "<script>alert(1)" not in r.text


def test_local_login_full_cycle():
    c = client(local_settings())
    r = local_login(c)
    assert r.status_code == 303 and r.headers["location"] == "/console"
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie and "path=/" in cookie
    me = c.get("/api/auth/me")
    assert me.status_code == 200 and me.json() == {"email": "member.one@gmail.com"}
    # logout needs the CSRF header
    assert c.post("/api/auth/logout").status_code == 403
    assert c.get("/api/auth/me").status_code == 200
    assert c.post("/api/auth/logout", headers={"X-TraceGuard-CSRF": "1"}).status_code == 204
    assert c.get("/api/auth/me").status_code == 401


def test_local_login_rejects_wrong_passcode_and_unlisted_email_with_same_response():
    c = client(local_settings())
    a, b = local_login(c, passcode="wrong-passcode"), local_login(c, email="stranger@gmail.com")
    assert a.status_code == b.status_code == 401 and a.text == b.text
    assert c.get("/api/auth/me").status_code == 401


def test_local_login_next_cannot_redirect_off_site():
    r = local_login(client(local_settings()), nxt="//evil.example")
    assert r.headers["location"] == "/console"


def test_local_login_is_throttled():
    c = client(local_settings())
    codes = [local_login(c, passcode="wrong-passcode").status_code for _ in range(6)]
    assert codes[:5] == [401] * 5 and codes[5] == 429
    assert local_login(c).status_code == 429  # even the right passcode is refused while throttled


def test_local_endpoints_do_not_exist_in_google_mode():
    c = client(google_settings())
    assert c.post("/api/auth/local-login", content="email=a&passcode=b").status_code == 404


def test_session_expiry_returns_401():
    now = [0.0]
    store = SessionStore(60, clock=lambda: now[0])
    c = client(local_settings(), store=store)
    local_login(c)
    assert c.get("/api/auth/me").status_code == 200
    now[0] = 61
    assert c.get("/api/auth/me").status_code == 401


# ---------------------------------------------------------------- Google flow (network replaced)
def start_google(c):
    r = c.get("/api/auth/login", params={"next": "/console/x"})
    assert r.status_code == 303
    q = parse_qs(urlparse(r.headers["location"]).query)
    return r, q


def test_google_login_redirect_has_state_nonce_and_pkce():
    c = client(google_settings())
    r, q = start_google(c)
    assert r.headers["location"].startswith("https://accounts.google.com/")
    assert q["code_challenge_method"] == ["S256"] and q["state"] and q["nonce"] and q["client_id"] == ["cid.example"]
    assert "tg_oauth" in r.headers["set-cookie"] and "httponly" in r.headers["set-cookie"].lower()


def fake_google(monkeypatch, id_claims):
    monkeypatch.setattr(auth_mod, "exchange_code", lambda s, code, verifier: "raw-token")
    monkeypatch.setattr(auth_mod, "verify_id_token", lambda s, raw: dict(id_claims))


def test_google_callback_success_creates_session_and_restores_destination(monkeypatch):
    c = client(google_settings())
    _, q = start_google(c)
    fake_google(monkeypatch, claims(nonce=q["nonce"][0]))
    r = c.get("/api/auth/callback", params={"code": "abc", "state": q["state"][0]})
    assert r.status_code == 303 and r.headers["location"] == "/console/x"
    assert c.get("/api/auth/me").json()["email"] == "member.one@gmail.com"


def test_google_callback_rejects_unlisted_account_even_though_google_authenticated_it(monkeypatch):
    c = client(google_settings())
    _, q = start_google(c)
    fake_google(monkeypatch, claims(email="stranger@gmail.com", nonce=q["nonce"][0]))
    r = c.get("/api/auth/callback", params={"code": "abc", "state": q["state"][0]})
    assert r.headers["location"] == "/signin?error=not_authorized"
    assert c.get("/api/auth/me").status_code == 401


def test_google_callback_rejects_wrong_nonce(monkeypatch):
    c = client(google_settings())
    _, q = start_google(c)
    fake_google(monkeypatch, claims(nonce="someone-elses"))
    r = c.get("/api/auth/callback", params={"code": "abc", "state": q["state"][0]})
    assert r.headers["location"].endswith("not_authorized") and c.get("/api/auth/me").status_code == 401


def test_google_callback_rejects_state_not_bound_to_this_browser(monkeypatch):
    victim = client(google_settings())
    _, q = start_google(victim)
    attacker = TestClient(victim.app, follow_redirects=False, base_url=str(victim.base_url))  # no oauth cookie
    fake_google(monkeypatch, claims(nonce=q["nonce"][0]))
    r = attacker.get("/api/auth/callback", params={"code": "abc", "state": q["state"][0]})
    assert r.headers["location"].endswith("not_authorized") and attacker.get("/api/auth/me").status_code == 401


def test_google_callback_state_is_single_use(monkeypatch):
    c = client(google_settings())
    _, q = start_google(c)
    fake_google(monkeypatch, claims(nonce=q["nonce"][0]))
    assert c.get("/api/auth/callback", params={"code": "a", "state": q["state"][0]}).headers["location"] == "/console/x"
    c.cookies.set("tg_oauth", q["state"][0], path="/api/auth")
    again = c.get("/api/auth/callback", params={"code": "a", "state": q["state"][0]})
    assert again.headers["location"].endswith("not_authorized")


def test_google_callback_verification_failure_is_rejected(monkeypatch):
    c = client(google_settings())
    _, q = start_google(c)
    monkeypatch.setattr(auth_mod, "exchange_code", lambda s, code, verifier: "raw")

    def boom(s, raw):
        raise ValueError("bad signature")

    monkeypatch.setattr(auth_mod, "verify_id_token", boom)
    r = c.get("/api/auth/callback", params={"code": "abc", "state": q["state"][0]})
    assert r.headers["location"].endswith("not_authorized") and c.get("/api/auth/me").status_code == 401


def test_google_callback_missing_params_or_google_error():
    c = client(google_settings())
    assert c.get("/api/auth/callback").headers["location"].endswith("not_authorized")
    assert c.get("/api/auth/callback", params={"error": "access_denied"}).headers["location"].endswith("not_authorized")


def test_security_headers_present():
    r = client(local_settings()).get("/api/health")
    assert r.headers["x-content-type-options"] == "nosniff" and r.headers["x-frame-options"] == "DENY"
