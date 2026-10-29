# shellcheck shell=bash
# hook-deadline.sh — 차단 훅이 등록 timeout 안에 판정을 못 끝내면 **스스로 막는다**(fail-closed) · #2467 · #2483 · source 전용
# 왜: Claude Code 는 PreToolUse 훅이 등록 timeout 을 넘기면 훅을 끊고 명령을 그대로 실행한다(2026-10-11 실측 — #2467 smoke.md).
#   방 여러 개가 동시에 돌아 기계가 멈추면 차단 훅이 검사 없이 지나간다(10/07 시간 초과 44건). 그래서 판정을 등록 timeout 보다 짧은
#   자기 상한 아래서 돌리고, 넘기면 끊기기 전에 exit 2 로 막는다.
# 사용(훅 맨 위 1줄 — stdin 을 아직 안 읽었을 때):
#   _HDL_D="${BASH_SOURCE[0]%/*}"; [ "$_HDL_D" = "${BASH_SOURCE[0]}" ] && _HDL_D=.
#   [ -f "$_HDL_D/lib/hook-deadline.sh" ] && . "$_HDL_D/lib/hook-deadline.sh" && hook_deadline_guard <훅 이름> <등록 timeout 초> "$@"
#   stdin 을 이미 읽은 훅은 `hook_deadline_guard_input <훅 이름> <등록 timeout 초> "$INPUT" "$@"`.
#   처음 실행(부모) = 자기를 GNU timeout 아래서 다시 돌리고 그 rc 로 **여기서 끝낸다** · 자식(FORGE_HOOK_DEADLINE_CHILD=1) = 바로 돌아가 훅 본문을 돈다.
# 상한 = 등록 timeout 의 **절반** − 이 프로세스가 뜬 뒤 이미 흐른 시간(/proc 기준 — bash 기동·stdin 읽기 포함 · #2475 검수 ②: 고정 7초는
#   부모 기동이 늦어지는 정체 때 여유 3초가 모자랐다). 남은 시간이 0 이하면 자식을 띄우지 않고 바로 막는다.
#   등록 timeout 이 없는 훅(Claude Code 기본 60초)은 60 을 넘긴다.
#   FORGE_HOOK_DEADLINE_SECS(사람만)는 정수 1 이상 · 등록 timeout 미만일 때만 쓴다 — 0(=상한 없음)·등록 이상(=fail-open)은 기본값(#2475 검수 ③).
# 막는 rc: 124(상한)·137(KILL)·125·126·127(timeout 자체 실패 — 실행 못 함·없음 · #2475 검수 ①). timeout 은 /usr/bin/timeout(GNU coreutils ·
#   Git Bash 도 같은 자리)만 쓴다 — PATH 의 Windows `timeout.exe`(대기 명령)가 잡히지 않게. 없으면 종전 동작(상한 없음 · 경고 1줄).
# 끄개 FORGE_HOOK_DEADLINE=off(사람만 · 종전 동작) · 시험용 FORGE_HOOK_TIMEOUT_BIN(timeout 경로 — 테스트가 실패 rc 를 흉내 낸다).
#   자식 표식 FORGE_HOOK_DEADLINE_CHILD 는 값이 정확히 1 일 때만 인정한다(#2475 검수 ③).
#   자식은 지금 도는 셸의 절대경로($BASH)로 띄운다 — PATH 에 bash 가 없는 환경에서 127 로 막지 않게(branch-base-develop case8).
# ⚠️ 무력화되는 입력: ①정체가 극심해 이 프로세스 자체가 등록 timeout 넘게 깨어나지 못하면 막을 기회가 없다 ②node·python 훅은 이 lib 를 못 쓴다
#   (enforce-env-ref-secrets.cjs) ③자식은 같은 훅 파일을 다시 연다 — 그 사이 파일이 바뀌면 새 판이 판정한다.
# 재현: bash shared/scripts/tests/hook-timeout-failclosed.test.sh
hook_deadline_guard() {   # hook_deadline_guard <훅 이름> <등록 timeout 초> [훅 인자…] — stdin 을 이 함수가 읽는다
  [ "${FORGE_HOOK_DEADLINE_CHILD:-}" = 1 ] && return 0
  [ "${FORGE_HOOK_DEADLINE:-on}" = off ] && return 0
  local _hdl_n="$1" _hdl_r="$2" _hdl_in; shift 2
  _hdl_in="$(cat)"
  _HDL_SELF="${BASH_SOURCE[1]}" hook_deadline_guard_input "$_hdl_n" "$_hdl_r" "$_hdl_in" "$@"
}
hook_deadline_guard_input() {   # hook_deadline_guard_input <훅 이름> <등록 timeout 초> <stdin JSON> [훅 인자…]
  [ "${FORGE_HOOK_DEADLINE_CHILD:-}" = 1 ] && return 0
  [ "${FORGE_HOOK_DEADLINE:-on}" = off ] && return 0
  local _hdl_n="$1" _hdl_r="$2" _hdl_in="$3" _hdl_self="${_HDL_SELF:-${BASH_SOURCE[1]}}" _hdl_to="${FORGE_HOOK_TIMEOUT_BIN:-/usr/bin/timeout}"
  shift 3
  if [ ! -x "$_hdl_to" ]; then
    echo "[$_hdl_n] ⚠️ GNU timeout($_hdl_to) 이 없다 — 판정 시간 상한 없이 돈다(#2483)" >&2; return 0
  fi
  case "$_hdl_r" in ''|*[!0-9]*|0) _hdl_r=10 ;; esac
  local _hdl_ms=$(( _hdl_r * 500 )) _hdl_o="${FORGE_HOOK_DEADLINE_SECS:-}"
  case "$_hdl_o" in ''|*[!0-9]*) ;; *) [ "$_hdl_o" -ge 1 ] && [ "$_hdl_o" -lt "$_hdl_r" ] && _hdl_ms=$(( _hdl_o * 1000 )) ;; esac
  # 이미 흐른 시간 — /proc/uptime(초·소수 2자리)과 /proc/$$/stat 22번째(시작 · 클럭 틱 100/초). read 만 쓴다(포크 없음). 못 읽으면 0.
  local _hdl_up _hdl_x _hdl_st _hdl_el=0
  if read -r _hdl_up _hdl_x < /proc/uptime 2>/dev/null && read -r _hdl_st < "/proc/$$/stat" 2>/dev/null; then
    local -a _hdl_f; read -r -a _hdl_f <<< "${_hdl_st##*) }"
    case "${_hdl_up}${_hdl_f[19]:-}" in *[!0-9.]*|'') ;; *)
      _hdl_el=$(( ${_hdl_up%.*} * 1000 + 10#${_hdl_up#*.}0 - ${_hdl_f[19]} * 10 ))
      [ "$_hdl_el" -lt 0 ] && _hdl_el=0 ;; esac
  fi
  local _hdl_left=$(( _hdl_ms - _hdl_el )) _hdl_rc=0
  if [ "$_hdl_left" -le 0 ]; then
    echo "⛔ [$_hdl_n] 판정을 시작하기도 전에 상한($(( _hdl_ms / 1000 ))초)을 넘겼다 — 막는다(fail-closed · #2483). 잠시 뒤 다시 실행하라." >&2; exit 2
  fi
  printf '%s' "$_hdl_in" | FORGE_HOOK_DEADLINE_CHILD=1 "$_hdl_to" -k 1 "$(( _hdl_left / 1000 )).$(printf '%03d' $(( _hdl_left % 1000 )))" "${BASH:-bash}" "$_hdl_self" "$@" || _hdl_rc=$?
  case "$_hdl_rc" in
    124|137) echo "⛔ [$_hdl_n] 판정이 상한 안에 끝나지 않았다 — 막는다(fail-closed · #2467). 훅이 시간 초과로 끊기면 Claude Code 가 명령을 그대로 실행하므로 먼저 막는다. 잠시 뒤 다시 실행하라." >&2; exit 2 ;;
    125|126|127) echo "⛔ [$_hdl_n] 판정 상한 감싸기($_hdl_to)가 실패했다(rc $_hdl_rc) — 막는다(fail-closed · #2483)." >&2; exit 2 ;;
  esac
  exit "$_hdl_rc"
}

