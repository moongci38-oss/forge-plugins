---
description: "마일스톤 종료 — milestone-retrospective 7-sections 생성 + handover + forge-sync"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
argument-hint: "<milestone-name> [--sprint <N>] [--output <path>]"
group: ops
---

# /forge-milestone-close — 마일스톤 종료

마일스톤 완료 시 7-sections retrospective를 생성하고 세션을 종료합니다.

## 전제조건

- 현재 브랜치: develop (main 직접 금지)
- 미완료 태스크 없음 — `{project-root}/gate-log.md` 확인(= `${FORGE_OUTPUTS:-$HOME/forge-outputs}/02-product/{프로젝트}/gate-log.md`, 템플릿 `dev/templates/gate-log.md`). ⚠️ 구 표기 "gate-log.md 확인"(경로 없음) 은 2026-09-17 폐기 — 어느 폴더의 파일인지 적혀 있지 않아 찾을 수 없었다. 재현: `find ~/forge-outputs -maxdepth 3 -name gate-log.md`
- 미커밋 변경 없음 (`git status --short` 확인)

## Milestone Retrospective 7-sections (WI-24)

`${FORGE_OUTPUTS:-$HOME/forge-outputs}/.claude/handover/YYYY-MM-DD-HHMM-{milestone-name}-milestone.md` 생성:

⚠️ **구 표기 `handover/sonnet/…` 는 2026-09-17 폐기** — 모델별 하위 폴더(`sonnet/`·`opus/`)는 **2026-08-01 에 단일 레인으로 통합**됐다(`/forge-end` description: *"서술형 handover 작성(단일 레인) … 구 /end-opus·/end-sonnet 통합"*). 경로가 틀리면 산출물이 회수 스캔에 안 걸려 **사람 눈에 안 보인다.**
재현: `ls ~/forge-outputs/.claude/handover/ | tail -5` → 날짜 접두 파일이 최상위에 있다(`sonnet/`·`opus/` 는 통합 이전 잔재).
정본 = `/forge-end` 의 `handover-landing.sh` 가 내는 `HANDOVER_DIR` — 이 커맨드도 그 값을 쓴다.

### Section 1: 마일스톤 요약
- 목표, 실제 완료 범위, 기간 (시작~종료)
- Sprint N 또는 Phase X~Y

### Section 2: 완료 항목
- 구현된 기능 목록 (FR별)
- 커밋 참조 (`git log --oneline` 기반)

### Section 3: 미완료 / 이월 항목
- 이월 이유 (스코프 초과, 블로커, 우선순위 변경)
- 다음 마일스톤 백로그 제안

### Section 4: 기술 결정 (ADR 요약)
- 이번 마일스톤에서 생성된 ADR 목록
- 핵심 결정 사항 1줄 요약

### Section 5: 블로커 & 해소
- 발생한 블로커와 해소 방법
- 미해소 블로커 → 다음 마일스톤 이월

### Section 6: 측정 지표
- 예상 vs 실제 작업량 (planning fallacy 진단)
- 커밋 수, 파일 변경 수, 테스트 통과율

### Section 7: 다음 마일스톤 시작 조건
- 필수 선행 작업
- 첫 번째 태스크 제안
- 필요한 컨텍스트 (handover 참조)

## 실행 순서

1. `git log --oneline` — 이번 마일스톤 커밋 범위 확인
2. gate-log.md, handover 최신 파일 read
3. 7-sections retrospective 생성
4. `/forge-end` 흐름 트리거 (handover → learnings → INDEX → git commit → forge-sync)

## Advisor 자문 (advisory-only · non-blocking · 리졸버 기본 = Fable 5.1)

마일스톤 종료 확정 직전에 `advisor-strategist` 조언을 구한다(모델 = `advisor-model-resolve.sh` 출력, 기본 Fable 5.1). **advisory-only — 게이트 차단 아님. 미가용·실패 시 기본 흐름 진행(fail-open).**

> ⚠️ **아래 예시는 리졸버가 `claude-*` 를 냈을 때의 형태다.** 스폰 모델은 항상 `advisor-model-resolve.sh` 가 정한다 — `claude-fable-5-1`→`model:"fable"`, `claude-opus-5`→`model:"opus"`, **`gpt-6-astra`(대체 기본)·`gpt-5.6-sol` 같은 `gpt-*` 면 Agent 가 아니라 `mcp__codex__codex`(sandbox=read-only)**. 분기표 → `agents/advisor-strategist.md §비용 특성`. 리졸버를 건너뛰면 kill-switch·일일캡·미가용 폴백이 전부 우회된다.
```
Agent(subagent_type="advisor-strategist", prompt="마일스톤 범위·완료 항목·잔여·품질게이트 상태 맥락 3-5줄. 질문: 이 마일스톤을 닫기 전 반드시 확인할 미완료 잔여·품질게이트 미충족·리스크 2-3개는?")
```

- 트리거: 마일스톤 close 확정 직전 (실행 순서 4번 `/forge-end` 트리거 전)
- 반환 조언은 참고만 — 최종 판단·실행은 커맨드(및 기존 Human 승인 게이트)가 수행.
- **advisor 모델 = `advisor-model-resolve.sh` 출력**(기본 Fable 5.1 · 대체 `gpt-6-astra` · `FORGE_ADVISOR_MODEL=opus` 로 Opus 고정). 출력이 `gpt-*` 면 Agent 가 아니라 `mcp__codex__codex`(sandbox=read-only)로 스폰한다.
  ⚠️ 2026-08-12 이전 문구 **"Fable 5 미배선 — Human 수동 에스컬레이션 전용 · `advisor-model-resolve` 호출 금지"는 폐기**했다 — 이 커맨드에 advisor 자문 레그가 실재하는데 리졸버 호출을 금지해 라우팅이 서로 어긋났다(cr-final HIGH). 정본 → `rules/model-routing.md §Advisor 전략 상시 가동`
- 모델 라우팅: 본 커맨드 작업=**Opus**(기본값) · 탐색=Haiku · git ops=Haiku · advisor=`advisor-model-resolve.sh` 출력(기본 Fable 5.1 · 대체 `gpt-6-astra`).
  ⚠️ **구 표기 "본 커맨드 작업=Sonnet" 은 2026-09-17 폐기** — `model-routing.md §워커 tier` 의 기본값은 **Opus** 이고 Sonnet 은 "기계적·단일파일" 일 때만 **내리는** 값이다. 마일스톤 회고 작성은 그 조건에 해당한다는 근거가 없었다.

## 출력 경로

```bash
eval "$(bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/handover-landing.sh" "$(pwd)")"
# → $HANDOVER_DIR/YYYY-MM-DD-HHMM-{slug}-milestone.md
# 스크립트 부재 시 폴백: ${FORGE_OUTPUTS:-$HOME/forge-outputs}/.claude/handover/
```
⚠️ 구 표기 `forge-outputs/.claude/handover/sonnet/…` 는 2026-09-17 폐기(§Milestone Retrospective 의 같은 경고 참조).

## 다음 단계

```
다음 마일스톤 시작: /forge-start (새 세션) 또는 /forge-checkpoint §6 재개 (같은 세션)
```

<!-- 2026-09-17: 구 표기 "/forge-resume 또는 /forge-start" 폐기 — forge-resume 은 실호출 0 이고 체크포인트 소유 검증이 없어 같은 날 **파일째 삭제**됐다(근거 감사 C그룹 §2-6 `11-platform/pipelines/plans/2026-09-17-cmd-audit-C-ops.md`. 재측정: `ls .claude/commands/ | grep forge-resume` → 0). -->
