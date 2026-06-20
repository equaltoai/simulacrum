---
name: plan-roadmap
description: Use after enumerate-changes. Takes a flat enumerated change list and sequences it with dependencies, risks, and an install-rollout plan across the two dev-stage target instances (simulacrum + theory). Produces a roadmap document, not code or project state.
---

# Plan a roadmap

A flat enumerated list answers "what changes." A roadmap answers "in what order, with what risks, through which install targets, with what upstream coordination." This skill is the bridge.

sim's roadmaps are shaped by: the milestone-driven rhythm (M-series), the two-target install flow (`dev.simulacrum.greater.website` + `dev.theory.greater.website`), upstream-sync coordination with greater / lesser / host / body, and the research-mission context.

## Input required

An approved enumerated change list from `enumerate-changes`. Specialist-skill findings if applicable. Load prior context with `memory_recent`.

## Dependency analysis

For each enumerated item:

- **Hard dependencies** — items that must land first to compile or pass tests
- **Soft dependencies** — items that should land first for review coherence
- **Upstream dependencies** — contract-sync / pin bumps that unlock adapter / component work
- **Milestone dependencies** — items that belong together in a single milestone cut
- **Parallelizable siblings** — items with no ordering constraint
- **Research-experiment coordination** — if the work affects LLM-bot-account workflows or synthetic-threat research, coordinate timing

## Phase shape

Canonical phases for sim:

1. **Upstream-pin baseline** — Greater version bump (via `greater` CLI), Lesser contract-sync (`contracts/`), host / body pin bumps. Lands first so subsequent adapter and panel work uses updated surfaces.
2. **Adapter updates** — `src/lib/api/`, `src/lib/auth/`, `src/lib/realtime/`, `src/lib/tips/` adjustments for new upstream shape.
3. **Component / face updates** — re-vendored Greater source via CLI (no hand-editing).
4. **Workflow panel work** — `src/facetheory/panels/*` changes aligned with agent-first contract.
5. **Public route updates** — `src/facetheory/routing.ts` + route-level components, conforming to or evolving browser-validation contract.
6. **Tests** — Node API harness + Playwright specs + mocks.
7. **Styles** — CSS updates (CSP-compliant).
8. **Docs** — browser-validation contract, agent-first contract, runbook updates.
9. **Manifest / config** — `facetheory.lesser.json`, `components.json`, `vite.config.ts`, etc.
10. **CI / workflow** — `.github/workflows/` adjustments.

Not every roadmap uses all phases. A narrow bug fix is one phase. A new-workflow-panel milestone is five to seven.

More than seven phases suggests scope crept past the scoped need; revisit `scope-need`.

## Install rollout discipline

Every roadmap answers: **how does this reach the two dev-stage instances safely?**

### Phase A: CI gates

1. **Feature branch → `main`** via PR with required review
2. **CI gates**: pnpm install, lint, typecheck, Node API harness, Playwright browser specs, Vite build, CSP validation, contract-sync check
3. **Merge to `main`** once gates pass

### Phase B: Build and install to simulacrum dev

4. **Operator runs `pnpm build`** to produce FaceTheory-compatible bundle
5. **Operator runs `lesser client install`** against `dev.simulacrum.greater.website` with `facetheory.lesser.json` manifest
6. **Post-install verification**:
   - Public routes (`/l/explore`, `/l/profile/*`, `/l/status/*`) render per browser-validation contract
   - Authenticated workflow panels load correctly
   - CSP headers strict; no inline, no third-party
   - GraphQL subscriptions connect; realtime updates flow
   - LLM bot accounts function correctly (if the change affects their workflow)

### Phase C: Browser Live Smoke workflow

7. **Operator triggers Browser Live Smoke** (GitHub Actions manual workflow)
8. **Playwright specs run against live** `dev.simulacrum.greater.website`
9. **Fixed-data params** optionally set for deterministic content
10. **Address any regressions** — fix on `main` (after branch), re-install

### Phase D: Install to theory dev

11. **After simulacrum dev is stable**, operator installs to `dev.theory.greater.website`
12. **Same post-install verification**
13. **Browser Live Smoke against theory**

### Phase E: Post-install monitoring

14. **Watch for consumer reports** (internal team, research collaborators)
15. **Monitor any bot-account workflow regressions** for synthetic-threat experiments
16. **Monitor federation interoperability** — sim rendering federated content correctly

## The upstream-sync release-timing consideration

Upstream-sync changes (chore/update-greater, chore/lesser-sync, etc.) follow specific timing:

