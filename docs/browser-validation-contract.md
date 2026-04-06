# Browser Validation Contract For Async Public Surfaces

Date: 2026-04-05

Issue: `#114`

## Why this document exists

Simulacrum's anonymous public routes under `/l/*` render a stable FaceTheory
shell first and then load route data in the browser. Before we add Playwright
or route-specific specs, we need to freeze what the shipped browser contract is
for those async surfaces so the later harness does not chase unstable DOM
structure, transient copy, or accidental loading behavior.

This document is the milestone contract for:

- route scope
- route-level readiness semantics
- the stable `data-testid` vocabulary we expect to add in `#119`
- deterministic local browser scenarios versus deployed live smoke scenarios
- artifact, retry, and flake expectations for the future suite

## In scope

The anonymous public browser surface for this milestone is exactly:

- `/l/explore`
- `/l/profile/:identifier`
- `/l/status/:id`

These routes are public in the current FaceTheory route map:

- [src/facetheory/routing.ts](/home/aron/ai-workspace/codebases/equaltoai/simulacrum/src/facetheory/routing.ts)

The current route implementations are:

- [src/lib/greater/faces/agent/ExplorePage.svelte](/home/aron/ai-workspace/codebases/equaltoai/simulacrum/src/lib/greater/faces/agent/ExplorePage.svelte)
- [src/lib/greater/faces/agent/ProfilePage.svelte](/home/aron/ai-workspace/codebases/equaltoai/simulacrum/src/lib/greater/faces/agent/ProfilePage.svelte)
- [src/lib/greater/faces/agent/StatusPage.svelte](/home/aron/ai-workspace/codebases/equaltoai/simulacrum/src/lib/greater/faces/agent/StatusPage.svelte)

## Out of scope

This milestone does not:

- install Playwright or any browser dependencies
- add the actual `data-testid` hooks
- define Actions workflows
- cover authenticated `/l/*` routes
- duplicate API-suite coverage for transport-level contract assertions

Those belong to `#115`, `#116`, and `#117`.

## Shipped async model

All three public routes currently follow the same high-level flow:

1. SSR and first paint render the FaceTheory shell immediately.
2. The page body enters a route-level loading state in the browser.
3. A route-specific async fetch resolves into one terminal state.
4. Browser assertions should target that terminal state, not the first shell
   paint.

Important consequence:

- shell rendered does not mean page ready
- the top-level "Preview mode" notice is not a readiness signal for public
  routes because it belongs to the broader app shell rather than the public
  route's data contract

## Route matrix

### `/l/explore`

Current fetch path:

- `api.fetchPublicTimeline()`
- soul avatar patching via `applySoulAvatarsToStatuses()`

Terminal states to support:

- `loading`
- `ready` with at least one visible public post
- `empty`
- `error`

Required eventual assertions:

- the route shell and hero render without auth
- the loading state appears before async completion
- the loading state is replaced by exactly one terminal state
- success means a timeline is visible and a visible status card can navigate to
  `/l/status/:id`
- empty means the route reports that no public posts are available
- error means a route-level alert is visible

Non-goals for assertions:

- exact count of rendered cards
- exact sort order for live content
- exact visible card count in the DOM, because timeline virtualization can vary
  by viewport

### `/l/profile/:identifier`

Current fetch path:

- `api.fetchActorProfile()`
- `api.fetchActorTimeline()`
- soul avatar patching via `applySoulAvatarsToStatuses()`

Terminal states to support:

- `loading`
- `ready` with profile header and timeline items
- `ready-empty-posts` with profile header and no public posts
- `not-found`
- `error`

Required eventual assertions:

- the route shell and hero render without auth
- the loading state appears before async completion
- success means the page resolves a profile header, handle, canonical profile
  link, and profile stats
- success with timeline content means at least one visible status card renders
- success with no public posts still counts as a ready state if the profile
  header resolves
- not found means the profile surface resolves to a route-level not-found state,
  not an indefinite spinner
- error means a route-level alert is visible

Non-goals for assertions:

- exact follower or post counts in live smoke
- exact profile bio markup beyond coarse visibility in deterministic scenarios

### `/l/status/:id`

Current fetch path:

- `api.fetchThreadContext()`
- soul avatar patching for root, ancestors, and descendants

Terminal states to support:

- `loading`
- `ready` with focus status
- `not-found`
- `error`

Required eventual assertions:

- the route shell and hero render without auth
- the loading state appears before async completion
- success means a focus status renders for the requested thread
- ancestor and descendant sections are optional and should be asserted only when
  present in the scenario
- not found means the route exits loading and reports a missing post
- error means a route-level alert is visible

Non-goals for assertions:

- exact reply depth in live smoke
- exact ancestor or descendant counts outside deterministic fixture scenarios

## Readiness contract

Browser assertions must wait for a route-specific terminal state rather than:

- the initial shell paint
- network idleness alone
- disappearance of one generic loading message anywhere on the page

The future browser harness should treat a public route as ready only when:

1. the route root is present
2. the route loading marker is absent
3. exactly one terminal marker is present:
   - `ready`
   - `empty`
   - `not-found`
   - `error`

This protects us from false positives where the shell renders but the route is
still unresolved.

## Stable test hooks to add in `#119`

The contract for hook placement is frozen here even though the attributes are
not yet implemented.

### Shared route hooks

Every public route should expose:

- route root: `data-testid="public-route"`
- route kind: `data-route-key="explore|profile|status"`
- shell hero: `data-testid="public-route-hero"`
- loading state: `data-testid="public-route-loading"`
- error state: `data-testid="public-route-error"`

