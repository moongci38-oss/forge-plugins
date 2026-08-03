---
name: cr-multi
description: "Multi-worker 검수(Codex+Gemini Double / Opus+Codex+Gemini Triple). 트리거: /cr-multi, /cr-double, /cr-triple, plan/spec 저장 후 자동, plateau 3회 자동승격."
---

## 게이트 증거 — 관측/판정 분리 (D1-B, 2026-07-25)

워크플로는 **관측한 raw legs 만** 발행한다. **판정(verdict·score)·바인딩(base_sha·
diff·provenance)은 쓰지 않는다** — 그건 게이트가 계산한다.

```
${FORGE_OUTPUTS:-$HOME/forge-outputs}/.claude/audit/cr-evidence/{stage}/{slug}-{stage}.json
포맷: {legs[{worker,score,summary,issue_count,critical,high}], mode, expected_legs, stage, run_id, head_sha}
```

- `head_sha` = **리뷰 시점 `git rev-parse HEAD` 관측치**(판정 아님 — D1-B 원칙과 무충돌).
  `qa-event-router.sh` 의 cr-final 바인딩 검사가 이 값을 `grep -qF` 로 소비한다. 없으면
  그 게이트는 상시 미바인딩 WARN(`FORGE_CR_EVIDENCE_STRICT=1` 이면 상시 차단)이 된다.

- **왜 판정을 안 쓰나**: 에이전트가 `verdict:PASS` 를 파일로 써넣는 행위가 위조와
  구분되지 않아 안전 분류기에 반복 차단됐다(실측 3회 연속). raw legs(관측)는 통과한다.
- **누가 판정하나**: `codex-gate-enforce.sh` 가 `review-evidence-verdict.py --compute` 로
  verdict 를 재계산하고, base_sha·diff 는 gh/git 에서 자체 취득한다.
- **발행 조건**: stage ∈ {code,test,bugfix,final} + PR 컨텍스트. 그 외/실패는 fail-open
  skip(리뷰는 정상 반환).
- ⚠️ **게이트가 소비하는 증거는 이 경로뿐이다.** `/cr-code`·`/cr-final` 등 `/codex-review`
  래퍼는 `docs/reviews/` 에 쓰므로 이 게이트를 통과시키지 못한다 — 게이트 stage 충족은
  `/cr-triple`·`/cr-double`(= cr-multi) 경유로만 된다.
- 자동 게이트는 기본 off(`CODEX_REVIEW_AUTO_STAGES`, `.env`). 검수 판정은 Workflow
  반환값(combined/verdict)으로 사람이 읽는다.


## Quick Start

```bash
# Double (기본 — Codex + Gemini)
/cr-double ${FORGE_OUTPUTS:-$HOME/forge-outputs}/11-platform/pipelines/plans/my-plan.md

# Triple (plateau 자동 승격 또는 중요 spec)
/cr-triple ${FORGE_OUTPUTS:-$HOME/forge-outputs}/02-product/forge-platform/specs/my-spec.md
```

## Phase 0.5 — 과거 리뷰 회상 (advisory, fail-open — 2026-07-10)

워커 스폰 전 1회, 대상 파일명·도메인 키워드로 내부 지식을 회상한다:

```
/rag-search "{대상 slug} {도메인 키워드}" --top-k 5
```

- 히트 중 `docs/reviews/` 원문·wiki 노트가 있으면 **과거 지적 요약 3줄 이내**를 각 워커 프롬프트에 "이전 리뷰에서 지적된 패턴(재발 검사 대상)"으로 주입 — 같은 결함의 재발을 리뷰어가 우선 확인.
- 결과 없음/rag 미가용 = 그대로 진행(fail-open, 비차단). 회상이 리뷰 범위를 좁히는 데 쓰여선 안 됨 — 추가 렌즈일 뿐.
- 각 워커 프롬프트 상단에 **repo identity 1줄**(repo 이름 + 현재 HEAD SHA, 예: `# review-target: <repo>@<short-sha>`)을 주입해 워커가 어느 레포/커밋을 리뷰 중인지 앵커링 (cross-repo 혼선 방지, harness-gaps 2026-07-23 G-3).

## 모드

