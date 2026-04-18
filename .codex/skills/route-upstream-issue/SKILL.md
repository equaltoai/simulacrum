---
name: route-upstream-issue
description: Use when a bug or gap surfaces in sim that traces to vendored Greater code, pinned Lesser contract, host registry API, body MCP shape, FaceTheory behavior, or upstream open-source framework. Walks "is this upstream?" reasoning, classifies the upstream home, and produces a clean upstream report (GitHub issue draft) rather than a sim-local patch. sim's distinctive discipline.
---

# Route an upstream issue

sim's single most distinctive discipline is **upstream-first routing**. When a bug or gap surfaces, the reflex is not "patch it locally" — it is "where upstream does this belong?" This skill walks the reasoning, classifies the upstream home, and produces a clean upstream report (typically a GitHub issue on the appropriate sibling repo) that the user can then open with the upstream steward.

Local patches to vendored Greater source, pinned Lesser contracts, host / body responses, or upstream framework code are refused. The value sim brings to the stack is *discovering and routing upstream issues*, not *masking them with local workarounds*.

## The upstream homes (memorize)

- **`greater-components`** — vendored Greater source in `src/lib/greater/` and `src/lib/faces/`. Bugs or gaps in components go here.
- **`lesser`** — pinned Lesser GraphQL schema (`contracts/graphql-schema.graphql`) + pinned OpenAPI (`contracts/openapi.yaml`). Unexpected API shape, field missing, wrong response type, error envelope drift — all upstream at lesser.
- **`lesser-host`** — registry APIs consumed by sim's soul workflows. Behavior change, unexpected response, new-registry-endpoint need.
- **`lesser-body`** — MCP endpoints consumed by sim's agent workflows. MCP contract shape, new tool need.
- **`lesser-soul`** — namespace (`spec.lessersoul.ai/ns/agent-attribution/v1`). Very rare upstream route; only for namespace-semantic concerns.
- **FaceTheory** (Theory Cloud steward) — runtime, SSR / hydration, routing patterns. Framework awkwardness signal (may overlap with `coordinate-framework-feedback`).
- **Upstream open-source community** — Svelte 5, Vite, Apollo Client, graphql-ws, Playwright, SvelteKit. Not Theory Cloud; community issue path.

## When this skill runs

Invoke when:

- `investigate-issue` identifies the fix-locus as upstream
- A bug is reported in a vendored Greater component
- An unexpected Lesser GraphQL / REST response surfaces
- host's registry returns unexpected shape or behavior
- body's MCP surface surprises
- FaceTheory pattern usage surfaces a genuine limitation
- Svelte / Apollo / Playwright / SvelteKit exhibit a bug or missing feature

## Preconditions

