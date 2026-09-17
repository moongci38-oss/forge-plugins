#!/usr/bin/env bash
# ── 플러그인 포팅 노트 ─────────────────────────────────────────────────────
# 이 파일은 forge SSoT(.claude/hooks/)에서 forge-core 플러그인으로 **수동 포팅**된 사본이다.
# 플러그인 훅의 SSoT 는 forge-plugins repo 자체다(scripts/sync-from-forge.py 헤더 참조 —
# SUBDIRS 에 hooks 가 없어 forge 에서 자동 전파되지 않는다). forge 원본 수정 시 여기도 갱신할 것.
# 플러그인 환경(=~/forge 체크아웃 없음)에서는 참조 대상 부재로 조용히 exit 0 한다(fail-open).
# brain-integrity-check.sh — SessionStart 레지스트리 드리프트 1줄 보고 (A3-1).
#
# 회사 두뇌 계획서 §3.3 ④⑤: 파생물·레지스트리와 실파일의 불일치를 **탐지**한다
# (원자성을 보장하는 게 아니라 비원자적 실패를 항상 탐지 가능하게 만드는 설계).
#
# 드리프트 3종:
#   MISSING  등재됐는데 실파일 없음 (경로 이동·삭제)
#   ORPHAN   카논 파일인데 레지스트리 미등재
#   PAIRLESS 사람 파일(<slug>.json)에 짝 기계 파일(<slug>.state.json) 결손
#
# advisory·fail-open — 항상 exit 0. 드리프트 0이면 침묵(success-is-silent).
# kill-switch: FORGE_BRAIN_GUARD=off
set -uo pipefail

[ "${FORGE_BRAIN_GUARD:-on}" = "off" ] && exit 0

FORGE_ROOT="${FORGE_ROOT:-$HOME/forge}"
REG="${FORGE_BRAIN_REGISTRY:-$FORGE_ROOT/.claude/brain/registry}"
[ -d "$REG" ] || exit 0

REPORT=$(timeout 8 python3 - "$REG" <<'PYEOF' 2>/dev/null
import json, os, sys
from pathlib import Path

HOME = Path(os.environ.get("HOME") or os.path.expanduser("~"))
FORGE_ROOT = Path(os.environ.get("FORGE_ROOT", str(HOME / "forge")))
reg = Path(sys.argv[1])

entries, missing, pairless = 0, 0, 0
registered = set()
for human in reg.rglob("*.json"):
    if human.name.endswith(".state.json"):
        continue
    entries += 1
    if not human.with_name(human.stem + ".state.json").is_file():
        pairless += 1
    try:
        p = json.loads(human.read_text(encoding="utf-8")).get("path", "")
    except Exception:
        continue
    if not p:
        continue
    registered.add(Path(p).name)
    if not (HOME / p).is_file():
        missing += 1

orphan = 0
for d in (HOME / ".claude" / "rules", HOME / ".claude" / "rules-on-demand",
          FORGE_ROOT / ".claude" / "rules", FORGE_ROOT / ".claude" / "rules-on-demand"):
    if not d.is_dir():
        continue
    for f in d.glob("*.md"):
        if f.name not in registered:
            orphan += 1
            registered.add(f.name)   # 미러/SSoT 중복 계수 방지

print(f"{entries} {missing} {orphan} {pairless}")
PYEOF
)

[ -n "$REPORT" ] || exit 0   # 스캔 실패·타임아웃 = 침묵 진행(fail-open)

set -- $REPORT
ENTRIES="${1:-0}"; MISSING="${2:-0}"; ORPHAN="${3:-0}"; PAIRLESS="${4:-0}"
DRIFT=$((MISSING + ORPHAN + PAIRLESS))

[ "$DRIFT" -eq 0 ] && exit 0

echo "🧠 brain 레지스트리 드리프트 ${DRIFT}건 (엔트리 ${ENTRIES}) — 실파일 없음 ${MISSING} · 미등재 ${ORPHAN} · 짝 결손 ${PAIRLESS} → 재생성: python3 $FORGE_ROOT/shared/scripts/brain-registry-gen.py --out $FORGE_ROOT"
exit 0
