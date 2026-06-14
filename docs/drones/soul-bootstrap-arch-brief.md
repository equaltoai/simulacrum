# Arch Brief: Hosted/Off-chain Soul Bootstrap Contract Reset

Date: 2026-06-13  
Author: Simulacrum steward  
Audience: Arch, Architecture Sounding Board for the Lesser Soul ecosystem  
Status: design handoff; do not treat this as an implementation plan until Arch
pressure-tests the upstream shape

## Analysis tier

Tier 1 grounded analysis for the current contract and failure locus. Evidence
comes from current Simulacrum worktree plus read-only inspection of sibling
`lesser` and `lesser-host` code. Tier 2 inference is called out where this
brief proposes an upstream target shape.

## Executive summary

TheoryLive's first live Simulacrum soul-bootstrap test exposed that the current
hosted/off-chain path still carries the old on-chain soul mint ceremony:
browser wallet selection, wallet challenge signing, principal declaration
preflight, principal declaration signing, retained browser-session wallet
signature replay, and later finalize signing.

That is the wrong default product contract for hosted/off-chain soul definition.
The intended reality is that a hosted/off-chain soul can be defined, reviewed,
and bound through Lesser same-origin auth plus Lesser's server-side Host
instance trust, with no browser wallet ceremony. Wallet proof, principal
declaration, Safe/on-chain material, and immutable/on-chain assurance should be
an explicit later upgrade path.

The current Sim UI can improve recovery around the existing backend, but it
cannot safely skip the wallet/principal ceremony locally because Lesser/Host
currently enforce those fields. This is an upstream contract decision spanning
`lesser`, `lesser-host`, Greater adapters, and Sim.

## Current observed situation

Live TheoryLive testing produced a brittle, unusable operator experience:

- a wrong wallet could be attached early and then felt locked into the process
- stale browser/session-only signing material caused repeated dead ends
- the UI surfaced no clear successful next step after approval/signing
- principal declaration verification failed with generic messages such as
  `Host rejected the instance trust credential`
- genesis conversation failed with Host conflict / registration-not-found states
- every small mistake required backend/log inspection or restart guesswork

The underlying product mismatch is stronger than a UI bug: the ceremony itself
is unnecessary for the desired hosted/off-chain result.

## Current contract evidence

### Simulacrum boundary

Simulacrum is correctly staying GraphQL-first and same-origin:

```text
Sim browser -> Lesser GraphQL -> Lesser server-side Host instance trust -> Host
```

Sim must not patch around this with browser-held Host credentials or raw Host
write calls.

### Lesser GraphQL currently requires the wallet-era state machine

Evidence from `../lesser/docs/contracts/graphql-schema.graphql`:

- `BeginSoulBootstrapInput` requires `walletAddress` at line 4871.
- `VerifySoulBootstrapWalletInput` exists at line 4879.
- `PrepareSoulBootstrapPrincipalDeclarationInput` exists at line 4887.
- `VerifySoulBootstrapPrincipalDeclarationInput` exists at line 4897.

Evidence from `../lesser/graph/soul_bootstrap_resolvers.go`:

- `BeginSoulBootstrap` starts at line 50.
- `VerifySoulBootstrapWallet` starts at line 81.
- `PrepareSoulBootstrapPrincipalDeclaration` starts at line 110.
- `VerifySoulBootstrapPrincipalDeclaration` starts at line 141.
- `SendSoulBootstrapConversationMessage` only comes after those at line 174.

This contract makes wallet/principal ceremony part of the default same-origin
bootstrap path, not an optional on-chain upgrade.

### lesser-host currently enforces wallet and principal verification

Evidence from `../lesser-host/internal/controlplane/handlers_soul_instance_bootstrap.go`:

- `handleSoulInstanceAgentRegistrationVerify` starts at line 118.
- `handleSoulInstanceMintConversation` starts at line 144.
- `verifySoulInstanceAgentRegistration` starts at line 382.
- verification calls `verifySoulAgentRegistrationWallet` at line 399.
- verification calls `validateSoulRegistrationVerifyPrincipalInputs` at line
  408.
- instance finalize rejects missing principal declaration at line 321.

Evidence from `../lesser-host/internal/controlplane/handlers_soul_registry.go`:

- `verifySoulAgentRegistrationWallet` starts at line 675.
- `validateSoulRegistrationVerifyPrincipalInputs` starts at line 1210.

Evidence from `../lesser-host/internal/controlplane/handlers_soul_mint_conversation.go`:

- finalize/preflight paths reject missing principal declaration with
  `principal declaration is missing; re-verify registration` at lines 445,
  1280, and 1315.

Therefore Sim cannot locally bypass the ceremony and expect genesis/finalize to
complete.

## Intended reality

Hosted/off-chain soul definition should be a first-class path:

```text
select local drone
  -> start/resume hosted soul definition through Lesser
  -> run/complete genesis conversation
  -> review generated declarations
  -> publish hosted/off-chain bound soul by Lesser/Host instance trust
  -> optional later wallet/on-chain assurance upgrade
```

Default hosted/off-chain path requirements:

1. No required browser wallet address.
2. No required browser wallet challenge signature.
3. No required principal declaration digest signature.
4. No required boundary/final self-attestation signature.
5. Reversible/resumable until final binding.
6. One canonical next step in Sim at every state.
7. Truthful display that hosted/off-chain assurance is not immutable/on-chain
   assurance.

Wallet and on-chain material should become explicit upgrade semantics, for
example:

```text
hosted/off-chain bound soul
  -> optional principal/wallet proof
  -> optional on-chain mint / immutable assurance
```

