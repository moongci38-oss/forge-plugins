# qa-setup — Reference (상세 기준·표·예시)

> SKILL.md 본문에서 분리된 참고자료. 필요 시에만 Read.

## §시나리오 출처 격리 (AD-93 §A8 — CRITICAL) 상세

**출처 우선순위 (amendments §A8)**:

| 우선순위 | 출처 | 처리 |
|---------|------|------|
| 1 | Spec FR 명세 (`docs/planning/active/*.md` / `.specify/specs/*.md` / `02-product/`) | 직접 사용, `source: {file}#L{N}` 명시 |
| 2 | legacy 동작 (`git log -p` + 기존 테스트) | `source: legacy-test:{path}#L{N}` 명시 |
| 3 | Human 입력 | [STOP] "기대값 입력 요청" |
| 4 | 코드 read 후 추론 | **금지 — AD-93 §A8, tautology** |

**금지 패턴**: 소스 파일 Read 후 시나리오 작성 = 동어반복. 코드 구현이 버그여도 테스트가 PASS됨.

**예외**: scenarios.md 각 행에 `source:` 필드 명시 시 허용.

#### 기대값 출처 명시 (AD-92-2 — CRITICAL)

| 우선순위 | 출처 | 처리 |
|---------|------|------|
| 1 | Spec FR 명세 | 직접 사용 |
| 2 | Human 입력 | [STOP] "기대값 입력 요청" |
| 3 | 레거시 응답 (마이그레이션 모드) | P1 deferred |
| 4 | 추론 | **금지** |

#### scenarios.md 형식 (AD-93 W2 — source 필드 필수)

```markdown
# QA Scenarios — {프로젝트명}

## FR-001: {기능명}
| # | Method | Path | Auth | Body | Expected Status | Expected Body | source |
|---|--------|------|------|------|-----------------|---------------|--------|
| 1 | POST | /api/auth/login | no | {"email":"..."} | 200 | {token:...} | docs/planning/active/auth-spec.md#L45 |
| 2 | POST | /api/auth/login | no | {"email":"wrong"} | 401 | {error:...} | legacy-test:tests/auth.test.ts#L120 |
```

## §Coverage Map 검증 (A6) 상세 — 알고리즘·스키마·표

### Coverage Map — entity×action×screen×viewport full-cartesian

```python
# coverage_map.py (개념 코드)
entities   = [e for e in spec_entities]        # Spec FR에서 추출
actions    = ["create", "read", "update", "delete"]
screens    = [s for s in uiux_screens]         # oracle-manifest.json uiux.screens
viewports  = ["pc", "mobile"]

matrix = {}
for entity in entities:
    for action in actions:
        for screen in screens:
            for viewport in viewports:
                key = f"{entity}×{action}×{screen}×{viewport}"
                matrix[key] = {
                    "covered": False,  # scenarios.md에 해당 셀 시나리오 있으면 True
                    "scenario_ids": []
                }

# scenarios.md 파싱 후 matrix 업데이트
# 누락 셀 집계
missing_cells = [k for k,v in matrix.items() if not v["covered"]]
if missing_cells:
    print(f"[EXIT 2] Coverage Map 누락 셀 {len(missing_cells)}건:")
    for cell in missing_cells:
        print(f"  - {cell}")
    exit(2)
```

**출력**: `docs/qa/coverage-map.json` (matrix 전체) + `docs/qa/coverage-gaps.md` (누락 셀 목록)

### flow-chain schema 검증

scenarios.md 내 다단계 플로우(A→B→C) 시나리오는 `flow_chain:` 필드 필수:

```markdown
| # | Method | Path | Auth | Body | Expected Status | Expected Body | source | flow_chain | state_after |
|---|--------|------|------|------|-----------------|---------------|--------|------------|-------------|
| 5 | POST | /api/order | yes | {...} | 201 | {id:...} | spec#L45 | order-flow:step1 | order.status=PENDING |
| 6 | PUT  | /api/order/{id}/pay | yes | {...} | 200 | {...} | spec#L60 | order-flow:step2 | order.status=PAID |
| 7 | GET  | /api/order/{id} | yes | — | 200 | {status:PAID} | spec#L70 | order-flow:step3-verify | — |
```

