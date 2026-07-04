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
- 미완료 태스크 없음 (gate-log.md 확인)
- 미커밋 변경 없음 (`git status --short` 확인)

## Milestone Retrospective 7-sections (WI-24)

`forge-outputs/.claude/handover/sonnet/YYYY-MM-DD-HHMM-{milestone-name}-milestone.md` 생성:

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
4. `/end-sonnet` 흐름 트리거 (handover → learnings → INDEX → git commit → forge-sync)

## Advisor 자문 (advisory-only · non-blocking · Opus)

마일스톤 종료 확정 직전에 `advisor-strategist`(Opus) 조언을 구한다. **advisory-only — 게이트 차단 아님. 미가용·실패 시 기본 흐름 진행(fail-open).**

```
Agent(subagent_type="advisor-strategist", prompt="마일스톤 범위·완료 항목·잔여·품질게이트 상태 맥락 3-5줄. 질문: 이 마일스톤을 닫기 전 반드시 확인할 미완료 잔여·품질게이트 미충족·리스크 2-3개는?")
```

- 트리거: 마일스톤 close 확정 직전 (실행 순서 4번 `/end-sonnet` 트리거 전)
- 반환 조언은 참고만 — 최종 판단·실행은 커맨드(및 기존 Human 승인 게이트)가 수행.
- **Fable 5 미배선** — Human 수동 에스컬레이션 전용(자동분기는 forge-fix T4 한정). `advisor-model-resolve` 호출 금지.
- 모델 라우팅: 본 커맨드 작업=Sonnet · 탐색=Haiku · advisor/결정=Opus.

## 출력 경로

```
forge-outputs/.claude/handover/sonnet/YYYY-MM-DD-HHMM-{slug}-milestone.md
```

## 다음 단계

```
다음 마일스톤 시작: /forge-resume 또는 /start-sonnet
```
