# Simulacrum Instance Frontend Roadmap (Follow‑up: M7+)

> Historical note: this roadmap documents the legacy clone-shaped client after
> M6. The canonical rewrite is the agent-first FaceTheory contract in
> `docs/drones/agent-first-facetheory-contract.md`.

This roadmap continues after `docs/instance-frontend-roadmap.md` (M0–M6). It focuses on turning the current foundation
into a **feature-complete social client** that exposes **Lesser’s full Mastodon-compatible surface** *and* Lesser’s
enhancements (AI, moderation, agents), plus managed-hosting integrations (verification + tips).

Target instance (dev): `https://dev.simulacrum.greater.website/l/`

## Constraints (unchanged)

- Base path must remain `/l` (SvelteKit).
- Strict CSP compatibility (no inline `<script>`/`<style>`).
- Auth uses Lesser `auth-ui` on the same origin (`/auth/*`) + OAuth Authorization Code + PKCE.
- Prefer GraphQL for core app data/mutations; use REST where GraphQL coverage is intentionally exempted.
- Ignore `.pai` and `.theory` directories when scanning parent repos.

## API strategy (practical)

- **GraphQL-first** for timelines, viewer, objects, relationships, and most mutations.
- **REST fallback** for endpoints not in GraphQL coverage (or where REST returns additional “relationship booleans” we need
  for first-render UI state).
- Use Lesser’s coverage policy as a guide:
  - `../lesser/docs/specs/graphql_coverage.yaml`
  - Agents are GraphQL-covered as of lesser `v1.1.3` (directory/management + admin policy/ops + `timeline(excludeAgents)`).

## Cross-cutting UI building blocks (to standardize early)

Implement these once, then reuse everywhere (timeline, status detail, profile, notifications):

- `StatusCard`: render author + content + attachments + meta + badges.
- `StatusActions`: reply / boost / like / bookmark / pin / delete / share (with optimistic updates).
- `Composer`: note/reply/quote with media + poll + CW + visibility + emoji.
- `ModerationMenu`: report / mute / block + Lesser enhancements (community notes, trust signals).
- `AdminSurface`: role-gated shell + tables + detail panes (reports, accounts, statuses).

## Milestones

### M7 — Interaction UI (read → act)

Deliverables:
- Add `StatusActions` to timeline and status detail:
  - like/unlike
  - boost/unboost
  - bookmark/unbookmark
  - pin/unpin (where allowed)
  - delete (own content; admin delete as separate action)
  - share/copy link
- Add reply composer entry points:
  - “Reply” opens an inline composer (`createNote` with `inReplyToId`).
- Ensure action state is correct on first render (active/disabled/counts).

Acceptance:
- Admin can like/boost/reply/bookmark/pin/delete from both timeline and `/status/[id]`.
- Counts update optimistically and reconcile on refresh.

Notes:
- GraphQL `Object` includes `boosted` and `relationshipType`, but REST includes richer booleans. Choose a single
  source-of-truth strategy:
  - GraphQL for lists + REST hydration per-status, or
  - Switch timelines to REST for parity and keep GraphQL for mutations.

Done (2026-02-10): Added action UI (reply/boost/favorite/bookmark/pin/share/delete) to timelines + status detail using GraphQL mutations with optimistic count/state updates. Updated (2026-02-10): Upgraded to lesser v1.1.1 + greater-v0.1.7 and switched status threads to GraphQL `threadContext` (ancestors/descendants) while querying viewer interaction state (`viewerFavourited`/`viewerBookmarked`/`viewerPinned`) for first-render action correctness.

### M8 — Composer parity (media/polls/CW/visibility/emoji)

Deliverables:
- Expand compose to support:
  - attachments via `uploadMedia` + `createNote(attachmentIds)`
  - polls via `createNote(poll)`
  - CW + sensitive + spoiler text
  - visibility selector
  - custom emoji picker
- Add edit flow (where supported) via `updateStatus`.
- Add scheduled status support (create/list/cancel/update) if desired for parity.

Acceptance:
- Create a post with media, a post with a poll, and a CW/sensitive post.
- Reply and quote compose share the same composer surface.

Done (2026-02-10): Implemented a shared `Composer` surface used for posting, replying, quoting, and editing. Added GraphQL `uploadMedia` integration for attachments, poll drafting via `createNote(poll)`, CW/sensitive/spoiler support, visibility selection, and a custom emoji picker backed by GraphQL `customEmojis`. Updated timelines and status threads to render media attachments, polls, and quote previews.

### M9 — Discovery: search, trends, hashtags, lists

Deliverables:
- Search page (`Query.search`) with tabs: accounts / statuses / hashtags.
- Trends surface (tags/statuses/links) for Explore.
- Hashtag pages:
  - view hashtag timeline
  - follow/unfollow hashtags
  - hashtag notification settings + mute (where supported)
