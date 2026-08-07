#!/usr/bin/env bash
# main-write-guard.test.sh — 킬스위치 경로가 stdin 을 배수하는지 검증
#
# 막는 결함(2026-08-07): 이 훅은 forge 레포(~/forge/.claude/hooks/)와 이 플러그인 양쪽에
#   같은 이름으로 존재하고 **한 세션에서 둘 다 등록돼 함께 발화한다**. 그런데 forge 사본에만
#   "킬스위치 종료 전 stdin 배수" 수정(A4)이 들어가고 플러그인 사본에는 오지 않아 두 구현이
#   조용히 갈라져 있었다. 훅의 SSoT 가 서로 다른 레포라(플러그인 훅 = 이 repo, forge-sync 는
#   훅을 밀지 않는다) 자동 전파 경로가 아예 없다 — 사람이 안 옮기면 영원히 갈라진 채다.
#
#   갈라진 결과: FORGE_MAIN_GUARD=off 로 껐을 때 한쪽은 조용히 빠져나가고 다른 쪽은
#   stdin 을 안 읽은 채 종료해 **생산자에게 EPIPE(SIGPIPE)** 를 던진다.
#
# 근거: harness-gaps 2026-08-07-session-perf-hooks-mcp-context.md §G-6(훅 이중 등록) 조사 중 발견.
# 폐기조건: 두 사본이 하나로 합쳐지거나 자동 전파 경로가 생기면 이 테스트는 불필요해진다.
#
# 사용: bash forge-core/hooks/main-write-guard.test.sh

set -u
HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/main-write-guard.sh"
PASS=0; FAIL=0
[ -f "$HOOK" ] || { echo "대상 없음: $HOOK"; exit 1; }

big() { python3 -c "import sys; sys.stdout.write('x'*2000000)"; }

echo "== 1. 킬스위치 ON(off 값) — 생산자가 EPIPE 를 받지 않는다 =="
big | FORGE_MAIN_GUARD=off bash "$HOOK" >/dev/null 2>&1
PRC=${PIPESTATUS[0]}
if [ "$PRC" -eq 0 ]; then
  PASS=$((PASS+1)); echo "  PASS  생산자 rc=0 (stdin 배수됨)"
else
  FAIL=$((FAIL+1)); echo "  FAIL  생산자 rc=$PRC (141/SIGPIPE = 미배수 exit — EPIPE 재발)"
fi

echo
echo "== 2. 킬스위치 경로는 항상 exit 0 이다(차단하지 않는다) =="
echo '{}' | FORGE_MAIN_GUARD=off bash "$HOOK" >/dev/null 2>&1
if [ $? -eq 0 ]; then
  PASS=$((PASS+1)); echo "  PASS  exit 0"
else
  FAIL=$((FAIL+1)); echo "  FAIL  킬스위치를 켰는데 0 이 아니다"
fi

echo
echo "== 3. 빈 입력·비JSON 입력에 죽지 않는다(fail-open) =="
printf '' | bash "$HOOK" >/dev/null 2>&1; r1=$?
printf 'not-json' | bash "$HOOK" >/dev/null 2>&1; r2=$?
if [ "$r1" -eq 0 ] && [ "$r2" -eq 0 ]; then
  PASS=$((PASS+1)); echo "  PASS  둘 다 exit 0 — 파싱 실패로 작업을 막지 않는다"
else
  FAIL=$((FAIL+1)); echo "  FAIL  빈입력 rc=$r1 비JSON rc=$r2"
fi

echo
echo "== 4. 역변조 — 배수를 빼면 검사 1 이 실제로 잡아내는가(판별력 실증) =="
MUT="$(mktemp -d)"; trap 'rm -rf "$MUT"' EXIT
# ⚠️ sed 로 치환하지 않는다 — 치환문에 `/`·`{`·`|` 가 들어 있어 구분자 충돌로 **조용히 실패**하고,
#   깨진 파일이 만들어져 그 파일의 다른 이유(파싱 오류)로 난 실패를 "판별력 실증"으로 오독한다
#   (2026-08-07 이 테스트를 쓰다 실제로 겪었다). python 으로 치환하고 **치환 성공을 단언**한다.
python3 - "$HOOK" "$MUT/mut.sh" <<'PY'
import sys
src, dst = sys.argv[1], sys.argv[2]
s = open(src, encoding='utf-8').read()
old = '[ "${FORGE_MAIN_GUARD:-on}" = "off" ] && { cat >/dev/null 2>&1 || true; exit 0; }'
new = '[ "${FORGE_MAIN_GUARD:-on}" = "off" ] && exit 0'
if old not in s:
    sys.exit(3)               # 변조 지점 부재 → 호출부가 FAIL 로 처리
open(dst, 'w', encoding='utf-8').write(s.replace(old, new, 1))
PY
MUTRC=$?
if [ "$MUTRC" -ne 0 ]; then
  FAIL=$((FAIL+1)); echo "  FAIL  역변조 지점 없음(rc=$MUTRC) — 배수 구문이 기대 형태가 아니다"
elif ! bash -n "$MUT/mut.sh" 2>/dev/null; then
  # 변조본이 문법적으로 깨졌으면 그 실패는 EPIPE 와 무관하다 — 오독 방지.
  FAIL=$((FAIL+1)); echo "  FAIL  변조본이 문법 오류 — 이 상태의 실패는 판별력 근거가 못 된다"
else
  big | FORGE_MAIN_GUARD=off bash "$MUT/mut.sh" >/dev/null 2>&1
  MRC=${PIPESTATUS[0]}
  if [ "$MRC" -ne 0 ]; then
    PASS=$((PASS+1)); echo "  PASS  배수를 빼면 생산자 rc=$MRC — 검사 1 이 공허하지 않다"
  else
    FAIL=$((FAIL+1)); echo "  FAIL  배수를 빼도 rc=0 — 검사 1 은 아무것도 증명하지 못한다"
  fi
fi

echo
echo "================================"
echo "PASS=$PASS  FAIL=$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
