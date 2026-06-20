---
name: install-sim-instance
description: Use to walk a merged change through `pnpm build` → `lesser client install` against the two dev-stage target instances (`dev.simulacrum.greater.website`, `dev.theory.greater.website`), followed by Browser Live Smoke workflow validation. Respects the FaceTheory manifest (`facetheory.lesser.json`) + runbook discipline + never-timeout on CI.
---

# Install to a sim dev instance

After `implement-milestone` lands a PR to `main`, the install path is: `pnpm build` → `lesser client install` with the FaceTheory manifest → post-install verification → Browser Live Smoke. sim installs into lesser.host-provisioned dev instances at:

- `https://dev.simulacrum.greater.website`
- `https://dev.theory.greater.website`

No AWS / CDK deploy; sim lives inside lesser's infrastructure via the client-install mechanism. The build-and-install steps are operator-run; the steward sequences, verifies, and records — it does not run the install on its own authority.

## When this skill runs

Invoke when:

- A change has merged to `main` and is ready to install
- An upstream-sync update (Greater pin bump, Lesser contract sync) needs to reach the dev instances
- A browser-validation fix or CSP compliance patch is ready for rollout
- A rollback to a prior install is required
- A new milestone (`Mx.y`) completion is ready for dogfooding

## Preconditions

- **Change is merged to `main`.**
- **Operator AWS credentials** configured per runbook.
- **Lesser binary** available (per runbook; version compatible with `facetheory.lesser.json` schema_version).
- **Target instance identified** — typically both `simulacrum` and `theory`; roadmap may stage them.
- **MCP tools healthy**, `memory_recent` first.
- **CI gates passed on `main`** — lint, typecheck, api:test, browser:test, build, CSP validation.
- **For rollback**: prior commit / build identified.

## The canonical install command

Per `docs/runbook.md` (authoritative for exact flags — consult before each deploy):

```bash
# Build
pnpm install
pnpm build

# Install to simulacrum dev
lesser client install \
  --manifest facetheory.lesser.json \
  --target <simulacrum-instance-endpoint> \
  --aws-profile <profile> \
  --out ~/.lesser/clients/simulacrum/dev/install-receipt.json
```

Repeat for theory dev with the theory-specific target / receipt path.

**Runbook is authoritative.** If the command shape has evolved, the runbook reflects current state; follow it over this skill's sketch.

## The two-target rollout

### Phase A: Install to simulacrum dev

1. **Build** — `pnpm build` produces the FaceTheory-compatible bundle
2. **Install** — `lesser client install` with `facetheory.lesser.json`
3. **Post-install verification**:
   - Curl / browser-visit `https://dev.simulacrum.greater.website/l/explore` — public route renders per browser-validation contract
   - Curl / browser-visit `https://dev.simulacrum.greater.website/l/profile/<test-account>` — profile route renders
   - Check CSP headers on the served HTML — strict, no inline, no third-party
   - Authenticated login flow works (PKCE)
   - Authenticated workflow panels load
   - GraphQL subscriptions connect
   - LLM bot accounts function (if the change affects their workflow)

### Phase B: Browser Live Smoke (simulacrum)

4. **Trigger `Browser Live Smoke` workflow** (GitHub Actions, manual dispatch) against simulacrum dev
5. **Set fixed-data params** if deterministic content is needed
6. **Playwright specs run** against the live deployed instance
7. **Address regressions** — fix on main (via feature branch + PR), reinstall, re-run

### Phase C: Install to theory dev

8. **Once simulacrum dev is stable**, install to `dev.theory.greater.website`
9. **Same post-install verification** against the theory instance
10. **Same Browser Live Smoke** against theory

### Phase D: Post-install monitoring

11. **Watch for team / research-collaborator reports**
12. **Monitor LLM bot workflow health** (if in scope)
13. **Monitor federation interoperability** (sim rendering federated content from Mastodon / Pleroma / other peers)

## Never set timeouts on CI

Playwright browser install, pnpm install, Vite build, Lesser install operations — all take time. Aborting loses diagnostic output. Run to completion.

## Rollback discipline

- **Reinstall prior build**: check out the prior commit, `pnpm build`, `lesser client install` with the prior manifest state
- **Revert the commit on `main`** and redeploy via normal flow
- **`components.json` pin rollback**: if a Greater pin bump caused the regression, revert `components.json`, re-vendor via CLI, rebuild, reinstall
- **`contracts/` rollback**: if a Lesser contract-sync caused issues, revert the snapshot, update adapter code if needed, rebuild, reinstall
- **Manifest rollback**: `facetheory.lesser.json` rollback if the manifest itself changed

