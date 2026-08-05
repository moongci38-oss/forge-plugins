#!/usr/bin/env bash
# forge-onboard.test.sh — SessionStart 온보딩 훅 회귀 테스트
#
# 이 훅은 2026-07-25 이전에 **매니페스트에만 남고 파일이 없는 상태**로 방치됐다
# (615ba01 에서 조립 사각지대로 유실). 같은 사고를 다시 잡기 위해:
#   - 매니페스트가 가리키는 파일이 실재하는지 (dangling 참조 회귀)
#   - 훅이 실제로 초기화를 수행하는지 (빈 껍데기 회귀)
#   - 멱등한지, 그리고 **절대 세션을 막지 않는지** (AD-168)
#
# 실행: bash forge-onboard.test.sh   (전체 통과 시 exit 0)

set -uo pipefail

# mktemp 실패를 흘려보내면 빈 변수로 계속 진행해 **거짓 PASS** 가 난다(실측: 읽기전용
# /tmp 환경에서 일부 항목이 통과처럼 보고됨 — cr-final MEDIUM).
# ⚠️ 함수 안의 `exit` 는 `$( )` 서브셸만 죽인다 — 호출측은 FATAL 문자열을 경로로 삼고
#    계속 간다. 그래서 **호출부마다 `|| exit 2`** 를 붙여야 실제로 치명이 된다
#    (cr-final 2차 지적 — 1차 수정이 이 지점을 놓쳤다).
mktmp() {
  local d
  d="$(mktemp -d 2>/dev/null)" || { echo "FATAL: mktemp -d 실패 — 테스트 환경 불가"; exit 2; }
  [ -n "$d" ] && [ -d "$d" ] || { echo "FATAL: 임시 디렉토리 무효"; exit 2; }
  echo "$d"
}

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$HERE/forge-onboard.sh"
PLUGIN_ROOT="$(cd "$HERE/.." && pwd)"
MANIFEST="$PLUGIN_ROOT/.claude-plugin/plugin.json"

PASS=0; FAIL=0; FAILED=()
ok()   { PASS=$((PASS+1)); echo "  PASS: $1"; }
no()   { FAIL=$((FAIL+1)); FAILED+=("$1"); echo "  FAIL: $1 -- ${2:-}"; }
check(){ if [ "$1" = "0" ]; then ok "$2"; else no "$2" "${3:-}"; fi; }

echo "=== 매니페스트 ↔ 파일 실재 (dangling 참조 회귀) ==="
# 추출 실패를 조용히 넘기면 "참조 0건 = 전부 통과"라는 거짓 통과가 된다(cr-final LOW).
# CLAUDE_PLUGIN_ROOT 를 언급했는데 경로를 못 뽑아내면 UNPARSED 로 내보내 실패시킨다.
mapfile -t REFS < <(python3 -c "
import json,re
d=json.load(open('$MANIFEST'))
for ev, groups in (d.get('hooks') or {}).items():
    for g in groups:
        for h in g.get('hooks', []):
            cmd = h.get('command','')
            m = re.search(r'\\\$\{?CLAUDE_PLUGIN_ROOT\}?/([A-Za-z0-9._/-]+)', cmd)
            if m:
                print(ev, m.group(1))
            elif 'CLAUDE_PLUGIN_ROOT' in cmd:
                print(ev, 'UNPARSED:' + cmd[:60].replace(' ', '_'))
")
[ "${#REFS[@]}" -gt 0 ]; check $? "매니페스트에서 훅 참조 추출" "참조 0건"
! printf '%s\n' "${REFS[@]}" | grep -q "UNPARSED:"
check $? "모든 훅 참조가 파싱됨(정규식 사각지대 없음)" "$(printf '%s\n' "${REFS[@]}" | grep UNPARSED: | head -1)"
for r in "${REFS[@]}"; do
  ev="${r%% *}"; rel="${r#* }"
  [ -f "$PLUGIN_ROOT/$rel" ]
  check $? "$ev 참조 파일 실재: $rel" "파일 없음 — dangling 참조"
done

echo
echo "=== 훅 정적 검사 ==="
bash -n "$HOOK"; check $? "문법 OK"
[ -x "$HOOK" ]; check $? "실행 권한 있음"
grep -q "trap 'exit 0' ERR" "$HOOK"; check $? "fail-open trap 존재"
! grep -qE '^\s*set -euo' "$HOOK"; check $? "set -e 로 중도 중단하지 않음"

echo
echo "=== 실제 초기화 동작 (빈 껍데기 회귀) ==="
FAKE_HOME="$(mktmp)" || exit 2
OUT="$(HOME="$FAKE_HOME" CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT" bash "$HOOK" 2>&1)"; RC=$?
[ "$RC" = "0" ]; check $? "exit 0 (세션 미차단)" "rc=$RC"
[ -d "$FAKE_HOME/.claude/handover/opus" ]; check $? "세션 디렉토리 생성(handover/opus)"
[ -d "$FAKE_HOME/.claude/checkpoints" ];   check $? "세션 디렉토리 생성(checkpoints)"
[ -f "$FAKE_HOME/.claude/rules/forge-core.md" ]; check $? "플러그인 rules 설치"
[ -f "$FAKE_HOME/.claude/skills/cr-multi/workflow.js" ]
check $? "cr-multi workflow.js 자가설치(설치 후 /cr-multi 동작 조건)"

