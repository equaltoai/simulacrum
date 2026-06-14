# Soul Bootstrap Recovery Upstream Gaps

Date: 2026-06-13
Owner: Simulacrum steward
Context: TheoryLive first live soul-bootstrap test

## Background

Simulacrum now treats soul definition as a hard reversible/resumable web
process until Lesser reports the hosted/off-chain soul as bound. The client can
show a canonical next step and can offer a GraphQL-first restart affordance by
calling `beginSoulBootstrap` with a fresh client idempotency key and selected
wallet. That is the right in-instance UX posture, but two upstream guarantees
are still required for the stack to make the invariant durable instead of best
effort.

TheoryLive first-live testing also exposed a deeper product-contract mismatch:
the current Lesser/Host bootstrap contract still assumes the old on-chain mint
ceremony. It requires a wallet challenge, principal declaration digest, retained
wallet signature, and later boundary/finalize signatures even when the desired
result is only a hosted/off-chain bound soul. That is massive overkill for the
hosted/off-chain path and creates exactly the irreversible browser friction the
agent-first rewrite is supposed to remove.

Hosted/off-chain soul definition must be its own first-class path:

```text
select local drone
  -> start/resume hosted soul definition through Lesser
  -> run/complete genesis conversation
  -> review generated declarations
  -> publish hosted/off-chain bound soul by Lesser/Host instance trust
  -> optional later wallet/on-chain upgrade path
```

The browser should not be asked to collect wallet signatures on that default
hosted path. Wallet proof, principal declaration, boundary signatures, and
on-chain mint material belong to an explicit later upgrade path, not the first
live hosted/off-chain bootstrap.

## Upstream issue draft: Hosted/off-chain soul bootstrap must not require wallet/principal ceremony

### Target repos

`equaltoai/lesser` and `equaltoai/lesser-host`

### Observed in sim

- Surface: Lesser same-origin GraphQL soul-bootstrap mutations backed by
  `lesser-host` instance-key registration routes.
- Context: TheoryLive first live hosted/off-chain soul definition for local
  drones from Simulacrum.
- Impact: The operator is forced through a wallet challenge, Host principal
  declaration preflight, principal digest signing, retained browser-session
  wallet signature replay, and later signing material even though no on-chain
  soul is being minted. One stale session or wrong wallet leaves the process
  stuck in `ERROR` or a restart loop.

### Evidence

Current upstream contracts hard-code the on-chain ceremony into the hosted path:

- Lesser GraphQL `BeginSoulBootstrapInput` requires `walletAddress`.
- Lesser GraphQL exposes `verifySoulBootstrapWallet`,
  `prepareSoulBootstrapPrincipalDeclaration`, and
  `verifySoulBootstrapPrincipalDeclaration` as mandatory state-machine steps.
- Host `/api/v1/soul/instance/agents/register/{id}/verify` requires both the
  wallet signature and principal declaration signature before registration
  becomes completed.
- Host mint-conversation finalize rejects records whose identity is missing
  `PrincipalAddress`, `PrincipalSignature`, `PrincipalDeclaration`, and
  `PrincipalDeclaredAt`, even when publishing hosted/off-chain.

### Expected upstream contract

Add a first-class hosted/off-chain bootstrap mode that is authenticated by
Lesser same-origin auth plus Host instance trust, not by browser wallet
ceremony.

At minimum:

1. Lesser should expose a hosted/off-chain GraphQL flow where `walletAddress`
   is optional or absent for the default path.
2. Host should allow instance-key registration/conversation/finalize for
   hosted/off-chain souls without principal declaration fields.
3. Hosted/off-chain publication should bind the same local body to the same
   hosted soul namespace with `anchor_state=hosted_offchain`.
4. Wallet/principal declaration/on-chain signing should move to a separate
   explicit upgrade path that can promote the hosted identity to
   immutable/on-chain assurance later.
5. The hosted flow must remain reversible/resumable until final binding and must
   expose durable restart/resume semantics.

### Why this is upstream

Simulacrum cannot safely skip these steps locally because Lesser and Host
currently reject later mutations when wallet/principal fields are absent. A
local bypass would silently diverge the client from the pinned GraphQL/Host
contract and would strand the process at genesis or finalize. The required fix
is a Lesser/Host contract change: hosted/off-chain soul definition must no
longer depend on on-chain-era wallet ceremony.

