# MCP trust model for `sim_lab`

Status: accepted by Aron for Project 43 M1 / SIM-02 on 2026-05-30.

## Scope

This note documents why this repository keeps the project-level MCP server in
`.mcp.json`:

```json
{
  "mcpServers": {
    "sim_lab": {
      "type": "http",
      "url": "https://lab.theorymcp.ai/equaltoai/agents/sim/mcp"
    }
  }
}
```

The endpoint is used by MCP-aware agent environments while working on
`equaltoai/simulacrum`; it is not part of the Simulacrum browser runtime and is
not shipped to Lesser instances by `lesser client install`.

## Ownership and classification

`lab.theorymcp.ai` is governed first-party EqualToAI/TheoryMCP infrastructure.
For this repository, the configured route is the Simulacrum steward endpoint and
mailbox:

- MCP server: `https://lab.theorymcp.ai/equaltoai/agents/sim/mcp`
- Steward identity: `Simulacrum <sim.equaltoai@theorymcp.ai>`
- Primary purpose: routed memory, mailbox, contact-directory, and GitHub
  provenance tools for the Simulacrum steward

This is accepted first-party routing, not an unowned third-party integration.
The endpoint is still a remote trust boundary: agents must treat data sent to
`sim_lab` as leaving the local workstation and entering governed TheoryMCP
service infrastructure.

## Why `sim_lab` is preferred for GitHub work

The `github-provenance` skill prefers `sim_lab` routed GitHub tools for GitHub
reads and writes because they provide repo-steward provenance that ordinary
local `gh` operations do not provide:

- GitHub activity is attributed to the Simulacrum steward endpoint rather than a
  human's local shell credentials.
- Branches, commits, PRs, comments, reviews, and check runs are constrained by
  server-side policy and the active GitHub App binding for this repository.
- Mailbox and memory operations use the same steward identity, which keeps
  project handoffs, email replies, and durable notes tied to the agent endpoint.
- Bounded routed commits make it explicit which file contents the agent submits
  to the service for a GitHub write.

This provenance benefit is the reason the preference remains in `AGENTS.md` and
in the `github-provenance` skill.

## Trust assumptions

Using `sim_lab` assumes all of the following are true:

1. `lab.theorymcp.ai` continues to be operated as first-party
   EqualToAI/TheoryMCP infrastructure with authorized operator access only.
2. DNS resolution and TLS validation for `lab.theorymcp.ai` lead to the intended
   TheoryMCP service, not an attacker-controlled endpoint.
3. The MCP client loads the exact configured HTTPS URL and does not silently
   rewrite the scheme, host, or path.
4. Server-side policy continues to scope the Simulacrum endpoint to the intended
   mailbox, memory subject, contact directory, and GitHub App repository grant.
5. Agents send only the data needed for the requested operation, and never send
   secrets, raw credentials, private keys, seed phrases, or unrelated local
   files through MCP tools.
6. GitHub writes created by the endpoint still go through normal repository
   review and CI gates; routed provenance does not authorize merge or deploy by
   itself.

## Data exposure and blast radius if compromised

If `lab.theorymcp.ai`, its DNS/TLS route, or the relevant policy binding were
compromised, the attacker could observe or influence data that agents choose to
send through the routed tools, including:

- issue, PR, repository, and check-run metadata read through routed GitHub tools;
- file contents supplied to `github_commit_files`;
- GitHub write intents for comments, reviews, branches, commits, PRs, and check
  runs within the GitHub App scope;
- inbound mailbox content read through the routed mailbox tools;
- memory entries read or appended through the steward memory tools.

The configured endpoint does not itself grant AWS access, Lesser deploy access,
wallet keys, browser runtime execution, or automatic merge authority. However,
compromise could still create misleading steward-attributed GitHub artifacts or
exfiltrate sensitive repository context if an agent sends that context to the
service. Keep routed operations bounded and do not send secrets.

## Endpoint pinning and allowlist control

Recommended operational mitigation for DNS/TLS subversion:

- allow only `https://lab.theorymcp.ai/equaltoai/agents/sim/mcp` for the
  `sim_lab` MCP server name;
- require the URL scheme to be `https`, the host to be exactly
  `lab.theorymcp.ai`, and the path to be exactly `/equaltoai/agents/sim/mcp`;
- require normal TLS certificate validation for `lab.theorymcp.ai` and monitor
  certificate/DNS changes through the TheoryMCP operations process;
- where an MCP harness supports it without interactive prompts, pin either the
  expected host allowlist or a maintained TLS public-key/certificate fingerprint
  in non-interactive agent configuration;
- fail closed in automation if `.mcp.json` points `sim_lab` anywhere else.

The current repository `.mcp.json` intentionally remains minimal because the
current Codex MCP configuration surface used by this repo exposes URL/auth
configuration but does not expose a documented non-interactive TLS pin or
project-local host-allowlist field. Adding unknown fields would risk breaking
non-interactive agent operation without providing a verified control. If the MCP
harness adds a documented non-interactive pin/allowlist field, update
`.mcp.json` and this note in the same PR.

## Non-interactive operation requirement

Do not add per-tool interactive approval gates around `sim_lab`. Project 43 M1
accepts the routing and requires non-interactive steward operation for delegated
work. Controls should be deterministic and fail-closed (URL allowlist, TLS pin,
server-side policy, and bounded file submission), not prompt-based.

## Agent checklist

Before using routed GitHub writes, confirm:

- `.mcp.json` parses as JSON;
- the `sim_lab` URL matches the allowlisted endpoint above;
- `sim_lab` memory/mail/GitHub tools are reachable without prompts;
- the planned write is part of the user-approved scope;
- no secrets or unrelated files are being sent through the routed tool.