echo
echo "=== 멱등성 ==="
BEFORE="$(find "$FAKE_HOME" -type f | sort | md5sum)"
HOME="$FAKE_HOME" CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT" bash "$HOOK" >/dev/null 2>&1
check $? "2회차 실행 exit 0"
AFTER="$(find "$FAKE_HOME" -type f | sort | md5sum)"
[ "$BEFORE" = "$AFTER" ]; check $? "2회차가 파일 집합을 바꾸지 않음(멱등)"

echo
echo "=== 의존성 부재 내성 (openssl 없는 환경) ==="
FAKE_HOME2="$(mktmp)" || exit 2; STUB="$(mktmp)" || exit 2
# openssl 만 없는 PATH 를 구성한다(다른 기본 명령은 유지)
printf '#!/usr/bin/env bash\nexit 127\n' > "$STUB/openssl"; chmod +x "$STUB/openssl"
OUT2="$(HOME="$FAKE_HOME2" CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT" PATH="$STUB:$PATH" bash "$HOOK" 2>&1)"; RC2=$?
[ "$RC2" = "0" ]; check $? "openssl 실패해도 exit 0" "rc=$RC2"
[ -d "$FAKE_HOME2/.claude/checkpoints" ]
check $? "openssl 실패해도 나머지 단계 계속 수행(중도 중단 없음)"
[ ! -f "$FAKE_HOME2/.config/forge/orch-token.key" ]
check $? "실패한 토큰 파일 잔재 없음"

echo
echo "=== handover-manager.sh dead-bundle 부재 + dangling 번들참조 금지 ==="
[ ! -f "$PLUGIN_ROOT/hooks/handover-manager.sh" ]
check $? "handover-manager.sh 미번들(dead bundle 제거 유지)" "재유입 — 번들 존재"

