---
name: forge-multi
description: "Multi-worker 검수 — Claude(Fable 5.1) + Codex(GPT-6 Astra) 2벤더 교차, 가중 0.5/0.5. 트리거: /forge-multi, plan/spec 저장 후 자동, plateau 3회 자동승격."
---

> 헬퍼·로그·증거 경로는 옛 이름 `cr-multi` 를 그대로 쓴다(`cr-multi-triage.py`·`cr-multi-calls.jsonl`·`docs/reviews/cr-multi/`) — 개명 금지.

Quick Start: `/forge-multi ${FORGE_OUTPUTS:-$HOME/forge-outputs}/11-platform/pipelines/plans/my-plan.md` (spec 경로도 동일).
## 레그 구성 (가중 0.5/0.5 — 정본 `shared/scripts/cr-verdict.mjs`·`cr-multi-triage.py`)
| 레그 | Worker |
|---|---|
| Claude | `advisor-strategist` 틀, Fable 5.1 (`claudeModel` 인자가 오면 그 값 · `frontier:false` → Sonnet) |
| Codex | `mcp__codex__codex` GPT-6 Astra (`--sol`/`--terra`/`--luna`·`frontier:false` → 하향) |
- 등급 인자(`cr-risk-tier.sh`)가 엔진 기본을 이긴다: full-gate = Fable+Astra xhigh · full-general = Opus 5.5+gpt-6-sol high · light = 중간 등급 1레그. 지적 수정 워커 = Opus 5.5 + gpt-6-sol. `--mode double|triple` = no-op.
- Codex 빠짐(`--cr degrade`/`--no-codex`) → `quorumFail` → **verdict=FAIL**, `degraded=true`.
- 판정 로직 수정 시: `cr-verdict.mjs` 만 고치고 ①`node shared/scripts/cr-verdict-inline.mjs --write` ②`--check`(바이트 동일) ③`workflow.js` `ENGINE_VERSION` patch +1(develop 대비 1회). 인라인 판정 본문 = `cr-verdict-inline.mjs --check` 로 바이트 동일 유지.
## Phase 0.5 — 과거 리뷰 회상 (fail-open)
- 워커 스폰 전 `/rag-search "{대상 slug} {도메인 키워드}" --top-k 5` → 과거 지적 3줄 이내를 "재발 검사 대상"으로 주입(범위 축소 금지).
- 각 워커 프롬프트 상단 `# review-target: <repo>@<short-sha>`.
- 과거 결과의 `reviewedSha`/`reviewedTargetHash` 가 현재 HEAD/대상 해시와 다르면 "⚠️ STALE REVIEW: <sha 8자> 시점 검수 — 재검증 없이 신뢰 금지" 배너로만 인용. 필드 없음 = 비교 불가.
- 이 세션에서 **변경·삭제한 파일 목록**을 브리핑에 동봉한다.
## Corpus(리서치 리포트) 검수 — 3레그 필수
1. **완전소스 공급**(yt: `full_text`+`timestamped_text`+`comments`+`description_links`). 부분 공급 축은 "검수범위 외" — 판정 금지.
2. **웹-verify 레그** — 인용·수치·버전명을 CONFIRMED/REFUTED/출처불명으로.
3. **레포 sys-verify 레그** — 시스템 주장은 레포 직접 대조.
- `'날조'`/`'조작'` 라벨은 웹-verify REFUTED 일 때만. 자료 미수집·부분 공급은 **`'provenance 결함'`**.
## Workflow 실행
codex-critic(`mcp__codex__`) = read-only sandbox 로 approve-token 불필요.
```js
// 매 호출 SSoT 를 cat (세션 사본·~/.claude 미러 금지 — stale_engine 거부)
// stage=final: prNumber·repo 필수(/forge-pr §3.0 prepare → --round-args), 없으면 unbound_final. PR 없는 수동 검수만 allowUnboundFinal: true
// machineChecks: {ran:[syntax|md-dup|rule-meta|claude-lines|pr-fields|self-count|mutation|mutation-marker|tests|lint|wiring|secrets|repro], summary} — /forge-pr §3 (b) 가 실제 돌린 축만
// crTier(/forge-pr §3 (c) cr-risk-tier.sh): skip → INVALID_INPUT code=tier_skip · light(legs:1) → 작성 반대편 1레그
//   full-general|full-gate → 2레그 순차 단락(Claude CRITICAL/HIGH 면 Codex 생략, short_circuited:true) · 원장 r>=2 는 단락 안 함
// claudeModel: fable|opus|sonnet · Claude effort = full-gate xhigh / 그 밖 high · legs: 1|2 · legVendor?: claude|codex(없으면 authorVendor=gpt→claude, 그 밖→codex) · crShortCircuit:false = 단락 끔
// target 없음(targetPath·deltaDiffPath·델타 diff 모두 부재)이고 `target:'staged'` 명시도 없으면 레그 전 `empty_target` 거부
Workflow({
  script: Bash("cat ${FORGE_ROOT:-$HOME/forge}/.claude/skills/forge-multi/workflow.js"),
  args: { slug: SLUG, targetPath: TARGET, mode: 'triple', stage: STAGE }
})
```
- `CLAUDE_CODE_DISABLE_WORKFLOWS=1` → Agent 패턴 fallback. **R2 러너**(기본 new, 되돌리기 `FORGE_CR_ENGINE_RUNNER=legacy`): 절차 정본 `forge-multi/reference/r2-runner.md`. `cr-run.sh pre` rc≠0 → Workflow 금지 · args 끝에 `...RUNNER_ARGS` 병합(`bundlePath` 만, 번들 인라인 금지) · `runner=new` 면 뒤에 `cr-run.sh post --wf-run <runId>`(rc≠0 = 결과 무효) · `legacy`/`shadow` 는 args 끝에 `runner` 한 키만, post 없음(`forge-multi/reference/r2-runner.md §shadow`).
- `crTestCtx`: `'auto'`(기본, `risk_level=LOW` 면 생략) · `'on'` · `'off'`. GitNexus `test_files` 를 `[변경 코드를 덮는 기존 테스트 — 의도된 계약이다]` 블록으로 동봉(파일당 200줄·총 2000줄, 절단 사실 명시, 실패 fail-open).
## learnings 배경 주입 (수동 opt-in)
`args.learningsContext` — 사고 재발 의심 검수에서만 켠다. 이 jq 만 사용(임의 텍스트 금지 · 상한 8,000자, 절단 명시):
```bash
jq -r 'select(.status != "superseded")
  | select((.category == "forbidden-pattern" or .category == "bug-fix-pattern" or .category == "review-pattern")
           or ((.summary // "") | test("버전|환경|도구|호환|타이밍|\\b(lock)\\b"; "i")))
  | "- [\(.id)] \(.summary // "")"' "${FORGE_ROOT:-$HOME/forge}/.claude/learnings.jsonl" | tail -5
```
## 산출물 = Workflow 반환값
`verdict`/`combined`/`issues[]`/`degraded`/`evidence_tier`/`reviewedSha`/`reviewedTargetHash`/`single_executor_cap`/`distinct_executors`/`verdict_body_sha`. 문을 잠그는 것은 `verdict` 뿐. `distinct_executors` = 서로 다른 실행체 수(대체 레그는 Claude 로 귀속) · `single_executor_cap` = 실제로 PASS→WARN 을 꺾었는가.
- **`INVALID_INPUT`**(`score:null`, `inputRejected:true`) = PASS/WARN/FAIL 아님 → 입력 고쳐 재호출(점수 인용 금지, `combined` 등 없음 — null-safe). code: `too_large` = 논리 단위(줄 수)로 나눠 호출 · `not_found` = 존재·경로 확인("정규 파일이 아니다" 계열이면 `<target-file>` 하나 지정해 재호출) · `content_mismatch` = 나눠서 재호출 · `rate_limited` = **나누지 말고** 한도 해제 후 같은 인자로 재호출.
- **라운드 수렴**: `--round-args` → `review_round`·`review_mode`(full/delta)·`backlog_issues`·`prior_status_summary`·`scope_drift_capped`. 결정은 `shared/scripts/cr-review-round.py record`(정본 `/forge-pr §3.0`).
- **degraded** → `degradedBanner` 를 인용 시 함께 표기. **`evidence_tier`** `full`/`degraded`/`unverified` — full 아니면 WARN+고지([STOP] 게이트 아님).
- **`content_integrity`** (`evidence_tier` 상한):

