---
name: agent-drift-auditor
description: "파이프라인의 agent drift 4종(삭제 agent 호출·중간 산출물 잔존·외부발송 미승인·모델 핀 누락/구버전)을 감사한다. PR 머지 전 하네스 무결성을 점검할 때 사용한다."
---

# agent-drift-auditor

Forge Check 8.9 — 하네스 무결성 감사. 4검사 실행 → `agent_drift` JSON 반환.

> 2026-08-03 전수조사(skills-1/S1-04) 정정 2건: ① description 이 약속한 "모델 핀 불일치"
> 검사가 **본문에 없었다**(선언-구현 괴리) → Check 4 로 실제 추가.
> ② Check 1 의 집합연산이 **교집합**이라 결손을 정반대로 계산했다 → 차집합으로 정정.

## 역할

Forge Dev 파이프라인 Check 8.9 담당 하네스 무결성 감사자. read-only grep 기반으로 4종 drift(삭제 Agent 호출·중간 산출물 잔존·외부발송 미승인·모델 핀 누락/구버전)를 탐지해 CRITICAL/HIGH → [STOP], MEDIUM → WARN 판정만 반환한다.

## 컨텍스트

Check 8.5와 병렬 실행 가능한 Forge Dev 파이프라인 단계. 입력은 `.specify/specs/*.md`, `pipeline.md`, `$HOME/.claude/skills/*/SKILL.md`, `${FORGE_ROOT:-$HOME/forge}/.claude/agents/*.md` 등 레포 내 파일이며, 수동 호출 시 `/agent-drift-auditor`로도 발동한다.

## 검사 3종

### Check 1: 삭제 Agent 호출 감지 (HIGH)

```
scan: .specify/specs/*.md, pipeline.md, $HOME/.claude/skills/*/SKILL.md 내 subagent_type 참조
compare: ${FORGE_ROOT:-$HOME/forge}/.claude/agents/*.md 실재 파일 목록
mismatch → drift_issues severity=HIGH
```

**방법**:
1. `grep -r "subagent_type" .specify/ pipeline.md $HOME/.claude/skills/` → 호출 목록 추출
2. `ls ${FORGE_ROOT:-$HOME/forge}/.claude/agents/` → 실재 에이전트 목록
3. **호출 목록 − 실재 목록 = 결손 목록** → HIGH
   ⚠️ 2026-08-03 정정: 종전 표기는 `∩`(교집합)이었다 — 교집합은 "정상적으로 실재하는 호출"이라
   결손과 정반대다. 그대로 구현하면 멀쩡한 호출이 전부 HIGH 로 뜬다.

재현 명령(차집합):
```bash
comm -23 \
  <(grep -rhoE 'subagent_type["'"'"']?\s*[:=]\s*["'"'"']([A-Za-z0-9:_-]+)' \
      .specify/ pipeline.md $HOME/.claude/skills/ 2>/dev/null \
    | grep -oE '["'"'"']([A-Za-z0-9:_-]+)["'"'"']$' | tr -d '"'"'"'"' | sort -u) \
  <(ls ${FORGE_ROOT:-$HOME/forge}/.claude/agents/*.md 2>/dev/null | xargs -n1 basename | sed 's/\.md$//' | sort -u)
```
출력이 **비어 있으면 PASS**(결손 0). 한 줄이라도 나오면 그 이름이 호출되지만 실재하지 않는 에이전트다.

**판별력 확인(역변조)**: 위 명령을 돌리기 전 아무 스킬에 `subagent_type: "no-such-agent"` 를
임시로 넣고 실행해 `no-such-agent` 가 출력되는지 확인한다 — 안 나오면 추출 정규식이 깨진 것이다.
확인 후 임시 문자열은 반드시 되돌린다.

### Check 2: 중간 산출물 잔존 (MEDIUM)

```
scan: Spec FR 목록 vs handover/*.md + docs/reviews/ 경로 기록 대조
FR 결과가 파일 미저장(대화에만 존재) → orphan_outputs
```

**방법**:
1. `.specify/specs/*.md` 또는 `--spec` 인자에서 FR 목록 추출
2. `grep -r "FR-[0-9]\+" .claude/handover/ docs/reviews/ forge-outputs/.claude/handover/` → 기록된 FR 목록
3. Spec FR - 기록 FR = 잔존 목록 → MEDIUM

### Check 3: 외부발송 전 Human 게이트 (CRITICAL)

```
scan: 구현 파일 내 외부발송 패턴
require: 동일 파일(또는 직접 호출 파일) 내 [STOP] / Human 승인 패턴
미존재 → external_send_ungated severity=CRITICAL
```

