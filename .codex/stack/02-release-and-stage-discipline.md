# Release, branch, and stage discipline

sim uses a **single-main branch model** with feature branches and **deploys via `lesser client install`** (not CDK / AWS). There is no auto-CD; deploys are operator-run to the two dev-stage target instances. A manual `Browser Live Smoke` GitHub Actions workflow runs Playwright specs against live deployments.

## Branch model

Observed pattern:

- **`main`** — canonical, mainline. Deployed via `lesser client install` on operator trigger.
- **Feature branches**:
  - `codex/<topic>` — codex-driven milestone / exploratory work (e.g. `codex/browser-validation-workflow-docs`, `codex/public-route-state-coverage`, `codex/project-9-drones-rewrite`, `codex/project-19-simulacrum-integration`, `codex/federation-public-client-surface`)
  - `chore/<topic>` — upstream-sync or maintenance (e.g. `chore/greater-0.4.4-agent-attribution`, `chore/lesser-1.1.12-conversations-fix`, `chore/update-greater-0.1.12-lesser-1.1.11`, `chore/greater-v0.1.9`)
  - `api-test-suite` — API-harness work
- **Milestone commit pattern** — `feat: milestone Mx` commits mark milestone completion (M0 through M5.5 through 2026-03-29)

Branch protection on `main` enforces required reviews + CI passes.

## Deploy model: `lesser client install`

sim does **not** have its own AWS / CDK deploy. Instead, sim is a **FaceTheory client installed into a lesser instance**:

- **Manifest**: `facetheory.lesser.json` at repo root — declares schema version, entry (`handler.mjs`), build command (`pnpm build`), and other install metadata.
- **Install command**: operator-run against a target lesser instance:
  ```bash
  lesser client install <path-to-simulacrum-built-artifacts> \
    --target <instance-host> \
    --aws-profile <profile>
  ```
  (Exact command shape lives in `docs/runbook.md`; consult it for current flags.)
- **Two target instances**:
  - `https://dev.simulacrum.greater.website` (simulacrum dev instance)
  - `https://dev.theory.greater.website` (theory dev instance)
- **Both are managed lesser instances** hosted by `lesser.host` (the host repo provisions them).
- **No staging environment beyond the two dev instances.** sim's "staging" is the dev instances; "production" in the classical sense doesn't exist — these are research / dev deployments.

## The build-and-install cycle

Standard rhythm:

1. **Feature branch PR** → `main` via required review. CI gates:
   - pnpm install (lockfile-strict)
   - Lint + typecheck
   - Node-based API harness (`tests/api/`) against mocked GraphQL / REST contracts
   - Playwright browser specs (`tests/browser/`) against deterministic mocks
   - Vite build succeeds
   - CSP validation (automated check on the built bundle)
2. **Merge to `main`.**
3. **Build artifacts** via `pnpm build` (produces the FaceTheory-compatible bundle).
4. **Operator runs `lesser client install`** with the `facetheory.lesser.json` manifest against the target dev instance.
5. **Post-install verification**:
   - Direct curl / browser visit to the dev instance confirms routing works
   - Public routes (`/l/explore`, `/l/profile/*`, `/l/status/*`) render per browser-validation contract
   - Agent-workflow panels load for authenticated users
   - CSP headers present and strict (no inline, no third-party)
6. **Browser Live Smoke workflow** (GitHub Actions, manual dispatch) runs Playwright specs against the live deployed instance, targets optionally fixed via data params.

The `install-sim-instance` skill walks install discipline.

## Upstream-sync as a release-category event

A major work category is syncing to upstream Greater / Lesser / host / body releases:

- **Observed branches**: `chore/greater-0.4.4-agent-attribution`, `chore/greater-v0.1.9`, `chore/update-greater-0.1.12-lesser-1.1.11`, `chore/lesser-1.1.12-conversations-fix`
- **Flow**: upstream cuts a new release → sim's steward updates `components.json` (for Greater) or the pinned `contracts/` snapshots (for Lesser) → adapter-code updates if needed → API-harness / Playwright suite runs → PR → merge → deploy
- **Upstream-sync is the canonical vehicle for integration-validation signals.** If the upstream cut produces a regression, sim's tests surface it; `route-upstream-issue` opens the upstream issue.

