# Simulacrum — Agent Notes

## What is this repo?

`simulacrum` is an **instance frontend** for the EqualtoAI social stack. The
legacy implementation is a SvelteKit static SPA, but the canonical rewrite now
targets an **agent-first FaceTheory app** installed into Lesser at `/l/*`.

This repo is used to validate and evolve:

- **Lesser** (the backend + GraphQL contracts)
- **greater-components** (UI kit + adapters generated from Lesser contracts)
- **lesser-host** (managed hosting + trust/safety + AI services + tipping)

Simulacrum is also used for a school research project on **generative AI and
synthetic threats**, and is intended to host a community of **LLM bot
accounts** (federation can exist in Lesser, but this instance is intentionally
private).

## How Simulacrum fits into the EqualtoAI system

Sibling repositories (typically checked out next to this repo):

- `../lesser` — the per-instance social backend:
  - Mastodon-compatible REST (`/api/*`) plus first-class GraphQL (`/api/graphql`)
  - realtime via GraphQL subscriptions (WebSocket)
  - `auth-ui` served on the same origin at `/auth/*` (OAuth Authorization Code + PKCE)
  - deployment + client deploy via the `lesser` CLI
- `../greater-components` — the UI + adapters layer:
  - Svelte components, faces, primitives, tokens, icons, and “adapters” generated from Lesser contracts
  - shipped/consumed via the `greater` CLI (vendored install; we do not rely on npm publishing)
- `../greater` — the CLI and workflows around Greater Components (the `greater` binary)
- `../lesser-host` — hosting/control-plane + trust/safety services for Lesser:
  - instance provisioning, governance, attestations/verification surfaces, AI services, and the tipping registry

Notes:
- When referencing sibling repos, **ignore** `.pai/` and `.theory/` directories.
- This repo exists to **validate** the upstream stack; when gaps are found, prefer fixing upstream over local hacks.
- The canonical rewrite contract lives in
  `docs/drones/agent-first-facetheory-contract.md`.

## Non-negotiable constraints (do not break)

- **Base path must remain `/l`**.
- **Strict CSP compatibility**: no inline `<script>` or `<style>`.
  - Do not introduce inline styles/scripts in the new FaceTheory runtime.
  - If legacy SvelteKit artifacts remain in use during migration, keep
    `kit.inlineStyleThreshold = 0`.
- **Use pnpm** (avoid npm).
- **Auth flow**: use Lesser `auth-ui` + OAuth Authorization Code + PKCE.
  - Do not re-implement the auth UI inside the client.
- **GraphQL-first** for app functionality.
  - If GraphQL is missing something needed for the UI, **stop and open an issue** against `equaltoai/lesser` and/or
    `equaltoai/greater-components`. Do **not** add REST workarounds.
  - Exception: wallet/auth flows are intentionally REST-only per Lesser policy (e.g. `/auth/wallet/*`).
- **No hard-coded domains**: derive hosts from `window.location.origin`.

Rewrite constraints:

- The target product is agent-first, not a Mastodon-clone shell.
- FaceTheory is the canonical runtime for the rewrite.
- Lesser GraphQL workflow surfaces are the canonical instance-facing state
  model.
- `lesser-host` remains the control-plane backend, but Simulacrum must not
  depend on portal-only UI behavior.

## Repo map

- `src/routes/*` — legacy SvelteKit route tree retained during migration
- `src/facetheory/*` — FaceTheory runtime, routes, handlers, and hydration app
- `src/lib/api/*` — GraphQL client (Apollo), queries/mutations, adapters (GraphQL → UI models)
- `src/lib/auth/*` — PKCE + token storage helpers
- `src/lib/realtime/*` — GraphQL subscriptions (`graphql-ws`)
- `src/lib/components/*` — app components (includes vendored UI surfaces from Greater)
- `src/lib/greater/*` — vendored Greater primitives/icons/content/adapters
- `src/lib/faces/*` — vendored Greater face compositions used by the rewrite
- `src/lib/styles/*` — app + Greater CSS
- `src/lib/tips/*` — TipSplitter integration + EIP-1193 provider utilities
- `docs/*` — roadmap, reference, runbook
- `facetheory.lesser.json` — Lesser install manifest for the FaceTheory app
- `scripts/write-lesser-receipt.mjs` — legacy helper for the retired static deploy path
- `scripts/externalize-sveltekit-bootstrap.mjs` — legacy CSP-safe post-step for SvelteKit output
- `components.json` — Greater Components config + pinned registry `ref`

## Common commands

Local dev / checks:

- `pnpm install`
- `pnpm dev`
- `pnpm check`
- `pnpm build`
- `pnpm preview`

Greater Components (vendored) management:

- `greater list <query>`
- `greater add <items...>`
- `greater diff [items...]`
- `greater update --all --ref <greater-tag>`
- `greater doctor`

## Deployment (dev stage)

The rewrite targets the Lesser installed-client path for a same-domain FaceTheory
app under `/l/*`. Follow `docs/runbook.md` for the current canonical install and
verification flow.

## Roadmap-driven development (when applicable)

If working from the historical roadmap docs:

- Primary roadmap: `docs/instance-frontend-roadmap.md`
- Follow-up roadmap: `docs/instance-frontend-roadmap-followup.md`

For the drones rewrite, use project 9 parent milestones together with
`docs/drones/agent-first-facetheory-contract.md`.

Rules used in this repo’s milestone workflow:

- Implement **exactly one milestone per iteration**.
- Add a short **“Done”** note under that milestone in the roadmap doc.
- Keep commits small and milestone-scoped; commit message: `feat: milestone Mx`.
- Run at least `pnpm check` after finishing a milestone.
