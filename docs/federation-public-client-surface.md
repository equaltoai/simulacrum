# Federation Readiness: Public Client Surface

Date: 2026-04-02

## Why this document exists

Simulacrum is preparing to begin meaningful federation testing. The current
private-by-default client posture is not compatible with that work.

At minimum, we need a public client surface that allows anonymous users and
remote-instance users to:

- browse a public or local timeline
- open public post permalinks and thread context
- view public actor/profile surfaces
- verify that Simulacrum behaves like a federating instance rather than a
  members-only shell with a hidden backend

This document captures what is already true, what is actually blocked, and the
minimum cross-repo changes needed to make federation testing practical.

## Verified findings

### 1. Simulacrum dev is active and unlocked

On 2026-04-02, `https://dev.simulacrum.greater.website/setup/status` returned:

- `instance_state: active`
- `locked: false`
- `activated_at: 2026-03-02T18:22:23.241069532Z`

This means the current blocker is not instance lock state.

### 2. Anonymous GraphQL is still blocked at the HTTP boundary

On 2026-04-02, an unauthenticated request to:

- `POST https://dev.simulacrum.greater.website/api/graphql`

with:

```graphql
query {
  instance {
    title
  }
}
```

returned:

- `authentication required`

This matches Lesser runtime behavior in
`../lesser/cmd/graphql/main.go`, where `handleGraphQL` rejects all
unauthenticated requests before resolver execution.

### 3. Lesser already has most of the resolver/service behavior needed for public reads

The current blanket GraphQL auth gate hides the fact that several Lesser
GraphQL resolvers are already structured for anonymous-safe public use:

- `Query.actor`
- `Query.object`
- `Query.timeline`
- `Query.search`
- `Query.instance`
- `Query.instanceActivity`
- `Query.instancePeers`
- `Query.announcements`
- `Query.customEmojis`

Important nuance:

- `timeline(HOME)` and `timeline(DIRECT)` do require auth
- `timeline(PUBLIC|LOCAL|HASHTAG|ACTOR)` is already modeled differently
- note visibility checks in the notes service already distinguish anonymous
  public/unlisted access from private/direct viewer-gated access

### 4. Simulacrum still treats public-looking pages as authenticated-only

The canonical `/l` rewrite contract expects an anonymous shell, but the current
client implementation still assumes authentication on the surfaces that matter
for federation testing:

- `/l/explore` is marked `requiresAuth: true`
- `/l/status/:id` is marked `requiresAuth: true`
- `ExplorePage.svelte` returns early without an access token
- `StatusPage.svelte` returns early without an access token
- public-read API helpers still call `requireAccessToken()`

This means the app currently exposes a preview of public surfaces without
actually allowing anonymous use of them.

### 5. The current public-read path is internally inconsistent

Simulacrum is GraphQL-first for app functionality, but several public-facing
reads still depend on:

- blanket token requirements in `src/lib/api/index.ts`
- some REST compatibility paths for status detail/context

That creates three incompatible meanings of "public":

- public in ActivityPub/discovery
- public in REST for authenticated viewers
- non-public in GraphQL

That inconsistency is the main source of confusion around Explore and public
thread links.

## What this means

The federation blocker is not "turn federation on" and not "unlock the
instance." Those conditions are already satisfied for dev.

The blocker is that Simulacrum has no real anonymous client path for public
content because:

- Lesser denies anonymous GraphQL at the endpoint level
- Simulacrum marks public-facing routes as auth-only
- Simulacrum public-read helpers still require access tokens
- the canonical FaceTheory route map does not yet appear to include a first
  class public profile route under `/l/*`

## Minimum viable public client surface

To make cross-instance sharing and federation testing practical, the public
client surface should cover:

### Public timeline

- anonymous `Explore` or equivalent public timeline route
- public/local timeline reads through GraphQL
- no auth requirement to load the page shell or data

### Public post/thread permalink

- anonymous route for an individual public post
- anonymous thread context read for ancestors and descendants
- visibility enforcement that remains consistent with public/unlisted rules

### Public profile surface

- anonymous route for local and remote actor/profile pages
- actor lookup by username or ID
- actor timeline for public posts

### Instance discovery surface

- anonymous instance metadata sufficient for users and testers to confirm the
  instance is publicly readable and participating in federation

## Required repo changes

### `equaltoai/lesser`

Lesser owns the critical platform change.

Required:

- replace the blanket anonymous GraphQL deny with an explicit allowlist for a
  small public query subset
- keep private/viewer/admin GraphQL operations auth-only
- document the allowed anonymous GraphQL surface as policy, not an accident
- update OpenAPI and docs to match runtime behavior

