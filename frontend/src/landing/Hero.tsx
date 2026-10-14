import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { EVENTS, INCIDENT } from './scenario';
import { EvidenceGraph, FULL_STEP } from './EvidenceGraph';
import { ConfidenceBadge, Icon, SeverityBadge, SimulatedChip, useMediaQuery, useReducedMotion } from './ui';

const TIMES = Object.fromEntries(EVENTS.map((e) => [e.id, e.time]));
const STEP_LABEL = [
  'Ready to replay',
  '1 · Email event appears',
  '2 · Matching web event appears',
  '3 · Authentication events appear',
  '4 · Evidence-supported relationships are drawn',
  '5 · A rejected relationship appears, with its reason',
  '6 · Incident summary',
];

function Principle({ icon, children }: { icon: string; children: string }) {
  return (
    <li className="flex items-center gap-2.5 text-sm text-ink/90">
      <span className="grid h-7 w-7 place-items-center rounded-lg border border-line bg-surface2 text-cyan"><Icon name={icon} className="h-4 w-4" /></span>
      {children}
    </li>
  );
}

export function Hero() {
  const reduced = useReducedMotion();
  const compact = useMediaQuery('(max-width: 639px)');
  const [step, setStep] = useState(FULL_STEP);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (timer.current !== null) { window.clearInterval(timer.current); timer.current = null; }
    setPlaying(false);
  }, []);

  const play = useCallback(() => {
    stop();
    if (reduced) { setStep(FULL_STEP); return; } // no motion: show the finished state
    setStep(0);
    setPlaying(true);
    timer.current = window.setInterval(() => {
      setStep((s) => {
        if (s >= FULL_STEP) { stop(); return s; }
        return s + 1;
      });
    }, 1300);
  }, [reduced, stop]);

  // play once on load (unless reduced motion); always clean up the timer
  useEffect(() => { const t = window.setTimeout(play, 500); return () => { window.clearTimeout(t); stop(); }; }, [play, stop]);

  return (
    <section id="top" aria-label="TraceGuard AI introduction" className="relative isolate overflow-hidden pt-28 sm:pt-32">
      <div className="bg-aurora absolute inset-0 -z-10" aria-hidden="true" />
      <div className="bg-grid absolute inset-0 -z-10" aria-hidden="true" />
      <div className="mx-auto grid w-full max-w-7xl items-center gap-12 px-5 pb-20 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pb-28">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan">Evidence-first cybersecurity intelligence</p>
          <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl xl:text-[3.5rem]">
            Alerts Tell You What Happened.{' '}
            <span className="bg-gradient-to-r from-cyan to-violet bg-clip-text text-transparent">TraceGuard Tells You What’s Connected.</span>
          </h1>
          <p className="mt-4 text-lg text-ice/90">Investigate the connections. Understand the evidence. Know what remains unknown.</p>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted">
            Email warnings, suspicious links, and unusual login attempts rarely tell the whole story. TraceGuard AI brings these signals into a
            single investigation workflow, linking events through evidence and showing analysts what is known, what is inferred, and what remains uncertain.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#investigation" className="inline-flex items-center gap-2 rounded-xl bg-cyan px-5 py-3 text-sm font-semibold text-obsidian transition hover:bg-ice">
              Explore the Investigation<Icon name="arrow" className="h-4 w-4" />
            </a>
            <Link to="/console" className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface/70 px-5 py-3 text-sm font-semibold text-ink transition hover:border-cyan/60">
              Open Security Console
            </Link>
          </div>
          <ul className="mt-9 grid gap-3 sm:grid-cols-3 sm:gap-4">
            <Principle icon="link">Evidence-linked findings</Principle>
            <Principle icon="route">Explainable event relationships</Principle>
            <Principle icon="question">Explicit uncertainty</Principle>
          </ul>
          <p className="mt-8 text-xs text-muted">Hackathon prototype in design and early build. The scenario on this page is simulated; no live telemetry is shown.</p>
        </div>

        <div className="relative">
          <div className="glass hairline-top rounded-3xl p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <SimulatedChip />
              <div className="flex items-center gap-2">
                <button type="button" onClick={playing ? stop : play} aria-label={playing ? 'Pause scenario replay' : 'Replay scenario'}
                  className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface2 px-3 py-1.5 text-xs font-medium text-ink transition hover:border-cyan/60">
                  <Icon name={playing ? 'pause' : 'replay'} className="h-3.5 w-3.5" />{playing ? 'Pause' : 'Replay scenario'}
                </button>
              </div>
            </div>

            <EvidenceGraph compact={compact} step={step} times={TIMES} />

            <p className="mt-3 min-h-5 text-xs text-muted" role="status" aria-live="polite">{STEP_LABEL[step]}</p>

            <div className={`mt-4 rounded-2xl border border-line bg-obsidian/60 p-4 transition-opacity duration-500 ${step >= FULL_STEP ? 'opacity-100' : 'opacity-0'}`}
              aria-hidden={step < FULL_STEP}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-mono text-sm text-ice">{INCIDENT.id}</p>
                  <p className="text-xs text-muted">{INCIDENT.eventCount} events · {INCIDENT.missingCount} items of missing evidence</p>
                </div>
                <div className="flex flex-wrap gap-2"><SeverityBadge level={INCIDENT.severity} /><ConfidenceBadge level={INCIDENT.confidence} /></div>
              </div>
              <a href="#investigation" className="mt-2 inline-flex min-h-9 items-center gap-1.5 text-sm font-medium text-cyan hover:text-ice">
                View investigation<Icon name="arrow" className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