| `content_integrity` | 뜻 | `evidence_tier` 상한 | 머지 |
|---|---|---|---|
| `verified` | 청크 로더 전량 확보(바이트+CRC) | 없음 | 진행 |
| `partial` | 대부분 확보 + 실패 조각만 폴백(메운 비율 >1/3 이면 채택 안 함 · 메운 조각은 기대 바이트 ±10% 안이어야) — verified 로 보고 금지 · 하류 총량 검사 미실행 시 `unchecked` 강등 | `degraded` | 진행(고지) |
| `unverified` | 폴백 스냅샷 — 캡처 시점 바이트 대조만 통과 | `degraded` | 진행(고지) |
| `unchecked` | File Pre-load — 캡처 시점 대조 없음 | `unverified` | ⛔ [STOP] |
| `lost` | 유실+폴백 실패 — PASS 불가(→WARN), `/forge-pr §Step 3` 가 차단 | `unverified` | ⛔ [STOP] |
| `none` | 원문 로더 미경유(`target:'staged'` 명시 런) | 없음 | 진행 |
- **`reviewedSha`**: repoRoot pin + toplevel 일치 시만 40자, 아니면 null. 게이트 신뢰 입력 아님. **검수 중 워크트리를 옮기지 않는다.**
- **`inconclusive_legs`**: summary 첫 줄/issue 선두 `INCONCLUSIVE(<사유>)` = 점수와 무관하게 분모 제외(실질 지적 있으면 제외 안 함 · 제외분의 critical/high 도 판정에 남는다).
- 리포트 헤더 집계 숫자는 본문에서 기계 도출(`grep -c`)한다.
## 게이트 증거 — 발행 주체는 훅
워크플로는 감사 저장소에 쓰지 않고 판정(verdict·score)·바인딩(base_sha·diff)도 쓰지 않는다 — `cr-evidence-emit.py` 훅만 발행.
```
발행자: .claude/hooks/cr-evidence-emit.py   (SubagentStop + Stop)
소스  : <project>/<session>/workflows/wf_<runId>.json
착지  : ${FORGE_OUTPUTS:-$HOME/forge-outputs}/.claude/audit/cr-evidence/{stage}/{slug}-{stage}.json
원장  : ${FORGE_OUTPUTS:-$HOME/forge-outputs}/.claude/audit/cr-evidence/emit-log.jsonl
포맷: {legs[{worker,score,summary,issue_count,critical,high}], mode, expected_legs, stage, run_id, head_sha} + provenance {emitted_by, emitted_at, head_sha_at, wf_run_id, wf_finished_at, repo_root}
```
- `head_sha` = 훅이 `git -C <repoRoot> rev-parse HEAD` 로 취득 → `qa-event-router.sh` cr-final 바인딩이 소비(없으면 WARN, `FORGE_CR_EVIDENCE_STRICT=1` 이면 차단). 판정 = `codex-gate-enforce.sh` 가 `review-evidence-verdict.py --compute`.
- 발행 조건: stage ∈ {code,test,bugfix,final} + `status=completed` + `repoRoot` + 종료 1시간 이내(`CR_EVIDENCE_MAX_AGE_S`). 같은 `wf_run_id` 재발행 금지 · 같은 slug/stage 는 더 새 런일 때만 교체 · 발행/스킵/실패/off 전부 원장 1줄. Stop 등록 = `bash shared/scripts/register-forge-hooks.sh`.
- kill-switch `FORGE_CR_EVIDENCE_EMIT=off`(fail-open). 게이트 stage 충족은 forge-multi 경유만(`/codex-review` 래퍼 불가). 자동 게이트 기본 off(`CODEX_REVIEW_AUTO_STAGES`).

