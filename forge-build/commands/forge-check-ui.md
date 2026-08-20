---
description: "Forge Dev P5 Check P5.6 UI/UX 품질 검수 — 독립 실행 MAS P1+ (2026-05-25): + Codex Vision 우선 (정확도), Gemini Vision 폴백."
allowed-tools: Bash, Read, Grep, Glob, ToolSearch
model: sonnet
group: verify
---

# /forge-check-ui — UI/UX 품질 게이트

P5 Check P5.6 UI/UX 검증을 독립적으로 실행합니다.

## 실행

1. UI 관련 파일 변경 목록 확인
2. 정적 분석 (U-1~U-5) → `ui-quality-checker` agent 스폰:

```python
Agent(subagent_type="ui-quality-checker",
      prompt="변경 파일 목록: {changed_files}. Spec: {spec_path}. 6축 정적 검증 실행.")
```

3. U-6 Lighthouse/반응형 시각 검증 → Playwright MCP는 미설치. 시각 검증은 qa/forge-fix와 동일한 `shared/scripts/playwright-devtools-capture.mjs`(자체 playwright Node 헬퍼) 또는 `visual-loop` 스킬로 수행(로직 단일화 — 새 경로 신설 금지). MCP는 설치 시에만 선택적으로 사용.
4. 두 결과 합산 → JSON 반환

## Advisor 자문 (advisory-only · non-blocking · 리졸버 기본 = Fable 5)

UI/UX 게이트 판정이 PASS/FAIL 경계일 때 `advisor-strategist` 조언을 구한다(모델 = `advisor-model-resolve.sh` 출력, 기본 Fable 5). **advisory-only — 게이트 차단 아님. 미가용·실패 시 기본 흐름 진행(fail-open).**

> ⚠️ **아래 예시는 리졸버가 `claude-*` 를 냈을 때의 형태다.** 스폰 모델은 항상 `advisor-model-resolve.sh` 가 정한다 — `claude-fable-5`→`model:"fable"`, `claude-opus-5`→`model:"opus"`, **`gpt-5.6-sol`이면 Agent 가 아니라 `mcp__codex__codex`(sandbox=read-only)**. 분기표 → `agents/advisor-strategist.md §비용 특성`. 리졸버를 건너뛰면 kill-switch·일일캡·미가용 폴백이 전부 우회된다.
```python
Agent(subagent_type="advisor-strategist", prompt="UI 검수 결과·접근성/UX 지적·현재 점수 맥락 3-5줄. 질문: 이 UI의 접근성·핵심 UX 리스크 중 게이트 판정을 바꿀 2-3개는?")
```

- 트리거: 게이트 판정 경계(접근성·핵심 UX 결함 논쟁 시)
- 반환 조언은 참고만 — 최종 판단·실행은 커맨드가 수행.
- **advisor 모델 = `advisor-model-resolve.sh` 출력**(기본 Fable 5 · 대체 `gpt-5.6-sol` · `FORGE_ADVISOR_MODEL=opus` 로 Opus 고정). 출력이 `gpt-*` 면 Agent 가 아니라 `mcp__codex__codex`(sandbox=read-only)로 스폰한다.
  ⚠️ 2026-08-12 이전 문구 **"Fable 5 미배선 — Human 수동 에스컬레이션 전용 · `advisor-model-resolve` 호출 금지"는 폐기**했다 — 이 커맨드에 advisor 자문 레그가 실재하는데 리졸버 호출을 금지해 라우팅이 서로 어긋났다(cr-final HIGH). 정본 → `rules/model-routing.md §Advisor 전략 상시 가동`
- 모델 라우팅: 본 커맨드 작업=Sonnet · 탐색=Haiku · advisor=`advisor-model-resolve.sh` 출력(기본 Fable 5 · 대체 `gpt-5.6-sol`).

## 트리거 조건

`.tsx`, `.jsx`, `.vue`, `.css`, `.scss`, `.svg`, `.png` 등 UI 파일 변경 시.
> 실패 시 [[pev-self-correction]] 적용