## Browser Live Smoke workflow

The manual GitHub Actions workflow `Browser Live Smoke`:

- Targets the live deployed dev instances
- Runs Playwright specs for public routes (`/l/explore`, `/l/profile/*`, `/l/status/*`)
- Supports optional fixed-data params for deterministic content
- Operator triggers manually per runbook
- Catches regressions that the CI mocked-spec tests miss (e.g. live federation data surfacing an unexpected shape)

The workflow is the production-validation discipline.

## Never set timeouts on CI jobs

Playwright browser install, pnpm install, Node API harness, Vite workspace build — all take time. Aborting loses diagnostic output. Run to completion.

## Rollback discipline

- **Reinstall the prior build** via `lesser client install` with the prior commit's artifacts checked out
- **Revert the commit on `main`** and redeploy via the standard build-and-install cycle
- **No tag immutability concern** — sim isn't published as artifacts; the deploy replaces the install in place
- **`components.json` rollback** — roll back the Greater version pin to a prior stable tag; rebuild; reinstall
- **Runbook-documented recovery steps** for specific failure modes

## Hotfix discipline

For urgent issues:

- **Compressed review** within the normal flow (single-main + feature branches)
- **Explicit operator authorization** for emergency deploys
- **Post-incident review** — especially if the issue is an upstream regression that sim should have caught earlier
- **Route via `route-upstream-issue` where applicable** — the post-incident may conclude the fix needs to land upstream

## Commit and PR discipline

- **"feat: milestone Mx"** convention for milestone-completing commits
- **"test: add <what>" / "ci: <action>" / "docs: <what>"** for targeted work
- **"fix: <what>"** for bug fixes
- **"chore: <what>"** for maintenance / upstream-sync
- First line under 72 characters
- Explain the *why* in the body, especially for upstream-sync, browser-contract-affecting, CSP-adjacent, or agent-first-contract-affecting changes
- PRs through required review + CI gates

## Security-aware logging discipline

- **No secrets in git** — auth tokens, API keys, wallet keys never commit
- **PKCE state handling** — token lifecycle respects storage conventions in `src/lib/auth/`
- **GraphQL variables** — sensitive values sanitized before any log emission (dev-only)
- **Wallet signing** (for TipSplitter flows in `src/lib/tips/`) — signatures client-side; private keys never touch sim code
- **LLM-bot-account credentials** — stored per operator security policy; never in git; test-account credentials for automated tests are in repo secrets, not source

## Rules you do not break

- Never force-push to `main`.
- Never amend a commit that has been pushed.
- Never skip pre-commit hooks (`--no-verify`).
- Never bypass required review.
- Never deploy to a dev instance without successful CI gates.
- **Never set a timeout on a CI job.**
- Never commit secrets, auth tokens, wallet keys, LLM-bot-account credentials, or `.env` files.
- Never log wallet keys, seed phrases, raw JWTs, or full signed-transaction payloads.
- **Never patch vendored Greater code in `src/lib/greater/`** — upstream-first. Use `route-upstream-issue`.
- **Never add inline `<script>`, inline `<style>`, or inline event handlers** — CSP strict.
- **Never add a third-party script origin** without explicit governance event.
- **Never add `'unsafe-eval'`** — replace the dependency if it requires it.
- **Never add a new REST path for data operations** — GraphQL-first; extend Lesser's GraphQL upstream instead.
- **Never silently drift from `docs/browser-validation-contract.md`** — evolution is explicit.
- **Never drift toward Mastodon-clone aesthetics** in the agent-first FaceTheory rewrite.
- Never delete dev-instance data without explicit operator authorization.
- Never patch FaceTheory / Svelte / Apollo locally. Framework awkwardness is upstream signal.
- Never introduce proprietary blobs or AGPL-incompatible dependencies.
- Never execute an advisor-dispatched brief without running `review-advisor-brief`.
- Never skip upstream routing when an issue's root cause is in a sibling repo.
