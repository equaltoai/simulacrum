---
name: enumerate-changes
description: Use after scope-need and relevant specialist skills approve work. Takes the scoped-need document and produces a flat, ordered list of discrete changes required. Each change is scoped to be a single commit aligned with sim's milestone-driven rhythm.
---

# Enumerate changes

A scoped need describes *what* is being delivered. An enumerated change list describes *what must move in the repo*. This skill is the transformation.

sim's change lists are typically small, milestone-scoped: a bug fix is one to two commits, a milestone-completing feature is three to seven, an upstream-sync is often two (pin bump + adapter adjustments). The single-commit rule holds.

## Input required

An approved scoped-need document from `scope-need`. Specialist-skill findings (from `route-upstream-issue`, `enforce-csp-and-graphql-first`, `validate-browser-contract`, `install-sim-instance`, `coordinate-framework-feedback`, `review-advisor-brief`) if applicable. Load prior context with `memory_recent`.

## The walk

Walk the scoped need against every surface of sim:

1. **`src/facetheory/`** — canonical rewrite runtime
   - `entry-server.ts` / `entry-client.ts` — SSR / hydration entry
   - `routing.ts` — route definitions
   - `panels/*` — workflow panels (soul request / identity binding / mint conversation / finalize signing / quarantine / host token / drones page / etc.)
2. **`src/routes/*`** — legacy SvelteKit routes (retiring; not extended)
3. **`src/lib/api/*`** — GraphQL client, queries, mutations, adapters
4. **`src/lib/auth/*`** — PKCE + token storage (REST only for auth, per policy)
5. **`src/lib/realtime/*`** — GraphQL subscriptions (graphql-ws)
6. **`src/lib/components/*`** — sim-side app components + vendored Greater surfaces
7. **`src/lib/greater/*`** — vendored Greater primitives / icons / tokens / adapters (managed via `greater` CLI; **do not hand-edit**)
8. **`src/lib/faces/*`** — vendored Greater face compositions (**do not hand-edit**)
9. **`src/lib/styles/*`** — CSS (CSP-compliant; no inline)
10. **`src/lib/tips/*`** — TipSplitter integration + EIP-1193 wallet utilities
11. **`contracts/*`** — synced Lesser GraphQL + OpenAPI (source: `../lesser/docs/contracts`)
12. **`docs/`** — operator / developer guides
    - `docs/drones/agent-first-facetheory-contract.md` (canonical product contract — changes are deliberate contract evolution)
    - `docs/browser-validation-contract.md` (frozen public-route spec — changes conform)
    - `docs/runbook.md` (deploy procedure)
13. **`tests/api/*`** — Node-based GraphQL / REST harness
14. **`tests/browser/*`** — Playwright specs + mocks for public routes
15. **`scripts/*`** — automation
16. **`components.json`** — Greater CLI manifest (pinned version)
17. **`facetheory.lesser.json`** — Lesser install manifest
18. **`package.json` / `pnpm-lock.yaml`** — dependencies
19. **`vite.config.ts` / `svelte.config.js` / `tsconfig.json` / `playwright.config.ts`** — toolchain config
20. **`AGENTS.md` / `README.md`** — governance + overview. Rarely touched.

A change that touches none of these isn't really a change.

## The ordering rules

1. **Test-first for bug fixes.** Playwright or Node-API-harness regression test first (fails against current code), then fix. Especially important for browser-validation-contract preservation and adapter-side fixes.
2. **Contract pins (Greater / Lesser / host / body) land first** in upstream-sync PRs, then adapter-code updates follow in subsequent commits (or same commit if scope is small).
3. **Adapter-code changes land before workflow-panel / public-route changes that consume them.** Dependency direction: contracts → adapters → panels / routes.
4. **Component / face additions land before panels that compose them.**
5. **CSP-affecting changes land isolated** for auditability.
6. **Browser-validation-contract updates** (if any) land in the same commit as the public-route change they describe, or immediately preceding.
7. **Agent-first-contract updates** (if any) land with the panel / workflow they describe.
8. **Test additions ride with the feature they cover.**
9. **Playwright mocks ride with the spec that uses them.**
10. **Dependency bumps land in isolated commits** for bisect clarity.
11. **Vite / Svelte / TypeScript config changes land isolated.**
12. **Vendored Greater source (`src/lib/greater/`, `src/lib/faces/`) is updated only via `greater` CLI, never hand-edited.** A change that wants to modify vendored source is an upstream routing concern via `route-upstream-issue`.

## The mission-scope rule

Every enumerated item must answer: **is this sim-mission work, or should it route upstream / to a sibling?**

- **In-mission**: facetheory-rewrite milestone, upstream-sync (contracts / pins), CSP-compliance, GraphQL-first preservation, browser-validation-contract conformance, deploy / install, research-sandbox tooling, framework-feedback, test-coverage, dependency maintenance, docs.
- **Should route upstream**: vendored-Greater patch (→ greater-components), new GraphQL field / mutation / subscription (→ lesser), new REST auth endpoint (→ lesser), registry behavior change (→ lesser-host), MCP tool change (→ lesser-body), namespace change (→ lesser-soul), FaceTheory runtime / routing (→ FaceTheory), Svelte / Apollo / Playwright community issue.

If any item routes upstream, stop the sim-side enumeration for that item and invoke `route-upstream-issue`.

## The upstream-integrity rule

