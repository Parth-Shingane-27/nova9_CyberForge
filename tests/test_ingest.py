"""Ingestion reliability tests. No lab and no network: files are temporary and Mailpit is a mock transport."""
import json

import httpx
import pytest

from traceguard import schema
from traceguard.ingest import jsonl
from traceguard.ingest.mailpit import MailpitSource, extract_urls
from traceguard.ingest.run import IngestConfig, ingest_once
from traceguard.schema import Event
from traceguard.store.sqlite import SQLiteStore


def auth_line(rid, user="alice", outcome="failure", ts="2026-10-14T10:00:00.000+00:00", ip="127.0.0.21", **kw):
    rec = {"rid": rid, "ts": ts, "event": "auth_attempt", "username": user, "outcome": outcome, "reason": "bad_password",
           "src_ip": ip, "user_agent": "lab-client/1.0"}
    rec.update(kw)
    return json.dumps(rec) + "\n"


def web_line(rid, ts="2026-10-14T10:01:00.000+00:00", query="t=tk-1", **kw):
    rec = {"rid": rid, "ts": ts, "event": "web_request", "method": "GET", "host": "c0mpany-portal.lab", "path": "/reset",
           "query": query, "status": 200, "src_ip": "127.0.0.10", "session": "s-1", "referrer": None, "user_agent": "ua"}
    rec.update(kw)
    return json.dumps(rec) + "\n"