`flow_chain:` 필드 없는 다단계 시나리오(≥2단계) 발견 시 → WARN (exit 1)

### round-trip oracle 검증

쓰기 시나리오(POST/PUT/DELETE) 각각에 대해 후속 검증 행 필수:

```markdown
| 3 | POST | /api/user | yes | {name:...} | 201 | {id:42} | spec#L30 | — | — |
| 4 | GET  | /api/user/42 | yes | — | 200 | {name:...} | spec#L30 | round-trip:row3 | — |  ← 필수
```

`round-trip:row{N}` 태그 없는 쓰기 시나리오 → WARN (exit 1)

### entity CRUD 완결성 체크

```bash
# Spec FR에서 entity 추출 후 CRUD 누락 검사
check_entity_crud() {
  local entity="$1"
  local missing=""
  grep -i "create.*${entity}\|${entity}.*create\|POST.*${entity}" docs/qa/scenarios.md >/dev/null || missing="${missing} C"
  grep -i "read.*${entity}\|${entity}.*read\|GET.*${entity}" docs/qa/scenarios.md >/dev/null || missing="${missing} R"
  grep -i "update.*${entity}\|${entity}.*update\|PUT.*${entity}\|PATCH.*${entity}" docs/qa/scenarios.md >/dev/null || missing="${missing} U"
  grep -i "delete.*${entity}\|${entity}.*delete\|DELETE.*${entity}" docs/qa/scenarios.md >/dev/null || missing="${missing} D"
  if [ -n "$missing" ]; then
    echo "[EXIT 2] entity '${entity}' CRUD 누락: ${missing}"
    return 2
  fi
}
```

게임/Non-CRUD 프로젝트 도메인 N/A carve-out(비-CRUD 프로젝트 — CRUD 축 부재 시에만): `qa-config.json`에 `"crud_check": false` 명시 시.
// 이는 full-cartesian waiver가 아님 — CRUD 엔티티가 존재하는 프로젝트는 예외 없이 entity×action 전수 강제.

### responsive 전수 생성

UI 시나리오(화면 조작 포함)는 PC + Mobile 두 viewport 모두 있어야:

```bash
# UI 시나리오 행에서 viewport 열 확인
UI_SCENARIOS=$(grep -c "pc\|mobile\|viewport" docs/qa/scenarios.md || echo 0)
TOTAL_UI=$(grep -c "browser\|screen\|page\|화면" docs/qa/scenarios.md || echo 0)
# PC+Mobile 2배가 안 되면 누락
if [ "$UI_SCENARIOS" -lt "$((TOTAL_UI * 2 / 3))" ]; then
  echo "[EXIT 2] UI 시나리오 responsive 미완성 — PC/Mobile 양쪽 viewport 추가 필요 (full-cartesian 전수 필수)"
  exit 2
fi
```

### 값축(value-axis) 검증

입력 필드별 eq-class×boundary:

| 필드 유형 | 필수 케이스 |
|---------|-----------|
| 문자열(유한 유효값) | 각 eq-class 대표 1건 + 경계 |
| 숫자(범위) | min, max, min-1, max+1, 중간값 |
| 필수 필드 누락 | 빈 값 / null |
| unbounded 문자열 | eq-class(정상, 너무 짧, 너무 김) 대표 |

pairwise 축소 금지 — 각 eq-class+boundary 전수. scenarios.md에 `value_class:` 열 명시 권장.

## §E2E 러너 폴백 상세 (P1-⑤, 2026-07-07 로컬 QA 갭 — B1)

**배경**: `scripts/run-e2e-local.sh` / `test-e2e-full.sh`는 `${HOME}/.claude/trine/scripts/e2e-runner.sh`에 위임한다. 이 러너가 파일시스템에 실재하지 않으면 로컬 스택 부트스트랩이 조용히 실패한다(2026-07-07 실측). qa-setup은 러너 실재를 먼저 확인하고, 부재 시 **WARN + 인라인 부트스트랩 폴백**으로 계속 진행한다(하드스톱 금지, fail-open).

