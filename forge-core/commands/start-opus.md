---
description: "Opus 세션 시작 — 전략·아키텍처 컨텍스트 로드. 트리거: \"전략 세션 시작\", \"아키텍처 검토\", \"start-opus\", Sonnet 구현 결과 리뷰 착수 시."
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

4.5. **프로젝트 VITALS 로드 (read-only)**
   - 프로젝트 루트 `CLAUDE.md`의 `## 핵심정보` 섹션을 read-only 로드.
   - ⚠️ **변이 절대 금지**: consumed 마킹·INDEX 수정 등 어떤 파일도 변경하지 않는다 (C2 TOCTOU 방지).
   - 섹션 부재 시 = **grace**: 차단·GUIDE-STOP 없이 다음 단계로 진행. 1줄 advisory 출력:
     > "`## 핵심정보` 미설정 — `/forge-onboard`로 생성 권고"
   - → `bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/check-continuity.sh"` advisory 실행(비차단) — populated/secret 검증 결과 1줄 표시. 스크립트 부재 시 skip(fail-open).

5. 자체 handover body·learnings full = **read 금지** (default). SessionStart 훅이 이미 learnings 최근 3건 주입함 — 중복 read X. `.claude/MEMORY.md` 있으면 read (없으면 skip). 사용자가 다음 명시 시만 부분 read:
   - "full handover" → 최신 1건 full
   - "AD-N" → 해당 결정 grep
   - 특정 파일명 → 명시 path만

6. 폴백 (manager 없음 / 핸드오버 0건) — 순서대로 1회만: `opus/` 최신 → `sonnet/` 최신 → 없으면 사용자 알림 후 대기.

7. 요약 출력 (≤150 단어): 최신 handover slug + 날짜 / Sonnet 검토 요청 (read-cross 결과) / 미결 결정 (INDEX 명시분만, body grep X) / 안내 "디테일 = 'full handover' 또는 'AD-N' 명시".

8. 역할 선언 (`~/.claude/rules/00-common.md` 라우팅 준거):
   > 이 세션 = 오케스트레이터(advisor) — 결정·계획·설계·검수·오케스트레이션 전담. 직접 구현하지 않고 작업 분해·위임·검증·종합에 집중.
   > worker 위임 = 규모·난도별 tier: 검색·탐색=haiku / 소규모·단순·명확 구현·버그수정=sonnet / 대규모·복잡·고난도·깊이 있는 구현·버그수정=opus worker.
   > 병렬화 = subagent(경량 단일 태스크) / Agent Teams(2~9개 독립 병렬) / Workflow(3단계+ 결정론 루프·다수 동시 스폰) 중 규모·난도로 선택.
   > 비가역·고위험 국면 = fable-5 조언자 승격 (Human opt-in, 또는 가드 하 T4 자동분기 — AI 자율 호출 금지).
   > 위임 결과는 그대로 신뢰하지 않고 diff·테스트 실측 검증 후 채택.

## Agent View 활용

`claude agent` 로 멀티에이전트 작업 시 3상태 확인:
- **Needs Input** — 에이전트 대기 중, 즉시 응답 필요
- **Working** — 진행 중, Peek으로 중간 결과 확인 가능
- **Completed** — 완료, Inline Reply로 다음 지시

Attach 시 AI가 해당 에이전트 컨텍스트를 자동 브리핑 — 긴 subagent 결과 요약 없이 이어받기 가능.

## 세션 종료

`/end-opus` — handover write + opus INDEX 자동 갱신 (수동 X).
