#!/usr/bin/env bash
# leak-scan-wiring.test.sh — scripts/ 의 *.test.py 가 모두 CI(.github/workflows/leak-scan.yml)에서 도는지 본다.
#   왜: forge#4135 할 일 2 가 새 시험 sync-from-forge-prune.test.py 를 더하고 CI 'Guard self-test' 에 안 걸어
#   CI 가 그 시험을 한 번도 안 돌렸다(forge-plugins #120 qa H1). 새 시험을 더하면 이 시험이 배선 누락을 FAIL 로 낸다.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
Y="$ROOT/.github/workflows/leak-scan.yml"
F=0
for t in "$ROOT"/scripts/*.test.py; do
  n="scripts/$(basename "$t")"
  if grep -qF "python3 $n" "$Y"; then :; else echo "  FAIL  CI 미배선: $n"; F=1; fi
done
if [ "$F" = 0 ]; then echo "  PASS  scripts 시험 전부 CI 배선"; exit 0; fi
echo "  FAIL  scripts 시험 전부 CI 배선"; exit 1
