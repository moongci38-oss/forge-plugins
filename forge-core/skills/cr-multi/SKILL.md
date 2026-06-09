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
/cr-triple ${FORGE_OUTPUTS:-$HOME/forge-outputs}/02-product/projects/forge-platform/specs/my-spec.md
```

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

## 보안

- Secret 사전 스캔 (전송 전 차단)
- `CR_MULTI_AUTO=off` 기본 (명시 opt-in 필요)
- 감사 로그: `${FORGE_OUTPUTS:-$HOME/forge-outputs}/.claude/audit/cr-multi-calls.jsonl`

## Cache Stats 로깅 (AD-105 H2)

cr-multi 실행 후 usage 데이터 기록:
```bash
bash ~/.claude/scripts/cache-stats-logger.sh cr-multi "$MODEL" "$CACHE_READ" "$CACHE_CREATION" "$RAW_INPUT" cr-review
```
usage 필드는 Anthropic SDK response.usage 에서 추출. 미지원 시 0 기본값 사용.

## Workflow 실행 (계획서 P0-4)

mcp__codex__ 토큰 = **Phase -1 자동 발행 내장** (외부 선발행 불필요).

```js
// Workflow 실행 (Phase -1 ApproveWorker + GitNexus StructuralContext + 3-LLM parallel)
Workflow({
  script: Bash("cat ~/.claude/skills/cr-multi/workflow.js"),
  args: { slug: SLUG, targetPath: TARGET, mode: 'triple', stage: STAGE }
})
```

Agent Teams fallback: `CLAUDE_CODE_DISABLE_WORKFLOWS=1` 시 기존 Agent 패턴.

## 참조

- 명령: `~/forge/.claude/commands/cr-multi.md`
- 룰: `~/.claude/rules-on-demand/multi-gate-review.md`
- Triage: `~/forge/shared/scripts/cr-multi-triage.py`
- Plateau: `~/forge/shared/scripts/cr-multi-plateau-guard.py`

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

연속 2라운드 score 진전 <5점 = plateau 신호. 즉시 4 옵션 제시 (A 추가 라운드 / B AD-50 override / C 폐기 / D 극단 단순화). D 우선 권고 (over-engineering 거부 — enforcement-theater-prevention 정합).
