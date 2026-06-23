---
name: checkpoint
description: "Mid-session 경량 컨텍스트 체크포인트. /compact 전 현재 세션 상태(진행 중 태스크·완료 목록·다음 스텝·블로커·열린 파일)를 ~/.claude/checkpoints/YYYY-MM-DD-HH-MM.md에 저장. /compact 후 사용자가 '계속' 또는 'resume'하면 체크포인트 자동 read → 맥락 복원. end-sonnet/start-sonnet보다 경량 — 세션 종료 아닌 중간 토큰 관리 전용. 트리거: '/checkpoint', '체크포인트', 'compact 전 저장', 토큰 70~90% 경고 시"
---

# checkpoint

중간 토큰 관리용 경량 체크포인트. 세션 종료(end-sonnet) X — 계속 작업 전제.

## 실행 흐름

```
/checkpoint → 파일 저장 → /compact → (resume 신호) → 체크포인트 read → 계속
```

## Step 0: 세션 건강도 진단 (실행 전)

현재 세션 상태를 3계층으로 자가 진단한다:

| 계층 | 신호 | 권장 행동 |
|------|------|---------|
| 🟢 Healthy | 작업 진행 중, 토큰 < 70%, 블로커 없음 | /checkpoint 후 계속 |
| 🟡 Warning | 토큰 70~90%, Phase 전환 직전, 미결 결정 있음 | /checkpoint → /compact → 재개 |
| 🔴 Critical | 토큰 90%+, 블로커 해소 불가, 마일스톤 완료 | /end-sonnet (세션 종료) |

context utilization: healthy(< 70%) / warning(70~90%) / critical(90%+) 3-tier로 판정. critical = 체크포인트 대신 `/end-sonnet` 전환. [STOP] 게이트 또는 외부 승인 대기 중 = warning으로 자동 처리.

## 4-type Checkpoint Taxonomy (WI-23)

체크포인트를 저장하는 목적별 4-type taxonomy:

| 타입 | 설명 | 예시 트리거 |
|------|------|-----------|
| **human-verify** | 인간 확인·승인 대기 — AI가 단독 결정 불가 | 보안 변경, 비가역적 작업, [STOP] 게이트 |
| **decision** | 설계 분기점 — 다음 방향 선택 후 재개 | 구현 방식 A vs B, ADR 결정 대기 |
| **human-action** | 인간이 직접 실행해야 하는 외부 작업 | 크레딧 충전, 배포 승인, 외부 CLI 명령 |
| **tdd-review** | TDD 사이클 중간 저장 — 테스트 작성 후 구현 전 | red 단계 후 compact, green 후 복원 |

체크포인트 파일 frontmatter에 `type:` 필드 추가 권장:
```
type: human-verify | decision | human-action | tdd-review
```

## Step 1: 체크포인트 파일 작성

> **HARD GATE**: 체크포인트는 **상태(state)만** 캡처한다. 코드 수정·파일 생성·명령 실행은 이 단계에서 금지. 순수 state snapshot.

저장 경로: `~/.claude/checkpoints/YYYY-MM-DD-HH-MM.md`

상태 캡처 (파일 작성 전):
```bash
git status --short      # 변경 파일 목록
git diff --stat HEAD    # 미커밋 변경 요약
git log --oneline -3    # 최근 커밋 3개
date +"%Y-%m-%d %H:%M"  # 세션 시작 시각 (duration 계산용)
```
위 4개 명령 결과를 `files_modified` 항목으로 템플릿에 삽입한다.

**LN-02 보안 사항**:
- 체크포인트 파일명에 사용자 입력값 삽입 금지 (타이틀 인젝션 방어): 파일명은 항상 `date +"%Y-%m-%d-%H-%M"` 자동 생성
- 체크포인트는 **append-only 패턴** — 기존 파일 덮어쓰기 금지; 타임스탬프 다른 신규 파일 생성
- `list` 서브커맨드: `/checkpoint list` 입력 시 `ls -lt ~/.claude/checkpoints/` 출력 (저장 안 함)

디렉토리 없으면 생성:
```bash
mkdir -p ~/.claude/checkpoints
```

**파일 내용 템플릿**:

```markdown
# Checkpoint YYYY-MM-DD HH:MM

## 진행 중 태스크
- {현재 하던 일 1줄}

## 완료 (이번 세션)
- {완료 항목들}

## 다음 스텝
1. {즉시 해야 할 것}
2. {그 다음}

## 블로커
- {있으면 명시, 없으면 "없음"}

## 열린 파일 / 결정
- {작업 중인 주요 파일 경로}
- {미결 결정사항}

## 컨텍스트 메모
- {/compact 후 잊으면 안 되는 비자명 정보}

## Git 상태 (files_modified)
```
{git status --short 출력}
```
```

내용은 20~40줄 유지. 장황하게 쓰지 말 것.

## Step 2: 사용자에게 안내

체크포인트 저장 후 다음 메시지 출력:

```
체크포인트 저장: ~/.claude/checkpoints/YYYY-MM-DD-HH-MM.md

이제 /compact 실행하세요.
compact 후 "계속" 또는 "resume" 입력하면 체크포인트 읽고 이어갑니다.
```

## Step 3: compact 후 재개 (resume 감지 시)

사용자가 "계속", "resume", "이어서", "continue" 입력 시:

1. `~/.claude/checkpoints/` 에서 파일명 내림차순 정렬 후 최신 파일 read (파일명 정렬 기준: `YYYY-MM-DD-HH-MM.md` 사전순 역순)
2. 체크포인트 기준으로 상태 복원
   - **브랜치 불일치 경고**: 체크포인트 기록 브랜치 vs 현재 브랜치 다르면 "⚠️ 브랜치 불일치" 경고 후 계속
   - **빈 상태 핸들러**: 체크포인트가 없거나 파일이 비어있으면 "체크포인트 없음 — 처음부터 시작합니다" 출력
3. **HARD GATE**: 복원 전 현재 git status 확인. uncommitted 변경 있으면 경고 출력 (강제 덮어쓰기 금지)
4. "다음 스텝" 첫 항목부터 재개 — 복원 후 다음 스텝 항목을 그대로 출력하여 사용자가 맥락 없이 재개 가능하게 함

## 주의사항

- handover 파일 작성 X (세션 종료 아님)
- learnings 업데이트 X
- INDEX 갱신 X
- 보안 정보(패스워드·토큰) 체크포인트에 절대 기록 금지
- 체크포인트는 임시 파일 — 세션 재개 후 삭제해도 무방

## Evaluator (Wave 2.5)

독립 Evaluator subagent가 산출물 품질을 검증합니다.

```
Evaluator 역할: 산출물 독립 검증
모델: claude-haiku-4-5 (경량, 편향 최소화)
격리: 메인 컨텍스트 오염 방지
```

판정 기준:
- PASS: 모든 핵심 기준 충족, 즉시 사용 가능
- WARN: 사용 가능하나 개선 권장, 사용자 확인 후 진행
- FAIL: 핵심 기준 미충족, 재실행 필요

eval_cases.jsonl에 결과 자동 누적.
