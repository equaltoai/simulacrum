---
name: validate-browser-contract
description: Use when a change touches public-route shape, readiness semantics, terminal states, or testid vocabulary. `docs/browser-validation-contract.md` is the frozen public-routes spec; changes conform to the contract or explicitly evolve it (with doc update). Silent drift is refused.
---

# Validate the browser contract

sim's public routes (`/l/explore`, `/l/profile/*`, `/l/status/*`, `/l/hashtag/*`, and the canonical list in `docs/browser-validation-contract.md`) are a **public-facing surface**: Playwright tests cover them, external observers may integrate with them, and operators depend on their stability. The browser-validation contract at `docs/browser-validation-contract.md` is frozen — changes conform to it or explicitly evolve the document.

This skill walks every public-route-affecting change with the rigor that the contract demands.

## The browser-validation-contract surface (memorize)

Authoritative document: **`docs/browser-validation-contract.md`**

The contract covers:

- **Public-route catalog** — which routes are public, their URL shape, their accepted params
- **Readiness semantics** — how SSR renders a shell; how the browser loads data; what terminal states define readiness (ready / empty / error)
- **Testid vocabulary** — stable `data-testid` attributes Playwright specs reference
- **State coverage** — each route's expected states (ready / empty / error; may include loading, stale, forbidden for some routes)
- **Deterministic mocks** — in `tests/browser/mocks/`, per-route-state mock files for Playwright

Backed by:

- **Playwright specs** in `tests/browser/` — conform to testid vocabulary, exercise state coverage
- **Mocks** in `tests/browser/mocks/` — deterministic test data per state
- **Browser Live Smoke workflow** — runs Playwright against live dev instances

## When this skill runs

Invoke when:

- A change adds a new public route (contract extension)
- A change modifies an existing public route's URL shape, params, or readiness semantics
- A change adjusts testid vocabulary (rename, add, remove)
- A change adjusts state coverage (adding a new terminal state, handling a new edge case)
- A change touches a Playwright spec in `tests/browser/`
- A change touches a mock in `tests/browser/mocks/`
- A browser-validation Playwright test fails unexpectedly
- `scope-need` flags a change as public-route-affecting
- `investigate-issue` surfaces a browser-contract drift

## Preconditions

- **The change is described concretely.** "Improve `/l/profile/*`" is too vague; "add `following` tab to `/l/profile/:identifier`, conforming to existing profile-route readiness semantics, with new testid `profile-following-list` and `empty` / `ready` / `error` state coverage" is concrete.
- **MCP tools healthy**, `memory_recent` first.
- **Current contract state** read from `docs/browser-validation-contract.md`.

## The four-dimension walk

### Dimension 1: Classification

