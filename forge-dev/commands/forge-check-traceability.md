---
description: Forge Dev Check 8.5 트레이서빌리티 검수 — 독립 실행
allowed-tools: Read, Grep, Glob
model: sonnet
group: verify
---

# /forge-check-traceability — 트레이서빌리티 게이트

Check 8.5 Spec 준수 검증. 로직 SSoT = `spec-compliance-checker` 스킬.

## 실행

1. `spec-compliance-checker` 스킬 subagent 스폰 → Check 8.5 결과 반환
2. Check 8.5 PASS/WARN 시 → `test-quality-checker` agent 순차 스폰 → Check 8.5T 결과 반환

```python
Agent(subagent_type="test-quality-checker",
      prompt="Check 8.5 출력을 입력으로 받아 테스트 품질 5축 검증 실행. --spec {spec_name}")
```

3. Check 8.5 FAIL 시 → test-quality-checker 스킵 (트레이서빌리티 먼저 수정 필요)
4. 두 체크 결과 합산 출력

인자: `--spec <spec-name>` (선택) — 미입력 시 스킬 내부 자동 탐지.

## 주의사항

- 읽기 전용 wrapper. 코드 수정은 Lead 수행
- Agent Drift 검사(삭제 agent 감지·외부발송 게이트) → `agent-drift-auditor` 스킬 (Check 8.9)
> 실패 시 [[pev-self-correction]] 적용
