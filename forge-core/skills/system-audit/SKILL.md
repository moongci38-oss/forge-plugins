---
name: system-audit
description: "6축 통합 시스템감사(Agentic·Context·Harness·Cost·Human-AI+중복). 전체 AI시스템 역량점검 요청 시. 하네스 슬림화만 원하면 harness-legacy-scan."
argument-hint: "[target: system|{project-name}]"
context: fork
model: opus
---

> **저장 경로 앵커 (2026-08-04 정정)**: 아래 경로는 반드시 `${FORGE_OUTPUTS:-$HOME/forge-outputs}/`
> 로 시작한다. 앵커 없이 `docs/reviews/...` 로 쓰면 **cwd 에 따라 착지 레포가 갈린다** —
> `${FORGE_ROOT:-$HOME/forge}/docs/reviews` 와 `${FORGE_ROOT:-$HOME/forge}-outputs/docs/reviews` 가 **둘 다 실재**하기 때문이다.
> 실사고(2026-08-03): cwd 가 `${FORGE_ROOT:-$HOME/forge}` 인 세션이 감사 리포트를 프로젝트 repo 안에 떨궈
> `forge-core.md §경로`("하네스 개선 리포트는 프로젝트 repo 안 금지")를 위반했다.
> 실측 근거: 정본 레인 `${FORGE_ROOT:-$HOME/forge}-outputs/docs/reviews/audit/` 16건 vs 오착지 `${FORGE_ROOT:-$HOME/forge}/…` 1건
> (2026-08-04 관측).


**역할**: 당신은 ACHCE 5축 에이전트를 병렬 스폰하여 AI 시스템을 통합 감사하는 수석 시스템 감사 오케스트레이터입니다.
**컨텍스트**: `/system-audit` 호출 또는 종합 AI 시스템 점검이 필요할 때 실행됩니다.
**출력**: 5축 병렬 감사 결과 + 축간 트레이드오프 분석 + 통합 개선 로드맵을 마크다운 보고서로 반환합니다.

## Evaluator 핵심 원칙: 절대 관대하게 보지 마라
아래 생각이 들면 더 엄격하게 본다:
- "나쁘지 않은데..." → 감점
- "이 정도면 괜찮지 않나?" → 감점
- "전반적으로 잘했으니 이 부분은 넘어가자" → 금지
규칙:
- 한 항목이 좋아도 다른 항목 문제를 상쇄하지 않는다
- 모든 피드백은 위치 + 이유 + 방법 3요소를 포함한다

# 5축 통합 시스템 감사 (ACHCE)

> ACHCE: Agentic · Context · Harness · Cost · Human-AI Escalation
> 참조: `$FORGE_OUTPUTS/docs/tech/2026-03-16-5-axis-ai-analysis-framework.md`

## 감사 유형 정의

| 유형 | 방법 | 신뢰도 |
|------|------|:------:|
| **실측 (Audit)** | Glob/Grep/wc/Read로 파일 직접 탐색하여 카운트 | 높음 |
| **추정 (Estimate)** | 바이트→토큰 변환, 패턴 매칭 기반 계산 | 중간 |
| **설계 검토 (Design Review)** | 코드/규칙 구조 분석, LLM 판단 | 낮음 |
| **미측정 (N/A)** | 런타임 로그/이력 데이터 필요, 현재 수집 불가 | - |

> 모든 지표에 유형을 명시한다. "실측"이 아닌 항목은 과신하지 않는다.

## 항목별 강제 수준

| 수준 | 의미 | 점수 반영 |
|------|------|:--------:|
| **ENFORCED** | Hook/스크립트가 **종료코드 2로 위반 차단** — `exit 2` · `sys.exit(2)` · `SystemExit(2)` 전부 포함 | 100% 반영 |

> ⚠️ **차단력은 grep 으로 판정하지 않는다 (C-2, 2026-08-22).** `grep 'exit 2'` 만 세면
> `python3 << PYEOF … sys.exit(2)` 형태의 훅이 전부 "무력"으로 오판된다 — **이 감사가
> 실제로 그 오판을 했다**(초안에서 `validate-output.sh` 를 CRITICAL 로 올렸다가 실행
> 시험으로 철회). grep 은 **후보를 좁히는 데만** 쓰고, 판정은 **실행 시험**으로 한다:
> 합성 페이로드를 stdin 으로 주입하고 종료코드를 본다.
> 재현: `echo '{"tool_input":{...합성 페이로드...}}' | bash <훅> ; echo "EXIT=$?"`
> 폐기조건: 전 훅이 단일 언어로 통일돼 grep 한 줄로 판정 가능해지면 이 주의를 삭제한다.
| **GUIDED** | 규칙 존재, AI가 자발적 준수 | 70% 반영 |
| **PAPER** | 감사에만 존재, 운영 미적용 | 점수 제외 (0%) |

> PAPER 항목은 보고서에 "미적용" 표기만 하고 점수에 포함하지 않는다.

## 인자

- `$ARGUMENTS` = 감사 대상. 미입력 시 `system` (Forge+Forge Dev).

## 대상 경로 매핑

| target | 감사 경로 |
|--------|----------|
| `system` | `$FORGE_ROOT/.claude/` 또는 `$HOME/.claude/forge/` + `.claude/rules/` + `.claude/skills/` + `.claude/agents/` |
| `{project-name}` | `forge-workspace.json`에 등록된 프로젝트 경로 (`.specify/`, `apps/`, `.claude/` 등) |

## 실행 흐름

### Step 0: target 파싱

`$ARGUMENTS`가 비어 있으면 `TARGET=system`. 아니면 첫 단어를 target으로 사용.

감사 시작 전 아래 메시지를 출력한다:
```
🔍 5축 통합 감사 시작: {target}
Wave 1 — 5개 축 에이전트 병렬 스폰 중...
```

---

### Workflow 분기 (Step 0.5)

`CLAUDE_CODE_DISABLE_WORKFLOWS` 환경변수 미설정 시 → Workflow 도구로 위임.

**⚠️ 토큰 선발행 필수 (CRITICAL)**: Verify phase가 `codex-critic`(mcp__codex__) + `gemini`(mcp__gemini__) 호출.
이 MCP는 `multiagent-mcp-direct.sh`+`multiagent-approval-verify.sh` 훅이 approve-worker HMAC 토큰 없으면 BLOCK.
Workflow 스크립트는 셸 불가 → **기동 前 외부 선발행** 필수 (cr-multi/SKILL.md 패턴 동일):

