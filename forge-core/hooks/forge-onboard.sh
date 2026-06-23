#!/usr/bin/env bash
# forge-onboard.sh — SessionStart hook
# Runs once per session. Idempotent: skips if already initialized.
# root-cause: new file — debug logging not applicable to idempotent init script
set -euo pipefail

ORCH_TOKEN_DIR="$HOME/.config/forge"
ORCH_TOKEN_FILE="$ORCH_TOKEN_DIR/orch-token.key"
RULES_DST="$HOME/.claude/rules"
RULES_SRC="${CLAUDE_PLUGIN_ROOT}/rules"
PLUGIN_DATA="${CLAUDE_PLUGIN_DATA:-$HOME/.claude/plugins/data/forge-core}"

# 1. orch-token.key — create if missing
if [ ! -f "$ORCH_TOKEN_FILE" ]; then
  mkdir -p "$ORCH_TOKEN_DIR"
  openssl rand -base64 32 > "$ORCH_TOKEN_FILE"
  chmod 600 "$ORCH_TOKEN_FILE"
  echo "[forge-onboard] orch-token.key created: $ORCH_TOKEN_FILE" >&2
fi

# 2. rules — copy plugin rules to ~/.claude/rules/ if missing
if [ -d "$RULES_SRC" ]; then
  for src_file in "$RULES_SRC"/*.md; do
    [ -f "$src_file" ] || continue
    fname="$(basename "$src_file")"
    dst_file="$RULES_DST/$fname"
    if [ ! -f "$dst_file" ]; then
      mkdir -p "$RULES_DST"
      cp "$src_file" "$dst_file"
      echo "[forge-onboard] rules installed: $fname" >&2
    fi
  done
fi

# 3. plugin data dir — ensure writable persistent dir exists
mkdir -p "$PLUGIN_DATA"

# 4. session management dirs — handover + checkpoints
SESSION_DIRS=(
  "$HOME/.claude/handover/sonnet"
  "$HOME/.claude/handover/opus"
  "$HOME/.claude/checkpoints"
)
for dir in "${SESSION_DIRS[@]}"; do
  if [ ! -d "$dir" ]; then
    mkdir -p "$dir"
    echo "[forge-onboard] session dir created: $dir" >&2
  fi
done

# 5. handover-manager.sh — install if missing
HM_SRC="${CLAUDE_PLUGIN_ROOT}/hooks/handover-manager.sh"
HM_DST="$HOME/.claude/scripts/handover-manager.sh"
if [ -f "$HM_SRC" ] && [ ! -f "$HM_DST" ]; then
  mkdir -p "$(dirname "$HM_DST")"
  cp "$HM_SRC" "$HM_DST"
  chmod +x "$HM_DST"
  echo "[forge-onboard] handover-manager.sh installed: $HM_DST" >&2
fi

exit 0
