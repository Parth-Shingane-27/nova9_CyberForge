"""SQLite store (README section 6). One writer (ingestion), many readers.

Idempotency: `event_id` is the primary key and inserts are INSERT OR IGNORE, so re-ingesting is a no-op.
Atomicity: a checkpoint is committed in the SAME transaction as the events it covers, so a crash can never
leave a checkpoint that skips events nobody stored.
"""
from __future__ import annotations

import json
import sqlite3
import threading
from pathlib import Path
from typing import Iterable, Iterator

from ..schema import Event, utc_now_iso

SCHEMA = """
CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  source_service TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  event_timestamp TEXT NOT NULL,
  ingestion_timestamp TEXT NOT NULL,
  actor_id TEXT, target_id TEXT, source_ip TEXT, destination TEXT, outcome TEXT,
  evidence TEXT NOT NULL,
  data_provenance TEXT NOT NULL,
  is_simulated INTEGER NOT NULL,
  UNIQUE (source_service, source_record_id)
);
CREATE INDEX IF NOT EXISTS ix_events_ts ON events (event_timestamp);
CREATE INDEX IF NOT EXISTS ix_events_type_ts ON events (event_type, event_timestamp);
CREATE INDEX IF NOT EXISTS ix_events_target ON events (target_id);
CREATE INDEX IF NOT EXISTS ix_events_ip ON events (source_ip);
CREATE TABLE IF NOT EXISTS checkpoints (source TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS malformed_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL, location TEXT NOT NULL, reason TEXT NOT NULL,
  raw TEXT, seen_at TEXT NOT NULL, UNIQUE (source, location)
);
"""

COLUMNS = ("event_id", "event_type", "source_service", "source_record_id", "event_timestamp", "ingestion_timestamp",
           "actor_id", "target_id", "source_ip", "destination", "outcome", "evidence", "data_provenance", "is_simulated")


class SQLiteStore:
    def __init__(self, path: str | Path):
        self.path = str(path)
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(self.path, check_same_thread=False, isolation_level=None)  # explicit transactions
        self._db.row_factory = sqlite3.Row
        self._lock = threading.RLock()
        with self._lock:
            self._db.execute("PRAGMA journal_mode=WAL")
            self._db.execute("PRAGMA synchronous=NORMAL")
            self._db.executescript(SCHEMA)

    def close(self) -> None:
        with self._lock:
            self._db.close()

    # ---- writes ---------------------------------------------------------------------------------
    def ingest_batch(self, source: str, events: Iterable[Event], malformed: Iterable[tuple[str, str, str]] = (),
                     checkpoint: str | None = None) -> dict:
        """Store events, malformed records and the new checkpoint in ONE transaction.

        Returns counts: inserted, duplicates, out_of_order (new events older than the newest event ALREADY STORED FROM THE SAME
        SOURCE SERVICE; comparing across different services would only measure which source was read first).
        """
        events = list(events)
        inserted = duplicates = out_of_order = 0
        with self._lock:
            self._db.execute("BEGIN IMMEDIATE")
            try:
                newest = {svc: self._db.execute("SELECT MAX(event_timestamp) FROM events WHERE source_service=?", (svc,)).fetchone()[0]
                          for svc in {e.source_service for e in events}}
                for e in events:
                    cur = self._db.execute(
                        f"INSERT OR IGNORE INTO events ({','.join(COLUMNS)}) VALUES ({','.join('?' * len(COLUMNS))})",
                        (e.event_id, e.event_type, e.source_service, e.source_record_id, e.event_timestamp, e.ingestion_timestamp,
                         e.actor_id, e.target_id, e.source_ip, e.destination, e.outcome, e.evidence_json(),
                         e.data_provenance, int(e.is_simulated)))
                    if cur.rowcount:
                        inserted += 1
                        if newest[e.source_service] is not None and e.event_timestamp < newest[e.source_service]:
                            out_of_order += 1
                    else:
                        duplicates += 1
                for location, reason, raw in malformed:
                    self._db.execute(
                        "INSERT OR IGNORE INTO malformed_records (source, location, reason, raw, seen_at) VALUES (?,?,?,?,?)",
                        (source, location, reason, (raw or "")[:2000], utc_now_iso()))
                if checkpoint is not None:
                    self._db.execute(
                        "INSERT INTO checkpoints (source, value, updated_at) VALUES (?,?,?) "
                        "ON CONFLICT(source) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
                        (source, checkpoint, utc_now_iso()))
                self._db.execute("COMMIT")
            except BaseException:
                self._db.execute("ROLLBACK")
                raise
        return {"inserted": inserted, "duplicates": duplicates, "out_of_order": out_of_order}

    # ---- reads ----------------------------------------------------------------------------------
    def get_checkpoint(self, source: str) -> str | None:
        with self._lock:
            row = self._db.execute("SELECT value FROM checkpoints WHERE source=?", (source,)).fetchone()
        return row["value"] if row else None

    def has_event(self, event_id: str) -> bool:
        with self._lock:
            return self._db.execute("SELECT 1 FROM events WHERE event_id=?", (event_id,)).fetchone() is not None

    def count(self, event_type: str | None = None) -> int:
        q, args = "SELECT COUNT(*) FROM events", ()
        if event_type:
            q, args = q + " WHERE event_type=?", (event_type,)
        with self._lock:
            return self._db.execute(q, args).fetchone()[0]

    def malformed_count(self) -> int:
        with self._lock:
            return self._db.execute("SELECT COUNT(*) FROM malformed_records").fetchone()[0]

    def iter_events(self, event_type: str | None = None, since: str | None = None, until: str | None = None) -> Iterator[dict]:
        clauses, args = [], []
        if event_type:
            clauses.append("event_type=?"); args.append(event_type)
        if since:
            clauses.append("event_timestamp>=?"); args.append(since)
        if until:
            clauses.append("event_timestamp<=?"); args.append(until)
        where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
        with self._lock:
            rows = self._db.execute(f"SELECT * FROM events{where} ORDER BY event_timestamp, event_id", args).fetchall()
        for r in rows:
            d = dict(r)
            d["evidence"] = json.loads(d["evidence"])
            d["is_simulated"] = bool(d["is_simulated"])
            yield d
