---
description: "Forge Dev P6 QA phase — qa 스킬 래핑 커맨드 (Check 5.8에서 승격된 독립 phase)"
argument-hint: "[--mode full|smoke] [--app <id|all>] [--domains <id[,id...]|all>] [--accounts <id[,id...]>] [--exhaustive]"
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

### 확장 4축 — app/domains/accounts/exhaustive (2026-07-06, 전부 optional·회귀 0)

프로젝트 지정 불요 — 해당 워크스페이스/레포 CWD에서 실행. 멀티레포는 `--app`으로 앱 선택(생략 시 CWD 레포 자동감지), 단일레포는 `--app` 불요.

```
# starbeginz — 운영툴만, 전 도메인 × 2계정 병렬 + 요소전수 + 실DB + 자동수정
/forge-qa --app=opstool --domains=all --accounts=admin,partner --exhaustive

# starbeginz — 포탈+운영툴 둘 다 병렬
/forge-qa --app=all --domains=all --accounts=admin,partner --exhaustive

# starbeginz — 운영툴의 특정 도메인만 (정산+매출)
/forge-qa --app=opstool --domains=settlement-management,sales-management --accounts=partner

# portfolio — 단일 앱이라 --app 생략, 전 도메인 × 2역할 병렬
/forge-qa --domains=all --accounts=admin,editor --exhaustive
```

- `--app`(앱) → `--domains`(도메인) → `--accounts`(계정) → `--exhaustive`(요소): 각 축을 `all`↔부분↔단일 자유 조합. 4개 전부 미지정 시 위 §실행의 기존 동작 그대로(회귀 0).
- `--app`/`--domains`은 apps×domains 조합마다 **독립 브랜치·PR**로 병렬 fan-out. `--accounts`는 각 도메인 안에서 T1/T2를 계정별로 추가 실행하는 발견 배율 축(별도 PR을 만들지 않음).
- `--app`/`--domains` 매칭 0건 시 조용히 GREEN 종료하지 않고 GUIDE-STOP("매칭 없음. 사용 가능: [목록]") 후 정지한다.
- 실DB 검증·healer 자동수정은 이 4축과 무관하게 항상 내장 — 별도 플래그 불요.
- **`--project` 플래그 없음** — 프로젝트 식별은 CWD → forge-workspace.json 매핑(기존 qa 동작) 그대로.
- qa-config 스키마(app 레지스트리·domains·accounts) → `~/forge/.claude/skills/qa/reference.md §qa-config 스키마`.

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