Minimum public GraphQL subset:

- `actor(id|username)`
- `object(id)`
- `timeline(type: PUBLIC | LOCAL | HASHTAG | ACTOR, ...)`
- `search(query, ...)`
- `instance`
- `instanceActivity`
- `instancePeers`
- `announcements`
- `customEmojis`
- a privacy-safe thread query for public thread views

Important note:

`threadContext(noteId)` already exists in GraphQL, but it needs a privacy review
before it should be treated as part of the anonymous public surface.

### `equaltoai/simulacrum`

Simulacrum owns the public client presentation and route semantics.

Required:

- mark public-facing routes as truly public rather than auth-only
- remove early token gates from public pages
- split public-read helpers from viewer-read helpers in `src/lib/api/index.ts`
- adopt anonymous GraphQL reads for public surfaces once Lesser supports them
- add a first-class public profile route under `/l/*`

Minimum routes to expose anonymously:

- `/l/explore`
- `/l/status/:id`
- a public profile route such as `/l/profile/:acct` or another canonical
  FaceTheory path

### `equaltoai/lesser-host`

No required minimum-scope product change is currently identified for the public
client surface itself.

Possible follow-up only if needed:

- provisioning/docs updates if org defaults or staged environment guidance still
  imply that public client access should remain hidden during federation testing

## Non-goals

This work is not the same as:

- making all of Simulacrum broadly open for registration
- exposing all GraphQL anonymously
- replacing the app with REST workarounds
- revisiting the private-instance product thesis in full

The goal is narrower: enable deliberate federation testing with a real anonymous
client surface for public content.

## Recommended implementation sequence

1. Land the Lesser public-GraphQL allowlist and privacy hardening for thread
   reads.
2. Update Lesser docs/specs so the public GraphQL contract is explicit.
3. Update Simulacrum routes and API helpers to distinguish anonymous public
   reads from authenticated viewer reads.
4. Ship anonymous `Explore`, public post/thread, and public profile surfaces in
   the FaceTheory runtime.
5. Verify end to end against real remote-instance federation scenarios.

## Proposed issue structure

Top-level summary issue:

- one org project + one summary issue describing the federation-readiness goal
  for a public client surface

Detailed linked subissues:

- Lesser: define and ship the anonymous GraphQL public-read contract
- Lesser: harden or adjust GraphQL thread/public-post access semantics
- Lesser: update public-surface docs and OpenAPI to match runtime
- Simulacrum: expose anonymous Explore and public timeline reads
- Simulacrum: expose anonymous status/thread permalinks
- Simulacrum: add a public profile surface in the `/l/*` FaceTheory runtime

The issue bodies should use direct parent/child linking rather than markdown
checkbox lists.

## Verification update: 2026-04-03

The Lesser public-read issues were delivered and deployed, and Simulacrum now
ships the matching anonymous FaceTheory client surface on dev.

### Deployed client verification

Client install deployed to:

- `https://dev.simulacrum.greater.website/l/*`

The deployed HTML shell now renders public routes without the old authenticated
preview notice:

- `/l/explore`
- `/l/status/:id`
- `/l/profile/:identifier?id=<actor-id>`

Public route shells now server-render the correct page surface and a neutral
loading state rather than:

- redirecting to registration/sign-in
- rendering the old "Preview mode" auth notice
- rendering a false "Profile not found" on first paint for valid shared links

### Anonymous GraphQL verification

On 2026-04-03, anonymous requests against
`https://dev.simulacrum.greater.website/api/graphql` returned successful data
for:

- `timeline(type: PUBLIC, first: 5)` with public posts
- `threadContext(noteId: "29d56f65-cd97-43b8-aff4-c8ff509b1217")`
- `actor(id: "https://dev.simulacrum.greater.website/users/arch")`
- `timeline(type: ACTOR, actorId: "https://dev.simulacrum.greater.website/users/arch")`

That matches the client changes in Simulacrum:

- `/l/explore` now uses anonymous-safe public timeline reads
- `/l/status/:id` now uses anonymous GraphQL thread context
- `/l/profile/:identifier` now uses anonymous actor/profile and actor-timeline
  reads

### Remaining explicit gap

The public client surface is now anonymous-ready for local public content, but
this verification pass did not yet exercise a truly remote federated actor or
post in the browser surface. The dev public timeline sample inspected on
2026-04-03 surfaced only local-instance actors.

That means the remaining follow-up for federation testing is operational rather
than client-blocking:

- seed or receive real remote federated content on dev
- re-run the same anonymous checks using a remote actor/profile route and a
  remote-origin post permalink