- Lists:
  - create/update/delete lists
  - add/remove accounts
  - list timelines

Acceptance:
- Follow a hashtag and see it in followed hashtags list.
- Create a list and view its timeline.

Done (2026-02-10): Added a Search page with tabs (accounts/statuses/hashtags) backed by GraphQL `Query.search`, expanded Explore with GraphQL trends (tags/links/statuses) plus a followed-hashtags section, implemented hashtag pages with timelines + follow/unfollow + notification settings + mute, and added list CRUD + membership management with list timelines.

### M10 — Realtime + conversations + push

Deliverables:
- WebSocket subscriptions:
  - timeline updates (home/local/public)
  - notification stream
  - relationship updates (optional)
- Conversations/DMs:
  - conversations list + detail
  - mark as read + delete
- Push subscriptions:
  - register/update/delete push subscription (browser support permitting)

Acceptance:
- Receive timeline updates without refresh while the tab is open.
- Receive notifications via WS; push registration succeeds in a supported browser.

Done (2026-02-10): Wired GraphQL WebSocket subscriptions for home/local/public timeline updates and notification streaming, added conversations list + detail pages with mark-as-read and delete actions, and implemented push subscription registration/update/delete (service worker + instance VAPID key fetch) in Settings.

### M11 — Trust + moderation (user-facing)

Deliverables:
- Inline moderation menu on statuses/accounts:
  - report + block + mute (REST or GraphQL as appropriate)
- Lesser enhancements exposure:
  - community notes: add + vote + display
  - reputation + vouches display (profile)
  - trust graph (profile/admin-only view depending on policy)
  - translation UI (`translateStatus`)
  - quote post UX (view quotes, quote compose, quote permissions)

Acceptance:
- Report a status and see it reflected in the admin surface (M12).
- Add a community note to a status and vote on it.

Done (2026-02-10): Added inline moderation menus (report/mute/block) for statuses + profiles using GraphQL `flagObject`/`muteActor`/`blockActor`, exposed community notes (add/vote/display) in timelines + status detail, added profile trust signals (reputation + vouches + trust graph), added a translation toggle via `translateStatus`, and completed quote UX (view quotes, quote compose gating, quote permissions editor).

### M12 — Admin console (real moderation + instance ops)

Deliverables:
- Reports workflow:
  - list reports queue + filters
  - report detail + context + actions (assign/resolve/reopen)
- Account admin actions:
  - warn/silence/suspend/unsuspend/approve/enable/etc (per API support)
- Status admin actions:
  - mark sensitive/unsensitive, delete, review context
- Instance admin:
  - domain/email blocks
  - announcements CRUD + reactions
  - custom emoji CRUD
- Agents governance:
  - view/update agent policy
  - verify/unverify agents

Acceptance:
- As admin, process a report end-to-end (assign → resolve → verify state).
- Manage custom emojis and announcements from the UI.

Done (2026-02-11): Implemented an admin console with reports queue + detail (assign/unassign/resolve/reopen) and per-status admin actions (mark sensitive/delete), added admin accounts management actions (warn/silence/unsilence/suspend/unsuspend/disable/enable/approve), added admin statuses queue with filters and actions, added instance ops for domain allows/blocks + email blocks, added announcements list/create/reactions (update/delete not yet exposed in GraphQL), added custom emoji CRUD, and added agents governance (policy edit + verify/unverify via REST per Lesser coverage policy).
Updated (2026-02-11): Migrated agent governance to GraphQL now that lesser `v1.1.3` exposes admin agent policy + verify/unverify/suspend.

### M13 — Agents & bot accounts (LLM-ready surface)

Deliverables:
- Agents directory + agent profile pages (`/api/v1/agents*`).
- Owner flows:
  - delegate an agent (delegated OAuth)
  - view agent activity log
  - update agent profile/capabilities (where allowed)
- Admin flows:
  - configure agent policy
  - suspend/verify agents
- Timeline filtering toggle: `exclude_agents=true` for home/public where applicable.

Acceptance:
- Create (delegate) an agent and confirm it appears in the directory.
- Hide/show agent posts via timeline filtering.

Done (2026-02-11): Added `/l/agents` directory + `/l/agents/[username]` agent profile pages with delegation (access+refresh tokens), live activity log streaming, and owner/admin management (update/delete/revoke token). Implemented admin agent governance in `/l/admin/agents` (policy config + verify/unverify/suspend) and added a persisted “Hide agent posts” toggle that uses GraphQL `timeline(excludeAgents)` and filters realtime timeline updates.

### M14 — AI analysis (instance-native)

Deliverables:
- Per-status “AI panel”:
  - show `aiAnalysis(objectId)` when present
  - request analysis (`requestAIAnalysis`) and subscribe to updates (`aiAnalysisUpdates`)