# 2026-08-04 계약 정정 — 원래 이 자리에는 `grep -rq "handover-manager.sh" commands/` 로
#   **모든** 참조를 금지하는 검사가 있었다(v0.7.0, /forge-start·end 통합 직후 참조가 실제로 0이던 시점).
#   그런데 그 뒤 커맨드가 다시 `${FORGE_ROOT}/shared/scripts/handover-manager.sh` 를 부르게 되면서
#   이 검사가 발화했다. 실측해보니 그 금지는 **9개 중 1개만 콕 집는 비일관 계약**이었다:
#
#     $ grep -oE '\$\{FORGE_ROOT[^}]*\}/[a-z/]*[a-z-]+\.(sh|py|mjs)' \
#           ~/forge/.claude/commands/forge-end.md | sort -u | wc -l
#     → 9종(debug-knowledge-sync · forge-outputs-autosync · handover-landing · handover-manager ·
#        index-refresh · learnings · memory-sync · session-recall · session-record-audit), 총 11회
#       (2026-08-04 관측)
#
#   즉 forge-end 는 설계상 이미 forge 레포 스크립트에 광범위하게 의존하고, 전부 `|| true` fail-open 이다.
#   handover-manager 하나만 금지하는 것은 원래 의도(=**번들에 없는 것을 번들 경로로 부르는
#   dangling 참조** 차단, 2026-07-25 실사고 #35)를 표현하지 못한다.
#
#   그래서 검사를 실제 위험으로 좁힌다: **번들 상대경로 참조만 금지**한다.
#   `${FORGE_ROOT}/shared/scripts/...` 형태는 다른 8종과 동일 취급(허용).
#   ⚠️ 이 방어가 못 잡는 것: ~/forge 가 없는 순수 플러그인 사용자에게는 이 9종 호출이 전부
#      조용히 skip 된다(무성 강등). 그것은 이 가드의 범위가 아니라 forge-end 의 플러그인
#      이식성 설계 이슈이며 별도 결정 대상이다 — 리포트에 남겼다.
! grep -rqE '(CLAUDE_PLUGIN_ROOT|\$\{?PLUGIN_ROOT)[^ ]*handover-manager\.sh' "$PLUGIN_ROOT/commands/" 2>/dev/null
check $? "번들 상대경로로 handover-manager 를 부르는 커맨드 0(dangling 참조 금지)"

echo
echo "=== nounset 내성: CLAUDE_PLUGIN_ROOT 미설정 (cr-final MEDIUM 회귀) ==="
FAKE_HOME3="$(mktmp)" || exit 2
( unset CLAUDE_PLUGIN_ROOT; HOME="$FAKE_HOME3" bash "$HOOK" >/dev/null 2>&1 )
check $? "CLAUDE_PLUGIN_ROOT 미설정에도 exit 0(set -u 종료 회귀)"
[ -d "$FAKE_HOME3/.claude/checkpoints" ]
check $? "plugin-root 무관 단계는 그대로 수행됨"

echo
echo "=== 단계별 계속 진행: 실패해도 후속 단계 수행 (cr-final MEDIUM 회귀) ==="
# rules 목적지를 파일로 막아 2번 단계를 실패시킨 뒤, 4번(세션 디렉토리)이 도는지 본다.
FAKE_HOME4="$(mktmp)" || exit 2
mkdir -p "$FAKE_HOME4/.claude"
: > "$FAKE_HOME4/.claude/rules"          # 디렉토리 자리에 파일 → mkdir 실패 유도
HOME="$FAKE_HOME4" CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT" bash "$HOOK" >/dev/null 2>&1
check $? "중간 단계 실패해도 exit 0"
[ -d "$FAKE_HOME4/.claude/checkpoints" ]
check $? "앞 단계 실패 후에도 뒤 단계가 실행됨(trap 즉시종료 회귀)"

echo
echo "=== 쓰기 불가 HOME 내성 ==="
RO="$(mktmp)" || exit 2; chmod 500 "$RO"
HOME="$RO" CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT" bash "$HOOK" >/dev/null 2>&1
check $? "쓰기 불가 HOME 에서도 exit 0(세션 미차단)"
chmod 700 "$RO"

rm -rf "$FAKE_HOME" "$FAKE_HOME2" "$FAKE_HOME3" "$FAKE_HOME4" "$STUB" "$RO" 2>/dev/null

echo
echo "=== Summary ==="
echo "PASS: $PASS  FAIL: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  printf '  - %s\n' "${FAILED[@]}"
  exit 1
fi
exit 0
