#!/usr/bin/env bash
# Sync forge SSoT (~/forge/.claude) content into this marketplace repo's plugin bundles.
# Thin wrapper — actual diff/transform logic lives in sync-from-forge.py (kept as a
# single source of truth; a pure-bash reimplementation of the regex+encoding-aware
# transform would be far less maintainable/testable).
#
# Usage:
#   scripts/sync-from-forge.sh            # apply sync
#   scripts/sync-from-forge.sh --dry-run   # preview only, no writes
#   scripts/sync-from-forge.sh --verify    # report remaining drift (exit 1 if any), no writes
#
# Transform rules applied while copying forge SSoT -> plugin bundle (see commit b8fd94e):
#   ~/forge      -> ${FORGE_ROOT:-$HOME/forge}
#   ~/.claude    -> $HOME/.claude
#   (Windows drive-letter prose table lines, e.g. containing "Z:", are left untouched)
#
# Scope: only overwrites files that already exist in BOTH forge SSoT and a plugin
# bundle (skills/commands/agents/rules). Never deletes plugin-only files, never
# creates new files.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$SCRIPT_DIR/sync-from-forge.py" "$@"
