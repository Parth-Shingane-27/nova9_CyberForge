"""Lab web server. Harmless pages only. It logs every request itself, including redirect hops."""
from __future__ import annotations

import secrets
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response

from ..common import Clock, JsonlLog, log_dir

PAGE = "<!doctype html><meta charset=utf-8><title>{t}</title><h1>{t}</h1><p>Harmless lab test page. No form, no script, nothing is collected.</p>"


def create_app(logs: Path | None = None, clock: Clock | None = None) -> FastAPI:
    clock = clock or Clock()
    log = JsonlLog((logs or log_dir()) / "web.jsonl", clock)
    app = FastAPI(title="Lab web server", docs_url=None, redoc_url=None, openapi_url=None)

    def record(request: Request, status: int, session: str, redirect_to: str | None = None) -> None:
        log.write({
            "event": "web_request", "method": request.method, "host": request.headers.get("host"),
            "path": request.url.path, "query": request.url.query or None, "status": status,
            "src_ip": request.client.host if request.client else None, "session": session,
            "referrer": request.headers.get("referer"), "user_agent": request.headers.get("user-agent"),
            "redirect_to": redirect_to,
        })

    def respond(request: Request, resp: Response, session_new: bool, session: str) -> Response:
        if session_new:  # the SERVER assigns session ids; clients cannot choose them
            resp.set_cookie("lab_sid", session, httponly=True, samesite="lax")
        record(request, resp.status_code, session, resp.headers.get("location"))
        return resp

    def session_of(request: Request) -> tuple[str, bool]:
        sid = request.cookies.get("lab_sid")
        if sid and len(sid) <= 40 and sid.startswith("s-"):
            return sid, False
        return "s-" + secrets.token_hex(4), True

    @app.get("/health")
    def health():
        return {"status": "ok", "service": "lab-web"}

    @app.get("/reset", response_class=HTMLResponse)
    def reset(request: Request):
        sid, new = session_of(request)
        return respond(request, HTMLResponse(PAGE.format(t="Account reset (lab test page)")), new, sid)

    @app.get("/go/{slug}")
    def go(request: Request, slug: str, t: str | None = None):
        sid, new = session_of(request)
        target = "/reset" + (f"?t={t}" if t else "")
        return respond(request, RedirectResponse(target, status_code=302), new, sid)

    @app.get("/{page}", response_class=HTMLResponse)
    def page(request: Request, page: str):
        sid, new = session_of(request)
        if page not in {"announcements", "news", "docs", "calendar", "holidays"}:
            return respond(request, HTMLResponse(PAGE.format(t="Not found"), status_code=404), new, sid)
        return respond(request, HTMLResponse(PAGE.format(t=page.capitalize() + " (lab)")), new, sid)

    return app
