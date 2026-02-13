# Simulacrum API Test Suite Roadmap (REST + GraphQL)

This roadmap defines how we build a **full API test suite** for the EqualtoAI stack as exercised by the Simulacrum
instance frontend, with an explicit goal: **every failure should emit copy/paste evidence suitable for filing a
high-quality issue against `equaltoai/lesser`**.

The suite is intended to be runnable locally and in CI against a deployed stage (typically `dev`).

---

## Current State (what we already have)

- No dedicated test runner or `pnpm test` script in this repo (`package.json` only has `dev/build/preview/check`).
- Thin HTTP helpers exist, but they’re app-oriented:
  - GraphQL: `src/lib/api/graphql.ts` (`graphqlRequest`, `GraphQLRequestError`)
  - REST: `src/lib/api/rest.ts` (`restRequest`, `RestRequestError`)
- Most app API calls are centralized in `src/lib/api/index.ts`, but it depends on browser auth store hydration (not
  suitable for Node test execution as-is).
- Contracts live upstream:
  - GraphQL schema: `../lesser/docs/contracts/graphql-schema.graphql`
  - OpenAPI spec: `../lesser/docs/contracts/openapi.yaml`
- A curl checklist exists in `docs/instance-frontend-roadmap.md` (M0), but it’s manual and doesn’t produce structured
  evidence artifacts.

Implication: we should create a **separate test harness** (Node/CI-friendly) that can run against a real stage, and
optionally reuse the existing request helpers without importing browser-only modules.

---

## Non-negotiables

- **No hard-coded domains**: base URL must be configurable (env + CLI flags).
- **No secret leakage**:
  - Never print access tokens / refresh tokens to stdout.
  - Never write raw tokens into artifact files.
  - Redact `Authorization`, OAuth codes, and any token-looking strings before persisting evidence.
- Tests must be **idempotent** or self-cleaning (create → verify → delete), and must not depend on timing-sensitive
  eventual consistency unless explicitly stated.
- Keep the suite **GraphQL-first** for app behavior, but include REST where it is required (wallet/auth surfaces and
  Mastodon-compat endpoints used by clients).

---

## What “full coverage” means (for this suite)

“Full” does **not** mean “every endpoint in Lesser”; it means:

1. **All API operations Simulacrum relies on** (GraphQL + REST) have automated coverage.
2. The suite includes **read + write** flows (and clean-up) for core surfaces.
3. The suite includes **authorization/policy checks** (expected 200 vs expected 401/403) for at least:
   - standard user token
   - delegated agent token (`client_id=lesser-agent-delegation`)
   - admin token
4. Any regression produces a **failure bundle** that can be pasted into a Lesser GitHub issue with:
   - exact request payload(s) (redacted)
   - response status/body
   - correlation IDs (request IDs / trace IDs)
   - environment metadata (stage, version, time)

---

## Evidence Pack Spec (required output)

Every run generates a run folder:

```
artifacts/api/<run-id>/
  meta.json
  summary.md
  requests/
    001-viewer.graphql.json
    002-verify_credentials.rest.json
    ...
  failures/
    <test-slug>.md
    <test-slug>.json
```

### `meta.json`
Minimum fields:
- `runId`, `startedAt`, `finishedAt`
- `baseUrl`
- `stage` (if provided)
- `lesserVersion` (from `GET /api/v1/instance` or equivalent)
- `runner` (`node -v`, `pnpm -v`, git SHA of this repo if available)
- `profile` (user/delegated/admin)

### Per-request JSON (`requests/*.json`)
Minimum fields:
- `name`, `kind` (`graphql` or `rest`)
- `request`: `method`, `url`, `headers` (redacted), `body` (redacted)
- `response`: `status`, `headers` (subset), `body` (redacted), `durationMs`
- `correlation`: `x-request-id`, `x-amzn-requestid`, `x-amzn-trace-id`, `x-amz-cf-id` (when present)

### Failure bundle (`failures/<test-slug>.md`)
Issue-ready Markdown with:
- **Summary / Expected / Actual**
- **Environment** (base URL, stage, Lesser version, timestamps)
- **Repro steps**
  - `pnpm api:test --filter <slug> --base-url <...> ...`
  - minimal `curl` snippet(s) with redacted auth
- **Evidence**
  - redacted request/response
  - correlation IDs
- **Notes**
  - any cleanup performed

### Redaction rules (minimum)
- Redact headers: `authorization`, `cookie`.
- Redact body keys: `access_token`, `refresh_token`, `client_secret`, `code`, `code_verifier`, `signature`.
- Redact JWT-like strings (`xxxxx.yyyyy.zzzzz`) by keeping only the first ~8 chars of each segment.

---

## Proposed toolchain (recommended)

- **Runner:** `vitest` (fits TS + Vite config, supports reporters, easy filtering)
- **HTTP:** global `fetch` (Node 18+); avoid browser-only imports
- **GraphQL validation:** `graphql` (validate documents vs pinned schema snapshot)
- **OpenAPI validation:** `ajv` + an OpenAPI-to-JSONSchema adapter, or an OpenAPI validator library
- **Reporters:** JUnit (CI), plus the custom evidence pack above

If Vitest is undesirable, a fallback is Node’s built-in `node:test` plus a tiny bespoke runner, but TS ergonomics will
likely be worse.

---

## Milestones

### M0 — Inventory + Contract Pinning

Deliverables:
- Add pinned contract snapshots to this repo (source of truth remains Lesser):
  - `contracts/graphql-schema.graphql`
  - `contracts/openapi.yaml`
