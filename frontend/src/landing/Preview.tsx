import { useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { EVENTS, FINDINGS, INCIDENT, type Source } from './scenario';
import { EvidenceGraph, type Selection } from './EvidenceGraph';
import { Details } from './Details';
import { ConfidenceBadge, Heading, Icon, Section, SeverityBadge, SimulatedChip, SourceTag, useMediaQuery } from './ui';

const TIMES = Object.fromEntries(EVENTS.map((e) => [e.id, e.time]));
const TABS = ['Overview', 'Event Explorer', 'Email Intelligence', 'URL Investigation', 'Incident Explorer', 'Evaluation'] as const;
type Tab = (typeof TABS)[number];

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl border border-line bg-obsidian/50 p-4">
      <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 font-mono text-3xl text-ink">{value}</p>
      <p className="mt-1 text-xs text-muted">{note}</p>
    </div>
  );
}

function Overview() {
  const flagged = new Set(FINDINGS.flatMap((f) => f.eventIds)).size;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Events" value={String(EVENTS.length)} note="3 sources, normalised" />
        <Stat label="Findings" value={String(FINDINGS.length)} note={`${flagged} events flagged`} />
        <Stat label="Incidents" value="1" note={`${INCIDENT.id}`} />
        <Stat label="Not linked" value="1" note="refused, reason recorded" />
      </div>
      <div className="rounded-xl border border-line bg-obsidian/50 p-4">
        <h4 className="text-sm font-semibold">Findings</h4>
        <ul className="mt-3 divide-y divide-line">
          {FINDINGS.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium"><span className="mr-2 font-mono text-xs text-ice">{f.id} · {f.detector}</span>{f.title}</p>
                <p className="mt-0.5 text-xs text-muted">{f.detail}</p>
              </div>
              <div className="flex flex-wrap gap-2"><SeverityBadge level={f.severity} /><ConfidenceBadge level={f.confidence} /></div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">Severity (how bad if true) and confidence (how well supported) are separate by design.</p>
      </div>
    </div>
  );
}

