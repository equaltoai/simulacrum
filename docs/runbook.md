# Simulacrum Client Deploy Runbook

This runbook covers building and deploying the current FaceTheory app served at
`/l/*` to Lesser dev-stage instances. Today we actively target:

- `simulacrum` at `https://dev.simulacrum.greater.website/l/`
- `theory` at `https://dev.theory.greater.website/l/`

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

## Deploy to dev

If you just ran `pnpm build`, use `--skip-build` so the CLI installs the
artifacts you already validated locally:

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
