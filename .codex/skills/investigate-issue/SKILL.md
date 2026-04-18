---
name: investigate-issue
description: Use when a user reports a bug, regression, or unexpected behavior — a public route rendering wrong, a workflow panel failing, a vendored Greater component misbehaving, a GraphQL query returning unexpected shape, a Playwright test flaking, a CSP violation, a deploy / install anomaly, or an LLM-bot-account / research-sandbox issue. Runs before any fix is proposed. The first structural question is always "is this upstream?"
---

# Investigate an issue

Investigation comes before implementation. sim's distinctive investigation dimension is **"is this upstream?"** — when something feels wrong, the root cause is often in vendored Greater, in Lesser's GraphQL / REST, in host's registry APIs, in body's MCP endpoints, or in FaceTheory / Svelte / Apollo / Playwright. Before accepting a symptom as a sim bug, investigate the upstream possibility.

## Start with memory

Call `memory_recent` first. Scan for prior investigations — upstream-routing lessons, vendored-Greater drift patterns, Lesser-contract edge cases, host / body MCP surprises, CSP-enforcement subtleties, browser-validation-contract findings, LLM-bot-account / research-sandbox findings, milestone-workflow lessons, framework-awkwardness signals. sim is active; prior context accumulates fast.

## Capture the claim precisely

Record the user's report literally, then extract:

- **Symptom** — what was observed, verbatim where possible
- **Surface** — public route (`/l/explore` / `/l/profile/*` / `/l/status/*` / `/l/hashtag/*` / etc.) / authenticated workflow panel (soul request / identity binding / mint conversation / finalize signing / quarantine / host token / drones page) / vendored Greater component / adapter (GraphQL / REST auth) / test (Playwright browser / Node API harness) / CSP / build / install / deploy / research-sandbox (bot accounts / federation / moderation)
- **Reporting context** — human user? automated CI? live Browser Smoke? a specific LLM bot? an operator on one of the dev instances (`dev.simulacrum.greater.website` / `dev.theory.greater.website`)?
- **Versions involved** — sim commit, Greater pin (`components.json`), Lesser version (from `contracts/`), FaceTheory version, Svelte / Apollo / Playwright versions
- **Reproduction path** — URL, authenticated state, input shape, test command, CSP directive, install command
- **Expected vs actual**

## Ground the investigation

Your first structural questions are always:

1. **Is this upstream?** The single most important question. Possible upstream locations:
   - **Vendored Greater** (`src/lib/greater/`, `src/lib/faces/`) — bug in the vendored source
   - **Lesser GraphQL** or **Lesser REST auth** — contract surface returning unexpected shape
   - **host registry APIs** — soul-registry behavior
   - **body MCP endpoints** — MCP tool / resource / prompt shape
   - **FaceTheory** — runtime or SSR behavior
   - **Svelte 5 / Apollo / Playwright** — upstream framework
   If the root cause is upstream, `route-upstream-issue` walks the reporting discipline; sim does not patch locally.
2. **Is this a CSP violation?** Browser console reporting a blocked resource; CI's CSP validation failing. Route through `enforce-csp-and-graphql-first`.
3. **Is this a GraphQL-first discipline violation?** A new REST path proposed for data operations, or an existing REST path leaking non-auth data. Route through `enforce-csp-and-graphql-first`.
4. **Is this a browser-validation-contract drift?** Public-route readiness semantics or testid vocabulary divergence. Route through `validate-browser-contract`.
5. **Is this an agent-first-contract drift?** UX proposal that drifts toward Mastodon-clone. Flag during `scope-need`.
6. **Is this a deploy / install issue?** Route through `install-sim-instance`.
7. **Is this a research-mission issue?** (bot-content rendering, moderation-tool surfacing, federation posture). Investigate with research-mission context.
8. **Is it truly a sim bug?** Only accept this if the upstream possibility is ruled out or investigation confirms sim's code is at fault (not vendored, not adapter-passthrough).

## Evidence before hypotheses

Gather before theorizing:

- `git log` since last known-good state on `main`
- `git blame` on specific lines
- Playwright test output for the affected spec
- Node API harness output for the affected contract
- CSP violation report (if any) from browser console or CI
- Build output — Vite / pnpm install / typecheck / lint
- `components.json` — current Greater pin version
- `contracts/` — current Lesser contract snapshot version
- `facetheory.lesser.json` — current manifest state
- Live dev-instance behavior (through the user, via Browser Live Smoke or direct curl)
- For workflow panel issues: state-machine transitions, API calls made, responses received
- `query_knowledge` for cross-repo context (Greater docs, Lesser API reference, host / body contracts)

