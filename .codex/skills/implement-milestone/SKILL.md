---
name: implement-milestone
description: Use to execute a single milestone (Mx.y) or GitHub Project phase — feature branch off main, commits per enumerated task, PR with CI gates + required review, merge to main. Runs one milestone at a time. Install to the two dev-stage instances is handled by install-sim-instance.
---

# Implement a milestone

This skill moves sim work through code, CI gates, review, and merge to `main`. sim uses a single-main branch model with `codex/*` and `chore/*` feature branches. Once merged, `install-sim-instance` owns the `pnpm build` + `lesser client install` flow against the two dev-stage targets.

## Hard preconditions

Do not start without all of the following:

- **A specific milestone named** (often `Mx.y`), from `plan-roadmap` or a GitHub Project phase
- **Clean working tree on `main`** at a known-green commit
- **MCP tools healthy.** Call `memory_recent` first.
- **`pnpm install` succeeds** (lockfile-strict)
- **`pnpm lint` passes**
- **`pnpm typecheck` passes**
- **Node API harness** (`pnpm api:test` or equivalent) passes
- **Playwright browser specs** (`pnpm browser:test` or equivalent, with mocks) pass
- **`pnpm build` succeeds**
- **CSP validation on build output** passes
- **Enumerated tasks are in-mission** (not upstream-routing items, not scope growth)
- **Specialist walks complete** for upstream-routing / CSP-GraphQL / browser-validation / install / framework-feedback / advisor-brief work
- **Advisor-dispatched milestones** have Aron's authorization from `review-advisor-brief`

If any precondition fails, stop.

## Branch and PR setup

One feature branch per milestone. One PR per milestone. Commits per task.

- **Branch name**: observed patterns — `codex/<topic>`, `chore/<topic>`, `chore/update-greater-<ver>`, `chore/lesser-<ver>-<topic>`, `codex/project-<N>-<topic>`, `api-test-suite`.
- **Branched from**: `main` at known-green commit.
- **PR target**: `main`.
- **PR title**: clear. Milestone-completing commits use `feat: milestone Mx.y`; other commits use `test: ...`, `ci: ...`, `docs: ...`, `fix: ...`, `chore: ...`.
- **Open PR as draft.**

PR description template:

```markdown
## Milestone
<Mx.y> — <goal from roadmap / project README>

## Classification
<facetheory-rewrite-milestone / upstream-sync / csp-graphql-compliance / deploy-install / research-sandbox / framework-feedback / test-coverage / docs / dependency-maintenance / bug-fix>

## Surfaces affected
<enumerated>

## Specialist walks referenced
- Upstream routing: <none / completed — all sim-local / completed — upstream issues filed>
- CSP / GraphQL-first: <...>
- Browser-validation contract: <...>
- Install: <...>
- Framework: <idiomatic / reported upstream>

## Upstream-first check
<all items sim-local / some items routed upstream separately (issues tracked)>

## Agent-first-contract compatibility
<preserved / extended per contract>

## Research-mission compatibility
<preserved / extended>

## Consumer impact
- simulacrum dev instance: <...>
- theory dev instance: <...>
- LLM bot account workflows: <no impact / change described>

## Tasks
- [ ] <issue 1 title>
- [ ] <issue 2 title>

## Validation
- `pnpm install`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm api:test` (Node API harness)
- `pnpm browser:test` (Playwright + mocks)
- `pnpm build`
- CSP validation (on built bundle)

## Install plan (handoff to install-sim-instance after merge)
- [ ] Merged to main
- [ ] Build succeeds
- [ ] Installed to simulacrum dev
- [ ] Simulacrum dev verification
- [ ] Browser Live Smoke (simulacrum) green
- [ ] Installed to theory dev
- [ ] Theory dev verification
- [ ] Browser Live Smoke (theory) green

## Cross-repo coordination
<upstream issues tracked separately / none>

