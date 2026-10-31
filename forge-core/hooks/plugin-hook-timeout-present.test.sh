#!/usr/bin/env bash
# plugin-hook-timeout-present.test.sh — (tests/ 는 공개 배포 관문 plugin-release-gate 가 개발 전용 자산으로 막아 hooks/ 에 둔다)플러그인 전용 배선 시험 `hooks/plugin-hook-timeout.test.sh` 가 실재하고 통과하는지 본다.
#   왜: forge 동기화 스택(forge-plugins #113)이 main-write-guard 의 `hook_entry` 전환 뒤 그 시험을 지웠다(forge#4135 · qa H1).
#   지워지면 등록 timeout < 판정 상한 회귀(forge-plugins #110 HIGH)를 잡을 시험이 없어진다 — 이 시험은 그 삭제를 FAIL 로 낸다.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
T="$HERE/plugin-hook-timeout.test.sh"
if [ ! -f "$T" ]; then
  echo "  FAIL  plugin-hook-timeout 시험 실재·통과 — $T 없음(지워졌다)"; exit 1
fi
if out=$(bash "$T" 2>&1); then
  echo "  PASS  plugin-hook-timeout 시험 실재·통과"; exit 0
fi
printf '%s\n' "$out" | tail -3
echo "  FAIL  plugin-hook-timeout 시험 실재·통과 — 시험이 FAIL"; exit 1
