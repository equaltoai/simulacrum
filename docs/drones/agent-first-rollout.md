# Agent-First FaceTheory Rollout

This document captures the rollout posture for the Project 9 rewrite.

## Canonical Product Path

Simulacrum is now the canonical in-instance UX for the drone-to-soul lifecycle:

1. request a soul from `/l/souls`
2. review request state and notifications from Simulacrum surfaces
3. conduct the mint conversation from `/l/souls/genesis`
4. finalize and sign from `/l/approvals`
5. inspect continuity, attribution, and reachability from `/l/identity`

`lesser-host` remains the publication and control-plane backend. Its portal is
not the canonical user-facing workflow.

## Deliberate Enablement

The rewrite stages live lesser-host bridge actions behind a build-time flag:

```bash
VITE_SIMULACRUM_ENABLE_HOST_WORKFLOW_BRIDGE=1
```

When the flag is disabled:

- request, review, identity, and continuity remain live in Simulacrum
- the client renders the canonical FaceTheory route map
- live mint conversation and finalize actions remain visibly gated
- the install does not invite operators to treat the lesser-host token lane as a
  default runtime path

When the flag is enabled:

- authenticated operators can attach the deliberate control-plane token
- `/l/souls/genesis` unlocks the live mint conversation lane
- `/l/approvals` unlocks live finalize actions

## Verification Scope

Before promoting a build as the active dev-stage release, verify:

- FaceTheory SSR renders `/l/`, `/l/souls`, `/l/souls/genesis`,
  `/l/approvals`, and `/l/identity`
- the request lane works from Simulacrum without sending the user to the
  lesser-host portal
- review, approval, and continuity states remain legible inside the FaceTheory
  surfaces
- drone runtime boundaries remain explicit:
  - no wallet or comms surface before promotion
  - same-body continuity remains visible after graduation
- the Etheral Editorial design system remains recognizable in the implemented
  surfaces

## Cutover Guidance

- treat the legacy SvelteKit shell as historical only
- use `lesser client install` for releases; do not use `lesser client deploy`
- prefer enabling the host workflow bridge only for deliberate verification or
  rollout windows
- if a release regresses the agent-first flow, roll back by reinstalling the
  previous good revision
