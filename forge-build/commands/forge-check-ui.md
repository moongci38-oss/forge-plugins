---
description: Forge Dev P5 Check P5.6 UI/UX 품질 검수 — 독립 실행 MAS P1+ (2026-05-25): + Codex Vision 우선 (정확도), Gemini Vision 폴백.
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

## Advisor 자문 (advisory-only · non-blocking · Opus)

UI/UX 게이트 판정이 PASS/FAIL 경계일 때 `advisor-strategist`(Opus) 조언을 구한다. **advisory-only — 게이트 차단 아님. 미가용·실패 시 기본 흐름 진행(fail-open).**

```python
Agent(subagent_type="advisor-strategist", prompt="UI 검수 결과·접근성/UX 지적·현재 점수 맥락 3-5줄. 질문: 이 UI의 접근성·핵심 UX 리스크 중 게이트 판정을 바꿀 2-3개는?")
```

- 트리거: 게이트 판정 경계(접근성·핵심 UX 결함 논쟁 시)
- 반환 조언은 참고만 — 최종 판단·실행은 커맨드가 수행.
- **Fable 5 미배선** — Human 수동 에스컬레이션 전용(자동분기는 forge-fix T4 한정). `advisor-model-resolve` 호출 금지.
- 모델 라우팅: 본 커맨드 작업=Sonnet · 탐색=Haiku · advisor/결정=Opus.

## 트리거 조건

`.tsx`, `.jsx`, `.vue`, `.css`, `.scss`, `.svg`, `.png` 등 UI 파일 변경 시.
> 실패 시 [[pev-self-correction]] 적용
