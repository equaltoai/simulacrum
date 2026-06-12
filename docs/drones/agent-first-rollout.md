# Agent-First FaceTheory Rollout

This document captures the rollout posture for the Project 9 rewrite.

## Canonical Product Path

Simulacrum is now the canonical in-instance UX for the drone-to-soul lifecycle:

1. create or select a local drone body from `/l/drones` or `/l/identity`
2. request/review local workflow state from Simulacrum surfaces when needed
3. begin and verify the Host registration from `/l/identity`
4. conduct the registration-scoped mint conversation from `/l/souls/genesis`
5. finalize and sign from `/l/approvals`
6. inspect continuity, attribution, and reachability from `/l/identity`

`lesser-host` remains the publication and control-plane backend. Its portal is
not the canonical user-facing workflow and is not an acceptable fallback for the
production bootstrap path.

## Default Host Workflow Bridge

The Host workflow bridge is part of the default production Simulacrum client.
There is no deploy/install flag for enabling the bridge, and operators should not
ship a build that hides the Simulacrum-led `/l/identity` bootstrap lane.

Live Host actions still require runtime configuration:

- Lesser must expose the managed `lesser-host` trust base URL through the
  instance configuration.
- Authenticated operators must provide the existing `lesser-host` control-plane
  bearer token in the Host token panel.
- Missing base URL or missing token states are actionable configuration states in
  the UI, not disabled-build states.

The client must continue to use the existing control-plane bearer token model
until a first-party server-side proxy or equivalent contract replaces it. Do not
reintroduce an instance-key zero-state creation path, and do not route operators
to the Host portal as the production fallback.

## Verification Scope

Before promoting a build as the active dev-stage release, verify:

- FaceTheory SSR renders `/l/`, `/l/souls`, `/l/souls/genesis`,
  `/l/approvals`, and `/l/identity`
- the `/l/identity` bootstrap lane is visible in a normal production build when
  no Lesser bound soul exists
- missing `lesser-host` base URL and missing control-plane token states render as
  actionable configuration guidance
- the request lane works from Simulacrum without sending the user to the
  `lesser-host` portal
- review, approval, and continuity states remain legible inside the FaceTheory
  surfaces
- drone runtime boundaries remain explicit:
  - no wallet or comms surface before promotion
  - same-body continuity remains visible after graduation
- the Ethereal Editorial design system remains recognizable in the implemented
  surfaces

## Cutover Guidance

- treat the legacy SvelteKit shell as historical only
- use `lesser client install` for releases; do not use `lesser client deploy`
- run a normal `pnpm build` as the deploy proof; no bridge env var is required
- if a release regresses the agent-first flow, roll back by reinstalling the
  previous good revision
