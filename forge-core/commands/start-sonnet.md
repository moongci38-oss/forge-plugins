---
description: Sonnet 세션 시작 — 구현 컨텍스트 로드
group: ops
---

# /start-sonnet

Sonnet 세션 시작 시 실행.

## 통합 핸드오버 정책 (2026-05-07~)

**1 세션 = 1 파일.** Opus 통합 handover 후반부에 "Sonnet 액션 아이템" 섹션 포함.
별도 `from-opus-*` 파일은 폐지 (구버전 호환만 폴백 read).

## 실행 순서

0. **learnings 갱신 체크 (compounding 팀 공유)**
   ```bash
   git -C "$(pwd)" fetch --quiet 2>/dev/null
   BEHIND=$(git -C "$(pwd)" rev-list --count HEAD..@{u} 2>/dev/null || echo 0)
   [ "${BEHIND:-0}" -gt 0 ] && echo "⚠️ origin이 $BEHIND 커밋 앞섬 — learnings.jsonl 등 최신 위해 \`git pull\` 권고 (강제 X)"
   ```

1. **curated handover 읽기 (우선순위 순)**
   - `05-handoff/` 최신 파일 read (lumir-01 등 표준 프로젝트)
   - 없으면 `.claude/handover/sonnet/` 최신 파일 read
   - 없으면 `.claude/handover/opus/` 최신 파일 read
   - **마지막 폴백**: `.claude/handover/` 루트 — 단, `*-auto.md` 패턴 파일 제외
   - 구버전 폴백: `.claude/handover/sonnet/from-opus-*` 존재 시 read
   - 어디도 없으면 사용자에게 알리고 대기

2. **프로젝트 메모리 읽기**
   - `.claude/MEMORY.md` (있으면)
   - `.claude/learnings.md` 또는 `learnings.jsonl` (있으면)

3. **오늘 작업 요약 출력**
   - 우선순위 순 구현 태스크 목록
   - 블로커 있으면 먼저 명시

4. **역할 선언**
   > 이 세션 역할: 구현 실행
   > 설계 판단 필요한 사항 발생 시 → 즉시 사용자에게 보고 (독단 결정 금지)
   > 세션 종료 전 handover 업데이트 필수

## Agent View 활용

`claude agent` 로 멀티에이전트 작업 시 3상태 확인:
- **Needs Input** — 에이전트 대기 중, 즉시 응답 필요
- **Working** — 진행 중, Peek으로 중간 결과 확인 가능
- **Completed** — 완료, Inline Reply로 다음 지시

Attach 시 AI가 해당 에이전트 컨텍스트를 자동 브리핑 — 긴 subagent 결과 요약 없이 이어받기 가능.

## 세션 종료 시

`/end-sonnet` 실행