If `memory_recent` or `query_knowledge` returns an auth error, stop.

## The specialist-routing question

Every investigation answers: **which specialist skill, if any, should handle this?**

- **Upstream-routing** (vendored Greater / Lesser / host / body / FaceTheory / upstream framework) → `route-upstream-issue`
- **CSP violation / GraphQL-first violation** → `enforce-csp-and-graphql-first`
- **Browser-validation-contract drift** → `validate-browser-contract`
- **Deploy / install / runbook** → `install-sim-instance`
- **Framework awkwardness** (FaceTheory specifically) → `coordinate-framework-feedback`
- **Advisor-originated brief** → `review-advisor-brief`
- **None** — routes through standard `scope-need` → `enumerate-changes` → `plan-roadmap` → `implement-milestone` → `install-sim-instance`

## Rank hypotheses by evidence

List theories in descending order of support, **with upstream-possibility hypotheses considered first**:

1. **Hypothesis: upstream <repo> has <bug>** — evidence: <...>
2. **Hypothesis: sim is using <upstream surface> wrong** — evidence: <...>
3. **Hypothesis: sim-side bug in <area>** — evidence: <...>
4. **Hypothesis: deploy / environment issue** — evidence: <...>

For each:

- **Evidence for** — commits, logs, test output, state inspection
- **Evidence against** — what would be true if this were wrong
- **Verification step** — the cheapest test to prove or disprove

## Output: the investigation note

```markdown
## Reported symptom
<verbatim>

## Dimensions
- Surface: <public route / workflow panel / vendored Greater / adapter / test / CSP / build / install / research-sandbox>
- Reporting context: <human / CI / Browser Live Smoke / LLM bot / operator>
- Versions: <sim commit, Greater pin, Lesser pin, FaceTheory, Svelte, Apollo, Playwright>
- Reproduction: <...>

## Upstream-possibility assessment
- Vendored Greater: <possible / ruled out>
- Lesser GraphQL / REST auth: <possible / ruled out>
- host registry: <possible / ruled out>
- body MCP: <possible / ruled out>
- FaceTheory: <possible / ruled out>
- Upstream open-source (Svelte / Apollo / Playwright): <possible / ruled out>

## Specialist elevation check
<normal / elevate to route-upstream-issue / enforce-csp-and-graphql-first / validate-browser-contract / install-sim-instance / coordinate-framework-feedback / review-advisor-brief>

## What is definitely true
<verified facts — test output, state inspection, live-instance behavior>

## Fix-locus verdict
<upstream (route via route-upstream-issue) / sim using upstream wrong / sim-side bug / deploy-environment / research-sandbox config>

## Hypotheses (ranked, upstream-first)
1. <hypothesis> — evidence: <...>
2. <...>

## Verification step
<the one thing to run next>

## Proposed next skill
<investigate-issue again / fix directly / scope-need / route-upstream-issue / enforce-csp-and-graphql-first / validate-browser-contract / install-sim-instance / coordinate-framework-feedback / review-advisor-brief / none — cross-repo report>
```

## Persist

Append only when the investigation surfaces something worth remembering — an upstream-routing lesson, a vendored-Greater drift observation, a Lesser / host / body contract surprise, a CSP enforcement finding, a browser-validation-contract edge case, an agent-first-contract clarification, an LLM-bot-content sanitation pattern, a framework-awkwardness signal, an advisor-brief pattern. Routine "typo" findings aren't memory material. Five meaningful entries beat fifty log-shaped ones.

## Handoff rules

- **Upstream root cause** — `route-upstream-issue`.
- **CSP / GraphQL-first violation** — `enforce-csp-and-graphql-first`.
- **Browser-validation drift** — `validate-browser-contract`.
- **Deploy / install** — `install-sim-instance`.
- **FaceTheory-adjacent framework awkwardness** — `coordinate-framework-feedback`.
- **Advisor brief** — `review-advisor-brief`.
- **Small, contained sim-side fix** — standard `scope-need` → `implement-milestone` → `install-sim-instance`.
- **Upstream framework / community issue** — report; track in memory; no sim-side action beyond documentation.
