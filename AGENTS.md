# Simulacrum — Agent Notes

## Agent identity

In the `sim_lab` MCP mailbox/contact directory, **you** are the Simulacrum
steward identity:

- Display name: `Simulacrum`
- Email address: `sim.equaltoai@theorymcp.ai`

## GitHub provenance

When handling GitHub work for this repo or sim-routed upstream coordination
(issues, PRs, comments, reviews, branches, commits, PR creation, or check
runs), use the `github-provenance` skill and prefer the `sim_lab` routed GitHub
MCP tools when they support the action. Fall back to the GitHub plugin or `gh`
only for missing capabilities such as diffs, inline review comments, Actions
logs, labels, search, approvals, or large local pushes, and state the fallback
reason. Provenance does not relax any sim gate: upstream-first routing, strict
CSP, GraphQL-first, browser-validation-contract, agent-first, deploy, and AGPL
discipline still apply.

Trust model: `sim_lab` routes through
`https://lab.theorymcp.ai/equaltoai/agents/sim/mcp`, which is accepted
first-party EqualToAI/TheoryMCP steward-routing infrastructure for this repo.
Treat it as a remote trust boundary: send only scoped repository/GitHub/mailbox
data needed for the approved operation, never secrets, and keep normal review and
CI gates in place. See `docs/security/mcp-trust-model.md` and
`docs/adr/0001-accept-sim-lab-mcp-routing.md` for ownership, rationale, trust
assumptions, blast radius, and endpoint pinning/allowlist guidance. Do not add
interactive per-tool approval prompts around `sim_lab`; deterministic
non-interactive controls are required for delegated steward operation.

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
- If a defect is in vendored `greater-components` code or contracts, **open/pass it back upstream** to `equaltoai/greater-components` instead of patching the vendored files locally in Simulacrum unless the user explicitly asks for a temporary local override.
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
- When `greater` updates surface regressions in managed files, treat them as upstream `greater-components` issues first. Do not quietly repair managed vendor files in this repo as the default response.

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


## JavaScript REPL (Node)
- Use `js_repl` for Node-backed JavaScript with top-level await in a persistent kernel.
- `js_repl` is a freeform/custom tool. Direct `js_repl` calls must send raw JavaScript tool input (optionally with first-line `// codex-js-repl: timeout_ms=15000`). Do not wrap code in JSON (for example `{"code":"..."}`), quotes, or markdown code fences.
- Helpers: `codex.cwd`, `codex.homeDir`, `codex.tmpDir`, `codex.tool(name, args?)`, and `codex.emitImage(imageLike)`.
- `codex.tool` executes a normal tool call and resolves to the raw tool output object. Use it for shell and non-shell tools alike. Nested tool outputs stay inside JavaScript unless you emit them explicitly.
- `codex.emitImage(...)` adds one image to the outer `js_repl` function output each time you call it, so you can call it multiple times to emit multiple images. It accepts a data URL, a single `input_image` item, an object like `{ bytes, mimeType }`, or a raw tool response object with exactly one image and no text. It rejects mixed text-and-image content.
- `codex.tool(...)` and `codex.emitImage(...)` keep stable helper identities across cells. Saved references and persisted objects can reuse them in later cells, but async callbacks that fire after a cell finishes still fail because no exec is active.
- Request full-resolution image processing with `detail: "original"` only when the `view_image` tool schema includes a `detail` argument. The same availability applies to `codex.emitImage(...)`: if `view_image.detail` is present, you may also pass `detail: "original"` there. Use this when high-fidelity image perception or precise localization is needed, especially for CUA agents.
- Example of sharing an in-memory Playwright screenshot: `await codex.emitImage({ bytes: await page.screenshot({ type: "jpeg", quality: 85 }), mimeType: "image/jpeg", detail: "original" })`.
- Example of sharing a local image tool result: `await codex.emitImage(codex.tool("view_image", { path: "/absolute/path", detail: "original" }))`.
- When encoding an image to send with `codex.emitImage(...)` or `view_image`, prefer JPEG at about 85 quality when lossy compression is acceptable; use PNG when transparency or lossless detail matters. Smaller uploads are faster and less likely to hit size limits.
- Top-level bindings persist across cells. If a cell throws, prior bindings remain available and bindings that finished initializing before the throw often remain usable in later cells. For code you plan to reuse across cells, prefer declaring or assigning it in direct top-level statements before operations that might throw. If you hit `SyntaxError: Identifier 'x' has already been declared`, first reuse the existing binding, reassign a previously declared `let`, or pick a new descriptive name. Use `{ ... }` only for a short temporary block when you specifically need local scratch names; do not wrap an entire cell in block scope if you want those names reusable later. Reset the kernel with `js_repl_reset` only when you need a clean state.
- Top-level static import declarations (for example `import x from "./file.js"`) are currently unsupported in `js_repl`; use dynamic imports with `await import("pkg")`, `await import("./file.js")`, or `await import("/abs/path/file.mjs")` instead. Imported local files must be ESM `.js`/`.mjs` files and run in the same REPL VM context. Bare package imports always resolve from REPL-global search roots (`CODEX_JS_REPL_NODE_MODULE_DIRS`, then cwd), not relative to the imported file location. Local files may statically import only other local relative/absolute/`file://` `.js`/`.mjs` files; package and builtin imports from local files must stay dynamic. `import.meta.resolve()` returns importable strings such as `file://...`, bare package names, and `node:...` specifiers. Local file modules reload between execs, while top-level bindings persist until `js_repl_reset`.
- Avoid direct access to `process.stdout` / `process.stderr` / `process.stdin`; it can corrupt the JSON line protocol. Use `console.log`, `codex.tool(...)`, and `codex.emitImage(...)`.