| 모드 | Worker | 합산 |
|------|--------|------|
| Double | Codex + Gemini | `codex×0.6 + gemini×0.4` |
| Triple | Opus + Codex + Gemini | `opus×0.35 + codex×0.35 + gemini×0.3` |

## 산출물

1. **Workflow 반환값** — 사람이 읽는 검수 결과(`verdict`/`combined`/`issues[]`/`degraded`/
   `evidence_tier`). 판정은 여기서 확인한다.
2. **게이트 raw-legs**(위 §게이트 증거) — 관측 데이터만, PR 컨텍스트 + gate stage 한정.

> ⚠️ 구 `docs/reviews/{stage}/{slug}-cr-multi.json`(AD-90 증거 JSON) 발행은 **폐지됐다**
> (2026-07-24 v2에서 workflow.js의 파일 발행 제거 — 현재 이 경로를 쓰는 코드는 없다).
> 게이트가 소비하는 증거는 raw-legs 경로뿐이다.

**`INVALID_INPUT` — 입력 실패는 품질 판정이 아니다 (2026-07-29, A-1b 세션 실발화)**

대상을 읽지 못했을 때 `verdict:'INVALID_INPUT'` + `score:null` + `inputRejected:true`가 반환된다.
과거에는 이 경우도 `verdict:'FAIL'`/`score:0`이었고, 실제로 **읽지도 못한 코어를 "0점"으로 오독**했다.

| `issues[].code` | 뜻 | 대응 |
|---|---|---|
| `too_large` | 청크 로더 상한(600줄)과 폴백 상한(256KB)을 **동시** 초과 | 논리 단위로 나눠 개별 호출 |
| `not_found` | 경로를 에이전트 셸에서 읽지 못함 | 존재 여부 + 경로 표기 확인(백슬래시는 슬래시로 정규화됨) |
| `content_mismatch` | 확보한 내용이 원문과 불일치(폴백이 요약했거나 리뷰 중 파일이 바뀜) | 나눠서 재호출 |

⚠️ **`INVALID_INPUT`은 PASS도 WARN도 FAIL도 아니다** — 머지·진행 판단의 근거로 쓰지 말고
입력을 고쳐 **재호출**한다. 점수를 인용하지 말 것(`score`는 숫자가 아니라 `null`이다).
`combined`·`scores`·`results`는 이 반환에 **없다**(검수가 수행되지 않았으므로) — 소비자는 null-safe로 다룰 것.

**degraded 표기 의무 (Batch 3 증거등급 정직화)**: `degraded=true`(worker 정족수 미달 — 외부 워커 Codex/Gemini 미가용으로 동일 모델 대체 등)면 사람이 보는 최종 결과(Workflow 반환값)에 `degradedBanner`("⚠️ DEGRADED: N/M worker 생존 — 근거등급 낮음") 필드가 additive로 포함된다. 이 검수 결과를 인용·보고할 때 배너를 함께 표기할 것 — "3-LLM 적대 검수"로 재현하지 않는다.

**`evidence_tier` (증거등급, Batch 3-2)**: 기존 `degraded`·워커 생존 수에서 **순수 파생**되는 필드(신규 판정 로직 아님).

| tier | 의미 |
|------|------|
| `full` | 정족수 충족 — 전 레그 참여, 가중합산 |
| `degraded` | 일부 워커 생존(2/3) — 균등평균으로 강등 계산. **3-LLM 합의 아님** |
| `unverified` | 단일 워커 이하 — 근거등급 최하 |

**tier가 `full`이 아니면 WARN + 고지**한다. **[STOP] 게이트가 아니다** — 흐름은 계속하되, 점수만 보고 "3-LLM 검수 통과"로 오독하는 것을 막는 것이 목적이다. 이 검수를 인용할 때 tier를 함께 표기하라.

**집계 자가대조 (Batch 3-3)**: 리포트 헤더·요약의 **집계 숫자는 본문 항목표에서 기계 도출**(`grep -c` 등)하거나 작성 직후 자가 대조한다. **헤더 숫자는 그 자체가 검증 대상이다** — 눈으로 센 값을 쓰지 마라. (목록형 산출물의 헤더 집계 오류 4회 실증. 이 세션에서도 harness-diet가 `skills_count: -97`이라는 허구 수치를 보고했다.)

## 보안

