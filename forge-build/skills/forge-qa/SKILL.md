---
name: forge-qa
description: "QA 전 사이클(시나리오→버그→수정→재검증) — 구현 후 E2E 에 사용한다."
argument-hint: "[--mode full|smoke] [--app <id|all>] [--domains <id[,id...]|all>] [--accounts <id[,id...]>] [--exhaustive]"
model: sonnet
---

> **쓰기 모드 전용**: Plan mode 감지 시 즉시 [STOP] — "Escape로 plan mode 해제 후 재실행하세요. 내부 [STOP] 게이트가 승인 지점입니다."
>
> **진입**: 흐름 `P5 구현 → /forge-qa (P6) → /forge-pr (P7)`. 아래 `## Step 0.1`~`## Check 8.7P`(이 파일 끝쪽)를 먼저 돈 뒤 Phase A 로 간다 — 옛 커맨드 forge-qa 를 합쳤다(#3738).
>
> **보조 파일**: `reference.md`·`scripts/`·`workflow.js`·`MVP-CONTRACT.md`·`eval_cases.jsonl` 은 옛 폴더 `.claude/skills/qa/` 에 그대로 있다 — 이 본문의 상대 경로는 그 폴더 기준이다.

**역할**: QA 오케스트레이터. Phase A~H 를 메인 컨텍스트에서 순서대로 실행. 시나리오 출처 = Spec FR(없으면 legacy 동작) — **코드 역산 금지**. qa = 발견 전용, 수정·검수는 Lane A(`/forge-fix`) 위임. 교차 검수는 `/forge-pr` cr-final 한 번뿐(qa 가 Codex 를 직접 부르지 않는다).
**트리거**: P5 Check P5.7-X PASS 후 자동 또는 `/qa`. **출력**: `docs/qa/YYYY-MM-DD-final-qa-report.md` + `docs/qa/baseline.json` + PR(develop 자동 머지).
**원칙**: 서브에이전트 1레벨만(중첩 금지) · DB 변이 테스트 = 트랜잭션 롤백 or 매 사이클 seed 재주입 · **소스 Read 로 동작 추론 금지** — 실행·화면·로그·HTTP 응답으로만 판정(코드 리뷰는 `/code-review`).

## 사용법
```
/qa [--scope=full|<domain>|"<glob>"] [--spec auth.md] [--cycle 1] [--diff-aware]
/qa --migration --legacy http://HOST:PORT     # 패리티 모드
/qa --mode=uat --scope={domain}               # B~D 스킵, docs/qa/uat-scenarios.md 필요, uat-tracking.md 누적, 첫 진입 시 --cycle 1 smoke 선행
/forge-qa --app=all|<id> --domains=all|<id,..> --accounts=<id,..> --exhaustive   # 4축(전부 optional)
```
- 단일 알려진 버그 = `/forge-fix "<버그>"`. workflow 인자 `mode=hotfix` 는 Phase B(시나리오)·C(발견)를 건너뛰고 한 번만 돈다(단일 파일 가드 → `reference.md §Hotfix 상세`). `--cr` 는 받아도 무시(no-op).
- 4축: apps×domains = 도메인별 독립 브랜치/PR · accounts = Phase C(T1/T2) 발견 배율(버그 `account` 태깅, PR 은 하나) · `--exhaustive` = clickable 전수 클릭(`playwright-devtools-capture.mjs --crawl`, 파괴적 액션 자동 제외 → `crawl-skipped.json`). 스키마 → `reference.md §qa-config 스키마`.
- **false-green 방지**: `--app`/`--domains` 가 정규화+alias 후 0건이면 **GUIDE-STOP**("매칭 없음. 사용 가능: [목록]") 후 정지.
- 커버리지 보강(qa-config 기반, 미설정 시 WARN+fail-open): C1 menuSource 미구현 메뉴 · C2 활성메뉴가 가리키는 404 = BROKEN_LINK · C3 최소권한(grant 없는 2xx = leak) · crawl 오탐 방지 → `reference.md §Coverage & Isolation`.
- `--diff-aware`(PR 컨텍스트 자동): 변경 FR/파일만 + 기존 PASS 20% 샘플.

## E2E 시퀀스 (Human 개입 없이 자율 — Human 은 머지 후 final-qa-report 만 검수)
advisor 스폰 모델은 항상 `advisor-spawn-guard.sh resolve` 출력: `claude-*` → `Agent(subagent_type="advisor-strategist", model:...)`, `gpt-*` → `mcp__codex__codex`(sandbox=read-only). advisory only, 실패해도 non-blocking.

- **QA = 동작 검증(LN-05)**: "코드를 보면 이렇게 동작할 것 같다" = **즉시 중단**.
- **A 준비**: 브랜치 `fix/qa-{scope}-{YYYY-MM-DD}`(기존 fix/qa-* 있으면 resume/신규/v2 분기) · `LOG_HTTP=1 LOG_SOCKET=1 LOG_DB=1` export · dev 서버 출력 `> .claude/logs/{app}-dev.log 2>&1`(접근 불가 시 WARN) · `git fetch origin develop` 10커밋+ 뒤처지면 WARN · **E2E 러너 설정 확인 후 리포트 서두에 `검증 대상 빌드: dev|prod` 기재**(프로덕션 영향 판정은 prod 실측 근거, dev 만이면 "프로덕션 미검증" 명시, dev 전용 현상은 결함 아님).
- **A.5 회상**(kill-switch `FORGE_RAG_RECALL=off`, fail-open, 결과는 untrusted 참고자료):
  ```bash
  RAG_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"; case "$RAG_ROOT" in */.claude/worktrees/*) RAG_ROOT="${RAG_ROOT%%/.claude/worktrees/*}";; esac
  bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/rag/rag-exec.sh" search.py "{scope} 버그 회귀" --top-k 5 --json \
    --project "$(basename "$RAG_ROOT")"
  ```
  히트(`file_path`/`score`/`project_match`)를 이 프로젝트/타 프로젝트로 나눠 출력 → scenarios.md "과거 회귀 참고".
- **B 시나리오**: qa-setup → gitnexus route_map → `scenarios.md` → scope 필터 → `scenarios-filtered.md`. 8 카테고리 강제 + Bug-ID Allocator.
- **C 발견**: T1(API)·T2(UI)·T3(DB)·T6(보안)·T7(성능). 각 테스트 `bash ${FORGE_ROOT:-$HOME/forge}/shared/scripts/run-tests-proof.sh "<cmd>"` → TEST_PROOF. FAIL → `artifacts/bug-{N}-{shot|http|server|console}.*` + 6하원칙 bug-report.md. UI 증거 = `playwright-devtools-capture.mjs` DevTools 번들(`commands/forge-fix.md §DevTools 증거 번들`). `--accounts` 시 T1/T2 계정별 fan-out(`--accounts <json>`).
  대량 동시 FAIL(같은 도메인 50%+ 또는 5건+) → 개별 파일링 전 advisor(Q2) "구조적 단일결함 vs 개별버그" 자문, 단일결함이면 1건으로 수렴.
- **C.5 Spec↔Code 판별**(FR 불일치 FAIL 마다): 먼저 `${spec_file%.md}.impl-notes.md` 있으면 읽기(글롭 금지), 그다음
  `bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/spec-code-discriminate.sh" <spec_file> <impl_files>`
  - `IMPL_GAP` → D~F 위임 · `SPEC_STALE_CANDIDATE`/`AMBIGUOUS`/판별 실패 → Reconciliation: advisor 자문 → **[STOP]** Human 2택("스펙 노후 확정" → .spec.md FR 갱신·시나리오 재생성·재검증 / "코드 버그 확정" → D~F). AI 자동 B 확정 금지.
- **D~F 수정·검수 = `/forge-fix` Lane A 위임**: 버그마다 `docs/qa/{date}-bug-fix-plan.md` 와 함께 ①조사·재현(RED, 게이트 R) ②리포트 ③수정(healer a1~a3, a3 = 테스트·린트·빌드 기계 확인 — FAIL 이면 고치고 테스트로 확인하며 검수자를 다시 부르지 않는다) ④검수(GREEN, 게이트 G, 실브라우저·실DB). UI 버그 = Vision evaluator + pixel-diff-gate + forge-check-ui. 복잡도·개수 라우팅(2~9 Teams, 10+ Workflow, 충돌 순차)은 `agents/healer.md` 머리의 "스폰 라우팅" 줄. PGE 로 보내지 않는다. UAT 모드는 Lane A 수정 비활성. **전 버그 게이트 G PASS 시에만 G 진입.**
- **G 머지 = `/forge-pr` 경유**(base=develop, head=fix/qa-{scope}-{date}) — `gh pr create`/`gh pr merge` 직접 호출 금지. 보조: `bash scripts/ci-wait.sh {branch}`(15분). 후 `git checkout develop && git pull && git worktree prune`.
- **H 정리**: learnings.jsonl append · wiki-sync(background, Human 승인) · `docs/qa/intervention-log.jsonl`(override 시) · `docs/qa/metrics.jsonl` {date, scope, bugs_found, bugs_fixed, cycles, mttr_min, regression_count} · final-qa-report · `git worktree prune` · `$HOME/.claude/worktrees/qa-*` 7일+ 삭제.

### 자동 머지 전제 (7개 전부 → `/forge-pr` 원장 rc=0)
버그별 a3 기계 확인 통과 · 버그별 RED→GREEN TEST_PROOF + 게이트 G · `/forge-pr` cr-final rc=0 · 보안 CRITICAL 0 · 회귀 0(baseline) · CI PASS · 전 시나리오 PASS.

### Iron Laws
- main 직접 머지 X(develop 만 자동) · test PASS 주장 = TEST_PROOF hash + `TYPE=unit|integration|e2e` + `UNCOVERED=<미검증 1줄|없음>`(WARN if absent).
- 각 Bug-ID 수정 전 Verify-RED(올바른 이유로 FAIL) → 수정 후 Verify-GREEN + 회귀 전체 PASS. G 진입 전 전 Bug-ID 완료.
- 회귀 감지 / same-issue 3회 / 6사이클 초과 → **[STOP]** (판정 SSoT `.claude/skills/forge-loop-maker/scripts/loop-kernel.js`, healer 가 판정 — `agents/healer.md §전역 가드`; qa 는 재구현 X).
- 보안 CRITICAL → **[STOP]** + Human 알림 · Lethal Trifecta(미신뢰 입력 + DB write + 코드쓰기) → **[STOP]**.
- Spec-Stale 자동확정 금지 — B후보·AMBIGUOUS 는 Reconciliation + Human [STOP].
## Phase Gate — 시점마다 손으로 확인한다(기계 집행 없음)
| Gate | 시점 | 확인할 것 |
|---|---|---|
| `phase-a-to-b` | A→B | scenarios.md 가 있다 |
| `phase-b-entry` | B 시작 | 8 카테고리를 다 덮는다 |
| `phase-e-entry` | healer 스폰 직전 | Why_hypothesis 가 있다 |
| `phase-e-a4-ui` | a4 완료(UI) | 6장 · 픽셀 diff ≤1%(`pixel-diff-gate.sh`) · vision PASS |
| `phase-e-a4-backend` | a4 완료(API/DB) | 3종 로그가 있다 |
| `phase-f-entry` | F 직전 | Why_root_cause 가 적혔다 |

## Phase B — 8 카테고리
| # | 카테고리 | 병렬 |
|---|---|---|
| 1·2·3·8 | Happy / Boundary / Negative / A11y | 병렬 |
| 4·6 | Error / Concurrency | worktree 격리 + 병렬 |
| 5·7 | State Transition / Security | 직렬 |
- 표기: `카테고리: N` 또는 `### 카테고리 N: <이름>`. 면제: `면제 카테고리: [N] / 사유: <1줄>`. **3건+ 동시 면제 = [STOP]** — 발동 전 advisor(Q1) 커버리지 축소 리스크 자문, 응답을 [STOP] 보고에 포함.
- schema·병렬 코드 → `reference.md §Phase B 상세`.

## Health Score Rubric (100점, 70 미만 FAIL, 기능성 즉시 FAIL 은 총점 무관)
| 축 | 가중 | FAIL 기준 |
|---|:-:|---|
| 기능성 | 25 | FR 미충족 1건 → 즉시 FAIL |
| 성능 | 15 | P95 > 기준 2× · CLS/INP 불량 |
| 보안 | 15 | CRITICAL 1건 |
| 접근성 | 10 | WCAG AA/2.2 위반(Focus Not Obscured·Target ≥24px·Dragging) |
| UX/UI | 10 | 디자인 시스템(`DESIGN.md` 있으면 그것) 이탈 3건+ |
| 에러 처리 | 10 | 미처리 예외·빈 에러 메시지 |
| 모바일 | 10 | 360×800 / 390×844 깨짐 |
| 문서 | 5 | 주요 변경 미반영 |
- 요소 존재/활성/role 판정 = a11y-tree 결정론 확인(Vision X) · 외관 = pixel-diff/Vision · 점수는 proxy(점수 최적화 금지). Framework 추가 점검: Next.js 하이드레이션·404/500 / NestJS Swagger·DTO / Unity 60fps·메모리 / FastAPI 스키마.
- 증거: Tier1 스크린샷·로그·HTTP(필수) / Tier2 재현 명령.
- **판정은 스크립트로**: `python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/rubric-weighted-score.py" --file <축점수.json>` → rc 0 PASS · 1 FAIL · 2 UNDECIDED(통과 아님). JSON `{"threshold":70,"axes":[{"name","weight","score"}]}`, 미응답 축 = `{"state":"missing","reason":...}`(0점 아님), 즉시 FAIL 축 = `"immediate_fail": true`. FAIL → Cycle 2 재작업.

## 산출물·통합
- `docs/qa/YYYY-MM-DD-{spec-name}-qa-report.md`: 시나리오 수 · PASS/FAIL · Rubric 점수 · 이슈+수정내역 · 사이클 수.
- Workflow: `Workflow({ script: Bash("cat $HOME/.claude/skills/qa/workflow.js"), args: { scope, mode } })` (`CLAUDE_CODE_DISABLE_WORKFLOWS=1` → 메인 컨텍스트 fallback).
- 시나리오 검수는 수동 전용(`/forge-test-review`). 산출물 저장 후 `/eval-rubric --target {산출물}` → `$HOME/.claude/skills/qa/eval_cases.jsonl`(비활성 `EVAL_RUBRIC_AUTO=off`).
- 상세 → `${FORGE_ROOT:-$HOME/forge}/.claude/skills/qa/reference.md`

## Step 0.1 — 라우팅 승격 게이트 (WARN 전용, 비차단)
```bash
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/harness-escalation-check.sh" \
  --cmd forge-qa --fr <시나리오·FR 수> --files <대상 파일 수> --domains <도메인 수>
```
권고가 나오면 `forge-core.md §병렬 실행` 라우팅 4분법으로 레인을 정하고 **반드시 1줄 기록**한다:
```bash
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/harness-escalation-check.sh" \
  decision --rec-id <권고에 찍힌 rec_id> --decision <wave|teams|workflow|main>
```
끄기 `FORGE_ESCALATION_GATE=off` · 스크립트 부재·실패는 무시(fail-open).

**`--decision workflow` 일 때** — 여기서 정하고, 호출은 `## Phase 0` 통과 **후**다(`qa/workflow.js` 는 healer 수정·PR·머지까지 가므로 Readiness 전 호출 금지). 호출 직전 Phase 0 4요소가 전부 ok 가 아니면 **[STOP]**.
```
Workflow({ script: Bash("cat $HOME/.claude/skills/qa/workflow.js"),
           args: { scope, mode, crMode, app, domains, accounts, exhaustive, loopUntilDry, dryK, prLanes } })
```
- 인자는 전부 optional — `app`·`domains`·`accounts`·`exhaustive` 모두 없으면 기존 단일-scope 순차 경로.
- 반환 `status` 가 계약이다:

  | status | 의미 | 호출측 행동 |
  |---|---|---|
  | `PASS` / `MERGED` / `MATRIX_DONE` | 버그 0 / 수정 PR 머지 / 전 조합 완료 | 다음 Phase 진행 |
  | `PR_OPEN` | PR 만 열림(미머지) | **[STOP]** — 머지는 사람이 |
  | `MATRIX_PARTIAL` | 일부 조합 실패 | **[STOP]** — 실패 조합을 먼저 본다 |
  | 필드 부재 | 레그 사망 | **[STOP]** — PASS 로 읽지 않는다(fail-closed) |

- 승격 안 할 때(`main|wave|teams`·권고 없음)는 아래 단일 패스 그대로.
- ⚠️ `allowedTools` 에 `Workflow` 가 없는 방에서는 도구 거부인데 종료코드 0 — 조용히 아무 일도 안 일어난다.

## Step 0.2 — 소관 팀 + 팀 지식 (WARN 전용, 비차단)
```bash
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/team-route.sh" forge-qa
# → OWNER=<slug>[,<slug>...] — 각 slug 의 ${FORGE_OUTPUTS:-$HOME/forge-outputs}/12-team-ops/members/<slug>/wisdom.md 를 착수 전 읽는다
```
- 소관 2팀 이상이면 접수 순서를 정한다(같은 파일 병렬 수정 금지).
- `wisdom.md` 없음·스크립트 실패·`OWNER=none` → **건너뛴다**(fail-open, AD-168). 이 커맨드가 임의로 팀을 고르지 않는다. 판정 근거는 "커맨드 소유"다 — 파일 소유가 아니다.
- 팀장 경유(버스)를 강제하지 않는다 — 필요 판단 시 `forge-session-bus.sh send <slug>`(판단은 사람·총괄 몫).
- 판정 근거는 "커맨드 소유"이지 파일 소유가 아니다.

## Phase 0 — Readiness 판정 (P5 구현 완료 확인)
- 4요소: **구현 코드**(P5 소스 존재) · **시나리오 정의**(스펙·FR 기반 기술 가능 — spec 없는 일은 이슈 본문 `## 확인 방법`과 intent 영향 칸이 원천 · 결과 경로는 PR `## 검증` 의 AC 증거 줄 · #3739) · **서버 기동**(앱 실행 가능) · **QA 스코프**(대상 기능·범위 특정 가능)

- 전부 ok → **PASS**(Phase A 로 진행)
- 구현코드·서버기동 absent → **GUIDE-STOP**(`forge-qa-readiness-{date}.md` 출력 후 정지). P5(`forge-implement`) 미완료 → "P5 구현 완료 후 재호출"

## Check 8.7P — 성능 정적 검사 (Phase 0 후 · Phase A 전 · WARN 전용)
대상: 변경분에 백엔드(NestJS) 앱 파일이 있을 때만. 없으면 `Check 8.7P: SKIP(백엔드 변경 없음)` 1줄.

1. 기계 축을 **단독 명령**으로(에이전트는 Bash 없음):
   ```bash
   python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/perf-mechanical.py" --root <백엔드 앱 루트> --files <변경 파일...>
   ```
   `<변경 파일...>` = `git diff --name-only --relative=<앱 상대경로> origin/develop...HEAD`(⚠️ `--relative=` 빼면 경로가 겹쳐 조용히 SKIP).
2. stdout JSON(`checkId: "check-8.7P-mechanical"`)을 **원문 그대로** 넣어 스폰:
   ```
   Agent(subagent_type="performance-checker", model="sonnet",
         prompt="<변경 파일 목록>\n\n## 기계 축 판정 JSON\n<위 stdout 원문>")
   ```
   기계 축(`no-max-length`·`no-perf-assertion`)은 에이전트가 다시 보지 않는다(`agents/performance-checker.md §입력`). 스크립트 실패(rc≠0·JSON 불가) → JSON 없이 스폰(fail-open).
3. 결과(`PASS|CONDITIONAL|FAIL`)를 QA 리포트와 `/forge-pr` PR 본문에 그대로 옮긴다. 막지 않는다(WARN 전용).

## 실행
```
/forge-qa              # 기본 full 모드
/forge-qa --mode smoke # 연기 테스트만
/forge-qa --app=opstool --domains=all --accounts=admin,partner --exhaustive   # 확장 4축 예
```
- 확장 4축(전부 optional): `--app` → `--domains` → `--accounts` → `--exhaustive`. 전부 미지정 = 기존 동작. 단일레포는 `--app` 불요(CWD 자동감지).
- `--app`/`--domains` 는 조합마다 독립 브랜치·PR 로 병렬 fan-out · `--accounts` 는 도메인 안 T1/T2 계정별 추가 실행(별도 PR 없음).
- `--app`/`--domains` 매칭 0건 → GUIDE-STOP("매칭 없음. 사용 가능: [목록]").
- 실DB 검증·healer 자동수정은 항상 내장. `--project` 없음 — CWD → forge-workspace.json 매핑.
- qa-config 스키마 → `${FORGE_ROOT:-$HOME/forge}/.claude/skills/qa/reference.md §qa-config 스키마`.

## 전역 캡 (변경 금지)
| 캡 | 한도 | 동작 |
|----|------|------|
| 사이클 캡 | 6 사이클 | 초과 시 즉시 STOP + Human 에스컬레이션 |
| same-issue 캡 | 동일 이슈 3회 | 즉시 STOP |
| 회귀 감지 | 기존 통과 케이스 깨짐 | 즉시 STOP |

## 내부 흐름
1. Phase A~H(전역 캡 적용) → 2. E2E 검증 → 3. 결과 집계 PASS/FAIL
4. FAIL: healer 에이전트 연계 또는 [STOP] Human 에스컬레이션 · 5. PASS: `/forge-pr` 진입 허용
