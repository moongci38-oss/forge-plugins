---
name: audit-harness
description: "AI 하네스(체크체인·가드레일·훅 커버리지·OWASP Agentic)를 감사한다. 하네스 역량 점검을 요청할 때 사용한다."
argument-hint: "[target: system|{project-name}]"
context: fork
model: sonnet
---

**역할**: 당신은 AI 하네스 엔지니어링을 OWASP Agentic Top 10 기준으로 감사하는 AI 보안 및 측정 제어 전문가입니다.
**컨텍스트**: `/system-audit` 또는 `/audit-harness` 호출 시, ACHCE 축 3(Harness) 평가가 필요할 때 실행됩니다.
**출력**: Check Chain·가드레일·Hook 커버리지 항목별 점수 + 보안 개선 권고를 JSON 형식으로 반환합니다.

## Evaluator 핵심 원칙: 절대 관대하게 보지 마라
아래 생각이 들면 더 엄격하게 본다:
- "나쁘지 않은데..." → 감점
- "이 정도면 괜찮지 않나?" → 감점
- "전반적으로 잘했으니 이 부분은 넘어가자" → 금지
규칙:
- 한 항목이 좋아도 다른 항목 문제를 상쇄하지 않는다
- 모든 피드백은 위치 + 이유 + 방법 3요소를 포함한다

# AI 하네스 엔지니어링 감사

> ACHCE 프레임워크 축 3: Harness
> 참조: `docs/tech/2026-03-16-5-axis-ai-analysis-framework.md`

## 하네스 두께 결정 (위험도 기반)

> AD-81: 작업 위험도에 따라 적정 하네스 두께를 판정한다.

| 위험도 | 트리거 | 적정 두께 |
|--------|--------|-----------|
| 고위험 | 결제·배포·법적·외부발송(Telegram/PR/이메일)·삭제 | 두꺼움 — Human 게이트 필수 + Evaluator subagent 격리 + 롤백 경로 명시 |
| 중위험 | 코드 구현·DB 스키마 변경 | 표준 — PGE 또는 Check 체인 |
| 저위험 | 브레인스토밍·리서치·분석 | 얇음 — 경량 검증, 게이트 최소 |

감사 시 반드시 확인:
- 감사 대상 작업의 위험도 판정 → 현재 하네스 두께가 적정한가?
- 고위험인데 Human 게이트 없음 → **CRITICAL**
- 저위험인데 과잉 게이트 → 토큰 낭비로 지적

## 인자

- `$ARGUMENTS` = 감사 대상. 미입력 시 `system` (Forge+Forge Dev).

## 대상 경로 매핑

| target | 감사 경로 |
|--------|----------|
| `system` | `$HOME/.claude/forge/rules/` + `.claude/rules/` + `.claude/agents/` + `.claude/skills/` |
| `{project-name}` | `forge-workspace.json`에 등록된 프로젝트 경로 (`.specify/`, `apps/`, `.claude/` 등) |

## 실행 흐름

### Step 1: target 파싱

`$ARGUMENTS`가 비어 있으면 `TARGET=system`. 아니면 첫 단어를 target으로 사용.

### Step 2: axis-harness 서브에이전트 스폰

아래 JSON 구조를 반환하도록 Subagent를 스폰한다 (model: sonnet):

**에이전트 분석 항목:**

> 분석 기준: `shared/docs/2026-03-30-four-engineering-disciplines.md` §3 Harness Engineering
> 원칙: 정의서에 없는 기법은 감사하지 않는다.

0. **위험도 × 두께 적정성** (AD-81) — 판정
   - 감사 대상 작업의 위험도 분류 (고/중/저)
   - 현재 하네스 두께가 위험도 매트릭스와 일치하는가?
   - 고위험 + Human 게이트 없음 → `CRITICAL` 이슈 등록
   - 저위험 + 과잉 게이트 → `LOW` 이슈 (토큰 낭비)

