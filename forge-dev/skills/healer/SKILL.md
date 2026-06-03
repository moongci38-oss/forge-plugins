---
name: healer
description: "버그 리포트(docs/bug_report/BUG-NNN-*.md) 기반 자동 버그 수정. TDD red-green 사이클(재현→근본원인→수정→검증→회귀테스트화) 실행 후 리포트 상태를 Fixed로 갱신. 트리거: '/healer BUG-001', '버그 고쳐줘', '이 버그 수정해줘', /bug-report 작성 후 수정 착수 시."
---

# Healer

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

## 전역 가드 (healer agent 상속)

| 가드 | 임계값 |
|------|--------|
| 총 사이클 | 6회 초과 시 STOP |
| 동일 이슈 반복 | 3회 시 STOP |
| 회귀 감지 | 즉시 STOP + 롤백 권장 |

## 아티팩트 경로

```
docs/bug_report/artifacts/
├── BUG-NNN-red-{mobile|tablet|desktop}-shot.png   (a0 before)
├── BUG-NNN-green-{mobile|tablet|desktop}-shot.png  (a4 after)
└── BUG-NNN-healer.log                              (실행 로그)
```

