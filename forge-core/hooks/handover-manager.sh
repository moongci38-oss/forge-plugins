#!/usr/bin/env bash
# handover-manager.sh — Race-free handover I/O wrapper
# Usage:
#   handover-manager.sh write <model> <project_root> <slug>           # stdin pipe
#   handover-manager.sh read-latest <model> <project_root> [--mark-consumed]
#   handover-manager.sh read-cross <opposite_model> <project_root>
#   handover-manager.sh learn-append <project_root>                   # stdin pipe
#   handover-manager.sh refresh-index <model> <project_root>

set -euo pipefail

CMD="${1:-}"
shift || true

LOCK_TIMEOUT=30

err() { echo "ERROR: $*" >&2; exit 1; }

handover_dir() {
  local model="$1" root="$2"
  echo "$root/.claude/handover/$model"
}

lock_path() {
  local root="$1"
  mkdir -p "$root/.claude/handover"
  echo "$root/.claude/handover/.lock"
}

learn_lock_path() {
  local root="$1"
  mkdir -p "$root/.claude"
  echo "$root/.claude/.learnings.lock"
}

iso8601() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

atomic_write() {
  local target="$1"
  local target_dir
  target_dir=$(dirname "$target")
  mkdir -p "$target_dir"
  local tmp
  tmp=$(mktemp -p "$target_dir" ".write-XXXXXX.tmp")
  trap 'rm -f "$tmp"' EXIT
  cat > "$tmp"
  mv "$tmp" "$target"
  trap - EXIT
}

build_front_matter() {
  local model="$1" slug="$2" date_part="$3" time_part="$4"
  cat <<EOF
---
date: $date_part
time: $time_part
model: $model
slug: $slug
status: open
session_id: $$
created_at: $(iso8601)
---

EOF
}

resolve_filename() {
  local dir="$1" date_part="$2" time_part="$3" slug="$4"
  local base="${date_part}-${time_part//:/}-${slug}.md"
  local target="$dir/$base"
  local n=1
  while [ -e "$target" ]; do
    target="$dir/${date_part}-${time_part//:/}-${slug}-${n}.md"
    n=$((n + 1))
  done
  echo "$target"
}

refresh_index_inner() {
  local model="$1" dir="$2"
  local index="$dir/INDEX.md"
  local tmp
  tmp=$(mktemp -p "$dir" ".idx-XXXXXX.tmp")
  trap 'rm -f "$tmp"' EXIT

  {
    echo "# ${model^} Handover INDEX"
    echo ""
    echo "## 최신 (status:open)"
    local found_open=0
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      local status
      status=$(awk '/^status:/{print $2; exit}' "$f")
      if [ "$status" = "open" ]; then
        local fname
        fname=$(basename "$f")
        local fdate ftime
        fdate=$(awk '/^date:/{print $2; exit}' "$f")
        ftime=$(awk '/^time:/{print $2; exit}' "$f")
        echo "- \`$fname\` — $fdate $ftime"
        found_open=1
      fi
    done < <(find "$dir" -maxdepth 1 -name "*.md" ! -name "INDEX.md" -printf "%T@ %p\n" 2>/dev/null \
              | sort -rn | awk '{$1=""; sub(/^ /,""); print}')
    [ $found_open -eq 0 ] && echo "(없음)"

    echo ""
    echo "## 최근 consumed (last 5)"
    local count=0
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      [ $count -ge 5 ] && break
      local status
      status=$(awk '/^status:/{print $2; exit}' "$f")
      if [ "$status" = "consumed" ]; then
        local fname
        fname=$(basename "$f")
        local cby
        cby=$(awk '/^consumed_by:/{print $2; exit}' "$f")
        local cat_ts
        cat_ts=$(awk '/^consumed_at:/{print $2; exit}' "$f")
        echo "- \`$fname\` — consumed${cby:+ by $cby}${cat_ts:+ @ $cat_ts}"
        count=$((count + 1))
      fi
    done < <(find "$dir" -maxdepth 1 -name "*.md" ! -name "INDEX.md" -printf "%T@ %p\n" 2>/dev/null \
              | sort -rn | awk '{$1=""; sub(/^ /,""); print}')
    [ $count -eq 0 ] && echo "(없음)"
    echo ""
  } > "$tmp"

  mv "$tmp" "$index"
  trap - EXIT
}