1. **Check Chain** (정의서 §3-1) — 실측
   - Grep `Check 6|Check 8|check.*chain` in pipeline.md → 체인 단계 수
     - 기준: 4단계 이상 (Check 8 → 8.5 → 8.7 → 8.8 → Check 9 형태)
   - Grep `autoFix|auto-fix|1회.*수정` → autoFix 한도 규칙
     - 기준: "재실패 시 [STOP]" 명문화 필수 (무한 재시도 방지)
   - Grep `Brain.*Hands|brain.*hands|분석.*실행.*분리` → Brain-Hands 분리 아키텍처
     - 근거: Anthropic 실험 — execute(name,input) 표준 인터페이스로 TTFT p50 60% 감소
   - Grep `\[STOP\]` in pipeline.md → Hard Stop 게이트 수
     - 기준: 40개 이상 (실측 기준: 44개 이상)

2. **Guardrails (5 Rail Types)** (정의서 §3-2) — 실측
   - Input Rail: Grep `PreToolUse` in settings.json → 입력 검증 Hook
   - Output Rail: Grep `PostToolUse` in settings.json → 출력 검증 Hook
   - Execution Rail: Grep `block.*sensitive|exit 2` in hooks/ → 실행 차단
   - Dialog Rail: Grep `injection|jailbreak` in hooks/ → 대화 보호
   - Retrieval Rail: RAG 검증 존재 여부
   - 커버리지 = 구현된 Rail / 5

