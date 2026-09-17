# Step 0.6 — 사전측정 (Pre-Measurement) 상세

> `system-audit` SKILL.md 의 **Step 0.6 을 실제로 실행할 때만** Read 한다.
> 이 Step 은 **fallback 레인 전용 보조 수단**이다 — 기본 경로(Step 0.5 의 `workflow.js` 위임)는
> axis-* 에이전트가 Bash 로 직접 실측하므로 여기를 읽을 필요가 없다.
> (2026-08-28 분리 — SKILL.md 500줄 규정 준수. 측정 명령·주석은 한 줄도 바꾸지 않고 그대로 옮겼다.)

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
# 지표 SSoT (M-2·M-3, 2026-08-22) — 이 두 지표를 여기서 다시 정의하지 않는다.
#   같은 질문에 답이 여러 개면 회차 비교가 영원히 불가능해진다. evals 보유율 하나에
#   48/70 · 16/70 · 51/70 세 답이 나왔던 것이 M-3 이고, 3요소 포함률이 49% 와 56% 로
#   갈렸던 것이 M-2 다(그 차이는 품질이 아니라 자의 차이였다).
#   정의를 바꾸려면 shared/scripts/harness-metrics.sh 를 고치고 그 회차를 리포트에 명시할 것.
#   재현: bash shared/scripts/harness-metrics.sh
AGM_JSON=$(bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/harness-metrics.sh" --json --root "$(dirname "$TP")" 2>/dev/null)
AG_EVAL_SKILLS=$(printf %s "$AGM_JSON" | python3 -c "import json,sys;print(json.load(sys.stdin)['evals']['ok'])" 2>/dev/null || echo 0)
AG_SKILL3_PCT=$(printf %s "$AGM_JSON" | python3 -c "import json,sys;print(json.load(sys.stdin)['skill3']['pct'])" 2>/dev/null || echo 0)
AG_PARALLEL_SPAWN_MENTIONS=$(grep -rlE $GX "parallel\(|병렬.{0,4}스폰" "$TP/skills" 2>/dev/null | wc -l)

# ── Context 축(axis-context 정량측정표: 세션시작토큰·MEMORY항목·규칙중복률·조건부로딩률) ──
# ⚠️ **문자 기준이다**(H-2, 2026-08-22 r2). `wc -c` 는 바이트라 한글이 글자당 3배로 세어져
#   같은 파일이 22,538 vs 13,527 로 1.7배 갈렸다. axis-context.md 의 지표 정의와 **같은 자**를 쓴다.
#   변수명도 CHARS 로 바꿔 단위를 이름에 박는다 — BYTES 라는 이름이 오독의 절반이었다.
# ⚠️ **3요소를 합산한다**(r4). 종전에는 rules 디렉터리만 세면서 지표명은 "세션 시작 토큰"
#   이었고, 문서의 재현 명령은 rules+CLAUDE.md+MEMORY.md 3요소였다 — 코드와 문서가 서로 달랐다.
#   재현: cat ~/.claude/rules/*.md ~/CLAUDE.md "$FORGE_ROOT/CLAUDE.md" "$MEMORY_PATH" | wc -m
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
