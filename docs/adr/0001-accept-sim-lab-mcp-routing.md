# ADR 0001: Accept and document `sim_lab` MCP routing

Date: 2026-05-30

Status: Accepted

## Context

SIM-02 identified that the repository-level `.mcp.json` registers a remote HTTP
MCP server at `https://lab.theorymcp.ai/equaltoai/agents/sim/mcp`, and that
`AGENTS.md` plus the `github-provenance` skill tell agents to prefer that route
for GitHub work. In MCP-aware developer environments, issue/PR metadata, file
contents submitted for routed commits, mailbox content, memory entries, and
GitHub write intents can therefore pass through a mutable remote service.

Aron's Project 43 M1 governance ruling is **ACCEPT & DOCUMENT**:
`lab.theorymcp.ai` routing is accepted, governed first-party EqualToAI/TheoryMCP
infrastructure. The remediation is documentation, pinning/allowlist guidance,
and an ADR. The remediation must not remove `.mcp.json`, must not remove the
prefer-`sim_lab` GitHub provenance guidance, and must not add interactive
approval gates that break non-interactive agent operation.

## Decision

Keep `.mcp.json` and keep the `github-provenance` preference for routed
`sim_lab` GitHub tools.

Document the trust model in `docs/security/mcp-trust-model.md` and link it from
`AGENTS.md`. The documentation records:

- first-party ownership and classification of `lab.theorymcp.ai`;
- why routed GitHub tools are preferred for Simulacrum steward provenance;
- trust assumptions and compromise blast radius;
- the recommended endpoint pinning/allowlist control for DNS/TLS subversion;
- the non-interactive operation requirement.

The current `.mcp.json` is not extended with a pin because the current Codex MCP
configuration surface used by this repository does not expose a documented
non-interactive project-local TLS pin or host-allowlist field. Adding unverified
fields would risk silently disabling or breaking the MCP configuration. If a
future harness supports a documented non-interactive pin/allowlist field, this
ADR expects `.mcp.json` to adopt it.

## Consequences

- Agent GitHub work remains provenance-preserving through the Simulacrum steward
  endpoint when the routed tools support the operation.
- The remote MCP route is explicitly documented as a first-party trust boundary
  rather than an implicit project configuration surprise.
- Non-interactive delegated agent operation remains possible; no per-tool prompt
  gates are introduced.
- DNS/TLS subversion is mitigated operationally by exact endpoint allowlisting
  and future-compatible pinning guidance, not by an unsupported `.mcp.json`
  schema extension.
- Normal sim gates still apply: upstream-first routing, strict CSP,
  GraphQL-first discipline, browser-validation-contract preservation,
  agent-first product shape, AGPL posture, required review, and CI validation.

## Rejected alternatives

### Remove `.mcp.json` or remove the prefer-`sim_lab` guidance

Rejected. That would eliminate the steward-routed GitHub provenance model that
Project 43 explicitly accepts. It would push agents back toward local human
credentials or untracked ad hoc GitHub paths and make routed memory/mail/GitHub
handoffs less consistent.

### Add per-tool interactive approval gates

Rejected. Prompt gates break non-interactive delegated steward operation, which
is a hard requirement for this assignment. They also do not address DNS/TLS
subversion as reliably as deterministic endpoint allowlisting and server-side
policy.

### Add an unverified custom pin field to `.mcp.json`

Rejected for now. Unknown project-config fields are not a verified security
control and could break harness parsing or tool discovery. The repository will
adopt a concrete non-interactive pin/allowlist only when the MCP harness exposes
a documented field that can be validated without prompts.
