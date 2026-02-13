# Regression tests (issue-driven)

This folder holds **minimal repro tests** for **specific Lesser GitHub issues**.

## Naming convention

- File: `lesser-<issue-number>-<short-slug>.mjs`
- Test slug: include `lesser-<issue-number>` so it’s easy to filter.

Example:

```bash
pnpm api:test --filter lesser-92 --base-url https://dev.simulacrum.greater.website --profile admin
```

## Rules

- Keep tests **minimal** (smallest repro).
- Prefer **read-only** where possible.
- For writes, require `--write` and always **restore state** in `finally`.
- Add `issue: { repo: 'equaltoai/lesser', number: <N> }` to the test object so failure bundles include a “Related”
  line.

