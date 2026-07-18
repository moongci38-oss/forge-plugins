---
description: Resume previous session from last checkpoint
allowed-tools: Bash, Read, Write
argument-hint: "[session-name] or --all to list sessions"
model: sonnet
group: ops
---

# /forge-resume — 세션 재개

세션 상태를 확인하고 마지막 중단 지점부터 재개합니다.

## 실행 순서

1. `node ~/.claude/scripts/session-state.mjs list` 실행하여 활성 세션 목록 확인
2. 세션이 없으면 "No previous session found" 출력 후 종료
3. 세션이 1개면 자동 선택, 2개 이상이면 목록 출력 후 사용자에게 선택 요청
4. 선택된 세션의 상태 출력:

```
세션 재개
- 세션 이름: {sessionName}
- 세션 ID: {sessionId}
- 작업 규모: {workSize}
- 현재 Phase: {currentPhase}
- 마지막 체크포인트: {lastCheckpoint.phase} ({timestamp})
- 미완료 Check: {failedChecks}
- autoFix 누적: {totalAttempts}회
- 순환 카운터: {check3CycleCount}/3
```

5. Git 상태 확인 (uncommitted changes)
6. 마지막 체크포인트 Phase부터 재개

## Phase별 재개 행동 (Part B — `session-state.mjs` checkpoint 기준)

| checkpoint | 행동 |
|-----------|------|
| phase4_complete | P5 (Implement+Verify) 진입 |
| phase5_complete | P6 QA 진입 |
| phase6_complete | P7 (Merge) 진입 |
| phase7_complete | platform 층 진입 — `/forge-release` |
| session_complete | 완료 |

> 구 session-state.mjs 호환 (phase6/7/8/9/10/11 식별자 → P4~P7 label로 재해석):
>
> | 구 state | 신규 의미 |
> |---------|---------|
> | phase6_complete | P4 Spec 완료 |
> | phase7_complete | P5 Implement+Verify 완료 |
> | phase8_complete | P7 Merge 완료 |
> | phase9_complete | P7 완료 (Develop Integration) |
> | phase10_complete | platform 층 시작점 |
> | phase11_complete | platform 층 Release 완료 |

> Part A (Phase 1~5)는 `session-state.mjs` 미사용 — `gate-log.md`의 마지막 `chore(sN): check N pass` 커밋으로 재개 지점 판단.

## Context-aware Next-Step 추천 (WI-24)

세션 재개 시 단순 상태 복원 외에 **현재 컨텍스트 분석** 후 다음 스텝을 추천한다.

1. **handover 파일 탐색**: `forge-outputs/.claude/handover/sonnet/` 최신 파일 read
2. **checkpoint 파일 탐색**: `~/.claude/checkpoints/` 최신 파일 read (checkpoint 있으면 우선)
3. **git log 분석**: `git log --oneline -5` — 마지막 커밋 기준 Phase 추론
4. **미완 태스크 감지**: `gate-log.md` 또는 handover의 "다음 스텝" 섹션 파싱
5. **추천 출력**:

```
다음 추천 스텝:
  1. {handover/checkpoint 기준 즉시 해야 할 것}
  2. {그 다음}
  
  컨텍스트 출처: [{checkpoint|handover|git-log}] {파일명 또는 커밋}
  브랜치: {현재 브랜치} (⚠️ 체크포인트와 다를 시 경고 표시)
```

checkpoint 없고 handover도 없으면: `git log --oneline -10` 기준 Phase 추론 + 수동 확인 요청.

## 규칙

- autoFix 카운터는 리셋하지 않고 이어서 사용
- 이미 PASS된 Check는 재실행하지 않음
- rollbackHistory를 확인하여 이전 롤백 사유 파악
- 이후 모든 커맨드에 `--session {선택된 이름}` 전달
