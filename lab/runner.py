"""Scenario runner. It ACTS (sends real SMTP mail, makes real HTTP requests, attempts real logins); the
services write their own logs. It never writes a log line, and it never tells the detector anything.

The answer key (what the scenario intended) goes to a SEPARATE ground-truth database that the detection
pipeline must not read.

  python -m lab.runner config/scenarios/phish_then_takeover.yaml --time-scale 0.02 --seed 7
"""
from __future__ import annotations

import argparse
import json
import random
import smtplib
import sqlite3
import time
import uuid
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path
from typing import Callable
from urllib.parse import parse_qs, urlparse

import httpx
import yaml

from .up import ROOT, LabConfig

USER_AGENTS = ["Mozilla/5.0 (Windows NT 10.0) lab-browser/1.0", "Mozilla/5.0 (X11; Linux x86_64) lab-browser/2.1",
               "lab-client/1.0", "python-httpx/lab", "Mozilla/5.0 (Macintosh) lab-browser/3.4"]
DEFAULT_GT_DB = ROOT / "data" / "ground_truth.db"

GT_SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
  run_id TEXT PRIMARY KEY, scenario_id TEXT NOT NULL, category TEXT, seed INTEGER, time_scale REAL,
  started_at TEXT, finished_at TEXT, expected TEXT NOT NULL
);
"""


class Runner:
    def __init__(self, cfg: LabConfig, seed: int, time_scale: float):
        self.cfg, self.rng, self.scale = cfg, random.Random(seed), time_scale
        self.emails: dict[str, dict] = {}   # name -> message_id, token, to, link
        self.clicks: dict[str, dict] = {}   # name -> token, src_ip
        self.logins: dict[str, dict] = {}   # name -> username, src_ip, attempts, final
        self.sessions: dict[str, httpx.Client] = {}
        self.users = json.loads((ROOT / "lab" / "users.json").read_text(encoding="utf-8"))["users"]

    # -- helpers ---------------------------------------------------------------------------------
    def _client(self, ip: str, key: str, ua: str) -> httpx.Client:
        """One persistent HTTP client per (source ip, person): cookies persist, so the SERVER's session id sticks."""
        k = f"{ip}|{key}"
        if k not in self.sessions:
            self.sessions[k] = httpx.Client(transport=httpx.HTTPTransport(local_address=ip),
                                            headers={"User-Agent": ua}, timeout=10)
        return self.sessions[k]

    def _ua(self, a: dict) -> str:
        return a.get("user_agent") or self.rng.choice(USER_AGENTS)

    # -- actors ----------------------------------------------------------------------------------
    def email(self, a: dict) -> None:
        token = f"tk-{self.rng.getrandbits(32):08x}" if a.get("link_path") else None
        host = a.get("link_host", "portal.company.lab")
        link = f"http://{host}{a['link_path']}?t={token}" if token else None
        msg = EmailMessage()
        msg["From"], msg["To"], msg["Subject"] = a["from"], a["to"], a["subject"]
        if a.get("reply_to"):
            msg["Reply-To"] = a["reply_to"]
        mid = f"<{uuid.uuid4().hex}@lab.test>"
        msg["Message-ID"] = mid
        msg.set_content(a["body"].replace("{link}", link or ""))
        for att in a.get("attachments", []):
            msg.add_attachment(b"lab placeholder bytes", maintype="application", subtype="octet-stream", filename=att)
        with smtplib.SMTP(self.cfg.host, self.cfg.smtp_port, timeout=10) as s:
            s.send_message(msg)
        self.emails[a["name"]] = {"message_id": mid, "token": token, "to": a["to"], "link": link, "from": a["from"]}

    def click(self, a: dict) -> None:
        em = self.emails[a["from_email"]]
        u = urlparse(em["link"])
        ip, who = a["client_ip"], a["user"]
        c = self._client(ip, who, self._ua(a))
        # a real request to the lab web server; the Host header carries the (fake) domain from the email link
        c.get(f"{self.cfg.web}{u.path}?{u.query}", headers={"Host": u.netloc}, follow_redirects=True)
        self.clicks[a["name"]] = {"token": parse_qs(u.query)["t"][0], "src_ip": ip, "user": who}

    def browse(self, a: dict) -> None:
        c = self._client(a["client_ip"], a.get("user", "anon"), self._ua(a))
        for p in a["paths"]:
            c.get(f"{self.cfg.web}{p}", headers={"Host": a.get("host", "portal.company.lab")})

    def login(self, a: dict, attempt: int, total: int) -> None:
        user = self.users[a["username"]]
        mode = a.get("password", "wrong")
        good = mode == "correct" or (mode == "wrong_then_correct" and attempt == total - 1)
        password = user["password"] if good else f"wrong-{self.rng.getrandbits(24):06x}"
        # bind the socket to this actor's own loopback address so the service sees a distinct source IP
        with httpx.Client(transport=httpx.HTTPTransport(local_address=a["client_ip"]), timeout=10,
                          headers={"User-Agent": a.get("user_agent") or "lab-client/1.0"}) as c:
            r = c.post(f"{self.cfg.auth}/login", json={"username": a["username"], "password": password})
        rec = self.logins.setdefault(a["name"], {"username": a["username"], "src_ip": a["client_ip"], "attempts": 0})
        rec["attempts"] += 1
        rec["final"] = "success" if r.status_code == 200 else "failure"

    # -- schedule --------------------------------------------------------------------------------
    def schedule(self, actors: list[dict]) -> list[tuple[float, Callable[[], None]]]:
        plan: list[tuple[float, Callable[[], None]]] = []
        for a in actors:
            at, kind = float(a["at"]), a["type"]
            if kind == "login":
                n, gap = int(a.get("count", 1)), float(a.get("interval", 5))
                for i in range(n):  # seeded jitter, so runs differ but a seed reproduces them
                    plan.append((at + i * gap * self.rng.uniform(0.85, 1.15), lambda a=a, i=i, n=n: self.login(a, i, n)))
            else:
                plan.append((at * self.rng.uniform(0.98, 1.02), lambda a=a, k=kind: getattr(self, k)(a)))
        return sorted(plan, key=lambda p: p[0])

    # -- ground truth ----------------------------------------------------------------------------
    def resolve(self, ref: str) -> dict:
        kind, _, name = ref.partition(":")
        table = {"email": self.emails, "web": self.clicks, "auth": self.logins}[kind]
        return {"type": kind, "name": name, **table[name]}

    def expected(self, gt: dict) -> dict:
        out = {k: v for k, v in gt.items() if k not in ("links", "not_linked", "findings")}
        out["links"] = [{"from": self.resolve(x["from"]), "to": self.resolve(x["to"]), "tier": x["tier"]}
                        for x in gt.get("links", [])]
        out["not_linked"] = [{"a": self.resolve(p["a"]), "b": self.resolve(p["b"]), "why": p.get("why")}
                             for p in gt.get("not_linked", [])]
        out["findings"] = [{"detector": f["detector"], "target": self.resolve(f["target"]), "severity": f.get("severity")}
                           for f in gt.get("findings", [])]
        return out


