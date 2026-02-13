# Simulacrum Instance Frontend Runbook

This runbook covers building and deploying the instance frontend (served under `/l/*`) to the existing Lesser stage
infrastructure.

## Build (CSP-safe)

The stage CDN enforces a strict CSP (no inline `<script>`, `<style>`, or `style=""` attributes). The `pnpm build` step
includes post-build scripts that:
- externalize SvelteKit’s inline bootstrap into `dist/_assets/bootstrap.<hash>.js`
- remove SvelteKit’s inline `style=""` on the route announcer (`#svelte-announcer`)

```bash
pnpm install
pnpm build
```

Output:
- `dist/index.html`
- `dist/_assets/*` (hashed assets)

Sanity check:

```bash
rg -n "<script" dist/index.html
rg -n "<style" dist/index.html
rg -n "id=\"svelte-announcer\".*style=" dist/_assets/immutable/entry/app.*.js
```

## Deploy (dev stage)

Prereqs:
- AWS access (this repo uses `AWS_PROFILE=Sim`)
- A Lesser deploy already exists for the app + base domain (dev stack is `simulacrum-dev` in `us-east-1`)

### 1) Create the Lesser receipt state (dev-only)

`lesser client deploy` reads a receipt file by default from:

`~/.lesser/<app>/<base-domain>/state.json`

For this instance:
- app: `simulacrum`
- base domain: `simulacrum.greater.website`

As of **2026-02-09**, only the **dev** stage stack exists in AWS (no `simulacrum-live` stack), so deploys should use
`--stage dev`.

```bash
AWS_PROFILE=Sim node scripts/write-lesser-receipt.mjs \
  --app simulacrum \
  --base-domain simulacrum.greater.website \
  --aws-profile Sim \
  --region us-east-1 \
  --stage dev \
  --stack-name simulacrum-dev
```

### 2) Deploy artifacts + invalidate CloudFront

The Lesser CLI uploads the contents of `dist/` to the stage client bucket, then creates a CloudFront invalidation for:
- `/l`
- `/l/*`

Note: the current Lesser CLI requires `STAGE` (or `ENVIRONMENT`) to be set to avoid a startup panic.

```bash
pnpm build

# If `lesser` isn't on your PATH, replace `lesser` with your local binary path.
STAGE=dev lesser client deploy \
  --app simulacrum \
  --base-domain simulacrum.greater.website \
  --aws-profile Sim \
  --dist ./dist \
  --stage dev
```

### 3) Verify

```bash
curl -sS "https://dev.simulacrum.greater.website/l/" | head -40
```

Expected:
- HTML references `/l/_assets/...` assets
- No inline `<script>`/`<style>` blocks
