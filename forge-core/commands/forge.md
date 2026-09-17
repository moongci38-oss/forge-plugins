---
description: Forge Dev 워크플로우 — Part B 개발 파이프라인 진입 (P4→P7+platform, 기획 패키지/Handoff 보유 시)
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent, TodoWrite, WebSearch, WebFetch
argument-hint: <작업 설명> or --size <hotfix|small|standard|multi-spec>
model: opus
group: ops
---
> **⚠️ 실행 모드 확인**: 이 커맨드는 쓰기 모드에서만 정상 동작합니다. Plan mode 감지 시 즉시 [STOP] — "Escape로 plan mode 해제 후 재실행하세요. 내부 [STOP] 게이트가 승인 지점입니다."


# /forge — Forge Dev 워크플로우 시작

Forge Dev SDD+DDD+TDD 파이프라인을 시작합니다.

## 실행 순서

1. 세션 초기화:
   ```bash
   node ~/.claude/scripts/session-state.mjs init --name <작업명>
   ```

2. 작업 규모 분류 (자동 또는 `--size` 인자):
   - **hotfix**: 긴급 수정 — P4(Spec) 스킵, P5 Check만 (별도 `/forge-fix`도 동일 흐름)
   - **small**: 소규모 기능 (간소화된 Spec)
   - **standard**: 표준 기능 (전체 Phase)
   - **multi-spec**: 대규모 — Spec N개로 분할 (`/forge-spec --bulk`, 구 `/spec-write --bulk`). Plan=`.specify/plans/`, Tasks=`.specify/tasks/` (2026-08-31 재편 — 구 §8/§11 서브섹션 폐기)

3. `forge/pipeline.md`를 기반으로 P4부터 순차 진행

## Phase 흐름 (Part B: P4~P7 + platform)

⚠️ **전제: P3(`/forge-plan`) 산출물 보유.** 이 커맨드는 **P4 부터** 시작한다 — 기획 패키지가 없으면
`/forge-design`(P2) → `/forge-plan`(P3) 을 **선행**한다. PRD 만 있는 상태로 여기 들어오면 P3 가 통째로 누락된다.
근거: 2026-08-22 AgentTrust 세션 — 이 표가 P4 로 시작하는데 선행 단계 커맨드명이 어디에도 없어 P3 스킵 안내가 발생했다.
재현: `grep -c "forge-plan" ~/forge/.claude/commands/forge.md` → `0` 이면 이 전제가 유실된 것이다.
폐기조건: `forge-gate-check.sh` 의 `P4-ENTRY` 게이트가 대화 서술 단계에서도 발동하게 되면 이 문단을 삭제한다.

| Phase | 작업 | Check |
|-------|------|-------|
| P4 | Spec 작성 (**무엇/왜만** — Plan·Tasks 는 별도 파일) → Codex `--stage plan` (blocking) → Human 승인 | Check P4 [STOP] |
| P5 | 구현 + 검증 (TDD) | Check P5→P5-INV→P5.5→P5.7→P5.7-X (Codex code)→P5.9 (harness) |
| P6 | QA (/forge-qa) | Check 6-QA (qa loop)→6-TX (Codex test, on-demand) |
| P7 | PR 생성 + Merge (feature→develop) | Check 7-BM (benchmark)→7-X (Codex final, blocking)→7 ([STOP]/auto-merge) |
| platform | Release + Deploy + Rollback (조건부) | `/forge-deploy` / `/forge-rollback` (reference only) <!-- root-cause(commands/CMD-04, 2026-08-03): forge-release.md는 DEPRECATED alias(→ /forge-deploy prod) — 정본만 나열 --> |

## Codex 2차 게이트 통합 (Plan v2-C1)

모든 Phase 자동 호출:
- P4 끝: `/codex-review --stage plan --blocking`
- Check P5.7-X: `/codex-review --stage code` (권고)
- Check 6-TX: `/codex-review --stage test` (권고)
- Check 7-X: `/codex-review --stage final --effort high --blocking`

자동 호출은 **기본 off**(미설정 = off) — 켜기: `export CODEX_REVIEW_AUTO_STAGES=<단계,…>|all`. 위 Check 는 명시 호출로 돈다. 결과: `forge-outputs/docs/reviews/`.

## 규칙

- Phase 전환 시 자동 체크포인트 생성
- Check 8 실패 시 최대 3회 autoFix 순환 — ⚠️ **카운터는 돌지만 상한은 아무것도 막지 않는다.** `session-state.mjs cmdAddAutofix` 가 `check3CycleCount` 를 증가·영속·출력하지만, 그 값을 **3 과 비교해 중단시키는 코드는 0건**이다. 즉 "3회"는 사람이 로그를 보고 지키는 숫자이지 강제되는 게이트가 아니다.
  ⚠️ **구 표기 "이 상한은 코드에 미배선이다(`check3CycleCount` 참조자 0건, 2026-07-15 실측)" 는 2026-09-17 폐기** — 참조자는 0건이 아니었다(`dev/scripts/session-state.mjs` 6곳). 틀린 근거로 옳은 결론을 적어 둔 자리였다.
  재현: `grep -c 'check3CycleCount' dev/scripts/session-state.mjs` → `6` · `grep -cE 'check3CycleCount[^)]*(>=|>) *3' dev/scripts/session-state.mjs` → `0`(2026-09-17 실측).
  폐기조건: `session-state.mjs` 가 상한 초과 시 비영점 종료·[STOP] 을 내게 되면 이 경고를 지운다.
- Human 승인 게이트: P4 완료 시 필수
- 세션 재개: **새 세션이면 `/forge-start`**(미소비 체크포인트 처리 §2), **같은 세션이면 `/forge-checkpoint` §6 재개**. ⚠️ 구 표기 "`/forge-resume` 사용" 은 2026-09-17 폐기 — 실호출 0 이고 **체크포인트 소유 검증이 없어** 남의 체크포인트를 오복원할 수 있다. 같은 날 **파일째 삭제**됐다(근거: 커맨드 감사 C그룹 §2-6 `11-platform/pipelines/plans/2026-09-17-cmd-audit-C-ops.md`. 재측정: `ls .claude/commands/ | grep forge-resume` → 0).
- 통합 파이프라인: `forge/pipeline.md` 참조
