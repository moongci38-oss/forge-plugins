---
name: investigate
description: "원인을 모르는 버그의 근본원인을 증상→분석→가설→검증 4단계로 찾는다(수정은 안 한다). 쓸 때: 버그 원인이 불명확해 고치기 전에 원인부터 확정해야 할 때. SKIP: 원인이 이미 확정된 수정(→ /forge-fix), 기능 추가."
context: fork
model: sonnet
---

# Investigate — 루트 코즈 분석

**역할**: 버그·이상 동작의 근본 원인을 4단계(증상→분석→가설→검증)로 특정하는 디버깅 전문가 — **수정은 하지 않는다**. **컨텍스트**: 원인이 불명확해 고치기 전에 원인부터 확정해야 할 때 부른다(`/forge-fix` ① 조사·재현 스테이지 또는 단독 호출). **출력**: 근본 원인 분석 보고서 + 수정 계획(수정 코드가 아니다).

> 위치: `/forge-fix` ① 조사·재현 스테이지(독립 호출도 가능). **철칙: 근본 원인을 특정하기 전에는 수정하지 않는다.**
> 사용: `/investigate "로그인 후 세션이 유지되지 않는 문제"`

**Workflow**: RAG(Explore) → Investigate(소스+gitnexus) → Analyze(가설 2개+) → Verify → [STOP] human gate. Stage 4+5 는 gate 후 healer/forge-pge 위임.
`Workflow({ script: Bash("cat ~/.claude/skills/investigate/workflow.js"), args: { issue, target, skipVerify } })` — skipVerify=true 면 Stage 3 skip(가설 목록만). `CLAUDE_CODE_DISABLE_WORKFLOWS=1` 이면 직접 실행.

## 참조 (필요 시 Read)
- 재현 루프 구축법 11종·tight 4기준 → `${FORGE_ROOT:-$HOME/forge}/.claude/rules-on-demand/bug-feedback-loop.md` (red-capable 명령 전 가설 금지, 가설 3~5개 랭킹)
- 11-Category Bug Pattern · 4 디버그 추론 모델 · 다층 boundary 예시 · 합리화 반박표 · Stage 6 템플릿 → `reference.md`
- 단계별 출력 템플릿 → `references/report-template.md`

## Stage 0: RAG 선검색 + 소스 변경 감지
1. 키워드(에러 메시지+모듈+증상)로 `bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/recall-context.sh" --stage investigate --query "<키워드>"`(learnings·RAG·brain, 조회 기록 자동). 결과 없으면 Glob `forge-outputs/01-research/bugs/**/*.md` + `forge-outputs/docs/reviews/**/*.md`.
2. 유사 리포트 발견 → 작성일(YYYY-MM-DD)·관련 파일 추출(없으면 `-- .`) →
   `git -C "{프로젝트 루트}" log --since="{YYYY-MM-DD}T00:00:00+09:00" --oneline -- {관련 파일들}`
   - git 실패 → 기존 해결책 참고 후 Stage 1 · 커밋 0 → 기존 해결책 제시 후 Human 확인 · 커밋 N → 참고만, Stage 1
3. 없음 → "기존 케이스 없음" 후 Stage 1.

**Stage 0.5**: 증상을 11-Category 카탈로그에 매핑해 1~2개 특정 후 Stage 1.

## Stage 1: 조사
- GitNexus(인덱스된 프로젝트): `mcp__gitnexus__list_repos`(7일+ stale 경고) → `mcp__gitnexus__query({query:"{에러_키워드} {모듈명}"})` → `mcp__gitnexus__context({name:"{의심_함수}"})`. 없으면 grep 폴백.
- `.claude/reference/codebase-analysis.md` 있으면 Read.
- 수집: 로그/스택 · Grep/Read · git log · 재현 시도. 증상 기록 = `report-template.md §Stage 1`.
- UI 버그: `mcp__claude-in-chrome` 스크린샷 → `docs/bug_report/screenshots/{BUG-ID}-red-before.png` (healer Vision evaluator 입력 — 필수).
- API 응답: body 를 `docs/bug_report/artifacts/{BUG-ID}-api-response.json` 저장("데이터 없음" vs 버그 구분).
- 과거 버그 검색(필수):
```bash
LEARN_BY=investigate bash ~/.claude/scripts/learnings.sh load bug-fix-pattern 2>/dev/null
```
  + `rag-search("{project} {증상 키워드}")` → 있으면 "관련 과거 버그" 섹션.
- 다층 시스템: 각 컴포넌트 경계에 입출력·설정·상태 로깅 → 1회 실행으로 깨진 경계 식별 → 그 레이어만 Stage 2.

## Stage 2: 분석
- 먼저 working example(정상 경로)과 실패 경로를 줄 단위 대조 → 차이 ≤3개로 좁힘(없으면 미완료).
- red-flag(증거 없는 단정·이전 패턴 유추·재현 없이 고침·단순 코드 과신·긴급·단일 파일 한정·테스트 통과=무관) 시 멈추고 근거 수집.
- 방법: 5 Whys · git diff/log · 역추적 5-step(증상→직접원인→caller→최대 5 depth→최초 주입점; 미발견 시 시스템 경계 의심) · learnings/Memory 검색.
- 가설 2개+ (1개면 의심). 템플릿 = `report-template.md §Stage 2`.

