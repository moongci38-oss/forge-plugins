---
description: "Forge Dev P5 Check P5.6 UI/UX 품질 게이트 — 독립 실행 진입점. 실행은 `forge-check-ui` 스킬(workflow.js 5축 + 조건부 L3)이 한다. Lighthouse/Vision 축 = codex-critic(모델은 workflow.js `codexUiModel` 이 정한다)."
allowed-tools: Bash, Read, Grep, Glob, Skill, Agent, ToolSearch
model: sonnet
group: verify
---

# /forge-check-ui — UI/UX 품질 게이트

P5 Check P5.6 UI/UX 검증을 독립적으로 실행합니다. **이 커맨드는 입구일 뿐이고, 실행 절차는 스킬 한 곳에만 있습니다.**

> #1139 C013(2026-09-27): 이 파일이 실행 절차(변경 파일 → `ui-a11y-lint.sh` 기계 축 → `ui-quality-checker` 스폰 →
> 시각 검증 → 합산)를 직접 적고 있었는데 같은 절차가 `skills/forge-check-ui/workflow.js` 에 코드로 있었다.
> 경로가 둘이면 한쪽만 고쳐져 판정이 갈린다 — 그래서 절차는 스킬로 모으고 여기는 호출만 한다.
> 절차를 바꾸려면 **`workflow.js`(와 `SKILL.md`)를 고친다** — 여기에 단계를 다시 적지 않는다.

## 실행

```
Skill(forge-check-ui, args='{"url": "<검사 URL, 기본 http://localhost:3000>", "projectRoot": "<프로젝트 루트>", "changedFiles": [<UI 변경 파일 — 생략하면 스킬이 작업트리 변경분을 쓴다>]}')
```

반환 = `{verdict, l3, axes[], failedAxes[], pixelDiffGate, stop}` (스킬 `workflow.js` 마지막 `return`). 재검은 호출자 몫이다(스킬 GC1 — 내부 재실행 없음).

## 커맨드 고유 계약 (스킬이 지켜야 하는 것 — 절차 사본이 아니다)

- **아무것도 설치하지 않는다.** eslint·jsx-a11y 가 없으면 U-2·U-4 는 `UNAVAILABLE`(미설치 — 판정 불가)로 떨어지고 에이전트가 직접 본다.
  구현 위치: `shared/scripts/ui-a11y-lint.sh`(머리 주석 "아무것도 설치하지 않는다" · `not-installed` 분기).
- **기계 축 판정 JSON 은 요약하지 않고 원문 그대로 에이전트에 넣는다** — PASS/WARN/FAIL 축은 확정값(재판정 금지),
  `UNDECIDED` 는 residual 만, `UNAVAILABLE` 은 직접 판정. 린트가 exit 0 이 아니면 `없음(스크립트 실패)` 로 넣는다(fail-open).
  구현 위치: `workflow.js` source-quality 축(`MECH_SCHEMA` · `mechJson` · `agentType: 'ui-quality-checker'`) · 에이전트 쪽 `agents/ui-quality-checker.md §기계 축 입력 처리`.
- **시각 검증(U-6 Lighthouse·반응형)은 기존 경로 하나로만** — `shared/scripts/playwright-devtools-capture.mjs`(자체 playwright 헬퍼, L1.5 단일 chokepoint) 또는 `visual-loop` 스킬.
  Playwright MCP 는 설치돼 있을 때만 선택적으로 쓴다. **새 시각 검증 경로를 신설하지 않는다**(로직 단일화 — qa·forge-fix 와 같은 헬퍼).
- ⚠️ **알려진 손실 — Spec 입력 없음**: 구 커맨드는 `ui-quality-checker` 에 `Spec: {spec_path}` 를 넘겼지만 스킬 `workflow.js` source-quality 축은 spec 을 받지 않는다 → **U-3 breakpoint 는 Spec 과 대조하지 않고 코드만 본다**. 스킬에 spec 인자를 배선하는 일은 후속(#1139 백로그)으로 넘긴다.
  Spec 대조가 필요하면 `ui-quality-checker` 에이전트를 직접 스폰해 프롬프트에 `Spec: <spec 경로>` 를 함께 넘긴다(이 게이트의 판정을 대신하지는 않는다 — 보조 확인).

## Advisor 자문 (advisory-only · non-blocking)

게이트 판정이 PASS/FAIL **경계**일 때(접근성·핵심 UX 결함 논쟁) 조언자에게 "판정을 바꿀 접근성·UX 리스크 2~3개"를 묻는다.
**게이트 차단이 아니다 — 미가용·실패 시 기본 흐름대로 진행(fail-open).** 반환 조언은 참고만, 최종 판단은 이 커맨드가 한다.

- 모델·스폰 방식 = **`shared/scripts/advisor-spawn-guard.sh resolve` 출력만** 따른다(`claude-*` → `Agent(subagent_type="advisor-strategist", model:…)` · `gpt-*` → `mcp__codex__codex` sandbox=read-only).
  리졸버를 건너뛰면 kill-switch·일일캡·미가용 폴백이 전부 우회된다.
- 정본 → `rules/model-routing.md §Advisor 전략 상시 가동` · 분기표 → `agents/advisor-strategist.md §비용 특성`.
- 모델 라우팅: 본 커맨드 작업 = Sonnet · 탐색 = Haiku · advisor = 위 리졸버 출력.

## 트리거 조건

`.tsx`, `.jsx`, `.vue`, `.css`, `.scss`, `.svg`, `.png` 등 UI 파일 변경 시.
> 실패 시 [[pev-self-correction]] 적용
