# Browser Validation Operating Model

Date: 2026-04-05

Issues: `#130`, `#131`

This guide describes how Simulacrum's browser suite is meant to be used and
maintained now that the public-route contract, deterministic coverage, and live
smoke workflow all exist.

## Why this suite exists

The browser suite exists to answer user-visible product questions that the API
suite cannot answer on its own:

- do the anonymous public routes under `/l/*` actually settle in the browser
- do the shipped loading, empty, not-found, and error states behave as intended
- do the live dev instances still expose the public federation surface end to
  end

The main public routes in scope today are:

- `/l/explore`
- `/l/profile/:identifier`
- `/l/status/:id`

## Two lanes, two jobs

The suite intentionally has two different operating modes.

### Deterministic browser coverage

Use deterministic specs when the goal is regression protection for a stable UI
contract.

Commands:

```bash
pnpm browser:test
pnpm exec playwright test tests/browser/public-route-harness.spec.ts --project=chromium
pnpm exec playwright test tests/browser/public-route-states.spec.ts --project=chromium
```

Deterministic coverage is where we assert:

- exact route readiness behavior
- exact empty and not-found states
- exact fixture text or status ids
- route-level error handling

This lane should stay low-noise. If a deterministic test flakes, we fix the
test or the product before adding more coverage.

### Live deployed smoke

Use live smoke when the goal is verifying the public federation surface on real
deployed instances.

Commands:

```bash
pnpm browser:test:live
pnpm browser:test:live https://dev.simulacrum.greater.website https://dev.theory.greater.website
```

Live smoke is intentionally coarse. It should prove:

- the page opens under `/l/*`
- the route shell renders
- the route settles into the expected broad success state
- one or two stable anchors are present

It should not try to prove:

- exact post counts
- exact remote content ordering
- fragile content text from live data
- negative states that require artificial environment manipulation

## Scenario maintenance

### Deterministic scenarios

Deterministic public-route specs should use the shared harness in
`tests/browser/_harness/`.

Rules:

- prefer shared helpers in `publicAssertions.ts` over one-off route selectors
- prefer shared GraphQL interception in `publicGraphqlMocks.ts`
- keep using stable `data-testid` hooks from the public route contract
- add new state helpers when behavior is shared across routes

When a route contract changes, update in this order:

1. the route component hooks and terminal-state behavior
2. the shared harness helpers
3. the route-level deterministic specs
4. this operating guide if the workflow meaning changed

### Live scenarios

Live smoke should prefer scenario discovery over hard-coded fixture ids.

Current behavior:

- `tests/browser/_harness/liveScenarios.ts` discovers a seed from the public
  timeline by default
- the live runner can be overridden with:
  - `BROWSER_TEST_LIVE_TARGETS`
  - `BROWSER_TEST_LIVE_STATUS_ID`
  - `BROWSER_TEST_LIVE_PROFILE_IDENTIFIER`
  - `BROWSER_TEST_LIVE_PROFILE_ACTOR_ID`

Use overrides only when discovery is insufficient for a targeted investigation
or a workflow run needs a pinned scenario.

## GitHub Actions workflow

The manual live-smoke workflow lives at:

- `.github/workflows/browser-live-smoke.yml`

It is intentionally `workflow_dispatch` only today.

Reason:

- the live suite still depends on real public content and real network behavior
- the workflow should help the team verify deployments without becoming noisy
  background churn
- we can add a schedule later if the live suite proves consistently quiet

Workflow inputs:

- `targets`: comma-separated live base URLs
- `live_status_id`: optional fixed status id
- `live_profile_identifier`: optional fixed profile identifier
- `live_profile_actor_id`: optional fixed actor id for the profile route

Workflow requirements:

- no secrets are required for the current public-route smoke workflow
- the workflow installs Chromium and runs `pnpm browser:test:live`
- browser artifacts under `artifacts/browser/` are uploaded on both pass and
  failure

## Triage workflow

Every browser run writes evidence under:

- `artifacts/browser/<run-id>/`

Expected files:

- `meta.json`
- `summary.md`
- `test-results/`

On failures, retained Playwright artifacts may include:

- screenshot
- trace
- captured DOM HTML
- console log
- route/scenario metadata

Suggested triage sequence:

1. open `summary.md` to see which route or target failed
2. read `meta.json` to confirm base URL and run context
3. inspect the captured console and DOM attachment
4. open the Playwright trace with `pnpm exec playwright show-trace <trace.zip>`
5. decide whether the failure is:
   - a real product regression
   - a bad deterministic fixture
   - live-environment flake or target instability

For live smoke specifically:

- one retry is allowed by the runner
- a pass on retry should still be treated as flaky evidence
- repeated live flake is a signal to narrow or harden the scenario, not to keep
  increasing retries

## Browser suite versus API suite

Use the browser suite when the question is about rendered behavior or
navigation-level outcomes.

Browser validation owns:

- route shell rendering
- loading-to-terminal-state settlement
- public route visibility without auth
- navigation-level behavior for the public federation surface
- deployed smoke against real instances

Use the API suite when the question is about transport contracts or lower-level
request semantics.

API validation owns:

- GraphQL schema and payload shape checks
- HTTP status and header assertions
- contract coverage that does not require rendering
- lower-level request or response edge cases

If both are useful:

- put deep contract assertions in the API suite
- keep the browser suite focused on user-visible outcomes

## How this supports federation validation

Simulacrum is validating the public federation surface, not just a local UI
shell.

That means the browser suite should stay explicit about:

- anonymous access to `/l/explore`, `/l/profile/:identifier`, and `/l/status/:id`
- readiness behavior after async federation-backed fetches
- deployed verification against the live dev instances

The suite is successful when it helps us answer a practical question quickly:

does the public surface still resolve for a real browser user, and if not, do we
have enough evidence to route the problem to the right layer.
