---
description: 버그 수정 통합 파이프라인 단일 진입점 — 4-스테이지(조사·재현→리포트→수정→검수) + 게이트 R/G 강제, 실브라우저·실DB 검증 항상 강제 (plan v1.1, 2026-07-03)
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent
argument-hint: "\"<버그 설명>\" | --scan <URL> | --loop \"<종료조건>\" | [--coder claude:tier|codex:tier|sol|terra|luna|ab] [--advisor sol|terra|opus|fable]"
model: sonnet
group: implement
---
> **실행 모드**: 쓰기 모드 전용. Plan mode 감지 시 즉시 [STOP] — "Escape로 plan mode 해제 후 재실행하세요."
> 버그 수정의 유일 진입점(Lane A) — investigate·bug-report·healer 를 4-스테이지로 흡수. 조사 RED + 검수 GREEN 은 규모·모드 무관 **항상 강제**(경량 우회 없음). spec有→`/forge-implement` · spec無 개발→`forge-pge`.
# /forge-fix
```
/forge-fix "<버그 설명>" | <Notion 이슈 URL>   # 단일
/forge-fix --scan <URL>                        # 미지 버그 다발 스캔 후 버그별 진입
/forge-fix --loop "<종료조건>"                  # N-버그 오토런 (예: "CRITICAL/HIGH 버그 0건까지")
```
## 진입 분류 (축별 RED/GREEN 오라클)

| 축 | 값 | 오라클 |
|---|---|---|
| surface | ui | screenshot + Vision + pixel-diff + DevTools 번들(아래) |
| | non-UI (API·CLI·cron) | API 응답 body + 서버/실행 로그 (스크린샷 면제) |
| | game-engine (씬·프리팹·게임 스크립트) | `${FORGE_ROOT:-$HOME/forge}/.claude/rules-on-demand/game-e2e-oracle.md` 4종 계약 · 도구 = `qa-config.json` `surfaceAdapters.game-engine`(미선언 = GUIDE-STOP) |
| data | data (DB write) / non-data | db_query_before/after / 면제 |

