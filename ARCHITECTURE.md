# TraceGuard AI - Architecture, Use Cases and Workflows

Companion to [README.md](README.md). **Status: design only - nothing here is implemented yet.**
Diagrams are Mermaid; they render on GitHub and in VS Code with a Mermaid preview extension.

Contents
1. [System context](#1-system-context)
2. [Use cases](#2-use-cases)
3. [Component architecture](#3-component-architecture)
4. [Deployment (Docker Compose)](#4-deployment-docker-compose)
5. [End-to-end workflow](#5-end-to-end-workflow)
6. [Event generation workflow](#6-event-generation-workflow)
7. [Ingestion workflow](#7-ingestion-workflow)
8. [Detection and correlation workflow](#8-detection-and-correlation-workflow)
9. [Incident report and AI workflow (Gemini)](#9-incident-report-and-ai-workflow-gemini)
10. [URL investigation workflow](#10-url-investigation-workflow)
11. [Sign-in and access workflow](#11-sign-in-and-access-workflow)
12. [Evaluation workflow](#12-evaluation-workflow)
13. [Classifier training workflow](#13-classifier-training-workflow)
14. [Data model](#14-data-model)
15. [Trust boundaries](#15-trust-boundaries)
16. [What is real, simulated, or not built](#16-what-is-real-simulated-or-not-built)

---

## 1. System context

Who and what interacts with TraceGuard.

```mermaid
flowchart LR
  analyst(["Security analyst<br/>team member"])
  evaluator(["Evaluator / judge"])
  mcpclient(["MCP client<br/>stretch goal"])

  tg["TraceGuard AI"]

  lab["Company lab<br/>Mailpit, web server, auth service<br/>synthetic users"]
  datasets[("Public email datasets<br/>offline files")]
  google["Google OAuth<br/>sign-in only"]
  gemini["Gemini API<br/>explanations + quarantined parsing<br/>synthetic or public data only"]

  analyst -->|"investigates incidents"| tg
  evaluator -->|"runs scenarios, reads metrics"| tg
  mcpclient -.->|"read-only questions"| tg
  lab -->|"logs and mail"| tg
  datasets -->|"train / test classifier"| tg
  tg -->|"verify ID token"| google
  tg -.->|"redacted text, optional"| gemini
```

Gemini is optional. The pipeline must produce complete reports with it switched off (template mode).

## 2. Use cases

```mermaid
flowchart LR
  A(["Analyst"])
  E(["Evaluator"])
  S(["System / scheduler"])

  subgraph Investigate
    U1["Sign in with allow-listed Google account"]
    U2["Browse normalized events"]
    U3["Review email findings:<br/>spam, phishing, importance"]
    U4["Inspect URL and redirect findings"]
    U5["Review login anomalies"]
    U6["Open an incident:<br/>timeline, links, refusals, missing evidence"]
    U7["Read evidence-cited report"]
    U8["Ask questions via MCP"]
  end

  subgraph Prove
    U9["Run scenario replay"]
    U10["Compare against ground truth"]
    U11["Compare against naive baseline"]
    U12["Run reliability and injection tests"]
  end

  subgraph Operate
    U13["Collect logs and mail"]
    U14["Deduplicate and checkpoint"]
    U15["Run detectors and correlation"]
  end

  A --> U1 & U2 & U3 & U4 & U5 & U6 & U7 & U8
  E --> U9 & U10 & U11 & U12
  S --> U13 & U14 & U15
  U6 -.includes.-> U7
  U9 -.includes.-> U13
  U10 -.includes.-> U15
```

### Use case descriptions

| ID | Use case | Actor | Input | Output | Failure behaviour |
|---|---|---|---|---|---|
| UC1 | Triage a phishing-style email | Analyst | stored email event | findings with evidence IDs, class, confidence, next step | unknown fields shown as `unknown`; never labelled "safe" |
| UC2 | Investigate a login burst | Analyst | auth events | A1-A4 findings, source/account timeline | shared IP flagged as an alternative explanation |
| UC3 | Reconstruct an attack chain | Analyst | findings from all sources | incident with tiered links and timeline | weak links labelled; no causation claims |
| UC4 | See why events were *not* linked | Analyst | candidate pairs | refusal records with reason | listed explicitly, not hidden |
| UC5 | Check a URL | Analyst | URL from an email | normalized URL, redirect chain, risk, limits | unreachable gives `inconclusive` |
| UC6 | Ask "what don't we know?" | Analyst via MCP | question | answer citing event IDs | refuses when no stored evidence |
| UC7 | Measure the system | Evaluator | scenario set + hidden ground truth | precision/recall, link accuracy, vs. baseline | metrics only from real runs |
| UC8 | Stress reliability | Evaluator | duplicate, delayed, dropped logs | pass/fail table | restart resumes from checkpoint |

## 3. Component architecture

```mermaid
flowchart TB
  subgraph LAB["Layer A - Lab (Docker network)"]
    RUN["Scenario runner"]
    CLI_V["Victim client"]
    CLI_A["Attacker client(s)<br/>distinct IPs"]
    CLI_B["Background client"]
    MP["Mailpit<br/>SMTP 1025, API 8025"]
    WEB["Web server<br/>token + redirect pages"]
    AUTH["Auth service<br/>fake users"]
  end

  GT[("ground_truth.db<br/>separate file")]

  subgraph PIPE["Layers B-D - Pipeline (no access to ground truth)"]
    ING["Ingestion<br/>normalize, dedup, checkpoint"]
    EVDB[("SQLite events.db")]
    DET["Detectors<br/>email, URL, auth"]
    URLI["URL inspector<br/>safe fetch"]
    CLS["Classifier<br/>scikit-learn"]
    COR["Correlation engine<br/>tiers + refusals"]
    LED["Evidence ledger"]
    VER["Verifier"]
    RPT["Report builder"]
  end

  subgraph AI["Layer E - AI (optional)"]
    QL["Quarantined parser<br/>Gemini, no tools, JSON only"]
    EX["Explainer<br/>Gemini or templates"]
  end

  subgraph OUT["Layers F-G - Output"]
    API["FastAPI + auth"]
    UI["Dashboard"]
    MCP["MCP server<br/>read-only"]
  end

  EVAL["Evaluator"]

  RUN --> MP
  RUN --> CLI_V & CLI_A & CLI_B
  CLI_V --> WEB & AUTH
  CLI_A --> AUTH
  CLI_B --> MP & WEB & AUTH
  RUN -.writes.-> GT

  MP --> ING
  WEB --> ING
  AUTH --> ING
  ING --> EVDB --> DET
  DET --> URLI
  DET --> CLS
  DET --> QL
  DET --> COR
  COR --> LED --> EX --> VER --> RPT
  RPT --> API
  API --> UI
  API --> MCP

  EVAL -->|reads| GT
  EVAL -->|reads| RPT
```

### Component responsibilities

| Component | Responsibility | Must never |
|---|---|---|
| Scenario runner | execute actions, write ground truth | write log lines itself |
| Services (Mailpit, web, auth) | produce their own logs | know about scenarios |
| Ingestion | normalize, deduplicate, checkpoint, record provenance | fabricate missing fields |
| Detectors | deterministic rules with documented thresholds | read ground truth |
| Quarantined parser | turn untrusted email text into schema-validated JSON | call tools or see other data |
| Correlation | link events by shared identifiers, record rejected pairs | link on time proximity alone |
| Ledger and verifier | tie every sentence to event IDs | allow uncited claims |
| MCP / API | read-only access with authorization and audit log | modify state in MVP |
| Evaluator | compare output with ground truth | feed answers back to the detector |

## 4. Deployment (Docker Compose)

```mermaid
flowchart LR
  subgraph HOST["Developer laptop (Windows, Docker Desktop)"]
    subgraph NET["compose network: lab-net"]
      mailpit["mailpit<br/>:1025 :8025"]
      web["web<br/>:8080"]
      auth["auth<br/>:8081"]
      victim["victim<br/>172.x.0.10"]
      attacker1["attacker-1<br/>172.x.0.21"]
      attacker2["attacker-2<br/>172.x.0.22"]
      app["traceguard-app<br/>FastAPI + worker<br/>:8000"]
    end
    vol1[("volume: logs")]
    vol2[("volume: events.db")]
    vol3[("volume: ground_truth.db<br/>mounted only into runner and evaluator")]
    ui["frontend<br/>React dev server :5173"]
  end
  browser(["Browser<br/>localhost:5173"])
  gem["Gemini API<br/>outbound HTTPS only from app"]

  victim --> web & auth
  attacker1 --> auth
  attacker2 --> auth
  web --> vol1
  auth --> vol1
  app --> vol1
  app -->|"single writer: ingestion worker"| vol2
  app --> mailpit
  browser --> ui
  ui -->|"JSON API, session cookie"| app
  app -.-> gem
```

Notes
- Client IPs on the compose network are what make multi-source detections testable. Confirm in Phase 0 that the services see these IPs and not the Docker gateway address.
- `ground_truth.db` is mounted only into the runner and evaluator containers; the app container has no path to it.
- The React app talks only to FastAPI, never to the database. A MongoDB backend can be added later behind the `store/` interface.
- Only `traceguard-app` has outbound internet access, and only to the Gemini host.

## 5. End-to-end workflow

```mermaid
sequenceDiagram
  autonumber
  participant R as Scenario runner
  participant GT as Ground truth
  participant M as Mailpit
  participant V as Victim client
  participant W as Web server
  participant A as Attacker client
  participant U as Auth service
  participant I as Ingestion
  participant D as Detectors
  participant C as Correlation
  participant P as Report builder
  participant E as Evaluator

  R->>GT: store scenario expectations
  R->>M: send IT-themed email with tokenized link
  R->>V: instruct click at t+6m
  V->>W: GET /reset?t=TOKEN
  W-->>W: write access log
  R->>A: instruct login attempts at t+9m
  A->>U: 5 failed logins, then success
  U-->>U: write auth log
  I->>M: fetch messages
  I->>W: tail access log
  I->>U: tail auth log
  I->>I: normalize, dedup, checkpoint
  I->>D: stored events
  D->>C: findings with event IDs
  C->>C: link by token and account, reject weak pairs
  C->>P: incident with tiers, refusals, gaps
  P->>P: build ledger, verify citations
  P-->>E: incident report
  E->>GT: compare with expectations
  E-->>E: metrics vs naive baseline
```

## 6. Event generation workflow

```mermaid
flowchart TD
  S["Load scenario YAML + seed"] --> G["Write expectations to ground_truth.db"]
  G --> T{"Time mode"}
  T -->|"real-time"| RT["Run in minutes; thresholds scaled"]
  T -->|"virtual clock"| VC["Inject clock into web/auth services"]
  RT --> ACT
  VC --> ACT
  ACT["Schedule actors with seeded jitter"] --> EM["Email actor: SMTP to Mailpit"]
  ACT --> VI["Victim actor: probabilistic clicks, normal logins"]
  ACT --> AT["Attacker actors: failures, spraying, success"]
  ACT --> BG["Background actor: normal mail, typos, shared IP"]
  ACT --> HN["Hard negatives: same time, unrelated users"]
  EM --> L1[("Mailpit store")]
  VI --> L2[("web access.jsonl")]
  VI --> L3[("auth.jsonl")]
  AT --> L3
  BG --> L1 & L2 & L3
  HN --> L1 & L2 & L3
  L1 & L2 & L3 --> IMP["Optional imperfection injection<br/>delay, duplicate, reorder, drop - at collection step"]
```

Rule: services write the logs; the runner only acts and records what it *intended* in ground truth.

## 7. Ingestion workflow

```mermaid
flowchart TD
  SRC["Source record"] --> PARSE{"Parse OK?"}
  PARSE -->|no| BAD["Store as malformed + reason"]
  PARSE -->|yes| NORM["Map to common schema<br/>unknown stays unknown"]
  NORM --> ID["event_id = hash of source_service + source_record_id"]
  ID --> DUP{"Seen before?"}
  DUP -->|yes| MERGE["Ignore or merge provenance"]
  DUP -->|no| SAVE["Insert with event_timestamp and ingestion_timestamp"]
  SAVE --> CP["Advance checkpoint after commit"]
  MERGE --> CP
  CP --> LATE{"event_timestamp older than last processed window?"}
  LATE -->|yes| RE["Re-run affected detectors and correlation"]
  LATE -->|no| NEXT["Continue"]
```

Restart behaviour: on start, read the checkpoint per source and resume; re-ingesting the same input must leave the database unchanged.

## 8. Detection and correlation workflow

```mermaid
flowchart TD
  EV[("Events")] --> E1["Email rules E1-E4"]
  EV --> E5["Spam / promo / legit<br/>rules + classifier"]
  EV --> U1["URL rules U1"]
  EV --> A1["Auth rules A1-A4"]

  E1 & E5 & U1 & A1 --> F[("Findings<br/>severity, confidence, event IDs")]

  F --> CAND["Generate candidate event pairs"]
  CAND --> Q1{"Shared identifier?<br/>token, session, account, domain"}
  Q1 -->|no| REF1["Refusal: no shared identifier"]
  Q1 -->|yes| Q2{"Within configured window and correct order?"}
  Q2 -->|no| REF2["Refusal: window or order violated"]
  Q2 -->|yes| TIER{"Evidence strength"}
  TIER -->|"direct identifier match"| OBS["observed"]
  TIER -->|"session-bound"| STR["inferred-strong"]
  TIER -->|"same account + time only"| WK["inferred-weak"]
  OBS & STR & WK --> ALT["Attach alternative explanations<br/>and missing evidence"]
  ALT --> INC{"Matches existing incident?"}
  INC -->|yes| UPD["Merge, update timeline"]
  INC -->|no| NEW["Create incident"]
  REF1 & REF2 --> RL[("Refusal log")]
  UPD & NEW --> SC["Score: severity and confidence separately"]
```

Scoring inputs: severity of behaviour, evidence reliability, number of independent indicators, link strength, missing or contradictory evidence. Output is a category (Informational to Critical) plus a separate confidence label, never a probability.

## 9. Incident report and AI workflow (Gemini)

```mermaid
flowchart TD
  INC[("Incident + findings + links")] --> LED["Build evidence ledger<br/>E1: ..., E2: ..."]
  LED --> MODE{"Gemini enabled and data allowed?"}

  MODE -->|no| TPL["Template renderer<br/>deterministic text"]
  MODE -->|yes| RED["Redact: secrets, tokens, URL parameters,<br/>real addresses"]
  RED --> GEM["Gemini explainer<br/>input: ledger JSON only<br/>no raw email, no tools"]
  GEM --> VER{"Verifier:<br/>every sentence cites existing ledger IDs?"}
  VER -->|fail| TPL
  VER -->|pass| LBL["Label text as AI-generated"]
  TPL --> OUT["Report"]
  LBL --> OUT

  subgraph Q["Quarantined parsing of untrusted email text"]
    RAW["Raw email text"] --> HID["Hidden-instruction detector<br/>invisible text, zero-width chars, comments"]
    HID --> QG["Gemini with JSON schema only<br/>fields: intent, asks, entities"]
    QG --> SV{"Schema valid?<br/>enums, length limits"}
    SV -->|yes| FEAT["Structured features to detectors"]
    SV -->|no| DROP["Discard, record parse failure"]
  end
```

Gemini rules (decided because the free tier may use inputs to improve Google products and may involve human review - see README section 3.7):
- Send **only synthetic lab data and public-dataset text**. Never send real Gmail content, tokens, or personal data.
- Redact before sending. No raw URLs with parameters.
- Use structured output (JSON schema) for the quarantined parser; validate the result server-side anyway.
- Model name comes from `GEMINI_MODEL` in `.env`; do not hardcode. API key lives only in `.env`.
- The reader of untrusted text has no tools and its output is data only; the explainer never sees raw email text.
- Any failure, quota error or timeout falls back to templates; reports must still be complete.

## 10. URL investigation workflow

```mermaid
flowchart TD
  U["URL from email"] --> N["Parse and normalize"]
  N --> R["Redact sensitive query values"]
  R --> S["Static checks:<br/>lookalike, odd TLD, IP host, long params"]
  S --> MODE{"Mode"}
  MODE -->|"lab (default)"| AL{"Host on lab allowlist?"}
  AL -->|no| SKIP["inconclusive: not fetched"]
  AL -->|yes| F["Follow redirects; log each hop"]
  MODE -->|"external (off by default)"| DNS["Resolve DNS once"]
  DNS --> PUB{"Public IP only?<br/>not loopback, private, link-local, metadata"}
  PUB -->|no| BLK["Blocked"]
  PUB -->|yes| PIN["Connect to pinned IP"]
  PIN --> F
  F --> HOP["Revalidate each hop<br/>cap redirects, size, time"]
  HOP --> FORM["Inspect HTML for credential forms<br/>do not submit; do not run downloads"]
  FORM --> REP{"Reputation provider enabled?"}
  REP -->|yes| LOOK["Lookup, redacted"]
  REP -->|no| NONE["No reputation data"]
  LOOK & NONE --> OUT["URL finding: evidence, limits, risk<br/>unreachable or unlisted never means safe"]
```

## 11. Sign-in and access workflow

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser
  participant S as TraceGuard backend
  participant G as Google OAuth

  B->>S: open dashboard
  S-->>B: redirect to Google (state, PKCE)
  B->>G: sign in
  G-->>B: authorization code
  B->>S: code + state
  S->>G: exchange code
  G-->>S: ID token
  S->>S: verify signature, issuer, audience, expiry, email_verified
  alt ALLOWED_DOMAIN is gmail.com
    S->>S: require email in ALLOWED_EMAILS
  else Workspace domain
    S->>S: require hd claim and email domain match
  end
  alt accepted
    S-->>B: server-side session cookie (HttpOnly, expiry)
  else rejected
    S-->>B: 403 and audit log entry
  end
  B->>S: API or MCP request
  S->>S: authorize every call and write audit log
```

Local fallback: `AUTH_MODE=local` shows a clearly marked fake login so the demo works without Google.

## 12. Evaluation workflow

```mermaid
flowchart TD
  SEL["Select scenario set + seeds"] --> SPLIT["Tuning set vs held-out set"]
  SPLIT --> RUN["Run lab, ingest, detect, correlate"]
  RUN --> OUT[("Findings, links, refusals, timings")]
  GT[("Ground truth")] --> CMP
  OUT --> CMP["Compare"]
  BASE["Baseline:<br/>group alerts by same user within N minutes"] --> CMP
  CMP --> M1["Detector precision, recall, FPR, FNR"]
  CMP --> M2["Links: correct, wrong, missed"]
  CMP --> M3["Hard negatives: false links"]
  CMP --> M4["Latency"]
  RUN --> REL["Reliability injections:<br/>duplicate, delayed, dropped, restart"]
  REL --> M5["Pass / fail table"]
  OUT --> INJ["Prompt-injection email set"]
  INJ --> M6["Injection pass rate"]
  M1 & M2 & M3 & M4 & M5 & M6 --> REP["results/*.json + Evaluation page<br/>with scope caveat"]
```

## 13. Classifier training workflow

```mermaid
flowchart LR
  DL["Download datasets<br/>record license, URL, SHA-256"] --> CL["Clean: dedup, drop empty, keep source column"]
  CL --> SP{"Split strategy"}
  SP --> R1["Random split<br/>reported as optimistic"]
  SP --> R2["Leave-one-source-out<br/>headline number"]
  R2 --> TR["TF-IDF + logistic regression<br/>out-of-fold scores, GroupKFold by source"]
  R1 --> TR
  TR --> OOF["text_score per email"]
  FE["Structured features<br/>rule flags, URL, metadata<br/>no header-presence features"] --> GB["Gradient boosting<br/>optional stack, P2"]
  OOF --> GB
  TR --> T1["Test: held-out source"]
  GB --> T1
  TR --> T2["Test: SpamAssassin incl. hard_ham"]
  GB --> T2
  TR --> T3["Test: Human-LLM phishing set"]
  GB --> T3
  TR --> T4["Test: lab emails"]
  GB --> T4
  RU["Rules only"] --> CMPR["Compare: rules, LR, GB, stacked, stacked + rules"]
  T1 & T2 & T3 & T4 --> CMPR
  CMPR --> REPT["Table with sample sizes and caveats"]
```

Binary labels in the main dataset mean the claim is "malicious-or-unwanted vs legitimate". Promotional, important and BEC classes use rules and a small hand-labelled sample.

## 14. Data model

```mermaid
erDiagram
  EVENT ||--o{ FINDING : supports
  EVENT ||--o| EMAIL : "is detail of"
  FINDING }o--o{ INCIDENT : "belongs to"
  EVENT }o--o{ RELATIONSHIP : "linked by"
  RELATIONSHIP }o--|| INCIDENT : "part of"
  INCIDENT ||--|| REPORT : produces
  REPORT ||--o{ LEDGER_ITEM : cites
  LEDGER_ITEM }o--|| EVENT : references
  EVENT ||--o{ URL_FINDING : "contains url"
  USER ||--o{ EVENT : "actor or target"
  INCIDENT ||--o{ REFUSAL : "also records"

  EVENT {
    string event_id PK
    string event_type
    string source_service
    string source_record_id
    datetime event_timestamp
    datetime ingestion_timestamp
    string actor_id
    string target_id
    string source_ip
    string outcome
    json evidence
    string data_provenance
    bool is_simulated
  }
  FINDING {
    string finding_id PK
    string detector_id
    string severity
    string confidence
    json event_ids
    string limitation
  }
  RELATIONSHIP {
    string rel_id PK
    string from_event
    string to_event
    string tier
    string rationale
    json alternatives
    json missing_evidence
  }
  INCIDENT {
    string incident_id PK
    string category
    string risk
    string confidence
    string disposition
  }
  REFUSAL {
    string refusal_id PK
    string from_event
    string to_event
    string reason
  }
  LEDGER_ITEM {
    string ledger_id PK
    string statement
    string event_id FK
  }
```

Stored as SQLite tables with JSON columns for nested evidence. `event_id` is the primary key, so ingestion is an idempotent `INSERT ... ON CONFLICT DO NOTHING`. `ground_truth.db` is a separate file the pipeline cannot read. Also stored: `checkpoints`, `audit_log`, `malformed_records`.

## 15. Trust boundaries

```mermaid
flowchart LR
  subgraph UNTRUSTED["Untrusted"]
    EMAILS["Email content"]
    PAGES["Web pages and redirects"]
    DS["Public datasets"]
    GOUT["Gemini output"]
  end
  subgraph SEMI["Semi-trusted"]
    SVC["Lab services and their logs"]
  end
  subgraph TRUSTED["Trusted code"]
    ING2["Ingestion"]
    DET2["Detectors"]
    COR2["Correlation"]
    VER2["Verifier"]
    API2["API, auth, MCP"]
  end
  EMAILS -->|"parsed as data, sanitized, schema-checked"| ING2
  PAGES -->|"fetched with limits, not executed"| DET2
  DS -->|"offline, checksummed"| DET2
  SVC --> ING2
  GOUT -->|"must pass verifier"| VER2
  ING2 --> DET2 --> COR2 --> VER2 --> API2
```

Principles: content crossing from UNTRUSTED to TRUSTED is data only, never instructions; AI output is checked before display; secrets exist only in `.env`.

## 16. What is real, simulated, or not built

| Aspect | Status |
|---|---|
| SMTP delivery, HTTP requests, login checks, service logs | **Real**, produced inside the lab |
| Users, passwords, attacker intent, scenario timing, click behaviour | **Simulated** |
| Public email datasets | **Real emails**, offline, labels from the dataset authors |
| SPF/DKIM/DMARC, geolocation, device data | **Not observable in the lab** |
| Gemini explanations | **Real model output**, labelled AI-generated, verifier-checked; optional |
| Google sign-in | **Real OAuth**, allow-listed Gmail accounts for now |
| Gmail and Workspace login ingestion | **Not built** (documented adapters only) |
| Browser sandbox, auto-remediation | **Not built, by design** |
| MCP server | **Stretch goal** after the demo flow works |
| Metrics | **Produced only by actual runs**; synthetic, same-author scenarios |