## Advisor-brief authorization (if applicable)
<summary from review-advisor-brief>
```

## The per-task loop

For each task:

1. **Read the issue.** Confirm acceptance, planned commit subject, milestone identifier.
2. **`memory_recent`** — refresh context.
3. **Upstream-first check.** Before changing any code, ask: "Is this issue actually upstream?" If yes, stop and `route-upstream-issue`.
4. **For bug fixes: add regression test first.** Playwright spec (if public-route bug) or Node API harness (if contract bug), designed to fail against current code.
5. **Make the change.** Only files in enumerated paths.
6. **Run validation:**
   - `pnpm install` (if lockfile changes)
   - `pnpm lint`
   - `pnpm typecheck`
   - `pnpm api:test` (targeted or full)
   - `pnpm browser:test` (targeted or full)
   - `pnpm build`
   - CSP validation on build output
7. **For workflow panel / public-route changes**: verify `src/facetheory/routing.ts` wiring + Playwright spec updated to cover the change (conform to browser-validation contract).
8. **For adapter / API-client changes**: verify Node API harness covers the new shape against pinned contract in `contracts/`.
9. **For vendored Greater updates**: never hand-edit `src/lib/greater/` or `src/lib/faces/`. Update `components.json` pin, run `greater` CLI to re-vendor source, commit updated vendored files as the CLI produced them.
10. **For Lesser contract-sync**: copy fresh snapshot from `../lesser/docs/contracts/` into `contracts/`; regenerate derived files (`schema.graphql` if applicable); update adapter code in subsequent commit.
11. **For CSP-affecting changes**: verify no inline, no unsafe-eval, no third-party origins; CSP validation on build output passes.
12. **For docs changes**: browser-validation contract updates ride with public-route changes; agent-first contract updates ride with workflow-panel changes.
13. **For facetheory.lesser.json / components.json changes**: verify the manifest / pin changes parse and apply correctly.
14. **Commit.** Clear subject. Explain *why* in the body for browser-validation-contract, agent-first-contract, CSP, upstream-sync changes. Never `--no-verify`. Never `--amend` a pushed commit.
15. **Push.** Never force-push.
16. **Check task off** in PR description; update GitHub Project item status.
17. **`memory_append`** only when worth remembering — upstream-routing decision, contract-sync subtlety, CSP-enforcement finding, browser-validation-contract evolution, milestone-shape observation, agent-first-contract clarification, framework-awkwardness pattern. Five meaningful entries beat fifty log-shaped ones.

## The mission rule enforced at commit time

- **Every commit must be in-mission** (not upstream-routing; not scope growth).
- **Before every change**, the upstream-first reflex check.
- **No hand-editing of vendored Greater / faces source** — refuse.
- **No new REST path for data** — refuse; route upstream to lesser.
- **No inline scripts / styles / event handlers** — refuse.
- **No third-party script origins** — refuse without explicit governance.
- **No `unsafe-eval`** — refuse; replace the dependency.
- **No silent drift from browser-validation contract** — doc updates ride with route changes.
- **No Mastodon-clone drift** — agent-first contract is the product shape.
- **Bug-fix commits follow test-first pattern.**
- **Dependency bumps isolated** for bisect.
- **CSP-affecting changes isolated**.
- **Milestone-completing commits** use `feat: milestone Mx.y`.
- **No hardcoded secrets, wallet keys, bot-account credentials, auth tokens, `.env` files.**
- **No raw-JWT / full-signed-transaction / wallet-key / seed-phrase / PII logging.**
- **No changes to `AGENTS.md` or branch protection without explicit governance.**
- **No framework patches** to FaceTheory / Svelte / Apollo / Playwright / SvelteKit.
- **No AGPL-incompatible dependencies or proprietary blobs.**

## If CI goes red mid-milestone

- **Do not** add a "fix CI" commit touching unrelated code.
- **Do** stop, investigate, surface.
- **Check upstream-first** — CI failure may be an upstream regression that `route-upstream-issue` handles.
- **Do not** weaken a test or CI gate.
- If failure caused by your most recent commit, revert with a new revert commit and re-plan.

## Finishing the milestone (PR side)

When all tasks committed and pushed:

1. Re-verify `pnpm lint / typecheck / api:test / browser:test / build / CSP` on the tip.
2. Promote PR out of draft.
3. Request required review.
4. **Leave merging to a reviewer** who confirms CI is green.

## Hand off to install-sim-instance

Once merged to `main`, `install-sim-instance` owns:

- `pnpm build` on the merged commit
- `lesser client install` against `dev.simulacrum.greater.website`
- Simulacrum dev verification (public routes, workflow panels, CSP, subscriptions, bot workflows)
- Browser Live Smoke (simulacrum)
- `lesser client install` against `dev.theory.greater.website`
- Theory dev verification
- Browser Live Smoke (theory)
- Post-install monitoring

`implement-milestone` does not run install commands. Its output is a merged PR + handoff.

## What this skill will not do

- Will not implement more than one milestone per run.
- Will not accept upstream-routing tasks as in-sim work.
- Will not accept scope growth.
- Will not merge PRs — required review (with CI green).
- Will not skip review or gates.
- Will not run install commands — that's `install-sim-instance`.
- Will not skip specialist walks.
- Will not hand-edit vendored Greater / faces source.
- Will not add new REST paths for data.
- Will not loosen CSP or GraphQL-first discipline.
- Will not drift silently from browser-validation or agent-first contracts.
- Will not drift toward Mastodon-clone aesthetics.
- Will not force-push, amend pushed commits, rewrite history.
- Will not bump the Node / Svelte / Vite major version in ordinary milestone.
- Will not add unsanitized logging or raw-credential logging.
- Will not patch FaceTheory / upstream framework locally.
- Will not introduce AGPL-incompatible dependencies.
- Will not act on advisor briefs without `review-advisor-brief` authorization.