```bash
TODAY=$(date +%Y-%m-%d); SLUG="system-audit-${TODAY}"
# --cr 플래그로 Codex 레그 제어: on(기본) | degrade | off
# CR_MODE=$(${FORGE_ROOT:-$HOME/forge}/shared/scripts/cr-mode.sh)  # cr-mode.sh 로 자동 결정
CR_MODE="${CR_MODE:-on}"

# crMode='on' 시만 codex-critic 선발행 필요 (degrade/off는 스킵)
if [ "$CR_MODE" = "on" ]; then
  FORGE_TEST_MODE=1 python3 $HOME/.claude/skills/approve-worker/scripts/approve-worker-sign.py \
    --task "$SLUG" --worker codex-critic --tools mcp__codex__codex --paths "$TARGET"
fi
FORGE_TEST_MODE=1 python3 $HOME/.claude/skills/approve-worker/scripts/approve-worker-sign.py \
  --task "$SLUG" --worker gemini --tools mcp__gemini__analyze_media --paths "$TARGET"
# 그 후 Workflow 기동
Workflow({
  script: Read("${FORGE_ROOT:-$HOME/forge}/.claude/skills/system-audit/workflow.js"),
  args: { date: TODAY, projectRoot: TARGET, slug: SLUG, crMode: CR_MODE }
})
```

> nonce 1-shot — verifier 재호출 시 fresh 토큰 필요하면 사용 후 `_consumed/` 격리 (cr-multi 참조).
> `--cr` 값: `on`(기본, 3-LLM) | `degrade`(Codex rate-limit/비용 절감 시) | `off`(Codex 완전 비활성).
> `cr-mode.sh` 경로: `${FORGE_ROOT:-$HOME/forge}/shared/scripts/cr-mode.sh` — 환경 감지 후 `on|degrade|off` 출력.

Workflow = 6축 parallel() + 3-LLM adversarial verify + resume 지원.
`CLAUDE_CODE_DISABLE_WORKFLOWS=1` 시 아래 Wave 1~4 fallback 실행.

---

### Step 0.6: 사전측정 (Pre-Measurement — 오케스트레이터 Bash 실측)

> **왜 필요한가 (역사 + 현행)**: 이 Step 은 `axis-*` 5종에 Bash 가 없고 `maxTurns: 15` 로
> 잘리던 시절(2026-08-03/13/15 — 3회 재발, `harness-gaps/2026-08-15-system-audit-axis-agents-still-broken.md`)의
> 우회책으로 태어났다 — 오케스트레이터가 수치를 미리 재서 브리프에 주입하는 방식.
> **2026-08-16 수리로 전제가 바뀌었다**: axis-* 5종은 이제 Bash 를 갖고(maxTurns 40) 직접
> 실측한다. 이 Step 은 fallback 레인의 **교차검증 보조 수단**으로 유지한다 — 축이 직접 잰
> 값과 여기 사전측정 값이 어긋나면 직접 실측을 우선하되 어긋남 자체를 finding 으로 적는다.
> (구 서술 "권한 확대 없음·axis-* 파일은 수정하지 않음"은 그 시절 우회책의 설계 제약이었고,
> 본 수리가 바로 그 권한을 의도적으로 확대했다 — 아래 §적용 범위 각주와 동일 사실.)

Lead(이 세션 자체 — Bash 보유)가 Wave 1 스폰 **직전**에 아래를 실행해 축별 핵심 수치를
먼저 잰다. `TP`는 Step 0 "대상 경로 매핑" 결과(`system` → `$FORGE_ROOT/.claude`, 프로젝트 →
해당 `.claude/`)를 그대로 쓴다. 각 지표는 해당 축 에이전트(`.claude/agents/axis-*.md`)의
"정량 측정" 표에서 축별 3~5개를 뽑은 것이다 — 축 정의가 바뀌면 이 목록도 그 표를 따라간다.

