---
name: healer
description: "버그 리포트(docs/bug_report/BUG-NNN-*.md) 기반 자동 버그 수정. TDD red-green 사이클(재현→근본원인→수정→검증→회귀테스트화) 실행 후 리포트 상태를 Fixed로 갱신. 트리거: '/healer BUG-001', '버그 고쳐줘', '이 버그 수정해줘', /bug-report 작성 후 수정 착수 시."
---

# Healer

## 역할

버그 리포트를 받아 TDD red-green 사이클(재현→근본원인→외과적 수정→코드리뷰→검증→회귀테스트화)을 실행하는 자동 수정 실행자. 4-Rule Auto-Fix Taxonomy로 logic-guard 버그는 자동수정을 금지하고 Human [STOP] 에스컬레이션한다.

## 컨텍스트

`/bug-report` 작성 완료 후 착수. 입력은 `BUG-NNN` ID 또는 리포트 경로이며, 6하원칙(WHO/WHAT/WHEN/WHERE/WHY/HOW)이 미완성이면 즉시 STOP한다.

**입력**: `BUG-NNN` ID 또는 `docs/bug_report/BUG-NNN-slug.md` 경로.
**출력**: 버그 수정 코드 + 리포트 상태 `Fixed` 갱신 + 영구 회귀테스트 등록.

## Step 1: 버그 리포트 찾기

```bash
# BUG-ID만 입력된 경우 파일 자동 탐색
find docs/bug_report/ -name "{BUG-ID}-*.md" | head -1
```

파일 없으면 즉시 STOP — "리포트 미존재. `/bug-report`로 먼저 작성하세요."

## Step 2: 6하원칙 유효성 확인

리포트에서 아래 6필드 모두 존재하는지 확인:

| 필드 | 체크 |
|------|------|
| WHO | 발생 사용자/역할 명시 |
| WHAT | 증상 명시 |
| WHEN | 재현 조건 명시 |
| WHERE | 파일/화면/기능 명시 |
| WHY | 예상 원인 (빈 값 허용) |
| HOW | 재현 절차 최소 1단계 |

WHO/WHAT/WHEN/WHERE/HOW 중 하나라도 비어있으면 STOP — "6W 미완성. 리포트 보완 후 재실행."

## Step 3: healer agent 스폰

```python
Agent(
  subagent_type="healer",
  prompt=f"""
버그 리포트: {REPORT_PATH}
프로젝트 루트: {PROJECT_ROOT}

리포트를 읽고 TDD red-green 사이클(a0~a6) 실행:
- a0: 재현(RED)
- a1: 근본원인 분석 (Why_root_cause 작성)
  + mcp__gitnexus__context(의심_함수) → callers/callees 360도 → 재현 컨텍스트 보강
- a2: surgical 수정
  + mcp__gitnexus__impact(수정_함수, direction="upstream", maxDepth=1)
  → d=1 심볼 = "반드시 테스트" 목록 확보
- a3: /cr-code 리뷰
- a4: 재현(GREEN) + Vision evaluator
- a5: 회귀 체크
  + mcp__gitnexus__detect_changes(scope="staged")
  → 예상 범위 vs 실제 변경 범위 비교 (scope creep 감지)
- a6: 영구 회귀테스트화 (scenarios.md + verify.sh)

아티팩트 경로: docs/bug_report/artifacts/
healer 로그: docs/bug_report/artifacts/{BUG_ID}-healer.log
"""
)
```

> healer agent 상세 로직: `~/forge/.claude/agents/healer.md`

## Step 4: 리포트 상태 갱신

healer 완료 후 리포트 파일 수정:

```
**상태**: Fixed  →  (RESOLVED 또는 STOP 결과에 따라)
**처리일**: YYYY-MM-DD
**수정 파일**: {a2 수정 파일 목록}
```

healer가 `[STOP]` 반환 시 → 상태 `In Progress` 유지 + 사유 기록.

## 4-Rule Auto-Fix Taxonomy

healer a2(surgical 수정) 진입 전, 버그를 아래 4분류 중 하나로 판정하여 자동수정 허용 범위와 에스컬레이션 기준을 결정한다.

| 분류 | 정의 | 적용 조건 | 에스컬레이션 |
|------|------|---------|------------|
| **deterministic-syntax** | 컴파일 오류·타입 불일치·오탈자처럼 도구가 정답을 확정할 수 있는 수정 | 에러 메시지가 수정 라인을 직접 지목, 변경 파일 ≤2 | 자동수정 허용. 수정 후 컴파일 재확인 필수 |
| **test-expectation** | 테스트 기대값·fixture·mock 불일치로 인한 실패. 로직은 정상 | 실패 테스트 메시지가 기대값 차이만 노출, 비즈니스 로직 변경 없음 | 자동수정 허용. 단 기대값 변경이 스펙 후퇴인지 확인 필수 |
| **config-drift** | 환경변수·설정 파일·경로 불일치 (코드 변경 없이 설정만 수정) | 동일 코드가 다른 환경에서는 정상, 설정 키/값만 틀림 | 자동수정 허용. `.env*` 커밋 금지 — 설정 파일만 수정 |
| **logic-guard** | 비즈니스 로직 오류·알고리즘 결함·상태 전이 버그 | 위 3분류 해당 없음, 혹은 변경 파일 >2 | **자동수정 금지** — a2 진입 전 Human [STOP] 에스컬레이션 + 근본 원인 확정 필수 |

### Crash-Safe Transactional Cleanup

a2 수정 중 중단(crash·STOP·타임아웃) 시 부분 수정이 코드베이스에 잔류하지 않도록:

1. **수정 전 스냅샷**: 변경 대상 파일 경로 목록을 `docs/bug_report/artifacts/{BUG_ID}-patch-manifest.txt`에 저장
2. **수정 단위 원자화**: 단일 파일 단위로 Edit → 즉시 컴파일/lint 검증. 실패 시 해당 파일만 `git checkout -- {path}` 롤백
3. **커밋 전 검증 게이트**: 모든 대상 파일 수정 완료 후 전체 테스트 PASS 확인. FAIL이면 manifest 기반 전체 롤백
4. **롤백 명령 (전체)**: `cat docs/bug_report/artifacts/{BUG_ID}-patch-manifest.txt | xargs git checkout --`
5. **handover 기록**: 롤백 발생 시 사유를 healer log에 `[ROLLBACK]` 태그로 기록

## 전역 가드 (healer agent 상속)

| 가드 | 임계값 |
|------|--------|
| 총 사이클 | 6회 초과 시 STOP |
| 동일 이슈 반복 | 3회 시 STOP |
| 회귀 감지 | 즉시 STOP + 롤백 권장 |
| **토큰 캡** | `HEALER_TOKEN_CAP`(기본 300000) 초과 시 STOP+반환 (추정치 = best-effort; 결정론적 bound = max-cycles) |
| **plateau** | 동일 root-cause 텍스트 2사이클 연속 → STOP |

## 아티팩트 경로

```
docs/bug_report/artifacts/
├── BUG-NNN-red-{mobile|tablet|desktop}-shot.png   (a0 before)
├── BUG-NNN-green-{mobile|tablet|desktop}-shot.png  (a4 after)
└── BUG-NNN-healer.log                              (실행 로그)
```