- Instance AI dashboard (admin):
  - capabilities (`aiCapabilities`)
  - stats (`aiStats`)
  - integrate into moderation surfaces (flag/hide/review suggestions)

Acceptance:
- Request AI analysis for a post and see results populate without refresh.
- Admin can view AI stats and capabilities.

Done (2026-02-11): Added a per-status AI analysis panel backed by GraphQL `aiAnalysis` + `requestAIAnalysis` with realtime `aiAnalysisUpdates` subscriptions on the status detail page, surfaced AI suggestions in admin report review, and shipped an admin AI dashboard (`/l/admin/ai`) showing `aiCapabilities` and `aiStats` with a period selector.

### M15 — Verification via `lesser-host` (attestations + content checks)

Goal:
- Expose content verification features provisioned by `lesser-host` (attestations, link-safety, claim verification),
  without leaking instance keys to the browser.

Deliverables:
- “Verify” actions on posts/links that:
  - request verification jobs through **instance-owned proxy endpoints** (new Lesser API surface likely required)
  - display results as attestations/badges with drill-down evidence
- Cache + replay:
  - show “already verified” state when cached by `lesser-host`

Acceptance:
- A user can verify a post/link and see a signed attestation summary in the UI.

Dependencies / likely gaps:
- We may need a first-party Lesser endpoint (REST or GraphQL) that proxies to `lesser-host` trust APIs using the
  instance key server-side. If it doesn’t exist, file an issue in `equaltoai/lesser` and/or `equaltoai/lesser-host`.

Done (2026-02-11): Added a status-detail Verification panel that uses the first-party `/api/v1/trust/*` proxy endpoints to run link safety verification (`publish/jobs`) and claim verification (`ai/claims/verify`), showing cached/signed attestations with drill-down JSON and per-link risk details.

### M16 — Tipping (TipSplitter) + settings

Goal:
- Integrate the `lesser-host` tipping system so users can tip creators and the host can participate in revenue splits.

Deliverables:
- Tip UI on statuses and profiles:
  - uses **currently connected wallet** as the sender (EIP-1193 provider, e.g. MetaMask)
  - supports ETH tipping first; ERC-20 optional after allowlist UX exists
  - transaction status UX (pending/confirmed/failed)
- Tip recipient selection:
  - default tip address = user’s **most recently used** linked wallet (login wallet) when available
  - configurable per user (choose from linked wallets)
  - publish a public “tip address” on profile (likely via `updateProfile(fields)` convention)
- Instance tip config discovery:
  - obtain `tipEnabled`, `chainId`, `contractAddress` (and any UI defaults) from a first-party source
    (ideal: `GET /api/v1/instance` → `configuration.tips`, or GraphQL `instance` extension).

Acceptance:
- A user can tip a post author from the timeline using their connected wallet.
- Authors can configure their public tip address; by default it uses the wallet they used to log in.

Dependencies / likely gaps:
- Tip config should be discoverable from a first-party surface:
  - REST: `/api/v1/instance` → `configuration.tips`
  - GraphQL: `Query.instance` → `tips`
- Recipient resolution should be first-class:
  - GraphQL: `Actor.tipAddress` / `Actor.tipChainId` (instance-scoped)
  - Also publish a CAIP-10 `Wallet` field for compatibility (`eip155:<chainId>:<0xAddress>`)
- Content hash should be canonical:
  - GraphQL: `Object.contentHash` (convention: `keccak256(utf8(object.id.trim()))`)
- If any of the above is missing/awkward in practice, file issues against `equaltoai/lesser` and/or `equaltoai/lesser-host`.

Done (2026-02-11): Added a TipSplitter-based tipping UI on timelines, status detail, and profiles using the injected EIP-1193 wallet as the sender (`tipETH(hostId, actor, contentHash)`) with pending/confirmed/failed UX. Added Settings → Tipping to select a default tip recipient from linked wallets (challenge + signature verification updates `last_used`) and to publish a CAIP-10 `Wallet` profile field. Tip config is discovered from `/api/v1/instance` (`configuration.tips`).

## Out of scope (for now)

- Re-implementing Lesser `auth-ui` in the client (we treat it as the canonical login UI).
- A full `lesser-host` portal/operator console inside the instance UI (that belongs in `lesser-host/web`).

## References

- Lesser GraphQL schema: `../lesser/docs/contracts/graphql-schema.graphql`
- Lesser REST OpenAPI: `../lesser/docs/contracts/openapi.yaml`
- Lesser GraphQL coverage policy: `../lesser/docs/specs/graphql_coverage.yaml`
- `lesser-host` tip registry docs: `../lesser-host/docs/tip-registry.md`
- `lesser-host` AI services roadmap: `../lesser-host/docs/ai-services-roadmap.md`
