# Simulacrum Instance Frontend Roadmap

This roadmap defines how we ship a **full client app** for the prototype instance at
`dev.simulacrum.greater.website`, using `greater-components` as the UI foundation and Lesser’s
built-in auth UI for OAuth login.

The goal is to hand this file to a new session and work one milestone at a time with
clean commits and pushes per milestone.

## Context + Constraints

- Client app must live under `/l/*` on the stage apex domain.
- Instance root `/` must redirect to `/l/` (handled by Lesser API).
- Auth UI is served at `/auth/*` on the same origin and is **stateless**.
- Strict CSP at CloudFront: no inline `<script>` or `<style>`.
- GraphQL endpoints: `POST /api/graphql` (recommended) or `POST /graphql` (alias).
- GraphQL subscriptions: `wss://ws.<host>` (graphql-transport-ws).
- Client deploys via `lesser client deploy` using stage receipt state.

References in Lesser:
- `docs/guides/CLIENT_APP_GUIDE.md`
- `docs/contracts/graphql-schema.graphql`
- `docs/contracts/openapi.yaml`

## Milestones

### M0 — Alignment + Baseline

Deliverables:
- Confirm instance base URL, API health, and `/auth/*` availability.
- Confirm `/l/*` routing and asset path expectations.
- Confirm GraphQL endpoint and WS endpoint for the instance.
- Confirm CSP headers (no inline scripts/styles).

Acceptance:
- A quick curl check list exists for `/`, `/l/`, `/auth/login`, `/api/graphql`.
- We can reach GraphQL and auth UI on the instance domain.

Curl checklist:
```bash
# M0 quick checks (stage)
BASE='https://dev.simulacrum.greater.website'
API='https://api.dev.simulacrum.greater.website'
WS='https://ws.dev.simulacrum.greater.website'

# Instance root + API health
curl -sS -D - -o /dev/null "$BASE/" | sed -n '1,20p'
curl -sS -D - -o /dev/null "$BASE/setup/status" | sed -n '1,25p'

# Client base path (note: /l (no trailing slash) currently 403; /l/ is 200)
curl -sS -D - -o /dev/null "$BASE/l/" | sed -n '1,40p'
curl -sS -D - -o /dev/null "$BASE/l" | sed -n '1,20p'

# Auth UI (note: /auth and /auth/login currently 403; index.html is reachable)
curl -sS -D - -o /dev/null "$BASE/auth/index.html" | sed -n '1,20p'
curl -sS -D - -o /dev/null "$BASE/auth/login" | sed -n '1,25p'
curl -sS -D - -o /dev/null "$BASE/auth/login/index.html" | sed -n '1,25p'

# GraphQL (unauth should return 401 + "authentication required")
curl -sS -D - -o /dev/null -X POST "$BASE/api/graphql" -H 'content-type: application/json' \
  --data '{"query":"query { __typename }"}' | sed -n '1,25p'
curl -sS -X POST "$BASE/api/graphql" -H 'content-type: application/json' \
  --data '{"query":"query { __typename }"}'

# WS (should require Upgrade; 426 is ok)
curl -sS -D - -o /dev/null "$WS/" | sed -n '1,25p'
```

Done (2026-02-09): Added curl checklist + recorded current stage behavior (CSP present; GraphQL reachable w/ auth required; auth-ui assets exist under `/auth/*` but directory index rewrites appear missing).

### M1 — Client Shell (SvelteKit + Greater)

Deliverables:
- SvelteKit configured with `kit.paths.base = '/l'`.
- Static adapter enabled (SPA fallback via CloudFront).
- Greater Components vendored via `greater` CLI (already in repo).
- Base layout with nav + routes (Home, Explore, Notifications, Profile, Settings).

Acceptance:
- `pnpm build` succeeds and the app runs under `/l/` locally.
- All assets are requested from `/l/_assets/...`.

Done (2026-02-09): Added the `/l` client shell layout + placeholder routes (Home/Explore/Notifications/Profile/Settings), set `kit.appDir = '_assets'`, and removed inline styles from `app.html`.

### M2 — OAuth Login (Auth UI)

Deliverables:
- Implement OAuth login using Lesser auth UI:
  - Generate PKCE + `state`.
  - Redirect to `/auth/login` with `client_id`, `redirect_uri`, `response_type=code`,
    `scope`, `state`, `code_challenge`, `code_challenge_method=S256`.
- Handle `/auth/callback` route:
  - Exchange `code` at `/oauth/token`.
  - Store access token (in memory + sessionStorage).
  - Implement logout and token clearing.

Acceptance:
- Login works end-to-end using auth-ui and returns a usable access token.
- User can log out and re-login without clearing browser storage manually.

Done (2026-02-09): Implemented OAuth + PKCE redirect to `/auth/login` and a callback handler at `/l/auth/callback` that exchanges `code` at `/oauth/token`, stores the access token in memory + `sessionStorage`, and supports logout/token clearing (with auto app registration via `POST /api/v1/apps` when no client id is configured).

### M3 — API Client Layer

Deliverables:
- Minimal API client in `src/lib/api/`:
  - GraphQL client for queries/mutations.
  - REST client for Mastodon-compatible endpoints when needed.
- Define model adapters from Lesser responses into greater-components props:
  - `Status`, `Account/Profile`, `Notification`, `Media`, `TimelineItem`.

Acceptance:
- Timeline page renders from real GraphQL data (viewer + home timeline).
- A single API module is used across the app.

Done (2026-02-09): Added `src/lib/api/` (GraphQL + REST clients + model adapters) and wired the Home route to fetch `viewer` and render the HOME timeline from `/api/graphql` once authenticated.

### M4 — Core Social Features

Deliverables:
- Timeline (home, local, public).
- Compose note + submit mutation.
- Profile view (own profile + others).
- Notifications view.
- Status detail route with replies.

Acceptance:
- Post → see it in timeline without full page reload.
- Notifications render and mark-as-read works.

Done (2026-02-09): Wired Home/Local/Public timelines, added compose via `createNote`, implemented profile views (self + `/profile/[acct]`), added notifications feed with mark-as-read, and added `/status/[id]` detail view with replies via REST context.

### M5 — Settings + Admin

Deliverables:
- Account settings (display name, bio, avatar).
- Preferences (language, content filters if supported).
- Admin route(s) gated by role (if available via API).

Acceptance:
- Settings mutation persists and survives reload.

Done (2026-02-09): Implemented Settings page with profile updates via `updateProfile` (display name/bio/avatar/header), preferences via `updateUserPreferences` (language/visibility/media/spoilers + reblog filters), and added an Admin route gated by API authorization.

### M6 — Deploy + Automation

Deliverables:
- Deploy via `lesser client deploy` using stage receipt.
- CloudFront invalidation for `/l` and `/l/*`.
- Document deploy steps in `docs/runbook.md`.

Acceptance:
- `dev.simulacrum.greater.website/l/` serves latest app after deploy.

Done (2026-02-09): Switched static output to `dist/` and externalized SvelteKit’s inline bootstrap for CSP safety, added `docs/runbook.md` + a receipt helper script, and deployed to `dev` via `lesser client deploy` (incl. CloudFront invalidation for `/l` + `/l/*`).

## Known Risks

- OAuth client registration must exist for the simulacrum app.
- CSP will break any inline styles/scripts; audit output HTML carefully.
- GraphQL schema changes can break adapters; keep a pinned contract.

## Work Instructions (for new session)

- Create a new branch from `main`.
- Complete one milestone at a time.
- Commit + push after each milestone completion.
- Update this file with a short “Done” note per milestone as work progresses.