Every terminal state should also expose one route-local marker:

- success: `data-testid="public-route-ready"`
- empty: `data-testid="public-route-empty"`
- not found: `data-testid="public-route-not-found"`

Rules:

- only one of `ready`, `empty`, `not-found`, or `error` may be present at a
  time
- loading and a terminal marker must never be visible together after the route
  settles
- hook names should stay semantic and route-scoped; no CSS-class selectors in
  browser specs

### `/l/explore` hooks

Add:

- `data-testid="public-explore-route"`
- `data-testid="public-explore-timeline"`
- `data-testid="public-status-card"` on visible public cards
- `data-status-id="<status-id>"` on each rendered status card

The explore route's `ready` marker belongs on the timeline container rather than
on individual cards.

### `/l/profile/:identifier` hooks

Add:

- `data-testid="public-profile-route"`
- `data-testid="public-profile-header"`
- `data-testid="public-profile-handle"`
- `data-testid="public-profile-stats"`
- `data-testid="public-profile-timeline"`
- `data-testid="public-profile-empty-posts"`

Profile success is defined by the resolved header. The timeline can then settle
into either timeline content or the empty-posts terminal substate.

### `/l/status/:id` hooks

Add:

- `data-testid="public-status-route"`
- `data-testid="public-status-thread"`
- `data-testid="public-status-focus"`
- `data-testid="public-status-ancestors"`
- `data-testid="public-status-descendants"`

The focus status is the success anchor. Ancestor and descendant containers are
optional scenario details.

## Assertion vocabulary

The future browser helpers in `#115` should use the following vocabulary:

- `waitForPublicRouteReady(page, routeKey)`
  waits for `loading` to disappear and a terminal marker to appear
- `expectPublicRouteShell(page, routeKey)`
  asserts route root plus hero without implying data readiness
- `expectPublicRouteError(page, routeKey)`
  asserts route-level failure
- `expectPublicRouteNotFound(page, routeKey)`
  asserts route-level not found

Route-specific helpers can layer on top:

- `expectExploreReady(page)`
- `expectProfileReady(page)`
- `expectStatusReady(page)`

## Deterministic versus live scenario model

The suite must be split into two explicitly different lanes.

### Deterministic local scenarios

Purpose:

- prove the UI contract under controlled inputs
- cover loading, empty, error, and not-found states intentionally
- give us stable regression protection on pull requests

Requirements:

- must not depend on deployed data
- must use fixed scenario fixtures or route-level request interception
- must use fixed identifiers and fixture payloads committed in the repo
- may assert exact text, exact visible cards, and exact state transitions

Initial deterministic scenario set:

- `/l/explore`: success, empty, error
- `/l/profile/:identifier`: success with posts, success without posts, not found,
  error
- `/l/status/:id`: success, not found, error

### Deployed live smoke scenarios

Purpose:

- validate that real deployed public surfaces still load end to end
- catch integration failures, auth regressions, or unexpected remote-content
  timing behavior

Requirements:

- scenario inputs must come from environment or workflow configuration
- assertions must stay coarse and resilient
- live smoke must never become the source of truth for negative-state coverage

Allowed live assertions:

- response page opens under `/l/*`
- route shell renders
- route settles into an expected broad success state
- one or two identity anchors are present, such as a handle or focus post

Disallowed live assertions:

- exact post counts
- exact ordering of timeline items
- brittle content text from remote or time-varying posts
- negative states that require artificial environment manipulation

## Artifact policy

The future browser suite should mirror the repo's existing API-suite evidence
style: every run gets a durable artifact directory and failures are immediately
triageable without rerunning locally.

Artifact contract:

- write artifacts under `artifacts/browser/<run-id>/`
- always emit `meta.json`
- always emit `summary.md`
- on failure, emit a route-specific failure bundle containing:
  - screenshot
  - Playwright trace
  - captured DOM HTML
  - console log
  - scenario metadata, including base URL and route input

Failure artifacts should be issue-ready in the same spirit as:

- [tests/api/_harness/evidence.mjs](/home/aron/ai-workspace/codebases/equaltoai/simulacrum/tests/api/_harness/evidence.mjs)

## Retry and flake policy

Deterministic and live lanes do not share the same retry posture.

### Deterministic local specs

- retries: `0`
- expectation: failures are actionable regressions, not transient noise
- if a deterministic spec flakes, we fix the spec or product before expanding
  coverage

### Deployed live smoke specs

- retries: at most `1` in CI
- expectation: one retry can distinguish transient environment instability from
  durable regressions
- a pass on retry still counts as flaky and must be surfaced in run summary

Global flake rule:

- do not hide instability by increasing retries
- if a scenario is repeatedly flaky, quarantine or narrow it before treating it
  as normal product verification

## What belongs in browser validation versus API validation

For this milestone, the boundary is simple:

- browser validation proves rendered route behavior, async readiness, and
  navigation-level user outcomes
- API validation proves transport contracts, schema shape, headers, and lower
  level request semantics

The browser suite should not duplicate deep API assertions that the API suite
already owns.

## Acceptance checklist for `#114`

- [x] The target anonymous routes and required assertions are explicitly
      documented.
- [x] Readiness markers and test hooks are identified for the public surfaces.
- [x] Deterministic versus deployed-stage scenarios are clearly separated.
- [x] Retry, artifact, and failure-handling expectations are agreed for the
      suite.
