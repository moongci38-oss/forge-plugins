---
description: Opus 세션 시작 — 전략·아키텍처 컨텍스트 로드
group: ops
---

# /start-opus

Opus 세션 시작. 토큰 절약 최우선 — INDEX·cross·요약만 컨텍스트에. 디테일은 사용자 명시 시.

## 실행

1. `PROJECT_ROOT` = cwd (또는 명시 path).

2. learnings 갱신 체크 (git repo면):
   ```bash
   git -C "$PROJECT_ROOT" fetch --quiet 2>/dev/null
   B=$(git -C "$PROJECT_ROOT" rev-list --count HEAD..@{u} 2>/dev/null || echo 0)
   [ "${B:-0}" -gt 0 ] && echo "⚠️ origin이 $B 커밋 앞섬 — learnings.jsonl 등 최신화 위해 \`git pull\` 권고 (강제 X)"
   ```

3. opus INDEX의 "최신" 섹션 상위 5줄만 read (전체 `cat` 금지):
   ```bash
   I="$PROJECT_ROOT/.claude/handover/opus/INDEX.md"
   [ -f "$I" ] && sed -n '/## 최신/,/## 최근/p' "$I" | grep '^- ' | head -5
   ```

4. Sonnet → Opus 인계 read:
   ```bash
   ~/.claude/scripts/handover-manager.sh read-cross sonnet "$PROJECT_ROOT"
   ```
   summary 기본 (frontmatter + 헤더만). `--full`은 사용자 명시 시만. 출력 없음 → "Sonnet 인계 없음" 진행.

5. 자체 handover body·learnings full = **read 금지** (default). SessionStart 훅이 이미 learnings 최근 3건 주입함 — 중복 read X. `.claude/MEMORY.md` 있으면 read (없으면 skip). 사용자가 다음 명시 시만 부분 read:
   - "full handover" → 최신 1건 full
   - "AD-N" → 해당 결정 grep
   - 특정 파일명 → 명시 path만

6. 폴백 (manager 없음 / 핸드오버 0건) — 순서대로 1회만: `opus/` 최신 → `sonnet/` 최신 → 없으면 사용자 알림 후 대기.

7. 요약 출력 (≤150 단어): 최신 handover slug + 날짜 / Sonnet 검토 요청 (read-cross 결과) / 미결 결정 (INDEX 명시분만, body grep X) / 안내 "디테일 = 'full handover' 또는 'AD-N' 명시".

8. 역할 선언:
   > 세션 = 아키텍처 결정 / 설계 / 마일스톤 리뷰. 구현은 Sonnet 위임.

## Agent View 활용

`claude agent` 로 멀티에이전트 작업 시 3상태 확인:
- **Needs Input** — 에이전트 대기 중, 즉시 응답 필요
- **Working** — 진행 중, Peek으로 중간 결과 확인 가능
- **Completed** — 완료, Inline Reply로 다음 지시

Attach 시 AI가 해당 에이전트 컨텍스트를 자동 브리핑 — 긴 subagent 결과 요약 없이 이어받기 가능.

## 세션 종료

`/end-opus` — handover write + opus INDEX 자동 갱신 (수동 X).
