"""Start/stop the lab: Mailpit (mail capture) + lab auth service + lab web server, as local processes.

  python -m lab.up            # foreground; Ctrl-C stops everything
  python -m lab.up --fresh    # also truncate old lab logs first

Everything binds to 127.0.0.1 only. Docker is NOT required (the Docker engine was not running on the dev
machine, and distinct source IPs work natively on loopback: 127.0.0.x).
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
import urllib.request
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAILPIT = ROOT / "tools" / "mailpit" / "bin" / ("mailpit.exe" if os.name == "nt" else "mailpit")


@dataclass(frozen=True)
class LabConfig:
    smtp_port: int = 1025
    mail_api_port: int = 8025
    web_port: int = 8081
    auth_port: int = 8082
    log_dir: Path = ROOT / "data" / "lab" / "logs"
    host: str = "127.0.0.1"

    @property
    def mail_api(self) -> str:
        return f"http://{self.host}:{self.mail_api_port}"

    @property
    def web(self) -> str:
        return f"http://{self.host}:{self.web_port}"

    @property
    def auth(self) -> str:
        return f"http://{self.host}:{self.auth_port}"


def _healthy(url: str) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=1) as r:
            return r.status == 200
    except Exception:
        return False


class Lab:
    def __init__(self, cfg: LabConfig | None = None, fresh: bool = False):
        self.cfg, self.fresh, self.procs = cfg or LabConfig(), fresh, []

    def start(self) -> "Lab":
        c = self.cfg
        if not MAILPIT.exists():
            raise FileNotFoundError(f"Mailpit binary not found at {MAILPIT}. See README (Phase 0).")
        c.log_dir.mkdir(parents=True, exist_ok=True)
        if self.fresh:
            for name in ("auth.jsonl", "web.jsonl"):
                (c.log_dir / name).unlink(missing_ok=True)
        env = {**os.environ, "LAB_LOG_DIR": str(c.log_dir), "PYTHONPATH": str(ROOT)}
        quiet = dict(stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, cwd=ROOT, env=env)
        self.procs.append(subprocess.Popen(
            [str(MAILPIT), "--listen", f"{c.host}:{c.mail_api_port}", "--smtp", f"{c.host}:{c.smtp_port}"], **quiet))
        for module, port in (("lab.auth_service.app", c.auth_port), ("lab.web_server.app", c.web_port)):
            self.procs.append(subprocess.Popen(
                [sys.executable, "-m", "uvicorn", "--factory", f"{module}:create_app", "--host", c.host,
                 "--port", str(port), "--log-level", "warning"], **quiet))
        self._wait([f"{c.mail_api}/api/v1/info", f"{c.web}/health", f"{c.auth}/health"])
        return self

    def _wait(self, urls: list[str], timeout: float = 25.0) -> None:
        end = time.monotonic() + timeout
        pending = list(urls)
        while pending and time.monotonic() < end:
            pending = [u for u in pending if not _healthy(u)]
            if pending:
                time.sleep(0.25)
        if pending:
            self.stop()
            raise RuntimeError(f"lab services did not become healthy: {pending}")

    def stop(self) -> None:
        for p in self.procs:
            if p.poll() is None:
                p.terminate()
        for p in self.procs:
            try:
                p.wait(timeout=5)
            except subprocess.TimeoutExpired:
                p.kill()
        self.procs.clear()

    def __enter__(self) -> "Lab":
        return self.start()

    def __exit__(self, *exc) -> None:
        self.stop()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--fresh", action="store_true", help="truncate lab logs before starting")
    args = ap.parse_args()
    lab = Lab(fresh=args.fresh).start()
    c = lab.cfg
    print(f"lab up: mail UI/API {c.mail_api}  smtp {c.host}:{c.smtp_port}  web {c.web}  auth {c.auth}\n"
          f"logs: {c.log_dir}\nCtrl-C to stop")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        lab.stop()


if __name__ == "__main__":
    main()
