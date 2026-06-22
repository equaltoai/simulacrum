# Simulacrum Client Deploy Runbook

This runbook covers building and deploying the current FaceTheory app served at
`/l/*` to Lesser-owned stages. Today the steward-validated canary targets are
still the dev-stage instances:

- `simulacrum` at `https://dev.simulacrum.greater.website/l/`
- `theory` at `https://dev.theory.greater.website/l/`

The operator-authorized Theory live stage uses the base domain
`https://theory.greater.website/l/`, not a `dev.*` domain. Do not use this
runbook for production-customer Lesser instances.

## Current deploy path

Simulacrum now ships through the installed-client flow:

- build outputs live under `build/server` and `build/client`
- deployment uses `lesser client install`
- the checked-in manifest template is `facetheory.lesser.json`
- other Lesser instances should use an instance-specific manifest whose
  `app_name` matches the target instance slug

The old static upload path is retired:

- do not use `lesser client deploy`
- do not deploy from `dist/`
- `scripts/write-lesser-receipt.mjs` is for the retired static path, not the
  current FaceTheory release flow

## Prereqs

- AWS access for the target instance profile
- `node >= 24`
- `pnpm`
- `curl`

Current dev-stage targets:

| app slug | base domain | stage URL | AWS profile | local receipt |
| --- | --- | --- | --- | --- |
| `simulacrum` | `simulacrum.greater.website` | `https://dev.simulacrum.greater.website` | `Sim` | `~/.lesser/simulacrum/simulacrum.greater.website/state.json` |
| `theory` | `theory.greater.website` | `https://dev.theory.greater.website` | `Theory` | `~/.lesser/theory/theory.greater.website/state.json` |

Current principal-authorized live target:

| app slug | base domain | stage URL | AWS profile | local receipt |
| --- | --- | --- | --- | --- |
| `theory` | `theory.greater.website` | `https://theory.greater.website` | `TheoryLive` | `~/.lesser/theory/theory.greater.website/state.json` |

Stage URL rule:

- `dev` -> `https://dev.<base-domain>`
- `staging` -> `https://staging.<base-domain>`
- `live` -> `https://<base-domain>`; live deploys do **not** get `dev.*`
  domains

If the receipt is missing, bootstrap or refresh the stage from the `lesser`
repo before attempting a client install.

## Obtain a current `lesser` binary

Do not assume the `lesser` binary already on your `PATH` is new enough. The
current deploy flow requires a binary that supports `lesser client install`.

As of **2026-04-03**, the latest published `equaltoai/lesser` release is
`v1.2.15`, but the commands below fetch the current latest tag dynamically from
GitHub Releases:

```bash
mkdir -p "$HOME/.local/bin"

TAG="$(
  curl -fsSL https://api.github.com/repos/equaltoai/lesser/releases/latest \
    | node -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).tag_name"
)"

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64|Darwin-aarch64) ASSET=lesser-darwin-arm64 ;;
  Darwin-x86_64) ASSET=lesser-darwin-amd64 ;;
  Linux-x86_64) ASSET=lesser-linux-amd64 ;;
  Linux-arm64|Linux-aarch64) ASSET=lesser-linux-arm64 ;;
  *)
    echo "Unsupported platform: $(uname -s)-$(uname -m)" >&2
    exit 1
    ;;
esac

curl -fsSL -o /tmp/lesser-checksums.txt \
  "https://github.com/equaltoai/lesser/releases/download/${TAG}/checksums.txt"

curl -fL -o "$HOME/.local/bin/lesser" \
  "https://github.com/equaltoai/lesser/releases/download/${TAG}/${ASSET}"

(cd "$HOME/.local/bin" && grep "  ${ASSET}\$" /tmp/lesser-checksums.txt | shasum -a 256 -c -)
chmod +x "$HOME/.local/bin/lesser"

"$HOME/.local/bin/lesser" version
"$HOME/.local/bin/lesser" client install --help
```

Expected:

- `lesser version` prints the downloaded release version
- `lesser client install --help` succeeds and shows flags such as `--config`
  and `--skip-build`

If `client install` is missing, the binary is too old for the current
Simulacrum deploy path.

## Build

