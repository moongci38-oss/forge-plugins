#!/usr/bin/env bash
# Auto-increment bug ID from docs/qa/bugs/ directory.
# Usage: bash next-bug-id.sh [bugs-dir]
# Output: BUG-003 (zero-padded to 3 digits)

BUGS_DIR="${1:-$(pwd)/docs/bug_report}"

if [ ! -d "$BUGS_DIR" ]; then
  mkdir -p "$BUGS_DIR"
  echo "BUG-001"
  exit 0
fi

LAST=$(ls "$BUGS_DIR" 2>/dev/null | grep -oP 'BUG-\K\d+' | sort -n | tail -1)
if [ -z "$LAST" ]; then
  echo "BUG-001"
else
  printf "BUG-%03d\n" $((10#$LAST + 1))
fi
