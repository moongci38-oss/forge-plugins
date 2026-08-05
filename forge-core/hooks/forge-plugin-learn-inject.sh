#!/usr/bin/env bash
# forge-plugin-learn-inject.sh — SessionStart hook (FR-005)
#
# 로컬 학습 메모(~/.claude/forge-plugin/learnings.jsonl)에서 현재 프로젝트에 관련된
# 최근 레코드 몇 건을 골라 **플러그인 지침보다 뒤에, 종속 블록으로** 1회 주입한다.
#
# 지키는 것 (SPEC FR-005):
#   - 주입 텍스트는 Untrusted 데이터 — <untrusted_external_data> 래핑 + instruction
#     demotion + 인젝션 시그널 레코드 제외 + 마크업 중립화 + 길이 상한(라이브러리 담당).
#   - evidence 필드는 주입하지 않는다(인젝션 표면·컨텍스트 비용 최대 필드).
#   - fail-open: 어떤 실패도 세션을 막지 않는다. 빈 store면 아무것도 출력하지 않는다.
#   - AD-168: 이 훅은 절대 non-zero exit 하지 않는다(하드 BLOCK 신설 금지).
#
# opt-out: FORGE_PLUGIN_LEARN=off

set -u

# 어떤 경로로 실패하든 세션을 막지 않는다.
trap 'exit 0' ERR

[ "${FORGE_PLUGIN_LEARN:-}" = "off" ] && exit 0

LIB="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}/hooks/lib/plugin_learn.py"
[ -f "$LIB" ] || exit 0

command -v python3 >/dev/null 2>&1 || exit 0

# 출력이 있으면 그대로 컨텍스트로 흘러간다(SessionStart 훅 규약).
python3 "$LIB" inject 2>/dev/null || true

exit 0