def put(path, text, append=False):
    with open(path, "a" if append else "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


@pytest.fixture()
def env(tmp_path):
    logs = tmp_path / "logs"
    logs.mkdir()
    cfg = IngestConfig(mail_api="http://mail.invalid", log_dir=logs, db_path=tmp_path / "events.db")
    store = SQLiteStore(cfg.db_path)
    yield cfg, store, logs
    store.close()


def no_mail():
    """A Mailpit that is empty."""
    def handler(req):
        return httpx.Response(200, json={"messages": [], "total": 0})
    return MailpitSource("http://mail.invalid", httpx.Client(transport=httpx.MockTransport(handler)))


# ------------------------------------------------------------------------------ schema
def test_event_id_is_deterministic_and_source_scoped():
    a = schema.make_event_id("lab-auth", "r1")
    assert a == schema.make_event_id("lab-auth", "r1") and a != schema.make_event_id("lab-web", "r1")


def test_timestamps_are_normalised_to_utc():
    assert schema.to_utc_iso("2026-10-14T21:38:39.684+05:30") == "2026-10-14T16:08:39.684+00:00"
    assert schema.to_utc_iso("2026-10-14T10:00:00Z") == "2026-10-14T10:00:00.000+00:00"


def test_event_requires_a_dedup_key_and_known_type():
    with pytest.raises(ValueError):
        Event("auth_attempt", "lab-auth", "", "2026-10-14T10:00:00Z")
    with pytest.raises(ValueError):
        Event("made_up", "lab-auth", "r", "2026-10-14T10:00:00Z")


# ------------------------------------------------------------------------------ normalisers
def test_unknown_fields_stay_unknown_not_invented():
    rec = json.loads(auth_line("r1"))
    del rec["user_agent"], rec["src_ip"]
    e = jsonl.normalize_auth(rec)
    assert e.source_ip is None and e.evidence["user_agent"] is None and e.actor_id is None


def test_web_token_is_extracted_from_the_query():
    e = jsonl.normalize_web(json.loads(web_line("w1", query="t=tk-abc&x=1")))
    assert e.evidence["token"] == "tk-abc" and e.destination == "c0mpany-portal.lab/reset"


def test_missing_required_field_is_rejected():
    with pytest.raises(jsonl.BadRecord):
        jsonl.normalize_auth({"rid": "r", "ts": "2026-10-14T10:00:00Z", "event": "auth_attempt", "outcome": "failure"})


# ------------------------------------------------------------------------------ log reading
def test_reingesting_is_a_no_op(env):
    cfg, store, logs = env
    put(logs / "auth.jsonl", auth_line("r1") + auth_line("r2"))
    put(logs / "web.jsonl", web_line("w1"))
    first = ingest_once(store, cfg, no_mail())
    assert store.count() == 3 and first["auth.jsonl"]["inserted"] == 2
    again = ingest_once(store, cfg, no_mail())
    assert store.count() == 3 and again["auth.jsonl"]["inserted"] == 0


def test_half_written_line_waits_for_its_newline(env):
    cfg, store, logs = env
    whole = auth_line("r2")
    put(logs / "auth.jsonl", auth_line("r1") + whole[:25])
    ingest_once(store, cfg, no_mail())
    assert store.count() == 1
    assert int(store.get_checkpoint("jsonl:auth.jsonl")) == len(auth_line("r1").encode())
    put(logs / "auth.jsonl", whole[25:], append=True)
    ingest_once(store, cfg, no_mail())
    assert store.count() == 2 and store.malformed_count() == 0


def test_malformed_line_is_recorded_and_does_not_block_later_lines(env):
    cfg, store, logs = env
    put(logs / "auth.jsonl", auth_line("r1") + "{not json\n" + '{"rid":"x"}\n' + auth_line("r2"))
    rep = ingest_once(store, cfg, no_mail())
    assert store.count() == 2 and rep["auth.jsonl"]["malformed"] == 2 and store.malformed_count() == 2
    ingest_once(store, cfg, no_mail())
    assert store.malformed_count() == 2  # not recorded twice


def test_duplicate_log_lines_collapse(env):
    cfg, store, logs = env
    put(logs / "auth.jsonl", auth_line("same") + auth_line("same"))
    rep = ingest_once(store, cfg, no_mail())
    assert store.count() == 1 and rep["auth.jsonl"]["duplicates"] == 1


def test_truncated_log_is_reread_without_duplicates(env):
    cfg, store, logs = env
    p = logs / "auth.jsonl"
    put(p, auth_line("r1") + auth_line("r2") + auth_line("r3"))
    ingest_once(store, cfg, no_mail())
    put(p, auth_line("r1"))          # rotated/truncated: shorter than the checkpoint
    rep = ingest_once(store, cfg, no_mail())
    assert store.count() == 3 and rep["auth.jsonl"]["duplicates"] == 1 and "shrank" in rep["auth.jsonl"]["note"]


def test_restart_resumes_from_the_checkpoint(env):
    cfg, store, logs = env
    p = logs / "auth.jsonl"
    put(p, auth_line("r1"))
    ingest_once(store, cfg, no_mail())
    store.close()
    store2 = SQLiteStore(cfg.db_path)                          # "restarted" process
    put(p, auth_line("r2"), append=True)
    rep = ingest_once(store2, cfg, no_mail())
    assert rep["auth.jsonl"]["inserted"] == 1 and rep["auth.jsonl"]["duplicates"] == 0 and store2.count() == 2
    store2.close()


def test_out_of_order_arrival_is_counted_per_source(env):
    cfg, store, logs = env
    p = logs / "auth.jsonl"
    put(p, auth_line("late-ts", ts="2026-10-14T10:05:00.000+00:00"))
    ingest_once(store, cfg, no_mail())
    put(p, auth_line("early-ts", ts="2026-10-14T10:01:00.000+00:00"), append=True)  # arrives later but happened earlier
    rep = ingest_once(store, cfg, no_mail())
    assert rep["auth.jsonl"]["out_of_order"] == 1
    assert [e["source_record_id"] for e in store.iter_events()] == ["early-ts", "late-ts"]  # ordered by event time


def test_batch_is_atomic_events_and_checkpoint_roll_back_together(env, monkeypatch):
    cfg, store, logs = env
    put(logs / "auth.jsonl", auth_line("r1") + auth_line("r2"))
    calls = {"n": 0}
    real = Event.evidence_json

    def flaky(self):
        calls["n"] += 1
        if calls["n"] == 2:
            raise RuntimeError("disk full")
        return real(self)

    monkeypatch.setattr(Event, "evidence_json", flaky)
    rep = ingest_once(store, cfg, no_mail())
    assert "error" in rep["auth.jsonl"]
    assert store.count() == 0 and store.get_checkpoint("jsonl:auth.jsonl") is None   # nothing half-saved
    monkeypatch.setattr(Event, "evidence_json", real)
    ingest_once(store, cfg, no_mail())
    assert store.count() == 2                                                       # and a retry recovers


def test_missing_log_file_is_not_an_error(env):
    cfg, store, _ = env
    rep = ingest_once(store, cfg, no_mail())
    assert "error" not in rep["auth.jsonl"] and store.count() == 0


# ------------------------------------------------------------------------------ mailpit
ITEM = {"ID": "m1", "Created": "2026-10-14T21:38:39.684+05:30", "Subject": "Password reset required"}
DETAIL = {
    "ID": "m1", "MessageID": "<x@lab.test>", "Subject": "Password reset required", "Date": "2026-10-14T21:38:39+05:30",
    "From": {"Name": "IT Support", "Address": "IT-Support@C0mpany-Portal.lab"},
    "To": [{"Name": "", "Address": "Alice@Company.lab"}], "ReplyTo": [{"Name": "", "Address": "helpdesk@elsewhere.lab"}],
    "Text": "Reset: http://c0mpany-portal.lab/reset?t=tk-7f3a.", "HTML": '<a href="http://c0mpany-portal.lab/reset?t=tk-7f3a&amp;x=1">go</a>',
    "Attachments": [{"FileName": "invoice.zip", "ContentType": "application/zip", "Size": 10}],
}


def mail_client(items, detail_status=200, calls=None):
    def handler(req: httpx.Request):
        if calls is not None:
            calls.append(req.url.path)
        p = req.url.path
        if p == "/api/v1/messages":
            start = int(req.url.params.get("start", 0))
            return httpx.Response(200, json={"messages": items[start:], "total": len(items)})
        if p.endswith("/headers"):
            return httpx.Response(200, json={"From": ["x"], "Subject": ["y"]})
        if p.startswith("/api/v1/message/"):
            return httpx.Response(detail_status, json={**DETAIL, "ID": p.rsplit("/", 1)[1]})
        return httpx.Response(404)
    return MailpitSource("http://mail.invalid", httpx.Client(transport=httpx.MockTransport(handler)))


def test_email_is_normalised_without_inventing_authentication_results(env):
    cfg, store, _ = env
    ingest_once(store, cfg, mail_client([ITEM]))
    (e,) = list(store.iter_events("email_received"))
    ev = e["evidence"]
    assert e["actor_id"] == "it-support@c0mpany-portal.lab" and e["target_id"] == "alice@company.lab"
    assert e["event_timestamp"] == "2026-10-14T16:08:39.684+00:00"            # receive time, in UTC
    assert ev["reply_to"] == ["helpdesk@elsewhere.lab"] and ev["from_name"] == "IT Support"
    assert ev["authentication_results"] == "unknown"                          # Mailpit does not validate SPF/DKIM/DMARC
    assert ev["urls"] == ["http://c0mpany-portal.lab/reset?t=tk-7f3a", "http://c0mpany-portal.lab/reset?t=tk-7f3a&x=1"]
    assert ev["attachments"] == [{"name": "invoice.zip", "content_type": "application/zip", "size": 10}]


def test_known_messages_are_not_refetched(env):
    cfg, store, _ = env
    calls = []
    src = mail_client([ITEM], calls=calls)
    ingest_once(store, cfg, src)
    detail_calls = len([c for c in calls if c.startswith("/api/v1/message/")])
    ingest_once(store, cfg, src)
    assert len([c for c in calls if c.startswith("/api/v1/message/")]) == detail_calls and store.count() == 1


def test_one_unreadable_message_does_not_block_the_rest(env):
    cfg, store, _ = env
    bad = {"ID": "bad", "Created": "not-a-time"}
    ingest_once(store, cfg, mail_client([bad, ITEM]))
    assert store.count("email_received") == 1 and store.malformed_count() == 1


def test_mail_service_down_still_ingests_the_logs(env):
    cfg, store, logs = env
    put(logs / "auth.jsonl", auth_line("r1"))

    def refuse(req):
        raise httpx.ConnectError("refused")

    down = MailpitSource("http://mail.invalid", httpx.Client(transport=httpx.MockTransport(refuse)))
    rep = ingest_once(store, cfg, down)
    assert "unreachable" in rep["mailpit"]["error"] and rep["auth.jsonl"]["inserted"] == 1 and store.count() == 1


def test_extract_urls_dedupes_and_trims_punctuation():
    assert extract_urls("see http://a.lab/x, and http://a.lab/x.", "") == ["http://a.lab/x"]
