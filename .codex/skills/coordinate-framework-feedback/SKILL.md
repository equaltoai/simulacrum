---
name: coordinate-framework-feedback
description: Use when building or maintaining sim surfaces framework awkwardness — a FaceTheory SSR / routing / hydration pattern gap, a Svelte 5 rune limitation, an Apollo Client / graphql-ws edge case, a Playwright specifics gap. Produces a cleanly-shaped upstream signal rather than a local patch. sim's distinctive context — agent-first UX + strict CSP + vendored-Greater integration + async public routes + research-sandbox — makes its framework-consumption feedback high-signal.
---

# Coordinate framework feedback

sim consumes **FaceTheory** (canonical rewrite runtime) + **Svelte 5** + **Apollo Client** + **graphql-ws** + **Playwright** + **SvelteKit** (legacy, retiring). When consumption is awkward under sim's distinctive conditions (agent-first UX, strict CSP, vendored-Greater integration, async public routes with readiness semantics, research-sandbox context), the friction is targeted upstream signal.

This skill handles the signal cleanly. It separates "sim is using the framework wrong" from "the framework has a genuine gap under sim's constraints," and produces a shaped report for the appropriate upstream.

## The frameworks sim consumes

- **FaceTheory v0.3.1** — canonical rewrite runtime (SSR / routing / hydration, handlers, entry-server / entry-client, workflow-panel pattern). **Primary Theory Cloud framework.** Steward: Theory Cloud FaceTheory steward.
- **Svelte 5 (+ runes)** — component model. Upstream open-source; not Theory Cloud.
- **Apollo Client** — GraphQL client. Upstream open-source.
- **graphql-ws** — GraphQL subscriptions. Upstream open-source.
- **Playwright** — browser testing. Upstream open-source.
- **SvelteKit** — legacy routes (retiring). Upstream open-source.
- **Vite** — build toolchain. Upstream open-source.
- **TypeScript / pnpm** — toolchain. Upstream.

The **FaceTheory** relationship is the primary Theory-Cloud-framework-consumer concern. Upstream-open-source feedback is community-level.

Overlap with `route-upstream-issue`: both skills handle upstream reporting. The distinction:

- **`route-upstream-issue`** — a *bug* or *gap* in a specific upstream repo (vendored Greater / Lesser / host / body / soul / or a framework)
- **`coordinate-framework-feedback`** — specifically framework-level consumption friction that may warrant evolution of the framework itself, rather than a bug in a specific implementation

They sometimes coincide (a FaceTheory bug is reported via `route-upstream-issue`; a FaceTheory gap warrants `coordinate-framework-feedback`). Use judgment; both paths end with the user opening an upstream issue.

## When this skill runs

Invoke when:

- A FaceTheory SSR / routing / hydration pattern doesn't fit sim's agent-first UX cleanly
- A FaceTheory pattern forces CSP-awkward output (inline scripts / styles by default)
- A FaceTheory pattern forces browser-validation-contract-awkward shapes
- A Svelte 5 rune-system limitation affects idiomatic panel or route implementation
- Apollo Client / graphql-ws behavior doesn't fit sim's adapter patterns
- Playwright specifics limit browser-validation-contract spec clarity
- SvelteKit legacy behavior interferes with the FaceTheory-rewrite transition
- `scope-need` flags a change as framework-awkward
- `investigate-issue` surfaces a root cause in a framework (beyond a bug — an actual gap)

## Preconditions

- **Concrete awkwardness description.** "FaceTheory is hard" is too vague; "FaceTheory's default SSR output injects an inline `<script>` tag for hydration context, which violates sim's strict CSP; we want a CSP-compliant alternative that emits a `<script type='application/json' id='hydration-state'>` for the client to read" is concrete.
- **Idiomatic attempt captured** — what would the code look like if framework supported it.
- **Current workaround captured** — cost of workaround.
- **MCP tools healthy**, `memory_recent` first.

## The three-step walk

### Step 1: Is sim using the framework wrong?

Before assuming framework limitation:

- **Idiomatic FaceTheory usage** — consult FaceTheory docs, `apps/docs/` FaceTheory integration guide, `query_knowledge` against FaceTheory knowledge base.
- **Alternative patterns** — different expression?
- **Recent framework versions** — pinned v0.3.1 may lag current capability.
- **Svelte / Apollo / Playwright community patterns** — check upstream docs and issues for an idiomatic answer.

