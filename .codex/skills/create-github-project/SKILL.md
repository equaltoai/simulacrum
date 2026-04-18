---
name: create-github-project
description: Use after plan-roadmap is approved, if the roadmap warrants a tracked GitHub Project at the equaltoai org level. Translates a roadmap document into a Projects v2 kanban board with issues across affected repos. Follows equaltoai's established project pattern, often with upstream-coordination issues in sibling repos.
---

# Create a GitHub Project

equaltoai tracks initiative-level work in **GitHub Projects v2** at the org level, cross-repo by default. sim's roadmaps frequently span multiple repos:

- sim itself for milestone / panel / public-route / test / adapter work
- greater-components for upstream component-API work that sim needs
- lesser for GraphQL schema / REST-auth changes
- lesser-host for registry / managed-deploy changes
- lesser-body for MCP contract changes

This skill turns an approved roadmap into a project board.

## Check what tools you have

- **`gh` CLI**: `gh project create`, `gh project field-list`, `gh project item-add`, `gh issue create`, `gh issue edit --add-project`.
- If not available, produce a well-shaped markdown draft.

Surface which mode you're in at the start.

## When this skill runs

Invoke when:

- Roadmap is large enough for tracked kanban (multi-milestone agent-first rewrite phase, major upstream-sync, cross-repo coordination)
- Roadmap is an initiative rather than a single bug fix
- Aron has asked for a project created
- The roadmap surfaces multiple upstream routing items that need coordinated tracking

Skip when:

- Roadmap is a handful of issues on sim alone without cross-repo coordination
- Kanban adds no value

## The equaltoai project shape (reference)

Per Project 20 pattern:

- **Title**: `<Initiative> — <qualifier>`
- **Short description**: one-sentence scope
- **README**: **Goal / Repos involved / Non-goals / Success means / Working method**. Includes: "Treat this as a kanban."
- **Status**: Todo / In Progress / Done
- **Fields**: Title, Assignees, Status, Labels, Linked pull requests, Milestone, Repository, Reviewers, Parent issue, Sub-issues progress
- **Items**: GitHub Issues in one or more in-scope repos
- **Milestones**: separate from Status
- **Parent / sub-issue hierarchy**

## The create walk

### Step 1: Draft README

```markdown
## <Initiative title>

<Brief paragraph on what this initiative delivers.>

### Goal

<Specific outcome — what "done" looks like.>

### Repos involved

- **simulacrum**: <panel / public-route / adapter / test / install work>
- **greater-components**: <if upstream Greater component work needed>
- **lesser**: <if Lesser GraphQL / REST-auth changes needed>
- **lesser-host**: <if host registry / managed-deploy changes needed>
- **lesser-body**: <if body MCP contract changes needed>
- **lesser-soul**: <if namespace changes needed — rare>

### Non-goals

- <explicit out-of-scope items>
- Patching vendored Greater / Lesser / host / body locally — always route upstream
- Drifting from browser-validation contract or agent-first contract silently
- Loosening CSP or GraphQL-first posture

### Success means

- <observable conditions>
- <public routes pass browser-validation contract per Playwright specs>
- <Browser Live Smoke workflow green against both dev instances>
- <LLM bot-account workflows function correctly if in scope>
- <upstream coordination issues are tracked to resolution>

### Working method

Treat this as a kanban. Move issues through explicit status as evidence is gathered and blockers become concrete.
```

### Step 2: Create the project

```bash
gh project create --owner equaltoai --title "<initiative title>"
```

Capture `<N>`.

### Step 3: Populate README

```bash
gh project edit <N> --owner equaltoai \
  --readme "$(cat readme-draft.md)" \
  --description "<short-description>"
```

### Step 4: Confirm fields

```bash
gh project field-list <N> --owner equaltoai --format json
```

### Step 5: Create issues

For each enumerated change:

```bash
gh issue create \
  --repo equaltoai/<repo> \
  --title "<title>" \
  --body "$(cat issue-body.md)" \
  --label "<labels>" \
  --milestone "<milestone>"
```

Issue body template:

