---
name: forge-check-traceability
description: "spec→구현 추적성을 FR별 5-state(DONE/PARTIAL/NOT DONE/CHANGED/UNVERIFIABLE) 판정, fr-verdict.json 산출. PR 머지 전 스펙충족 검증 시 사용."
allowed-tools: Bash, Read, Glob, Grep
argument-hint: "[--spec <path>] [--plan <path>] [--pr <number>]"
---

# /forge-check-traceability

**절차 SSoT = `~/forge/.claude/commands/forge-check-traceability.md` → `spec-compliance-checker` subagent.**
이 파일은 동명 커맨드/스킬 우선순위 미규정 문제(Claude Code 공식 미규정)로 인한
이중 판정 체계 충돌을 막기 위한 얇은 위임 포인터다. 이 스킬이 호출되어도
반드시 위 커맨드 절차를 그대로 따른다 — 독자 판정 로직을 두지 않는다.

## 판정 체계 — 두 축은 **경쟁이 아니라 직교**한다 (2026-07-15 실측 정정)

| 축 | 어휘 | 무엇을 말하나 | 소비처 |
|---|---|---|---|
| **FR 상태 (결과)** | **5-state**: `DONE` / `PARTIAL` / `NOT DONE` / `CHANGED` / `UNVERIFIABLE` | 이 FR이 결국 충족됐는가 | **`verification-routing.md`가 이 값으로 머지를 라우팅한다** — 전항목 DONE=AUTO-MERGE / PARTIAL·CHANGED=WARN / NOT DONE·UNVERIFIABLE=**[STOP] 머지 금지**. `forge-implement.md` Check 5.8도 이 어휘를 재사용 |
| **검증 깊이 (근거)** | **4-Level**: `Exists` / `Substantive` / `Wired` / `Functional` | 얼마나 깊이 확인했는가 | `spec-compliance-checker` 내부 판정. Level 3(Wired) 이상 = PASS 규칙 |
| 축 판정 | `PASS` / `WARN` / `FAIL` | 축 단위 종합 | `spec-compliance-checker/workflow.js` 코드 enum |

> ⚠️ **5-state를 "고아"로 오판하지 마라.** 2026-07-14에 이 SKILL.md의 5-state 표를 "아무도 안 부른다"고
> 판단해 삭제했으나 **오판이었다** — `verification-routing.md:10-12`와 `forge-implement.md:346`이 실제로
> 이 어휘로 **머지 차단 여부를 결정**한다. `skills/` 안만 grep하면 배선이 안 보인다. (재발방지 기록)

산출물: `docs/qa/fr-verdict.json` — `fr_total` / `fr_done` / `fr_unmapped` / `fr_partial` / `fr_changed` /
**`fr_by_state`**(5-state 전수 분해) / `spec` / `generated_at`.
`verification-routing.md`가 `fr_by_state`로 머지를 라우팅한다.
불변식 `sum(fr_by_state.values()) == fr_total` — 위반 시 goal-pev이 SUCCESS를 차단한다.

> 2026-07-15 이전 스키마는 3개 집계 필드뿐이라 **PARTIAL·CHANGED가 유실**됐다(라우팅은 5-state를
> 요구하는데 산출물이 그 구분을 못 담음). `fr_partial`·`fr_changed`·`fr_by_state` additive 추가로 해소.
> 구 스키마(필드 부재)도 그대로 동작한다 — 불변식 검사는 필드가 있을 때만 발동.

## Override 경로

FR 미해결 항목의 override 선언·재검증 절차는
`~/forge/.claude/commands/forge-check-traceability.md §Override 경로` 및
`~/.claude/rules-on-demand/verification-overrides.md` 참조.

## 관련 규칙

- scope-drift audit → `~/forge/.claude/commands/forge-pr.md §Scope-Drift Audit`
- verification routing → `~/forge/.claude/rules-on-demand/verification-routing.md`
