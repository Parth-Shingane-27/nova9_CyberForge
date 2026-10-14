import { useEffect, useState, type ReactNode } from 'react';
import type { Tier } from './scenario';

/* ------------------------------------------------------------------ hooks */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [query]);
  return matches;
}
export const useReducedMotion = () => useMediaQuery('(prefers-reduced-motion: reduce)');

/* ------------------------------------------------------------------ icons */
const PATHS: Record<string, string> = {
  mail: 'M4 6h16v12H4z M4 7l8 6 8-6',
  globe: 'M12 3a9 9 0 100 18 9 9 0 000-18z M3 12h18 M12 3c3 3 3 15 0 18 M12 3c-3 3-3 15 0 18',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8z M4 20c0-4 4-6 8-6s8 2 8 6',
  graph: 'M6 4a2 2 0 110 4 2 2 0 010-4z M18 4a2 2 0 110 4 2 2 0 010-4z M12 16a2 2 0 110 4 2 2 0 010-4z M7.4 7.6l3.6 8 M16.6 7.6l-3.6 8 M8 6h8',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4',
  check: 'M5 12l5 5 9-10',
  chart: 'M4 20V4 M4 20h16 M8 16v-5 M12 16V8 M16 16v-3',
  route: 'M5 17a2 2 0 110 4 2 2 0 010-4z M19 3a2 2 0 110 4 2 2 0 010-4z M7 19h6a3 3 0 003-3v-1a3 3 0 00-3-3h-2a3 3 0 01-3-3V8a3 3 0 013-3h6',
  x: 'M6 6l12 12 M18 6L6 18',
  menu: 'M4 7h16 M4 12h16 M4 17h16',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  play: 'M8 5v14l11-7z',
  pause: 'M8 5v14 M16 5v14',
  replay: 'M4 12a8 8 0 108-8 M4 4v5h5',
  link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1 M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
  clock: 'M12 3a9 9 0 100 18 9 9 0 000-18z M12 7v5l3 2',
  question: 'M12 3a9 9 0 100 18 9 9 0 000-18z M9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1-1.5 2 M12 17h.01',
  doc: 'M7 3h7l4 4v14H7z M14 3v4h4 M9 12h6 M9 16h6',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 9a3 3 0 100 6 3 3 0 000-6z',
  lock: 'M6 11h12v9H6z M8 11V8a4 4 0 018 0v3',
  key: 'M8 14a4 4 0 110-8 4 4 0 010 8z M11 11l9 9 M16 16l2-2 M18 18l2-2',
  layers: 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5',
  alert: 'M12 3l10 18H2z M12 10v5 M12 18h.01',
};

export function Icon({ name, className = 'h-5 w-5', title }: { name: keyof typeof PATHS | string; className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}
      aria-label={title}>
      {PATHS[name]?.split(' M').map((d, i) => <path key={i} d={(i ? 'M' : '') + d} />)}
    </svg>
  );
}

export function Logo({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#101725" stroke="#263247" />
      <path d="M7 22 14 11l5 7 6-10" fill="none" stroke="#53D8E8" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 11l5 7" fill="none" stroke="#9585F7" strokeWidth="2.3" strokeLinecap="round" strokeDasharray="1 4" />
      <circle cx="7" cy="22" r="2.6" fill="#080B12" stroke="#91EAF2" strokeWidth="1.6" />
      <circle cx="25" cy="8" r="2.6" fill="#9585F7" />
    </svg>
  );
}

