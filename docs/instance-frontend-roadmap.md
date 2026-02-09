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

### M1 — Client Shell (SvelteKit + Greater)

Deliverables:
- SvelteKit configured with `kit.paths.base = '/l'`.
- Static adapter enabled (SPA fallback via CloudFront).
- Greater Components vendored via `greater` CLI (already in repo).
- Base layout with nav + routes (Home, Explore, Notifications, Profile, Settings).

Acceptance:
- `pnpm build` succeeds and the app runs under `/l/` locally.
- All assets are requested from `/l/_assets/...`.

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

### M5 — Settings + Admin

Deliverables:
- Account settings (display name, bio, avatar).
- Preferences (language, content filters if supported).
- Admin route(s) gated by role (if available via API).

Acceptance:
- Settings mutation persists and survives reload.

### M6 — Deploy + Automation

Deliverables:
- Deploy via `lesser client deploy` using stage receipt.
- CloudFront invalidation for `/l` and `/l/*`.
- Document deploy steps in `docs/runbook.md`.

Acceptance:
- `dev.simulacrum.greater.website/l/` serves latest app after deploy.

## Known Risks

- OAuth client registration must exist for the simulacrum app.
- CSP will break any inline styles/scripts; audit output HTML carefully.
- GraphQL schema changes can break adapters; keep a pinned contract.

## Work Instructions (for new session)

- Create a new branch from `main`.
- Complete one milestone at a time.
- Commit + push after each milestone completion.
- Update this file with a short “Done” note per milestone as work progresses.

