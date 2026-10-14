"""Incremental JSON-lines reader + normalisers for the lab auth and web logs.

- Reads only COMPLETE lines (ending in a newline). A half-written last line waits for the next poll.
- The checkpoint is a byte offset. It is committed with the events (see SQLiteStore.ingest_batch).
- A malformed line is recorded and skipped; it never blocks the lines after it.
"""
from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import parse_qsl

from ..schema import AUTH_ATTEMPT, WEB_REQUEST, Event

SERVICE_FOR_FILE = {"auth.jsonl": "lab-auth", "web.jsonl": "lab-web"}


class BadRecord(ValueError):
    pass


def _need(rec: dict, *keys: str) -> None:
    missing = [k for k in keys if rec.get(k) in (None, "")]
    if missing:
        raise BadRecord(f"missing required field(s): {', '.join(missing)}")


def normalize_auth(rec: dict) -> Event:
    _need(rec, "rid", "ts", "username", "outcome")
    if rec.get("event") != "auth_attempt":
        raise BadRecord(f"unexpected event kind {rec.get('event')!r}")
    return Event(
        event_type=AUTH_ATTEMPT, source_service="lab-auth", source_record_id=str(rec["rid"]), event_timestamp=str(rec["ts"]),
        target_id=str(rec["username"]), source_ip=rec.get("src_ip"), outcome=str(rec["outcome"]),
        evidence={"reason": rec.get("reason"), "user_agent": rec.get("user_agent")},
    )


def normalize_web(rec: dict) -> Event:
    _need(rec, "rid", "ts", "path", "status")
    if rec.get("event") != "web_request":
        raise BadRecord(f"unexpected event kind {rec.get('event')!r}")
    params = dict(parse_qsl(rec.get("query") or "", keep_blank_values=True))
    host = rec.get("host")
    return Event(
        event_type=WEB_REQUEST, source_service="lab-web", source_record_id=str(rec["rid"]), event_timestamp=str(rec["ts"]),
        source_ip=rec.get("src_ip"), destination=f"{host}{rec['path']}" if host else rec["path"], outcome=str(rec["status"]),
        evidence={
            "method": rec.get("method"), "host": host, "path": rec["path"], "query_params": params,
            "token": params.get("t"),            # lab-specific per-recipient link token, when present
            "session_id": rec.get("session"), "referrer": rec.get("referrer"), "user_agent": rec.get("user_agent"),
            "redirect_to": rec.get("redirect_to"),
        },
    )


NORMALIZERS = {"lab-auth": normalize_auth, "lab-web": normalize_web}


def read_new(path: Path, offset: int) -> tuple[list[Event], list[tuple[str, str, str]], int, str | None]:
    """Return (events, malformed[(location, reason, raw)], new_offset, note)."""
    path = Path(path)
    service = SERVICE_FOR_FILE.get(path.name)
    if service is None:
        raise ValueError(f"no normaliser registered for {path.name}")
    if not path.exists():
        return [], [], offset, "log file not present yet"
    size = path.stat().st_size
    note = None
    if size < offset:  # truncated or rotated: start over; dedup keeps this safe
        offset, note = 0, "log shrank; re-reading from the start (dedup makes this safe)"
    with open(path, "rb") as f:
        f.seek(offset)
        chunk = f.read()
    end = chunk.rfind(b"\n")
    if end < 0:
        return [], [], offset, note  # nothing complete yet
    events, malformed = [], []
    pos = offset
    for raw in chunk[: end + 1].split(b"\n")[:-1]:
        location = f"{path.name}@{pos}"
        pos += len(raw) + 1
        if not raw.strip():
            continue
        try:
            rec = json.loads(raw.decode("utf-8"))
            if not isinstance(rec, dict):
                raise BadRecord("line is not a JSON object")
            events.append(NORMALIZERS[service](rec))
        except (UnicodeDecodeError, json.JSONDecodeError, BadRecord, ValueError) as exc:
            malformed.append((location, f"{type(exc).__name__}: {exc}", raw[:500].decode("utf-8", "replace")))
    return events, malformed, offset + end + 1, note