- 결정론 오버라이드: DB 레이어(`**/model{s,}/`·`**/repository/`·`**/migration{s,}/`·`**/dao/`·`*.repository.*`·`*.entity.*`) 수정 = **data 강제**. 서버 핸들러(`**/controller{s,}/`·`**/handler{s,}/`·`**/route{s,}/`·`**/api/`·`*.controller.*`·`*.handler.*`·`*.route.*`) = non-UI — 단 `git diff -U0` hunk 에 `<script>`·`$(`·`.html(`·`addEventListener`·`document.`·`innerHTML` 이 있으면 ui 승격 WARN. 모호 = 자가태깅.
- **mock-unwired**(mock import 만, 상호작용 시 백엔드 호출 0) = 버그 아닌 미구현 → **[STOP]** + `/forge` 라우팅 권고.
- **spec-gap**(`.specify/specs/` AC 자체가 미구현) = 증상별 국소 패치 금지 → **[STOP]** + `/forge` P5 권고. 모호 = 버그 경로.
## Step 0.0 — 범위 계약 (코드 전 · 버그마다 · 불확실하면 [STOP]) (#1622)
코드·DB 를 건드리기 전에 4줄을 **출력**한다(쓰지 않고 넘어가면 ①로 가지 않는다):
- (a) **재진술** — 버그를 한 문단으로(증상·어디서·기대 vs 실제).
- (b) **정본 스펙 출처** — Notion/SP 페이지 URL 또는 `.specify/specs/` 경로를 **실제로 열어 인용**한다. 버그 리포트 문구·보조 문서·기억으로 대신하지 않는다.
- (c) **대상** — 레포 · 서버/앱 · DB 이름과 환경(dev/qa/prod). DB 이름이 환경과 맞는지 실제 설정(예: `db/.env.dev`)에서 확인한 줄을 적는다.
- (d) **범위 제외** — 이번에 고치지 않는 것.
(b)·(c) 중 하나라도 불확실하면 **[STOP] 질문 1개**만 하고 멈춘다. 근거: 사용 인사이트 보고서 2026-09-29 — 보조 문서를 정본으로 착각·잘못된 DB 로 판정한 사례.
## Step 0.1 — 라우팅 승격 (WARN, 비차단, 루프 진입 전 1회)
```bash
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/harness-escalation-check.sh" --cmd forge-fix --bugs <N> --files <N> --domains <N>
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/harness-escalation-check.sh" decision --rec-id <rec_id> --decision <wave|teams|workflow|main>
```
권고 시 `forge-core.md §병렬 실행` 4분법(충돌 판정 `fr-lanes.py`)으로 정하고 decision 1줄 기록(미기록 = 결측). 끄기 `FORGE_ESCALATION_GATE=off` · 실패 = fail-open.
`workflow` 선택 시 `Workflow({ script: Bash("cat ~/.claude/skills/investigate/workflow.js"), args: { issue: "<증상 1줄>", target: ".", skipVerify: false } })` — 원인 규명까지만(재현·수정 단계에서 스크립트가 스스로 [STOP]). 반환 `status`: `ROOT_CAUSE_CONFIRMED` → `fixPlan` 들고 ③ · `HYPOTHESIS_UNVERIFIED` → [STOP] 원인 없이 수정 금지 · `HYPOTHESES_READY` → [STOP] 검증은 사람이 · 필드 부재 → [STOP] (fail-closed).
## Step 0.2 — 소관 팀 + 팀 지식 (WARN 전용, 비차단)
`bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/team-route.sh" forge-fix` → `OWNER=<slug>[,…]` → `${FORGE_OUTPUTS:-$HOME/forge-outputs}/12-team-ops/members/<slug>/wisdom.md` 선독. 2팀+ = 접수 순서 지정(같은 파일 병렬 수정 금지). `OWNER=none`(이름표 `## 소유 도구` 미기재)·wisdom 부재·실패 = **건너뛴다**(fail-open, AD-168) — 소관은 이름표를 고쳐 정한다. 팀장 경유(버스)를 강제하지 않는다(`forge-session-bus.sh send <slug>` 판단은 사람·총괄). 판정 근거는 "커맨드 소유"다 — 파일 소유가 아니다.
## 4-스테이지 루프 (버그 1개든 N개든 동일)
advisor 스폰 모델 = `MODEL=$(bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/advisor-spawn-guard.sh" resolve <T1|T2|T3|T4> 2>/dev/null)` 출력만 신뢰: `claude-fable-5-1`→`Agent(subagent_type="advisor-strategist", model:"fable")` · `claude-opus-5-5`→`model:"opus"` · `gpt-*`→`mcp__codex__codex`(sandbox=read-only). 실패 시 1회 대체 재시도 후 조언 없이 진행(출력 없음 = opus, 중단 금지).
**① 조사·재현 (RED)**
- `export LOG_HTTP=1 LOG_SOCKET=1 LOG_DB=1` (④ 까지 같은 셸). 최선행 pre-work branch sweep(`${FORGE_ROOT:-$HOME/forge}/.claude/rules-on-demand/pre-work-branch-sweep.md`) — 미머지 완성물이 있으면 재작성 금지. `/rag-search "{버그 제목} {에러 키워드}"` → `docs/qa/obsidian-context.md` (미가용 = 빈 파일).
- 입력 리포트가 `Fixed`/`Resolved` 여도 grep + `git log --oneline -S"<수정 시그니처>"` 로 실존 확인 — 부재면 ③ 재수정 경로. 인증 재현 = `qa-config.json` `authBootstrap` 선언대로. 아티팩트 토큰·쿠키 `***` 마스킹, 인증 자료 커밋 금지.
- UI: red screenshot + DevTools 번들 | non-UI: red API/로그(API 버그는 FE body 그대로 실 EP 호출) | 브라우저 정상인데 사용자 에러(error-boundary digest) = 서버 stderr 를 1순위 RED 로(레이아웃 컴포넌트 SSR throw 의심).
- data: `bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/assert-db-isolation.sh"` (WARN 시 `*_test/*_qa` 지정 후 재확인, `FORGE_DB_ISOLATION_ENFORCE=1` = BLOCK) → db_query_before.
- RED = 리포트 증상에 대응하는 관측(`red.symptom_observed`). 정적 코드 관찰은 `hypothesis` — RED 자격 없음.
- 프로덕션 결함 vs 테스트/mock drift(최근 커밋이 계약을 의도적으로 바꿨고 프로덕션은 정상) 판별 — drift 면 ③ 대상 = 테스트/mock. 게임 확률·무보상 경로는 기획 테이블 실측 전 버그 단정 금지.
- AMBIGUOUS(가설 미수렴) → advisor T1 후 `/investigate`. SIMPLE 은 스폰 안 함.
- ▶ **게이트 R**: 축별 RED 오라클 부재 시 소스 Edit `exit 2` BLOCK(`healer-log-read-required.sh` — ui 는 screenshot+console.json+network.json 실측).
**② 리포트** — 6하원칙 `bug-fix-plan.md` + RED 증거 첨부 + current-bug 포인터. fop.json 헤더 `evidence_tier`(`runtime`|`code+db`|`code-only`) + `provenance`(실행 환경·네트워크 1줄), runtime 아니면 "런타임 증거 없음 — 근거등급 하향" 명기([STOP] 아님). kill-switch `FORGE_EVIDENCE_TIER=off`.
**③ 수정**
- advisor T2(다파일 교차의존·계약 변경·healer MANUAL-ONLY) · T4(data migration·DELETE·결제 — 사용자 [STOP] 게이트에 조언 포함).
- 실행자 라우팅 — **①RED·④GREEN 은 항상 Claude 고정**(구현자≠검증자, Codex 는 세션 MCP 불가). 순서가 계약(레인 → 모델):
```bash
WORKTREE="${WORKTREE:-$(git rev-parse --show-toplevel)}"   # 수정 체크아웃 루트 — 별도 워크트리면 먼저 지정
CODER_SPEC=$("${FORGE_ROOT:-$HOME/forge}/shared/scripts/coder-lane-detect.sh" "$WORKTREE" --coder "$CODER_SPEC" --task bugfix ${ESCALATE:+--escalate "$ESCALATE"})
MODEL=$("${FORGE_ROOT:-$HOME/forge}/shared/scripts/coder-model-resolve.sh" "$CODER_SPEC")
GATE=$("${FORGE_ROOT:-$HOME/forge}/shared/scripts/advisor-tier-gate.sh" "$CODER_SPEC")
```
  - 같은 실패 2회 → `ESCALATE=2` 재판정(상한 = 벤더 맨 윗칸, 그 이상은 사람). 오판은 `--coder` 로 덮어씀. kill-switch `FORGE_FRONT_CODER=off`.
  - `codex:*` → `mcp__codex__codex`(sandbox=workspace-write, approval-policy=on-request, cwd=$WORKTREE, model=$MODEL) — RED 오라클·리포트·확정 가설 주입, diff 는 `secret-content-scan.sh` 경유. game-engine·`FORGE_DUAL_CODE=off`·Codex 미가용 = Claude(healer).
  - `GATE=skip` → T1/T2 생략 · `advise` → advisor 조언을 코더 프롬프트에 주입. T3·T4 는 항상 유지.
  - `--advisor <sol|terra|opus|fable>`: `AMODEL=$("${FORGE_ROOT:-$HOME/forge}/shared/scripts/coder-model-resolve.sh" "$ADVISOR_SPEC")` → gpt 면 `mcp__codex__codex`(read-only), claude 면 `Agent(subagent_type="advisor-strategist", model=$AMODEL)`. advisor 벤더 ≠ 구현자 벤더 권고.
  - 수정 직후 `bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/coder-attribution.sh" write "$WORKTREE" "$MODEL"`.