The current app is an SSR-first FaceTheory install. The deployable artifacts are
the server bundle in `build/server` and the browser assets in `build/client`.

```bash
pnpm install
pnpm check
pnpm build
```

Expected artifacts:

- `build/server/handler.mjs`
- `build/server/client-manifest.json`
- `build/client/.vite/manifest.json`
- `build/client/assets/*`
- `facetheory.lesser.json`

## Single-command operator deploy

The repo provides an operator wrapper around the manual runbook steps:

```bash
pnpm run deploy -- --target <simulacrum|theory|all> --stage <dev|staging|live>
```

The wrapper runs, in order:

1. `pnpm install --frozen-lockfile`
2. `pnpm check`
3. `pnpm build`
4. `node scripts/render-install-manifest.mjs` for each target
5. `lesser client install --skip-build`
6. curl verification for `/l/`, `/l/identity`, and `/auth/login`

Common commands:

```bash
# Canary both documented dev targets.
pnpm deploy:dev

# Deploy only one dev target.
pnpm deploy:simulacrum:dev
pnpm deploy:theory:dev

# Principal-authorized Theory live-stage deploy.
# Verifies https://theory.greater.website, never dev.theory.greater.website.
pnpm deploy:theory:live
```

Use `--dry-run` to print the exact commands without executing them:

```bash
pnpm run deploy -- --target theory --stage live --dry-run
```

The wrapper is intentionally non-interactive. It does not run from CI, does not
merge branches, does not skip review, and does not change the upstream-first,
strict-CSP, GraphQL-first, browser-validation, or agent-first gates. It only
removes copy/paste drift from an operator-approved install.

## Render an instance-specific install manifest

The checked-in `facetheory.lesser.json` is the default manifest for the
`simulacrum` instance. When deploying the same client to another Lesser
instance, render a manifest whose `app_name` matches that instance slug.

Simulacrum dev:

```bash
node scripts/render-install-manifest.mjs \
  --app simulacrum \
  --display-name Simulacrum \
  --out ./facetheory.simulacrum.lesser.json
```

Theory dev:

```bash
node scripts/render-install-manifest.mjs \
  --app theory \
  --display-name Theory \
  --out ./facetheory.theory.lesser.json
```

Expected:

- the rendered manifest keeps the shared build/server/assets paths
- `app_name` matches the Lesser instance slug you will install to
- `display_name` is instance-appropriate for receipts and install metadata

Keep rendered manifests at the repo root so `lesser client install` resolves the
app root correctly. The generated `facetheory.<app>.lesser.json` files are
gitignored. You can also use the checked-in `facetheory.lesser.json` directly
for the `simulacrum` instance if you do not need a separate output file.

## Manual deploy commands

The single-command wrapper above is preferred for routine operator deploys. If
you need to run the underlying commands by hand and you just ran `pnpm build`,
use `--skip-build` so the CLI installs the artifacts you already validated
locally.

### Dev stages

Simulacrum dev:

```bash
"$HOME/.local/bin/lesser" client install \
  --app simulacrum \
  --base-domain simulacrum.greater.website \
  --aws-profile Sim \
  --stage dev \
  --config ./facetheory.lesser.json \
  --skip-build
```

Theory dev:

```bash
"$HOME/.local/bin/lesser" client install \
  --app theory \
  --base-domain theory.greater.website \
  --aws-profile Theory \
  --stage dev \
  --config ./facetheory.theory.lesser.json \
  --skip-build
```

If you want the CLI to run the build for you, omit `--skip-build`.

What this does:

- uploads the SSR server bundle to the dev client artifact bucket
- uploads browser assets to `/l/_assets/...`
- writes a new immutable install manifest under `installs/<install-id>/`
- flips `install/current.json` to the new manifest
- invalidates CloudFront for `/l` and `/l/*`
- updates the local Lesser receipt with the active `client_install`

## Verify

Check the app root, a deep FaceTheory route, and auth:

Simulacrum dev:

```bash
curl -i -sS https://dev.simulacrum.greater.website/l/ | sed -n '1,40p'
curl -i -sS https://dev.simulacrum.greater.website/l/identity | sed -n '1,40p'
curl -i -sS https://dev.simulacrum.greater.website/auth/login | sed -n '1,40p'
```

