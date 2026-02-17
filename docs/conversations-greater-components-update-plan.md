# Simulacrum: Update Greater Components + Fix Conversations (Sim)

Last updated: **2026-02-17**

This plan is a concrete, “latest releases only” sequence to:
1) re-vendor the latest `greater-components` adapters into Simulacrum, and
2) deploy Simulacrum to the Sim stack with working conversations.

## Target releases (latest as of 2026-02-17)

- `greater-components`: **`greater-v0.1.12`**
- `lesser`: **`v1.1.12`**

Simulacrum should be built/deployed against these releases in Sim (dev stage).

## Background

- Update order is typically: **Lesser → greater-components → Simulacrum**.
- There is an open upstream bug report: `equaltoai/greater-components#219`:
  - https://github.com/equaltoai/greater-components/issues/219
- Simulacrum’s Apollo client uses `errorPolicy: 'all'`, meaning GraphQL errors can arrive as:
  - `data: undefined` with `errors: [...]` (no thrown exception)
- Simulacrum currently throws a generic error when `data === undefined` in the GraphQL adapter, which:
  - breaks the conversations empty-state UX, and
  - masks the real GraphQL/transport error that should be shown to developers/users.

## Plan (no branches)

### 1) Update Sim (Lesser) to `v1.1.12`

- Ensure the Sim backend stack is already running Lesser `v1.1.12`.
- Ensure the Sim GraphQL WebSocket endpoint is reachable and subscriptions work (baseline smoke).

Quick version check (dev stage example):
- `curl -sS "https://dev.simulacrum.greater.website/api/v1/instance" | jq -r .version`

### 2) Re-vendor Greater into Simulacrum at `greater-v0.1.12`

Do this even if you “already updated greater-components”: Simulacrum only changes when the vendored files are updated
and a new Simulacrum build is deployed.

Steps:
- Set `simulacrum/components.json`:
  - `ref: "greater-v0.1.12"`
- Run:
  - `greater doctor`
  - `greater update --all --ref greater-v0.1.12`
  - `greater diff adapters` (should be clean after update)

Verification (must be true before deploy):
- In `src/lib/greater/adapters/graphql/LesserGraphQLAdapter.ts`, `query()` must:
  - throw on GraphQL errors (`result.errors`)
  - throw on transport errors (`result.error`)
  - return `{}` when `data == null` (do not throw on empty)

### 3) Build Simulacrum (CSP-safe)

- `pnpm check`
- `pnpm build`

### 4) Deploy Simulacrum to Sim (dev stage)

Follow `docs/runbook.md` with `AWS_PROFILE=Sim` / stage `dev`.

### 5) Required smoke tests (conversations)

These tests are the “conversations system works” bar for Sim:

- **Empty inbox:** log in as an account with zero conversations:
  - `/l/conversations` renders an empty state and **does not** show an error banner/toast.
- **Real errors surface:** force a bad token or break network:
  - the UI shows a meaningful error (GraphQL/transport), not “Query completed without returning data.”
- **Direct message creates a conversation:**
  - send a note with `visibility=DIRECT` and a real mention of the recipient (Mastodon semantics)
  - recipient sees the conversation appear in `/l/conversations`
- **Realtime:** with two sessions open, send another direct note:
  - `/l/conversations` updates via `conversationUpdates` without a refresh

## References

- greater-components issue: https://github.com/equaltoai/greater-components/issues/219
- Simulacrum adapter (vendored): `src/lib/greater/adapters/graphql/LesserGraphQLAdapter.ts`
- Conversations pages:
  - `src/routes/conversations/+page.svelte`
  - `src/routes/conversations/[id]/+page.svelte`
