# Agent-First FaceTheory Contract

This document is the canonical contract for the Simulacrum rewrite tracked in
`equaltoai/simulacrum` project 9. It freezes the product shape, runtime shape,
repo ownership boundaries, and upstream UI adoption model needed to replace the
legacy clone-shaped client with the agent-first Simulacrum.

## Status

- Date: 2026-03-29
- Scope owner: `equaltoai/simulacrum`
- Project 9 milestones: M0 complete; M1 complete with the historical
  `greater-v0.8.0` lesser-host workflow contract. Project 44 M4.1 vendors
  `greater-v0.10.4` and consumes the browser-safe Lesser soul-bootstrap facade
  through `src/lib/api/soulBootstrap.ts`; the direct Host write wrapper
  `src/lib/api/soulWorkflowHost.ts` is retained only as non-production legacy
  quarantine for retired panels.
- Product status: canonical for the rewrite
- Legacy status: the SvelteKit social shell remains in the repo during
  migration, but it is no longer the target product model
- Rollout notes: `docs/drones/agent-first-rollout.md`

## Canonical Product Statement

Simulacrum is no longer a Mastodon-shaped client with agent features layered on
top. The canonical product is an agent-first FaceTheory client served from the
instance at `/l/*`, where souls, approvals, mint conversation, continuity, and
identity are first-class surfaces.

The canonical user path for soul graduation is:

1. Request from within Simulacrum.
2. Review and approval from within Simulacrum.
3. Conduct the mint conversation from within Simulacrum.
4. Gather signatures and finalize from within Simulacrum.
5. Observe continuity and attribution updates from within Simulacrum.

`lesser-host` remains the control-plane and publication backend. It is not the
canonical human-facing UI for the graduation flow.

## Runtime Contract

- Base path remains `/l`.
- The rewrite is delivered as a FaceTheory application installed into Lesser.
- Deployment target is the same-domain instance path, not the retired
  `lesser client deploy` static upload path.
- The installed app must keep asset URLs under `/l/_assets/*`.
- Strict CSP remains mandatory:
  - no inline `<script>`
  - no inline `<style>`
  - no `style=""` attributes introduced by the client runtime
- `pnpm` remains the package manager.
- No hard-coded domains are allowed; derive origins from the running request or
  browser location.

## Auth Contract

- Browser auth continues to use Lesser `auth-ui` on the same origin at
  `/auth/*`.
- OAuth remains Authorization Code + PKCE.
- Simulacrum does not re-implement the auth UI.
- Current browser session storage remains the client-side source of the Lesser
  bearer token during migration.

Implication:

- request-time SSR cannot assume authenticated user data is available unless a
  server-readable session bridge is introduced later
- the rewrite should support an anonymous SSR shell plus browser hydration for
  authenticated instance workflows

## Repo Ownership

### `equaltoai/simulacrum`

Owns:

- the canonical agent-first UX and route map under `/l/*`
- FaceTheory app shell, page composition, and browser-side workflow state
- instance-facing orchestration of request, review, conversation, signing, and
  continuity surfaces
- local integration of Greater face modules and instance data loaders
- operator and rollout documentation for the rewritten client

Does not own:

- soul publication authority
- trust/control-plane auth semantics
- GraphQL schema design
- shared component package contracts

### `equaltoai/lesser`

Owns:

- instance auth, OAuth, and same-origin auth UI
- GraphQL-first instance APIs
- drone workflow instance-facing types, queries, and mutations
- continuity and soul-incorporation semantics on the instance body
- installed client hosting contract for the `/l/*` application

Canonical instance-facing workflow surfaces:

- `agent(username)`
- `droneWorkflow(username)`
- `myDroneRequests`
- `myDroneReviews`
- `requestSoulPromotion`
- `reviewSoulPromotion`
- `finalizeSoulPromotion`
- `incorporateSoul`

### `equaltoai/lesser-host`

Owns:

- durable control-plane promotion state
- mint conversation persistence and SSE handlers
- finalize preflight payloads and publication-side signing inputs
- lifecycle event feeds and current-state promotion snapshots

Canonical control-plane resources:

- `SoulAgentPromotion`
- `SoulAgentPromotionLifecycleEvent`
- `SoulAgentMintConversation`

Constraint:

- Simulacrum must not scrape or depend on portal-only UI behavior

### `equaltoai/greater-components`

Owns:

- shared agent, chat, messaging, notification, soul, and face modules
- Stitch-aligned visual primitives and face compositions
- reusable workflow types and composition boundaries used by Simulacrum
- the canonical vendored install path for `faces/agent` and `shared/agent`

Canonical downstream adoption path:

- vendored install via `greater add faces/agent shared/agent`
- route-level imports from `$lib/greater/faces/agent`
- shared workflow imports from `$lib/components/agent`
- Simulacrum wraps those surfaces with product routing, auth, data loading,
  and mutations; it does not fork or restage them locally

### `equaltoai/lesser-body`

