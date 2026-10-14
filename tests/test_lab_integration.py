"""Integration: REAL lab processes (Mailpit + auth + web), a real scenario, real ingestion. Slower (~15 s).

Skipped automatically when the Mailpit binary has not been downloaded (see README, Phase 0).
Uses non-default ports and a temp directory, so it can run while the dev lab is up.
"""
import json
import sqlite3
from pathlib import Path

import httpx
import pytest

from lab.runner import run_scenario
from lab.up import MAILPIT, ROOT, Lab, LabConfig
from traceguard.ingest.run import IngestConfig, ingest_once
from traceguard.store.sqlite import SQLiteStore

pytestmark = pytest.mark.skipif(not MAILPIT.exists(), reason="Mailpit binary not downloaded")
SCEN = ROOT / "config" / "scenarios"


@pytest.fixture(scope="module")
def lab(tmp_path_factory):
    base = tmp_path_factory.mktemp("lab")
    cfg = LabConfig(smtp_port=11025, mail_api_port=18025, web_port=18081, auth_port=18082, log_dir=base / "logs")
    with Lab(cfg, fresh=True) as running:
        yield running, base


def reset(running):
    """Every scenario starts from an empty mailbox and empty service logs, so runs cannot contaminate each other."""
    httpx.delete(f"{running.cfg.mail_api}/api/v1/messages", timeout=10).raise_for_status()
    for name in ("auth.jsonl", "web.jsonl"):
        (running.cfg.log_dir / name).write_bytes(b"")


def run_and_ingest(lab, name, seed):
    running, base = lab
    reset(running)
    gt = base / f"gt-{name}.db"
    run_id = run_scenario(SCEN / f"{name}.yaml", cfg=running.cfg, seed=seed, time_scale=0.01, gt_db=gt)
    db = SQLiteStore(base / f"events-{name}.db")
    ingest_once(db, IngestConfig(mail_api=running.cfg.mail_api, log_dir=running.cfg.log_dir, db_path=base / f"events-{name}.db"))
    events = list(db.iter_events())
    db.close()
    return run_id, gt, events


def test_attack_chain_produces_independently_logged_and_genuinely_linked_events(lab):
    run_id, gt_path, events = run_and_ingest(lab, "phish_then_takeover", seed=7)
    emails = [e for e in events if e["event_type"] == "email_received"]
    webs = [e for e in events if e["event_type"] == "web_request"]
    auths = [e for e in events if e["event_type"] == "auth_attempt"]
    assert (len(emails), len(webs), len(auths)) == (2, 3, 7)   # 2 mails; 2 browse + 1 click; 6 alice + 1 dave logins

    phish = next(e for e in emails if e["evidence"]["from_address"] == "it-support@c0mpany-portal.lab")
    assert phish["evidence"]["reply_to"] == ["helpdesk@elsewhere.lab"]
    assert phish["evidence"]["authentication_results"] == "unknown"        # the lab cannot observe SPF/DKIM/DMARC

    # the visit carries the SAME per-recipient token that is in the email link: an observable, not an assumption
    token = phish["evidence"]["urls"][0].split("t=")[1]
    visit = next(w for w in webs if w["evidence"]["token"] == token)
    assert visit["evidence"]["host"] == "c0mpany-portal.lab" and visit["source_ip"] == "127.0.0.10"
    assert visit["evidence"]["session_id"].startswith("s-")                # assigned by the SERVER

    alice = sorted((a for a in auths if a["target_id"] == "alice"), key=lambda a: a["event_timestamp"])
    assert [a["outcome"] for a in alice] == ["failure"] * 5 + ["success"]
    assert {a["source_ip"] for a in alice} == {"127.0.0.21"}              # distinct from the visitor's 127.0.0.10
    assert visit["source_ip"] != alice[0]["source_ip"]
    assert phish["event_timestamp"] < visit["event_timestamp"] < alice[0]["event_timestamp"]

    # distinct sources really were observed by the services
    assert {"127.0.0.10", "127.0.0.21", "127.0.0.40"} <= {e["source_ip"] for e in events if e["source_ip"]}


def test_ground_truth_is_separate_and_never_leaks_into_events(lab):
    run_id, gt_path, events = run_and_ingest(lab, "phish_then_takeover", seed=8)
    blob = json.dumps(events)
    assert run_id not in blob and "phish_then_takeover" not in blob and "ground_truth" not in blob and "expected" not in blob
    with sqlite3.connect(gt_path) as db:
        (expected,) = db.execute("SELECT expected FROM runs WHERE run_id=?", (run_id,)).fetchone()
    exp = json.loads(expected)
    assert [l["tier"] for l in exp["links"]] == ["observed", "inferred-weak"]
    # and the pipeline's database has no ground-truth table
    pipe = sqlite3.connect(Path(gt_path).parent / "events-phish_then_takeover.db")
    tables = {r[0] for r in pipe.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    pipe.close()
    assert "runs" not in tables


def test_hard_negative_shares_no_identifier_between_email_and_the_other_users_logins(lab):
    _, _, events = run_and_ingest(lab, "hard_negative_unrelated", seed=9)
    phish = next(e for e in events if e["event_type"] == "email_received" and "c0mpany-portal.lab" in e["evidence"]["from_address"]
                 and "Password reset" in e["evidence"]["subject"])
    bob = [e for e in events if e["event_type"] == "auth_attempt" and e["target_id"] == "bob"]
    assert len(bob) >= 3 and phish["target_id"] == "alice@company.lab"
    token = phish["evidence"]["urls"][0].split("t=")[1]
    assert not any(e["evidence"].get("token") == token for e in events if e["event_type"] == "web_request")  # nobody clicked
    assert {b["source_ip"] for b in bob} == {"127.0.0.22"}


def test_password_spray_is_one_source_many_accounts(lab):
    _, _, events = run_and_ingest(lab, "password_spray", seed=10)
    spray = [e for e in events if e["event_type"] == "auth_attempt" and e["source_ip"] == "127.0.0.30"]
    assert {e["target_id"] for e in spray} == {"alice", "bob", "carol", "dave"}
    assert all(e["outcome"] == "failure" for e in spray) and len(spray) >= 8


def test_benign_day_has_a_typo_a_promo_and_a_shared_ip_but_no_attack_shape(lab):
    _, _, events = run_and_ingest(lab, "benign_day", seed=11)
    auths = [e for e in events if e["event_type"] == "auth_attempt"]
    assert {a["source_ip"] for a in auths} == {"127.0.0.40"}                          # a shared office IP, many users
    bob = sorted((a for a in auths if a["target_id"] == "bob"), key=lambda a: a["event_timestamp"])
    assert [a["outcome"] for a in bob] == ["failure", "success"]                      # one typo, then success
    assert any("20% off" in (e["evidence"].get("subject") or "") for e in events if e["event_type"] == "email_received")