Theory dev:

```bash
curl -i -sS https://dev.theory.greater.website/l/ | sed -n '1,40p'
curl -i -sS https://dev.theory.greater.website/l/identity | sed -n '1,40p'
curl -i -sS https://dev.theory.greater.website/auth/login | sed -n '1,40p'
```

Expected:

- `/l/` returns `200` and SSR HTML
- deep routes such as `/l/identity` return `200`
- HTML references `/l/_assets/...`
- `/auth/login` still resolves correctly on the same domain

### Theory live stage

Live-stage URLs use the base domain, not a dev subdomain. The wrapper command is
preferred:

```bash
pnpm deploy:theory:live
```

The equivalent manual install command is:

```bash
node scripts/render-install-manifest.mjs \
  --app theory \
  --display-name Theory \
  --out ./facetheory.theory.lesser.json

"$HOME/.local/bin/lesser" client install \
  --app theory \
  --base-domain theory.greater.website \
  --aws-profile TheoryLive \
  --stage live \
  --config ./facetheory.theory.lesser.json \
  --skip-build
```

Verify the live base-domain routes:

```bash
curl -i -sS https://theory.greater.website/l/ | sed -n '1,40p'
curl -i -sS https://theory.greater.website/l/identity | sed -n '1,40p'
curl -i -sS https://theory.greater.website/auth/login | sed -n '1,40p'
```

After the deploy-level checks pass, run the public browser smoke either:

- locally with `pnpm browser:test:live`
- remotely with the manual GitHub Actions workflow
  `.github/workflows/browser-live-smoke.yml`

## Project 49 hosted-genesis disposable-drone canary

This is an operator/steward follow-up after the release train is deployed in
order: `lesser-host` v1.0.5, Lesser v1.5.6, Greater `greater-v0.11.2`, then the
merged Simulacrum PR. Do not run this canary from an implementation branch and
do not run it before the installed-client deploy has completed.

Use a disposable dev-stage drone body only; never use production-customer
instances or durable research identities for the canary.

1. Confirm the Simulacrum PR is merged and installed through `lesser client
   install` by the operator.
2. Open the dev-stage Simulacrum `/l/identity/:username` surface for the
   disposable drone.
3. Confirm there is exactly one visible hosted primary action and that it
   matches Lesser `typedNextAction`.
4. Start hosted definition and send the hosted genesis message through the
   Simulacrum UI.
5. While Host/Lesser reports long in-progress genesis, reload the browser and
   confirm the state resumes from Lesser GraphQL. `REFRESH_STATE` must only
   re-query Lesser; it must not call `completeHostedSoulGenesis` as a repair.
6. If restart/supersede is returned, use only the Simulacrum restart action
   backed by Lesser `restartSoulBootstrap` and the Lesser recovery attempt id.
7. When declaration-ready, verify the UI shows Lesser terminal declaration
   evidence for the active conversation.
8. Publish only after `publishGate.canPublishHostedSoul` is true and the active
   terminal declaration evidence is present.
9. Capture evidence: route URL, visible state/action sequence, GraphQL
   operation names, reload/resume result, restart/supersede result if exercised,
   declaration-ready evidence, publish result, and Browser Live Smoke outcome.

Fail the canary and route upstream rather than working around if any of these
forbidden conditions appear: raw Host browser token or instance key, raw Host
workflow reads gating hosted genesis, fake publish, direct DynamoDB edits,
backend-log-only diagnosis, new REST data paths, or multiple visible primary
actions.

The browser-suite operating guide and API-boundary notes live in:

- [`docs/browser-validation-operating-model.md`](./browser-validation-operating-model.md)

Confirm the active install recorded in the local receipt:

Simulacrum dev:

```bash
sed -n '1,220p' ~/.lesser/simulacrum/simulacrum.greater.website/state.json
```

Theory dev:

```bash
sed -n '1,220p' ~/.lesser/theory/theory.greater.website/state.json
```

Look for:

- `stages.dev.client_install.install_id`
- `stages.dev.client_install.installed_at`
- `stages.dev.client_install.server_root`
- `stages.dev.client_install.assets_root`
