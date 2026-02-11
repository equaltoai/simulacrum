# Simulacrum — Agent Notes

## What is this repo?

`simulacrum` is an **instance frontend** (SvelteKit static SPA) for the EqualtoAI social stack. It’s a prototype
deployment used to validate and evolve:

- **Lesser** (the backend + GraphQL contracts)
- **greater-components** (UI kit + adapters generated from Lesser contracts)
- **lesser-host** (managed hosting + trust/safety + AI services + tipping)

Simulacrum is also used for a school research project on **generative AI and synthetic threats**, and is intended to
host a community of **LLM bot accounts** (federation can exist in Lesser, but this instance is intentionally private).

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

## Non-negotiable constraints (do not break)

- **Base path must remain `/l`** (see `svelte.config.js`).
- **Strict CSP compatibility**: no inline `<script>` or `<style>`.
  - Keep `kit.inlineStyleThreshold = 0` and do not introduce inline styles/scripts.
  - `pnpm build` runs `scripts/externalize-sveltekit-bootstrap.mjs` to externalize SvelteKit’s bootstrap script.
- **Use pnpm** (avoid npm).
- **Auth flow**: use Lesser `auth-ui` + OAuth Authorization Code + PKCE.
  - Do not re-implement the auth UI inside the client.
- **GraphQL-first** for app functionality.
  - If GraphQL is missing something needed for the UI, **stop and open an issue** against `equaltoai/lesser` and/or
    `equaltoai/greater-components`. Do **not** add REST workarounds.
  - Exception: wallet/auth flows are intentionally REST-only per Lesser policy (e.g. `/auth/wallet/*`).
- **No hard-coded domains**: derive hosts from `window.location.origin`.

## Repo map

- `src/routes/*` — SvelteKit pages (deployed under `/l/*`)
- `src/lib/api/*` — GraphQL client (Apollo), queries/mutations, adapters (GraphQL → UI models)
- `src/lib/auth/*` — PKCE + token storage helpers
- `src/lib/realtime/*` — GraphQL subscriptions (`graphql-ws`)
- `src/lib/components/*` — app components (includes vendored UI surfaces from Greater)
- `src/lib/greater/*` — vendored Greater primitives/icons/content/adapters
- `src/lib/styles/*` — app + Greater CSS
- `src/lib/tips/*` — TipSplitter integration + EIP-1193 provider utilities
- `docs/*` — roadmap, reference, runbook
- `scripts/write-lesser-receipt.mjs` — writes the Lesser deploy receipt for `lesser client deploy`
- `scripts/externalize-sveltekit-bootstrap.mjs` — CSP-safe build post-step
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

This client is deployed as static assets under `/l/*` to the existing Lesser stage infrastructure.
Follow `docs/runbook.md` (AWS profile is typically `AWS_PROFILE=Sim`; stage is typically `dev`).

## Roadmap-driven development (when applicable)

If working from the roadmap docs:

- Primary roadmap: `docs/instance-frontend-roadmap.md`
- Follow-up roadmap: `docs/instance-frontend-roadmap-followup.md`

Rules used in this repo’s milestone workflow:

- Implement **exactly one milestone per iteration**.
- Add a short **“Done”** note under that milestone in the roadmap doc.
- Keep commits small and milestone-scoped; commit message: `feat: milestone Mx`.
- Run at least `pnpm check` after finishing a milestone.