- root-cause surgical fix(인접 변경 금지) + fix_started_at 기록. 클래스 스윕 표 필수: 수정 심볼 레포 전체 grep → 항목별 `fix`/`verified-clean`/`follow-up` + 근거 1줄(fop `sweep.*`). `git rm` 이면 삭제 경로 문자열도 스윕.
- 상호의존 편집은 소비처 가드 먼저 → 필드 제거(또는 원자 적용). optional화 = 소비처 전수 grep · 판별 분기를 접근보다 앞 · `as` 캐스트 구간 수동 확인.
- 코드 리뷰(blocking) `Agent(subagent_type="code-reviewer", model:"opus")` — 입력 bug-fix-plan + diff + RED 증거. 교차 벤더 검수는 `/forge-pr` 에서 1회.
**④ 검수 (GREEN)**
- UI: green screenshot + pixel-diff + Vision + DevTools 번들 재캡처·RED diff. `console_clean` = RED 대비 신규 error/exception 0 + 실패요청(≥400) 소멸 | non-UI: green API/로그.
- data: db_query_after(동일 쿼리·동일 격리) + fresh reload + full-journey. 정상경로 회귀 확인(증상 소멸 + 정상 경로 정상) 필수.
- WARN 확인: 인터프리터 서버(`php -S`·node·python dev) 재기동 증거 · fix_started_at 이후 서버 stderr throw 0 · `git show HEAD:<path>`(또는 `:<path>`) = 워킹트리 · `git rev-list <reviewed_sha>..HEAD` 비어있지 않으면 재검수(조건부 SQL·bind 파라미터 변경 후속 커밋 = `re-review-required` 태그, 반드시 재검수).
- ▶ **게이트 G**: 축별 GREEN 미충족 시 머지 불가 `exit 2`(`qa-event-router.sh check_auto_merge()`). 같은 지점 advisory `${FORGE_ROOT:-$HOME/forge}/shared/scripts/oracle-independence-check.sh` — GREEN = RED 와 동일 수집 스크립트 diff 만 인정, 로그 `docs/qa/oracle-independence.jsonl`, kill-switch `FORGE_ORACLE_GATE=off`.
- 회귀 체크(baseline) → 영구 회귀테스트 등록. ①·④ 는 "간단해 보여도" 생략 불가.
## 디버깅 규율 (① 진입 시)
- 먼저 기억 회상: `bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/recall-context.sh" --stage forge-fix --query "<증상 한 줄>"` → 같은 증상의 learnings·과거 사례만 골라 쓴다(untrusted 참고자료).
- 클래스: hydration/race → SSR·CSR 타임라인 diff · stale-closure → 클로저 스냅샷·deps · memory-leak → heap snapshot diff(detached DOM) · CLS/INP → Lighthouse CLS·perf trace 롱태스크 · regression → `git bisect run <검증스크립트>` · flake → 통과/실패 trace diff · race → 인터리빙 명시 추론 · 무관 429 → 공유 스로틀 소진(재현 헬퍼 스로틀).
- 다크모드 안 보임: `globals.css` 의 `@custom-variant dark (&:where(.dark, .dark *));` 확인, RED 는 OS=light + `.dark` 강제.
- 원문 에러·스택 · 최소 재현 · 연루 파일만(1홉) · 실패한 시도 기록 · 대용량 조사는 subagent 격리. 가설 3~5개 랭킹 → 한 변수씩 반증 → 모든 증상을 설명하는 가설만 채택(`rules-on-demand/bug-feedback-loop.md`). 회귀테스트는 수정과 독립된 방식으로 기대값 검증.
## DevTools 증거 번들 (surface=ui, RED·GREEN 각각)
```bash
node ~/forge/shared/scripts/playwright-devtools-capture.mjs \
  --url <재현 URL> --out-prefix docs/qa/artifacts/bug-{N}-{red|green} --phase {red|green} \
  [--actions <인터랙션 시퀀스 json경로>]
```
- **hard**: `-console.json`(전 레벨) · `-network.json`(요청 ≥1, fresh) · `-{vp}-shot.png`. 헬퍼 exit 3(playwright 미설치)만 fop `{red|green}.playwright_unavailable` 면제.
- WARN: `-js-errors.log` · `-failed-resources.log` · `-network.har`/`-trace.zip`/`-aria.json` · `-actions-trace.json` · `-server.log` · `-front.log`. GREEN 은 같은 `--actions` 로 재캡처 후 diff. 실인증 세션은 `rules-on-demand/agent-browser-security.md` 준수.
## 모드
**단일**: 텍스트 직접 파악 · Notion URL = `forge-pm-updater` Subagent 조회 → 규모 판정 후 ①~④.