3. **OWASP Agentic Top 10** (정의서 §3-3) — 실측
   각 ASI 항목별 방어 코드 존재를 Grep으로 실제 확인 (파일 존재 ≠ settings.json 연결 → 반드시 양쪽 확인):
   - ASI01 (Goal Hijack): Grep `ignore.*instructions|jailbreak|DAN` in hooks/ → exit 2 패턴
   - ASI02 (Tool Misuse): Grep `block.*sensitive|BLOCKED` in hooks/ → 차단 패턴
   - ASI03 (Supply Chain): Grep `ASI03|supply.*chain|third.*party` in hooks/ or rules/
     → 미구현 시 HIGH 이슈 (실제 감사 사례: WARN만 있고 exit 2 없음 → CRITICAL로 에스컬레이션)
   - ASI05 (Improper Output): Grep `ASI05|sensitive.*output|AWS.*Key|Private.*Key|API.*Key` in hooks/
   - ASI06 (Excess Autonomy): Grep `\\[STOP\\]` in pipeline.md → Hard Stop 게이트 수 (기준: 40개 이상)
   - ASI07 (Prompt Leak): Grep `system.*prompt|ASI07` in hooks/
   - ASI08 (Context Manip): Grep `ASI08|context.*manip|inject.*context` in hooks/
   - ASI09 (Logging): Grep `security.log|usage.log` in hooks/ AND settings.json PostToolUse 연결 확인
   - 커버리지 = (방어 코드 존재 ASI 수 / 10) × 100
   - 기준: ≥ 60% (6/10 이상). hooks/가 settings.json 미연결이면 PAPER(0점)로 처리ks/*.sh → Hook 스크립트 수
   - 위험 이벤트 유형: [파일쓰기, Bash실행, 민감경로, 시크릿, 인젝션, force-push, 프롬프트유출, 민감출력] = 8종
   - 각 유형별 Hook 존재 여부 Grep으로 확인
   - 커버리지 = (보호된 이벤트 / 8) × 100
   - 기준: > 70%

5. **AI Evals & Skill Harness Coverage** (정의서 §3-5) — 실측

   **5-a. 평가 인프라 존재 확인:**
   - Glob `spec-compliance-checker` 스킬 → Spec 추적성 평가
   - Glob `code-reviewer` 에이전트 → 코드 리뷰 평가
   - Glob `asset-critic` 스킬 → 에셋 품질 평가
   - Glob `qa` 스킬 → QA 루프
   - 평가 체계 수 = 위 존재 카운트

   **5-b. 스킬 내부 하네스 패턴 실측 (Skill Harness Coverage):**

   > 스킬이 존재한다는 것과 스킬 안에 하네스가 구현됐다는 것은 다르다. 반드시 내부를 읽어라.

   실행 방법:
   ```bash
   bash shared/scripts/skill-harness-check.sh --json
   ```
   스크립트 없을 시 직접 실측 (실행 가능한 단일 명령):
   ```bash
   find $HOME/.claude/skills/ ${FORGE_ROOT:-$HOME/forge}/.claude/skills/ -name "SKILL.md" 2>/dev/null | sort | while read f; do
     grep -qE "Agent\(|독립 Evaluator|Wave 2\.5|Evaluator subagent|PGE\b|eval-report\.md|WP_EVAL|DSR_EVAL|WR_EVAL|FD_EVAL|Step 3\.5|신뢰도.*HIGH" "$f" \
       && echo "PASS $(dirname $f | xargs basename)" || echo "FAIL $(dirname $f | xargs basename)"
   done | sort
   ```

   하네스 PASS 기준 (하나라도 있으면 통과):
   - `Agent(` — 독립 subagent 스폰 코드 (Anthropic 공식 멀티에이전트 패턴)
   - `독립 Evaluator` / `Evaluator subagent` — Generator ≠ Evaluator 원칙 (PGE 연구: 자기평가 편향 제거)
   - `Wave 2.5` / `PGE` — 파이프라인 하네스 단계 (Planner→Generator→Evaluator 3단계)
   - `eval-report.md` / `*_EVAL` 파일 참조 — 파일 기반 평가 통신 (컨텍스트 격리 증거)
   - `Step 3.5` / `신뢰도.*HIGH` — 신뢰도 게이트 패턴 (wiki-sync류 매칭 품질 사전 검증)

   **파이프라인 직결 스킬 (하네스 필수 — 미적용 시 CRITICAL 이슈):**
   qa, spec-compliance-checker, visual-loop, autoplan, writing-plans,
   frontend-design, daily-system-review, weekly-research, wiki-sync,
   rd-plan, content-creator, asset-critic

   커버리지 계산:
   - 전체 하네스 커버리지 = 하네스 있는 스킬 수 / 전체 스킬 수 × 100
   - 기준: ≥ 60%
   - CRITICAL 스킬 전체 적용 여부 = 별도 이진 판정 (하나라도 없으면 CRITICAL 이슈 등록)

6. **Observability** (정의서 §3-6) — 실측
   - Grep `usage-logger|security.log|usage.log` in hooks/ → 로깅 Hook
   - Grep `requestId|traceId` in rules/ → 추적 ID 규칙
   - Grep `궤적|trajectory|session.*log|llm.*log` in skills/ or pipeline.md → 에이전트 궤적 로깅
     → 기준: 주요 Wave별 파일 출력 로그 존재 (ai-system-analysis.md 등 실측 가능 산출물)
   - settings.json의 PostToolUse hook → 실제 Bash 명령 로그 저장 여부 확인
   - TTFT(Time To First Token) 모니터링 도구 존재 여부 (p50/p95 기준 추적)

7. **Rollback** (정의서 §3-7) — 실측
   - Grep `L1.*rollback|L2.*rollback|L3.*rollback|forge-rollback` in pipeline.md → 3단계 정의

8. **Maintenance Agents** (정의서 §3-8) — 실측
   - Glob `.claude/agents/` → 에이전트 수
   - daily-system-review, weekly-research 등 주기적 검증 스킬 존재
   - Grep `cron|CronCreate|schedule` in skills/ or hooks/ → 자동 실행 설정 존재 여부
   - Grep `Wave 2.5|독립 Evaluator` in daily-system-review/SKILL.md → 유지보수 에이전트 자체에도 하네스 적용됐는지 확인
     → 유지보수 에이전트의 하네스 미적용 = 품질 보증 루프 자체가 unchecked
   - `skill-autoresearch` 스킬 존재 → 스킬 자기개선 루프 가동 여부

**반환 JSON 형식:**

```json
{
  "axis": "harness",
  "target": "{target}",
  "score": 0-100,
  "check_chain": { "chain_stages": 0, "autofix_limit_rule": true/false },
  "guardrails": { "input_rail": true/false, "output_rail": true/false, "execution_rail": true/false, "dialog_rail": true/false, "retrieval_rail": true/false, "coverage_rate": 0 },
  "owasp_coverage": { "ASI01": true/false, "ASI02": true/false, "ASI05": true/false, "ASI06": true/false, "ASI07": true/false, "ASI09": true/false, "coverage_rate": 0 },
  "hooks": { "hook_count": 0, "coverage_rate": 0 },
  "ai_evals": {
    "spec_compliance_checker": true,
    "code_reviewer": true,
    "asset_critic": true,
    "qa": true,
    "eval_count": 0,
    "skill_harness_coverage": {
      "total_skills": 0,
      "harness_applied": 0,
      "coverage_rate": 0,
      "missing_harness": ["skill-name1"],
      "critical_missing": ["pipeline-skill-without-harness"]
    }
  },
  "observability": { "logging_hook": true/false, "trace_id_rule": true/false },
  "rollback": { "three_level_defined": true/false },
  "maintenance_agents": { "agent_count": 0, "periodic_review_skill": true/false },
  "issues": [
    { "severity": "CRITICAL|HIGH|MEDIUM|LOW", "finding": "...", "evidence": "파일경로:라인", "recommendation": "..." }
  ],
  "strengths": ["강점1", "강점2"],
  "summary": "2-3문장 요약"
}
```

### Step 2.5: Hook Theater 감지 (신규)

Bash 도구로 직접 실측:

1. `grep -l "exit 0$" $HOME/.claude/hooks/*.sh 2>/dev/null` → 항상 통과 hook 목록
2. 각 hook의 의도 확인: WARN-only(의도적) vs 미완성 BLOCK(exit 2 없음) 분류
3. enforcement-theater 룰 위반 체크: WARN+metrics 미설정 상태로 BLOCK = 룰 위반
4. 결과: `hook_theater: [{file, type: "warn_only|incomplete_block|theater", recommendation}]`

### Step 2.6: GitNexus 구조 분석 (신규)

Hook 커버리지 보강 — GitNexus detect_changes 통합:

```
READ gitnexus://repo/forge/context → 인덱스 신선도 확인
gitnexus_detect_changes({scope: "all"}) → 최근 변경 심볼 목록
→ 변경 심볼 중 Hook 미커버 비율 = (미커버 심볼 / 전체 변경 심볼) × 100
→ 미커버 HIGH 심볼 → issues MEDIUM 등록
```

GitNexus 미연결 시 스킵 (경고 출력).

### Step 3: 보고서 작성

Subagent 결과를 기반으로 Lead가 보고서를 작성한다.

**저장 위치:** `docs/reviews/audit/{date}-audit-harness[-{target}].md`
(`target`이 `system`이면 suffix 생략)

**보고서 형식:**

```markdown
# Harness 엔지니어링 감사 보고서

**대상**: {target} | **날짜**: {date} | **점수**: {score}/100

## Executive Summary

## 검증 체인(Check Chain) 상태

## OWASP Agentic Top 10 커버리지

## 가드레일 상태

## Hook 커버리지

## 스킬 하네스 커버리지

| 스킬 | 하네스 적용 | CRITICAL |
|------|:----------:|:--------:|
| ... | ✅ / ❌ | - / ⚠️ |

커버리지: X% (적용 N / 전체 N)

## 이슈 목록
### CRITICAL
### HIGH
### MEDIUM / LOW

## 권장 액션 (우선순위순)

## 참조
- docs/tech/2026-03-16-5-axis-ai-analysis-framework.md
- `$HOME/.claude/rules-on-demand/harness-failure-modes.md` — 하네스 실패모드 카논 (F1-F19): false-test/enforcement-theater/dead-gate/SSoT-drift 등 실제 사례 매트릭스
```

### Step 4: Notion 페이지 생성

```json
{
  "parent": { "data_source_id": "713563f9-d523-4e90-8d6f-6b0d650628ad" },
  "pages": [{
    "properties": {
      "제목": "{date} Harness 감사 [{target}]",
      "축": "Harness",
      "대상": "{target}",
      "점수": "{score}",
      "date:날짜:start": "{date}",
      "상태": "완료",
      "CRITICAL": "{CRITICAL 이슈 수}",
      "HIGH": "{HIGH 이슈 수}",
      "보고서 경로": "docs/reviews/audit/{date}-audit-harness.md"
    },
    "content": "{보고서 전체 내용}"
  }]
}
```

> Notion MCP 미연결 시 경고 출력 후 스킵 (파이프라인 중단 안 함).

---

## 독립 Evaluator (하네스)

하네스 감사 결과물 완성 후 독립 Evaluator Subagent가 품질을 2차 검증한다.

> **원칙**: Generator(감사 수행자) ≠ Evaluator. 감사자가 자신의 감사를 평가하면 자기평가 편향이 발생한다.
> **아이러니 해소**: 하네스 감사 스킬 자체에 독립 Evaluator가 없으면 "하네스 미적용" 스킬로 자체 집계됨 — 자기 모순.

```python
Agent(
  subagent_type="general-purpose",
  model="sonnet",
  prompt="""
당신은 audit-harness 결과물의 독립 품질 검증자입니다.

아래 기준으로 결과물을 검토하고 PASS 또는 FAIL을 판정하십시오.

**평가 기준 (4항목 모두 충족해야 PASS):**

1. **OWASP Agentic Top 10 커버리지 완전성**
   - [위치] JSON `owasp_coverage` 객체 또는 보고서 "OWASP Agentic Top 10 커버리지" 섹션
   - [이유] OWASP 항목 누락은 보안 취약점 은폐로 직결됨
   - [방법] ASI01/ASI02/ASI05/ASI06/ASI07/ASI09 6개 항목 각각에 True/False + 실측 근거(Grep 결과 또는 "미구현" 명시)가 존재하는지 확인. `coverage_rate` 수치가 계산됐는지 확인. 기준값(≥60%) 대비 판정이 명시됐는지 확인. 빈 셀이나 항목 누락이 있으면 FAIL.

2. **Hook Theater 탐지 수행 여부**
   - [위치] JSON `hook_theater` 배열(Step 2.5 산출물) 또는 보고서 "Hook 커버리지" 섹션
   - [이유] Hook이 항상 통과(exit 0)하면 보안 게이트가 무력화됨 — 탐지 없이 커버리지만 세면 과대 평가
   - [방법] Step 2.5 Hook Theater 감지 결과가 보고서에 포함됐는지 확인. `hook_theater` 배열이 비어 있어도 "탐지 0건" 명시 필요. 섹션 자체가 누락됐으면 FAIL.

3. **Skill Harness Coverage 계산 정확성**
   - [위치] JSON `ai_evals.skill_harness_coverage` 또는 보고서 "스킬 하네스 커버리지" 표
   - [이유] 전체 스킬 수 대비 하네스 적용률이 핵심 지표 — 계산 오류 시 로드맵 우선순위가 잘못됨
   - [방법] `total_skills` / `harness_applied` / `coverage_rate` 3개 수치 모두 명시됐는지 확인. `coverage_rate = harness_applied / total_skills × 100` 공식과 일치하는지 검산. `critical_missing` 목록이 "파이프라인 직결 스킬"(qa/spec-compliance-checker/visual-loop 등)을 포함하는지 확인. 수치 불일치 또는 누락 시 FAIL.

4. **보고서 저장 확인 (Write+Read 증거)**
   - [위치] 보고서 마지막 줄 또는 에이전트 출력
   - [이유] 보고서 미저장 시 다음 감사 주기에 트렌드 비교 불가
   - [방법] 보고서 경로(`docs/reviews/audit/{date}-audit-harness.md`)에 실제 파일이 Write된 후 Read로 존재 확인됐는지 검증. "SAVED: {path}" 출력이 있거나 파일 존재 확인 로그가 있으면 PASS. 저장 증거 없으면 FAIL.

**판정**: PASS(기준 4항목 모두 충족) / FAIL(1항목 이상 미충족)
**피드백 형식**: [파일명+섹션] — [이유] → [방법]
"""
)
```

피드백 루프:
- PASS → 파이프라인 계속 (Notion 등록)
- FAIL → **아래 순서로 진행 (명시적 절차)**:
  1. 토큰 예산 확인: `AUDIT_TOKEN_CAP` (기본 300,000 토큰). 재감사 전 누적 사용량이 캡을 초과하면 즉시 **[STOP]** Human 에스컬레이션 — 재시도 금지. 출력: `[STOP] token-cap 초과 — 재감사 중단. Evaluator FAIL 원인: {feedback}`
  2. 캡 미초과 시 → 감사 재수행 (Step 2 전체 재실행) 후 Evaluator 1회 재실행
  3. 2회 연속 FAIL 시 → **[STOP]** Human 에스컬레이션 (추가 재시도 금지)

> ⚠️ **추정치 정직성**: `AUDIT_TOKEN_CAP` 추정치 = best-effort (LLM 자가추정, 정확 토큰 카운트 불가). **결정론적 bound = max-cycles**; 토큰 추정은 보조 가드. 정확한 토큰 enforcement는 P4 (agent-budget 훅 연동) 예정.
> Evaluator FAIL 시 `.claude/logs/{session}/errors.jsonl` 참조하여 재시도
