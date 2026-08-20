---
description: Forge Dev 보안 검수 (P6 QA Phase 1 T6 연계) — 독립 실행
allowed-tools: Bash, Read, Grep, Glob
model: sonnet
disable-model-invocation: true
group: verify
---

# /forge-check-security — 보안 검수 게이트

**절차 SSoT = `skills/forge-check-security/SKILL.md`**. 이 커맨드는 진입점일 뿐이다. S1~S15 항목·등급(CRITICAL/HIGH/MEDIUM/LOW)·산출물(`docs/qa/security-report.md`)은 전부 SKILL.md가 정의한다.

## 실행

forge-check-security 스킬의 절차를 그대로 실행한다.

## Advisor 자문 (advisory-only · non-blocking · 리졸버 기본 = Fable 5)

보안 발견의 심각도·악용 가능성 판정이 경계일 때 `advisor-strategist` 조언을 구한다(모델 = `advisor-model-resolve.sh` 출력, 기본 Fable 5). **advisory-only — 게이트 차단 아님. 미가용·실패 시 기본 흐름 진행(fail-open).**

> ⚠️ **아래 예시는 리졸버가 `claude-*` 를 냈을 때의 형태다.** 스폰 모델은 항상 `advisor-model-resolve.sh` 가 정한다 — `claude-fable-5`→`model:"fable"`, `claude-opus-5`→`model:"opus"`, **`gpt-5.6-sol`이면 Agent 가 아니라 `mcp__codex__codex`(sandbox=read-only)**. 분기표 → `agents/advisor-strategist.md §비용 특성`. 리졸버를 건너뛰면 kill-switch·일일캡·미가용 폴백이 전부 우회된다.
```
Agent(subagent_type="advisor-strategist", prompt="발견 내용·영향 범위·기존 방어 맥락 3-5줄. 질문: 이 보안 발견의 실제 악용 가능성과 심각도 상향/하향 근거 2-3개는?")
```

- 트리거: Critical/High 판정 경계 또는 N/A 처리 판단 시
- 반환 조언은 참고만 — 최종 판단·실행은 커맨드가 수행.
- **advisor 모델 = `advisor-model-resolve.sh` 출력**(기본 Fable 5 · 대체 `gpt-5.6-sol` · `FORGE_ADVISOR_MODEL=opus` 로 Opus 고정). 출력이 `gpt-*` 면 Agent 가 아니라 `mcp__codex__codex`(sandbox=read-only)로 스폰한다.
  ⚠️ 2026-08-12 이전 문구 **"Fable 5 미배선 — Human 수동 에스컬레이션 전용 · `advisor-model-resolve` 호출 금지"는 폐기**했다 — 이 커맨드에 advisor 자문 레그가 실재하는데 리졸버 호출을 금지해 라우팅이 서로 어긋났다(cr-final HIGH). 정본 → `rules/model-routing.md §Advisor 전략 상시 가동`
- 모델 라우팅: 본 커맨드 작업=Sonnet · 탐색=Haiku · advisor=`advisor-model-resolve.sh` 출력(기본 Fable 5 · 대체 `gpt-5.6-sol`).
