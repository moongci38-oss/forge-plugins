---
description: 알려진 버그/이슈를 Hotfix 흐름으로 빠르게 처리 — qa skill --mode=hotfix wrapper (AD-95)
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent
argument-hint: <이슈 설명 또는 Notion task URL>
model: sonnet
group: implement
---
> **⚠️ 실행 모드 확인**: 이 커맨드는 쓰기 모드에서만 정상 동작합니다. Plan mode 감지 시 즉시 [STOP] — "Escape로 plan mode 해제 후 재실행하세요."

> **AD-95 (2026-05-24)**: `/forge-fix` = `qa skill --mode=hotfix` 얇은 wrapper. 구현·게이트·healer는 qa 스킬이 담당. 이 파일은 진입점만.


# /forge-fix

알려진 버그/이슈를 **qa hotfix 모드**로 처리하는 단일 진입 커맨드.

내부적으로 `/qa --mode=hotfix`를 호출 — Phase B~C(시나리오 전수·버그 발견) 스킵, SIMPLE healer, PR까지 자동.

## 사용법

```
/forge-fix <이슈 설명 또는 Notion task URL>
```

**예시**:
```
/forge-fix 로그인 페이지에서 이메일 유효성 검사가 작동하지 않음
/forge-fix https://notion.so/xxx (Notion 이슈 URL)
```

## 실행 흐름 (AD-95 wrapper)

### Step 1. 이슈 파싱

- 자유 텍스트 입력 → 이슈 내용 직접 파악
- Notion URL 입력 → `forge-pm-updater` Subagent로 상세 조회

### Step 2. Hotfix 분류 확인

| 조건 | 판정 |
|------|------|
| 단일 파일 수정 예상 + 명확한 버그 | ✅ qa hotfix 모드 진입 |
| 변경 파일 2개 이상 예상 | **[STOP]** `/qa` 풀모드 재분류 제안 |
| 새 기능/리팩토링 성격 | **[STOP]** `/forge` 커맨드로 전환 제안 |
| cross-repo 버그 | **[STOP]** `/qa` (HIGH 라우팅 → PGE) 제안 |

### Step 3. qa hotfix 모드 호출

분류 확인 후 환경변수 설정 + qa skill 위임:

```bash
export QA_MODE=hotfix
export QA_BUG_TEXT="<이슈 설명>"
export QA_SCOPE="hotfix"
# Notion URL이면 → forge-pm-updater로 상세 로드 후 QA_BUG_TEXT에 채움

# 과거 유사 패턴 로드 (compounding)
LEARN_BY=forge-fix bash $HOME/.claude/scripts/learnings.sh load bug-fix-pattern 2>/dev/null

# qa skill 호출 (hotfix 모드)
# → Phase A: hotfix/{slug} 브랜치 생성
# → Phase B~C: SKIP
# → Phase D: bug-fix-plan.md 자동 생성 (SIMPLE)
# → Phase E: healer SIMPLE (단일파일 가드 포함)
# → Phase F: cr-bug + cr-code (cr-test/cr-final 기본 실행)
# → Phase G~H: PR + CI + 자동 머지 + 지식 축적
```

### Step 4. learnings append (qa Phase H에서 자동)

qa Phase H가 learnings.jsonl append를 담당. forge-fix 자체 Step 5.5는 qa Phase H로 이전.

## 에스컬레이션 규칙

| 상황 | 행동 |
|------|------|
| 수정 범위 확대 (2+ 파일) | qa Phase E 단일파일 가드 [STOP] → 사용자에게 `/qa` 풀모드 제안 |
| 새 기능/리팩토링 성격 감지 | **[STOP]** `/forge` 커맨드로 시작 제안 |
| cross-repo 버그 | **[STOP]** `/qa` HIGH 라우팅(PGE) 제안 |

## forge-sync 배포 대상

이 커맨드는 `forge-sync` 실행 시 `$HOME/.claude/commands/forge-fix.md`에 자동 배포된다.
> 실패 시 [[pev-self-correction]] 적용