```markdown
**Source**: Roadmap <roadmap name>, Phase <phase>
**Enumerated item**: #<N>

## Paths
<...>

## Surface
<facetheory-runtime / facetheory-panel / legacy-svelte-kit / api-client / auth / realtime / components / vendored-greater (via CLI) / faces (via CLI) / styles / tips / contracts / docs / tests / scripts / manifest / deps>

## Classification
<facetheory-rewrite-milestone / upstream-sync / csp-graphql-compliance / deploy-install / research-sandbox / framework-feedback / test-coverage / docs / dependency-maintenance / bug-fix>

## Specialist walks referenced
- Upstream routing: <...>
- CSP / GraphQL-first: <...>
- Browser-validation contract: <...>
- Deploy / install: <...>
- Framework: <idiomatic / reported upstream>

## Upstream-first check
<sim-local / should route upstream to <repo> — included in this project as a cross-repo issue>

## Acceptance criterion
<one sentence>

## Validation commands
<pnpm lint / typecheck / api:test / browser:test / build / CSP check>

## Install checkpoints
- [ ] Merged to main
- [ ] Build succeeds
- [ ] Installed to simulacrum dev instance
- [ ] Simulacrum dev verification complete
- [ ] Browser Live Smoke (simulacrum) green
- [ ] Installed to theory dev instance
- [ ] Theory dev verification complete
- [ ] Browser Live Smoke (theory) green
- [ ] Post-install monitoring verified

## Milestone (if applicable)
<Mx.y>

## Planned commit subject
<type(scope): subject — preferred `feat: milestone Mx.y` for milestone-completing>

## Parent issue
<link if sub-issue>
```

Link into project:

```bash
gh project item-add <N> --owner equaltoai --url <issue-url>
```

### Step 6: Set fields

Status: `Todo`. Milestone: roadmap phase (or Mx.y). Labels: scope. Parent issue: for sub-tasks.

### Step 7: Parent / sub-issue hierarchy with upstream cross-repo issues

Example for an initiative spanning upstream:

- Parent: `equaltoai/simulacrum#XXX — "Agent-first M6: soul-conversation workflow panel"`
- Sub-issues:
  - `equaltoai/simulacrum#YYY — M6.1: panel scaffolding with routing`
  - `equaltoai/simulacrum#ZZZ — M6.2: GraphQL query wiring`
  - `equaltoai/simulacrum#AAA — M6.3: public-route coverage + browser-validation contract update`
  - `equaltoai/simulacrum#BBB — M6.4: Playwright spec`
  - `equaltoai/lesser-host#CCC — (cross-repo) new registry endpoint for soul-conversation metadata` (upstream work that sim will consume)
  - `equaltoai/greater-components#DDD — (cross-repo) new face-composition for soul-conversation` (upstream component sim vendors)

## Labels

Apply consistently:

- `sim-milestone` — milestone-completing work (often suffixed with `M<x>`)
- `sim-upstream-sync` — chore/update-greater, chore/lesser-sync, etc.
- `sim-csp` — CSP compliance
- `sim-graphql-first` — GraphQL-first discipline
- `sim-browser-validation` — browser-validation contract
- `sim-agent-first` — agent-first contract work
- `sim-panel` — workflow panel work
- `sim-public-route` — public route work
- `sim-install` — deploy / install / runbook
- `sim-research-sandbox` — LLM bot / synthetic-threat research
- `sim-test` — test coverage
- `sim-deps` — dependency bumps
- `sim-framework-feedback` — FaceTheory upstream signal
- `sim-docs` — documentation
- `sim-agpl` — license discipline
- `upstream-routing` — issue tracking an upstream problem that needs to be resolved in a sibling repo
- `breaking` — requires coordination
- `advisor-brief` — originated from advisor dispatch
- Specialist gates: `needs-upstream-routing-walk`, `needs-csp-graphql-walk`, `needs-browser-contract-walk`, `needs-install-walk`

## Priority and sequencing

Status drives kanban. Milestone groups. Priority by label + project order.

## The markdown-draft fallback

If `gh` CLI unavailable:

```markdown
# GitHub Project draft: <initiative title>

## Project README
<README draft>

## Default fields
Status: Todo / In Progress / Done
Milestones: <phase names, Mx.y>
Labels: <list>

## Issues

### In equaltoai/simulacrum
1. **<issue title>** — [`<labels>`]
   ...

### In equaltoai/greater-components (upstream coordination)
1. ...

### In equaltoai/lesser (upstream coordination)
1. ...
```

## Persist

Append project URL + scope. Five meaningful entries beat fifty log-shaped ones.

## Handoff

- Project + issues exist → `implement-milestone` with first item.
- User wants to revise → `plan-roadmap`.
- Cross-repo coordination surfaces → sibling stewards looped in.
- Too small for a project → skip; roadmap drives `implement-milestone` directly.
