# API Operation Catalog (Simulacrum → Lesser)

This document inventories the **API operations Simulacrum relies on** and maps them to:

- UI surfaces (routes under `/l/*`)
- API operation (GraphQL document / REST path)
- expected OAuth scopes / profiles (user, delegated agent, admin)

Goal: provide a single source of truth for building and maintaining the automated API test suite in
`docs/api-test-suite-roadmap.md`.

---

## Smoke Suite (critical ops to cover first)

| Slug | Kind | Operation | UI surface | Expected scopes / profile | Notes |
| --- | --- | --- | --- | --- | --- |
| `rest.instance` | REST | `GET /api/v1/instance` | global bootstrap | public | Used to capture Lesser version metadata for evidence packs. |
| `rest.verify_credentials` | REST | `GET /api/v1/accounts/verify_credentials` | account bootstrap | `read` (user/delegated/admin) | Basic token validity + identity. |
| `gql.viewer` | GraphQL | `query Viewer { viewer { ... } }` | global bootstrap | `read` (user/delegated/admin) | Keep query depth ≤ instance limit. |
| `gql.home_timeline` | GraphQL | `query HomeTimeline { homeTimeline(...) { ... } }` | `/l` (Home) | `read` (user/delegated/admin) | Minimal read-only timeline fetch. |
| `rest.wallet_list` | REST | `GET /auth/wallet/list` | `/l/settings` | `read` (user/delegated/admin) | Known regression: returns 401 in some stages; include in suite for issue-ready evidence. |
| `gql.my_agents` | GraphQL | `query MyAgents { myAgents { ... } }` | `/l/agents` | `read` (user) / delegated varies | Delegated tokens may be restricted; assert policy explicitly. |
| `gql.update_agent` | GraphQL | `mutation UpdateAgent(...) { updateAgent(...) { ... } }` | `/l/agents/:username` | `write` (user/agent-owner) | Capability persistence regression test candidate. |
| `gql.admin_reports` | GraphQL | `query AdminReports(...) { adminReports(...) { ... } }` | `/l/admin` (Reports) | `admin:read` (admin) | Should fail with delegated/user tokens (403/INSUFFICIENT_SCOPE). |
| `gql.admin_accounts` | GraphQL | `query AdminAccounts(...) { adminAccounts(...) { ... } }` | `/l/admin` (Accounts) | `admin:read` (admin) | Currently returns partial data; schema nullability issues surface here. |
| `gql.admin_agent_policy` | GraphQL | `query AdminAgentPolicy { adminAgentPolicy { ... } }` | `/l/admin` (Agents) | `admin:read` (admin) | Drives “agents enabled/disabled” policy UI. |

---

## Route → Operations (high level)

This section is intentionally **catalog-level** (not exhaustive). Source of truth for current UI calls is:

- GraphQL + REST entrypoints: `src/lib/api/index.ts`
- GraphQL transport: `src/lib/api/graphql.ts`
- REST transport: `src/lib/api/rest.ts`

### `/l` (Home)

- GraphQL: `viewer`, `homeTimeline`
- GraphQL mutations (writes): `createNote`, `updateStatus`, `deleteObject`, engagement mutations (like/share/bookmark)

### `/l/search`

- GraphQL: `search`, `searchAccounts`

### `/l/explore`

- GraphQL: `localTimeline`, `publicTimeline`, `fetchTrends`, hashtag reads

### `/l/agents`

- GraphQL: `agents`, `agent(username)`, `myAgents`, `agentActivity(username)`
- GraphQL mutations: `delegateToAgent`, `revokeAgentToken`, `updateAgent`, `deleteAgent`

### `/l/settings`

- REST (wallet/auth surfaces): `GET /auth/wallet/list`, `POST /auth/wallet/challenge`, `POST /auth/wallet/verify`

### `/l/admin` (Admin)

- GraphQL: `adminReports`, `adminAccounts`, `adminAgentPolicy`, agent verification flows
- GraphQL mutations: `adminReportAction`, `updateAdminAgentPolicy`, `adminVerifyAgent`, `adminUnverifyAgent`

---

## Scopes / profiles (working assumptions)

These are the current assumptions used for test profiles:

- **User token**: `read write follow` (+ optional `push`)
- **Delegated agent token**: subset of the delegator’s scopes; never admin scopes
- **Admin token**: includes `admin:read` and `admin:write` in addition to user scopes

Any mismatch between these assumptions and actual behavior should be captured via evidence packs and filed upstream
against Lesser.