- Secret 사전 스캔 (전송 전 차단)
- `CR_MULTI_AUTO=off` 기본 (명시 opt-in 필요)
- 감사 로그: `${FORGE_OUTPUTS:-$HOME/forge-outputs}/.claude/audit/cr-multi-calls.jsonl`

## Cache Stats 로깅 (AD-105 H2)

cr-multi 실행 후 usage 데이터 기록:
```bash
bash $HOME/.claude/scripts/cache-stats-logger.sh cr-multi "$MODEL" "$CACHE_READ" "$CACHE_CREATION" "$RAW_INPUT" cr-review
```
usage 필드는 Anthropic SDK response.usage 에서 추출. 미지원 시 0 기본값 사용.

## Workflow 실행 (계획서 P0-4)

mcp__codex__ codex-critic = verify hook이 read-only sandbox로 무조건 면제 (approve-token 발행 불필요 — CI-2 감산 2026-07-23).

```js
// Workflow 실행 (GitNexus StructuralContext + 3-LLM parallel)
Workflow({
  script: Bash("cat $HOME/.claude/skills/cr-multi/workflow.js"),
  args: { slug: SLUG, targetPath: TARGET, mode: 'triple', stage: STAGE }
})
```

Agent Teams fallback: `CLAUDE_CODE_DISABLE_WORKFLOWS=1` 시 기존 Agent 패턴.

