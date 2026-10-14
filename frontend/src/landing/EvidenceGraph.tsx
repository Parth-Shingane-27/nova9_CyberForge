import { EDGES, NODES, TIER_LABEL, getNode, type GraphEdge, type GraphNode, type Tier } from './scenario';

export type Selection = { kind: 'node' | 'edge'; id: string } | null;

/** Number of replay steps. 1 email · 2 web · 3 auth events · 4 relationships · 5 rejected link · 6 incident summary. */
export const FULL_STEP = 6;

interface Box { x: number; y: number; w: number; h: number }
interface EdgeGeom { d: string; mid: [number, number]; anchor: 'start' | 'middle' | 'end'; dy: number }
interface Layout { vb: [number, number]; nodes: Record<string, Box>; edges: Record<string, EdgeGeom> }

const WIDE: Layout = {
  vb: [620, 410],
  nodes: {
    'n-email': { x: 20, y: 16, w: 214, h: 84 },
    'n-web': { x: 386, y: 16, w: 214, h: 84 },
    'n-burst': { x: 386, y: 156, w: 214, h: 84 },
    'n-success': { x: 386, y: 296, w: 214, h: 84 },
    'n-other': { x: 20, y: 296, w: 214, h: 84 },
  },
  edges: {
    e1: { d: 'M234 58H386', mid: [310, 58], anchor: 'middle', dy: -10 },
    e2: { d: 'M493 100V156', mid: [505, 128], anchor: 'start', dy: 4 },
    e3: { d: 'M493 240V296', mid: [505, 268], anchor: 'start', dy: 4 },
    r1: { d: 'M127 100V296', mid: [127, 198], anchor: 'start', dy: 4 },
  },
};

const COMPACT: Layout = {
  vb: [340, 566],
  nodes: {
    'n-email': { x: 16, y: 8, w: 286, h: 78 },
    'n-web': { x: 16, y: 126, w: 286, h: 78 },
    'n-burst': { x: 16, y: 244, w: 286, h: 78 },
    'n-success': { x: 16, y: 362, w: 286, h: 78 },
    'n-other': { x: 16, y: 480, w: 286, h: 78 },
  },
  edges: {
    e1: { d: 'M159 86V126', mid: [171, 109], anchor: 'start', dy: 4 },
    e2: { d: 'M159 204V244', mid: [171, 227], anchor: 'start', dy: 4 },
    e3: { d: 'M159 322V362', mid: [171, 345], anchor: 'start', dy: 4 },
    r1: { d: 'M302 47C334 47 334 519 302 519', mid: [326, 283], anchor: 'end', dy: 4 },
  },
};

const NODE_STEP: Record<string, number> = { 'n-email': 1, 'n-web': 2, 'n-burst': 3, 'n-success': 3, 'n-other': 3 };
const EDGE_STEP: Record<string, number> = { e1: 4, e2: 4, e3: 4, r1: 5 };

const TIER_STYLE: Record<Tier, { stroke: string; width: number; dash?: string; short: string }> = {
  observed: { stroke: '#53D8E8', width: 2.6, short: 'observed' },
  'inferred-strong': { stroke: '#9585F7', width: 2.4, short: 'strong inference' },
  'inferred-weak': { stroke: '#F4BD70', width: 2.2, dash: '7 6', short: 'weak inference' },
  'not-linked': { stroke: '#FF7185', width: 2, dash: '2 7', short: 'not linked' },
};

const SOURCE_GLYPH: Record<GraphNode['source'], string> = { EMAIL: '✉', WEB: '◎', AUTH: '◉' };

function eventRange(n: GraphNode): string {
  const first = n.eventIds[0];
  const last = n.eventIds[n.eventIds.length - 1];
  return first === last ? first : `${first}–${last.slice(3)}`;
}

function nodeTime(n: GraphNode, times: Record<string, string>): string {
  return times[n.eventIds[0]] ?? '';
}

