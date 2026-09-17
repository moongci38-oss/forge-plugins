# Testing Skills with Subagents (SP-B7)

> TDD RED-GREEN-REFACTOR 전체 사이클을 서브에이전트로 실행하는 워크플로우.
> 적용 대상: 행동 규율 강제 스킬 (TDD 준수·검증 요구·보안·완료선언 게이트·리뷰 의무).

## 왜 서브에이전트로 테스트하는가

메인 컨텍스트에서 스킬을 테스트하면 스킬 작성자가 "자기 스킬을 테스트" = 인지 편향.  
서브에이전트 격리로 외부 테스터 시각 확보 + 메인 컨텍스트 오염 방지.

## TDD 3-Phase 사이클

### Phase RED — 실패 케이스 먼저

```
subagent 지시: "이 스킬을 아래 시나리오로 실행하고 실패해야 하는 케이스를 확인하라:
  시나리오 A: [경계 입력 — 빈 입력, 빠진 필수 필드]
  시나리오 B: [잘못된 흐름 — 게이트 순서 위반]
  시나리오 C: [보안 — 민감 데이터 노출 시도]
결과: FAIL 케이스별 실제 출력 + 기대 출력 대비 diff"
```

RED 기준: 스킬이 잘못된 입력을 거부하거나 WARN을 발행해야 한다.  
RED 통과 = 스킬이 경계 케이스를 잡는다.

### Phase GREEN — 정상 케이스

```
subagent 지시: "이 스킬을 골든 패스 시나리오로 실행하라:
  시나리오 G1: [최소 유효 입력]
  시나리오 G2: [완전한 입력 + 모든 옵션]
  시나리오 G3: [에지 케이스지만 유효한 입력]
결과: 각 시나리오별 출력 + eval_cases.jsonl 항목 생성"
```

GREEN 기준: 스킬이 PASS 판정을 내리고 산출물을 정확히 생성한다.

### Phase REFACTOR — 스트레스 테스트

```
subagent 지시: "이 스킬을 이중 시나리오(동시 실행)로 스트레스 테스트하라:
  - 대용량 입력(10x 정상 크기)
  - 반복 실행(같은 입력 3회) → 결정론적 출력 확인
  - 비동기 의존성(외부 MCP/API) 실패 시 폴백 동작
결과: 결정론성 판정 (동일 입력 → 동일 출력?) + 폴백 경로 검증"
```

## Stress-Test Subagent 스폰 패턴

```python
# 오케스트레이터에서 병렬 스폰
from anthropic import Agent

results = await parallel([
    lambda: agent(f"RED 테스트: {skill_name} 경계 케이스", 
                  label="stress:red", phase="RED", schema=TEST_RESULT_SCHEMA),
    lambda: agent(f"GREEN 테스트: {skill_name} 골든 패스",
                  label="stress:green", phase="GREEN", schema=TEST_RESULT_SCHEMA),
])
```

## eval_cases.jsonl 시드 생성 의무

스킬 stress-test 완료 후 최소 3개 시드 케이스 생성:

```jsonl
{"skill": "<name>", "scenario": "golden-path", "verdict": "PASS", "input": {...}, "output_hash": "<sha256>"}
{"skill": "<name>", "scenario": "empty-input", "verdict": "FAIL", "input": {}, "error": "missing required field"}
{"skill": "<name>", "scenario": "boundary-valid", "verdict": "WARN", "input": {...}, "warning": "..."}
```

`~/.claude/skills/eval-rubric/scripts/eval-cases-append.py`로 jsonl append.

## 규율 강제 스킬 체크리스트

행동 규율을 강제하는 스킬은 아래 항목 전수 테스트 의무:

| 체크 | 기준 |
|------|------|
| 완료선언 게이트 | 검증 없는 "완료" 시 WARN/FAIL |
| 보안 게이트 | 민감 데이터 노출 시도 시 STOP |
| TDD 순서 강제 | RED→GREEN→REFACTOR 역순 시 거부 |
| 리뷰 의무 | cr-triple 미실행 시 다음 단계 블록 |

## 참조

- TDD 3-phase 구현체 → `~/forge/.claude/commands/forge-implement.md` §REFACTOR phase
- eval_cases 시스템 → `~/.claude/rules-on-demand/eval-system-boundary.md`
- 행동 규율 강제 스킬 목록 → skill-creator/SKILL.md §적용 대상