# ══ 훅 공통 입구 (#3279) ═══════════════════════════════════════════════════════════════════════
# 왜: 차단 훅 21개가 머리말(시간 상한)·stdin 읽기·종료 코드를 각자 복사해, "차단 훅 전수에 판정 상한" 같은 정책 하나가 훅 전수 수정으로
#   번졌다(#2467·#2475·#2487). 입구를 이 파일 한 곳에 둔다 — 이 파일만 복사해 쓰는 시험이 있어(detect-injection-asi05-safe ·
#   issue-format-lint) 새 파일이 아니라 여기에 더한다.
# 사용(훅 맨 위 1줄 — 머리말 자리 그대로):
#   _HDL_D="${BASH_SOURCE[0]%/*}"; [ "$_HDL_D" = "${BASH_SOURCE[0]}" ] && _HDL_D=.; [ -f "$_HDL_D/lib/hook-deadline.sh" ] && . "$_HDL_D/lib/hook-deadline.sh" && hook_entry <훅 이름> <등록 timeout 초> "$@"
#   hook_entry  = hook_deadline_guard 와 같은 시간 상한(부모는 자기를 상한 아래서 다시 돌리고 그 rc 로 끝 · 자식·끄개는 바로 돌아감)
#                 + HOOK_NAME(훅 이름) · HOOK_LIB(이 lib 폴더) 설정. 자기 훅 파일은 호출한 파일(BASH_SOURCE[1])로 넘긴다 —
#                 hook_deadline_guard 를 감싸 부르면 그 안의 BASH_SOURCE[1] 이 이 lib 가 되어 엉뚱한 파일을 다시 돌린다.
#   hook_read_input → HOOK_INPUT 에 stdin 을 한 번만 읽어 둔다(두 번 불러도 다시 읽지 않는다 · `$( )` 안에서 부르지 않는다)
# 입력 읽기·종료 약속으로 훅 본문을 옮기는 것은 #3279 다음 조각 — 이 조각은 머리말만 바꾼다(본문 무변경).
# ⚠️ 무력화되는 입력: hook_deadline_guard 와 같다(위 머리말 ①~③).
hook_entry() {   # hook_entry <훅 이름> <등록 timeout 초> [훅 인자…]
  unset HOOK_INPUT _HOOK_INPUT_READ   # 환경에서 들어온 값으로 입력을 바꿔치기 못 하게(#3279-2) — 입력은 stdin 에서만
  HOOK_NAME="$1"; HOOK_LIB="${BASH_SOURCE[0]%/*}"
  [ "${FORGE_HOOK_DEADLINE_CHILD:-}" = 1 ] && return 0
  [ "${FORGE_HOOK_DEADLINE:-on}" = off ] && return 0
  local _he_n="$1" _he_r="$2" _he_in; shift 2
  _he_in="$(cat)"
  _HDL_SELF="${BASH_SOURCE[1]}" hook_deadline_guard_input "$_he_n" "$_he_r" "$_he_in" "$@"
}
hook_entry_input() {   # hook_entry_input <훅 이름> <등록 timeout 초> <이미 읽은 stdin JSON> [훅 인자…] (#3279-4)
  # 빠른 길을 상한 감싸기보다 먼저 도는 훅(stdin 을 먼저 읽음)용 — hook_entry 와 같은 약속에 넘겨받은 입력을 HOOK_INPUT 으로 둔다
  #   (읽음 표식 1 — hook_read_input 이 다시 읽지 않는다 · 환경에서 들어온 HOOK_INPUT 은 여기서 덮어쓴다).
  HOOK_NAME="$1"; HOOK_LIB="${BASH_SOURCE[0]%/*}"; HOOK_INPUT="$3"; _HOOK_INPUT_READ=1
  _HDL_SELF="${BASH_SOURCE[1]}" hook_deadline_guard_input "$@"
}
hook_read_input() { [ "${_HOOK_INPUT_READ:-}" = 1 ] || { HOOK_INPUT="$(cat)"; _HOOK_INPUT_READ=1; }; }
