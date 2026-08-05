#!/usr/bin/env bash
# ── 플러그인 포팅 노트 ─────────────────────────────────────────────────────
# 이 파일은 forge SSoT(.claude/hooks/)에서 forge-core 플러그인으로 **수동 포팅**된 사본이다.
# 플러그인 훅의 SSoT 는 forge-plugins repo 자체다(scripts/sync-from-forge.py 헤더 참조 —
# SUBDIRS 에 hooks 가 없어 forge 에서 자동 전파되지 않는다). forge 원본 수정 시 여기도 갱신할 것.
# 플러그인 환경(=~/forge 체크아웃 없음)에서는 참조 대상 부재로 조용히 exit 0 한다(fail-open).
# brain-placement-guard.sh — PreToolUse(Write|Edit) 배치 가드 (A3-1, WARN-first).
#
# 회사 두뇌 계획서 §3.4: 카논성 파일을 **레지스트리 미등재 위치**에 쓰면 WARN 1줄.
# 차단하지 않는다(항상 exit 0) — 신규 hard-BLOCK 훅 무단 추가 금지(AD-168).
#
# 훅은 **정규식 검사만** 한다(§3.4 "매 Edit/Write 훅에서 LLM을 부르지 않는다").
# 분류·목적지 제안이 필요하면 사람이 brain-route.sh 를 부른다.
#
# kill-switch: FORGE_BRAIN_GUARD=off
# SSoT: ~/forge/.claude/hooks/ → forge-sync HOOKS_ALLOWLIST 등재 + settings.json 등록까지가 "생성"이다.
set -uo pipefail

[ "${FORGE_BRAIN_GUARD:-on}" = "off" ] && exit 0

FORGE_ROOT="${FORGE_ROOT:-$HOME/forge}"
REG="${FORGE_BRAIN_REGISTRY:-$FORGE_ROOT/.claude/brain/registry}"

FILE_PATH=$(python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('file_path', ''))
except Exception:
    print('')
" 2>/dev/null)

[ -n "$FILE_PATH" ] || exit 0
[ -d "$REG" ] || exit 0   # 레지스트리 미구축 환경 = 무동작(fail-open)

# --- 카논성 판정 (경로 정규식만) -------------------------------------------
# 카논 = 세션 행동을 규정하는 문서. 실측 카스케이드 경로 기준.
case "$FILE_PATH" in
  *.md) : ;;
  *) exit 0 ;;
esac

CANON=0
case "$FILE_PATH" in
  */.claude/rules/*.md|*/.claude/rules-on-demand/*.md) CANON=1 ;;
  */CLAUDE.md) CANON=1 ;;
esac
[ "$CANON" -eq 1 ] || exit 0

# --- 레지스트리 등재 여부 (path 필드 = HOME 상대경로) -----------------------
REL="${FILE_PATH#"$HOME"/}"
BASE="$(basename "$FILE_PATH")"

# 1) 정확한 path 일치
if grep -rqsF "\"$REL\"" "$REG" 2>/dev/null; then
  exit 0
fi
# 2) 미러(~/.claude)↔SSoT(~/forge/.claude) 대응 — 레지스트리는 SSoT 경로를 기록한다
MIRROR_ALT="${REL#.claude/}"
if [ "$MIRROR_ALT" != "$REL" ] && grep -rqsF "\"forge/.claude/$MIRROR_ALT\"" "$REG" 2>/dev/null; then
  exit 0
fi
FORGE_ALT="${REL#forge/.claude/}"
if [ "$FORGE_ALT" != "$REL" ] && grep -rqsF "\".claude/$FORGE_ALT\"" "$REG" 2>/dev/null; then
  exit 0
fi
# 3) 워크트리 경로는 HOME 상대경로가 달라진다 → basename 등재 여부로 2차 확인
if grep -rqsF "/$BASE\"" "$REG" 2>/dev/null; then
  exit 0
fi

echo "⚠️ [brain] 카논성 파일이 레지스트리 미등재 위치입니다: $REL"
echo "   ↳ 목적지 확인: bash $FORGE_ROOT/shared/scripts/brain-route.sh --file $FILE_PATH"
echo "   ↳ 등재: python3 $FORGE_ROOT/shared/scripts/brain-registry-gen.py --out $FORGE_ROOT"
echo "   (WARN only — 쓰기는 계속됩니다. 끄기: FORGE_BRAIN_GUARD=off)"
exit 0
