#!/usr/bin/env bash
# skill_gate.sh <skill-name> — skill-creator 완료 게이트 (결정론).
#   ① quick_validate.py        (frontmatter·구조)  FAIL → rc 1
#   ② skill-lint.py --strict   (Pocock 4축)        CRITICAL/HIGH → rc 1
# 대상 루트 = 지금 있는 git 레포(워크트리 포함) — SKILL_GATE_ROOT 로 덮어쓸 수 있다.
# skill-lint 는 대상 레포 사본을 먼저, 없으면 FORGE_ROOT 사본을 쓰되 항상 --root 로 대상 레포를 잰다.
# rc: 0 통과 · 1 FAIL · 2 사용법 오류/스킬·도구 없음
# 한계: 제품 레포가 같은 상대경로에 자기 skill-lint.py 를 두면 그것이 먼저 잡힌다 — 첫 줄 `대상 루트:` 를 확인하라.
set -u
NAME="${1:-}"
[ -n "$NAME" ] || { echo "사용법: skill_gate.sh <skill-name>" >&2; exit 2; }
ROOT="${SKILL_GATE_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -n "$ROOT" ] || { echo "대상 루트: (없음) — git 레포 안에서 실행하거나 SKILL_GATE_ROOT 를 준다" >&2; exit 2; }
FORGE="${FORGE_ROOT:-$HOME/forge}"
SKILL_DIR="$ROOT/.claude/skills/$NAME"
[ -f "$SKILL_DIR/SKILL.md" ] || { echo "스킬 없음: $SKILL_DIR/SKILL.md" >&2; exit 2; }
HERE="$(cd "$(dirname "$0")" && pwd)"
QV="$HERE/quick_validate.py"
LINT="$ROOT/shared/scripts/skill-lint.py"
[ -f "$LINT" ] || LINT="$FORGE/shared/scripts/skill-lint.py"
[ -f "$LINT" ] || { echo "skill-lint.py 없음 (대상 레포·FORGE_ROOT 둘 다)" >&2; exit 2; }
echo "대상 루트: $ROOT"
rc=0
echo "── ① quick_validate"
python3 "$QV" "$SKILL_DIR" || rc=1
echo "── ② skill-lint --strict"
python3 "$LINT" --root "$ROOT" --skill "$NAME" --strict || rc=1
if [ "$rc" -eq 0 ]; then
  echo "GATE PASS: $NAME"
else
  echo "GATE FAIL: $NAME — FAIL·CRITICAL·HIGH 를 고치고 다시 돌린다"
fi
exit "$rc"