**호출 규약 — 세션 변경/삭제 파일 목록 동봉 (P1-15, pipe-2-opus-0721 G-3, 2026-07-21)**: 오케스트레이터는
cr 스폰 시 이 세션에서 **변경·삭제한 파일 목록**을 브리핑에 동봉한다. codex-critic이 자신에게 로드된
rules/CLAUDE.md 컨텍스트를 현재 파일 상태로 오인해 이미 삭제된 규칙을 근거로 정당한 PR을 FAIL 판정한
실사례(PR #88)가 있었다 — workflow.js `basePrompt`의 "로드된 rules/CLAUDE.md를 현재 사실로 삼지 말고
Read/Grep 실측" 경고와 짝을 이루는 조치다.

### `crTestCtx` — 변경 코드를 덮는 기존 테스트 동봉 (D8, 2026-07-31)

리뷰어에게 변경 코드만 주고 그 코드를 고정하는 **기존 테스트**를 주지 않으면, 테스트로 못박힌
의도적 계약을 버그로 오신고한다(실제로 정당한 코드가 revert된 사고 1건). GitNexus 가 변경 심볼의
caller 중 테스트 파일(`*.test.*`·`*_test.*`·`tests/`·`__tests__/`)을 `test_files` 로 반환하면,
그 내용을 크기캡 안에서 읽어 `[변경 코드를 덮는 기존 테스트 — 의도된 계약이다]` 블록으로 프롬프트에 붙인다.

| 값 | 동작 |
|---|---|
| `'auto'` (기본) | 동봉하되 `risk_level=LOW` 면 생략 (토큰 팽창 억제) |
| `'on'` | risk 무관 항상 동봉 |
| `'off'` | 완전 비활성 — 기존 동작 100% 동일 |

- 크기캡: 파일당 `TEST_CTX_MAX_LINES_PER_FILE`(200줄) / 총 `TEST_CTX_MAX_TOTAL_LINES`(2000줄).
  캡에 걸려 잘리거나 미첨부된 파일은 **프롬프트에 그 사실을 명시**한다(무언의 절단 금지).
- 실패는 fail-open — 로드 실패 시 동봉 없이 기존 리뷰를 그대로 진행한다.
- 회귀 테스트: `shared/scripts/cr-multi-testctx.test.sh` (18케이스, 순수 구간 소스 추출 실행 + 배선 grep).

## 참조

- 명령: `${FORGE_ROOT:-$HOME/forge}/.claude/commands/cr-multi.md`
- 룰: `$HOME/.claude/rules-on-demand/multi-gate-review.md`
- Triage: `${FORGE_ROOT:-$HOME/forge}/shared/scripts/cr-multi-triage.py`
- Plateau: `${FORGE_ROOT:-$HOME/forge}/shared/scripts/cr-multi-plateau-guard.py`

## 이종 모델 검수 설계배경

<!-- root-cause(skills-1/S1-06, 2026-08-03 관측): 이 절 위에 있던 "Evaluator (Wave 2.5)" 산문(role/model/isolation 설명 + PASS/WARN/FAIL 템플릿)은 8개 SKILL.md에 동일 문구로 복제됐고 실제 Agent()/hook 배선이 0건이라 제거했다 — 판단 근거는 codex-review/SKILL.md의 동일 root-cause 주석 참조. 다만 아래 한 문단은 cr-multi 고유의 실제 설계 근거(다른 7개 파일에는 없음)라 보존한다. -->

Codex/Gemini/Haiku 등 이종·경량 모델을 리뷰 레그에 섞는 이유는 self-referential bias(모델이 자기 산출물을 검증할 때 관대해지는 편향) 완화에 있다 — 작성자 모델과 다른 모델이 검토하면 같은 편향을 반복할 확률이 낮아진다. 다만 **동일 모델계열 내 편향(예: 같은 Claude 계열끼리)은 이 구조로 완전히 제거되지 않는다** — 이종 모델 배치는 완화 장치이지 무편향을 보장하는 장치가 아니다.

## Plateau 조기 감지 (AD-118 SkillOps)

연속 2라운드 score 진전 <5점 = plateau 신호. 즉시 4 옵션 제시 (A 추가 라운드 / B AD-50 override(게이트 격하 1회 면제, Human 승인 필수 — pipeline.md AD-50) / C 폐기 / D 극단 단순화). D 우선 권고 (over-engineering 거부 — enforcement-theater-prevention 정합).

## 연속 실행 원칙 (No-Pause)

cr-multi 실행 중 중간 확인 요청 금지:
- 오케스트레이터는 Codex → Gemini → Opus 레그를 **중간 Human 확인 없이 연속 실행**한다.
- 각 레그 결과가 반환되면 즉시 다음 레그를 스폰한다 (중간 출력 보고 금지).
- BLOCKED 판정이 반환되면 그 시점에만 [STOP] Human 에스컬레이션. 나머지는 자동 진행.

## 금지 행동

cr-multi 워크플로 및 각 검수 레그가 반드시 준수해야 할 금지 사항:

① **점수 조작 목적의 이슈 추가 금지** — 점수를 올리거나 내리기 위해 근거 없는 이슈를 생성하지 않는다.
② **이전 라운드와 동일 이슈 재제기 금지** — plateau 라운드에서 같은 이슈를 새 언어로 반복하는 것은 찾은 척(fabrication). 새 근거 없으면 해소된 것으로 간주.
③ **Spec 범위 외 enterprise 기능 요구 금지** — SME(중소규모)·MVP 스코프에서 분산 트랜잭션·HA·다중 테넌시 등 미요구 기능을 critical로 요구하는 것은 over-spec.
④ **구현 의도 무시한 전면 재설계 요구 금지** — 작성자의 설계 방향을 이해하지 않고 아키텍처 전면 변경을 BLOCK 조건으로 내거는 것은 금지.
⑤ **플래그 없는 외부 소스 코드 복사 권장 금지** — 라이선스·출처 미확인 코드 그대로 붙여넣기를 권고하지 않는다.

## 리뷰 요청자 행동 규칙

cr-multi를 호출하는 requester(오케스트레이터·Human)가 준수해야 할 규칙:

⑥ **"간단한 변경이라" 리뷰 생략 금지** — 변경 크기와 무관하게 리뷰 단계 준수.
⑦ **Critical 이슈 무시 후 진행 금지** — Critical 미수정 = FAIL verdict 자동 발행 (기계 차단). 수동 override 시 Human 승인 필수 (AD-50).
⑧ **High severity 이슈 잔존 시 검토 의무** — verdict=WARN 수신 시 high 이슈 목록 확인 후 진입 여부 결정 (자동 차단 없음, 검토 의무 — prose rule).
⑨ **유효한 기술 피드백 무비판 동의 금지** — 피드백 내용을 실제로 검토 후 수용/거부 판단.

## 리뷰 워커 출력 요건

⑩ **미커버 실패 시나리오 명시 의무** — 각 리뷰 워커는 통과 보고된 검증이 커버하지 않는 실패 시나리오를 최소 1개 명시한다(해당 사항 없으면 "없음"으로 명시). 검증 커버리지의 사각지대를 리뷰어 스스로 적대적으로 자문하게 해, 통과 판정에 안주하는 것을 방지하기 위함이다.