- Add `scripts/update-contracts.mjs` to copy snapshots from a sibling `../lesser` checkout (versioned in commit history).
- Produce an “operation catalog” doc mapping:
  - Simulacrum route → API calls (`src/lib/api/index.ts`, wallet REST helpers, etc.)
  - operation → expected scopes (read/write/follow/admin)

Acceptance:
- Running the update script updates both contract snapshots and prints the Lesser version/tag source.
- A single table exists listing the critical ops we must cover first (smoke suite).

---

### M1 — Test Harness + Evidence Writer

Deliverables:
- Add a test package layout:
  - `tests/api/` (REST + GraphQL test cases)
  - `tests/api/_harness/` (client, assertions, evidence writer, redaction)
- Add `pnpm api:test` that:
  - accepts `--base-url` (or env `API_TEST_BASE_URL`)
  - accepts `--profile` (user/delegated/admin)
  - writes artifacts to `artifacts/api/<run-id>/`
- Add `.gitignore` entries for `artifacts/api/`.

Acceptance:
- `pnpm api:test --smoke` produces `meta.json` + `summary.md` even when everything passes.
- On failure, `failures/<test-slug>.md` is produced with issue-ready content.

---

### M2 — Auth Profiles + Token Hygiene

Deliverables:
- Support three profiles (all via env vars; never checked into git):
  - `API_TEST_ACCESS_TOKEN_USER`
  - `API_TEST_ACCESS_TOKEN_DELEGATED` (+ optional refresh token)
  - `API_TEST_ACCESS_TOKEN_ADMIN`
- Optional token lifecycle tests:
  - refresh token rotation (`POST /oauth/token`)
  - revocation (`POST /oauth/revoke`)
- Redaction utilities hardened by tests (unit tests for redaction itself).

Acceptance:
- Running with any profile never prints tokens and never stores raw tokens in artifacts.
- A token refresh test can run in a dedicated “unsafe” mode that requires explicit opt-in.

---

### M3 — REST Smoke Suite (read-only + safe endpoints)

Deliverables:
- REST smoke tests that validate status codes + minimal shape:
  - `GET /api/v1/instance` (version metadata)
  - `GET /api/v1/accounts/verify_credentials`
  - `GET /api/v1/timelines/home` (or local/public as applicable)
  - `GET /api/v2/search`
  - Wallet surface: `GET /auth/wallet/list`
- OpenAPI-based validation for the above responses (best-effort; not all endpoints must be perfect initially).

Acceptance:
- REST smoke suite runs without mutating state.
- Failures include the response body and correlation headers.

---

### M4 — GraphQL Smoke Suite (read-only)

Deliverables:
- GraphQL smoke tests for core reads (keep depth ≤ instance limit):
  - `viewer`
  - `timeline` (HOME/LOCAL/PUBLIC)
  - `notifications` (basic query)
  - agent reads (when agents enabled): `agent`, `myAgents`
- Validate GraphQL documents against the pinned schema snapshot.

Acceptance:
- Smoke GraphQL suite runs without mutating state.
- A schema drift failure produces a clear “contract mismatch” artifact.

---

### M5 — Mutation Suite (safe write tests + cleanup)

Deliverables:
- GraphQL mutation tests with cleanup:
  - `createNote` (use `UNLISTED`) → verify → `deleteObject`
  - `likeObject`/`unlikeObject`
  - `shareObject`/`unshareObject`
  - `bookmarkObject`/`unbookmarkObject`
- REST mutation tests where required (kept minimal).
- Ensure each test either cleans up or is explicitly marked “dirty” and runs only in a dedicated environment.

Acceptance:
- Suite leaves no persistent notes/statuses behind on success.
- On failure, artifacts include whether cleanup succeeded.

---

### M6 — Authorization + Policy Assertions

Deliverables:
- For each profile, assert expected access control outcomes:
  - Delegated token: no admin queries/mutations (expect 403/INSUFFICIENT_SCOPE).
  - User token: cannot do agent-owner-only actions on other agents.
  - Admin token: can access admin parity surfaces.
- Add tests for “expected failures” (401/403) so policy regressions are detectable.

Acceptance:
- A permission regression produces an issue-ready failure bundle.

---

### M7 — Regression Library (issue-driven tests)

Deliverables:
- For every high-severity issue discovered in staging, add:
  - a minimal reproducer test
  - an evidence bundle tailored to that bug class
- Maintain a `tests/api/regressions/` folder keyed by Lesser issue ID.

Acceptance:
- Closing a Lesser issue requires adding/green-ing its regression test (or documenting why not possible).

---

### M8 — CI + Nightly Evidence + Optional Issue Automation

Deliverables:
- GitHub Actions workflow(s):
  - on PR: run contract validation + a small local harness test (no real tokens)
  - nightly/manual: run against `dev` using GitHub secrets for tokens, upload `artifacts/api/<run-id>.zip`
- Optional `--emit-issue` mode that writes `failures/*.md` and can open a draft issue via `gh`, but only when explicitly
  enabled (never automatic by default).

Acceptance:
- A nightly failure produces downloadable artifacts and a ready-to-paste issue Markdown file.

---

## Operational workflow (how we’ll use it)

1. Run: `pnpm api:test --profile delegated --base-url https://dev.simulacrum.greater.website`
2. If red, open `artifacts/api/<run-id>/failures/<slug>.md`.
3. Paste into a new `equaltoai/lesser` issue (or add as a comment on an existing issue).
4. Add a regression test (M7) once the issue is fixed upstream.

