#!/usr/bin/env bash
# hook-dedup.sh — 같은 도구 호출을 훅 하나가 **1번만 판정**하게 한다 (#2281)
#
# 왜 있나: block-hook-tamper · forge-destructive-op-block 은 프로젝트 레인(.claude/settings.json)과 전역 레인(~/.claude/settings.json)
#   **둘 다**에 등록돼 있다 — 일부러다. 프로젝트 레인은 git 으로 전 PC 에 보장되는 유일한 길이고, Codex 가드 레인
#   (codex-hook-adapter.py)도 프로젝트 settings 만 읽는다(빼면 Codex 의 rm -rf 차단이 0회 — PR #2298 qa CRITICAL-1).
#   그래서 등록은 둘 다 두고, 한 호출에 두 번 도는 낭비(BOUNDARY 로그 47% 중복)는 훅 안에서 막는다(총괄 결정 2026-10-09).
#
# 어떻게: 첫 실행이 표식(claim)을 원자적으로 만들고 판정한 뒤 끝날 때 종료코드를 적는다. 같은 호출의 두 번째 실행은
#   그 종료코드를 **그대로 돌려준다**(0 이면 즉시 통과 · 2 면 차단 — 첫 실행이 이미 막았다). 판정은 1번, 부작용(로그)도 1번.
#   ⚠️ "두 번째는 무조건 rc 0" 이 아니다 — 키가 겹치는 다른 호출(같은 세션에서 막힌 명령을 다시 친 것)이 rc 0 으로 새지 않게
#   첫 판정을 되풀이한다. 두 레인이 동시에 돌면 두 번째는 첫 판정을 ≤3초 기다리고, 그래도 없으면 직접 판정한다.
# 키: 훅 이름 + `tool_use_id`(있으면) — 없으면 `session_id` + 입력 전체 해시. 둘 다 없으면 중복 제거를 안 한다.
# fail-open: python3 없음·표식 폴더를 못 만듦·남의 폴더·심링크 → 아무것도 안 하고 돌아간다 = 종전처럼 두 번 돈다
#   (이중 실행은 낭비일 뿐 보안 구멍이 아니다). 표식은 1분 뒤 지운다.
# 위협 모델: 같은 사용자가 표식 폴더에 rc 0 을 미리 써 두면 판정을 건너뛴다 — 같은 사용자는 훅 파일 자체도 고칠 수 있다
#   (block-hook-tamper 머리말 "실수 방지이지 악의 차단이 아니다"와 같은 경계). 남의 사용자는 폴더(700·소유자 확인)로 막는다.
# 환경: FORGE_HOOK_DEDUP_DIR(표식 폴더 — 테스트용) · FORGE_HOOK_DEDUP=off(끄기 — 사람용)
# 재현: bash shared/scripts/tests/hook-dedup.test.sh
# 폐기조건: Claude Code 가 같은 훅 명령의 두 레인 등록을 스스로 1번만 돌리면 이 파일과 두 훅의 호출 줄을 지운다.

hook_dedup_begin() {   # hook_dedup_begin <훅 이름> <stdin JSON> — 두 번째 실행이면 첫 판정으로 exit, 아니면 return 0
  [ "${FORGE_HOOK_DEDUP:-on}" = off ] && return 0
  command -v python3 >/dev/null 2>&1 || return 0
  local _hd_key _hd_dir _hd_i _hd_rc
  _hd_key="$(printf '%s' "$2" | HD_NAME="$1" python3 -c '
import hashlib, json, os, sys
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)
if not isinstance(d, dict):
    sys.exit(0)
tid, sid = d.get("tool_use_id"), d.get("session_id")
if isinstance(tid, str) and tid:
    k = "t|" + tid
elif isinstance(sid, str) and sid:
    k = "s|" + sid + "|" + json.dumps(d, sort_keys=True, ensure_ascii=False)
else:
    sys.exit(0)
print(hashlib.sha256((os.environ["HD_NAME"] + "|" + k).encode("utf-8")).hexdigest()[:40])' 2>/dev/null)" || return 0
  [ -n "$_hd_key" ] || return 0
  _hd_dir="${FORGE_HOOK_DEDUP_DIR:-${XDG_RUNTIME_DIR:-${TMPDIR:-/tmp}}/forge-hook-dedup-$(id -u 2>/dev/null || echo x)}"
  mkdir -p -m 700 "$_hd_dir" 2>/dev/null || return 0
  { [ -d "$_hd_dir" ] && [ ! -L "$_hd_dir" ] && [ -O "$_hd_dir" ]; } || return 0
  find "$_hd_dir" -maxdepth 1 -type f -mmin +1 -delete 2>/dev/null || true
  _HD_F="$_hd_dir/$_hd_key"
  if ( set -o noclobber; : > "$_HD_F.claim" ) 2>/dev/null; then
    # 첫 실행 — 끝날 때 종료코드를 원자적으로 남긴다(.rc.tmp → .rc)
    trap '_hd_x=$?; printf "%s" "$_hd_x" > "$_HD_F.rc.tmp" 2>/dev/null && mv -f "$_HD_F.rc.tmp" "$_HD_F.rc" 2>/dev/null; exit $_hd_x' EXIT
    return 0
  fi
  for _hd_i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do
    if [ -f "$_HD_F.rc" ]; then
      _hd_rc="$(cat "$_HD_F.rc" 2>/dev/null)"
      case "$_hd_rc" in
        0) exit 0 ;;
        2) echo "[$1] 같은 호출을 다른 레인의 같은 훅이 이미 막았다(#2281 — 사유는 그쪽 메시지)" >&2; exit 2 ;;
        *) return 0 ;;   # 알 수 없는 값 = 직접 판정
      esac
    fi
    sleep 0.1 2>/dev/null || break
  done
  return 0   # 첫 실행이 아직 안 끝났다(또는 죽었다) → 종전처럼 직접 판정
}
