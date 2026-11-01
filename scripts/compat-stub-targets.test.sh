#!/usr/bin/env bash
# compat-stub-targets.test.sh — 옛 이름 호환 입구가 가리키는 새 이름 스킬이 같은 플러그인에 실려 있다 (forge#4135)
# 왜: forge 가 스킬 이름을 바꾸면 옛 폴더는 "옛 이름 — /<새 이름> 를 쓴다" 입구만 남는다. 동기화는 있는 파일만 덮어쓰고
#   새 파일은 더하지 않아서, 입구만 받고 새 스킬은 빠진 플러그인이 나갈 수 있다 — 팀 PC 에서 스킬이 사라진 것처럼 보인다.
# 사용: bash scripts/compat-stub-targets.test.sh [플러그인 레포 경로 — 기본 이 레포]
# 재현: bash scripts/compat-stub-targets.test.sh
set -u
ROOT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
N=0; BAD=0
while IFS= read -r f; do
  target="$(sed -n 's#^description: "옛 이름 — /\([a-z0-9-]*\) 를 쓴다.*#\1#p' "$f" | head -1)"
  [ -n "$target" ] || continue
  N=$((N+1))
  dir="$(dirname "$(dirname "$f")")/$target"
  if [ -f "$dir/SKILL.md" ]; then echo "PASS 입구 $(basename "$(dirname "$f")") → $target 실림"
  else BAD=$((BAD+1)); echo "FAIL 입구 $(basename "$(dirname "$f")") → $target 없음($dir)"; fi
done < <(find "$ROOT" -path '*/skills/*/SKILL.md' -not -path '*/.git/*' -not -path '*/.claude/worktrees/*')
echo "입구 $N개 · 끊긴 입구 $BAD개"
[ "$N" -gt 0 ] || { echo "FAIL 입구 0개 — 재는 대상이 없다"; exit 1; }
[ "$BAD" = 0 ]