/* ----------------------------------------------------------------- badges */
/** Evidence tier. Shape + text, never color alone. */
export function TierBadge({ tier }: { tier: Tier }) {
  const map: Record<Tier, { label: string; cls: string; glyph: ReactNode }> = {
    observed: {
      label: 'Observed', cls: 'border-cyan/50 text-cyan',
      glyph: <svg viewBox="0 0 20 8" className="h-2 w-5"><path d="M1 4h18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg>,
    },
    'inferred-strong': {
      label: 'Inferred · strong', cls: 'border-violet/50 text-violet',
      glyph: <svg viewBox="0 0 20 8" className="h-2 w-5"><path d="M1 4h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>,
    },
    'inferred-weak': {
      label: 'Inferred · weak', cls: 'border-warn/50 text-warn',
      glyph: <svg viewBox="0 0 20 8" className="h-2 w-5"><path d="M1 4h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 3" /></svg>,
    },
    'not-linked': {
      label: 'Not linked', cls: 'border-crit/50 text-crit',
      glyph: <svg viewBox="0 0 10 10" className="h-2.5 w-2.5"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>,
    },
  };
  const t = map[tier];
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border bg-obsidian/40 px-2.5 py-1 text-xs font-medium ${t.cls}`}>
      {t.glyph}{t.label}
    </span>
  );
}

const SEVERITIES = ['Informational', 'Low', 'Medium', 'High', 'Critical'] as const;
export type Severity = (typeof SEVERITIES)[number];
const SEV_COLOR: Record<Severity, string> = {
  Informational: 'text-muted border-line', Low: 'text-ok border-ok/40', Medium: 'text-warn border-warn/40',
  High: 'text-crit border-crit/40', Critical: 'text-crit border-crit',
};

/** Severity: text + a 5-step bar meter. */
export function SeverityBadge({ level }: { level: Severity }) {
  const n = SEVERITIES.indexOf(level) + 1;
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border bg-obsidian/40 px-2.5 py-1 text-xs font-medium ${SEV_COLOR[level]}`}
      title={`Severity: ${level} (${n} of 5)`}>
      <span className="sr-only">Severity: </span>
      <span aria-hidden="true" className="flex items-end gap-[2px]">
        {SEVERITIES.map((_, i) => (
          <i key={i} className={`block w-[3px] rounded-sm ${i < n ? 'bg-current' : 'bg-current opacity-25'}`} style={{ height: 4 + i * 2 }} />
        ))}
      </span>
      {level}
    </span>
  );
}

const CONF = ['Low', 'Medium', 'High'] as const;
export type Confidence = (typeof CONF)[number];

/** Confidence is a separate concept from severity: text + three dots. */
export function ConfidenceBadge({ level }: { level: Confidence }) {
  const n = CONF.indexOf(level) + 1;
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-violet/40 bg-obsidian/40 px-2.5 py-1 text-xs font-medium text-violet"
      title={`Evidence confidence: ${level}`}>
      <span className="sr-only">Evidence confidence: </span>
      <span aria-hidden="true" className="flex gap-[3px]">
        {CONF.map((_, i) => <i key={i} className={`block h-1.5 w-1.5 rounded-full ${i < n ? 'bg-current' : 'bg-current opacity-25'}`} />)}
      </span>
      {level} confidence
    </span>
  );
}

export function SourceTag({ source }: { source: 'EMAIL' | 'WEB' | 'AUTH' }) {
  const icon = source === 'EMAIL' ? 'mail' : source === 'WEB' ? 'globe' : 'user';
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-obsidian/50 px-2 py-0.5 font-mono text-[11px] tracking-wider text-muted">
      <Icon name={icon} className="h-3 w-3" />{source}
    </span>
  );
}

export function SimulatedChip({ children = 'Simulated scenario' }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-warn/40 bg-warn/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-warn">
      <Icon name="alert" className="h-3 w-3" />{children}
    </span>
  );
}

/* ---------------------------------------------------------------- layout */
export function Section({ id, className = '', children, label }: { id?: string; className?: string; children: ReactNode; label?: string }) {
  return (
    <section id={id} aria-label={label} className={`relative ${className}`}>
      <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">{children}</div>
    </section>
  );
}

export function Heading({ eyebrow, title, children, align = 'left' }: { eyebrow: string; title: string; children?: ReactNode; align?: 'left' | 'center' }) {
  return (
    <div className={`max-w-3xl ${align === 'center' ? 'mx-auto text-center' : ''}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan">{eyebrow}</p>
      <h2 className="mt-3 text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{title}</h2>
      {children && <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">{children}</p>}
    </div>
  );
}