export function EvidenceGraph({
  compact, step = FULL_STEP, selected = null, onSelect, times,
}: {
  compact: boolean;
  step?: number;
  selected?: Selection;
  onSelect?: (s: Selection) => void;
  times: Record<string, string>;
}) {
  const L = compact ? COMPACT : WIDE;
  const interactive = !!onSelect;

  const relatedNodes = new Set<string>();
  const relatedEdges = new Set<string>();
  if (selected?.kind === 'node') {
    relatedNodes.add(selected.id);
    EDGES.forEach((e) => {
      if (e.from === selected.id || e.to === selected.id) { relatedEdges.add(e.id); relatedNodes.add(e.from); relatedNodes.add(e.to); }
    });
  } else if (selected?.kind === 'edge') {
    const e = EDGES.find((x) => x.id === selected.id);
    if (e) { relatedEdges.add(e.id); relatedNodes.add(e.from); relatedNodes.add(e.to); }
  }
  const dim = (set: Set<string>, id: string) => (selected && !set.has(id) ? 0.35 : 1);

  const activate = (s: Selection) => (ev: { preventDefault: () => void }) => { ev.preventDefault(); onSelect?.(s); };
  const keyActivate = (s: Selection) => (ev: React.KeyboardEvent) => {
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onSelect?.(s); }
  };

  return (
    <svg viewBox={`0 0 ${L.vb[0]} ${L.vb[1]}`} className="h-auto w-full select-none" role="group"
      aria-label="Evidence graph of a simulated scenario: email, web visit, login failures, a successful login, and an unrelated user">
      <defs>
        <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="rgba(145,234,242,.08)" /></pattern>
      </defs>
      <rect width={L.vb[0]} height={L.vb[1]} fill="url(#dots)" rx="14" />

      {/* edges first so nodes sit on top */}
      {EDGES.map((e: GraphEdge) => {
        const g = L.edges[e.id];
        const st = TIER_STYLE[e.tier];
        const shown = step >= EDGE_STEP[e.id];
        const isSel = selected?.kind === 'edge' && selected.id === e.id;
        const label = e.tier === 'not-linked' ? 'not linked' : st.short;
        return (
          <g key={e.id} style={{ opacity: shown ? dim(relatedEdges, e.id) : 0, transition: 'opacity .5s' }}
            aria-hidden={!shown}>
            <path d={g.d} fill="none" stroke={st.stroke} strokeWidth={isSel ? st.width + 1.6 : st.width}
              strokeDasharray={st.dash} strokeLinecap="round" />
            {(e.tier === 'observed' || e.tier === 'inferred-strong') && shown && (
              <path d={g.d} fill="none" stroke="#F3F6FB" strokeOpacity=".85" strokeWidth="2" strokeLinecap="round"
                strokeDasharray="2 30" className="signal-flow" />
            )}
            {e.tier === 'not-linked' && (
              <g transform={`translate(${g.mid[0] - (compact ? 0 : 0)} ${g.mid[1] - 22})`}>
                <circle r="11" fill="#080B12" stroke={st.stroke} strokeWidth="1.8" />
                <path d="M-4.5 -4.5l9 9M4.5 -4.5l-9 9" stroke={st.stroke} strokeWidth="2" strokeLinecap="round" />
              </g>
            )}
            <text x={g.mid[0] + (e.tier === 'not-linked' ? (g.anchor === 'end' ? -16 : 16) : 0)} y={g.mid[1] + g.dy}
              textAnchor={g.anchor} fontSize="11.5" fill={st.stroke} fontWeight="600" letterSpacing=".02em"
              paintOrder="stroke" stroke="#080B12" strokeWidth="4" strokeLinejoin="round">
              {label}
            </text>
            {interactive && shown && (
              <path d={g.d} fill="none" stroke="transparent" strokeWidth="26" strokeLinecap="round"
                tabIndex={0} role="button" className="cursor-pointer"
                aria-label={`Relationship: ${TIER_LABEL[e.tier]}, between ${getNode(e.from)?.title} and ${getNode(e.to)?.title}`}
                aria-pressed={isSel}
                onClick={activate({ kind: 'edge', id: e.id })} onKeyDown={keyActivate({ kind: 'edge', id: e.id })} />
            )}
          </g>
        );
      })}

      {NODES.map((n: GraphNode) => {
        const b = L.nodes[n.id];
        const shown = step >= NODE_STEP[n.id];
        const isSel = selected?.kind === 'node' && selected.id === n.id;
        const other = n.id === 'n-other';
        return (
          <g key={n.id} transform={`translate(${b.x} ${b.y})`} className={interactive ? 'svg-focus cursor-pointer' : ''}
            style={{ opacity: shown ? dim(relatedNodes, n.id) : 0, transition: 'opacity .5s' }}
            tabIndex={interactive && shown ? 0 : undefined} role={interactive ? 'button' : undefined} aria-hidden={!shown}
            aria-label={`${n.source} event group: ${n.title}, ${eventRange(n)}`} aria-pressed={interactive ? isSel : undefined}
            onClick={interactive ? activate({ kind: 'node', id: n.id }) : undefined}
            onKeyDown={interactive ? keyActivate({ kind: 'node', id: n.id }) : undefined}>
            <rect width={b.w} height={b.h} rx="12" fill="#151F30" stroke={isSel ? '#53D8E8' : '#263247'} strokeWidth={isSel ? 2 : 1.2}
              strokeDasharray={other ? '5 5' : undefined} />
            <rect className="focus-ring" width={b.w} height={b.h} rx="12" fill="none" stroke="#91EAF2" strokeWidth="0" opacity="0" />
            <rect x="12" y="12" width={n.source === 'EMAIL' ? 56 : 52} height="19" rx="5" fill="#080B12" stroke="#263247" />
            <text x="19" y="25.5" fontSize="10.5" fill="#A4B0C2" fontFamily="var(--font-mono)" letterSpacing=".08em">
              {SOURCE_GLYPH[n.source]} {n.source}
            </text>
            {other && (
              <text x={b.w - 12} y="25.5" fontSize="10.5" textAnchor="end" fill="#F4BD70" fontWeight="600">different user</text>
            )}
            <text x="14" y={b.h - 31} fontSize="13.5" fill="#F3F6FB" fontWeight="600">{n.title}</text>
            <text x="14" y={b.h - 12} fontSize="11" fill="#A4B0C2" fontFamily="var(--font-mono)">{eventRange(n)} · {nodeTime(n, times)}</text>
          </g>
        );
      })}
    </svg>
  );
}
