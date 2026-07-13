---
name: cr-multi
description: "Multi-worker 검수 스킬 (Codex + Gemini Double / Opus + Codex + Gemini Triple). 단일 Codex 검수 대비 100% 보완 카테고리 커버. 트리거: /cr-multi, /cr-double, /cr-triple, plan/spec 저장 후 자동(CR_MULTI_AUTO=on), plateau 3회 자동 승격."
input: target-file path + mode (double|triple) + stage (plan|code|test|final)
output: "${FORGE_OUTPUTS:-$HOME/forge-outputs}/docs/reviews/{stage}/{slug}-cr-multi.json (AD-90 증거 JSON)"
eval_cases: off
---

# /cr-multi

Codex + Gemini (Double) 또는 Opus + Codex + Gemini (Triple) 병렬 리뷰 + Triage 합산 verdict.

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

## 모드

| 모드 | Worker | 합산 |
|------|--------|------|
| Double | Codex + Gemini | `codex×0.6 + gemini×0.4` |
| Triple | Opus + Codex + Gemini | `opus×0.3 + codex×0.4 + gemini×0.3` |

## 산출물

```
${FORGE_OUTPUTS:-$HOME/forge-outputs}/docs/reviews/{stage}/{slug}-cr-multi.json
```

AD-90 증거 JSON 포맷: `{verdict, score, issues[], mode, slug, degraded}`

**degraded 표기 의무 (Batch 3 증거등급 정직화)**: `degraded=true`(worker 정족수 미달 — 외부 워커 Codex/Gemini 미가용으로 동일 모델 대체 등)면 사람이 보는 최종 결과(Workflow 반환값·AD-90 JSON)에 `degradedBanner`("⚠️ DEGRADED: N/M worker 생존 — 근거등급 낮음") 필드가 additive로 포함된다. 이 검수 결과를 인용·보고할 때 배너를 함께 표기할 것 — "3-LLM 적대 검수"로 재현하지 않는다.

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

mcp__codex__ 토큰 = **Phase -1 자동 발행 내장** (외부 선발행 불필요).

```js
// Workflow 실행 (Phase -1 ApproveWorker + GitNexus StructuralContext + 3-LLM parallel)
Workflow({
  script: Bash("cat $HOME/.claude/skills/cr-multi/workflow.js"),
  args: { slug: SLUG, targetPath: TARGET, mode: 'triple', stage: STAGE }
})
```

Agent Teams fallback: `CLAUDE_CODE_DISABLE_WORKFLOWS=1` 시 기존 Agent 패턴.

## 참조

- 명령: `${FORGE_ROOT:-$HOME/forge}/.claude/commands/cr-multi.md`
- 룰: `$HOME/.claude/rules-on-demand/multi-gate-review.md`
- Triage: `${FORGE_ROOT:-$HOME/forge}/shared/scripts/cr-multi-triage.py`
- Plateau: `${FORGE_ROOT:-$HOME/forge}/shared/scripts/cr-multi-plateau-guard.py`

## Evaluator (Wave 2.5)

독립 Evaluator subagent가 산출물 품질을 검증합니다.

```
Evaluator 역할: 산출물 독립 검증
모델: claude-haiku-4-5 (경량, 편향 최소화)
격리: 메인 컨텍스트 오염 방지
```

판정 기준:
- PASS: 모든 핵심 기준 충족, 즉시 사용 가능
- WARN: 사용 가능하나 개선 권장, 사용자 확인 후 진행
- FAIL: 핵심 기준 미충족, 재실행 필요

eval_cases.jsonl에 결과 자동 누적.

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