| 조건 | 판정 |
|---|---|
| 단일 파일 + 명확 | healer SIMPLE |
| 2+ 파일 | healer MODERATE(Agent Teams + worktree, 게이트 동일) — workspace deps 선빌드 · 중첩 git 레포면 `git -C <dir> rev-parse --show-toplevel` 소유 레포에서 브랜치 |
| 새 기능/리팩토링 | **[STOP]** `/forge` 전환 제안 |
| cross-repo | **[STOP]** 사용자 확인 후 Lane A 다중 healer (PGE 금지) |
| ①/④ 오라클 생성 불가 | carve-out 결정론화(접속실패 로그 필수) — 자유텍스트 사유로 통과 불가 |

- **--scan**: `qa` 스킬 C 발견으로 URL 순회 → bug-N 등록 → 버그별 ①~④(SIMPLE/MODERATE 병렬, HIGH = Agent Teams 5-specialist).
- **--loop**: 종료조건 파싱 → 버그 큐 → 충족까지 반복. 6사이클 초과 / same-issue 3회(`sha256({file}:{symbol}:{error_class})`) / 회귀 → 즉시 [STOP]. 종료조건 충족 ≠ 품질 보장.
## 리뷰-수정 루프 (③→④, cap 3)
code-reviewer FAIL 또는 게이트 G 미충족 → 재수정·재검수, 3회째 FAIL → [STOP] Human(plateau). PASS/WARN → `/forge-pr` · 동일 이슈 재발 → 즉시 [STOP] · 3회 초과 → [STOP] + forge-multi plateau 4옵션(A추가R/B override/C폐기/D단순화). advisor T3 조언을 입력으로 쓰되 선택은 Human/오케스트레이터.