```bash
TP="${TARGET_PATH:-$FORGE_ROOT/.claude}"   # Step 0 대상 경로 매핑 결과
RULES_DIR="$HOME/.claude/rules"
RULES_OD_DIR="$HOME/.claude/rules-on-demand"

# root-cause (C-1, 2026-08-22): `$TP` 아래 `.claude/worktrees/` 에 하네스 **전체 사본**이
#   워크트리마다 하나씩 들어 있다. 제외 없이 `grep -r` 하면 같은 파일을 워크트리 수+1 번 센다.
#   실측: `[STOP]` 게이트 1,070건(제외 없음) vs **168건**(제외 적용) — 워크트리 4개일 때 6.4배.
#   측정 도구가 틀리면 그 위의 모든 판정이 틀린다 — 이 변수를 **모든 재귀 grep 에 붙인다.**
#   ⚠️ 이 방어가 무력화되는 입력: 워크트리를 `.claude/worktrees/` 밖(예: `/tmp`)에 만들면
#      이 제외로는 안 걸린다. 그때는 `git worktree list` 로 경로를 받아 동적으로 제외해야 한다.
#   재현: grep -rl '\[STOP\]' "$TP" | wc -l   vs   grep -rl $GX '\[STOP\]' "$TP" | wc -l
#   폐기조건: 워크트리가 레포 밖으로 이설되면 이 변수를 그 경로 기준으로 교체한다.
GX="--exclude-dir=worktrees --exclude-dir=logs --exclude-dir=.git --exclude-dir=node_modules"

# ⚠️ 훅 배선은 **직접 세지 않는다** (H-3, 2026-08-22). 전용 도구가 이미 있다:
#     bash "$FORGE_ROOT/shared/scripts/register-forge-hooks.sh" --verify
#   왜: 배선 레인이 **4개**다 — ①프로젝트 settings(git 배포) ②전역 settings(이 머신만)
#   ③플러그인(plugin.json 의 hooks 키) ④디스패처(`.claude/hooks/dispatch/phase-gate.sh` 가
#   qa-*/scenarios-*/pixel-diff-gate 등을 호출). settings 두 곳만 grep 하면 ③④가 통째로
#   "미등록"으로 잡힌다 — 2026-08-22 감사의 H-3("문서가 배선됐다는 훅 20개 미등록")이
#   그 오판이었다. 전용 도구는 4레인을 다 보고 "대부분 의도적 비활성"까지 구분해 준다.
#   그 도구의 판정(2026-08-22 실측): SSoT 139 · 프로젝트 60 · 전역 46 · 플러그인 45 ·
#   유령 등록 0 · 폐기목록 등록 0 · **판정 정상**.
#   ⚠️ 다만 그 도구가 함께 보고하는 **양쪽 중복 9개(1회 호출에 2번 실행)**는 실제 낭비다 —
#      settings-hash-watch·worktree-repo-identity-guard·block-forge-mirror-edit·
#      block-sensitive-bash·block-sensitive-files·branch-base-develop 등. 이건 별건으로 남는다.
#   폐기조건: 배선 레인이 한 곳으로 단일화되면 이 주의와 도구 호출을 함께 정리한다.

# ── Agentic 축(axis-agentic 정량측정표: 도구커버리지·병렬실행·모델계층화·스킬성숙도) ──
AG_SKILLS=$(find "$TP/skills" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | wc -l)
AG_AGENTS=$(find "$TP/agents" -maxdepth 1 -name "*.md" 2>/dev/null | wc -l)
AG_MODEL_TIERED_AGENTS=$(grep -lE "^model:[[:space:]]*[\"']?(haiku|sonnet)" "$TP"/agents/*.md 2>/dev/null | wc -l)
AG_EVAL_SKILLS=$(find "$TP/skills" -maxdepth 2 -iname "eval_cases.jsonl" 2>/dev/null | wc -l)
AG_PARALLEL_SPAWN_MENTIONS=$(grep -rlE $GX "parallel\(|병렬.{0,4}스폰" "$TP/skills" 2>/dev/null | wc -l)

# ── Context 축(axis-context 정량측정표: 세션시작토큰·MEMORY항목·규칙중복률·조건부로딩률) ──
# ⚠️ **문자 기준이다**(H-2, 2026-08-22 r2). `wc -c` 는 바이트라 한글이 글자당 3배로 세어져
#   같은 파일이 22,538 vs 13,527 로 1.7배 갈렸다. axis-context.md 의 지표 정의와 **같은 자**를 쓴다.
#   변수명도 CHARS 로 바꿔 단위를 이름에 박는다 — BYTES 라는 이름이 오독의 절반이었다.
# ⚠️ **3요소를 합산한다**(r4). 종전에는 rules 디렉터리만 세면서 지표명은 "세션 시작 토큰"
#   이었고, 문서의 재현 명령은 rules+CLAUDE.md+MEMORY.md 3요소였다 — 코드와 문서가 서로 달랐다.
#   재현: cat $HOME/.claude/rules/*.md ~/CLAUDE.md "$FORGE_ROOT/CLAUDE.md" "$MEMORY_PATH" | wc -m
# ⚠️ **정의가 사용보다 먼저 와야 한다**(r5, 2026-08-22 — 이 절이 만든 회귀 수리).
#   r4 는 위 3요소 합산을 도입하면서 `MEMORY_PATH` 를 **CTX_RULES_CHARS 3줄 뒤에** 정의했다.
#   셸에서 미정의 변수는 빈 문자열로 펼쳐지므로 `cat … "" …` 이 되어 **MEMORY.md 가 조용히
#   빠진 채** 구 동작과 같은 값이 나왔다. 고치려던 지표를 같은 커밋이 무효화한 것이다.
#   실측: 순서 그대로 89,674 / 정의를 앞으로 올리면 90,907 (차이 1,233 = MEMORY.md 글자수).
#   axis-context.md 가 실측 예시로 적은 90,907 은 **고쳐야만 나오는 값**이었다.
#   ⚠️ 더 나쁜 경우: 세션에 우연히 같은 이름의 환경변수가 있으면 엉뚱한 파일을 대신 센다.
#   재현: bash shared/scripts/tests/test-audit-ctx-metrics.sh
MEMORY_PATH="$HOME/.claude/projects/$(echo "$FORGE_ROOT" | tr '/' '-')/memory/MEMORY.md"
CTX_RULES_CHARS=$(cat "$RULES_DIR"/*.md "$HOME/CLAUDE.md" "$FORGE_ROOT/CLAUDE.md" "$MEMORY_PATH" 2>/dev/null | wc -m)
CTX_CORE_RULES=$(find "$RULES_DIR" -maxdepth 1 -name "*.md" 2>/dev/null | wc -l)
CTX_ONDEMAND_RULES=$(find "$RULES_OD_DIR" -maxdepth 1 -name "*.md" 2>/dev/null | wc -l)
# cr-final pr267-chunk4(HIGH): `grep -c ... || echo 0` 는 0-매치(파일 존재) 때 grep 이 stdout
# "0" + exit 1 을 내 `0\n0` 두 줄 값이 됐다(printf invalid-number 노이즈 재현됨). 실패 분리로 교정.
# ⚠️ **목록 항목을 센다**(M-4, 2026-08-22 r2). `^## ` 는 현행 MEMORY.md 형식에서 **항상 0** 이라
#   이 지표가 영원히 만점으로 보였다. 실측: 구 0 / 신 6.
CTX_MEMORY_ITEMS=$(grep -c "^[-*] " "$MEMORY_PATH" 2>/dev/null || true)
CTX_MEMORY_ITEMS=${CTX_MEMORY_ITEMS:-0}

# ── Harness 축(axis-harness 정량측정표: Hook커버리지·OWASP커버리지·인젝션방어·롤백준비도) ──
HN_HOOK_SCRIPTS=$(find "$TP/hooks" -maxdepth 1 -name "*.sh" 2>/dev/null | wc -l)
# cr-final pr267-chunk4(HIGH): 경로 변수를 python 문자열에 직접 보간하지 않는다(작은따옴표
# 포함 경로의 문자열 탈출 + LN-03 env 패턴 위반) — env 로 전달한다.
HN_HOOK_EVENTS=$(SA_SETTINGS="$TP/settings.json" python3 -c "import json,os; d=json.load(open(os.environ['SA_SETTINGS'], encoding='utf-8')); print(len(d.get('hooks',{})))" 2>/dev/null || echo 0)
# ⚠️ `ASI0[0-9]` 는 **ASI10 을 못 잡는다**(r4 정정 — OWASP Top10 은 ASI01~ASI10 이다).
#   커버리지 지표가 상시 1개 과소 계상됐다. 재현: echo ASI10 | grep -cE "ASI0[0-9]" → 0
# ⚠️ 병합 메모(2026-08-22): 이 줄은 **두 세션이 각각 고친 것을 합친** 결과다 —
#   `$GX`(워크트리·로그 등 제외 — 중복계수 방지)·`ASI(0[1-9]|10)`(ASI10 누락) 는 이쪽,
#   `encoding='utf-8'`(로케일 무관 JSON 읽기) 은 develop 쪽.
#   둘 다 같은 계열의 버그(환경에 따라 조용히 틀린 수치가 나온다)라 어느 쪽도 버리지 않는다.
HN_ASI_REFS=$(grep -rhoE $GX "ASI(0[1-9]|10)" "$TP" "$FORGE_ROOT/shared" 2>/dev/null | sort -u | wc -l)
HN_INJECTION_GUARD=$(find "$TP/hooks" -iname "*injection*" 2>/dev/null | wc -l)
HN_ROLLBACK_STAGES=$(grep -rlE $GX "L1.{0,4}(프롬프트|Quick)|L2.{0,4}(모델|Release)|L3.{0,4}(안전모드|Hotfix)" "$TP" 2>/dev/null | wc -l)

