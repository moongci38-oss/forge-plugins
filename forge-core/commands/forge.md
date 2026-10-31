---
description: Forge Dev 워크플로우 — Part B 개발 파이프라인 진입 (P4→P7+platform, 기획 패키지/Handoff 보유 시)
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent, TodoWrite, WebSearch, WebFetch
argument-hint: <작업 설명>
model: opus
group: ops
---
> **⚠️ 실행 모드 확인**: 이 커맨드는 쓰기 모드에서만 정상 동작합니다. Plan mode 감지 시 즉시 [STOP] — "Escape로 plan mode 해제 후 재실행하세요. 내부 [STOP] 게이트가 승인 지점입니다."


# /forge — Forge Dev 워크플로우 시작

Forge Dev SDD+DDD+TDD 파이프라인을 시작합니다.

## 실행 순서

1. 세션 초기화:
   ```bash
   node $HOME/.claude/scripts/session-state.mjs init --name <작업명>
   ```

2. `forge/pipeline.md`를 기반으로 P4부터 순차 진행 — 크기로 가르지 않는다(#3736 확정 ①). 버그는 `/forge-fix`.

## Phase 흐름 (Part B: P4~P7 + platform)

⚠️ **이 커맨드는 P4(Spec) 부터 시작한다.** 기획은 `/prd`(P2) 까지이고, 기술 결정(스택·ADR·보안·테스트 전략)은
`/forge-spec` 이 Spec 에 적는다 — 옛 P3(`/forge-plan`)는 폐지됐다(#3736 · E1 B).

| Phase | 작업 | Check |
|-------|------|-------|
| P4 | Spec 작성 (**무엇/왜만** — Plan·Tasks 는 별도 파일) → Codex `--stage plan` (권고 · AD-50) → Human 승인 | Check P4 [STOP] |
| P5 | 구현 + 검증 (TDD) | Check P5→P5-INV→P5.5→P5.7→P5.7-X (Codex code)→P5.9 (harness) |
| P6 | QA (/forge-qa) | Check 6-QA (qa loop)→6-TX (Codex test, on-demand) |
| P7 | PR 생성 + Merge (feature→develop) | Check 7-BM (benchmark)→7-X (Codex final, blocking)→7 ([STOP]/auto-merge) |
| platform | Release + Deploy + Rollback (조건부) | `/forge-deploy` (reference only) · dev·stg 롤백 = `python3 ${FORGE_ROOT:-$HOME/forge}/shared/scripts/release-engine.py rollback --milestone <묶음> --env <dev 또는 stg>`(#3759 · prod 롤백은 사람) <!-- root-cause(commands/CMD-04, 2026-08-03): forge-release.md는 DEPRECATED alias(→ /forge-deploy prod) — 정본만 나열 --> |

## Codex 2차 게이트 통합 (Plan v2-C1)

단계 통과는 **테스트·기계 검사**가 정한다 — 단계마다 검수를 걸지 않는다(`dev-workflow-rules.md §운영 규칙 1` · 검수자는 full-gate PR 에 1회뿐).
- 사람이 시킬 때만 명시 호출(권고 · 막지 않는다 · 1회): `/codex-review --stage plan|code|test|final` — FAIL 이면 고치고 테스트로 확인하며 다시 부르지 않는다.

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
