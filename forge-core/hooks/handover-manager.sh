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

# H1: model/slug 입력 검증 — path traversal·공백·인젝션 방지
validate_ident() {
  local kind="$1" val="$2"
  case "$kind" in
    model) [[ "$val" =~ ^(opus|sonnet|haiku)$ ]] || err "invalid model: $val" ;;
    slug)  [[ "$val" =~ ^[a-z0-9][a-z0-9-]*$ ]] || err "invalid slug: $val" ;;
    *)     err "validate_ident: unknown kind $kind" ;;
  esac
}

# root는 신뢰 호출자 공급 전제 — traversal만 방어(F3)
validate_root() {
  local r="$1"
  [ -z "$r" ] && err "project_root required"
  case "$r" in *..*) err "project_root must not contain '..': $r";; esac
}

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

# H2: lock abstraction — flock 있으면 flock-on-fd, 없으면(Windows Git Bash 등) 원자적
# mkdir 락으로 폴백. no-lock 진행은 금지 — 타임아웃 시 err로 중단.
LOCK_MODE=""
LOCK_MDDIR=""
LOCK_FD=""

acquire_lock() {
  local lock="$1"
  if command -v flock >/dev/null 2>&1; then
    exec {LOCK_FD}>"$lock"
    flock -x -w "$LOCK_TIMEOUT" "$LOCK_FD" || err "flock timeout (lock=$lock)"
    LOCK_MODE="flock:$LOCK_FD"
    return 0
  fi

  local mddir="${lock}.mdlock"
  local waited=0
  trap 'release_lock' EXIT
  while true; do
    if mkdir "$mddir" 2>/dev/null; then
      printf '%s %s\n' "$$" "$(date +%s)" > "$mddir/owner" \
        || { rmdir "$mddir" 2>/dev/null; err "lock owner write failed"; }
      LOCK_MODE="mkdir"
      LOCK_MDDIR="$mddir"
      return 0
    fi
    # stale recovery: owner 있으면 pid dead + ts>=LOCK_TIMEOUT, owner 없으면 dir mtime>=LOCK_TIMEOUT (F2 영구데드락 방지)
    local stale=0 now
    now=$(date +%s)
    if [ -f "$mddir/owner" ]; then
      local opid ots
      opid=$(awk '{print $1}' "$mddir/owner" 2>/dev/null || true)
      ots=$(awk '{print $2}' "$mddir/owner" 2>/dev/null || true)
      if [ -n "$opid" ] && ! kill -0 "$opid" 2>/dev/null && [ -n "$ots" ] && [ $((now - ots)) -ge "$LOCK_TIMEOUT" ]; then
        stale=1
      fi
    else
      local dmtime
      dmtime=$(stat -c %Y "$mddir" 2>/dev/null || stat -f %m "$mddir" 2>/dev/null || echo 0)
      if [ "$dmtime" -gt 0 ] && [ $((now - dmtime)) -ge "$LOCK_TIMEOUT" ]; then
        stale=1
      fi
    fi
    if [ $stale -eq 1 ]; then
      # F1: 원자적 rename 재획득 — mv는 원자적이라 경합 중 단 하나의 racer만 성공, 나머지는 실패해 재경쟁
      local reclaim="${mddir}.reclaim.$$"
      if mv "$mddir" "$reclaim" 2>/dev/null; then
        rm -rf "$reclaim" 2>/dev/null || true
      fi
      continue
    fi
    sleep 0.2
    waited=$(awk -v w="$waited" 'BEGIN{printf "%.1f", w+0.2}')
    if awk -v w="$waited" -v t="$LOCK_TIMEOUT" 'BEGIN{exit !(w>=t)}'; then
      err "lock timeout (lock=$mddir)"
    fi
  done
}

