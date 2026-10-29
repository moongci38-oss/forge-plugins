---
description: Forge Dev P5 진입 — Spec 기준 구현 + 빌드/린트 통과 게이트.
argument-hint: "[--spec <path>] [--coder claude:tier|codex:tier|sol|terra|luna|ab] [--advisor sol|terra|opus|fable]"
group: implement
model: opus
---

# /forge-implement — P5 구현 진입

다른 명령과의 경계 → `${FORGE_ROOT:-$HOME/forge}/.claude/rules-on-demand/harness-family-map.md`.
**Iron Law**: 승인된 Spec **또는** 이슈·계획서의 완료 기준(DoD, `## 확인 방법`) 없이 코드 작성 = 즉시 중단. **단 사용자가 보는 동작이 바뀌는 일은 spec 이 필수**(`/forge-spec` 먼저 · 판정 = intent 영향 칸·이슈 본문의 `사용자가 보는 동작 변경: 예 | 아니오` 줄 — `docs/intent/STEP.md` 3번). Check 5.x(5/5.5/5.6/5.7/5.8/5.9 — `pipeline.md §Phase 5`) 생략·`--skip-checks` 금지.
모델: 구현 Opus(frontmatter) · 탐색 `Agent(model:"haiku")` · 리뷰·advisor = 전역 `model-routing.md`. 불명확 요구·blocker = STOP(추측 구현·우회 금지). 삭제 구현은 삭제 scope 명시 후 승인. TDD(RED→GREEN→REFACTOR) 필수. 테스트 금지패턴: ①DB mock(단위 RED 에서만 허용, 통합/E2E 는 실 DB) ②외부 API 전체 mock(계약 테스트 병행) ③성공 케이스만(에러·null·경계값 포함) ④assert 안 if/else ⑤oracle 역산(기대값은 spec·레거시·Human 에서).

