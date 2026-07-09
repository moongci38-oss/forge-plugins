---
description: "Composite workflow: Check → Simplify → Release (Boris pattern)"
model: sonnet
group: ops
---

# /go — Validate → Simplify → Release Chain

Boris Cherny workflow: Run validation checks, simplify code, create release PR in one command.

## Usage

```
/go
/go --skip-simplify
/go --skip-release
```

## Execution Flow

1. **Validation** — Run Forge checks (build, tests, type checking, security)
   - Invokes: `forge-check-security`, `forge-check-traceability`, format lint
   - Stops on FAIL → fix issues, rerun `/go`

2. **Simplify** — Code cleanup via `/simplify` skill
   - Removes dead code, refactors duplication, improves clarity
   - Skippable: `--skip-simplify`

3. **Release** — Create Release MR
   - Invokes: `/forge-release` with auto-versioning
   - Skippable: `--skip-release` (for local testing only)

## Implementation

Run sequentially:

```bash
# Step 1: Run checks
/forge-check-security

# If PASS:
# Step 2: Simplify
/simplify

# If PASS:
# Step 3: Release
/forge-release <version>
```

## Bypass Modes

- `--skip-simplify` — Validation + Release only (for urgent PRs)
- `--skip-release` — Validation + Simplify only (local iteration)
- `--dry-run` — Preview only, no actual changes

## Result

✅ PASS → Clean code committed, Release MR created, ready for merge.
❌ FAIL → Stop at failure stage, display error, await fix.

## Notes

- Each stage is independent; can be run individually if `/go` fails mid-flow
- No Human intervention required between stages
- Approval gate only at Release MR creation (platform layer)
