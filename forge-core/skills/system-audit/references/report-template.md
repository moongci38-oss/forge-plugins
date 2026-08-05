> 출처: system-audit/SKILL.md — 2026-07-30 harness-diet structure_split, 무손실 보존.

## Wave 3: 통합 보고서 작성

**저장 위치:** `docs/reviews/audit/{date}-system-audit[-{target}].md`
(`target`이 `system`이면 suffix 생략)

**보고서 형식:**

```markdown
# ACHCE 5축 통합 시스템 감사 보고서

**대상**: {target} | **날짜**: {date}

## Executive Summary

**전체 ACHCE 점수: {전체점수}/100**

| 축 | 점수 | 등급 | 핵심 발견 |
|----|:----:|:----:|---------|
| Agentic | {A}/100 | ⭐~⭐⭐⭐⭐⭐ | |
| Context | {C}/100 | | |
| Harness | {H}/100 | | |
| Cost | {Co}/100 | | |
| Human-AI | {E}/100 | | |

> 등급 기준: 90+ ⭐⭐⭐⭐⭐ / 75+ ⭐⭐⭐⭐ / 60+ ⭐⭐⭐ / 45+ ⭐⭐ / <45 ⭐

## 1. 축별 감사 결과 요약

### 1.1 Agentic (자율성·도구·멀티에이전트)
{axis-agentic summary + top 2 issues}

### 1.2 Context (컨텍스트 엔지니어링)
{axis-context summary + top 2 issues}

### 1.3 Harness (측정·제어·보안)
{axis-harness summary + top 2 issues}

### 1.4 Cost (비용 효율)
{axis-cost summary + top 2 issues}

### 1.5 Human-AI (경계 설계)
{axis-human-ai summary + top 2 issues}

### 1.6 Redundancy (중복/drift 감지) ← 신규
| 유형 | 항목 | 권고 | 위험도 |
|------|------|-----|:-----:|
| 스킬 중복 | {names} | merge | LOW |
| orphan agent | {names} | archive | MED |
| deprecated | {names} | archive | LOW |
| hook theater | {files} | fix | MED |
| rule overlap | {files} | merge | LOW |

요약: 중복 {N}건 / orphan {N}건 / deprecated {N}건 / theater {N}건

## 2. 축간 트레이드오프 분석

| 트레이드오프 | 현재 균형 | 권장 방향 |
|------------|:--------:|---------|
| Cost vs Harness | | |
| Agentic vs Human-AI | | |
| Context vs Cost | | |

## 3. 정량 지표 대시보드

| 축 | 지표 | 측정값 | 기준값 | 측정 유형 | 판정 |
|----|------|:-----:|:-----:|:--------:|:---:|
| Agentic | 도구 커버리지율 | | > 60% | 실측 | |
| Context | 세션 시작 토큰 | | < 12,000 | 추정 | |
| Context | MEMORY 항목 수 | | < 30 | 실측 | |
| Context | 규칙 중복률 | | < 10% | 추정 | |
| Harness | Hook 커버리지 | | > 70% | 실측 | |
| Harness | OWASP 커버리지 | | > 50% | 실측 | |
| Cost | 모델 계층화율 | | > 60% | 실측 | |
| Cost | 조건부 로딩률 | | > 50% | 실측 | |
| Human-AI | 게이트 커버리지 | | 100% | 실측 | |

## 4. 트렌드 비교 (이전 감사 대비)

| 축 | 이전 | 현재 | Δ | 방향 |
|----|:----:|:----:|:--:|:---:|

> 이전 감사 없으면 "첫 감사 — 베이스라인 설정" 표기

**이슈 해소율**: N/A (또는 이전 이슈 대비 해결률)

## 5. 통합 이슈 목록

### CRITICAL (즉시 대응)
### HIGH (이번 주)
### MEDIUM (이번 달)
### LOW (모니터링)

## 6. 강점 요약

## 7. 통합 개선 로드맵

### P0 — 즉시 (이번 주)
### P1 — 단기 (이번 달)
### P2 — 중기 (다음 분기)

## 6. 재감사 권장 시점

- CRITICAL 이슈 해결 후 즉시
- 정기 감사: 분기 1회 권장

## 참조
- $FORGE_OUTPUTS/docs/tech/2026-03-16-5-axis-ai-analysis-framework.md
```