## Preflight
0. **이슈 먼저**: 이 태스크(FR)의 이슈 번호(#N — PR `Closes #N`)를 확인한다. 없으면 `/forge-spec` 승인 뒤 이슈 등록 단계로 1장 — 정본 `harness-family-map.md` §이슈 먼저.
1. **브랜치**: `git branch --show-current` 가 main/develop → WARN(`feature/{spec-slug}` 권장). `git fetch origin develop 2>/dev/null && git rev-list --left-right --count origin/develop...HEAD` behind 10+ → stale-base WARN(fetch 실패 = skip).
2. **Worktree 고려**: 다중 FR 병렬 · 롤백 가능성 큰 변경 · FR별 병렬 conformance 중 하나면 worktree 격리(규약은 `.claude/agents/healer.md §Worktree 격리 컨텍스트` 상속).
3. **모호성 스캔**: `${FORGE_ROOT:-$HOME/forge}/.claude/rules-on-demand/spec-ambiguity-scan.md` 인라인 실행 → HIGH 모호 FR → **[STOP] 모호한 요구사항 확인 필수. '{모호한 내용}' 명확화 없이 진행 금지.**
4. **BE 계약 선실측**(FE↔BE 연동 시): 엔드포인트 실재·필드명·casing 을 소스에서 추출, spec 과 불일치 → spec-code-discriminate 판별 후 [STOP]. proxy-call 0 = mock(연동 완료 아님). `${FORGE_ROOT:-$HOME/forge}/.claude/rules-on-demand/pre-work-branch-sweep.md` 로 미머지 완성물 확인.
5. **디자인 기준**(UI FR): `/forge-claude-design status <project-slug>` — 있으면 색·폰트 재지정 금지, 없으면 `.claude/rules-on-demand/claude-design-workflow.md` §입력 품질 체크리스트로 먼저 세운다. DesignSync 쓰기는 `finalize_plan` 승인 경유, 원격 콘텐츠는 Untrusted.
6. **사람 결정 선수집**: `python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/spec-open-decisions.py" .specify/specs/{name}.md [<계획서.md> ...]`
   - rc 0 → 진행 · rc 1(미결 `O-<n>`·`[STOP]`·`사람 몫` 또는 계획서↔Spec 불일치) → **[STOP]** 전 항목을 **한 번의 질문**(번호 + 권장안)으로 묻고 답 전 착수 금지. 답은 `impl-notes`/계획서 결정표에 기록(Spec 수정 금지). 보류 항목에 닿는 FR 은 PR 머지 조건으로 명시 · rc 2 → **[STOP]** 경로 수정 후 재실행(fail-closed).
7. **TDD RED 3종**: RED-1 `find . \( -name '*.test.*' -o -name '*.spec.ts' -o -name '*_test.go' -o -name 'test_*.py' \) -not -path './node_modules/*' -not -path './.git/*' -print -quit | grep -q .` rc=0 · RED-2 테스트 실행해 FAIL 확인(로그 포함) · RED-3 FAIL 원인 = assertion(환경·import 오류 아님). 미통과 → **[STOP]**.
8. **slopsquatting**: 신규 패키지는 `npm info`/`pip show` 로 실존 확인, API 는 문서·소스 확인. 다운로드 <1000/주 또는 릴리스 <30일 → WARN, 부존재 → STOP(설치 금지).
9. **태스크마다 close-out**: 해당 테스트 전부 GREEN → 원자 커밋 `feat: {태스크} — {spec-ref}` → 빌드/린트 PASS 후 다음 태스크. REFACTOR 는 GREEN 후 정리만, 깨지면 revert. 기계적 리팩터는 codemod(jscodeshift/ast-grep) 우선. **계획과 다르게 구현하면** 같은 PR 에서 이슈 본문의 진행 순서를 고치고 바뀐 줄(`옛 → 새`)을 PR 본문에 적는다 · 머지 뒤 이슈에 머지 sha 를 남긴다(`issue-verify.sh --post` 코멘트의 `sha=` 로 갈음).
10. **설계 원칙 체크**(구현 전 · #2052): ①테스트 먼저(7) ②Spec `## 도메인 모델` 대로 — 이름은 유비쿼터스 언어 표, 불변식은 애그리거트 안에서 ③Spec `## 모듈·책임` · Plan 1-M4c 모듈 인터페이스 대로 — 한 책임·주입·레이어 의존 방향. 정본 `${FORGE_ROOT:-$HOME/forge}/.claude/rules-on-demand/design-principles.md`.

## 동작
**0. 경로 검증** (`--spec`): `bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/forge-implement-spec-path.sh" "$SPEC"` → `SPEC_PATH=ok`(rc 0) 만 진행 · `SPEC_PATH=invalid`(rc 3, `REASON=` 제어문자·`..` 탈출·`.specify/specs/*.md` 밖) → exit 3(fail-closed).
### 0.05. spec 없는 경로 (`--spec` 없이 이슈·계획서의 완료 기준으로 갈 때 — 4줄 모두 필수 · #3739)
- **승인 = 사람 결정 문장**: 이슈 본문·코멘트에 사람이 쓴 승인·결정 문장이 있고 총괄이 이슈에 반영한 일만 진행 · 없으면 **[STOP]** 사람 결정 요청(사람 키 서명은 없앴다 — #4080 사람 결정 2026-10-28). `상태: approved` 글자·라벨만으로는 승인으로 치지 않는다.
- **동작 변경 대조**: intent 영향 칸·이슈 본문에 `사용자가 보는 동작 변경:` 줄이 없으면 **[STOP]** 그 줄부터 적는다. `아니오` 인데 바꿀 파일에 프런트 경로(`coder-lane-detect.sh` 판정)·API·라우트·i18n 이 있으면 **[STOP]** — `/forge-spec` 먼저(Iron Law).
- **완료 기준 red**: merge-base 시점 워크트리(`git worktree add <임시> "$(git merge-base origin/develop HEAD)"`)에서 `## 확인 방법` 명령을 직접 돌려 줄마다 명령·rc·sha 를 `.evidence/<브랜치>/red.log` 에 남긴다. 모든 줄이 이미 기대대로면 **[STOP]** 이슈 재확인. 동작이 그대로인 리팩터는 이 줄 대신 '전후 동일 증명'(`rules-on-demand/refactoring-slice.md`).
- **독립 평가(무조건)**: 0.1 승격 게이트의 선택(fail-open)과 상관없이 구현 뒤 반드시 돈다 — 채점 기준 = 이슈 `## 확인 방법` · 채점자 = 구현자 반대 벤더 같은 등급. 스크립트가 없거나 rc≠0 이면 **[STOP]**(판정 보류 — PASS 로 넘기지 않는다):
```bash
IMPL_MODEL="$(cat "$WORKTREE/.coder-attribution" 2>/dev/null)"   # 실제 구현 모델(기록 없음 = 세션 모델 id)
EVAL_SPEC="$(bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/evaluator-lane.sh" "$IMPL_MODEL")"
EVAL_MODEL="$(bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/coder-model-resolve.sh" "$EVAL_SPEC")"
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/evaluator-lane.sh" --verify "$IMPL_MODEL" "$EVAL_MODEL"            # rc 3 같은 벤더 · 2 판정 불가 → [STOP]
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/pge-eval-raw-check.sh" "$WORKTREE/.claude/state" <사이클> --eval-model "$EVAL_MODEL"   # rc≠0 → [STOP] DATA_INTEGRITY
```
  채점 입력·전사 규약(`PGE_EVAL_RAW.txt` → `PGE_EVAL_HISTORY.jsonl`)은 지금 `skills/forge-pge/SKILL.md §Phase 4`(입구 폐지 조각에서 이 문서로 옮긴다).
### 0.1. 라우팅 승격 게이트 (WARN, fail-open, 끄기 `FORGE_ESCALATION_GATE=off`)
```bash
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/harness-escalation-check.sh" --cmd forge-implement --fr <FR 수> --files <파일 수> --domains <도메인 수> --uncovered <테스트가 덮지 않는 파일 수>
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/harness-escalation-check.sh" decision --rec-id <rec_id> --decision <wave|teams|workflow|main>   # 권고 시 반드시 기록
```
`workflow` 선택 시 — **Step 0.5 PASS(또는 ADAPT 보완)와 Step 1 통과 후에만**(아니면 **[STOP]**) 0.05 의 **독립 평가** 길(`evaluator-lane.sh --verify` → `pge-eval-raw-check.sh`)을 돈다 — spec 이 있어도 같다. 두 스크립트 중 하나라도 없으면 **[STOP]**(fail-closed).

### 0.2. 소관 팀 + 팀 지식 (WARN 전용, 비차단)
`bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/team-route.sh" forge-implement [--project <proj>]` → `OWNER=<slug>` 마다 `${FORGE_OUTPUTS:-$HOME/forge-outputs}/12-team-ops/members/<slug>/wisdom.md` 선독. 2팀+ 이면 접수 순서 지정(동시 수정 금지). wisdom 부재·스크립트 실패·`OWNER=none` 이면 건너뛴다**(fail-open, AD-168)**. 팀장 경유(버스)를 강제하지 않는다 — `forge-session-bus.sh send <slug>` 는 사람·총괄 판단. 판정 근거는 "커맨드 소유"다 — 파일 소유가 아니다(소관은 이름표를 고쳐 정한다).

**0.5 Readiness**: 진입 계약 A~H 를 ok/normalize/derive/absent 판정 → 전부 ok = PASS · normalize/derive 만 = ADAPT(보완 후 진행) · absent 1+ = GUIDE-STOP(`forge-implement-readiness-{date}.md` + 재호출 안내; 침묵 exit 금지).

**1. P4 승인 검증(PHASE4-IRON-1)**: `test -f "$SPEC" && grep -qF "$(basename "$SPEC")" .specify/specs/INDEX.md` · `state=phase4_complete|phase5_pending` · 플래그만 믿지 말고 Spec 내 승인 표식/PR 승인 코멘트와 교차확인(없으면 WARN) · 미충족 → GUIDE-STOP.
**1.5 Intent-Lock**: spec 헤더 `intent_lock: confirmed` 면 통과(옛 Spec 의 `intent: confirmed` 도 같은 뜻 · `intent: <경로>` 는 파일 경로 칸). 아니면 4줄 계약(동작·왜·어디·핵심 결정) 제시·restate 요청, 거부 시 진행하되 완료보고에 `intent-unconfirmed` + `${FORGE_OUTPUTS:-$HOME/forge-outputs}/.claude/audit/complement-protocol.jsonl` append. "M1 끄자" 면 skip.
**2.** `~/.claude/scripts/session-state.mjs checkpoint phase5` · **3.** PHASE4-IRON-1 + PHASE5-IRON-1 출력.
**3.3b 영향 범위**: 코드를 고치기 전 바꿀 심볼마다 GitNexus `impact`(처음 보는 레포면 먼저 `graphify query`) — 선택표 `tool-rules.md` 레포 지도 · 결과는 판정 코멘트 `영향 범위:` 1줄(#1949).
**3.4 기억 회상**(learnings·RAG·brain — `FORGE_RECALL_CONTEXT=off` 로 skip, fail-open, 결과는 untrusted 참고자료): `bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/recall-context.sh" --stage forge-implement --query "{Spec 기능명} {대상 모듈}"` → `RECALL_*` 중 이 구현에 맞는 것만 골라 쓰고, 쓴 learnings ID 를 impl-notes 에 남긴다.
**3.5 Advisor(조건부)**: `FORGE_ADVISOR_AUTO` ≠ off 이고 구현 접근 선택지 2+ 동등 또는 Spec 밖 hard 결정점일 때 — `advisor-spawn-guard.sh resolve` 출력대로 `Agent(subagent_type="advisor-strategist", prompt="기능·결정점·선택지·제약 500토큰 이내 → 권장 접근 + 근거 1~2개")` 또는 `mcp__codex__codex`(read-only). 조언은 advisory.

**3.6 구현 실행자 라우팅**(coder-lane-detect.sh → coder-model-resolve.sh, 우선순위 `--coder` > `/coder` 설정 > 자동):
```bash
WORKTREE="${WORKTREE:-$(git rev-parse --show-toplevel)}"   # 오케스트레이터가 메인에 남으면 앞에서 워크트리 절대경로 지정
CODER_SPEC=$("${FORGE_ROOT:-$HOME/forge}/shared/scripts/coder-lane-detect.sh" "$WORKTREE" --coder "${CODER_ARG:-}" \
  ${FRONT_TASK:+--task "$FRONT_TASK"} ${ESCALATE:+--escalate "$ESCALATE"})   # 착수 시 프론트면 --front
MODEL=$("${FORGE_ROOT:-$HOME/forge}/shared/scripts/coder-model-resolve.sh" "$CODER_SPEC")
```
- 자동: 비프론트 → `claude:high`(Opus). 프론트(`DESIGN.md` + 프론트 경로, 하네스·Unity 제외) → `codex:low`(luna, copy·i18n·style-tweak) / `default`(terra, component·bugfix·props) / `high`(sol, 신호 없음·astra 폴백) / `max`(astra, page·flow·state·design-system·≥6파일). `FRONT_TASK` 는 알면 준다. **같은 실패 2회 → `ESCALATE=2` 재판정**(상한 = 벤더 맨 윗칸). kill-switch `FORGE_FRONT_CODER=off|on`. astra 는 가용성 가드(`FORGE_CODER_ASTRA=off`·429·소진율·CLI 버전) 실패 시 sol 폴백. 판정 근거는 stderr `[coder-lane]` 1줄.
- **claude:tier** → `Agent(model=sonnet|opus|fable)`(Fable 불가 시 Opus 폴백).
- **codex:tier** → `mcp__codex__codex`(sandbox=workspace-write, approval-policy=on-request, cwd=worktree, model=$MODEL). Unity(`"${FORGE_ROOT:-$HOME/forge}/shared/scripts/unity-root-detect.sh" <FR 이 건드리는 경로…>` → `UNITY_ROOT=` 가 비어 있지 않음 · 모노레포 하위 폴더 포함 #2329) → Claude 폴백. 출력은 `secret-content-scan.sh` 경유 후 표시. `GATE=$("${FORGE_ROOT:-$HOME/forge}/shared/scripts/advisor-tier-gate.sh" "$CODER_SPEC")` → `skip` 이면 §3.5 생략 · `advise` 면 조언을 Codex 프롬프트에 주입. T3 plateau·T4 비가역 자문은 tier 무관 유지.
- **프런트 기준(claude)**: 웹·앱 프런트(위 자동 판정)를 Claude 가 구현하면 구현 전에 `Skill("frontend-design")` 을 부른다(#2262).
- **프런트 기준(codex)**: 웹·앱 프런트를 Codex 가 구현하면 Codex 지시문에 그 스킬의 기준 자료 경로 `${FORGE_ROOT:-$HOME/forge}/.claude/skills/frontend-design/data/refero-craft/`(5종 `anti-ai-slop.md`·`color.md`·`craft-details.md`·`motion.md`·`typography.md`)를 넣고 "구현 전에 읽고 따른다" 를 적는다 — Codex 는 Claude 스킬을 못 부른다(#2262).
- **게임 클라이언트(Unity) 분기**: 판정 = `"${FORGE_ROOT:-$HOME/forge}/shared/scripts/unity-root-detect.sh" <FR 이 건드리는 경로…>`(경로를 모르면 인자 없이 — 레포 루트·하위 폴더 깊이 ≤3) → `UNITY_ROOT=<경로>` 가 나오면 UI·연출 작업은 위 웹용 기준 2줄을 쓰지 않는다 — `<UNITY_ROOT>/style-guide.md`(`style-forge` 산출물 · `/forge-image --style-guide` 가 받는 그 파일 · 레포 루트가 아니다) 경로를 구현 지시문에 넣는다. 없으면 "기준 파일 없음 — `<UNITY_ROOT>/style-guide.md` 를 먼저 세운다(`style-forge`)" 1줄을 내고 계속한다. 구현 지시문 끝에 `기준 파일: <UNITY_ROOT>/style-guide.md`(없으면 `기준 파일: 없음`) 1줄을 남긴다 — 보고·머지 관문이 확인한다(#2332). 기준의 내용은 그 게임 레포 몫이다. Unity 조작·검증 = Unity MCP·CLI 경유 → `rules-on-demand/client-verify-routing.md`(·`game-e2e-oracle.md`).
- `--advisor <spec>`: `AMODEL=$("${FORGE_ROOT:-$HOME/forge}/shared/scripts/coder-model-resolve.sh" "$ADVISOR_SPEC")` → gpt 면 `mcp__codex__codex`(read-only), claude 면 `Agent(subagent_type="advisor-strategist", model=$AMODEL)`. advisor 벤더 ≠ 구현 벤더 권장.
- **ab** → claude:high + codex:sol 각 worktree 병렬 → 독립 Evaluator 채점 → 승자 채택.
- **attribution**: 구현 직후 `coder-attribution.sh write "$WORKTREE" "$MODEL"` → 검수 시 `MODE=$("${FORGE_ROOT:-$HOME/forge}/shared/scripts/coder-attribution.sh" review-mode "$WORKTREE")` 를 `--cr $MODE` 로 전달. `cross` 면 `AV=$("${FORGE_ROOT:-$HOME/forge}/shared/scripts/coder-attribution.sh" author-vendor "$WORKTREE")` 도 `authorVendor` 로(unknown 이면 생략).
- 산출물 = worktree 만(커밋·머지는 MERGE-IRON-1/forge-pr 경유, 우회 금지). Check 5.x·qa·cr 게이트는 `--coder` 무관 유지. `FORGE_DUAL_CODE=off` → Claude 대체 · Codex 미가용 → Claude(경고). 모델 id SSoT = `model-registry.json`.
**MERGE-IRON-1**: `feature/*` → develop 만 autoMerge · target main/protected → [STOP] · 그 밖 → [STOP]. develop→main 은 항상 Human.

**4. 게이트**: `P5 구현 진입 완료. 성공 조건: 빌드 PASS + 린트 PASS → feature→develop 머지`. `ENOENT node_modules`·`MODULE_NOT_FOUND`·lockfile drift → Node-Repair 후 재시도.
**4a. PEV 루프**(테스트/빌드/린트 FAIL, `PEV_MAX=3`): 매 사이클 `bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/forge-implement-pev.sh" --file "<실패파일>" --err "<에러 첫줄>" --cycle "$PEV_CYCLE" --prev-hash "$ISSUE_HASH"` — NEW_HASH=sha256(실패파일:에러 첫줄) → 커널(loop-kernel.js `checkSameIssue`) → `docs/qa/artifacts/pev-kernel-state.json` 갱신까지 스크립트가 한다.
- `VERDICT=stop_same`(rc 4 — `tripped` 또는 `NEW_HASH==ISSUE_HASH && PEV_CYCLE>=2`) → [STOP] 동일 오류 반복, exit 4 · `VERDICT=stop_exceeded`(rc 4) → 3회 초과 [STOP] PEV 재시도 초과, exit 4 · rc 2 = 판정불가(인자 오류 — 고쳐 재실행, 계속으로 읽지 않는다).
- `VERDICT=continue`(rc 0) → `ISSUE_HASH=NEW_HASH` → `/forge-fix`(③ 수정 · 새 fixer 금지 — 옛 `/healer` 스킬은 #3737 로 흡수) → 실패 단계만 재실행. `KERNEL=fail` = 커널 실패(rc≠0·빈 출력) → 로컬 비교만(fail-open).
**4a-1/4b.** UI FR 완료 전 self-check(loading/empty/error/partial 4상태 · 키보드·focus·aria-live · 실제 길이 데이터 · DESIGN.md 토큰·anti-slop) 후 **Check 5.8 Spec-Conformance E2E**(필수; SDD 체인이면 직후 P6 qa 가 충족):
- 직전 `bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/assert-db-isolation.sh"` — `DB_ISOLATION: WARN` 이면 격리 DB 로 바꾸고 재확인(`FORGE_DB_ISOLATION_ENFORCE=1` = 차단).
- `/qa --diff-aware --scope={구현 FR/파일}`(standalone 은 인라인, 가능하면 별도 subagent 격리). UI + DESIGN.md 면 `/forge-review --lens ui` advisory(`docs/qa/design-check.jsonl`, `FORGE_DESIGN_CHECK` off 가능).
- FR별 판정은 `/forge-review --lens traceability`(`docs/qa/fr-verdict.json`) 재사용, 증거 = db_query·렌더·F12 번들. 완료 바: Health Score 70+ AND 기능성 즉시-FAIL 0, 미달 → [STOP] 재작업. 환경 불가 → GUIDE-STOP(침묵 금지). 게이트 티어는 qa 상속([STOP] 클래스).
**5.** exit 0

## 구현 노트 (spec 역방향)
spec 이 예상 못한 제약 → `${spec_file%.md}.impl-notes.md` 에 1줄 append(spec 본문 수정 금지): `- [FR-00N] {제약} | 근거: {명령·파일·출력} | 영향: spec-변경필요 | 구현 내 수용`. 같은 FR 에 `spec-변경필요` 2건+ → 완료보고에 `⚠️ FR-00N: 구현 노트 {n}건이 spec 변경 필요를 지시 → /qa Phase C.5 재조정 권고`. 소비 = `/qa` Phase C.5(`spec-code-discriminate.sh` 는 안 읽음).

## Node-Repair (환경 파손)
진단 `node --version && npm --version` · `ls node_modules/.bin/ | head -5` → R-1 `rm -rf node_modules && npm ci` · R-2 `rm -rf node_modules package-lock.json && npm install`(lockfile 손상) · R-3 `npm cache clean --force && npm ci` · R-4 `pip install -r requirements.txt` · R-5 `rm -rf .next dist build .cache && npm run build`. 복구 후 RED-2 재실행.
Exit: 0 성공 · 1 P4 Spec 미승인 [STOP] · 3 path validation FAIL · 4 PEV 정지. 예: `/forge-implement --spec .specify/specs/auth-refactor.md`. 관련: `pipeline.md` P5 · `.claude/commands/forge-fix.md` · `.claude/commands/forge-spec.md`.
