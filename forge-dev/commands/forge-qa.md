---
description: "Forge Dev P6 QA phase — qa 스킬 래핑 커맨드 (Check 5.8에서 승격된 독립 phase)"
argument-hint: "[--mode full|smoke] [--target <path>]"
group: implement
---

> **⚠️ 실행 모드 확인**: 이 커맨드는 쓰기 모드에서만 정상 동작합니다. Plan mode 감지 시 즉시 [STOP] — "Escape로 plan mode 해제 후 재실행하세요. 내부 [STOP] 게이트가 승인 지점입니다."

# /forge-qa — Forge Dev QA Phase

옛 pipeline Check 5.8에서 승격된 독립 P6 QA phase입니다.
내부적으로 `qa` **스킬**을 호출합니다 (qa 스킬 자체는 무변경).


## Phase 0 — Readiness 판정 (P5 구현 완료 확인)

→ 공통 헬퍼: `/readiness-gate` 참조 (forge-qa 진입 계약 4요소)

| 요소 | ok 조건 |
|------|---------|
| 구현 코드 | P5 구현 결과물(소스코드) 존재 |
| 시나리오 정의 | QA 시나리오 기술 가능 (스펙·FR 기반) |
| 서버 기동 | 앱 실행 가능 (서버 기동 가능 상태) |
| QA 스코프 | 테스트 대상 기능·범위 특정 가능 |

라우팅:
- 전부 ok → **PASS** (qa 스킬 호출 진행)
- 구현코드·서버기동 absent → **GUIDE-STOP** (`forge-qa-readiness-{date}.md` 출력 후 정지)

P5(`forge-implement`) 미완료 상태 진입 → GUIDE-STOP: "P5 구현 완료 후 재호출"

## 실행

```
/forge-qa              # 기본 full 모드
/forge-qa --mode smoke # 연기 테스트만 (빠른 검증)
```

## 전역 캡 (반드시 보존)

qa 스킬 캡을 그대로 적용합니다 — 변경 금지:

| 캡 종류 | 한도 | 동작 |
|---------|------|------|
| **사이클 캡** | 6 사이클 | 초과 시 즉시 STOP + Human 에스컬레이션 |
| **same-issue 캡** | 3회 동일 이슈 반복 | 3회 시 즉시 STOP (무한 루프 방지) |
| **회귀 감지** | 즉시 STOP | 수정이 기존 통과 케이스를 깨뜨리면 즉시 STOP |

## 내부 흐름

1. `qa` 스킬 호출 (전역 캡 그대로 전달)
2. E2E 검증 실행
3. 결과 집계 → PASS/FAIL 판정
4. FAIL 시: healer 에이전트 연계 또는 [STOP] Human 에스컬레이션
5. PASS 시: `/forge-pr` 진입 허용

## 위치

이 커맨드는 Forge Dev 파이프라인 P6 QA phase입니다:

```
P5 구현 → /forge-qa (P6) → /forge-pr (P7)
```

직접 qa 스킬 호출이 필요하면: `/qa` (스킬 직접 호출, 파이프라인 외부)
