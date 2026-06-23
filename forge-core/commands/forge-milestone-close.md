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

## 출력 경로

```
forge-outputs/.claude/handover/sonnet/YYYY-MM-DD-HHMM-{slug}-milestone.md
```

## 다음 단계

```
다음 마일스톤 시작: /forge-resume 또는 /start-sonnet
```