def run_scenario(path: Path, cfg: LabConfig | None = None, seed: int | None = None, time_scale: float = 1.0,
                 gt_db: Path | None = None) -> str:
    cfg = cfg or LabConfig()
    spec = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    seed = spec.get("seed", 0) if seed is None else seed
    r = Runner(cfg, seed, time_scale)
    plan = r.schedule(spec["actors"])
    run_id = f"{spec['id']}-{seed}-{uuid.uuid4().hex[:6]}"
    started = datetime.now(timezone.utc).isoformat()
    t0 = time.monotonic()
    for at, fn in plan:
        delay = at * time_scale - (time.monotonic() - t0)
        if delay > 0:
            time.sleep(delay)
        fn()
    for c in r.sessions.values():
        c.close()
    gt_db = Path(gt_db or DEFAULT_GT_DB)
    gt_db.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(gt_db) as db:
        db.executescript(GT_SCHEMA)
        db.execute("INSERT INTO runs VALUES (?,?,?,?,?,?,?,?)", (
            run_id, spec["id"], spec.get("category"), seed, time_scale, started,
            datetime.now(timezone.utc).isoformat(), json.dumps(r.expected(spec.get("ground_truth", {})))))
    return run_id


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("scenario")
    ap.add_argument("--seed", type=int)
    ap.add_argument("--time-scale", type=float, default=1.0, help="multiply scenario delays (0.02 = 50x faster)")
    ap.add_argument("--ground-truth-db", type=Path)
    a = ap.parse_args()
    print("run id:", run_scenario(Path(a.scenario), seed=a.seed, time_scale=a.time_scale, gt_db=a.ground_truth_db))


if __name__ == "__main__":
    main()