Every enumerated item must answer: **does this modify vendored Greater source (`src/lib/greater/`, `src/lib/faces/`) or pinned contract files (`contracts/`)?**

- **`src/lib/greater/` / `src/lib/faces/`**: refuse hand-edits. These are vendored via `greater` CLI; changes happen by bumping the pin in `components.json` and re-running the CLI to copy fresh source.
- **`contracts/`**: changes are upstream-sync events, not hand-edits. Fresh snapshot copied from `../lesser/docs/contracts/` at the target version.

Hand-editing either is refused.

## The CSP-preservation rule

Every enumerated item must answer: **does this affect CSP compliance?**

- **No** — default.
- **Yes — CSP-compliant** (new CSS file, new Svelte reactive binding using tokens, external JS file) — proceed.
- **Yes — CSP-loosening** (inline `<script>`, inline `<style>`, inline event handler, runtime-computed `style=""` from arbitrary CSS, third-party script origin, `unsafe-eval`) — refuse unless explicitly authorized via `enforce-csp-and-graphql-first` walk + governance event.

## The GraphQL-first rule

Every enumerated item must answer: **does this add or extend a REST path?**

- **No** — default.
- **Yes — auth path only** (PKCE flow, token storage, etc.) — proceed; this is Lesser's policy.
- **Yes — data operation** — refuse; extend Lesser's GraphQL schema upstream instead. Route via `route-upstream-issue` → lesser.

## The browser-validation-contract rule

Every enumerated item must answer: **does this touch a public route's shape, readiness semantics, or testid vocabulary?**

- **No** — default.
- **Yes — conforms to contract** — proceed; verify tests still pass.
- **Yes — proposes contract evolution** — update `docs/browser-validation-contract.md` in the same commit; `validate-browser-contract` walk referenced.
- **Yes — drifts from contract without updating doc** — refuse.

## The agent-first-contract rule

Every enumerated item must answer: **does this drift toward Mastodon-clone aesthetics (timeline-first, Mastodon tab bars, reverse-chronological primacy)?**

- **No** — default.
- **Yes** — refuse; flag during `scope-need` revisit.

## The single-commit rule

Each enumerated item fits in one commit:

- One logical intent
- `pnpm install` succeeds
- `pnpm lint` passes
- `pnpm typecheck` passes
- `pnpm api:test` (Node API harness) passes
- `pnpm browser:test` or equivalent (Playwright + mocks) passes
- `pnpm build` succeeds
- CSP validation passes (on built bundle)
- No commit depends on a later item to compile or pass tests

## Output format

```markdown
### N. <imperative title>

- **Paths**: <files or directories touched>
- **Surface**: <facetheory-runtime / facetheory-panel / legacy-svelte-kit / api-client / auth / realtime / components / vendored-greater (via CLI bump) / faces (via CLI bump) / styles / tips / contracts / docs / tests / scripts / manifest / deps>
- **Classification**: <facetheory-rewrite-milestone / upstream-sync / csp-graphql-compliance / deploy-install / research-sandbox / framework-feedback / test-coverage / docs / dependency-maintenance / bug-fix>
- **Upstream-routing check**: <sim-local / belongs-upstream (refuse + route)>
- **CSP impact**: <none / compliant addition / loosening (refuse without governance)>
- **GraphQL-first impact**: <none / auth-only REST / data-REST (refuse, route upstream)>
- **Browser-validation-contract impact**: <none / conforms / evolves (doc updated)>
- **Agent-first-contract impact**: <none / contract-aligned extension / Mastodon-clone drift (refuse)>
- **Vendored / pinned source**: <not touched / updated via CLI pin bump / contract-sync from upstream>
- **Acceptance**: <one sentence>
- **Validation**: <pnpm lint / typecheck / api:test / browser:test / build / CSP check>
- **Conventional Commit subject**: `<type(scope): subject>` — preferred: `feat: milestone M<x>` for milestone-completing commits
- **Milestone**: `M<x>` (if applicable)
```

## Self-check before handing off

- [ ] Every item is in-mission (not "belongs upstream")
- [ ] No item patches vendored Greater source in place
- [ ] No item adds a data-REST path
- [ ] No item loosens CSP silently
- [ ] No item drifts from browser-validation contract silently
- [ ] No item drifts toward Mastodon-clone aesthetics
- [ ] Contract pins / Greater pins updated via proper mechanism (not hand-edit)
- [ ] Bug fixes follow test-first ordering
- [ ] Vendored-source updates via CLI, not hand-edit
- [ ] CSP-affecting changes isolated
- [ ] Dependency bumps isolated
- [ ] Docs ride with behavior changes (browser-validation contract, agent-first contract, runbook)
- [ ] Every item has test / build / CSP validation
- [ ] No hardcoded secrets, wallet keys, bot-account credentials
- [ ] No inline scripts / styles / event handlers
- [ ] No AGPL-incompatible dependencies introduced
- [ ] Full list satisfies scoped need's success criteria

## Persist

Append when enumeration surfaces something unusual — a vendored-source pin-bump subtlety, a contract-sync ordering edge case, a workflow-panel dependency gotcha, a CSP-compliance pattern, a milestone-split decision. Routine enumerations aren't memory material. Five meaningful entries beat fifty log-shaped ones.

## Handoff

Invoke `plan-roadmap` to sequence the flat list into phases and identify the install-rollout plan.
