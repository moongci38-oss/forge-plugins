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
# ⚠️ 2026-08-20: `[ -x "$HOOK" ]` 단정을 **뺐다.** 상시 FAIL 1건을 내던 항목인데,
#   틀린 쪽이 테스트였다:
#     · 매니페스트가 `bash "…/forge-onboard.sh"` 로 호출한다 → **실행 비트가 필요 없다**
#     · 같은 디렉터리 훅 12개 중 10개가 644 다(755 는 main-write-guard.sh 하나뿐) —
#       레포 관행이 644 인데 이 한 파일에만 755 를 요구하는 셈이었다
#   상시 빨간 검사는 아무도 안 본다. 그러면 이 파일이 지키는 **진짜 계약**(매니페스트가
#   가리키는 파일이 실재하는가 — 약 1개월간 훅이 깨진 채 방치된 사고로 생긴 검사)까지
#   같이 무시당한다. **경보는 울리는 것보다 믿기는 것이 중요하다.**
#   지우기만 하면 "왜 없앴지"가 남으므로, 그 자리에 **성립하는 단정**을 넣는다:
#   실행 비트가 필요 없는 이유 자체(= bash 로 호출된다)를 고정한다.
#   ⚠️ `-F`(고정 문자열)로 찾는다. 정규식으로 두면 `.sh` 의 `.` 가 임의 문자로 읽혀
#     `forge-onboardXsh` 같은 엉뚱한 항목에도 통과한다(2026-08-20 검수 LOW 실측).
grep -qF 'bash \"${CLAUDE_PLUGIN_ROOT}/hooks/'"$(basename "$HOOK")"'\"' "$MANIFEST"
check $? "매니페스트가 bash 로 호출한다(그래서 실행 비트가 불필요하다)"
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
# ⚠️ **번들에 넣은 rules 가 전량 설치되는가** — 파일만 넣고 설치가 안 되면 "넣었다"가 거짓이 된다.
#   설치 루프가 글롭(`rules/*.md`)이라 지금은 자동으로 따라오지만, 누가 하드코딩 목록으로
#   바꾸면 조용히 어긋난다. 그 순간을 잡는다.
#   (forge SSoT 를 참조하지 않으므로 CI 러너에서도 유효하다 — §1~3 과 달리 SKIP 되지 않는다)
_N_BUNDLE=$(ls "$PLUGIN_ROOT/rules/"*.md 2>/dev/null | wc -l)
_N_INST=$(ls "$FAKE_HOME/.claude/rules/"*.md 2>/dev/null | wc -l)
[ "$_N_BUNDLE" -gt 0 ] && [ "$_N_INST" = "$_N_BUNDLE" ]
check $? "번들 rules 전량 설치 (번들 $_N_BUNDLE = 설치 $_N_INST)" "설치 누락 — 파일만 넣고 배선이 안 됐다"

# 2026-08-21 Human 승인으로 추가된 5종이 **실제로 번들에 있는가**.
#   빠져 있으면 플러그인 사용자는 카논의 62%를 못 받는다(그 상태로 3주 이상 있었다).
for _r in context-engineering dev-workflow-rules model-routing security-agent-input success-is-silent; do
  [ -f "$PLUGIN_ROOT/rules/$_r.md" ]
  check $? "카논 rules 번들 포함: $_r.md" "번들에 없음 — 사용자가 이 규범을 못 받는다"
done
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

echo
echo "=== 설치본 뒤처짐 경보 (갭 G4) ==="
# 전파 3층 중 ③(설치 캐시)만 자동 확인 지점이 없어, 7~10 패치 뒤처진 채 3주 방치됐다.
# 이 검사는 **로컬 파일 두 개**만 대조한다(네트워크 불필요) — WARN 만, 차단 없음(AD-168).
mk_g4_home() { # $1=설치버전 $2=마켓버전
  local h; h="$(mktmp)" || exit 2
  mkdir -p "$h/.claude/plugins/marketplaces/forge-plugins/forge-core/.claude-plugin"
  printf '{"version":2,"plugins":{"forge-core@forge-plugins":[{"scope":"user","version":"%s"}]}}' "$1" \
    > "$h/.claude/plugins/installed_plugins.json"
  printf '{"name":"forge-core","version":"%s"}' "$2" \
    > "$h/.claude/plugins/marketplaces/forge-plugins/forge-core/.claude-plugin/plugin.json"
  echo "$h"
}

