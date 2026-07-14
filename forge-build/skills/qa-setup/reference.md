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
