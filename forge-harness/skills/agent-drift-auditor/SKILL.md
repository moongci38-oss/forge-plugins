---
name: agent-drift-auditor
description: "Forge Dev Check 8.9 하네스 무결성 감사. 파이프라인 내 agent drift 3종 검사 — (1) 삭제 Agent 호출 감지(subagent_type 참조 vs agents/*.md 실재 비교), (2) 중간 산출물 잔존(FR 결과 handover/docs 미기록 탐지), (3) 외부발송 전 Human 게이트(Telegram/PR/이메일 발송 코드에 [STOP] 승인 지점 여부). Check 8.5와 병렬 실행 가능. read-only grep 기반 subagent 격리. CRITICAL/HIGH → [STOP], MEDIUM → WARN. pipeline.md Check 8.9 자동 배선. 수동 호출 /agent-drift-auditor"
---

# agent-drift-auditor

Forge Check 8.9 — 하네스 무결성 감사. 3검사 실행 → `agent_drift` JSON 반환.

## 검사 3종

### Check 1: 삭제 Agent 호출 감지 (HIGH)

```
scan: .specify/specs/*.md, pipeline.md, ~/.claude/skills/*/SKILL.md 내 subagent_type 참조
compare: ~/forge/.claude/agents/*.md 실재 파일 목록
mismatch → drift_issues severity=HIGH
```

**방법**:
1. `grep -r "subagent_type" .specify/ pipeline.md ~/.claude/skills/` → 호출 목록 추출
2. `ls ~/forge/.claude/agents/` → 실재 에이전트 목록
3. 호출 목록 ∩ 실재 목록 = 결손 목록 → HIGH

### Check 2: 중간 산출물 잔존 (MEDIUM)

```
scan: Spec FR 목록 vs handover/*.md + docs/reviews/ 경로 기록 대조
FR 결과가 파일 미저장(대화에만 존재) → orphan_outputs
```

**방법**:
1. `.specify/specs/*.md` 또는 `--spec` 인자에서 FR 목록 추출
2. `grep -r "FR-[0-9]\+" .claude/handover/ docs/reviews/ forge-outputs/.claude/handover/` → 기록된 FR 목록
3. Spec FR - 기록 FR = 잔존 목록 → MEDIUM

### Check 3: 외부발송 전 Human 게이트 (CRITICAL)

```
scan: 구현 파일 내 외부발송 패턴
require: 동일 파일(또는 직접 호출 파일) 내 [STOP] / Human 승인 패턴
미존재 → external_send_ungated severity=CRITICAL
```

**방법**:
1. `grep -rn "mcp__plugin_telegram\|gh pr create\|send.*mail\|post.*slack\|mcp__.*reply\|mcp__.*send" src/ .claude/skills/` → 발송 코드 목록
2. 각 파일에서 `grep -n "\[STOP\]\|Human 승인\|human.*gate\|stop.*gate"` 확인
3. 승인 지점 없는 파일 → CRITICAL

## 출력 형식

```json
{
  "checkId": "check-8.9",
  "status": "PASS|WARN|FAIL",
  "agent_drift": {
    "missing_agents": ["subagent_type명"],
    "orphan_outputs": ["FR-ID"],
    "external_send_ungated": ["파일경로:라인"],
    "drift_issues": [
      {
        "severity": "CRITICAL|HIGH|MEDIUM",
        "check": "1|2|3",
        "finding": "설명",
        "evidence": "파일경로:라인"
      }
    ]
  },
  "summary": "CRITICAL N / HIGH N / MEDIUM N"
}
```

## 판정 기준

| 판정 | 조건 | 행동 |
|------|------|------|
| **FAIL** | CRITICAL 1개+ 또는 HIGH 1개+ | Lead에게 **[STOP]** 에스컬레이션 |
| **WARN** | MEDIUM 1개+ (CRITICAL·HIGH 없음) | Lead에게 보고, 자동 진행 가능 |
| **PASS** | 이슈 0 | 통과 |

## 주의사항

- **읽기 전용** — 코드 수정 X, 결과 JSON만 반환
- subagent 격리 실행 — 메인 컨텍스트 오염 방지
- Check 1 scan 범위: forge 레포 + 현재 프로젝트 `.specify/` 양쪽
- Check 2 FR 추출 실패 시: `"matrixSource": "spec-unavailable"` 플래그 후 Check 2 SKIP

## 자동 평가 (eval-rubric 통합)

본 스킬 결과 산출 후 자동으로 `eval-rubric` 호출 → 4축 Rubric 채점 → `eval_cases.jsonl` 누적.

### 호출 시점
- agent_drift JSON 저장 후 (status FAIL/WARN/PASS 무관)

### 절차
1. 산출물 저장 후: `/eval-rubric --target {agent_drift_result_path}`
2. verdict + 4축 점수 + rationale 수신
3. eval_cases.jsonl append (helper: `~/.claude/scripts/eval-cases-append.py`)
   - case_id: EC-agent-drift-{N} auto-increment
   - split: hash 결정적 (sample 80% / holdout 20%)
   - dedupe: sha256(skill+input)

### 자동 비활성
- `EVAL_RUBRIC_AUTO=off`
- frontmatter `eval_cases: off`

### 보안
- redaction 정책 자동 적용
- secret/PII 의심 시 STOP fail-safe
> 실패 시 [[pev-self-correction]] 적용

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
