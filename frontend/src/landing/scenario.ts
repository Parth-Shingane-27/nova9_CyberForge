/**
 * SIMULATED demonstration scenario.
 *
 * Everything the landing page shows about "an incident" comes from this file so the graph, timeline,
 * preview tables and incident card can never disagree. None of it is live telemetry: it mirrors the
 * lab scenario described in ARCHITECTURE.md (phish -> tokenised visit -> login burst -> success,
 * plus an unrelated user as a hard negative).
 */

export type Source = 'EMAIL' | 'WEB' | 'AUTH';
export type Tier = 'observed' | 'inferred-strong' | 'inferred-weak' | 'not-linked';

export interface DemoEvent {
  id: string;
  node: string;
  source: Source;
  time: string;
  actor: string;
  kind: string;
  summary: string;
  fields: [string, string][];
}

export interface GraphNode {
  id: string;
  source: Source;
  title: string;
  eventIds: string[];
  note?: string;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  tier: Tier;
  supportIds: string[];
  rationale: string;
  alternatives: string[];
  missing: string[];
  /** Only for rejected candidate links. */
  refusal?: { reason: string; required: string; timing: string };
}

const BURST_FIELDS = (ip: string, user: string): [string, string][] => [
  ['Account', user],
  ['Outcome', 'failure (bad_password)'],
  ['Source IP', ip],
  ['User-agent', 'lab-client/1.0'],
];

export const EVENTS: DemoEvent[] = [
  {
    id: 'EV-0001', node: 'n-email', source: 'EMAIL', time: '09:02:14', actor: 'alice@company.lab',
    kind: 'email_received', summary: 'Password reset required (from it-support@c0mpany-portal.lab)',
    fields: [
      ['From', 'it-support@c0mpany-portal.lab'],
      ['To', 'alice@company.lab'],
      ['Subject', 'Password reset required'],
      ['Link token', 'tk-7f3a'],
      ['SPF / DKIM / DMARC', 'unknown (not observable in the lab)'],
    ],
  },
  {
    id: 'EV-0002', node: 'n-web', source: 'WEB', time: '09:08:41', actor: 'session s-41',
    kind: 'web_request', summary: 'GET /reset?t=tk-7f3a → 200',
    fields: [
      ['Path', '/reset?t=tk-7f3a'],
      ['Status', '200'],
      ['Source IP', '172.20.0.10'],
      ['Session', 's-41'],
      ['Referrer', 'absent'],
    ],
  },
  ...[
    ['EV-0003', '09:11:05'], ['EV-0004', '09:11:19'], ['EV-0005', '09:11:33'],
    ['EV-0006', '09:11:48'], ['EV-0007', '09:12:02'],
  ].map(([id, time]): DemoEvent => ({
    id, node: 'n-burst', source: 'AUTH', time, actor: 'alice',
    kind: 'auth_attempt', summary: 'Failed login for alice from 172.20.0.21',
    fields: BURST_FIELDS('172.20.0.21', 'alice'),
  })),
  {
    id: 'EV-0008', node: 'n-success', source: 'AUTH', time: '09:12:17', actor: 'alice',
    kind: 'auth_attempt', summary: 'Successful login for alice from 172.20.0.21',
    fields: [
      ['Account', 'alice'],
      ['Outcome', 'success'],
      ['Source IP', '172.20.0.21'],
      ['User-agent', 'lab-client/1.0'],
    ],
  },
  ...[
    ['EV-0009', '09:12:40'], ['EV-0010', '09:12:55'], ['EV-0011', '09:13:09'],
  ].map(([id, time]): DemoEvent => ({
    id, node: 'n-other', source: 'AUTH', time, actor: 'bob',
    kind: 'auth_attempt', summary: 'Failed login for bob from 172.20.0.22',
    fields: BURST_FIELDS('172.20.0.22', 'bob'),
  })),
];

export const NODES: GraphNode[] = [
  { id: 'n-email', source: 'EMAIL', title: 'Password-reset email', eventIds: ['EV-0001'] },
  { id: 'n-web', source: 'WEB', title: 'Visit with matching token', eventIds: ['EV-0002'] },
  { id: 'n-burst', source: 'AUTH', title: '5 failed logins · alice', eventIds: ['EV-0003', 'EV-0004', 'EV-0005', 'EV-0006', 'EV-0007'] },
  { id: 'n-success', source: 'AUTH', title: 'Successful login · alice', eventIds: ['EV-0008'] },
  { id: 'n-other', source: 'AUTH', title: '3 failed logins · bob', eventIds: ['EV-0009', 'EV-0010', 'EV-0011'], note: 'different user' },
];

