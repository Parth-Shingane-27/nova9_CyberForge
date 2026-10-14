"""Mailpit reader (REST API verified in Phase 0: /api/v1/messages, /message/{ID}, /message/{ID}/headers).

Mailpit does NOT validate SPF/DKIM/DMARC, so authentication results are "unknown" unless a header is
actually present. Nothing is fabricated.
"""
from __future__ import annotations

import re
from html import unescape

import httpx

from ..schema import EMAIL_RECEIVED, Event, make_event_id

SOURCE = "mailpit"
URL_RE = re.compile(r"https?://[^\s<>\"'()]+", re.I)
HREF_RE = re.compile(r"""href\s*=\s*["']([^"']+)["']""", re.I)
MAX_TEXT = 20_000
PAGE = 100


def extract_urls(text: str, html: str) -> list[str]:
    found = [u.rstrip(".,;:!?") for u in URL_RE.findall(text or "")]
    found += [unescape(h) for h in HREF_RE.findall(html or "") if h.lower().startswith(("http://", "https://"))]
    seen, out = set(), []
    for u in found:
        if u not in seen:
            seen.add(u); out.append(u)
    return out


def _addr(x: dict | None) -> str | None:
    a = (x or {}).get("Address")
    return a.strip().lower() if a else None


def normalize_email(item: dict, detail: dict, header_names: list[str], auth_results: str | None) -> Event:
    if not item.get("ID") or not item.get("Created"):
        raise ValueError("message has no ID or Created time")
    recipients = [a for a in (_addr(t) for t in detail.get("To") or []) if a]
    text, html = detail.get("Text") or "", detail.get("HTML") or ""
    return Event(
        event_type=EMAIL_RECEIVED, source_service=SOURCE, source_record_id=str(item["ID"]),
        event_timestamp=item["Created"],                         # receive time recorded by the mail service
        actor_id=_addr(detail.get("From")), target_id=recipients[0] if recipients else None, outcome="delivered",
        evidence={
            "message_id": detail.get("MessageID"), "from_name": (detail.get("From") or {}).get("Name") or None,
            "from_address": _addr(detail.get("From")), "to": recipients,
            "reply_to": [a for a in (_addr(r) for r in detail.get("ReplyTo") or []) if a],
            "return_path": detail.get("ReturnPath") or None, "subject": detail.get("Subject"),
            "header_date": detail.get("Date"), "text": text[:MAX_TEXT], "has_html": bool(html),
            "urls": extract_urls(text, html),
            "attachments": [{"name": a.get("FileName"), "content_type": a.get("ContentType"), "size": a.get("Size")}
                            for a in detail.get("Attachments") or []],
            "header_names": header_names,
            # present only if the message actually carried the header; the lab does not generate it
            "authentication_results": auth_results or "unknown",
        },
    )


class MailpitSource:
    def __init__(self, base_url: str, client: httpx.Client | None = None):
        self.base = base_url.rstrip("/")
        self.http = client or httpx.Client(timeout=10)

    def _get(self, path: str, **params):
        r = self.http.get(self.base + path, params=params or None)
        r.raise_for_status()
        return r.json()

    def fetch_new(self, known) -> tuple[list[Event], list[tuple[str, str, str]]]:
        """`known(event_id) -> bool` lets us skip detail fetches for messages we already stored."""
        events, malformed, start = [], [], 0
        while True:
            page = self._get("/api/v1/messages", start=start, limit=PAGE)
            items = page.get("messages") or []
            for item in items:
                mid = str(item.get("ID", ""))
                if not mid or known(make_event_id(SOURCE, mid)):
                    continue
                try:
                    detail = self._get(f"/api/v1/message/{mid}")
                    headers = self._get(f"/api/v1/message/{mid}/headers")
                    auth = (headers.get("Authentication-Results") or [None])[0]
                    events.append(normalize_email(item, detail, sorted(headers.keys()), auth))
                except (httpx.HTTPError, ValueError, KeyError) as exc:
                    malformed.append((f"mailpit:{mid}", f"{type(exc).__name__}: {exc}", str(item)[:500]))
            start += len(items)
            if not items or start >= int(page.get("total") or 0):
                return events, malformed
