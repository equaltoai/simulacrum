---
name: enforce-csp-and-graphql-first
description: Use when a change touches CSP compliance (inline scripts / styles / event handlers / third-party origins / unsafe-eval) or GraphQL-first discipline (new REST paths, REST leaking into data operations). Walks the dual constraint strict CSP on built bundle + GraphQL-first with REST only for auth. Loosening either is refused without explicit governance authorization.
---

# Enforce CSP and GraphQL-first

sim enforces two non-negotiable frontend constraints:

1. **Strict CSP** on the built bundle — no `'unsafe-inline'`, no `'unsafe-eval'`, no third-party script origins, no inline scripts / styles / event handlers
2. **GraphQL-first data operations** — REST is reserved for authentication flows per Lesser's policy; new REST paths for data operations are refused

Both are the frontend's trust posture. Loosening either is refused without explicit governance authorization.

## The CSP surface (memorize)

Target CSP directives:

- `default-src 'self'`
- `script-src 'self'`
- `style-src 'self'`
- `img-src 'self' data:`
- `connect-src 'self'` + explicit API origins (Lesser GraphQL, graphql-ws, host registry, body MCP, eth_rpc — as needed per deployed instance)
- `frame-ancestors 'none'`
- **No `'unsafe-inline'`** for scripts or styles
- **No `'unsafe-eval'`**
- **No third-party CDN origins for scripts**
- **No inline event handlers** (`onclick="..."`, etc.)

Enforced by:

- The install flow serving strict CSP headers
- CI validation on the built bundle (CSP-compliance check)
- CSP violation reports from browser console (when testing)

## The GraphQL-first surface (memorize)

- **Data operations** (queries, mutations, subscriptions) go through GraphQL via Apollo Client
- **Subscriptions** via graphql-ws to Lesser's GraphQL subscription endpoint
- **REST is reserved for authentication** — PKCE flow, token storage, refresh — per Lesser's policy
- **No REST paths for data** — extend Lesser's GraphQL schema upstream instead
- **Pinned GraphQL schema** in `contracts/graphql-schema.graphql` (synced from Lesser)

## When this skill runs

Invoke when:

- A change proposes inline `<script>` or `<style>`, inline event handler, inline `style=""` from runtime-computed CSS, third-party script origin, or `unsafe-eval`
- A change proposes a new REST path for data operations
- A CSP violation report surfaces in browser console or CI
- CSP validation on built bundle fails in CI
- A new external origin needs to be added to `connect-src` (may be legitimate for new API)
- `scope-need` flags a change as CSP / GraphQL-first adjacent
- `investigate-issue` surfaces a CSP or GraphQL-first compliance issue

## Preconditions

- **The change is described concretely.** "CSP is too strict" is too vague; "the new `<Charts>` component relies on a chart library that computes `style=""` attributes at runtime from data, which the strict CSP blocks" is concrete.
- **MCP tools healthy**, `memory_recent` first.
- **Current CSP state** known from the install / build configuration.

## The CSP-evaluation walk

For every CSP-adjacent proposal:

### 1. Is the proposal CSP-compliant as-is?

- **New external CSS file** — fine (self-hosted).
- **New external JS file** — fine (self-hosted).
- **New Svelte reactive binding using CSS custom properties** — fine; style via `--gr-*` tokens.
- **Adding explicit API origin to `connect-src`** — fine if the origin is legitimate (new Lesser / host / body / eth_rpc endpoint). Document in CSP config.
- **Svelte's built-in reactive styles** (class and style prop bindings that don't use raw runtime CSS strings) — fine.

### 2. Is the proposal CSP-violating?

- **Inline `<script>` tag** — refuse. Move to an external file.
- **Inline `<style>` block** — refuse. Move to a CSS file or Svelte `<style>` block (which is compiled, not inline).
- **Inline event handler** (`onclick="..."`) — refuse. Use Svelte reactive syntax.
- **Inline `style=""` attribute carrying arbitrary runtime-computed CSS** — refuse. Use CSS custom properties (Greater tokens) or class bindings.
- **Third-party script CDN origin** (e.g. CDNJS) — refuse. Self-host the dependency.
- **`'unsafe-inline'`** for scripts or styles — refuse.
- **`'unsafe-eval'`** — refuse. Replace the dependency that requires it.
- **`frame-ancestors` anything other than `'none'`** — evaluate carefully; default refuse.

### 3. Is the dependency forcing a CSP loosening?

When an upstream library (e.g. a chart library, a rich-text editor) requires inline or eval:

- **Replace the library** with a CSP-compliant alternative.
- **Patch the library** — not viable (framework-patches-locally refuse).
- **File upstream issue** via `route-upstream-issue` — request CSP-compliant mode from the library.
- **Accept a scoped exception** — only with explicit governance authorization from Aron, with a sunset condition.

