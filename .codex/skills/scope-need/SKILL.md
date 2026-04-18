---
name: scope-need
description: Use when a user brings a new capability, feature request, or enhancement need for sim in vague terms. Interviews conversationally and produces a scoped-need document. Applies Gate 1 (sim-mission alignment with upstream-first bias), Gate 2 (narrowest scope), Gate 3 (specialist routing). Most scopings that feel like "add a feature" resolve to either upstream routing or explicit milestone framing.
---

# Scope a need

A need arrives fuzzy. A feature arrives sharp — or, for sim, often with a "this belongs upstream" verdict. This skill is the conversation that turns fuzzy into sharp, with three specific filters: sim-mission alignment (with strong upstream-routing bias), narrowest-scope discipline, specialist-skill routing.

## Your posture

You are interviewing, not pitching. sim is a frontend installed into lesser instances, validating the upstream stack while enforcing strict CSP, GraphQL-first, browser-validation-contract, and agent-first-UX discipline. Scope is bounded.

The scoping question is three-part:

1. **Is this sim-mission work, or does it belong upstream (or in a sibling repo)?** The upstream-first reflex means many proposals that *feel* like sim work actually belong in greater (new component), lesser (new GraphQL field), host (new registry behavior), body (new MCP tool), or the FaceTheory / Svelte community.
2. **If it's in sim, what is the narrowest scope that preserves upstream-first routing, strict CSP, GraphQL-first, browser-validation contract, agent-first contract, research-mission integrity, AGPL coverage, and idiomatic FaceTheory consumption?**
3. **Does the change touch CSP / GraphQL-first, the browser-validation contract, upstream routing, deploy / install, or an advisor-dispatched brief? If yes, route to the appropriate specialist skill before enumeration.**

The default for Gate 1 for many proposals is **"belongs upstream"**. Redirect (to greater, lesser, host, body, or a FaceTheory / Svelte issue) is the common outcome.

## Start with memory and the architecture

- **Read `README.md`, `AGENTS.md`, `docs/drones/agent-first-facetheory-contract.md`, `docs/browser-validation-contract.md`, `docs/runbook.md`** for canonical context.
- `memory_recent` — has this or adjacent work been scoped?
- `query_knowledge` — do upstream Greater / Lesser / host / body / FaceTheory already cover this concept?

If tools unavailable, surface and ask the user to re-auth.

## The interview

Ask, one or two at a time:

1. **Who is asking and why now?** Aron-direct / advisor-dispatched / upstream-regression surfaced by tests / operator on a dev instance / research experiment?
2. **What problem does it solve?**
3. **Which surface does it touch?** Public route (`/l/*`) / workflow panel / vendored Greater integration / GraphQL adapter / REST-auth adapter / realtime subscription / test harness / CSP / deploy / runbook / research-sandbox tooling / docs.
4. **Does this feel like something upstream should handle?** If yes, identify which upstream repo:
   - New / modified component → `greater-components`
   - New / modified GraphQL field / mutation / subscription → `lesser`
   - New / modified REST auth endpoint → `lesser`
   - New / modified registry API → `lesser-host`
   - New / modified MCP tool → `lesser-body`
   - Namespace / JSON-LD semantic → `lesser-soul`
   - FaceTheory runtime / routing pattern → `FaceTheory` steward
   - Svelte / Apollo / Playwright / SvelteKit → upstream open-source community
5. **If genuinely sim-local, is this a milestone-worthy contract extension?** sim work usually converges toward the agent-first contract or browser-validation contract.
6. **Does this touch CSP?** Any proposal involving inline anything or third-party origins.
7. **Does this propose a new REST path for data?** If yes, refuse → route upstream to lesser.
8. **Does this affect public-route contract?** If yes, `validate-browser-contract` walk.
9. **Does this drift toward Mastodon-clone?** Evaluate against agent-first contract.
10. **What does success look like?** Observable, testable.
11. **What is explicitly out of scope?**

## The three gating questions

### Gate 1: Is this sim-mission work?

Six possible verdicts:

1. **Yes — FaceTheory-rewrite milestone / agent-first contract extension.** A new or refined workflow panel, a new public route, a browser-validation-contract extension. Route through `validate-browser-contract` or normal enumerate.
2. **Yes — upstream-sync (vendored Greater / pinned Lesser / host / body version bump).** Accepted; may include adapter adjustments for the new upstream shape.
3. **Yes — CSP / GraphQL-first compliance fix.** Route through `enforce-csp-and-graphql-first`.
4. **Yes — deploy / install / runbook improvement.** Route through `install-sim-instance`.
5. **Yes — research-sandbox tooling (bot-content sanitation, moderation surfacing, federation posture config, LLM bot workflow).** Accepted; evaluate against research mission.
6. **Yes — framework-feedback (FaceTheory awkwardness).** Route through `coordinate-framework-feedback`.
7. **Yes — test-coverage / CI / dependency maintenance / docs.** Accepted.
8. **No — belongs upstream.** The most common non-acceptance verdict. Redirect document names the upstream repo + issue the user will open there.

