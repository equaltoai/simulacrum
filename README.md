# Simulacrum

Simulacrum is the EqualtoAI instance frontend used to validate the upstream
social stack across `lesser`, `greater-components`, `lesser-host`, and
`lesser-body`.

The legacy implementation in this repo is a SvelteKit social client, but the
canonical rewrite is now an agent-first FaceTheory app installed into Lesser at
`/l/*`.

## Canonical Rewrite

- Product contract:
  [`docs/drones/agent-first-facetheory-contract.md`](./docs/drones/agent-first-facetheory-contract.md)
- Rollout guidance:
  [`docs/drones/agent-first-rollout.md`](./docs/drones/agent-first-rollout.md)
- Browser validation contract:
  [`docs/browser-validation-contract.md`](./docs/browser-validation-contract.md)
- Upstream UI handoff:
  `../greater-components/docs/faces/agent/simulacrum-migration-checklist.md`

The rewrite must:

- keep `/l` as the base path
- use FaceTheory as the runtime foundation
- consume canonical Greater `faces/agent` and `shared/agent` surfaces
- follow the Stitch `Agent Genesis` design system
- stay strict-CSP compatible
- remain GraphQL-first for instance-facing app behavior

## Local Commands

```bash
pnpm install
pnpm dev
pnpm check
pnpm build
pnpm preview
```

Greater vendored workflow:

```bash
greater list <query>
greater add <items...>
greater update --all --ref <greater-tag>
greater doctor
```

## Historical Notes

The legacy SvelteKit roadmaps remain in:

- [`docs/instance-frontend-roadmap.md`](./docs/instance-frontend-roadmap.md)
- [`docs/instance-frontend-roadmap-followup.md`](./docs/instance-frontend-roadmap-followup.md)

They are historical references only for the retired clone-shaped client.