## Stage 3: 가설 검증 — 가능성 높은 순으로 최소 재현 코드·로그 삽입·테스트·설정 변경으로 검증. 템플릿 `§Stage 3`.
- (선택) 가설 3개+ 이고 검증 비용 클 때 advisor 우선순위 조언(`subagent_type="advisor-strategist"` — 리졸버 규약은 전역 규칙).

## 조사 완료 선언 ([STOP] human gate 직전)
| 상태 | 조건 |
|---|---|
| DONE | 가설 검증 PASS + 재현 명령 FAIL 확인 |
| DONE_WITH_CONCERNS | 검증 PASS + 경고 명시 |
| BLOCKED | 3-fix 에스컬레이션 도달 또는 재현 불가 |
```
조사 완료 상태: DONE | DONE_WITH_CONCERNS | BLOCKED
근본 원인: <1줄>
확인 명령: <재현 명령>
다음 단계: <healer 위임 | 추가 정보 요청 | 에스컬레이션>
```

## Stage 4: 재현 테스트 (Prove-It) — Stage 3 검증 없이 진입 금지. 재현 테스트 작성 → 실행 → **반드시 FAIL** 확인(PASS면 테스트 무효) 후에만 Stage 5. 템플릿 `§Stage 4`.
- **blast-radius 게이트**: 수정 예상 >5 파일이면 중단 — Human 범위 확인 또는 scope 축소.

## Stage 5: 수정 (템플릿 `§Stage 5`) — 수정 후 재현 테스트 PASS + 기존 테스트 전체 PASS.
- **3-fix 에스컬레이션**: 재진입마다 attempt+1. 3+ → 즉시 STOP, Stage 2 가설 전면 재검토 + architecture proposal, Human 승인.
- **토큰 캡**: Stage 진입마다 `INVESTIGATE_TOKEN_CAP`(기본 300000) 추정 도달 시 `[STOP] INVESTIGATE_TOKEN_CAP={cap} 도달. Stage {N} 진입 취소.` + 증거·가설·마지막 결과 반환. (추정은 보조, 결정론 bound = max-cycles)
- **oscillation 가드**: 연속 2회 "## 근본 원인" 1줄(소문자, 앞 120자) 동일 + 테스트 FAIL → `[OSCILLATION]`, Stage 2 재진입 금지, STATUS: BLOCKED, handover 에 경위+마지막 근본 원인 기록. 3-fix 와 독립(attempt 2 에서도 발화).

## Stage 6: 버그 로그 저장 (Stage 5 후 필수)
- `forge-outputs/01-research/bugs/{project}/{YYYY-MM-DD}-{slug}.md` (템플릿 `reference.md §Stage 6`) — rag-search 인덱싱 대상.
```bash
bash ~/.claude/scripts/learnings.sh append --category bug-fix-pattern \
  --summary "<증상 1줄>" --trigger "<재현 조건 1줄>" \
  --apply "<근본 원인 + 수정 패턴 1줄>" \
  --evidence "01-research/bugs/{project}/{YYYY-MM-DD}-{slug}.md"
```
  exit 0 → `📌 learnings 신규: <id>` · 2(secret) → `⚠️ bug-fix-pattern learning 억제 — <패턴명>, 내용 비노출` · 3 → 1줄 압축 재시도 · 4 → 보고에 1줄 노출. 각 필드 1줄.
```bash
REPO=$(basename "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || echo unknown)
[ "$REPO" != unknown ] && \
  OPENAI_API_KEY="" timeout 180 bash ~/forge/shared/scripts/rag/rag-exec.sh project_knowledge_sync.py --project "$REPO" >/dev/null 2>&1 || true
```

**Stage 7 — Codex bugfix 리뷰** (권고, 자동은 `CODEX_REVIEW_AUTO_STAGES` 에 `bugfix`|`all` 일 때만): `/codex-review --stage bugfix --target <patch file or PR-N>` — 우회 패치·회귀·재현 적정성·부작용. blocking 아님(WARN/FAIL → 사용자 컨펌). 결과 `forge-outputs/docs/reviews/bugfix/{date}-{slug}.{md,json}`. 실패 시 [[pev-self-correction]].

## 최종 상태 선언
```
[investigate] STATUS: DONE | 근본 원인: <1줄> | 수정 커밋: <hash>
[investigate] STATUS: DONE_WITH_CONCERNS | 사유: <Codex WARN 항목 / 임시 패치 이유>
[investigate] STATUS: BLOCKED | 사유: <Human gate 필요 이유> | 권고: <다음 액션>
```
DONE = Stage 5 성공(재현 테스트 PASS) + Stage 6 저장 완료 / DONE_WITH_CONCERNS = Codex WARN·blast-radius 5↑·임시 패치 / BLOCKED = Stage 4 [STOP]·3회 실패·설계 개입. 둘 다 handover `§발견한 이슈` 기록.
