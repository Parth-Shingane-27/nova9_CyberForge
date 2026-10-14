# TraceGuard AI — frontend

React + TypeScript + Vite + Tailwind CSS (v4). Public landing page, sign-in route, and the gated console route.

```
Landing (/)  →  Sign in (/signin)  →  backend authentication  →  Console (/console)
```

## Run

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173, proxies /api to http://127.0.0.1:8000
npm run build      # type-check + production build
npm run typecheck
```

## Status — read this first

| Part | State |
|---|---|
| Landing page (all sections, interactive evidence graph, replay, preview tabs) | Implemented. Uses **simulated** data from `src/landing/scenario.ts`; nothing is live telemetry |
| Route guard (`ProtectedRoute`) and auth client (`src/auth/`) | Implemented against the **planned** backend contract below |
| Backend (FastAPI), real sign-in, real dashboard | **Not in this repository yet.** `/console` is a labelled placeholder (`src/pages/Console.tsx`) marking where the dashboard mounts |

Until the backend exists, `/console` is unreachable by design: the guard fails closed when `/api/auth/me` cannot be reached.

## Planned backend contract (assumption — confirm when the backend lands)

| Endpoint | Behaviour |
|---|---|
| `GET /api/auth/me` | `200 {"email": string, "name"?: string}` when the session is valid; `401/403` otherwise |
| `GET /api/auth/login?next=<path>` | Starts Google OAuth (or the clearly marked local demo login), verifies the ID token and allowlist **server-side**, sets an HttpOnly session cookie, redirects to the same-origin `next` |
| `POST /api/auth/logout` | Ends the server-side session |

The frontend never decides who is authorised. It treats anything other than a valid JSON answer from `/api/auth/me` (unauthenticated, error, unreachable, malformed) as **no access**, validates `next` as a same-origin path (open-redirect protection), and re-asks the server after logout. Every API call must still be authorised by the backend; the route guard is only a UX gate.

## Where things are

```
src/
  landing/scenario.ts     single source for all demo data (events, graph, tiers, findings, incident)
  landing/EvidenceGraph   SVG graph, wide + compact layouts, replay steps, keyboard selectable
  landing/Details.tsx     node / relationship / refusal explanations + timeline
  landing/Preview.tsx     simulated console preview (6 working tabs)
  landing/teamData.ts     team cards — names are UNCONFIRMED, see the note in the file
  auth/                   session client, context, route guard
  pages/SignIn.tsx        hand-off to backend login
  pages/Console.tsx       placeholder mount point for the real dashboard
```

## Content rules followed on the page
- No invented metrics, customer logos, trust badges, or performance claims. The Evaluation preview shows "not measured".
- Planned functionality is described as planned. Demo data is labelled "Simulated".
- Evidence tier, severity and confidence are each shown with text and a shape, never color alone.
- The team section uses neutral roles and no profile links until real ones are supplied.