**인라인 폴백 절차** (`E2E_RUNNER_FALLBACK=1`일 때 qa-setup이 대신 수행 — 신규 러너 스크립트 작성 없이 기존 step 재사용):
1. API 서버 기동 — step 5 `start_server` 로직 재사용 (role=backend/server)
2. 헬스 대기 — step 5 폴링 루프(최대 30회 × 2초) 그대로 사용
3. seed 주입 — step 8 로직 재사용, **auth/account seed 선행**(admin 의존 seed는 그 다음). `assert-db-isolation.sh` 게이트 그대로 적용
4. web(frontend) 서버 기동 — step 5 `start_server` 재사용 (role=frontend/web)
5. 스모크 확인 — `curl` 레벨로 BASE_URL 홈/로그인 페이지 200 확인 (Playwright 풀 E2E 아님, 최소 생존 확인)


## §web 안정성 권고 (M4)

Playwright 부하 중 `next dev`가 반복 사망하면 워크플로가 실패한다(실측 2회). (a) web을 `next build && next start`(prod 모드)로 기동하면 개발 서버보다 안정적, (b) 서버 라이프사이클을 세션 독립(nohup/pm2 + healthcheck)으로 두면 장시간 Phase A~H 워크플로가 세션 종료에도 생존, (c) 워크플로 중단 시 `resumeFromRunId`로 재개. 권고이며 프로젝트 여건에 맞게 선택 — 강제 아님.


## §portConflictPolicy 상세

(qa-config.json 최상위, 선택 필드, 기본 `isolate`): 대상 포트를 QA가 띄우지 않은 프로세스가 이미 점유 중일 때의 정책.
- `isolate` (기본): dev 스택은 그대로 두고 QA만 격리 포트(`port+1000`대 빈 포트)로 재배정, `qa-config.json`(`servers[].port` + `baseUrl`)에 즉시 반영 → 이후 Step 9 scenarios.md/verify.sh가 갱신된 포트를 그대로 사용.
- `restore-dev`: 점유 중인 dev 프로세스를 정지시키고 QA가 원 포트를 사용, QA 종료 시 동일 `cmd`/`cwd`로 best-effort 재기동 시도(완전 보장 아님 — 프로젝트별 dev 기동 스크립트 차이로 실패 가능, 실패 시 WARN).
- `warn-only`: 조치 없이 경고만 남기고 기존 REUSE 동작 유지 (구버전 호환 opt-out).

전부 **WARN-first·fail-open**: 점유 PID 판별 도구(lsof/fuser)가 없으면 판정 자체를 스킵하고 기존 REUSE로 진행 — 하드 실패 없음.


## §QA-SEED 계약 상세

로그인 의존 E2E(로그인 스모크 등)는 fresh/reset DB에서 admin/editor/user 같은 multi-role 계정이 먼저 심어져 있어야 통과한다. 기존 엔진은 일반 단일파일 seed(`seed.sql`/`.ts`/`.js`) 디스패치와 계정 1건 삽입만 가정해 이 순서를 보장하지 않았다. 이 계약은 프로젝트가 `qa-config.json`에 아래 두 형태 중 하나(또는 둘 다)로 명시한다 — 특정 앱의 자격증명·파일명은 하드코딩하지 않고 계약 자체만 정의:

- `seed.authSeed`: DB 드라이버로 직접 주입하는 파일 경로(.sql/.ts/.js) — 나머지 seed와 동일 방식이나 **가장 먼저** 실행.
- `seed.authSeedHook`: 백엔드가 UP된 뒤에만 실행 가능한 커맨드 문자열(예: 내부 provisioning 엔드포인트를 호출해 admin/editor/user 계정을 생성하는 방식 — DB row insert가 아니라 API 경유로만 계정이 만들어지는 프로젝트용). Step 8은 Step 5(서버 기동) 이후에 실행되므로 순서 문제 없음.
- `seed.dependentSeeds`: authSeed(Hook) 이후에 순서대로 실행할 나머지 seed 파일 배열.

`qa-config.json`에 `seed.authSeed`도 `seed.authSeedHook`도 없으면 **WARN만(비차단)**: 프로젝트가 이미 다른 방식으로 auth 계정을 공급 중일 수 있으므로 하드 블록하지 않는다.