export const EDGES: GraphEdge[] = [
  {
    id: 'e1', from: 'n-email', to: 'n-web', tier: 'observed', supportIds: ['EV-0001', 'EV-0002'],
    rationale:
      'The per-recipient token tk-7f3a in the email link is identical to the token in the web request path, and the request (09:08:41) follows delivery (09:02:14) by 6 min 27 s, so the ordering is valid.',
    alternatives: ['The token identifies the link, not the person: the link could have been forwarded or opened by a scanner.'],
    missing: ['Nothing ties the request at 172.20.0.10 to a specific person.'],
  },
  {
    id: 'e2', from: 'n-web', to: 'n-burst', tier: 'inferred-weak', supportIds: ['EV-0002', 'EV-0003', 'EV-0007'],
    rationale:
      'The token maps to alice, and the failed logins against alice start 2 min 24 s after the visit. That is a shared account and a valid order, but there is no shared session or source address.',
    alternatives: [
      'Unrelated password guessing against alice that happens to follow the visit.',
      'The visit and the login burst are coincidental.',
    ],
    missing: [
      'No session or cookie links the visit (172.20.0.10) to the login source (172.20.0.21).',
      'No record of what the page collected, if anything.',
    ],
  },
  {
    id: 'e3', from: 'n-burst', to: 'n-success', tier: 'observed', supportIds: ['EV-0003', 'EV-0007', 'EV-0008'],
    rationale:
      'Detector A4 (success after failures): same account (alice), same source (172.20.0.21), and the success arrives 15 s after the fifth failure. This is a documented grouping rule, not an inference.',
    alternatives: ['A legitimate user who forgot a password can look the same (known limitation of A4).'],
    missing: ['No data on which password was used or where it came from.'],
  },
  {
    id: 'r1', from: 'n-email', to: 'n-other', tier: 'not-linked', supportIds: ['EV-0001', 'EV-0009'],
    rationale: 'Candidate link evaluated and rejected.',
    alternatives: [],
    missing: [],
    refusal: {
      reason:
        'bob is not a recipient of EV-0001, and the burst’s source 172.20.0.22 appears in no event tied to the email.',
      required: 'A shared identifier: the link token, the recipient account, or a common session or source.',
      timing:
        'Timing alone is met (the burst starts 10 min 26 s after delivery, inside the 15 min window), which is exactly why timing is not treated as evidence of a relationship.',
    },
  },
];

export const TIER_LABEL: Record<Tier, string> = {
  observed: 'Observed',
  'inferred-strong': 'Inferred — strong',
  'inferred-weak': 'Inferred — weak',
  'not-linked': 'Not linked',
};

export const TIER_MEANING: Record<Tier, string> = {
  observed: 'Directly supported by a matching identifier or a documented grouping rule.',
  'inferred-strong': 'Supported by stronger context, such as a session-bound connection.',
  'inferred-weak': 'Plausible, but the evidence does not establish a direct connection.',
  'not-linked': 'A candidate relationship was considered and rejected, with the reason recorded.',
};

export const INCIDENT = {
  id: 'INC-DEMO-001',
  eventCount: 8, // EV-0001 … EV-0008 (EV-0009 … EV-0011 are bob's and are not part of it)
  severity: 'High' as const,
  confidence: 'Medium' as const,
  missingCount: 3,
};

export const FINDINGS = [
  {
    id: 'F-01', detector: 'E2', title: 'Lookalike sender domain', eventIds: ['EV-0001'],
    severity: 'Medium' as const, confidence: 'Medium' as const,
    detail: 'c0mpany-portal.lab differs from the organisation domain company.lab by a character substitution and an extra label.',
  },
  {
    id: 'F-02', detector: 'A1', title: 'Repeated failures against one account', eventIds: ['EV-0003', 'EV-0004', 'EV-0005', 'EV-0006', 'EV-0007'],
    severity: 'Medium' as const, confidence: 'High' as const,
    detail: '5 failures for alice within 57 s from one source (demo threshold: 5 in 60 s, configurable).',
  },
  {
    id: 'F-03', detector: 'A4', title: 'Success after repeated failures', eventIds: ['EV-0008'],
    severity: 'High' as const, confidence: 'Medium' as const,
    detail: 'Successful login for alice 15 s after the fifth failure from the same source.',
  },
];

export const getEvent = (id: string) => EVENTS.find((e) => e.id === id);
export const getNode = (id: string) => NODES.find((n) => n.id === id);
export const getEdge = (id: string) => EDGES.find((e) => e.id === id);
