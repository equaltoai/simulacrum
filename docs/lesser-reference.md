# Lesser Reference Guide (Simulacrum)

This guide captures the **expected integration patterns** from the Lesser repo so the simulacrum client
follows the same assumptions as production instances.

**Source docs in Lesser**:
- `lesser/docs/guides/CLIENT_APP_GUIDE.md`
- `lesser/docs/contracts/graphql-schema.graphql`
- `lesser/docs/contracts/openapi.yaml`
- `lesser/auth-ui/README.md`

## Core Routing + Hosting

- Client UI lives under `/l/*` on the stage apex domain.
- Stage apex `/` redirects to `/l/` (handled by Lesser API).
- Auth UI is served under `/auth/*` on the same origin.
- Strict CSP at CDN: **no inline `<script>` or `<style>`**.

Expected paths:
- `/l/*` client app (static, S3)
- `/auth/*` auth UI (static, S3)
- `/api/*` REST API (Mastodon-compatible)
- `/api/graphql` GraphQL (recommended)
- `/graphql` GraphQL alias
- `/.well-known/*`, `/nodeinfo/*` discovery

## Client App Base Path

- Build with base path `/l`.
- Assets must load from `/l/_assets/...`.
- Deep link refresh should work via SPA fallback.

## OAuth + Auth UI Flow

Auth UI is **stateless** and uses OAuth Authorization Code + PKCE.

OAuth endpoints (from `openapi.yaml`):
- `GET /oauth/authorize` (supports `mode=ui` JSON flow)
- `POST /oauth/consent`
- `POST /oauth/token`

Recommended login flow for the client:
1. Generate PKCE `code_verifier` + `code_challenge` (S256) and a random `state`.
2. Redirect user to `/auth/login` with:
   - `client_id`
   - `redirect_uri`
   - `response_type=code`
   - `scope` (space-delimited)
   - `state`
   - `code_challenge`
   - `code_challenge_method=S256`
3. Auth UI completes login and consent, then redirects back to `redirect_uri` with `code` + `state`.
4. Exchange `code` at `/oauth/token` with the original `code_verifier`.
5. Store access token in memory + `sessionStorage` and use `Authorization: Bearer <token>`.

Notes:
- Auth UI uses `/oauth/authorize?mode=ui` and `/oauth/consent` internally.
- Tokens are short-lived JWTs; no cookies or server sessions.

## GraphQL Access

- Endpoint: `POST https://<host>/api/graphql` (recommended)
- WebSocket subscriptions: `wss://ws.<host>` (graphql-transport-ws)
- Auth: `Authorization: Bearer <access_token>`

GraphQL schema: `lesser/docs/contracts/graphql-schema.graphql`

Core GraphQL operations to wire first:
- `viewer` (current account)
- `timeline` (home/local/public)
- `notifications`
- `createNote` (compose)
- `updateProfile`

## REST Access (Mastodon-compatible)

- Use REST endpoints for features not covered by GraphQL or where parity exists.
- Specs: `lesser/docs/contracts/openapi.yaml`.

## Deployment

- Build static client output to `dist/`.
- Deploy via `lesser client deploy` using the stage receipt state.
- CloudFront invalidation should include `/l` and `/l/*`.

## Implementation Reminders

- Do **not** hardcode a domain. Use `window.location.origin`.
- Keep CSP in mind when adding styles or scripts.
- Align UI models to GraphQL schema and Mastodon semantics.