# ── Cost 축(axis-cost 정량측정표: 모델계층화율·조건부로딩률·세션시작토큰·MCP분산율) ──
# cr-final pr267-chunk4(HIGH): 종전 CO_ 는 큰따옴표 포맷만, AG_ 는 무따옴표만 매칭해 서로
# 다른 포맷 가정을 썼다(한쪽은 상시 과소측정). 둘 다 따옴표 유무 무관하게 매칭한다.
CO_MODEL_MENTIONS_TOTAL=$(grep -rlE $GX "model:[[:space:]]*[\"']?(opus|sonnet|haiku)[\"']?" "$TP" 2>/dev/null | wc -l)
CO_MODEL_MENTIONS_CHEAP=$(grep -rlE $GX "model:[[:space:]]*[\"']?(sonnet|haiku)[\"']?" "$TP" 2>/dev/null | wc -l)
CO_MCP_SERVERS=$(SA_MCPJSON="$FORGE_ROOT/.mcp.json" python3 -c "import json,os; d=json.load(open(os.environ['SA_MCPJSON'], encoding='utf-8')); print(len(d.get('mcpServers',{})))" 2>/dev/null || echo 0)

# ── Human-AI 축(axis-human-ai 정량측정표: 게이트커버리지·하드코딩경로·Auto-Pass문서화·게이트우회) ──
HA_STOP_GATES=$(grep -rl $GX '\[STOP\]' "$TP" 2>/dev/null | wc -l)
HA_AUTOPASS_MENTIONS=$(grep -rl $GX 'AUTO-PASS\|Auto-Pass' "$TP" 2>/dev/null | wc -l)
HA_HARDCODED_TILDE=$(grep -rc '~/' "$TP"/skills/*/SKILL.md 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
HA_NOVERIFY_MENTIONS=$(grep -rl $GX -- '--no-verify' "$TP" 2>/dev/null | wc -l)

# 각 축 브리프에 그대로 붙여넣을 JSON 한 줄(신뢰: 실측 — Glob/Grep/wc 직접 카운트)
AGENTIC_METRICS_JSON=$(printf '{"skills":%d,"agents":%d,"tieredAgents":%d,"evalSkills":%d,"parallelMentions":%d}' "$AG_SKILLS" "$AG_AGENTS" "$AG_MODEL_TIERED_AGENTS" "$AG_EVAL_SKILLS" "$AG_PARALLEL_SPAWN_MENTIONS")
CONTEXT_METRICS_JSON=$(printf '{"rulesChars":%d,"coreRules":%d,"ondemandRules":%d,"memoryItems":%d}' "$CTX_RULES_CHARS" "$CTX_CORE_RULES" "$CTX_ONDEMAND_RULES" "$CTX_MEMORY_ITEMS")
HARNESS_METRICS_JSON=$(printf '{"hookScripts":%d,"hookEvents":%d,"asiRefs":%d,"injectionGuardFiles":%d,"rollbackStageRefs":%d}' "$HN_HOOK_SCRIPTS" "$HN_HOOK_EVENTS" "$HN_ASI_REFS" "$HN_INJECTION_GUARD" "$HN_ROLLBACK_STAGES")
COST_METRICS_JSON=$(printf '{"modelMentionsTotal":%d,"modelMentionsCheap":%d,"mcpServers":%d}' "$CO_MODEL_MENTIONS_TOTAL" "$CO_MODEL_MENTIONS_CHEAP" "$CO_MCP_SERVERS")
HUMANAI_METRICS_JSON=$(printf '{"stopGateFiles":%d,"autoPassMentionFiles":%d,"hardcodedTildeCount":%d,"noVerifyMentionFiles":%d}' "$HA_STOP_GATES" "$HA_AUTOPASS_MENTIONS" "$HA_HARDCODED_TILDE" "$HA_NOVERIFY_MENTIONS")
```

> 경로 부재·파싱 실패는 `2>/dev/null` + `|| echo 0`로 fail-open한다(무블로킹 4원칙). 0이
> 나온 지표는 "미측정"이 아니라 "실측 결과 0"일 수 있다는 점을 axis-* 프롬프트에서 함께
> 전달한다(아래 Wave 1 프롬프트의 "사전측정" 문구 참조) — 축이 0을 임의로 해석해 점수를
> 지어내지 않게 하기 위함이다.
> ⚠️ **이 방어가 무력화되는 입력**: `grep -c '~/'` 류 지표는 파일 내 우연한 물결표(주석의
> 근사값 표기 등)까지 세는 과대추정 휴리스틱이다 — axis-*가 "실측 근거"로 과신하지 않도록
> 프롬프트에 "우선 근거로 삼되 맹신하지 말 것"을 명시한다(아래).

⚠️ **적용 범위**: 이 Step은 `CLAUDE_CODE_DISABLE_WORKFLOWS=1`일 때 실행되는 아래 Wave 1~4
fallback 경로에 적용된다. 기본 경로(위 Step 0.5 Workflow 위임 — `workflow.js`)는 **2026-08-16
수리로 `basePrompt()`가 Wave 1 수준(정의서 참조·기법 목록·엄격성·N/A 규약)으로 보강됐고**,
같은 수리에서 axis-* 에이전트 5종이 Bash 를 갖게 돼(tools+=Bash, maxTurns 15→40) 기본 경로는
사전측정 주입 없이 **직접 실측**한다. 이 Step 0.6 은 fallback 레인의 보조 수단으로 유지한다
(축이 직접 실측한 값과 사전측정 값이 어긋나면 직접 실측을 우선하되 어긋남 자체를 finding 으로 적는다).
근거: `harness-gaps/2026-08-15-system-audit-axis-agents-still-broken.md` G-1·G-2·G-4.

---

### Wave 1: 6개 축 에이전트 병렬 스폰 (단일 메시지, 동시 실행)

아래 6개 Agent를 **한 번에** 병렬로 스폰한다. 각 에이전트는 독립적으로 실행되며 JSON만 반환한다.

**추가: 에이전트 6 — Redundancy (중복/drift 감지)**
- 스킬 중복 그룹, Orphan 에이전트, 미사용 스킬, Hook theater, 규칙 중복 탐지
- 반환 JSON: `{ items: [{type, names, recommendation, risk, reason}], summary: {duplicates, orphans, deprecated, theater_hooks} }`

**파일 소유권 선언:**
- 5개 에이전트 모두 **읽기 전용 감사 계약** — Bash 는 측정용 읽기 명령만(각 axis-*.md 상단
  "Bash 사용 계약" 블록이 정본, 2026-08-16). 대상 경로를 바꾸는 어떤 명령도 금지
- 보고서 쓰기는 Wave 3에서 Lead만 수행

**빈손 종료 회수 절차 (표준 — 2026-08-15 실측 4/5 회수 성공)**: 축 에이전트가 에러 없이
**최종 메시지를 비운 채** 종료하면(이름 없는 async 스폰에서도 발생 — turn 소진이 원인)
그 축을 실패로 확정하기 전에 `SendMessage` 로 1회 재요청한다:
`"탐색을 멈추고 지금까지 아는 것만으로 요구된 JSON 을 반환하라 — 추가 조사 금지."`
재요청에도 미반환이면 그 축은 Lead 가 Bash 로 핵심 지표를 직접 재서 **대체 채점**하고,
보고서에 `출처: Lead 대체 채점(축 에이전트 미반환)` 을 명기한다 — 침묵 결측 금지.

**회수 반환의 JSON 검증 (2026-08-16 신설 — 스키마 이탈 실측 후)**: 회수로 받은 JSON 은
합치기 전에 **필수 키 존재·임의 키 부재**를 검사한다(2026-08-16 실측: 회수 반환이
`strengths` 배열 자리에 `strengths_2` 류 임의 키를 만들어 파싱이 깨졌다 — Wave 1 은
SendMessage 텍스트 반환이라 워크플로 레인과 달리 스키마가 강제되지 않는다). 불일치면
스키마를 재제시하며 **1회만** 더 요청하고, 그래도 불일치면 Lead 가 유효 필드만 발췌해
쓰되 보고서에 `스키마 이탈(부분 발췌)` 을 명기한다 — 조용한 통짜 수용 금지.
(기본 경로 `workflow.js` 는 StructuredOutput 스키마 강제라 이 검증이 불필요 — fallback 전용.)

**에이전트 1 — axis-agentic (model: sonnet)**

프롬프트: `사전측정(오케스트레이터가 Step 0.6에서 Bash로 실측, 신뢰: 실측): ${AGENTIC_METRICS_JSON}. 이 수치를 정량 지표의 1차 근거로 삼되, 너는 Bash 를 보유하므로(2026-08-16 수리) 의심스러운 값은 직접 재측정해 교차검증하라 — 지어내지 말고, 어긋나면 직접 실측을 우선하되 어긋남 자체를 finding 으로 적어라(0은 "미측정"이 아니라 "실측 결과 0"일 수 있다). {target} 경로의 에이전틱 역량을 분석한다. 반드시 `shared/docs/2026-03-30-four-engineering-disciplines.md`의 §4 Agentic Engineering 섹션을 Read한 후, 정의서 기법 목록을 기준으로 체크하라. 정의서에 없는 항목은 감사하지 않는다. Anthropic Composable Patterns 수준, ACI 설계, Agent Evals, Multi-Agent Coordination, Memory Architecture, AgentOps를 점검한다. 위 사전측정 수치로 부족한 부분은 Glob/Grep/Read 도구로 보완 탐색하라. 주관적 판단 금지 — 모든 점수는 실측 데이터(사전측정 또는 직접 탐색) 기반이어야 한다. 측정 불가 항목은 "N/A (런타임 데이터 필요)" 로 표기하라. 아래 JSON 형식으로만 반환한다.`

반환 JSON: `{ "axis": "agentic", "score": 0-100, "composable_pattern": "...", "issues": [...], "strengths": [...], "summary": "..." }`

**에이전트 2 — axis-context (model: sonnet)**

프롬프트: `사전측정(오케스트레이터가 Step 0.6에서 Bash로 실측, 신뢰: 실측): ${CONTEXT_METRICS_JSON}. 이 수치를 정량 지표의 1차 근거로 삼되, 너는 Bash 를 보유하므로(2026-08-16 수리) 의심스러운 값은 직접 재측정해 교차검증하라 — 지어내지 말고, 어긋나면 직접 실측을 우선하되 어긋남 자체를 finding 으로 적어라(0은 "미측정"이 아니라 "실측 결과 0"일 수 있다). {target} 경로의 컨텍스트 엔지니어링을 분석한다. 반드시 `shared/docs/2026-03-30-four-engineering-disciplines.md`의 §2 Context Engineering 섹션을 Read한 후, 정의서 기법 목록을 기준으로 체크하라. 정의서에 없는 항목은 감사하지 않는다. System Prompt Design(§2-1), Short-Term Memory(§2-2), Long-Term Memory(§2-3), RAG(§2-4), Tool Definition(§2-5), Context Compaction(§2-6), Sub-Agent Architecture(§2-7), Progressive Disclosure(§2-8), Structured Note-Taking(§2-9) 9개 기법과 프롬프트 구조 3요소 포함률을 점검한다. 위 사전측정 수치로 부족한 부분은 Glob/Grep/Read 도구로 보완 탐색하라. 주관적 판단 금지 — 모든 점수는 실측 데이터(사전측정 또는 직접 탐색) 기반이어야 한다. 측정 불가 항목은 "N/A (런타임 데이터 필요)" 로 표기하라. 아래 JSON 형식으로만 반환한다.`

반환 JSON: `{ "axis": "context", "score": 0-100, "context_checklist": {...}, "failure_patterns": [...], "progressive_disclosure": true/false, "issues": [...], "strengths": [...], "summary": "..." }`

**에이전트 3 — axis-harness (model: sonnet)**

프롬프트: `사전측정(오케스트레이터가 Step 0.6에서 Bash로 실측, 신뢰: 실측): ${HARNESS_METRICS_JSON}. 이 수치를 정량 지표의 1차 근거로 삼되, 너는 Bash 를 보유하므로(2026-08-16 수리) 의심스러운 값은 직접 재측정해 교차검증하라 — 지어내지 말고, 어긋나면 직접 실측을 우선하되 어긋남 자체를 finding 으로 적어라(0은 "미측정"이 아니라 "실측 결과 0"일 수 있다). {target} 경로의 AI 하네스를 분석한다. 반드시 `shared/docs/2026-03-30-four-engineering-disciplines.md`의 §3 Harness Engineering 섹션을 Read한 후, 정의서 기법 목록을 기준으로 체크하라. 정의서에 없는 항목은 감사하지 않는다. Check Chain(§3-1), Guardrails 5 Rail Types(§3-2), OWASP Agentic Top 10(§3-3), Hooks(§3-4), AI Evals(§3-5), Observability(§3-6), Rollback(§3-7), Maintenance Agents(§3-8) 8개 구성요소를 점검한다. 위 사전측정 수치로 부족한 부분은 Glob/Grep/Read 도구로 보완 탐색하라. 주관적 판단 금지 — 모든 점수는 실측 데이터(사전측정 또는 직접 탐색) 기반이어야 한다. 측정 불가 항목은 "N/A (런타임 데이터 필요)" 로 표기하라. 아래 JSON 형식으로만 반환한다.`

반환 JSON: `{ "axis": "harness", "score": 0-100, "check_chain": {...}, "owasp_coverage": {...}, "issues": [...], "strengths": [...], "summary": "..." }`

**에이전트 4 — axis-cost (model: haiku)**

프롬프트: `사전측정(오케스트레이터가 Step 0.6에서 Bash로 실측, 신뢰: 실측): ${COST_METRICS_JSON}. 이 수치를 정량 지표의 1차 근거로 삼되, 너는 Bash 를 보유하므로(2026-08-16 수리) 의심스러운 값은 직접 재측정해 교차검증하라 — 지어내지 말고, 어긋나면 직접 실측을 우선하되 어긋남 자체를 finding 으로 적어라(0은 "미측정"이 아니라 "실측 결과 0"일 수 있다). {target} 경로의 비용 효율을 분석한다. 모델 라우팅 3계층(Opus/Sonnet/Haiku) 문서화, 컨텍스트 절약 패턴, MCP→CLI 전환 현황, 비용 최적화 패턴(캐싱/라우팅/배치/길이제어) 적용 여부, 낭비 패턴을 점검한다. 위 사전측정 수치로 부족한 부분은 Glob/Grep/Read 도구로 보완 탐색하라. 주관적 판단 금지 — 모든 점수는 실측 데이터(사전측정 또는 직접 탐색) 기반이어야 한다. 측정 불가 항목은 "N/A (런타임 데이터 필요)" 로 표기하라. 아래 JSON 형식으로만 반환한다.`

반환 JSON: `{ "axis": "cost", "score": 0-100, "model_routing": {...}, "context_savings": {...}, "optimization_gaps": [...], "waste_patterns": [...], "issues": [...], "strengths": [...], "summary": "..." }`

**에이전트 5 — axis-human-ai (model: sonnet)**

프롬프트: `사전측정(오케스트레이터가 Step 0.6에서 Bash로 실측, 신뢰: 실측): ${HUMANAI_METRICS_JSON}. 이 수치를 정량 지표의 1차 근거로 삼되, 너는 Bash 를 보유하므로(2026-08-16 수리) 의심스러운 값은 직접 재측정해 교차검증하라 — 지어내지 말고, 어긋나면 직접 실측을 우선하되 어긋남 자체를 finding 으로 적어라(0은 "미측정"이 아니라 "실측 결과 0"일 수 있다). {target} 경로의 Human-AI 경계 설계를 분석한다. 5-Level Autonomy 매핑, [STOP]/[AUTO-PASS] 게이트 적절성, 에스컬레이션 트리거 5유형 커버리지, 안티패턴(Quasi-Automation/Rubber Stamping/Alert Fatigue), Override Rate 추적을 점검한다. 위 사전측정 수치로 부족한 부분은 Glob/Grep/Read 도구로 보완 탐색하라. 주관적 판단 금지 — 모든 점수는 실측 데이터(사전측정 또는 직접 탐색) 기반이어야 한다. 측정 불가 항목은 "N/A (런타임 데이터 필요)" 로 표기하라. 아래 JSON 형식으로만 반환한다.`

반환 JSON: `{ "axis": "human-ai", "score": 0-100, "autonomy_mapping": [...], "gate_analysis": [...], "anti_patterns": [...], "issues": [...], "strengths": [...], "summary": "..." }`

---

### Wave 2: Lead 종합 (5개 결과 의존)

5개 에이전트 결과를 모두 수신한 후 Lead가 아래를 수행한다:

**2-1. 정량 점수 산출 (Weighted Scoring)**

각 축 에이전트는 체크리스트 항목별 0-3점 루브릭으로 채점한다:
- 0 = 미구현 (Not implemented)
- 1 = 부분 구현 (Partial — 문서만 있거나 일부만 적용)
- 2 = 구현됨 (Implemented — 동작하나 측정/개선 루프 없음)
- 3 = 성숙 (Mature — 동작 + 측정 + 지속 개선 루프)

축 점수 = (획득 점수 합 / 최대 점수 합) × 100

**가중치 (시스템 상태에 따라 조정):**

| 축 | 기본 가중치 | 초기 단계 | 운영 단계 | 스케일링 단계 |
|----|:--------:|:-------:|:-------:|:---------:|
| Agentic | 20% | 25% | 20% | 15% |
| Context | 20% | 25% | 20% | 15% |
| Harness | 20% | 15% | 25% | 25% |
| Cost | 20% | 10% | 15% | 25% |
| Human-AI | 20% | 25% | 20% | 20% |

현재 시스템 단계를 target 분석에서 자동 판별한다:
- 초기: 스킬 < 20개 또는 규칙 < 5개
- 운영: 스킬 20-50개 + 규칙 5-15개 + 프로덕션 배포 있음
- 스케일링: 멀티 프로젝트 + 팀 2명+ 또는 월 비용 $500+

전체 점수 = Σ(축 점수 × 가중치)

**2-2. 정량 지표 실측 (Quantitative Measurement)**

각 축 에이전트는 체크리스트 외에 아래 정량 지표를 실제 측정하여 보고한다:

측정 유형 범례:

| 측정 유형 | 의미 |
|----------|------|
| 실측 | Glob/Grep/wc로 직접 카운트 |
| 추정 | 바이트→토큰 변환 등 계산 |
| 미측정 | 런타임 로그 필요, 현재 불가 |

| 축 | 측정 지표 | 측정 방법 | 기준값 | 측정 유형 |
|----|---------|---------|-------|---------|
| Agentic | 도구 커버리지율 | (사용된 도구 / 등록된 도구) × 100 | > 60% | 실측 |
| Context | 세션 시작 토큰 | rules + CLAUDE.md + MEMORY.md 합산 (**wc -m ÷ 4** — 문자 기준, H-2) | < 12,000 | 추정 |
| Context | MEMORY.md 항목 수 | `grep -c '^[-*] '` (목록 항목 — M-4, r4 동기화) | < 30 | 실측 |
| Context | 규칙 중복률 | (중복 규칙 / 전체 규칙) × 100 | < 10% | 추정 |
| Harness | Hook 커버리지 | (Hook 보호 이벤트 / 위험 이벤트 유형) × 100 | > 70% | 실측 |
| Harness | OWASP 커버리지 | (대응 ASI / 10) × 100 | > 50% | 실측 |
| Cost | 모델 계층화율 | (Haiku+Sonnet 작업 / 전체) × 100 | > 60% | 실측 |
| Cost | 조건부 로딩률 | (on-demand 규칙 / 전체 규칙) × 100 | > 50% | 실측 |
| Context | 프롬프트 구조 포함률 | (3요소 포함 스킬 / 프롬프트 보유 스킬) × 100 | > 70% | 실측 |
| Human-AI | 게이트 커버리지 | (STOP 게이트 작업 / 비가역 작업) × 100 | 100% | 실측 |

**2-3. 트렌드 비교 (Delta Analysis)**

이전 감사 보고서가 존재하면 (`${FORGE_OUTPUTS:-$HOME/forge-outputs}/docs/reviews/audit/` 폴더) 최신 보고서와 비교:
- 각 축 점수 변화량 (Δ)
- 이슈 해소율 = (이전 이슈 중 해결된 수 / 이전 전체 이슈) × 100
- 신규 이슈 발생 수
- 정량 지표 변화 방향 (↑↓→)

트렌드 테이블:
```
| 축 | 이전 | 현재 | Δ | 방향 |
|----|:----:|:----:|:--:|:---:|
| Agentic | 72 | 78 | +6 | ↑ |
```

**2-4. 축간 트레이드오프 식별**
주요 트레이드오프 패턴:
- Cost vs Harness: 비용 절감(Haiku 사용) ↔ 검증 품질
- Agentic vs Human-AI: 자율성 증가 ↔ 감독 필요성
- Context vs Cost: 컨텍스트 풍부 ↔ 토큰 비용
- Harness vs Agentic: 가드레일 강화 ↔ 에이전트 유연성
- Human-AI vs Cost: 게이트 추가 ↔ 파이프라인 속도

**2-5. 통합 이슈 목록 정렬**
- 5개 축의 모든 이슈를 CRITICAL → HIGH → MEDIUM → LOW 순으로 통합
- 여러 축에 걸친 이슈는 cross-axis 태그 부여
- 중복 이슈 제거 (동일 파일/설정의 이슈는 하나로 합산)
- 각 이슈에 **영향도 점수** 부여: (심각도 × 영향 범위) — CRITICAL=4, HIGH=3, MEDIUM=2, LOW=1

---

### Wave 3: 통합 보고서 작성

**저장 위치:** `${FORGE_OUTPUTS:-$HOME/forge-outputs}/docs/reviews/audit/{date}-system-audit[-{target}].md`
(`target`이 `system`이면 suffix 생략)

Wave3 통합 보고서 템플릿 → `references/report-template.md`

---

### Wave 3.9: 최종 완료 게이트 (필수, Notion 등록·완료 보고 이전)

1. 실행: `bash ${FORGE_ROOT:-$HOME/forge}/shared/scripts/verify-outputs.sh "${FORGE_OUTPUTS:-$HOME/forge-outputs}/docs/reviews/audit/{date}-system-audit.md"`
2. 스크립트 출력 표를 완료 보고에 포함. 표 밖 임의 "완료" 서술 금지.
3. exit 2(MISSING/0바이트)면 Wave 4 Notion 등록 및 "## 완료 보고" 출력 금지 — 보고서 재생성 후 재검증(exit 0) 통과 시에만 진행한다.

### Wave 4: Notion 페이지 생성

보고서 작성 완료 후 Notion에 전체 내용을 기록한다.

1. `Read("${FORGE_OUTPUTS:-$HOME/forge-outputs}/docs/reviews/audit/{date}-system-audit.md")` → 전체 내용 로드
2. `mcp__notion__notion-create-pages` 호출:

```json
{
  "parent": { "data_source_id": "713563f9-d523-4e90-8d6f-6b0d650628ad" },
  "pages": [{
    "properties": {
      "제목": "{date} ACHCE 5축 통합 감사 [{target}]",
      "감사 유형": "통합",
      "축": ["Agentic", "Context", "Harness", "Cost", "Human-AI"],
      "대상": "System",
      "종합 점수": "{전체점수}",
      "date:날짜:start": "{date}",
      "Critical": "{전체 CRITICAL 이슈 수}",
      "High": "{전체 HIGH 이슈 수}",
      "Medium": "{전체 MEDIUM 이슈 수}",
      "Low": "{전체 LOW 이슈 수}",
      "핵심 발견": "{한 줄 총평}",
      "리포트 경로": "${FORGE_OUTPUTS:-$HOME/forge-outputs}/docs/reviews/audit/{date}-system-audit.md"
    },
    "content": "{보고서 전체 내용}"
  }]
}
```

> ⚠️ 위 속성명은 **2026-08-15 실스키마 조회로 확보한 정답 매핑**이다(구 매핑은 13개 중 9개가
> 틀려 항상 `400 validation_error` — 축별 점수 5개·`상태`는 스키마에 존재하지 않는 속성이었고,
> `축: "통합"` 은 `감사 유형` 자리의 오기, `대상` 은 select 라 `System` 대소문자 정확히).
> 재현(성공 선례): 2026-08-15 감사에서 이 매핑으로 등록 성공 — 페이지
> `3bd178f4-99c8-81db-a3cf-f217003cd58e`. 근거: `harness-gaps/2026-08-15-system-audit-axis-agents-still-broken.md` G-5.
> 속성이 또 안 맞으면 임의 추측 대신 데이터소스 스키마를 먼저 조회해 이 표를 갱신하라.

> Notion MCP 미연결 시 경고 출력 후 스킵 (파이프라인 중단 안 함).

---

## 완료 보고

Wave 3.9 최종 완료 게이트(exit 0) 통과 후에만 아래 형식으로 결과를 요약 출력한다:

```
✅ ACHCE 5축 통합 감사 완료

전체 점수: {전체점수}/100
- Agentic:  {A}/100
- Context:  {C}/100
- Harness:  {H}/100
- Cost:     {Co}/100
- Human-AI: {E}/100

이슈: CRITICAL {n}건 / HIGH {n}건 / MEDIUM {n}건

보고서: ${FORGE_OUTPUTS:-$HOME/forge-outputs}/docs/reviews/audit/{date}-system-audit.md
```


---

## 독립 Evaluator (하네스)

5축 통합 감사 결과물 완성 후 독립 Evaluator Subagent가 품질을 2차 검증한다.

> **원칙**: Generator(감사 수행자) ≠ Evaluator. 감사자가 자신의 감사를 평가하면 자기평가 편향이 발생한다.

```python
Agent(
  subagent_type="general-purpose",
  model="sonnet",
  prompt="""
당신은 system-audit 결과물의 독립 품질 검증자입니다.

아래 기준으로 결과물을 검토하고 PASS 또는 FAIL을 판정하십시오.

**평가 기준 (4항목 모두 충족해야 PASS):**

1. **ACHCE 5축 모두 커버 여부**
   - [위치] 보고서 "축별 감사 결과 요약" 섹션 1.1~1.5 또는 전체 점수 표
   - [이유] 한 축이라도 누락되면 통합 점수가 편향됨
   - [방법] Agentic/Context/Harness/Cost/Human-AI 5개 축 각각에 점수(0-100)와 핵심 발견 2개 이상이 존재하는지 확인; 특정 축의 점수가 "N/A" 또는 빈 값이면 FAIL

2. **축간 트레이드오프 분석 존재**
   - [위치] 보고서 "축간 트레이드오프 분석" 섹션 (표 형식)
   - [이유] 각 축을 독립적으로만 보면 트레이드오프(예: Cost 절감 vs Harness 품질)를 놓침
   - [방법] Cost vs Harness / Agentic vs Human-AI / Context vs Cost 3쌍 이상의 트레이드오프가 "현재 균형" + "권장 방향"과 함께 명시됐는지 확인; 빈 셀이 있으면 FAIL

3. **통합 개선 로드맵 P0/P1/P2 우선순위 명시**
   - [위치] 보고서 "통합 개선 로드맵" 섹션 또는 섹션 7
   - [이유] 우선순위 없는 로드맵은 실행 순서를 결정할 수 없어 실효성이 없음
   - [방법] P0(즉시/이번 주) / P1(단기/이번 달) / P2(중기/다음 분기) 3단계 각각에 구체적 액션 아이템이 1개 이상 존재하는지 확인; 빈 섹션이 있으면 FAIL

4. **각 축 점수가 증거 기반인지 확인**
   - [위치] 보고서 "정량 지표 대시보드" 섹션 (표) 또는 각 축 요약의 증거 언급
   - [이유] 증거 없는 점수는 신뢰할 수 없으며 개선 추적도 불가능
   - [방법] 정량 지표 표에서 Agentic(도구 커버리지율) / Context(세션 시작 토큰, MEMORY 항목 수) / Harness(Hook 커버리지, OWASP 커버리지) / Cost(모델 계층화율, 조건부 로딩률) / Human-AI(게이트 커버리지) — 9개 지표 모두에 실측값 또는 "미측정" 명시가 있는지 확인; 빈 셀은 "측정 미수행"으로 간주하여 FAIL

**판정**: PASS(기준 4항목 모두 충족) / FAIL(1항목 이상 미충족)
**피드백 형식**: [파일명+섹션] — [이유] → [방법]
"""
)
```

피드백 루프:
- PASS → 파이프라인 계속 (Notion 등록)
- FAIL → 감사 재수행 후 1회 재실행. 2회 연속 FAIL 시 [STOP] Human 에스컬레이션
> Evaluator FAIL 시 `.claude/logs/{session}/errors.jsonl` 참조하여 재시도

## Workflow 통합 (P0)

6축 parallel() + 3-LLM adversarial verify (Claude+Codex+Gemini 2/3 합의) + resume 지원.

실행:
```bash
TODAY=$(date +%Y-%m-%d)
# CR_MODE: on(기본 3-LLM) | degrade(Codex 스킵, Claude+Gemini) | off(동일)
# ${FORGE_ROOT:-$HOME/forge}/shared/scripts/cr-mode.sh 로 자동 결정 가능
Workflow({ script: Bash("cat ${FORGE_ROOT:-$HOME/forge}/.claude/skills/system-audit/workflow.js"), args: { date: TODAY, projectRoot: ".", crMode: "on" } })
```

`CLAUDE_CODE_DISABLE_WORKFLOWS=1` 시 Wave 1~4 fallback.

**완료 보고 (6축 포함)**:
```
✅ ACHCE 6축 통합 감사 완료

전체 점수: {전체점수}/100
- Agentic:    {A}/100
- Context:    {C}/100
- Harness:    {H}/100
- Cost:       {Co}/100
- Human-AI:   {E}/100
- Redundancy: {dup}건/{orphan}건/{deprecated}건/{theater}건

이슈: CRITICAL {n}건 / HIGH {n}건 / MEDIUM {n}건
검증: {verified}/{total} 통과 (3-LLM 2/3 합의)

보고서: ${FORGE_OUTPUTS:-$HOME/forge-outputs}/docs/reviews/audit/{date}-system-audit.md
```

