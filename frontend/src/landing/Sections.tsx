import { useState } from 'react';
import { Heading, Icon, Section, TierBadge } from './ui';
import { TIER_MEANING, type Tier } from './scenario';

/* ------------------------------------------------------------- 5. problem */
export function Problem() {
  const cards = [
    { icon: 'layers', title: 'Disconnected Signals', body: 'Email, web activity, and authentication events are produced by separate services. Investigators must bring them into a common view before they can assess the bigger picture.' },
    { icon: 'clock', title: 'Coincidence Is Not Correlation', body: 'Two events happening close together does not establish that they are related. Shared identifiers, valid time windows, event ordering, and supporting evidence matter.' },
    { icon: 'question', title: 'Missing Evidence Matters', body: 'An email containing a suspicious link does not prove that anyone clicked it. A login burst affecting the same account does not, by itself, establish a phishing-driven account takeover.' },
  ];
  return (
    <Section id="platform" className="py-20 sm:py-28" label="The problem">
      <Heading eyebrow="The problem" title="One Alert Is a Signal. The Investigation Is the Story." />
      <div className="mt-12 grid gap-5 md:grid-cols-3">
        {cards.map((c) => (
          <article key={c.title} className="glass hairline-top group rounded-2xl p-6 transition hover:border-cyan/40">
            <span className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-surface2 text-cyan"><Icon name={c.icon} className="h-5 w-5" /></span>
            <h3 className="mt-5 text-lg font-semibold">{c.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">{c.body}</p>
          </article>
        ))}
      </div>
      <blockquote className="mx-auto mt-14 max-w-3xl border-l-2 border-cyan pl-5 text-lg font-medium leading-relaxed text-ink sm:text-xl">
        The challenge is not simply detecting suspicious activity. It is establishing which events belong together — and knowing when the evidence is insufficient.
      </blockquote>
    </Section>
  );
}

/* ------------------------------------------------------------ 6. solution */
const TIERS: Tier[] = ['observed', 'inferred-strong', 'inferred-weak', 'not-linked'];

export function Solution() {
  return (
    <Section id="solution" className="pb-20 sm:pb-28" label="From events to evidence">
      <Heading eyebrow="From events to evidence" title="Every Connection Has a Reason.">
        Connect what the evidence supports. Explain what it doesn’t.
      </Heading>

      <div className="mt-12 grid gap-5 lg:grid-cols-3">
        <article className="glass hairline-top rounded-2xl p-6">
          <p className="font-mono text-xs text-cyan">01 · DETECT</p>
          <h3 className="mt-3 text-xl font-semibold">Documented deterministic rules</h3>
          <p className="mt-2 text-sm text-muted">Each rule lists its inputs, threshold, time window, severity, and known limitation.</p>
          <ul className="mt-4 space-y-1.5 text-sm text-ink/90">
            {['Sender and Reply-To mismatch', 'Lookalike domains', 'Credential or urgency language', 'Risky attachment indicators', 'Suspicious URL structure and redirect chains',
              'Repeated authentication failures', 'One source targeting multiple accounts', 'Multiple sources targeting one account', 'Successful login following repeated failures'].map((t) => (
              <li key={t} className="flex gap-2"><Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-cyan" />{t}</li>
            ))}
          </ul>
        </article>

        <article className="glass hairline-top rounded-2xl p-6">
          <p className="font-mono text-xs text-violet">02 · CORRELATE</p>
          <h3 className="mt-3 text-xl font-semibold">Link only what is defensible</h3>
          <p className="mt-2 text-sm text-muted">Relationships need a shared identifier and valid time and ordering constraints. The exact tier depends on the rule and the evidence available.</p>
          <dl className="mt-4 space-y-3">
            {TIERS.map((t) => (
              <div key={t}><dt><TierBadge tier={t} /></dt><dd className="mt-1.5 text-sm text-muted">{TIER_MEANING[t]}</dd></div>
            ))}
          </dl>
        </article>

        <article className="glass hairline-top rounded-2xl p-6">
          <p className="font-mono text-xs text-ice">03 · EXPLAIN</p>
          <h3 className="mt-3 text-xl font-semibold">Reports that cite their evidence</h3>
          <p className="mt-2 text-sm text-muted">Every incident report identifies:</p>
          <ul className="mt-3 space-y-1.5 text-sm text-ink/90">
            {['Supporting event IDs', 'Evidence items', 'Relationship rationale', 'Alternative explanations', 'Missing evidence', 'Rejected candidate links', 'Suggested investigation steps'].map((t) => (
              <li key={t} className="flex gap-2"><Icon name="doc" className="mt-0.5 h-4 w-4 shrink-0 text-ice" />{t}</li>
            ))}
          </ul>
          <p className="mt-4 rounded-lg border border-line bg-obsidian/50 p-3 text-xs leading-relaxed text-muted">
            Source observations, inferences, and any AI-generated interpretation are labelled separately.
          </p>
        </article>
      </div>
    </Section>
  );
}

/* --------------------------------------------------------- 8. capabilities */
export function Capabilities() {
  const items = [
    { icon: 'mail', title: 'Email Intelligence', body: 'Identify suspicious email characteristics, phishing indicators, spam, and promotional content where supported by the implemented rules or classifier. Suspicious is kept distinct from malicious.' },
    { icon: 'globe', title: 'URL Investigation', body: 'Normalize URLs, examine structural indicators, inspect supported redirect information, and show findings with explicit limitations. An unlisted URL is inconclusive, not safe.' },
    { icon: 'user', title: 'Authentication Analysis', body: 'Identify repeated failures, password-spraying patterns, multiple sources targeting one account, and successful logins that follow failures.' },
    { icon: 'graph', title: 'Cross-Event Correlation', body: 'Connect email, web, and authentication events using documented identifiers, time constraints, and relationship tiers, and record the links that were refused.' },
    { icon: 'shield', title: 'Evidence-Checked Reports', body: 'Present findings with traceable evidence references. Generated explanations are checked so they cannot cite nonexistent or irrelevant evidence.' },
    { icon: 'chart', title: 'Evaluation and Reliability', body: 'A foundation for evaluating precision, recall, false positives and negatives, link accuracy, detection latency, and restart or re-ingestion reliability from actual test runs.' },
  ];
  return (
    <Section id="capabilities" className="py-20 sm:py-28" label="Capabilities">
      <Heading eyebrow="Capabilities" title="Designed for Evidence-Based Investigation." />
      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((c) => (
          <article key={c.title} className="glass hairline-top rounded-2xl p-6 transition duration-300 hover:-translate-y-0.5 hover:border-cyan/40">
            <span className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-surface2 text-cyan"><Icon name={c.icon} className="h-5 w-5" /></span>
            <h3 className="mt-5 text-lg font-semibold">{c.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">{c.body}</p>
          </article>
        ))}
      </div>
      <p className="mt-6 text-sm text-muted">No performance figures are shown on this page. Metrics will appear only after they are produced by real test runs.</p>
    </Section>
  );
}

/* ------------------------------------------------------------ 9. how works */
export function HowItWorks() {
  const steps = [
    { n: '01', title: 'Generate or Receive Events', body: 'In the planned MVP, independent local services generate their own mail, web, and authentication logs. Public email datasets may optionally support offline classifier evaluation.' },
    { n: '02', title: 'Normalize and Ingest', body: 'Convert records into a common event schema. Preserve provenance, handle duplicates, and resume ingestion from checkpoints.' },
    { n: '03', title: 'Detect and Correlate', body: 'Run documented detectors, establish eligible candidate relationships, record evidence tiers, and keep rejected links with their reasons.' },
    { n: '04', title: 'Verify and Investigate', body: 'Build evidence-linked reports and expose findings, timeline, graph, missing evidence, and evaluation results in the console.' },
  ];
  return (
    <Section id="how-it-works" className="py-20 sm:py-28" label="How TraceGuard works">
      <Heading eyebrow="How it works" title="From Independent Services to One Investigation." />
      <ol className="relative mt-12 grid gap-8 md:grid-cols-4 md:gap-5">
        <span aria-hidden="true" className="absolute left-[19px] top-2 h-[calc(100%-1rem)] w-px bg-gradient-to-b from-cyan/60 via-violet/40 to-transparent md:hidden" />
        <span aria-hidden="true" className="absolute left-0 right-0 top-[19px] hidden h-px bg-gradient-to-r from-cyan/60 via-violet/40 to-transparent md:block" />
        {steps.map((s) => (
          <li key={s.n} className="relative pl-14 md:pl-0 md:pt-14">
            <span className="absolute left-0 top-0 grid h-10 w-10 place-items-center rounded-full border border-cyan/50 bg-obsidian font-mono text-xs text-cyan">{s.n}</span>
            <h3 className="text-lg font-semibold">{s.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">{s.body}</p>
          </li>
        ))}
      </ol>
      <p className="mt-10 text-sm text-muted">Status: this describes the planned MVP. Items are not claimed as deployed.</p>
    </Section>
  );
}

/* -------------------------------------------------------------- 10. AI trust */
export function AITrust() {
  const items = [
    { icon: 'link', title: 'Evidence Before Explanation', body: 'Incident reports must reference existing evidence items and event IDs.' },
    { icon: 'question', title: 'Uncertainty Stays Visible', body: 'AI cannot turn a weak inference into a confirmed relationship.' },
    { icon: 'lock', title: 'Untrusted Content Stays Untrusted', body: 'Email and web content must not become instructions to privileged system components.' },
    { icon: 'eye', title: 'Human-Led Investigation', body: 'The analyst reviews the evidence and decides what action is appropriate.' },
  ];
  return (
    <Section id="trust" className="py-20 sm:py-28" label="AI and trust">
      <Heading eyebrow="Trust & Evidence" title="AI That Explains. Evidence That Grounds.">
        AI is an optional assistance layer, not the source of truth. If it is unavailable, the report workflow continues with deterministic templates.
      </Heading>
      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((c) => (
          <article key={c.title} className="glass hairline-top rounded-2xl p-6">
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-violet/40 bg-violet/10 text-violet"><Icon name={c.icon} className="h-5 w-5" /></span>
            <h3 className="mt-4 text-base font-semibold">{c.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{c.body}</p>
          </article>
        ))}
      </div>

      <figure className="glass mt-8 rounded-2xl p-5 sm:p-6" aria-label="Planned report path">
        <figcaption className="text-xs font-semibold uppercase tracking-wider text-muted">Planned report path</figcaption>
        <ol className="mt-4 flex flex-col items-stretch gap-3 lg:flex-row lg:items-center">
          {[
            { t: 'Evidence ledger', s: 'event IDs and typed evidence', c: 'border-cyan/40 text-cyan' },
            { t: 'AI explainer (optional)', s: 'sees only the ledger, never raw email', c: 'border-violet/40 text-violet' },
            { t: 'Server-side verifier', s: 'rejects uncited or unknown evidence', c: 'border-ok/40 text-ok' },
            { t: 'Report', s: 'AI text is labelled AI-generated', c: 'border-line text-ink' },
          ].map((s, i, a) => (
            <li key={s.t} className="flex flex-1 items-center gap-3">
              <div className={`flex-1 rounded-xl border bg-obsidian/50 p-3 ${s.c}`}>
                <p className="text-sm font-semibold">{s.t}</p><p className="mt-0.5 text-xs text-muted">{s.s}</p>
              </div>
              {i < a.length - 1 && <Icon name="arrow" className="hidden h-4 w-4 shrink-0 text-muted lg:block" />}
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm text-muted">A model-written sentence is never treated as verified merely because it was generated. If the verifier rejects it, or the model is unavailable, the deterministic template report is used.</p>
      </figure>
    </Section>
  );
}

/* ---------------------------------------------------------- 12. limitations */
export function Limitations() {
  const [open, setOpen] = useState(false);
  const short = [
    'Synthetic lab events are not observations from a real company environment.',
    'Details a lab cannot expose (SPF, DKIM, DMARC, geolocation, device) stay unknown.',
    'An unavailable or unlisted URL is inconclusive, not automatically safe.',
  ];
  const more = [
    'Public email datasets do not independently establish relationships with web or authentication events.',
    'Optional AI explanations may fail or be unavailable; reports have a template fallback.',
    'Automatic blocking, deletion, and session revocation are outside the planned MVP.',
  ];
  return (
    <Section className="py-20 sm:py-28" label="Limitations">
      <div className="glass hairline-top rounded-3xl p-6 sm:p-10">
        <Heading eyebrow="Responsible by design" title="Clear About What We Know — and What We Don’t." />
        <ul className="mt-8 grid gap-3 md:grid-cols-3">
          {short.map((t) => (
            <li key={t} className="flex gap-3 rounded-xl border border-line bg-obsidian/40 p-4 text-sm leading-relaxed text-ink/90">
              <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-warn" />{t}
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="more-limits"
          className="mt-4 inline-flex min-h-9 items-center gap-2 text-sm font-medium text-cyan hover:text-ice">
          {open ? 'Hide' : 'Show'} more boundaries
        </button>
        {open && (
          <ul id="more-limits" className="mt-4 grid gap-3 md:grid-cols-3">
            {more.map((t) => (
              <li key={t} className="flex gap-3 rounded-xl border border-line bg-obsidian/40 p-4 text-sm leading-relaxed text-ink/90">
                <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-warn" />{t}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}
