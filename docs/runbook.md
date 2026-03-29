# Simulacrum FaceTheory Runbook

This runbook covers the canonical Simulacrum deployment shape after the
Project 9 rewrite:

- Simulacrum is a FaceTheory SSR client served from the instance at `/l/*`
- Lesser owns the shared host resources and install manifest
- normal releases use `lesser client install`
- `lesser client deploy` is retired for this app

The authoritative cross-repo contract remains
`docs/drones/agent-first-facetheory-contract.md`.

## Build

Prereqs:

- Node `>=24`
- `pnpm`
- a local checkout that includes `@theory-cloud/facetheory`

Default build:

```bash
pnpm install
pnpm build
```

Optional dev-stage bridge enablement for live lesser-host conversation and
finalize verification:

```bash
VITE_SIMULACRUM_ENABLE_HOST_WORKFLOW_BRIDGE=1 pnpm build
```

Expected output:

- `build/client`
- `build/client/.vite/manifest.json`
- `build/server/handler.mjs`
- `build/server/client-manifest.json`
- `facetheory.lesser.json`

Sanity checks:

```bash
test -f build/server/handler.mjs
test -f build/server/client-manifest.json
test -f build/client/.vite/manifest.json
rg -n '"/l/_assets/|/l/_assets/' build/server/client-manifest.json build/client/.vite/manifest.json
```

## Install

Prereqs:

- Lesser stage infrastructure already exists via `lesser up`
- the local receipt exists at
  `~/.lesser/simulacrum/simulacrum.greater.website/state.json`
- AWS access is available through `AWS_PROFILE=Sim`

Canonical install command for `dev`:

```bash
AWS_PROFILE=Sim STAGE=dev lesser client install \
  --app simulacrum \
  --base-domain simulacrum.greater.website \
  --aws-profile Sim \
  --stage dev \
  --config ./facetheory.lesser.json
```

Notes:

- run from this repo root
- use `--skip-build` only when you already built the exact release locally
- `lesser client install` uploads SSR server artifacts, uploads `/l/_assets/*`,
  flips the active install manifest, and invalidates CloudFront for `/l` routes

## Verify

After install, confirm the canonical in-instance route set works from the
instance domain:

```bash
curl -i https://dev.simulacrum.greater.website/l/
curl -i 'https://dev.simulacrum.greater.website/l/souls?agent=lyra'
curl -i 'https://dev.simulacrum.greater.website/l/approvals?agent=lyra'
curl -i https://dev.simulacrum.greater.website/auth/login
```

Expected results:

- `/l/` returns SSR HTML for the FaceTheory app
- deep `/l/*` routes resolve without SPA fallback assumptions
- browser assets load from `/l/_assets/*`
- `/auth/*` still resolves through Lesser auth-ui on the same origin

Optional receipt and manifest verification:

```bash
AWS_PROFILE=Sim aws s3 cp \
  s3://$(jq -r '.stages.dev.stack_outputs.ClientArtifactBucketName' ~/.lesser/simulacrum/simulacrum.greater.website/state.json)/install/current.json \
  -
```

## Rollout

Canonical user path:

1. request from `/l/souls`
2. review and approval from `/l/souls` and `/l/approvals`
3. mint conversation from `/l/souls/genesis`
4. finalize from `/l/approvals`
5. continuity and attribution review from `/l/identity`

Operational rules:

- Simulacrum is the canonical human-facing soul workflow surface
- `lesser-host` remains the control-plane backend, not the canonical portal UI
- request, review, continuity, and identity should always remain usable
  in-instance
- live lesser-host conversation and finalize actions stay behind
  `VITE_SIMULACRUM_ENABLE_HOST_WORKFLOW_BRIDGE=1` until deliberately enabled for
  a release

Rollback:

- check out the last known good revision of this repo
- rerun `lesser client install` from that revision