function Events() {
  const [filter, setFilter] = useState<'ALL' | Source>('ALL');
  const rows = EVENTS.filter((e) => filter === 'ALL' || e.source === filter);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Filter events by source">
        {(['ALL', 'EMAIL', 'WEB', 'AUTH'] as const).map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${filter === f ? 'border-cyan bg-cyan/15 text-cyan' : 'border-line text-muted hover:text-ink'}`}>
            {f === 'ALL' ? 'All sources' : f}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted">{rows.length} of {EVENTS.length} events</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
          <thead className="bg-obsidian/60 text-xs uppercase tracking-wider text-muted">
            <tr><th className="px-3 py-2 font-medium">Event</th><th className="px-3 py-2 font-medium">Time</th><th className="px-3 py-2 font-medium">Source</th><th className="px-3 py-2 font-medium">Summary</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((e) => (
              <tr key={e.id}>
                <td className="px-3 py-2 font-mono text-xs text-ice">{e.id}</td>
                <td className="px-3 py-2 font-mono text-xs text-muted">{e.time}</td>
                <td className="px-3 py-2"><SourceTag source={e.source} /></td>
                <td className="px-3 py-2 text-ink/90">{e.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Email() {
  const ev = EVENTS[0];
  const f = FINDINGS[0];
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="rounded-xl border border-line bg-obsidian/50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Source observation · {ev.id}</p>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {ev.fields.map(([k, v]) => (<div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className="break-words font-mono text-[13px]">{v}</dd></div>))}
        </dl>
      </div>
      <div className="space-y-4">
        <div className="rounded-xl border border-line bg-obsidian/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Risk assessment · detector {f.detector}</p>
          <p className="mt-2 font-medium">{f.title}</p>
          <p className="mt-1 text-sm text-muted">{f.detail}</p>
          <div className="mt-3 flex flex-wrap gap-2"><SeverityBadge level={f.severity} /><ConfidenceBadge level={f.confidence} /></div>
          <p className="mt-3 text-sm"><span className="text-muted">Classification: </span>Suspicious; requires review</p>
        </div>
        <div className="rounded-xl border border-line bg-obsidian/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Recommendation</p>
          <p className="mt-2 text-sm">Verify the sender through a separate channel before acting. The absence of other warnings would not make this message safe.</p>
        </div>
      </div>
    </div>
  );
}

function Url() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-line bg-obsidian/50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Observed</p>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted">Original</dt><dd className="break-all font-mono text-[13px]">http://c0mpany-portal.lab/reset?t=tk-7f3a</dd>
          <dt className="text-muted">Logged form</dt><dd className="break-all font-mono text-[13px]">http://c0mpany-portal.lab/reset?t=[redacted]</dd>
          <dt className="text-muted">Redirect chain</dt><dd>None recorded in this scenario</dd>
          <dt className="text-muted">Fetch mode</dt><dd>Lab allowlist (external fetching off)</dd>
        </dl>
      </div>
      <div className="rounded-xl border border-line bg-obsidian/50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Assessment and limits</p>
        <ul className="mt-3 space-y-2 text-sm">
          <li className="flex gap-2"><Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-warn" />Structure flag: lookalike hostname (see F-01).</li>
          <li className="flex gap-2"><Icon name="question" className="mt-0.5 h-4 w-4 shrink-0 text-violet" />Reputation: not checked. Result is inconclusive; an unlisted URL is not a safe URL.</li>
          <li className="flex gap-2"><Icon name="eye" className="mt-0.5 h-4 w-4 shrink-0 text-muted" />No page content was inspected and no form was submitted.</li>
        </ul>
      </div>
    </div>
  );
}

function Incident() {
  const compact = useMediaQuery('(max-width: 639px)');
  const [sel, setSel] = useState<Selection>({ kind: 'edge', id: 'r1' });
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-obsidian/50 p-4">
        <div><p className="font-mono text-sm text-ice">{INCIDENT.id}</p><p className="text-xs text-muted">{INCIDENT.eventCount} events · {INCIDENT.missingCount} missing-evidence items · 1 refused link</p></div>
        <div className="flex flex-wrap gap-2"><SeverityBadge level={INCIDENT.severity} /><ConfidenceBadge level={INCIDENT.confidence} /></div>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-line bg-obsidian/50 p-3"><EvidenceGraph compact={compact} selected={sel} onSelect={setSel} times={TIMES} /></div>
        <Details selection={sel} onQuick={setSel} />
      </div>
      <div className="rounded-xl border border-line bg-obsidian/50 p-4 text-sm leading-relaxed">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Template-generated report · AI off</p>
        <p className="mt-2"><span className="text-cyan">Observed:</span> the email link token matches a web request [EV-0001, EV-0002]; five failures were followed by a success from one source [EV-0003–0008].</p>
        <p className="mt-1.5"><span className="text-warn">Inferred (weak):</span> the visit may relate to the login burst against the same account [EV-0002, EV-0003]. No session links them.</p>
        <p className="mt-1.5"><span className="text-crit">Not linked:</span> bob’s failures [EV-0009–0011] share no identifier with this incident.</p>
        <p className="mt-1.5"><span className="text-muted">Not established:</span> that the email caused the logins.</p>
      </div>
    </div>
  );
}

function Evaluation() {
  return (
    <div className="rounded-xl border border-dashed border-line p-6">
      <p className="font-medium">No evaluation runs yet.</p>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        This page will show precision, recall, false positives and negatives, link accuracy against ground truth, comparison with a naive “same user, same window” baseline,
        detection latency, and restart or re-ingestion checks. Values appear only after real runs; nothing on this page is a measurement.
      </p>
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {['Precision', 'Recall', 'Link accuracy', 'Detection latency'].map((m) => (
          <div key={m} className="rounded-xl border border-line bg-obsidian/50 p-4"><p className="text-xs uppercase tracking-wider text-muted">{m}</p><p className="mt-1 font-mono text-2xl text-muted">—</p><p className="text-xs text-muted">not measured</p></div>
        ))}
      </div>
    </div>
  );
}

const VIEWS: Record<Tab, () => React.ReactElement> = {
  Overview, 'Event Explorer': Events, 'Email Intelligence': Email, 'URL Investigation': Url, 'Incident Explorer': Incident, Evaluation,
};

export function Preview() {
  const [tab, setTab] = useState<Tab>('Overview');
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const View = VIEWS[tab];

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.indexOf(tab);
    const next = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i - 1 + TABS.length) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    setTab(TABS[next]);
    refs.current[TABS[next]]?.focus();
  };

  return (
    <Section id="preview" className="py-20 sm:py-28" label="Console preview">
      <Heading eyebrow="A glimpse of the console" title="Everything the Investigation Needs. Nothing It Cannot Explain." />
      <div className="glass hairline-top mt-10 overflow-hidden rounded-3xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2 text-sm font-semibold"><Icon name="shield" className="h-4 w-4 text-cyan" />TraceGuard console</div>
          <SimulatedChip>Simulated preview · not live telemetry</SimulatedChip>
        </div>
        <div role="tablist" aria-label="Console preview sections" onKeyDown={onKey} className="flex gap-1 overflow-x-auto border-b border-line px-3 pt-2 sm:px-5">
          {TABS.map((t) => (
            <button key={t} ref={(el) => { refs.current[t] = el; }} type="button" role="tab" id={`tab-${t}`} aria-selected={tab === t} aria-controls="preview-panel"
              tabIndex={tab === t ? 0 : -1} onClick={() => setTab(t)}
              className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition ${tab === t ? 'border-cyan text-cyan' : 'border-transparent text-muted hover:text-ink'}`}>
              {t}
            </button>
          ))}
        </div>
        <div id="preview-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={0} className="p-4 sm:p-6"><View /></div>
      </div>
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <Link to="/console" className="inline-flex items-center gap-2 rounded-xl bg-cyan px-5 py-3 text-sm font-semibold text-obsidian transition hover:bg-ice">Enter TraceGuard<Icon name="arrow" className="h-4 w-4" /></Link>
        <p className="text-sm text-muted">You will be asked to sign in first.</p>
      </div>
    </Section>
  );
}