The upgrade must preserve the same agent namespace; it must not fork the soul.

## Strawman upstream direction for Arch to pressure-test

This section is Tier 2 inference from the evidence above.

### Option A: add a distinct hosted/off-chain route family

Add new Lesser GraphQL operations and Host instance-key endpoints for hosted
souls, leaving the existing wallet/principal registration flow as the immutable
on-chain upgrade path.

Possible Lesser GraphQL surface:

```graphql
mutation startHostedSoulBootstrap(input: StartHostedSoulBootstrapInput!): SoulBootstrapMutationPayload!
mutation sendHostedSoulGenesisMessage(input: SendHostedSoulGenesisMessageInput!): SoulBootstrapMutationPayload!
mutation completeHostedSoulGenesis(input: CompleteHostedSoulGenesisInput!): SoulBootstrapMutationPayload!
mutation publishHostedSoul(input: PublishHostedSoulInput!): SoulBootstrapMutationPayload!
mutation restartSoulBootstrap(input: RestartSoulBootstrapInput!): SoulBootstrapMutationPayload!
```

Possible Host route semantics:

- begin hosted registration with instance-key auth and local body identity
- allow mint/genesis conversation before wallet/principal verification
- publish hosted/off-chain identity without `PrincipalSignature` /
  `PrincipalDeclaration`
- record an explicit authority model such as `instance_trust` /
  `hosted_offchain`
- expose later upgrade endpoints to add principal/on-chain assurance to the
  same agent id

Cost:

- larger API change
- clearer separation between hosted product and immutable/on-chain upgrade
- avoids overloading old registration semantics

### Option B: mode-parameterize the existing bootstrap flow

Keep current mutation names but add an explicit mode:

```graphql
enum SoulBootstrapMode {
  HOSTED_OFFCHAIN
  IMMUTABLE_ONCHAIN
}

input BeginSoulBootstrapInput {
  username: String!
  mode: SoulBootstrapMode = HOSTED_OFFCHAIN
  walletAddress: String
  capabilities: [String!]
  idempotencyKey: String
  correlationKey: String
}
```

In `HOSTED_OFFCHAIN` mode:

- `walletAddress` is optional/ignored
- next action moves to genesis conversation rather than wallet verification
- principal declaration steps are not required
- finalize publishes hosted/off-chain under instance trust

Cost:

- smaller API surface
- higher risk that old and new semantics become tangled in one state machine
- must be very explicit about phase/action compatibility to avoid another
  brittle mixed-mode flow

## Hard design questions for Arch

1. Should hosted/off-chain be a separate route family, or a mode of the current
   bootstrap route family?
2. What is the canonical authority record for a hosted/off-chain soul when no
   principal declaration exists?
   - `authority_model=instance_trust`?
   - `principal_*` fields nullable?
   - separate `hostedAuthority` record?
3. What replaces wallet proof as the anti-abuse boundary?
   - Lesser authenticated operator/admin session?
   - drone owner/admin governance state?
   - Host instance-key + managed-domain ownership?
   - all of the above?
4. Where should restart/resume live?
   - Lesser-only `restartSoulBootstrap` that supersedes Host state?
   - Host endpoint to invalidate/supersede registrations/conversations?
   - both, with Lesser orchestrating?
5. How do we guarantee no namespace fork when a hosted/off-chain soul later
   upgrades to immutable/on-chain assurance?
6. Which existing Host finalization checks are genuinely on-chain-only and can
   be bypassed for hosted/off-chain without weakening hosted publication?
7. How should GraphQL `nextAction` and `phase` evolve so Sim can show one
   canonical step and never infer Host semantics from lossy errors?
8. What is the minimum upstream slice that can unblock first live hosted/off-
   chain testing without creating a long-lived compatibility trap?

## Recommended sequencing to evaluate

Proposed sequence for Arch to validate or replace:

1. `lesser-host`: introduce hosted/off-chain authority model and publish path
   that does not require wallet/principal fields.
2. `lesser`: expose the hosted-first GraphQL state machine over same-origin auth
   and server-side Host instance trust.
3. `lesser`: add durable restart/resume semantics and actionable error
   categories.
4. `greater-components`: regenerate/update adapters from the new Lesser
   contract.
5. `simulacrum`: simplify the visible soul genesis UI to:
   - choose drone
   - begin/resume hosted definition
   - genesis conversation
   - review/publish hosted soul
   - optional upgrade callout

## Simulacrum's current posture

Sim has local work in progress that improves recovery against the existing
wallet/principal backend contract, including restart/re-sign affordances and
clearer lane navigation. That is a stopgap only.

Sim should not keep polishing wallet/principal ceremony as the default hosted
product path. Once the upstream contract is chosen, Sim should remove or demote
the wallet ceremony into an explicit compatibility/upgrade lane.

Sim must continue to refuse:

- browser-held Host control-plane credentials
- raw Host write calls from the browser
- new REST data paths
- local patches to vendored Greater code
- UI that makes hosted/off-chain appear equivalent to immutable/on-chain
  assurance

## Desired Arch output

Please provide:

1. A recommended upstream contract shape: separate hosted route family vs
   mode-parameterized existing bootstrap.
2. The minimum safe data-model changes in `lesser-host`.
3. The minimum safe GraphQL changes in `lesser`.
4. The recovery/restart semantics needed to satisfy Sim's invariant:
   every soul-definition web process is reversible/resumable until final
   binding.
5. A sequencing recommendation that minimizes rework across Host, Lesser,
   Greater adapters, and Sim.