release_lock() {
  case "$LOCK_MODE" in
    flock:*)
      local fd="${LOCK_MODE#flock:}"
      flock -u "$fd" 2>/dev/null || true
      ;;
    mkdir)
      rmdir "$LOCK_MDDIR" 2>/dev/null || rm -rf "$LOCK_MDDIR" 2>/dev/null || true
      ;;
  esac
  LOCK_MODE=""
  trap - EXIT
}

iso8601() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

atomic_write() {
  local target="$1"
  local target_dir
  target_dir=$(dirname "$target")
  mkdir -p "$target_dir"
  local tmp
  tmp=$(mktemp -p "$target_dir" ".write-XXXXXX.tmp")
  # F2: EXIT trap 제거 — acquire_lock(mkdir 브랜치)의 'trap release_lock EXIT'를 clobber하지 않기 위함.
  # 정상경로는 mv로 tmp가 소멸; 비정상종료 시 .write-*.tmp litter는 *.md glob에서 배제되어 무해.
  cat > "$tmp"
  mv "$tmp" "$target"
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
  # F2: EXIT trap 제거 — acquire_lock(mkdir 브랜치)의 'trap release_lock EXIT'를 clobber하지 않기 위함.
  # 정상경로는 mv로 tmp가 소멸; 비정상종료 시 .idx-*.tmp litter는 *.md glob에서 배제되어 무해.

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
}

cmd_write() {
  local model="$1" root="$2" slug="$3"
  [ -z "$model" ] && err "model required"
  [ -z "$root" ] && err "project_root required"
  [ -z "$slug" ] && err "slug required"
  validate_ident model "$model"
  validate_ident slug "$slug"
  validate_root "$root"

  local dir
  dir=$(handover_dir "$model" "$root")
  mkdir -p "$dir"

  local content
  content=$(cat)

  local lock
  lock=$(lock_path "$root")

  acquire_lock "$lock"

  local date_part time_part
  date_part=$(date +"%Y-%m-%d")
  time_part=$(date +"%H%M")

  local target
  target=$(resolve_filename "$dir" "$date_part" "$time_part" "$slug")

  local fm
  fm=$(build_front_matter "$model" "$slug" "$date_part" "$time_part")

  printf '%s\n\n%s\n' "$fm" "$content" | atomic_write "$target"
  refresh_index_inner "$model" "$dir"

  release_lock
  echo "$target"
}

cmd_read_latest() {
  local model="$1" root="$2"
  shift 2
  validate_ident model "$model"
  validate_root "$root"
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

  acquire_lock "$lock"

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
    release_lock
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

  release_lock
}

cmd_read_cross() {
  local model="$1" root="$2"
  shift 2
  validate_ident model "$model"
  validate_root "$root"
  cmd_read_latest "$model" "$root" --mark-consumed "$@"
}

cmd_learn_append() {
  local root="$1"
  [ -z "$root" ] && err "project_root required"
  validate_root "$root"

  mkdir -p "$root/.claude"
  local target="$root/.claude/learnings.jsonl"
  local lock
  lock=$(learn_lock_path "$root")

  acquire_lock "$lock"

  cat >> "$target"
  [[ $(tail -c1 "$target" | wc -l) -eq 0 ]] && echo "" >> "$target"

  release_lock
}

cmd_refresh_index() {
  local model="$1" root="$2"
  validate_ident model "$model"
  validate_root "$root"
  local dir
  dir=$(handover_dir "$model" "$root")
  [ -d "$dir" ] || { mkdir -p "$dir"; }

  local lock
  lock=$(lock_path "$root")
  acquire_lock "$lock"
  refresh_index_inner "$model" "$dir"
  release_lock
}

case "$CMD" in
  write)         cmd_write "$@" ;;
  read-latest)   cmd_read_latest "$@" ;;
  read-cross)    cmd_read_cross "$@" ;;
  learn-append)  cmd_learn_append "$@" ;;
  refresh-index) cmd_refresh_index "$@" ;;
  *)             err "Unknown command: $CMD" ;;
esac
