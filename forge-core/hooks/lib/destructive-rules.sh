#!/bin/bash
# lib/destructive-rules.sh — forge-destructive-op-block 의 bash 규칙 6개(1·2·3·4·5·6). 훅이 source 하고 절마다 fdob_rule_N 을 부른다(#3277-5).
#   각 함수 몸통 = 훅에 있던 그 절의 본문 바이트 그대로(제목 줄은 훅에 남는다) · 전역 변수($CMD 등)를 쓰고 exit 0|2 로 훅을 끝낸다.
#   나머지 규칙(3b·5b·7·DB 하드스톱)의 판정은 각자 lib/destructive-*.py(#3277-1~-4).
# 재현: bash shared/scripts/tests/destructive-modules.test.sh

fdob_rule_1() {
if echo "$CMD" | grep -qE 'git push.*--force.*\b(main|master)\b|git push.*\b(main|master)\b.*--force'; then
  echo "BLOCKED (AD-47): main/master force push 금지. /forge-rollback 사용." >&2
  exit 2
fi
# #3278-3 — no-force-push 와 같은 판정 파일로도 본다(위 grep 과 합집합 · 결정 ㉡·㉰). push 가 없으면 부르지 않는다 ·
#   판정 파일이 없거나 죽으면 위 grep 판정만 남는다(종전과 같다). 넘기는 값은 no-force-push 와 같다(훅 프로세스 위치 기준).
case "$CMD" in *push*) ;; *) return 0 ;; esac
[ -f "$_HDL_D/lib/force-push-judge.py" ] || return 0
local _fp_br _fp_gd _fp_cd _fp_top _fp_lw=0 _fp_in _fp_res
_fp_br=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
_fp_gd=$(git rev-parse --git-dir 2>/dev/null || echo ""); _fp_cd=$(git rev-parse --git-common-dir 2>/dev/null || echo "")
_fp_top=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
if [ -n "$_fp_gd" ] && [ -n "$_fp_cd" ]; then
  _fp_gd=$(cd "$_fp_gd" 2>/dev/null && pwd -P || echo ""); _fp_cd=$(cd "$_fp_cd" 2>/dev/null && pwd -P || echo "")
  if [ -n "$_fp_gd" ] && [ -n "$_fp_cd" ] && [ "$_fp_gd" != "$_fp_cd" ]; then
    case "$_fp_top" in */.claude/worktrees/*) _fp_lw=1 ;; esac
  fi
fi
_fp_in=$(mktemp "${TMPDIR:-/tmp}/.fdob-fp.XXXXXXXX" 2>/dev/null) || return 0
printf '%s' "$INPUT" > "$_fp_in" 2>/dev/null || { rm -f "$_fp_in"; return 0; }
_fp_res=$(NFP_INPUT_FILE="$_fp_in" NFP_CURRENT_BRANCH="$_fp_br" NFP_IS_LINKED_WORKTREE="$_fp_lw" NFP_LIB="$_HDL_D/lib" \
          python3 "$_HDL_D/lib/force-push-judge.py" 2>/dev/null | sed -n '1p') || _fp_res=""
rm -f "$_fp_in"
case "$_fp_res" in
  BLOCK_PROTECTED)
    echo "BLOCKED (AD-47): main/master force push 금지. /forge-rollback 사용." >&2
    exit 2 ;;
  BLOCK_UNKNOWN)
    echo "BLOCKED (AD-47 · #3278): 알 수 없는 브랜치에 force push — 허용: feature/*, fix/*, hotfix/*, release/*, chore/*, docs/*, staging" >&2
    echo "  worktree-*: 자기 워크트리의 현재 브랜치일 때만 허용 · 대상 브랜치를 명령에 적는다(대상 없는 --force 는 막는다)" >&2
    exit 2 ;;
esac
}

fdob_rule_2() {
if echo "$CMD" | grep -qE 'git branch -D (main|master|develop)'; then
  echo "BLOCKED (AD-47): 보호 브랜치 삭제 금지." >&2
  exit 2
fi
}

fdob_rule_3() {
#
# 문자열 매칭 대신 **경로를 정규화(~·$HOME·${HOME} 펼침)한 뒤 명시 목록과 대조**한다 —
#   리터럴만 보면 절대경로·$HOME 변형·홈 전체가 빠지고, ` /[a-z]` 같은 넓은 꼴은 /tmp 까지 막는다.
#
# ⚠️ 이 방어가 무력화되는 입력: 변수 간접 참조(D=$HOME 후 그 변수 사용)·명령 치환으로 경로를
#   조립하면 문자열에 홈 경로가 나타나지 않아 통과한다. 훅은 문자열만 본다 —
#   **최종 방어선이 아니라 실수 방지선**이다.
# 재현: bash shared/scripts/tests/destructive-guard-rm.test.sh
_FDOB_HOME="${HOME%/}"
_FDOB_NORM=$(printf '%s' "$CMD" | sed \
  -e "s|\${HOME}|${_FDOB_HOME}|g" \
  -e "s|\$HOME|${_FDOB_HOME}|g" \
  -e "s|~|${_FDOB_HOME}|g")

_fdob_is_carveout() {   # L-53: 스킬/에이전트/커맨드 **폴더 하나**만 지우는 것은 허용
  local t="${1%/}" rest
  case "$t" in
    "$_FDOB_HOME"/forge/.claude/skills/*|"$_FDOB_HOME"/forge/.claude/agents/*|"$_FDOB_HOME"/forge/.claude/commands/*)
      rest="${t#"$_FDOB_HOME"/forge/.claude/}"; rest="${rest#*/}"
      case "$rest" in */*) return 1 ;; esac
      return 0 ;;
  esac
  return 1
}

_fdob_is_protected() {
  local t="$1"
  # ⚠️ 루트는 잘라내기 **전에** 본다. `${t%/}` 를 먼저 하면 "/" 가 빈 문자열이 되고
  #    아래 -z 검사에 걸려 루트 삭제가 통째로 빠진다.
  [ "$t" = "/" ] && return 0
  t="${t%/}"
  [ -z "$t" ] && return 1
  case "$t" in
    "$_FDOB_HOME") return 0 ;;
    "$_FDOB_HOME"/.claude|"$_FDOB_HOME"/.claude/*) return 0 ;;
    "$_FDOB_HOME"/forge|"$_FDOB_HOME"/forge/*) return 0 ;;
    /home|/home/*) return 0 ;;
    /|"/*") return 0 ;;
    /etc|/etc/*|/usr|/usr/*|/var|/var/*|/bin|/bin/*|/sbin|/sbin/*) return 0 ;;
    /lib|/lib/*|/lib64|/lib64/*|/boot|/boot/*|/opt|/opt/*) return 0 ;;
    /srv|/srv/*|/root|/root/*|/sys|/sys/*|/proc|/proc/*|/dev|/dev/*) return 0 ;;
  esac
  return 1
}

# 플래그 순서만 바꾼 자명한 우회(-fr)도 같이 본다.
while IFS= read -r _FDOB_T; do
  [ -z "$_FDOB_T" ] && continue
  # 앞뒤 따옴표를 벗긴다 — 아래 추출의 제외 집합 `[^ ;&|)]` 에 따옴표가 없어 `"/home/<user>/forge` 가
  #   **따옴표째** 대상이 되고, 그대로는 `_fdob_is_protected()` 의 case 와 매칭되지 않는다.
  #
  # ⛔ 제외 집합에 따옴표를 추가하는 방식으로 고치지 마라 — **더 위험하다.**
  #   `[^ ;&|)"']+` 로 바꾸면 `rm -rf "` 뒤에서 매칭이 아예 실패해 **대상 0개 = 조용한 통과**가 된다.
  #   재현: printf 'rm -rf "/home/<user>/forge"' | grep -oE 'rm +-(rf|fr) +[^ ;&|)"'"'"']+' → 출력 없음
  #   그래서 추출은 탐욕적으로 두고 **여기서 벗긴다**.
  #
  # ⚠️ 이 수정이 무력화되는 입력: 경로 **중간**에 따옴표가 섞인 형태(`/home/"u"/forge`)나
  #   변수 간접 참조는 여전히 통과한다 — 위 §이 방어가 무력화되는 입력(실수 방지선) 그대로다.
  _FDOB_T="${_FDOB_T#[\"\']}"
  _FDOB_T="${_FDOB_T%[\"\']}"
  [ -z "$_FDOB_T" ] && continue
  _fdob_is_carveout "$_FDOB_T" && continue
  if _fdob_is_protected "$_FDOB_T"; then
    echo "BLOCKED (AD-47): 시스템 디렉토리 rm -rf 금지 — 대상: $_FDOB_T" >&2
    echo "  예외: ~/forge/.claude/{skills,agents,commands}/<이름> 폴더 1개 삭제는 허용된다(L-53)." >&2
    exit 2
  fi
done <<< "$(printf '%s' "$_FDOB_NORM" | grep -oE 'rm +-(rf|fr) +[^ ;&|)]+' | sed -E 's/^rm +-(rf|fr) +//')"
}

fdob_rule_4() {
if echo "$CMD" | grep -qE '(^|[;&|[:space:]])(psql|mysql|mariadb|sqlite3|mongosh|mongo)\b' && \
   echo "$CMD" | grep -qiE 'DROP[[:space:]]+(TABLE|DATABASE)|(^|[[:space:]"'"'"'])TRUNCATE([[:space:]"'"'"']|$)'; then

  # test-DB 화이트리스트 (P0-②): 폐기 가능한 test/qa DB(스키마 드리프트 리셋 목적)는
  # 운영 DB와 분리해 허용한다. 대상 DB명은 명령 문자열에서 best-effort 추출
  # (-d/--dbname/--database 옵션, DATABASE_URL/DB_NAME 환경변수 대입, DB 접속 URL 경로).
  # BOUNDARY_OVERRIDE 등 override 플래그와 무관하게 독립 작동. 판별 불가 시 기존 보호 유지(차단).
  TEST_DB_MARKER='(^|[_-])(test|qa|e2e|ci)([_-]|$)'
  DB_CANDIDATES=$(echo "$CMD" | grep -oE '(-d|--dbname|--database)[=[:space:]]+[A-Za-z0-9_]+|DATABASE_URL=[^ ]+|DB_NAME=[A-Za-z0-9_]+|(postgres|postgresql|mysql|mariadb|mongodb(\+srv)?)://[^ ]+' 2>/dev/null || true)

  IS_TEST_DB=0
  DBNAME=""
  if [ -n "$DB_CANDIDATES" ]; then
    while IFS= read -r cand; do
      [ -z "$cand" ] && continue
      # 접속 URL 형태면 마지막 '/' 이후 '?' 이전을 DB명으로, 그 외(옵션/환경변수)는 '='/공백 뒤 값을 DB명으로 간주.
      CANDNAME=$(echo "$cand" | sed -E 's#.*://[^/]+/##; s/[?].*$//; s/^.*[=[:space:]]//')
      if echo "$CANDNAME" | grep -qiE "$TEST_DB_MARKER"; then
        IS_TEST_DB=1
        DBNAME="$CANDNAME"
        break
      fi
    done <<< "$DB_CANDIDATES"
  fi

  if [ "$IS_TEST_DB" = "1" ]; then
    # 감사 로그 기본 자리 = forge-outputs/.claude/audit — /tmp 는 재부팅·tmpreaper 로 사라져 증거가 쌓이지 않는다.
    #   기본값으로 두어 설정 없이 발효된다(settings.json env 는 머신마다 설정이 필요) — env 는 오버라이드로만 남긴다.
    # 폐기조건: forge-outputs 가 없는 환경이 표준이 되면 폴백 경로를 재검토한다.
    AUDIT_LOG="${FORGE_DESTRUCTIVE_AUDIT_LOG:-${FORGE_OUTPUTS:-$HOME/forge-outputs}/.claude/audit/destructive-op-audit.jsonl}"
    mkdir -p "$(dirname "$AUDIT_LOG")" 2>/dev/null || true
    TS=$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "")
    # 마스킹 후 자른다 — 순서를 뒤집으면 100자 절단면에 시크릿 앞부분이 남는다.
    CMD_SUMMARY=$(mask_secrets "$CMD" | cut -c1-100)
    { [ -n "$TS" ] && printf '%s ' "$TS"; echo "ALLOWED test-db-whitelist db=$DBNAME cmd=$CMD_SUMMARY"; } >> "$AUDIT_LOG" 2>/dev/null || true
    exit 0
  fi

  echo "BLOCKED (AD-47): DB 클라이언트 파괴적 작업(DROP/TRUNCATE) 금지. 백업 확인 후 수동 실행." >&2
  exit 2
fi
}

fdob_rule_5() {
#   토큰 인접을 가정하지 않고 **한 명령 세그먼트 안의 동시 등장**으로 본다 — 플래그를 끼운
#   `git reset -q --hard`·`git -C /path reset --hard` 도 잡는다
#   (`;` `&` `|` 를 넘지 않으므로 뒤에 이어붙인 다른 명령까지 번지지는 않는다).
# ⚠️ 이 방어가 무력화되는 입력: 명령을 변수에 담아 실행하면(`C="git reset --hard"; $C`)
#   문자열 대조로는 못 잡는다. 또 **산문에도 발화한다** — 커밋 메시지·문서 인자에 이 단어가
#   들어가면 막히므로, 그럴 때는 파일(`-F`)로 넘기거나 표현을 바꿔 쓴다. 오탐이 성가신 것보다
#   미탐으로 파일이 날아가는 편이 훨씬 비싸다.
# 재현: bash .claude/hooks/tests/destructive-op-block.test.sh
if echo "$CMD" | grep -qE '(^|[;&|[:space:]])git[^;&|]*[[:space:]]reset[^;&|]*--hard' \
   || echo "$CMD" | grep -qE '(^|[;&|[:space:]])git[^;&|]*[[:space:]](checkout|restore)[[:space:]]+(--[[:space:]]+)?\.([[:space:]]|$)'; then
  echo "BLOCKED (GS-B3): git 파괴적 재설정 금지 (reset --hard / checkout . / restore .). 변경 내용 백업 확인 후 수동 실행." >&2
  exit 2
fi
}

fdob_rule_6() {
if echo "$CMD" | grep -qE '(^|[;&|[:space:]])(kubectl (delete|destroy)|docker (rm|rmi|stop|kill) )'; then
  echo "BLOCKED (GS-B3): 컨테이너/클러스터 파괴적 작업 금지. 확인 후 수동 실행." >&2
  exit 2
fi
}
