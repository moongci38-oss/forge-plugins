---
description: Sonnet 세션 종료 — 구현 결과 인수인계 + 실전 교훈 업데이트
group: ops
---

# /end-sonnet

Sonnet 세션 종료 시 실행.

## Race-free 정책 (2026-05-07~)

`handover-manager.sh` wrapper로 atomic write + INDEX 자동 갱신 + flock 기반 직렬화.

**1 세션 = 1 파일.** 자기 풀 인계 + Opus 검토 요청을 한 문서에 통합. 별도 `from-sonnet-*` 파일 작성 금지.

## 실행 순서

### 1. PROJECT_ROOT + SLUG 결정

```bash
PROJECT_ROOT=$(pwd)  # 또는 명시 path
SLUG="kebab-case-summary"  # 예: handover-race-fix-impl
```

### 2. 핸드오버 콘텐츠 작성

필수 섹션:
- **완료된 구현** — 파일 경로 + 변경 요약 (커밋 해시 포함 가능)
- **Current Status** — 완료 / 진행 중 / 블로커
- **Next Sonnet Session** — 이어받을 구현 태스크 (우선순위 순)
- **발견한 버그·이슈** — 수정 완료 여부 표시
- **→ Opus 검토 요청** — 설계 판단 필요한 항목만 (구현 세부사항 X)
- **→ 발견한 아키텍처 이슈** — 구현 중 드러난 설계 문제
- **→ 제안** — Sonnet 관점의 개선안 (결정은 Opus에게)

> Opus 섹션은 풀 인계 후반부에 배치. `/start-opus`가 `read-cross sonnet`로 read.

### 3. atomic write + INDEX 자동 갱신

```bash
echo "$HANDOVER_CONTENT" | \
  $HOME/.claude/scripts/handover-manager.sh write sonnet "$PROJECT_ROOT" "$SLUG"
```

- 파일 경로: `{PROJECT_ROOT}/.claude/handover/sonnet/{date}-{HHMM}-{slug}.md`
- front matter 자동 추가
- INDEX.md 자동 갱신
- flock 보호 + atomic rename = race 0
- ⚠️ **크로스머신 인계 목적**(다른 PC·다른 세션이 이 handover를 받아야 함)이면 `.claude/handover/`가 해당 프로젝트에서 gitignore 대상인지 먼저 확인 — gitignore 대상이면 추적되는 경로(예: `docs/` 또는 프로젝트 SSoT 디렉토리)에 작성해 git으로 전파되게 한다. 로컬 전용 인계는 기존 경로 그대로.

### 4. learnings 추가 (있으면)

```bash
echo '{"id":"L-30","date":"2026-05-07","category":"...","summary":"...","trigger":"...","apply":"...","evidence":"..."}' | \
  $HOME/.claude/scripts/handover-manager.sh learn-append "$PROJECT_ROOT"
```

별도 flock으로 동시 append race 차단.

**+ pge-failure 후보 큐 처리 (compounding)**: 이번 세션에 PGE Evaluator 최종 FAIL이 있었고 핸드오버에 `pge-failure 후보:` 가 기록됐으면 → `learnings.sh` 헬퍼로 반영 (sanitize·collision-id·validate 자동):
```bash
bash $HOME/.claude/scripts/learnings.sh append --category pge-failure \
  --summary "<무엇을 하려다 / 왜 막혔나 1줄>" --apply "<향후 PGE에서 이 접근 회피 — 대안 1줄>" \
  --evidence "<PGE 보고서 경로 또는 사이클 요약>"
```
→ 보고에 `📌 learnings 신규: <id>`. (없으면 skip.) 코드/디버깅/리뷰 경험 헬퍼 규약: `$HOME/.claude/skills/learn/SKILL.md` "코드/디버깅/리뷰/분석 경험" 섹션.

### 4.5. 구조화 학습 추출 (PLAN vs SUMMARY diff)

handover 작성 시 세션 시작 Plan과 실제 결과 diff를 4카테고리로 분석:

| 카테고리 | 질문 | 기록 위치 |
|---------|------|---------|
| 시간 오차 | 예상 vs 실제 소요 — 왜 차이? | handover §실패·오차 |
| 미지 의존성 | 발견 못한 결합·사이드이펙트 | handover §발견한 이슈 |
| 절차 역전 | 순서 바꿨어야 할 단계 | learnings (category: process) |
| 판단 전환 | 중간에 바꾼 설계 결정 | learnings (category: decision) |

category: process/decision 항목 → Step 4 `learn-append`에 즉시 포함.
시간 오차 > 50% 또는 미지 의존성 2개+ = planning-fallacy 플래그 (`"trigger": "planning-fallacy"`).

### 4.6. DO/DON'T + 실패한 시도 inline 추출 (P3 Continuity Spine — M13)

handover 작성 중 inline으로 수행 (추가 LLM 호출 0, H4). 기존 §4.5·WI-16과 연결:

**A. 사용자 제약·지시 (DO/DON'T) 캡처**
이번 세션에서 사용자가 명시한 금지(DON'T)·요구(DO)를 handover `## 사용자 제약·지시 (DO / DON'T)` 섹션에 기록.
- 형식: `- [DON'T] {내용} (근거/맥락)` / `- [DO] {내용}`
- **승격**: durable 제약(반복 적용 예상) → 프로젝트 CLAUDE.md `## 사용자 제약` 섹션으로 이동
- **learnings 저장**: 재사용 가능 교훈 → `learnings.sh append --category user-directive` 또는 `--category forbidden-pattern`

**B. 실패한 시도와 이유 (WI-16 §실패한 시도 정식 포맷)**
handover `## 실패한 시도와 이유` 섹션에 기록 (WI-16 Pre-close Artifact Audit 항목과 동일 의무):
- 형식: `- 시도: {무엇} → 실패: {증상} → 이유: {원인} → 교훈: {다음 세션 지침}`
- 섹션 형식 상세: `$HOME/.claude/rules-on-demand/handover-template.md` §추가 필수 섹션 참조

**Per-item source attribution**: 각 learnings 항목에 출처 명시 필수:
```
--evidence "session:{handover-slug} | commit:{hash} | PR:{N}"
```
출처 없는 learnings = 재현 불가 → 신뢰도 낮음. 최소 session slug 기재.

### 5. Memory / Rule 업데이트

| 발견 유형 | 저장 위치 |
|-----------|-----------|
| 재발 방지 실수 패턴 | `$HOME/.claude/rules/` 또는 프로젝트 `rules-on-demand/` |
| 프로젝트 특화 코딩 규칙 | `{프로젝트}/.claude/rules/` |
| 툴·라이브러리 gotcha | `$HOME/.claude/projects/*/memory/` |

### 6. Obsidian 업데이트 (해당 시)

- 재사용 가능한 구현 스니펫·패턴
- 반복되는 버그 유형과 해결법

### 7. CLAUDE.md 갱신 (revise-claude-md, 플러그인 설치 시만)

세션 학습을 다음 세션 cascade에 즉시 반영. learnings.jsonl(장기 이력) ↔ CLAUDE.md(즉각 cascade) 병행.

```bash
# 플러그인 설치 검사
if ls $HOME/.claude/plugins/installed_plugins.json 2>/dev/null && \
   grep -q "claude-md-management" $HOME/.claude/plugins/installed_plugins.json; then
  /claude-md-management:revise-claude-md
  # → 세션 분석 → 갱신 후보 제시 → 사용자 승인 후 CLAUDE.md edit
else
  echo "[end-sonnet] claude-md-management 미설치 — Step 7 skip."
  echo "  설치: /plugin install claude-md-management@claude-plugins-official"
fi
```

**가이드** (Sonnet 영역):
- 갱신 대상 = 구현 패턴·gotcha·tool 사용 팁 → 프로젝트 CLAUDE.md (팀 공유) 또는 `.claude.local.md` (개인)
- 글로벌 `~/CLAUDE.md` 변경은 신중 (cascade 영향 ↑) — Opus 영역 권고
- 사용자 승인 후에만 적용 (plugin 자체 게이트)

## Pre-close Artifact Audit (WI-16 — milestone 종료 시)

마일스톤(AD 완료 또는 Phase 완료) 종료 시 handover 작성 전 artifact 점검:

| 항목 | 확인 방법 | 필수 |
|------|---------|------|
| 열린 plan.md 작업 전부 DONE/SKIP 표시 | grep "TODO\|PENDING\|진행" plan.md | YES |
| commit 미완 staged 파일 없음 | `git status` clean | YES |
| handover 초안에 `실패한 시도` 섹션 작성 | — | YES |
| learnings 추출 4-category 완료 (§4.5) | — | YES |
| PLAN vs 실제 소요 차이 > 50%면 `planning-fallacy` 플래그 | — | COND |

→ 모든 필수 항목 PASS 후 handover 최종 커밋.

## 체크리스트

- [ ] Pre-close Artifact Audit 완료 (milestone 종료 시)
- [ ] `handover-manager.sh write sonnet` 호출 완료 (Opus 섹션 포함)
- [ ] INDEX.md 자동 갱신 확인
- [ ] learnings 추가 (해당 시) — `learn-append` 호출 (4-category §4.5 포함)
- [ ] DO/DON'T + 실패한 시도 handover 섹션 기록 (§4.6 — P3 Continuity Spine)
- [ ] Memory/Rule 업데이트 (해당 시)
- [ ] Obsidian 업데이트 (해당 시)
- [ ] revise-claude-md 호출 (플러그인 설치 시) — CLAUDE.md 갱신 후보 검토

## AD-N retrospective 작성 (AD 종료 시)

Sonnet 세션이 AD-N의 마지막 구현 세션이면 handover에 retrospective 포함:
- 템플릿: `${FORGE_ROOT:-$HOME/forge}/.claude/templates/ad-retrospective-template.md`
- §1~§8 모두 채워야 cr-plan `analysis` stage PASS 가능
- 특히 §5 검증 깊이 (grep ≠ runtime), §6 롤백, §7 보안 acceptance 필수