### Sim workaround posture

Sim should not keep polishing the wallet/principal ceremony as the default
hosted/off-chain product path. Until Lesser/Host expose the hosted-first
contract, Sim can only:

- show the current backend state honestly,
- keep restart/recovery available before final binding,
- avoid Host-token/raw-Host browser workarounds, and
- adopt the hosted-first GraphQL contract as soon as upstream lands it.

## Upstream issue draft: Lesser soul bootstrap needs durable reset/restart semantics

### Target repo

`equaltoai/lesser`

### Observed in sim

- Surface: Lesser same-origin GraphQL soul-bootstrap mutations.
- Context: `/l/identity/:username`, `/l/souls/genesis`, and `/l/approvals`
  during Project 44 soul genesis.
- Impact: A pre-binding state can currently become `ERROR` after Host rejects a
  request, a Host registration expires, a browser session loses signing
  material, or the operator selected the wrong wallet. Simulacrum can expose a
  restart button, but the pinned GraphQL contract has no explicit reset/restart
  mutation or restart flag; it relies on `beginSoulBootstrap` being accepted with
  fresh idempotency.

### Expected upstream contract

Before final binding, Lesser should expose a durable recovery primitive that:

1. accepts the local body username and intended wallet,
2. invalidates or supersedes stale Host registration/conversation state,
3. creates a fresh Host registration/challenge,
4. returns the new `SoulBootstrapSurface`, and
5. is idempotent per explicit recovery attempt.

This could be an explicit `restartSoulBootstrap` mutation, or documented
`beginSoulBootstrap` semantics that guarantee restart from every unbound
pre-binding phase including `ERROR`, `BEGIN`, `WALLET_VERIFICATION`,
`PRINCIPAL_DECLARATION`, `CONVERSATION`, and `FINALIZE`.

### Why this is upstream

Simulacrum must remain GraphQL-first and cannot safely mutate Host state or
fabricate Lesser state in the browser. The reset/resume guarantee belongs to the
same-origin backend that owns body state and Host bridge coordination.

### Sim workaround posture

Sim currently offers a UI-level recovery path that calls `beginSoulBootstrap`
with a fresh idempotency key and clears registration-scoped browser session
state. This is safe and GraphQL-first, but it should be treated as best-effort
until Lesser documents or exposes the durable restart primitive.

## Upstream issue draft: Lesser/Host should preserve actionable Host error details

### Target repos

`equaltoai/lesser` and `equaltoai/lesser-host`

### Observed in sim

Live TheoryLive testing surfaced multiple Host failures that arrived in
Simulacrum as generic messages:

- Host invalid principal declaration payload became `HOST_INVALID_REQUEST` /
  `Host rejected the bootstrap request`.
- Host invalid signature boundary became a generic instance-trust rejection.
- Host budget/config conflict became a generic bootstrap conflict.
- Expired/deleted Host registration became `Host registration was not found`.

The UI can show a recovery path, but operators need precise, actionable backend
meaning to distinguish user-recoverable states from operator/config failures.

### Expected upstream contract

Lesser should preserve stable error categories and next-action hints from Host,
for example:

- `HOST_REGISTRATION_EXPIRED` -> restart required
- `HOST_SIGNATURE_INVALID` -> re-sign current challenge or restart
- `HOST_PRINCIPAL_DECLARATION_INVALID` -> prepare a fresh declaration or restart
- `HOST_BUDGET_REQUIRED` -> operator must configure credits, then retry genesis
- `HOST_CONFLICT_ALREADY_COMPLETED` -> refresh and resume/bind, not blind retry

Each `SoulBootstrapErrorState` should include a recovery classification such as
`retry_same_step`, `restart_required`, `operator_action_required`, or
`refresh_state`, while keeping Host credentials server-side.

### Why this is upstream

The browser cannot infer Host semantics from lossy messages without becoming a
Host client or scraping logs. Lesser and lesser-host own the error envelope and
state-machine semantics.

### Sim workaround posture

Sim keeps the operator in the same-origin flow, shows the latest Lesser message,
refreshes after mutation failures, and exposes restart/re-sign recovery before
final binding. It will adopt richer error categories when Lesser/Host expose
them.
