"""Ingest orchestration.

  python -m traceguard.ingest --once                 # one pass, print a report
  python -m traceguard.ingest --watch --interval 2   # keep polling

A source that is down is reported and skipped; the other sources still ingest and no checkpoint moves for the
failed one, so nothing is lost.
"""
from __future__ import annotations

import argparse
import json
import time
from dataclasses import dataclass
from pathlib import Path

import httpx

from ..store.sqlite import SQLiteStore
from . import jsonl
from .mailpit import MailpitSource

ROOT = Path(__file__).resolve().parent.parent.parent


@dataclass(frozen=True)
class IngestConfig:
    mail_api: str = "http://127.0.0.1:8025"
    log_dir: Path = ROOT / "data" / "lab" / "logs"
    db_path: Path = ROOT / "data" / "events.db"


def ingest_once(store: SQLiteStore, cfg: IngestConfig, mail: MailpitSource | None = None) -> dict:
    report: dict[str, dict] = {}

    for name in ("auth.jsonl", "web.jsonl"):
        key = f"jsonl:{name}"
        try:
            offset = int(store.get_checkpoint(key) or 0)
            events, malformed, new_offset, note = jsonl.read_new(cfg.log_dir / name, offset)
            res = store.ingest_batch(key, events, malformed, checkpoint=str(new_offset))
            report[name] = {**res, "malformed": len(malformed), "offset": new_offset, **({"note": note} if note else {})}
        except Exception as exc:  # one bad source must not stop the others
            report[name] = {"error": f"{type(exc).__name__}: {exc}"}

    try:
        mail = mail or MailpitSource(cfg.mail_api)
        events, malformed = mail.fetch_new(lambda eid: store.has_event(eid))
        res = store.ingest_batch("mailpit", events, malformed)
        report["mailpit"] = {**res, "malformed": len(malformed)}
    except httpx.HTTPError as exc:
        report["mailpit"] = {"error": f"mail service unreachable: {type(exc).__name__}"}
    except Exception as exc:
        report["mailpit"] = {"error": f"{type(exc).__name__}: {exc}"}
    return report


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", type=Path, default=IngestConfig.db_path)
    ap.add_argument("--logs", type=Path, default=IngestConfig.log_dir)
    ap.add_argument("--mail-api", default=IngestConfig.mail_api)
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--once", action="store_true", default=True)
    g.add_argument("--watch", action="store_true")
    ap.add_argument("--interval", type=float, default=2.0)
    a = ap.parse_args()
    cfg = IngestConfig(mail_api=a.mail_api, log_dir=a.logs, db_path=a.db)
    store = SQLiteStore(cfg.db_path)
    try:
        while True:
            rep = ingest_once(store, cfg)
            print(json.dumps({**rep, "totals": {"events": store.count(), "malformed": store.malformed_count()}}))
            if not a.watch:
                break
            time.sleep(a.interval)
    except KeyboardInterrupt:
        pass
    finally:
        store.close()


if __name__ == "__main__":
    main()