### Gate 2: What is the narrowest possible scope?

If Gate 1 passed:

Prefer:

- Milestone-scoped work that aligns with the agent-first contract
- Upstream-sync updates that don't expand adapter-side logic beyond what the pinned contract supports
- CSP-compliant additions (external CSS / JS files, CSS custom properties, Svelte reactive bindings)
- New public routes that conform to browser-validation contract from day one
- Test additions that lock in current behavior without expanding product surface
- Dependency bumps within current major versions

Avoid:

- Patching vendored Greater in `src/lib/greater/` (refuse)
- New REST paths for data (refuse)
- Inline scripts / styles / event handlers (refuse)
- Third-party script origins (refuse)
- Silent browser-validation-contract drift (refuse)
- Drift toward Mastodon-clone UX
- Framework patches

### Gate 3: Specialist routing

Specialist skills run before enumeration when the change touches:

- **Upstream routing** (root cause in vendored Greater / Lesser / host / body / FaceTheory / upstream framework) → `route-upstream-issue`
- **CSP or GraphQL-first** → `enforce-csp-and-graphql-first`
- **Browser-validation contract** (public-route shape) → `validate-browser-contract`
- **Deploy / install / runbook** → `install-sim-instance`
- **FaceTheory-adjacent framework awkwardness** → `coordinate-framework-feedback`
- **Advisor-dispatched brief** → `review-advisor-brief`

## Output: the scoped-need document

### For Gate 1 verdict "sim-mission":

```markdown
# Scoped Need: <short name>

## Background
<one paragraph>

## Driver
<Aron-direct / advisor-dispatched / upstream-regression-from-tests / operator / research-experiment>

## Problem
<what is broken, missing, or painful today>

## Surface affected
<public route / workflow panel / adapter / realtime / test / CSP / deploy / runbook / research-sandbox / docs>

## Classification
<facetheory-rewrite-milestone / upstream-sync / csp-graphql-compliance / deploy-install / research-sandbox / framework-feedback / test-coverage / docs / dependency-maintenance>

## Narrowest-scope proposal
<smallest change>

## What this need explicitly does not cover
<bounded>

## Success criteria
<observable, testable — Playwright spec passes, Node API harness passes, Live Smoke green>

## Specialist routing
- Upstream routing: <none / required via route-upstream-issue>
- CSP / GraphQL-first: <not touched / walk via enforce-csp-and-graphql-first>
- Browser-validation contract: <not touched / walk via validate-browser-contract>
- Deploy / install: <not touched / walk via install-sim-instance>
- Framework consumption: <idiomatic / signal via coordinate-framework-feedback>
- Advisor brief: <n/a / review via review-advisor-brief>

## Agent-first contract compatibility
<preserved / extended per contract>

## Research-mission compatibility
<preserved / extended>

## AGPL posture
<no change / confirmed AGPL-compatible>

## Milestone identifier (if applicable)
<Mx.y>

## Open questions
<unresolved>
```

### For Gate 1 verdict "belongs upstream":

```markdown
# Redirect upstream: <short name>

## Background
<what was asked>

## Why this doesn't belong in sim
<sim is a consumer-validator + agent-first-UX + research-sandbox; this is X, which belongs upstream in Y>

## Upstream owner
<greater-components / lesser / lesser-host / lesser-body / lesser-soul / FaceTheory / upstream open-source Svelte / Apollo / Playwright / SvelteKit>

## Path for the requesting user
<open issue on upstream repo; sim will adopt the upstream change when released>

## Sim-side follow-up (if any)
<no sim-side work until upstream releases / sim will upstream-sync when release cuts>

## Recommended next step
<specific handoff to upstream>
```

## Persist before handoff

Append only if scoping surfaces a recurring pattern — an upstream-routing category that keeps coming up, a milestone-shape observation, a contract-clarification finding. Routine completions aren't memory material. Five meaningful entries beat fifty log-shaped ones.

## Handoff

- **In-sim, browser-validation-touching** — `validate-browser-contract`.
- **In-sim, CSP / GraphQL-first touching** — `enforce-csp-and-graphql-first`.
- **In-sim, deploy / install** — `install-sim-instance`.
- **In-sim, framework-feedback** — `coordinate-framework-feedback`.
- **In-sim, none of the above** — `enumerate-changes`.
- **Advisor-dispatched scope** — `review-advisor-brief` already ran; authorization included.
- **Upstream redirect** — redirect document is the handoff.
- **Resolved to "no change needed"** — record and stop.
- **User defers** — record and stop.
