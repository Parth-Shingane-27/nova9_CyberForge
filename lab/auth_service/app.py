"""Lab authentication service. A tiny identity provider with FAKE users; it logs every attempt itself."""
from __future__ import annotations

import hmac
import json
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from ..common import Clock, JsonlLog, log_dir

USERS_FILE = Path(__file__).resolve().parent.parent / "users.json"


def create_app(logs: Path | None = None, clock: Clock | None = None, users: dict | None = None) -> FastAPI:
    clock = clock or Clock()
    log = JsonlLog((logs or log_dir()) / "auth.jsonl", clock)
    users = users if users is not None else json.loads(USERS_FILE.read_text(encoding="utf-8"))["users"]
    app = FastAPI(title="Lab auth service", docs_url=None, redoc_url=None, openapi_url=None)

    @app.get("/health")
    def health():
        return {"status": "ok", "service": "lab-auth"}

    @app.post("/login")
    async def login(request: Request):
        try:
            body = await request.json()
            username = str(body.get("username", ""))[:64]
            password = str(body.get("password", ""))
        except Exception:
            return JSONResponse({"detail": "bad request"}, status_code=400)
        user = users.get(username)
        if user is None:
            outcome, reason = "failure", "unknown_user"
        elif hmac.compare_digest(password.encode(), user["password"].encode()):
            outcome, reason = "success", None
        else:
            outcome, reason = "failure", "bad_password"
        # passwords are never logged
        log.write({
            "event": "auth_attempt", "username": username, "outcome": outcome, "reason": reason,
            "src_ip": request.client.host if request.client else None,
            "user_agent": request.headers.get("user-agent"),
        })
        return JSONResponse({"outcome": outcome}, status_code=200 if outcome == "success" else 401)

    return app