cmd_write() {
  local model="$1" root="$2" slug="$3"
  [ -z "$model" ] && err "model required"
  [ -z "$root" ] && err "project_root required"
  [ -z "$slug" ] && err "slug required"

  local dir
  dir=$(handover_dir "$model" "$root")
  mkdir -p "$dir"

  local content
  content=$(cat)

  local lock
  lock=$(lock_path "$root")

  exec 200>"$lock"
  flock -x -w "$LOCK_TIMEOUT" 200 || err "flock timeout (lock=$lock)"

  local date_part time_part
  date_part=$(date +"%Y-%m-%d")
  time_part=$(date +"%H%M")

  local target
  target=$(resolve_filename "$dir" "$date_part" "$time_part" "$slug")

  local fm
  fm=$(build_front_matter "$model" "$slug" "$date_part" "$time_part")

  printf '%s\n\n%s\n' "$fm" "$content" | atomic_write "$target"
  refresh_index_inner "$model" "$dir"

  flock -u 200
  echo "$target"
}

cmd_read_latest() {
  local model="$1" root="$2"
  shift 2
  local mark_consumed=0
  local summary_mode=1
  for arg in "$@"; do
    [ "$arg" = "--mark-consumed" ] && mark_consumed=1
    [ "$arg" = "--summary" ] && summary_mode=1
    [ "$arg" = "--full" ] && summary_mode=0
  done

  local dir
  dir=$(handover_dir "$model" "$root")
  [ -d "$dir" ] || { echo "(no handover dir)" >&2; return 0; }

  local lock
  lock=$(lock_path "$root")

  exec 200>"$lock"
  flock -x -w "$LOCK_TIMEOUT" 200 || err "flock timeout"

  local target=""
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    local status
    status=$(awk '/^status:/{print $2; exit}' "$f")
    if [ "$status" = "open" ]; then
      target="$f"
      break
    fi
  done < <(find "$dir" -maxdepth 1 -name "*.md" ! -name "INDEX.md" -printf "%T@ %p\n" 2>/dev/null \
            | sort -rn | awk '{$1=""; sub(/^ /,""); print}')

  if [ -z "$target" ]; then
    flock -u 200
    echo "(no open handover)" >&2
    return 0
  fi

  if [ $summary_mode -eq 1 ]; then
    awk '
      BEGIN { in_fm=0; fm_done=0 }
      /^---$/ { print; in_fm=!in_fm; if (!in_fm) fm_done=1; next }
      in_fm { print; next }
      fm_done && /^#+ / { print; next }
    ' "$target"
    echo ""
    echo "(summary mode — 전체 본문: cat $target)"
  else
    cat "$target"
  fi

  if [ $mark_consumed -eq 1 ]; then
    local consumed_at
    consumed_at=$(iso8601)
    awk -v cat="$consumed_at" -v cby="$$" '
      /^status: open$/ { print "status: consumed"; print "consumed_at: " cat; print "consumed_by: " cby; next }
      { print }
    ' "$target" | atomic_write "$target"
    refresh_index_inner "$model" "$dir"
  fi

  flock -u 200
}

cmd_read_cross() {
  local model="$1" root="$2"
  shift 2
  cmd_read_latest "$model" "$root" --mark-consumed "$@"
}

cmd_learn_append() {
  local root="$1"
  [ -z "$root" ] && err "project_root required"

  mkdir -p "$root/.claude"
  local target="$root/.claude/learnings.jsonl"
  local lock
  lock=$(learn_lock_path "$root")

  exec 201>"$lock"
  flock -x -w "$LOCK_TIMEOUT" 201 || err "flock timeout (lock=$lock)"

  cat >> "$target"
  [[ $(tail -c1 "$target" | wc -l) -eq 0 ]] && echo "" >> "$target"

  flock -u 201
}

cmd_refresh_index() {
  local model="$1" root="$2"
  local dir
  dir=$(handover_dir "$model" "$root")
  [ -d "$dir" ] || { mkdir -p "$dir"; }

  local lock
  lock=$(lock_path "$root")
  exec 200>"$lock"
  flock -x -w "$LOCK_TIMEOUT" 200 || err "flock timeout"
  refresh_index_inner "$model" "$dir"
  flock -u 200
}

case "$CMD" in
  write)         cmd_write "$@" ;;
  read-latest)   cmd_read_latest "$@" ;;
  read-cross)    cmd_read_cross "$@" ;;
  learn-append)  cmd_learn_append "$@" ;;
  refresh-index) cmd_refresh_index "$@" ;;
  *)             err "Unknown command: $CMD" ;;
esac