- **Routine Greater / Lesser / host / body pin bumps** go through normal CI and install flow.
- **Breaking upstream changes** may require sim-side adapter / panel / public-route work; those land in the same roadmap / milestone as the pin bump.
- **Pre-release upstream coordination** may warrant installing to one dev instance first (simulacrum for experimentation) before broader sim rollout.

## Risk register

- **Known unknowns** — things you know you don't know
- **Upstream-regression risks** — sim's CI may not catch every upstream drift; Browser Live Smoke helps but isn't infallible
- **Vendored-Greater-drift risks** — hand-editing prevention; ensure CLI-only updates
- **CSP-regression risks** — silently-loosened CSP can slip past CI if the check is stale
- **GraphQL-first regression risks** — a REST path added for data sneaks in
- **Browser-validation-contract drift risks** — public-route change without doc update
- **Agent-first-contract drift risks** — Mastodon-clone aesthetics creeping in
- **Install-workflow risks** — `lesser client install` flow anomalies, manifest mismatch, deploy-receipt loss
- **Research-sandbox risks** — LLM bot workflow regressions, content-sanitation gap
- **Federation risks** — sim rendering federated content from unexpected peer shapes
- **Wallet-signing risks** (TipSplitter flows) — EIP-1193 / viem compatibility
- **Dependency-bump risks** — Svelte 5 / Apollo / Playwright / SvelteKit major-version changes require care
- **Rollback risks** — reinstall prior build; `components.json` pin rollback; contract rollback

A risk with no mitigation is a blocker.

## Output format

```markdown
# Roadmap: <scoped-need name>

## Goal
<one paragraph — what the roadmap delivers and why>

## Classification
<facetheory-rewrite-milestone / upstream-sync / csp-graphql-compliance / deploy-install / research-sandbox / framework-feedback / test-coverage / docs / dependency-maintenance / bug-fix>

## Milestone identifier (if applicable)
<Mx.y>

## Surfaces affected
<enumerated from change list>

## Upstream coordination
- greater-components: <required / not required, pin bump version>
- lesser: <required / not required, contract-sync version>
- lesser-host: <required / not required, what>
- lesser-body: <required / not required, what>
- lesser-soul: <usually not required>

## Theory Cloud framework coordination
- FaceTheory: <required / not required, what>

## Phases

### Phase 1: <name>
- Items: <enumerated item numbers>
- Dependencies: <what must land first>
- Risks: <bullet list>

### Phase 2: <name>
...

## Install rollout plan

### CI gates (on PR)
- pnpm install / lint / typecheck / api:test / browser:test / build / CSP check

### Build + install to simulacrum dev
- Command: `pnpm build && lesser client install <manifest> --target dev.simulacrum.greater.website ...`
- Post-install verification: <public routes, workflow panels, CSP, subscriptions, bot workflows>

### Browser Live Smoke (simulacrum)
- GitHub Actions workflow: Browser Live Smoke
- Fixed-data params: <if applicable>

### Install to theory dev
- Command: `... --target dev.theory.greater.website ...`
- Post-install verification: <same>

### Browser Live Smoke (theory)

### Post-install monitoring
- Consumer reports: <...>
- Research-sandbox health: <...>

## Rollback plan
- Reinstall prior build: <command>
- components.json / contracts/ / facetheory.lesser.json rollback: <approach>

## AGPL posture
- No proprietary blobs: <confirmed>
- Dependency license vetting: <completed if applicable>

## Research-mission impact
- LLM bot account workflows affected: <no / yes — description>
- Content sanitation / moderation posture affected: <no / yes>
- Federation posture affected: <no / yes>

## Advisor-brief authorization (if applicable)
- Brief source: <advisor identity, email provenance>
- Principal's authorization: <scope, date, notes>

## Open questions
<unresolved>
```

## Persist

Append when the roadmap exposes a recurring risk pattern — an upstream-sync coordination lesson, a CI-gate gap that Browser Live Smoke caught, a bot-workflow regression, an install-flow subtlety. Routine roadmaps aren't memory material. Five meaningful entries beat fifty log-shaped ones.

## Handoff

- If approved, invoke `create-github-project` if the roadmap warrants tracked kanban.
- If the roadmap reveals upstream coordination not yet happening (upstream repos unsynced, sibling stewards uninformed), pause and surface.
- If the roadmap reveals scope growth, revisit `scope-need`.
- If the roadmap is a CSP / browser-contract-regression response requiring compressed cadence, ensure authorization is explicit.