The install replaces the prior install in place; there are no immutable artifacts to preserve, unlike tag-based distributions.

## Hotfix discipline

For urgent issues (a CSP regression, an upstream-caused-sim-break that `route-upstream-issue` is handling in parallel):

- **Compressed CI gates** within normal flow — tests + build + CSP check still run
- **Explicit operator authorization** for emergency reinstall
- **Post-incident review** — especially if the issue is an upstream regression sim should have caught earlier (and route-upstream-issue should surface)

## Output: the install record

```markdown
## Install record: <change name>

### Scope
- Milestone (if applicable): <Mx.y>
- Change summary: <...>
- Commits installed: <SHA range or tag>

### Build
- `pnpm install`: <clean>
- `pnpm build`: <succeeded; bundle size, CSP-validation output>
- FaceTheory manifest (`facetheory.lesser.json`): <unchanged / updated>
- Greater pin (`components.json`): <unchanged / bumped to vX.Y.Z>
- Lesser contracts (`contracts/`): <unchanged / synced from vA.B.C>

### Install to simulacrum dev
- Timestamp: <...>
- Command: `lesser client install --manifest facetheory.lesser.json --target <...> ...`
- Install receipt: <path>
- Post-install verification:
  - Public routes (/l/explore, /l/profile/*, /l/status/*): <render per contract>
  - CSP headers strict: <confirmed>
  - Authenticated login + workflow panels: <works>
  - GraphQL subscriptions: <connected>
  - LLM bot workflow: <works / n/a>
- Issues observed: <none / described>

### Browser Live Smoke (simulacrum)
- Workflow run: <URL>
- Fixed-data params: <...>
- Playwright specs: <all pass / list of failures>

### Install to theory dev
- Timestamp: <...>
- Command: <...>
- Install receipt: <path>
- Post-install verification: <same format as simulacrum>
- Issues observed: <none / described>

### Browser Live Smoke (theory)
- Workflow run: <URL>
- Playwright specs: <...>

### Post-install monitoring window
- Duration: <...>
- Consumer reports: <none / described>
- Research-sandbox health: <...>

### Rollback (if any)
- Trigger: <...>
- Mechanism: <reinstall prior build / revert commit + reinstall / components.json rollback / contracts rollback>
- Prior state: <commit SHA, Greater pin, Lesser contract version>

### Follow-ups
- <subsequent scoping, fix, or monitoring task>
```

## Refusal cases

- **"Skip the simulacrum-dev install and go directly to theory-dev."** Refuse. Simulacrum is the canary.
- **"Set a timeout on the CI Browser Live Smoke job."** Never.
- **"Install with failing CI gates."** Refuse without explicit operator authorization for an emergency fix.
- **"Install to a production lesser.host customer instance."** Refuse — sim is dev-only; customer instances are not sim targets.
- **"Delete the install receipt at `~/.lesser/clients/<slug>/`."** Refuse — receipts are operator-critical audit trail.
- **"Edit the `facetheory.lesser.json` manifest manually during install to patch a value."** Refuse. Manifest changes commit to git.
- **"Abort the CI or install job because it's been running too long."** Check job logs / CloudFormation (if relevant) first. Aborting loses output.
- **"Skip post-install verification — we tested in CI."** Refuse. Live-instance verification catches issues CI mocks miss.

## Persist

Append when the install surfaces something worth remembering — a runbook subtlety, a CI-gate-vs-live-instance behavior difference, a Browser Live Smoke pattern that caught something, a rollback scenario, a bot-workflow-regression story. Routine clean installs aren't memory material. Five meaningful entries beat fifty log-shaped ones.

## Handoff

- **Both dev instances stable** — stop. Record install, append memory if warranted.
- **Regression during post-install verification** — rollback; route through `investigate-issue`.
- **Regression caught by Browser Live Smoke** — rollback or forward-fix; `investigate-issue`.
- **Post-install report from research collaborator** — `investigate-issue` with research-mission context.
- **Install reveals an upstream issue** — `route-upstream-issue` and plan the sim-side work to either wait for upstream or ship a documented workaround.
- **Install reveals a FaceTheory framework awkwardness** (runtime-adjacent) — `coordinate-framework-feedback`.