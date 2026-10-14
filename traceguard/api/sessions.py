"""Server-side session store. The browser only ever holds an opaque random id in an HttpOnly cookie."""
from __future__ import annotations

import secrets
import threading
import time
from dataclasses import dataclass


@dataclass(frozen=True)
class SessionUser:
    email: str
    name: str | None = None


class SessionStore:
    """In-memory (single process). Sessions vanish on restart, which is acceptable for the MVP."""

    def __init__(self, ttl_seconds: int, clock=time.monotonic):
        self._ttl = ttl_seconds
        self._clock = clock
        self._items: dict[str, tuple[SessionUser, float]] = {}
        self._lock = threading.Lock()

    def create(self, user: SessionUser) -> str:
        sid = secrets.token_urlsafe(32)
        with self._lock:
            self._purge()
            self._items[sid] = (user, self._clock() + self._ttl)
        return sid

    def get(self, sid: str | None) -> SessionUser | None:
        if not sid:
            return None
        with self._lock:
            item = self._items.get(sid)
            if item is None:
                return None
            user, expires = item
            if self._clock() >= expires:  # absolute expiry, no sliding window
                del self._items[sid]
                return None
            return user

    def delete(self, sid: str | None) -> None:
        if sid:
            with self._lock:
                self._items.pop(sid, None)

    def _purge(self) -> None:
        now = self._clock()
        for k in [k for k, (_, exp) in self._items.items() if now >= exp]:
            del self._items[k]