If sim's usage is bent rather than idiomatic, the fix is local: reshape sim's code. Proceed to `scope-need` for the local change.

### Step 2: Is the framework genuinely limiting under sim's constraints?

sim's constraints are distinctive:

- **Agent-first UX** (workflow panels, soul-aware state machines)
- **Strict CSP** (no inline anything)
- **Vendored-Greater integration** (CLI-installed source, not package imports)
- **Async public routes with readiness semantics** (SSR shell → browser data load → terminal state)
- **Browser-validation-contract** (public-facing spec)
- **Research-sandbox mission** (LLM bot accounts, content sanitation)

If the framework doesn't accommodate these cleanly, the signal is targeted.

Characterize:

- **Concern concretely** — what sim is trying to do, under which constraint
- **Ideal framework support** — what would FaceTheory / Svelte / Apollo / Playwright / SvelteKit offer cleanly
- **Current gap** — specifically what's missing
- **Workaround shape** — what sim currently does, cost

### Step 3: Shape the signal

For **FaceTheory** (Theory Cloud):

```markdown
## Framework-feedback signal: <short name>

### Target framework
FaceTheory

### Framework version in use
v0.3.1

### The concern (under sim's agent-first + strict-CSP + async-public-routes + vendored-Greater constraints)
<one-to-two sentences; note sim-specific constraint context>

### The idiomatic code sim would write if FaceTheory supported it
```<language>
// Code sketch
```

### The current workaround in sim (or "blocked")
```<language>
// Current code, comments on why awkward
```

### Cost of the workaround
- CSP compliance: <...>
- Browser-validation-contract alignment: <...>
- Code complexity: <...>
- Maintenance drag: <...>

### Scope of the gap
- sim-specific (agent-first + CSP + async-public-routes + vendored-Greater stress test): <yes>
- Likely broader (other component-consumer-heavy FaceTheory consumers would benefit): <yes / evaluate>

### Proposed next step
<FaceTheory steward scopes via their own scope-need; sim does not patch FaceTheory locally>
```

For **Svelte 5 / Apollo / graphql-ws / Playwright / SvelteKit / Vite / TypeScript** (community-level upstream):

Similar structure but targeted at the community (GitHub issue / RFC on the upstream repo). sim's role: author a clear bug report or RFC, reference upstream discussion if any, and track response.

Overlaps with `route-upstream-issue` for upstream-open-source targets; use whichever skill's structure fits the report better.

## The explicit refusal to patch locally

Absolute:

- **No monkey-patches** to FaceTheory / Svelte / Apollo / graphql-ws / Playwright / SvelteKit / Vite / TypeScript in sim's tree
- **No forked copies** of framework code
- **No "temporary" framework overrides**
- **No vendoring** framework code into sim's `src/`

If the framework genuinely blocks critical work, escalate to Aron. Forking / patching is scope-level, not steward-level.

## The continuity discipline

Signals accumulate:

- **Record in memory** — target framework, concern, signal sent, date
- **Track response** — scoped need, feature release, decline, redirect
- **Revisit on framework version bumps** — when sim bumps FaceTheory / Svelte / Apollo / Playwright / SvelteKit, check whether pending signals are addressed
- **Duplicate-signal discipline** — check memory before re-sending

## Refusal cases

- **"Patch FaceTheory locally; we need this to ship."** Refuse.
- **"Fork Svelte 5 to add a rune pattern we need."** Refuse; engage Svelte community.
- **"Vendor a Playwright plugin with modifications."** Refuse.
- **"Send a framework-feedback signal for every minor awkwardness."** Genuine gaps only.
- **"Copy a FaceTheory construct into sim's `src/` and modify it."** Refuse.
- **"Framework isn't responsive; let's fork."** Escalate to Aron.

## Persist

Append every meaningful framework-feedback signal — target, concern, date, response if received. High-signal memory material because sim stress-tests FaceTheory in ways other consumers don't; the feedback channel is distinctive value.

Five meaningful entries is the right scale.

## Handoff

- **Signal shaped and sent** — stop. Record and continue sim's local work (via documented workaround) through normal pipeline.
- **Signal reveals sim is using the framework wrong** — `scope-need` for local change.
- **Signal is duplicate** — don't re-send; update memory.
- **Signal reveals a framework bug (not gap)** — may overlap with `route-upstream-issue`; use whichever skill's report structure fits.
- **Signal to upstream open-source** — community issue / RFC path; sim continues with documented workaround.