**보안**: Secret 사전 스캔 · `CR_MULTI_AUTO=off` 기본 · 감사 로그 `${FORGE_OUTPUTS:-$HOME/forge-outputs}/.claude/audit/cr-multi-calls.jsonl`.
## 운영 규칙
- **No-Pause**: 레그를 중간 Human 확인 없이 연속 실행. BLOCKED 판정 때만 [STOP].
- **Plateau**: 연속 2라운드 진전 <5점 → A 추가 라운드 / B AD-50 override(Human 승인) / C 폐기 / D 단순화(권고). 가드 `shared/scripts/cr-multi-plateau-guard.py`.
- **레그 금지**: ①점수 조작용 이슈 ②이전 라운드 동일 이슈 재제기 ③Spec 밖 enterprise 기능 요구 ④설계 의도 무시한 전면 재설계 BLOCK ⑤출처 미확인 코드 복사 권고.
- **요청자 규칙**: ⑥크기 이유로 리뷰 생략 금지 ⑦Critical 미수정 = FAIL(override 는 Human 승인) ⑧WARN 이면 high 목록 검토 ⑨피드백 무비판 동의 금지 ⑩수동 조립 레그도 실행체 1개면 PASS→WARN(`SINGLE_EXECUTOR_WARN_CAP`) — 대체(`executed_by="claude"`)·출처 미선언 레그는 세지 않는다, 보고에 `distinct_executors=N` 필수(WARN 은 자동 머지 안 함).
- **워커 출력**: ⑪통과 검증이 커버하지 않는 실패 시나리오 최소 1개 명시(없으면 "없음").

참조: 명령 `~/forge/.claude/commands/forge-multi.md` · 룰 `~/.claude/rules-on-demand/multi-gate-review.md` · Triage `~/forge/shared/scripts/cr-multi-triage.py`
