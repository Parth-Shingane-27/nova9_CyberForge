"""Server-side configuration for dashboard sign-in. Everything comes from the environment (.env)."""
from __future__ import annotations

import os
from dataclasses import dataclass, field

CONSUMER_DOMAINS = {"gmail.com", "googlemail.com"}


class ConfigError(RuntimeError):
    """Raised at startup when authentication is misconfigured. The app refuses to start (fail closed)."""


def _csv(value: str | None) -> frozenset[str]:
    return frozenset(p.strip().lower() for p in (value or "").split(",") if p.strip())


def _flag(value: str | None, default: bool) -> bool:
    if value is None or value.strip() == "":
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    auth_mode: str = "google"                      # "google" | "local"
    allowed_domain: str = ""
    allowed_emails: frozenset[str] = field(default_factory=frozenset)
    google_client_id: str = ""
    google_client_secret: str = ""
    oauth_redirect_uri: str = ""
    allow_local_demo_login: bool = False
    local_login_passcode: str = ""
    session_ttl_seconds: int = 3600
    cookie_secure: bool = True

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> "Settings":
        e = os.environ if env is None else env
        ttl = int(e.get("SESSION_TTL_MINUTES", "60") or "60")
        s = cls(
            auth_mode=(e.get("AUTH_MODE") or "google").strip().lower(),
            allowed_domain=(e.get("ALLOWED_DOMAIN") or "").strip().lower(),
            allowed_emails=_csv(e.get("ALLOWED_EMAILS")),
            google_client_id=(e.get("GOOGLE_CLIENT_ID") or "").strip(),
            google_client_secret=(e.get("GOOGLE_CLIENT_SECRET") or "").strip(),
            oauth_redirect_uri=(e.get("OAUTH_REDIRECT_URI") or "").strip(),
            allow_local_demo_login=_flag(e.get("ALLOW_LOCAL_DEMO_LOGIN"), False),
            local_login_passcode=e.get("LOCAL_LOGIN_PASSCODE") or "",
            session_ttl_seconds=ttl * 60,
            cookie_secure=_flag(e.get("COOKIE_SECURE"), True),
        )
        s.validate()
        return s

    def validate(self) -> None:
        if self.auth_mode not in {"google", "local"}:
            raise ConfigError("AUTH_MODE must be 'google' or 'local'.")
        if not self.allowed_domain:
            raise ConfigError("ALLOWED_DOMAIN is required.")
        if self.allowed_domain in CONSUMER_DOMAINS and not self.allowed_emails:
            raise ConfigError(
                f"ALLOWED_DOMAIN={self.allowed_domain} would admit every consumer Google account; "
                "set ALLOWED_EMAILS to an explicit allowlist."
            )
        bad = [m for m in self.allowed_emails if m.rpartition("@")[2] != self.allowed_domain]
        if bad:
            raise ConfigError("Every ALLOWED_EMAILS entry must belong to ALLOWED_DOMAIN.")
        if self.session_ttl_seconds <= 0:
            raise ConfigError("SESSION_TTL_MINUTES must be positive.")
        if self.auth_mode == "google":
            if not (self.google_client_id and self.google_client_secret and self.oauth_redirect_uri):
                raise ConfigError("AUTH_MODE=google requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and OAUTH_REDIRECT_URI.")
        else:
            if not self.allow_local_demo_login:
                raise ConfigError("AUTH_MODE=local requires ALLOW_LOCAL_DEMO_LOGIN=yes (development only).")
            if len(self.local_login_passcode) < 8:
                raise ConfigError("AUTH_MODE=local requires LOCAL_LOGIN_PASSCODE of at least 8 characters.")
            if self.cookie_secure:
                raise ConfigError("AUTH_MODE=local runs over plain http; set COOKIE_SECURE=false to acknowledge that.")
