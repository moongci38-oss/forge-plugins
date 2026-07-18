---
description: "Opus 세션 종료 — 아키텍처 결정·전략 인수인계 + 장기기억 업데이트. 트리거: \"전략 세션 종료\", \"end-opus\", ADR 작성 완료 후, Sonnet 큐 handover 생성 시."
group: ops
---

# /end-opus

Opus 세션 종료 시 실행.

## Race-free 정책 (2026-05-07~)

`handover-manager.sh` wrapper로 atomic write + INDEX 자동 갱신 + flock 기반 직렬화.

**1 세션 = 1 파일.** 자기 풀 인계 + Sonnet 액션 아이템을 한 문서에 통합. 별도 `from-opus-*` 파일 작성 금지.

## 실행 순서

### 1. PROJECT_ROOT + SLUG 결정

```bash
PROJECT_ROOT=$(pwd)  # 또는 명시 path
SLUG="kebab-case-summary"  # 예: token-opt-and-server-manual
```

### 2. 핸드오버 콘텐츠 작성

필수 섹션:
- **아키텍처 결정 로그** — 결정 + 근거 + 기각한 대안 (AD-N 번호)
- **Current Status** — 완료 / 진행 중 / 블로커
- **열린 질문** — 미결 트레이드오프 (Q1~QN)
- **Next Opus Session** — 다음 Opus가 이어받을 전략 태스크
- **→ Sonnet 액션 아이템** — Sonnet 세션이 바로 실행할 구현 태스크 (P0/P1/P2/P3 우선순위)
- **→ Sonnet 주의사항** — 구현 시 반드시 지킬 제약

> Sonnet 섹션은 풀 인계 후반부에 배치. `/start-sonnet`이 `read-cross opus`로 read.

### 3. atomic write + INDEX 자동 갱신

```bash
echo "$HANDOVER_CONTENT" | \
  ~/.claude/scripts/handover-manager.sh write opus "$PROJECT_ROOT" "$SLUG"
```

- 파일 경로: `{PROJECT_ROOT}/.claude/handover/opus/{date}-{HHMM}-{slug}.md`
- front matter 자동 추가 (date / time / model / slug / status:open / session_id / created_at)
- INDEX.md 자동 갱신 (latest open + last 5 consumed)
- flock 보호 + atomic rename = race 0
- ⚠️ **크로스머신 인계 목적**(다른 PC·다른 세션이 이 handover를 받아야 함)이면 `.claude/handover/`가 해당 프로젝트에서 gitignore 대상인지 먼저 확인 — gitignore 대상이면 추적되는 경로(예: `docs/` 또는 프로젝트 SSoT 디렉토리)에 작성해 git으로 전파되게 한다. 로컬 전용 인계는 기존 경로 그대로.

### 4. learnings 추가 (있으면)

```bash
echo '{"id":"L-29","date":"2026-05-07","category":"...","summary":"...","trigger":"...","apply":"...","evidence":"..."}' | \
  ~/.claude/scripts/handover-manager.sh learn-append "$PROJECT_ROOT"
```

별도 flock으로 동시 append race 차단.

**+ pge-failure 후보 큐 처리 (compounding)**: 핸드오버에 `pge-failure 후보:` 가 있으면 → `learnings.sh` 헬퍼로 반영 (sanitize·collision-id·validate 자동):
```bash
bash ~/.claude/scripts/learnings.sh append --category pge-failure \
  --summary "<무엇을 하려다 / 왜 막혔나 1줄>" --apply "<향후 PGE에서 이 접근 회피 — 대안 1줄>" \
  --evidence "<PGE 보고서 경로 또는 사이클 요약>"
```
→ 보고에 `📌 learnings 신규: <id>`. (없으면 skip.) 헬퍼 규약: `~/.claude/skills/learn/SKILL.md` "코드/디버깅/리뷰/분석 경험" 섹션.

### 4.5. DO/DON'T + 실패한 시도 inline 추출 (P3 Continuity Spine — M13)

handover 작성 중 inline으로 수행 (추가 LLM 호출 0, H4):

**A. 사용자 제약·지시 (DO/DON'T) 캡처**
이번 세션에서 사용자가 명시한 금지(DON'T)·요구(DO)를 handover `## 사용자 제약·지시 (DO / DON'T)` 섹션에 기록.
- 형식: `- [DON'T] {내용} (근거/맥락)` / `- [DO] {내용}`
- **승격**: durable 제약(설계·아키텍처 레벨) → 글로벌 `~/CLAUDE.md` 또는 프로젝트 루트 CLAUDE.md `## 사용자 제약` 섹션
- **learnings 저장**: 재사용 가능 교훈 → `learnings.sh append --category user-directive` 또는 `--category forbidden-pattern`

**B. 실패한 시도와 이유**
handover `## 실패한 시도와 이유` 섹션에 기록:
- 형식: `- 시도: {무엇} → 실패: {증상} → 이유: {원인} → 교훈: {다음 세션 지침}`
- 섹션 형식 상세: `~/.claude/rules-on-demand/handover-template.md` §추가 필수 섹션 참조

### 5. Memory / Rule 업데이트

| 발견 유형 | 저장 위치 |
|-----------|-----------|
| 설계 원칙·패턴 | `~/.claude/projects/*/memory/` |
| 재발 방지 규칙 | `~/.claude/rules/` 또는 `rules-on-demand/` |

### 6. Obsidian 업데이트 (해당 시)

- 새로운 아키텍처 패턴
- 재사용 가능한 설계 템플릿
- 프로젝트 방향 전환 결정

### 7. CLAUDE.md 갱신 (revise-claude-md, 플러그인 설치 시만)

세션 학습을 다음 세션 cascade에 즉시 반영. learnings.jsonl(장기 이력) ↔ CLAUDE.md(즉각 cascade) 병행.

```bash
# 플러그인 설치 검사
if ls ~/.claude/plugins/installed_plugins.json 2>/dev/null && \
   grep -q "claude-md-management" ~/.claude/plugins/installed_plugins.json; then
  /claude-md-management:revise-claude-md
  # → 세션 분석 → 갱신 후보 제시 → 사용자 승인 후 CLAUDE.md edit
else
  echo "[end-opus] claude-md-management 미설치 — Step 7 skip."
  echo "  설치: /plugin install claude-md-management@claude-plugins-official"
fi
```

**가이드** (Opus 영역):
- 갱신 대상 = 아키텍처 결정·전략 패턴 → 글로벌 `~/CLAUDE.md` 또는 프로젝트 루트 CLAUDE.md (팀 공유)
- 개인/실험 = `.claude.local.md` (gitignore)
- 사용자 승인 후에만 적용 (plugin 자체 게이트)

## 체크리스트

- [ ] `handover-manager.sh write opus` 호출 완료 (Sonnet 섹션 포함)
- [ ] INDEX.md 자동 갱신 확인
- [ ] learnings 추가 (해당 시) — `learn-append` 호출
- [ ] DO/DON'T + 실패한 시도 handover 섹션 기록 (§4.5 — P3 Continuity Spine)
- [ ] Memory/Rule 업데이트 (해당 시)
- [ ] Obsidian 업데이트 (해당 시)
- [ ] revise-claude-md 호출 (플러그인 설치 시) — CLAUDE.md 갱신 후보 검토
