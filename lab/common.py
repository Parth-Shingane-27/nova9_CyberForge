"""Shared helpers for the lab services. The services write their OWN logs; nothing else does."""
from __future__ import annotations

import json
import os
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path


class Clock:
    """Injectable time source. Real time by default; an offset allows compressed-history scenarios later."""

    def __init__(self, offset_seconds: float = 0.0):
        self.offset = offset_seconds

    def now(self) -> datetime:
        from datetime import timedelta

        return datetime.now(timezone.utc) + timedelta(seconds=self.offset)


class JsonlLog:
    """Append-only JSON-lines log. Every line gets a unique `rid` so downstream dedup has a stable key."""

    def __init__(self, path: Path, clock: Clock):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.clock = clock
        self._lock = threading.Lock()

    def write(self, record: dict) -> dict:
        line = {"rid": uuid.uuid4().hex, "ts": self.clock.now().isoformat(timespec="milliseconds"), **record}
        text = json.dumps(line, separators=(",", ":"), ensure_ascii=False)
        with self._lock, open(self.path, "a", encoding="utf-8", newline="\n") as f:
            f.write(text + "\n")
            f.flush()
            os.fsync(f.fileno())
        return line


def log_dir() -> Path:
    return Path(os.environ.get("LAB_LOG_DIR", "data/lab/logs"))
