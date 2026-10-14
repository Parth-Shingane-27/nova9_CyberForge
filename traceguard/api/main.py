"""FastAPI app. Run:  uvicorn --factory traceguard.api.main:create_app --port 8000   (reads .env if present)."""
from __future__ import annotations

import logging

from dotenv import load_dotenv
from fastapi import FastAPI, Request

from ..config import Settings
from .auth import build_router
from .sessions import SessionStore

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")


def create_app(settings: Settings | None = None, store: SessionStore | None = None) -> FastAPI:
    if settings is None:
        load_dotenv()
        settings = Settings.from_env()  # raises ConfigError on misconfiguration: the app does not start
    store = store or SessionStore(settings.session_ttl_seconds)
    app = FastAPI(title="TraceGuard AI API", docs_url=None, redoc_url=None, openapi_url=None)

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        resp = await call_next(request)
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("Referrer-Policy", "no-referrer")
        resp.headers.setdefault("X-Frame-Options", "DENY")
        return resp

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    app.include_router(build_router(settings, store))
    app.state.settings, app.state.sessions = settings, store
    return app
