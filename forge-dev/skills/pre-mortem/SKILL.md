---
name: pre-mortem
description: >
  배포 전 실패 시나리오 예측 분석. "이미 실패했다고 가정"하고 원인을 역추적하여
  잠재 버그와 리스크를 사전 제거한다. 신규 기능 배포 전 실행.
argument-hint: "[feature: 기능명 또는 설명]"
user-invocable: true
context: fork
model: sonnet
---

**역할**: 당신은 소프트웨어 배포 실패 시나리오를 역추적 분석하는 Pre-mortem 전문가입니다.
**컨텍스트**: 신규 기능 배포 전, 또는 큰 리팩토링 전에 실행합니다.
**출력**: 실패 시나리오 목록 + 각 시나리오별 방어 체크리스트

## 인자

-  = 분석 대상 기능/변경사항 설명

## Workflow 통합 (계획서 P2-5)
Step 5 Codex 적대적 검증 = agentType:codex-critic 자동 연동 (Plan v2-C1).
패턴: Analyze(시나리오 생성) → Checklist(리포트) → Codex(적대적 추가 검증, blocking=final).
실행: `Workflow({ script: Bash("cat ~/.claude/skills/pre-mortem/workflow.js"), args: { feature, target, skipCodex } })`
skipCodex=true 시 Step 5 건너뜀. `CLAUDE_CODE_DISABLE_WORKFLOWS=1` 시 기존 방식 fallback.

## 실행 흐름

### Step 1: 대상 파악

를 기반으로 분석 대상 기능/코드를 파악한다.
인자가 없으면 현재 git diff 또는 최근 커밋을 기반으로 분석한다.

 agent-server/tg-permission-hook.sh | 6 ++++--
 1 file changed, 4 insertions(+), 2 deletions(-)

### Step 2: Pre-mortem 시나리오 생성 (Subagent)

독립 Subagent를 스폰하여 실패 시나리오를 생성한다:



### Step 3: 체크리스트 생성

Subagent 결과를 기반으로 배포 전 체크리스트를 생성한다:

- HIGH/CRITICAL 항목은 배포 전 반드시 수정
- MEDIUM 항목은 다음 스프린트 이슈로 등록
- LOW 항목은 모니터링 추가

### Step 4: 결과 보고

### Step 5: Codex 적대적 추가 검증 (Plan v2-C1, 권장)

Pre-mortem 가설 + 변경 코드를 Codex final-stage로 한 번 더 검증:

```bash
/codex-review --stage final --target <PR or branch> --effort high
```

- Pre-mortem이 놓친 적대적 시나리오 (역방향 사고) 보완
- `final` stage = blocking YES (Plan v2-C1) — 결과 검토 후 진행
- 결과: `forge-outputs/docs/reviews/final/{date}-{slug}.md`



## 사용 예시



## Evaluator (Wave 2.5)

독립 Evaluator subagent가 산출물 품질을 검증합니다.

```
Evaluator 역할: 산출물 독립 검증
모델: claude-haiku-4-5 (경량, 편향 최소화)
격리: 메인 컨텍스트 오염 방지
```

판정 기준:
- PASS: 모든 핵심 기준 충족, 즉시 사용 가능
- WARN: 사용 가능하나 개선 권장, 사용자 확인 후 진행
- FAIL: 핵심 기준 미충족, 재실행 필요

eval_cases.jsonl에 결과 자동 누적.
