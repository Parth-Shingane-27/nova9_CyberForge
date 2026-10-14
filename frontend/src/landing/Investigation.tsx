import { useState } from 'react';
import { Details, Timeline } from './Details';
import { EvidenceGraph, type Selection } from './EvidenceGraph';
import { EVENTS, TIER_LABEL, type Tier } from './scenario';
import { Heading, Section, SimulatedChip, TierBadge, useMediaQuery } from './ui';

const TIMES = Object.fromEntries(EVENTS.map((e) => [e.id, e.time]));
const LEGEND: Tier[] = ['observed', 'inferred-strong', 'inferred-weak', 'not-linked'];

export function Investigation() {
  const compact = useMediaQuery('(max-width: 639px)');
  const [sel, setSel] = useState<Selection>(null);

  return (
    <Section id="investigation" className="py-20 sm:py-28" label="Interactive investigation">
      <Heading eyebrow="Interactive investigation" title="Follow the Evidence, Not the Assumption.">
        A simulated password-reset scenario, plus an unrelated user whose failed logins fall in the same minutes. Select any node or connection.
      </Heading>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="glass hairline-top rounded-3xl p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <SimulatedChip>Simulated data · not live</SimulatedChip>
            {sel && (
              <button type="button" onClick={() => setSel(null)} className="text-xs font-medium text-muted underline-offset-4 hover:text-ink hover:underline">Clear selection</button>
            )}
          </div>
          <EvidenceGraph compact={compact} selected={sel} onSelect={setSel} times={TIMES} />
          <ul className="mt-4 flex flex-wrap gap-2" aria-label="Legend">
            {LEGEND.map((t) => <li key={t} title={TIER_LABEL[t]}><TierBadge tier={t} /></li>)}
          </ul>
          <p className="mt-3 text-xs text-muted">No strong inference exists in this scenario; the legend shows every tier the engine can assign.</p>
        </div>

        <div className="flex flex-col gap-6">
          <Details selection={sel} onQuick={setSel} />
        </div>
      </div>

      <div className="glass hairline-top mt-6 rounded-3xl p-5 sm:p-6">
        <h3 className="text-base font-semibold">Chronological timeline</h3>
        <p className="mb-4 mt-1 text-sm text-muted">Events from all three sources in one ordered view. The timeline orders events; it does not link them.</p>
        <Timeline selection={sel} onPick={setSel} />
      </div>
    </Section>
  );
}