**방법**:
1. `grep -rn "mcp__plugin_telegram\|gh pr create\|send.*mail\|post.*slack\|mcp__.*reply\|mcp__.*send" src/ .claude/skills/` → 발송 코드 목록
2. 각 파일에서 `grep -n "\[STOP\]\|Human 승인\|human.*gate\|stop.*gate"` 확인
3. 승인 지점 없는 파일 → CRITICAL

### Check 4: 모델 핀 누락·구버전 (MEDIUM)

```
scan: ${FORGE_ROOT:-$HOME/forge}/.claude/agents/*.md frontmatter
require: `model:` 키 존재 AND 값이 금지 목록(구버전 핀)에 없을 것
누락 또는 구버전 → model_pin_drift severity=MEDIUM
```

**왜 MEDIUM 인가**: 핀이 없으면 **부모 모델을 상속**한다 — Opus 오케스트레이터가 스폰하면
저비용 래퍼까지 Opus 로 돌아 비용이 샌다. 실패하지 않으므로 조용하고, 그래서 감사가 필요하다.
금지 목록 정본 = `model-routing.md §세션 운영 모델`(구버전 핀 금지).

**방법**:
```bash
# 핀 누락 — frontmatter 에 `name:` 이 있는 파일만 '에이전트'로 센다.
#   (agents/ 안에는 에이전트가 아닌 참고문서도 있다 — 예: healer-reference.md 는
#    frontmatter 자체가 없다. 이걸 안 거르면 상시 1건 오탐이 난다. 2026-08-03 실측)
for f in ${FORGE_ROOT:-$HOME/forge}/.claude/agents/*.md; do
  fm=$(awk '/^---$/{n++; next} n==1' "$f")
  echo "$fm" | grep -q '^name:'  || continue
  echo "$fm" | grep -q '^model:' || echo "PIN-MISSING $(basename "$f")"
done
# 구버전 핀
grep -lE '^model:.*(opus-4-8|opus-4-7|opus-4-6|sonnet-4-6)' ${FORGE_ROOT:-$HOME/forge}/.claude/agents/*.md 2>/dev/null \
  | xargs -r -n1 basename | sed 's/^/PIN-LEGACY /'
```
출력 0줄 = PASS. (2026-08-03 실측 기준선: agents 36종 중 PIN-MISSING 0 · PIN-LEGACY 0.)

## 출력 형식

```json
{
  "checkId": "check-8.9",
  "status": "PASS|WARN|FAIL",
  "agent_drift": {
    "missing_agents": ["subagent_type명"],
    "orphan_outputs": ["FR-ID"],
    "external_send_ungated": ["파일경로:라인"],
    "model_pin_drift": ["에이전트명:PIN-MISSING|PIN-LEGACY"],
    "drift_issues": [
      {
        "severity": "CRITICAL|HIGH|MEDIUM",
        "check": "1|2|3|4",
        "finding": "설명",
        "evidence": "파일경로:라인"
      }
    ]
  },
  "summary": "CRITICAL N / HIGH N / MEDIUM N"
}
```

## 판정 기준

| 판정 | 조건 | 행동 |
|------|------|------|
| **FAIL** | CRITICAL 1개+ 또는 HIGH 1개+ | Lead에게 **[STOP]** 에스컬레이션 |
| **WARN** | MEDIUM 1개+ (CRITICAL·HIGH 없음) | Lead에게 보고, 자동 진행 가능 |
| **PASS** | 이슈 0 | 통과 |

## 주의사항

- **읽기 전용** — 코드 수정 X, 결과 JSON만 반환
- subagent 격리 실행 — 메인 컨텍스트 오염 방지
- Check 1 scan 범위: forge 레포 + 현재 프로젝트 `.specify/` 양쪽
- Check 2 FR 추출 실패 시: `"matrixSource": "spec-unavailable"` 플래그 후 Check 2 SKIP

<!-- root-cause(skills-1/S1-06, 2026-08-03 관측): 이 아래 있던 "자동 평가(eval-rubric 통합)"·"Evaluator (Wave 2.5)" 두 절은 8개 SKILL.md에 동일 문구로 복제된 산문이었고 실제 배선(hook/Agent() 호출)이 0건이었다(재현: `grep -rn "eval-rubric\|eval_cases" .claude/hooks .claude/settings.json` → 무관 hit 2건뿐, 둘 다 트리거 아님). "자동 누적"이라 썼지만 실제로는 아무 코드도 이를 실행하지 않는다 — 산문 제거. 독립 검증이 실제로 가치 있는 codex-review·forge-check-security 2건만 실제 Agent() 호출로 승격했다(해당 파일 참조). 이 스킬은 read-only 감사 스킬이라 별도 2차 검증의 한계효용이 낮다고 판단해 제거만 하고 승격하지 않았다.
     실패 시 자기수정은 [[pev-self-correction]] 그대로 적용(위 §자동 평가 섹션에 있던 지시는 유지). -->
> 실패 시 [[pev-self-correction]] 적용
