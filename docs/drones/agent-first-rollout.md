# Agent-First FaceTheory Rollout

This document captures the rollout posture for the Project 9 rewrite.

## Canonical Product Path

Simulacrum remains the canonical in-instance UX for the drone-to-soul lifecycle:

1. request a soul from `/l/souls`
2. review request state and notifications from Simulacrum surfaces
3. conduct the mint conversation from `/l/souls/genesis` once the backend
   creation bridge is available
4. finalize and sign from `/l/approvals` once the backend creation bridge is
   available
5. inspect continuity, attribution, and reachability from `/l/identity`

`lesser-host` remains the publication and control-plane backend. Its portal is
not the canonical user-facing workflow.

## Current Creation Boundary

Project 44 remediation removes the browser Host-token bridge from production
rollout guidance. M4.1 vendors the Greater `greater-v0.10.3` soul-bootstrap
facade and routes Simulacrum's Project 44 API layer through Lesser same-origin
GraphQL. Visible soul-creation UX remains parked for M4.2/M4.3.

Do not ship or canary a browser prompt for `lesser-host` control-plane
credentials. Provisioned Lesser instances already hold their Host trust
server-side; the installed client must wait for same-origin instance trust
instead of asking the browser to carry a Host bearer token.

Hosted/off-chain creation can return visibly to Simulacrum only after both gates
are true:

- Lesser exposes a same-origin instance-trust creation bridge for installed
  clients.
- Simulacrum consumes that bridge through the Greater soul-bootstrap facade
  without direct Host write wrappers.

Until then:

- request, review, identity, and continuity remain live in Simulacrum
- the client renders the canonical FaceTheory route map
- `/l/souls/genesis` and `/l/approvals` show the parked same-origin bootstrap
  lane rather than an operator-enableable flag
- no deploy/install environment variable is a supported way to enable direct
  Host control-plane writes from the browser

## Verification Scope

Before promoting a build as the active dev-stage release, verify:

- FaceTheory SSR renders `/l/`, `/l/souls`, `/l/souls/genesis`,
  `/l/approvals`, and `/l/identity`
- the request lane works from Simulacrum without sending the user to the
  `lesser-host` portal
- mint conversation and finalize surfaces do not ask for a `lesser-host`
  control-plane token
- disabled-state copy names the same-origin bootstrap boundary and the
  M4.2/M4.3 UX deferral
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
- do not enable a browser Host-token workflow bridge for verification or rollout
  windows
- route soul-creation enablement through the Lesser bridge and Greater adapter
  milestones before restoring browser creation UX
- if a release regresses the agent-first flow, roll back by reinstalling the
  previous good revision