- **Conforming change** — the change fits the existing contract without modifying it (e.g. bug fix to an existing route, internal refactor that preserves external shape).
- **Contract extension** — the change adds to the contract (e.g. new public route, new testid, new state). The `docs/browser-validation-contract.md` document is updated in the same commit as the code change.
- **Contract evolution** — the change modifies the existing contract (e.g. adding a new required query param, adjusting a state's semantics). Requires doc update + coordinator awareness + Playwright spec updates.
- **Contract break** — rare; would strand external observers or Playwright specs that depend on current shape. Refuse without explicit governance authorization.

### Dimension 2: Readiness semantics

For any public-route change:

- **SSR shell** — what the route emits server-side. Typically route shell without data (skeleton / loading state).
- **Browser data load** — how the route fetches data post-hydration. Typically GraphQL queries via Apollo Client.
- **Terminal states** — when the route is "ready" for observers:
  - **`ready`** — data loaded, primary content visible
  - **`empty`** — data loaded, but the queried collection is empty (e.g. profile has no posts)
  - **`error`** — data load failed; error state visible
  - Optionally: `loading`, `stale`, `forbidden`, `not-found`

Each terminal state has a stable testid marker (e.g. `<div data-testid="explore-timeline-ready">`) that Playwright specs use to determine readiness.

### Dimension 3: Testid vocabulary

Testid changes:

- **Addition**: new testid for a new element. Fine; add to contract.
- **Rename**: breaks existing Playwright specs that reference the old name. Refuse silent; if justified, update contract + specs in the same commit.
- **Removal**: breaks specs that reference. Refuse silent; evolution only with doc + spec updates.
- **Value change** (same `data-testid="..."` value on a different element or with different state association): semantic shift. Refuse silent.

Convention:

- Testids use kebab-case
- Testids reflect purpose, not implementation detail (e.g. `explore-timeline-ready`, not `div-on-line-42`)
- Terminal-state testids suffix with the state name (`...-ready`, `...-empty`, `...-error`)

### Dimension 4: Mock coverage

Playwright mocks in `tests/browser/mocks/` provide deterministic data per route-state. For contract-affecting changes:

- **New route**: add mocks for each state.
- **New state on existing route**: add mocks for the new state.
- **Modified state semantics**: update existing mocks.
- **Shared mock fixtures**: ensure shared fixtures remain consistent.

Mocks should be minimal and focused — they test the route's state handling, not extensive data shapes.

## The audit output

```markdown
## Browser-contract audit: <change name>

### Proposed change
<concrete description>

### Affected public route(s)
<enumerated — /l/explore, /l/profile/:identifier, /l/status/:id, /l/hashtag/:tag, etc.>

### Classification
<conforming / contract-extension / contract-evolution / contract-break (refuse)>

### Readiness semantics impact
- SSR shell change: <none / described>
- Browser data load change: <none / described>
- Terminal states change: <none / added state X / semantic shift on state Y>

### Testid vocabulary impact
- New testids: <list>
- Renamed testids: <refuse silent; if justified, list + contract update>
- Removed testids: <refuse silent; if evolution, list + rationale>

### Mock coverage impact
- New mocks added: <files>
- Modified mocks: <files>
- Shared fixtures consistency: <verified>

### Playwright spec impact
- New specs added: <files>
- Modified specs: <files>
- Specs still passing against mocks: <confirmed>
- Browser Live Smoke coverage: <no change / extends to new routes / updates to reflect new states>

### Documentation
- `docs/browser-validation-contract.md` updated: <yes in same commit / not required (conforming change)>
- Agent-first contract compatibility (`docs/drones/agent-first-facetheory-contract.md`): <preserved / extended>

### Test coverage
- Playwright spec against mocks: <pass>
- Node API harness (if adapter changes): <pass>
- Browser Live Smoke: <planned run against dev instances>

### Consumer impact
- External observers (humans browsing, API clients polling public routes): <preserved / advisory>
- Internal Playwright CI: <specs updated>

### Proposed next skill
<enumerate-changes if audit clean; scope-need if audit surfaces contract-break or scope growth; investigate-issue if audit reveals existing drift; route-upstream-issue if the root cause is upstream>
```

## Refusal cases

- **"Silently change the `/l/explore` route's URL shape; users won't notice."** Refuse. External observers, bookmarks, tests depend on URL stability.
- **"Rename a testid for clarity without updating the contract."** Refuse.
- **"Drop the `empty` state coverage for `/l/profile/:identifier` since most profiles have posts."** Refuse. Empty is a legitimate terminal state.
- **"Skip updating `docs/browser-validation-contract.md` for this conforming change."** Conforming changes don't require doc updates; contract extensions and evolutions do.
- **"Let a Playwright spec stay red because the flake is intermittent."** Refuse. Investigate the flakiness — may be upstream (route via `route-upstream-issue`) or sim-side timing.
- **"Change the readiness semantics of `/l/status/:id` so it reports ready on SSR shell render."** Refuse unless the new semantics are intentional + documented. Readiness semantics are the observer contract.
- **"Make `/l/hashtag/:tag` redirect to `/l/search?q=:tag` silently."** Refuse. URL stability is the contract.

## Persist

Append when the walk surfaces something worth remembering — a readiness-semantics decision (a new state added with rationale), a testid-vocabulary evolution, a mock-coverage pattern, a contract-clarification finding, an external-observer reality that shaped a decision. Routine audits aren't memory material. Five meaningful entries beat fifty log-shaped ones.

## Handoff

- **Audit clean, conforming** — invoke `enumerate-changes`.
- **Audit clean, contract-extension (new route / state / testid with doc update)** — invoke `enumerate-changes`.
- **Audit clean, contract-evolution (modifying existing)** — verify doc update + spec update + mock update planned; invoke `enumerate-changes`.
- **Audit surfaces contract-break** — refuse or escalate to the principal for governance authorization.
- **Audit reveals drift in current state** — route through `investigate-issue`, then back here.
- **Audit surfaces agent-first-contract question** — evaluate against `docs/drones/agent-first-facetheory-contract.md`; may loop with scope-need for product-shape clarification.
- **Audit surfaces FaceTheory framework awkwardness** in public-route rendering — `coordinate-framework-feedback`.