### 4. Is this a legitimate `connect-src` expansion?

A new API origin (e.g. a new deployed Lesser instance, a new eth_rpc endpoint) is fine to add to `connect-src`, subject to:

- **The origin is documented** in CSP config
- **The origin is HTTPS**
- **The origin is trusted** (Lesser / host / body / eth_rpc — not arbitrary third-party)

## The GraphQL-first-evaluation walk

For every REST-path proposal:

### 1. Is this an auth path?

- **PKCE flow endpoints** (authorization, token exchange, token refresh) — fine, per Lesser's policy.
- **WebAuthn registration / challenge** (if ever) — likely auth, fine.
- **OAuth callback handling** — auth, fine.

### 2. Is this a data operation?

- **Any query or mutation on domain data** — refuse. Use GraphQL.
- **File upload** — typically GraphQL multipart or a dedicated upload endpoint; evaluate. Pure REST file upload for data is refused; Lesser's GraphQL mutation support for file upload is the preferred path.
- **WebSocket / subscription** — use graphql-ws, not raw WebSockets for data.

### 3. Does Lesser's GraphQL schema support this?

If not:

- **Extend Lesser's GraphQL schema upstream** via `route-upstream-issue` — the fix is in lesser, not a new REST path here.
- **Do not work around with REST** — that fragments the GraphQL-first contract.

## The audit output

```markdown
## CSP + GraphQL-first audit: <change name>

### Proposed change

<concrete description>

### CSP dimension

- CSP surface affected: <inline script / inline style / inline event handler / third-party origin / unsafe-eval / connect-src addition / none>
- Classification: <compliant / violating / legitimate expansion (e.g. new API origin)>
- For violating: refuse or explicit governance authorization with sunset?
- For dependency-forced loosening: replace / upstream route / scoped exception?

### GraphQL-first dimension

- REST surface affected: <auth only / proposed data REST / none>
- Classification: <auth-only (fine) / data-REST (refuse; route upstream to lesser)>
- For data-REST: upstream route to lesser identified?

### Build-time verification

- `pnpm build` output passes CSP validation: <confirmed>
- CSP headers correct in served bundle: <confirmed against install manifest>

### CI verification

- CI CSP-validation job green: <confirmed>

### Consumer-of-the-frontend impact

- Users on simulacrum dev instance: <CSP strict — browsers enforce>
- Users on theory dev instance: <same>
- LLM bot accounts: <same; bots interact via auth + GraphQL>

### Proposed next skill

<enumerate-changes if audit clean; route-upstream-issue if upstream fix needed; scope-need if audit surfaces scope growth; investigate-issue if audit reveals existing CSP / GraphQL-first violation>
```

## Refusal cases

- **"Add inline `<script>` for analytics."** Refuse.
- **"Add a third-party analytics script origin to CSP."** Refuse.
- **"Use `'unsafe-eval'` for this library."** Refuse. Replace.
- **"Inline event handler just for this button."** Refuse. Use Svelte reactive.
- **"Inline `style=""` for a dynamic color from user preferences."** Refuse. Use CSS custom property bound via Svelte reactive.
- **"Allow iframe embedding from a specific origin via `frame-ancestors`."** Evaluate carefully; default refuse.
- **"Add a REST endpoint for fetching user preferences."** Refuse. Extend Lesser's GraphQL user-preferences query upstream.
- **"Call Lesser's REST API for bulk data export because GraphQL is slow."** Refuse. If Lesser's GraphQL is slow for bulk export, that's a Lesser-side performance concern — route upstream.
- **"Add a `mutation` via REST because GraphQL-mutations are verbose."** Refuse. GraphQL-first.
- **"Embed a third-party widget via iframe."** Refuse without explicit governance.

## Persist

Append when the walk surfaces something worth remembering — a CSP-exception decision (with sunset), a dependency-replacement for CSP compliance, a new API origin that was legitimately added to `connect-src`, a GraphQL-schema-extension upstream request that closed a REST-path proposal. Routine CSP / GraphQL passes aren't memory material. Five meaningful entries beat fifty log-shaped ones.

## Handoff

- **Audit clean, compliant change** — invoke `enumerate-changes`.
- **Audit clean, legitimate CSP expansion** (new API origin) — document in CSP config; `enumerate-changes`.
- **Audit surfaces dependency-forced loosening with replacement plan** — scope the replacement via `scope-need`.
- **Audit surfaces upstream request** (GraphQL schema extension, library CSP fix) — `route-upstream-issue`.
- **Audit reveals an existing violation** — `investigate-issue` to find the regression source, then back here.
- **Audit reveals a scoped CSP exception is needed** (rare) — escalate to Aron for governance authorization.