- **The bug or gap is described concretely.** "Greater is broken" is too vague; "when `<TimelineCard>` receives a Lesser v1.1.28-shape status response with the new `edited_at` field set to null, it renders 'edited null' instead of gracefully omitting the edit indicator" is concrete.
- **MCP tools healthy**, `memory_recent` first — upstream-routing decisions accumulate.
- **Confirmation that the bug is upstream** (not "sim is using the upstream wrong" — that's a sim-side fix).

## The three-step walk

### Step 1: Confirm upstream locus

Before opening an upstream issue, verify:

- **Is the bug in vendored / pinned / upstream code?** Not in sim's own `src/facetheory/panels/*`, `src/lib/api/*`, `src/lib/components/*`.
- **Is sim using the upstream correctly?** Consult upstream docs, GitHub issues on the upstream repo, or the pinned contract. If sim's usage diverges from the documented / canonical pattern, this may be a sim-side fix.
- **Does a workaround pattern exist in sim-side code (e.g. in an adapter)?** If the adapter layer is reasonable accommodation for adapter-appropriate concerns (defensive null-handling, fallback behavior), that's fine. If the adapter is masking an upstream bug that other consumers would also face, route upstream.

If the locus is sim-side after all, the fix is local — hand back to `investigate-issue` with the updated verdict.

### Step 2: Classify the upstream home

Match the bug to the right upstream repo:

- **Vendored Greater component mis-render / prop-handling bug** → `greater-components`
- **Greater component API limitation (missing prop, slot, event)** → `greater-components`
- **Lesser GraphQL schema missing field / wrong type** → `lesser`
- **Lesser GraphQL query returns unexpected data** → `lesser`
- **Lesser REST auth endpoint shape surprise** → `lesser`
- **host registry response shape surprise / missing endpoint** → `lesser-host`
- **host managed-deploy flow issue** → `lesser-host`
- **body MCP endpoint shape / contract issue** → `lesser-body`
- **body MCP tool missing for a workflow** → `lesser-body`
- **Namespace-semantic concern at `spec.lessersoul.ai`** → `lesser-soul`
- **FaceTheory runtime / SSR / routing pattern gap** → `FaceTheory` (Theory Cloud framework steward)
- **Svelte 5 bug / feature gap** → Svelte community (GitHub issue / RFC)
- **Vite bug / feature gap** → Vite community
- **Apollo Client bug** → Apollo community
- **graphql-ws bug** → graphql-ws community
- **Playwright bug** → Playwright community
- **SvelteKit bug (still used for legacy routes)** → SvelteKit community

### Step 3: Shape the upstream report

Produce a GitHub-issue-ready draft:

```markdown
## Upstream issue: <short title>

### Target repo
<equaltoai/greater-components / equaltoai/lesser / equaltoai/lesser-host / equaltoai/lesser-body / equaltoai/lesser-soul / theorycloud/facetheory / sveltejs/svelte / vitejs/vite / apollographql/apollo-client / etc.>

### Target version
<greater-vX.Y.Z / lesser version from contracts / facetheory vX.Y.Z / svelte vX.Y.Z / etc.>

### Reported by
simulacrum — <commit SHA or tag>

### Reproduction

```<language>
// Minimal reproduction code (from sim's context)
```

Run against upstream version <X>. Expected: <...>. Actual: <...>.

### Observed in sim

- Surface: <vendored Greater component / Lesser GraphQL query / host API call / body MCP tool / FaceTheory pattern / upstream library>
- Context: <which workflow panel / public route / test harness triggers this>
- Impact on sim: <what sim can or can't do as a result>

### Why this is upstream (not sim-side)

<brief explanation of why sim's usage is correct and the bug lives in the upstream surface>

### Suggested fix (optional)

<sim's perspective on how the upstream might address — optional; the upstream steward scopes their own fix>

### Sim's workaround posture

- sim waits for upstream fix: <yes / no>
- sim has a temporary adapter-level defensive pattern: <description if yes>
- sim documents the upstream issue reference in: <code comment location, if added>
```

This report is what the user opens (or asks you to open) as a GitHub issue on the upstream repo. sim does not edit the upstream repo; the user coordinates.

## The explicit refusal to patch locally

Absolute:

- **No hand-edits** to `src/lib/greater/*` or `src/lib/faces/*` — vendored source is CLI-managed
- **No hand-edits** to `contracts/*` to fabricate a contract state
- **No sim-side adapter code** that silently masks upstream bugs (adapter-appropriate null-handling is fine; masking is not)
- **No forked copies** of upstream framework code (FaceTheory, Svelte, Apollo, Playwright, SvelteKit)
- **No "temporary" overrides** that accumulate

If the upstream genuinely blocks critical sim work, escalate to Aron. Forking / patching is scope-level, not steward-level.

## The sim-side-workaround posture (limited, explicit)

In rare cases, sim may ship an adapter-level defensive workaround **while the upstream fix is pending**:

- **Defensive null-handling** at the adapter layer (e.g. gracefully handling a field that upstream returns as null sometimes) — fine if documented as defensive adapter practice.
- **Feature-flagged fallback** during an upstream rollout window — fine with explicit sunset (when upstream fix releases, workaround removes).
- **Temporary UX affordance** that avoids exercising the upstream bug — fine if documented, with the upstream issue referenced in the code.

In all cases:

- **The upstream issue is referenced** in a code comment or docs pointer
- **Sunset is explicit** — the workaround removes when upstream fixes
- **The workaround is at the adapter / UI layer, not in vendored source**

## The continuity discipline

Upstream-routing signals accumulate:

- **Record in memory** — target repo, issue summary, sim's commit where discovered, date
- **Track upstream response** — issue status, fix release, sim's re-sync timing
- **Revisit on upstream version bumps** — when sim bumps Greater / Lesser / host / body / FaceTheory, check whether pending upstream issues are resolved

## Refusal cases

- **"Patch this vendored Greater component; the upstream team is busy."** Refuse. Open the upstream issue.
- **"Work around this Lesser GraphQL bug with a client-side transform."** Evaluate — if it's genuinely a client-side concern (e.g. UI formatting), fine; if it's masking a Lesser bug, refuse and route upstream.
- **"Fake a Lesser contract update in `contracts/` so our adapter works."** Refuse. Contracts mirror upstream exactly.
- **"Vendor a fixed Svelte plugin into our tree."** Refuse.
- **"Fork FaceTheory and maintain a sim-specific version."** Refuse. Escalate to Aron if the framework is genuinely blocking.
- **"Skip the upstream issue; we'll handle it locally for this release."** Refuse. Upstream-first is the discipline.
- **"Ship a workaround permanently instead of waiting for upstream."** Refuse. Workarounds have sunsets.

## Persist

Append every upstream-routing event — target repo, bug summary, upstream issue link (once opened), sim's workaround posture, sunset condition. High-signal memory material; upstream routing is a core sim discipline and continuity matters.

Five meaningful entries is a floor. Upstream-routing events are inherently memorable.

## Handoff

- **Upstream issue drafted** — stop. User opens the issue on the target repo; sim's local work (if any workaround) proceeds through normal pipeline with the upstream issue referenced.
- **Locus was actually sim-side after all** — hand back to `investigate-issue` with updated verdict.
- **Upstream fix released** — `chore/update-<repo>-<ver>` branch pulls the fix; sim's workaround (if any) removes in the same cycle.
- **Upstream refuses / deprioritizes** — escalate to Aron for decision (accept permanent workaround, contribute the upstream fix ourselves, or rework sim's approach).
- **Coordinated upstream + sim work** — `route-upstream-issue` captures the upstream part; `scope-need` / `implement-milestone` handles the sim part.