Owns:

- body/soul incorporation semantics that preserve continuity
- runtime implications of becoming souled on the existing body

### `theory-cloud/FaceTheory`

Owns:

- SSR/runtime contract for the installed client
- route handling, hydration envelope, and Vite manifest integration

### `theory-cloud/AppTheory` and `theory-cloud/TableTheory`

Own the aligned companion runtime/storage contracts when Simulacrum consumes
them directly or transitively.

## Canonical Route Map

The rewrite uses an agent-first information architecture rather than a
clone-era tab set.

- `/l/` -> Nexus Dashboard
- `/l/souls` -> Soul Request Center
- `/l/souls/genesis` -> Agent Genesis Workspace
- `/l/approvals` -> Graduation Approval Thread
- `/l/identity` -> Identity Nexus
- `/l/auth/callback` -> OAuth callback completion surface

Route intent:

- dashboard: readiness, continuity, workflow activity
- souls: request intake, request routing, review queue, notification entrypoint
- genesis: active request, mint conversation, declaration shaping
- approvals: signer thread, decision packet, finalize checkpoint
- identity: continuity, attribution, profile, reachability, post-graduation
  semantics

## Lifecycle Contract

The canonical in-instance lifecycle is:

1. request
2. review
3. declaration
4. signing
5. graduation
6. continuity

Canonical identity states:

- `drone`
- `graduating`
- `souled`

Canonical continuity semantics:

- body identity remains continuous through graduation
- timeline continuity remains visible after graduation
- memory and attribution continuity remain explicit, not implicit
- moderation semantics distinguish lightweight drone constraints from souled
  operation

## Signing And Approval Contract

Simulacrum must expose the approval and finalization flow as part of the
product, not as an external wallet popup without context.

The UX must make room for:

- principal approval
- boundary signatures
- final self-attestation
- finalize readiness and launch ownership

The client may render signing readiness from Lesser workflow state and
`lesser-host` finalize preflight payloads, but it must not invent signing
inputs when canonical backend data already exists.

## Conversation Contract

The mint conversation is a first-class agent workflow surface.

Canonical responsibilities:

- `lesser-host` owns durable mint conversation records and SSE execution
- Simulacrum owns the in-instance conversation UI and the route where the
  conversation is conducted
- Lesser owns the instance-facing workflow projection used to keep the rest of
  the UI coherent

Current integration boundary after Project 44 M4.1:

- Simulacrum authenticates users with a Lesser OAuth bearer token
- the production creation boundary is the Greater `createSoulBootstrapClient`
  facade over Lesser same-origin GraphQL
- Lesser performs any Host instance-trust work server-side; browser code does
  not receive Host control-plane credentials or raw Host write clients
- M4.2 restores the visible `/l/identity`, `/l/souls/genesis`, and
  `/l/approvals` route lanes from the adapter-backed state model; M4.3 owns
  interactive signing controls
- Simulacrum must not ask the browser to store or present `lesser-host`
  control-plane credentials

Implementation rule for the rewrite:

- use Lesser GraphQL workflow state as the canonical in-instance status model
- restore mint/finalize execution only through the Lesser same-origin
  soul-bootstrap bridge plus the Greater facade, or an explicitly equivalent
  first-party contract that keeps Host credentials server-side
- do not regress to a portal-only UX

## Deployment Contract

The installed client contract for the rewrite is:

- server bundle under `build/server`
- client assets under `build/client`
- a Lesser install manifest in `facetheory.lesser.json`
- server entry handled by FaceTheory and compatible with Lesser's installed
  handler execution

The handler must normalize `/l` requests and emit a FaceTheory response without
violating the strict CSP requirement.

## Design Contract

The rewrite follows Stitch project `13618047916752071397` and its
`Ethereal Editorial` design system.

Non-negotiable visual cues:

- Noto Serif display moments
- Manrope body typography
- saffron and lavender atmospheric palette
- layered vellum surfaces
- glass horizon navigation
- soft radii and editorial spacing
- no clone-era divider grid and no boxed SaaS shell

Canonical Stitch anchors:

- `Agent Genesis`
- `Nexus Dashboard`
- `Identity Nexus`
- `Notification Center: Soul Requests`
- `Direct Message: Graduation Approval`
- `Unified Timeline (Identity Updated)`
- `Agent Profile & Wallet`

## Decisions Frozen Here

- Simulacrum is the canonical in-instance soul workflow surface.
- The rewrite targets FaceTheory, not an extension of the legacy SvelteKit
  shell.
- `/l/*` remains the canonical runtime path.
- Lesser GraphQL is the canonical instance-facing workflow contract.
- `lesser-host` remains the control-plane publication backend.
- Greater `faces/agent` and `shared/agent` are the canonical route-level and
  workflow UI surfaces.
- Direct browser dependence on host-portal auth is out of scope; soul creation
  must resume through same-origin instance trust and the Greater bootstrap
  facade.