G4A="$(mk_g4_home 0.7.2 0.7.11)"
OUT_G4A="$(HOME="$G4A" CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT" bash "$HOOK" 2>&1)"; RC_G4A=$?
[ "$RC_G4A" = "0" ]; check $? "G4: 경보가 떠도 exit 0(세션 미차단)" "rc=$RC_G4A"
printf '%s' "$OUT_G4A" | grep -q '0.7.2→0.7.11'
check $? "G4: 뒤처진 설치본을 탐지하고 버전을 함께 보여준다" "$(printf '%s' "$OUT_G4A" | tail -2)"

# ⚠️ 숫자 비교여야 한다 — 문자열 비교면 '0.7.2' > '0.7.11' 로 읽혀 **거꾸로** 판정한다.
#   위 케이스가 바로 그 함정(2 vs 11)을 밟고 있다.
G4B="$(mk_g4_home 0.7.11 0.7.11)"
OUT_G4B="$(HOME="$G4B" CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT" bash "$HOOK" 2>&1)"
! printf '%s' "$OUT_G4B" | grep -q '뒤처져'
check $? "G4: 같은 버전이면 조용하다(오탐 없음)" "$(printf '%s' "$OUT_G4B" | tail -2)"

G4C="$(mk_g4_home 0.7.12 0.7.11)"
OUT_G4C="$(HOME="$G4C" CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT" bash "$HOOK" 2>&1)"
! printf '%s' "$OUT_G4C" | grep -q '뒤처져'
check $? "G4: 설치본이 더 최신이어도 조용하다" "$(printf '%s' "$OUT_G4C" | tail -2)"

# 파일이 아예 없는 환경(플러그인 미설치·신규 머신)에서 죽지 않는다
G4D="$(mktmp)" || exit 2
OUT_G4D="$(HOME="$G4D" CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT" bash "$HOOK" 2>&1)"; RC_G4D=$?
[ "$RC_G4D" = "0" ]; check $? "G4: 대조 파일 부재에도 exit 0(fail-open)" "rc=$RC_G4D"
! printf '%s' "$OUT_G4D" | grep -q '뒤처져'
check $? "G4: 대조 불가일 때 경보하지 않는다(판정 불가 != 뒤처짐)"

# ⚠️ 오탐 경계 — 자체 탐침에서 **5건이 잘못 경보**했다(2026-08-20). 경보가 한 번 거짓이면
#   사람은 다음부터 안 읽는다 — 이 훅이 막으려는 병이 정확히 그거다.
#   원칙: **판정 불가는 뒤처짐이 아니다.** 애매하면 조용히 넘어간다(오탐 0 우선).
_g4_quiet() { # $1=라벨 $2=설치 $3=마켓
  local h; h="$(mk_g4_home "$2" "$3")"
  local o; o="$(HOME="$h" CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT" bash "$HOOK" 2>&1)"
  ! printf '%s' "$o" | grep -q '뒤처져'
  check $? "G4 오탐금지: $1 ($2 vs $3)" "$(printf '%s' "$o" | grep 뒤처져 | head -1)"
  rm -rf "$h" 2>/dev/null
}
_g4_quiet "자릿수 다름"   0.7        0.7.0
_g4_quiet "자릿수 다름(역)" 0.7.0      0.7
_g4_quiet "unknown"     unknown    0.7.11
_g4_quiet "프리릴리스"     1.0.0-rc1  1.0.0
_g4_quiet "빌드메타"      0.7.10+b   0.7.10

# 반대로 **진짜 뒤처짐은 여전히 잡아야** 한다(오탐 0 을 무탐지로 사지 않는다)
G4E="$(mk_g4_home 0.9.9 1.0.0)"
OUT_G4E="$(HOME="$G4E" CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT" bash "$HOOK" 2>&1)"
printf '%s' "$OUT_G4E" | grep -q '0.9.9→1.0.0'
check $? "G4: 메이저 뒤처짐은 여전히 잡는다(무탐지로 도망가지 않음)" "$(printf '%s' "$OUT_G4E" | tail -1)"
rm -rf "$G4E" 2>/dev/null

rm -rf "$G4A" "$G4B" "$G4C" "$G4D" 2>/dev/null

rm -rf "$FAKE_HOME" "$FAKE_HOME2" "$FAKE_HOME3" "$FAKE_HOME4" "$STUB" "$RO" 2>/dev/null

echo
echo "=== Summary ==="
echo "PASS: $PASS  FAIL: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  printf '  - %s\n' "${FAILED[@]}"
  exit 1
fi
exit 0
