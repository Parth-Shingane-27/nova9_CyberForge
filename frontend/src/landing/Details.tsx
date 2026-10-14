import { EVENTS, TIER_LABEL, TIER_MEANING, getEdge, getEvent, getNode } from './scenario';
import type { Selection } from './EvidenceGraph';
import { Icon, SourceTag, TierBadge } from './ui';

function Bullets({ title, items, icon }: { title: string; items: string[]; icon: string }) {
  if (!items.length) return null;
  return (
    <div className="mt-4">
      <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
        <Icon name={icon} className="h-3.5 w-3.5" />{title}
      </h4>
      <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-ink/90">
        {items.map((t) => <li key={t} className="flex gap-2"><span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted" />{t}</li>)}
      </ul>
    </div>
  );
}

function IdList({ ids }: { ids: string[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {ids.map((id) => (
        <span key={id} className="rounded-md border border-line bg-obsidian/60 px-2 py-0.5 font-mono text-[11px] text-ice">{id}</span>
      ))}
    </div>
  );
}

export function Details({ selection, onQuick }: { selection: Selection; onQuick?: (s: Selection) => void }) {
  if (!selection) {
    return (
      <div className="flex h-full flex-col justify-center rounded-2xl border border-dashed border-line p-6 text-sm text-muted">
        <p className="text-ink">Select an event group or a connection in the graph.</p>
        <p className="mt-2">Every relationship shows its supporting event IDs, why it was created (or refused), the alternative explanations, and what evidence is missing.</p>
        {onQuick && (
          <div className="mt-5 flex flex-wrap gap-2">
            {[
              { l: 'Observed link', s: { kind: 'edge', id: 'e1' } as const },
              { l: 'Weak inference', s: { kind: 'edge', id: 'e2' } as const },
              { l: 'Rejected link', s: { kind: 'edge', id: 'r1' } as const },
            ].map((q) => (
              <button key={q.l} type="button" onClick={() => onQuick(q.s)}
                className="rounded-full border border-line bg-surface2 px-3 py-1.5 text-xs font-medium text-ink transition hover:border-cyan/60">
                {q.l}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (selection.kind === 'node') {
    const node = getNode(selection.id)!;
    return (
      <div className="rise rounded-2xl border border-line bg-surface2/80 p-5" aria-live="polite">
        <div className="flex flex-wrap items-center gap-2"><SourceTag source={node.source} /><span className="text-xs text-muted">Source observations</span></div>
        <h3 className="mt-3 text-lg font-semibold">{node.title}</h3>
        <p className="mt-1 text-sm text-muted">Facts recorded by the originating service. Nothing here is inferred.</p>
        <div className="mt-4 space-y-3">
          {node.eventIds.slice(0, 2).map((id) => {
            const ev = getEvent(id)!;
            return (
              <div key={id} className="rounded-xl border border-line bg-obsidian/50 p-3">
                <div className="flex items-baseline justify-between gap-3 font-mono text-xs">
                  <span className="text-ice">{ev.id}</span><span className="text-muted">{ev.time} · {ev.kind}</span>
                </div>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  {ev.fields.map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-muted">{k}</dt><dd className="break-words font-mono text-[13px] text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })}
          {node.eventIds.length > 2 && (
            <p className="text-xs text-muted">+ {node.eventIds.length - 2} more events with the same pattern: <span className="font-mono">{node.eventIds.slice(2).join(', ')}</span></p>
          )}
        </div>
        {node.id === 'n-other' && (
          <p className="mt-4 rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm text-warn">
            Different account and source. It occurs in the same minutes but is not part of the incident, and the correlation engine records why.
          </p>
        )}
      </div>
    );
  }

  const edge = getEdge(selection.id)!;
  const from = getNode(edge.from)!;
  const to = getNode(edge.to)!;
  return (
    <div className="rise rounded-2xl border border-line bg-surface2/80 p-5" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <TierBadge tier={edge.tier} />
        <span className="text-xs text-muted">{edge.tier === 'not-linked' ? 'Refusal record' : 'Inferred or grouped by rule'}</span>
      </div>
      <h3 className="mt-3 text-lg font-semibold">{from.title} <span className="text-muted">→</span> {to.title}</h3>
      <p className="mt-1 text-sm text-muted">{TIER_LABEL[edge.tier]}: {TIER_MEANING[edge.tier]}</p>

      <h4 className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted">Supporting event IDs</h4>
      <IdList ids={edge.supportIds} />

      {edge.refusal ? (
        <>
          <Bullets title="Why it was refused" icon="x" items={[edge.refusal.reason]} />
          <Bullets title="Required to link" icon="key" items={[edge.refusal.required]} />
          <Bullets title="About timing" icon="clock" items={[edge.refusal.timing]} />
        </>
      ) : (
        <>
          <Bullets title="Why the link exists" icon="link" items={[edge.rationale]} />
          <Bullets title="Alternative explanations" icon="question" items={edge.alternatives} />
          <Bullets title="Missing evidence" icon="eye" items={edge.missing} />
        </>
      )}
    </div>
  );
}

export function Timeline({ selection, onPick }: { selection: Selection; onPick?: (s: Selection) => void }) {
  const ordered = [...EVENTS].sort((a, b) => a.time.localeCompare(b.time));
  const highlighted = new Set<string>();
  if (selection?.kind === 'node') getNode(selection.id)?.eventIds.forEach((i) => highlighted.add(i));
  if (selection?.kind === 'edge') getEdge(selection.id)?.supportIds.forEach((i) => highlighted.add(i));
  return (
    <ol className="relative space-y-1.5 border-l border-line pl-4" aria-label="Chronological event timeline (simulated)">
      {ordered.map((ev) => {
        const on = highlighted.has(ev.id);
        return (
          <li key={ev.id} className="relative">
            <span aria-hidden="true" className={`absolute -left-[21px] top-3 h-2.5 w-2.5 rounded-full border ${on ? 'border-cyan bg-cyan' : 'border-line bg-obsidian'}`} />
            <button type="button" onClick={() => onPick?.({ kind: 'node', id: ev.node })}
              className={`flex w-full items-start gap-3 rounded-lg px-2.5 py-1.5 text-left text-sm transition ${on ? 'bg-cyan/10' : 'hover:bg-surface2'}`}>
              <span className="w-[4.5rem] shrink-0 pt-0.5 font-mono text-xs text-muted">{ev.time}</span>
              <span className="min-w-0 flex-1">
                <span className="mr-2 inline-block"><SourceTag source={ev.source} /></span>
                <span className="text-ink/90">{ev.summary}</span>
                <span className="ml-2 font-mono text-[11px] text-ice">{ev.id}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
