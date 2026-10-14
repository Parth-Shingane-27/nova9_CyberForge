"""Common event schema (README section 7).

Rules: unknown fields stay None (or "unknown" inside `evidence`); nothing is invented. `event_id` is a
deterministic hash of (source_service, source_record_id), so re-reading the same source record can never
create a second event.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone

EMAIL_RECEIVED = "email_received"
WEB_REQUEST = "web_request"
AUTH_ATTEMPT = "auth_attempt"
EVENT_TYPES = {EMAIL_RECEIVED, WEB_REQUEST, AUTH_ATTEMPT}

PROVENANCE_LAB = "lab-service"


def make_event_id(source_service: str, source_record_id: str) -> str:
    return hashlib.sha256(f"{source_service}\x1f{source_record_id}".encode("utf-8")).hexdigest()[:32]


def to_utc_iso(value: str) -> str:
    """Normalise any ISO-8601 timestamp (with or without offset) to UTC with millisecond precision."""
    dt = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)  # a naive timestamp is assumed UTC and flagged by callers if needed
    return dt.astimezone(timezone.utc).isoformat(timespec="milliseconds")


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


@dataclass
class Event:
    event_type: str
    source_service: str
    source_record_id: str
    event_timestamp: str                      # as reported by the source, normalised to UTC
    actor_id: str | None = None               # who acted, when the source knows
    target_id: str | None = None              # who/what was targeted (account, recipient)
    source_ip: str | None = None              # as observed by the service
    destination: str | None = None
    outcome: str | None = None
    evidence: dict = field(default_factory=dict)
    data_provenance: str = PROVENANCE_LAB
    is_simulated: bool = True
    ingestion_timestamp: str = field(default_factory=utc_now_iso)
    event_id: str = ""

    def __post_init__(self) -> None:
        if self.event_type not in EVENT_TYPES:
            raise ValueError(f"unknown event_type {self.event_type!r}")
        if not self.source_record_id:
            raise ValueError("source_record_id is required (it is the dedup key)")
        self.event_timestamp = to_utc_iso(self.event_timestamp)
        if not self.event_id:
            self.event_id = make_event_id(self.source_service, self.source_record_id)

    def to_dict(self) -> dict:
        return asdict(self)

    def evidence_json(self) -> str:
        return json.dumps(self.evidence, separators=(",", ":"), ensure_ascii=False, sort_keys=True)
