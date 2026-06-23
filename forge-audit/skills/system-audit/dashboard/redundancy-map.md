# Redundancy Map

> 자동 갱신: `/system-audit` 실행 시 Redundancy 6축 결과 반영.

## 스킬 중복 그룹

| 그룹 | 스킬 목록 | 권고 | 위험도 |
|------|---------|------|:-----:|
| cr-* 계열 | cr-plan, cr-code, cr-test, cr-final, cr-bug, cr-analysis | cr-multi stage 파라미터로 통합 | LOW |
| 계획 스킬 | autoplan, concise-planning, writing-plans | 계층 정리 | LOW |
| yt 계열 | yt, yt-analyze | yt --analysis-only 통합 | LOW |

## Orphan 에이전트

| 에이전트 | 정의 위치 | 호출 스킬 | 상태 |
|---------|---------|---------|:----:|
| (system-audit 실행 시 자동 채워짐) | — | — | — |

## Hook Theater

| Hook 파일 | 유형 | 권고 |
|---------|:----:|------|
| (system-audit 실행 시 자동 채워짐) | — | — |

## 규칙 중복

| 파일 쌍 | 주제 | 권고 |
|--------|------|------|
| memory-schema.md + memory-lifecycle.md | 메모리 관리 | 검토 후 통합 가능 |
| plan-*.md (3개) | 계획 관련 | 계층 정리 |
