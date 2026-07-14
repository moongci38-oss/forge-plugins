---
description: Forge Dev 워크플로우 — Part B 개발 파이프라인 진입 (P4→P7+platform, 기획 패키지/Handoff 보유 시)
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Task, TodoWrite, WebSearch, WebFetch
argument-hint: <작업 설명> or --size <hotfix|small|standard|multi-spec>
model: sonnet
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
   - **multi-spec**: 대규모 — Spec N개로 분할 (`/forge-spec --bulk`, 구 `/spec-write --bulk`). Plan/Task는 각 Spec §8/§11 서브섹션 (별도 파일 X)

3. `forge/pipeline.md`를 기반으로 P4부터 순차 진행

## Phase 흐름 (Part B: P4~P7 + platform)

| Phase | 작업 | Check |
|-------|------|-------|
| P4 | Spec 작성 (복잡 시 Plan/Task = Spec §8/§11 섹션) → Codex `--stage plan` (blocking) → Human 승인 | Check P4 [STOP] |
| P5 | 구현 + 검증 (TDD) | Check P5→P5-INV→P5.5→P5.7→P5.7-X (Codex code)→P5.9 (harness) |
| P6 | QA (/forge-qa) | Check 6-QA (qa loop)→6-TX (Codex test, on-demand) |
| P7 | PR 생성 + Merge (feature→develop) | Check 7-BM (benchmark)→7-X (Codex final, blocking)→7 ([STOP]/auto-merge) |
| platform | Release + Deploy + Rollback (조건부) | `/forge-release` / `/forge-deploy` / `/forge-rollback` (reference only) |

## Codex 2차 게이트 통합 (Plan v2-C1)

모든 Phase 자동 호출:
- P4 끝: `/codex-review --stage plan --blocking`
- Check P5.7-X: `/codex-review --stage code` (권고)
- Check 6-TX: `/codex-review --stage test` (권고)
- Check 7-X: `/codex-review --stage final --effort high --blocking`

비활성: `export CODEX_REVIEW_AUTO_STAGES=off`. 결과: `forge-outputs/docs/reviews/`.

## 규칙

- Phase 전환 시 자동 체크포인트 생성
- Check 8 실패 시 최대 3회 autoFix 순환
- Human 승인 게이트: P4 완료 시 필수
- 세션 재개: `/forge-resume` 사용
- 통합 파이프라인: `forge/pipeline.md` 참조
