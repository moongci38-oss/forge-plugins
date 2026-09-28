#!/usr/bin/env bash
# ── 플러그인 포팅 노트 ─────────────────────────────────────────────────────
# 이 파일은 forge SSoT(.claude/hooks/)에서 forge-core 플러그인으로 **수동 포팅**된 사본이다.
# 플러그인 훅의 SSoT 는 forge-plugins repo 자체다(scripts/sync-from-forge.py 헤더 참조 —
# SUBDIRS 에 hooks 가 없어 forge 에서 자동 전파되지 않는다). forge 원본 수정 시 여기도 갱신할 것.
# 플러그인 환경(=~/forge 체크아웃 없음)에서는 참조 대상 부재로 조용히 exit 0 한다(fail-open).
# session-placement-advisory.sh — 세션 배치 advisory (Forge OS v2 P2-3 / 정책 K4, §2.4)
#
# 발화 조건: 세션 cwd의 git toplevel이 forge SSoT 공유 체크아웃일 때 1줄 WARN.
#   §2.4: 세션은 편집하는 평면에 앉는다. 그러나 forge 공유 체크아웃에 직접 앉으면
#   ①병렬 세션과 인덱스·브랜치 충돌 ②워크트리 격리 부재 ③훅이 forge에 기록(A1.3 오염)
#   → forge 자산 편집은 워크트리(`.claude/worktrees/<name>`)에서 하라는 권고.
#   워크트리 세션·타 repo·비 repo cwd는 침묵.
#
# 배선: SessionStart 훅. WARN-only(BLOCK 아님), stdout 1줄 이내, 항상 exit 0.
# kill-switch: FORGE_PLACEMENT_ADVISORY=off

set -uo pipefail

[[ "${FORGE_PLACEMENT_ADVISORY:-on}" == "off" ]] && exit 0

FORGE_ROOT="${FORGE_ROOT:-$HOME/forge}"

# git 밖이면 침묵
top="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
[[ -n "$top" ]] || exit 0

# 워크트리 판정: 링크된 워크트리는 git-dir(.../worktrees/<name>)이 git-common-dir과 다르다
gitdir="$(git rev-parse --absolute-git-dir 2>/dev/null || echo '')"
commondir="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null || echo '')"
if [[ -n "$gitdir" && -n "$commondir" && "$gitdir" != "$commondir" ]]; then
  exit 0   # 워크트리 세션 = 정상 배치
fi

# 경로 정규화 후 forge SSoT 공유 체크아웃인지 대조
top_r="$(cd "$top" 2>/dev/null && pwd -P)" || exit 0
forge_r="$(cd "$FORGE_ROOT" 2>/dev/null && pwd -P)" || exit 0

if [[ "$top_r" == "$forge_r" ]]; then
  echo "WARN[K4] forge 공유 체크아웃 직접 세션($top_r) — 자산 편집은 EnterWorktree(.claude/worktrees/) 권고. cascade는 세션 중 재로딩되지 않습니다."
fi

exit 0
