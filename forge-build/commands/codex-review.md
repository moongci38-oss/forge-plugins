---
description: Codex 2차 리뷰 — `codex-review` 스킬 진입점(stage 분기).
argument-hint: "--stage <plan|analysis|code|test|final|bugfix|yt-apply-plan|article-apply-plan|phase1-validate> --target <file|dir|PR#> [--mode single|multi] [--lens security|ui|perf|tests|traceability [--exec]] [-- <넘길 인자>] [--effort low|medium|high|xhigh] [--blocking] [--cr <on|degrade|off>] [--sol|--terra|--luna]"
group: verify
---

# /codex-review

수동 슬래시 인터페이스. 자동 레인은 `skills/codex-review/SKILL.md`(기본 off — `CODEX_REVIEW_AUTO_STAGES`). 나눠 맡는다 — 인자·stage 표·포커스 = 스킬 `§인자` · 실제 호출 절차(Step) = 여기(#2470). 처음 쓰는 사람용 한 장 = `docs/guides/codex-review-usage.html`.
Claude 1차 리뷰에 Codex **단일 레인** 2차 리뷰를 추가한다(2벤더 교차는 `/forge-multi`). ⛔ `mcp__codex__codex` 직접 호출 금지 — 기록(`docs/reviews/`)·cap=1·stage rubric(`prompts/codex-review-*.md`)이 빠진다.
단축 래퍼: `/forge-plan-review` `/forge-analysis-review` `/forge-code-review` `/forge-test-review` `/forge-final` `/forge-bug-review`. 선결: codex CLI 설치 + `codex` /login(ChatGPT OAuth).
## 인자
인자 표·stage 목록·stage별 포커스 정본 = `skills/codex-review/SKILL.md §인자`(#2470 — 여기 다시 적지 않는다).
## 절차
### Step 1 — 갈래 · 입력 (code/final 은 merge-base 기준, 실패 시 fail-closed)
```bash
[[ "$STAGE" == "spec" ]] && STAGE=plan   # #3638 spec 은 plan 에 합쳤다 — 옛 이름은 호환 입구
S="${FORGE_ROOT:-$HOME/forge}/shared/scripts"
# 갈래(#3638): --mode multi → /forge-multi · --lens → 관점 엔진. codex-single 이 아니면 CALL 을 알리고 끝낸다(그 입구를 이어서 부른다)
R=$(bash "$S/codex-review-route.sh" --stage "$STAGE" --mode "${MODE:-single}" ${LENS:+--lens "$LENS"} ${LENS_EXEC:+--exec} \
  ${TARGET:+--target "$TARGET"} ${PASS:+-- $PASS}) || exit 2   # 5a: 위임 갈래는 대상·넘길 인자를 CALL 에 그대로 싣는다
ENGINE=$(sed -n 's/^ENGINE=//p' <<<"$R")
[[ "$ENGINE" == codex-single ]] || { echo "[codex-review] 갈래 $ENGINE → $(sed -n 's/^CALL=//p' <<<"$R")"; exit 0; }
IN_DIR="$(mktemp -d)"
case "$STAGE" in
  plan|analysis|test|bugfix|yt-apply-plan|article-apply-plan|phase1-validate)
    I=$(python3 "$S/codex-review-input.py" --target "$TARGET" --out-dir "$IN_DIR") || exit 1 ;;
  code|final)
    BASE="${REVIEW_BASE:-develop}"; BASE_DRIFT_NOTE=""
    if [[ "$TARGET" =~ ^PR-([0-9]+)$ ]]; then INPUT=$(gh pr diff "${BASH_REMATCH[1]}")
    else
      if ! MB=$(git merge-base "$BASE" HEAD 2>/dev/null) || [[ -z "$MB" ]]; then
        echo "[codex-review] merge-base($BASE, HEAD) 실패 — 중단 (REVIEW_BASE=<ref> 또는 git fetch --unshallow)" >&2; exit 1; fi
      if [[ -f "$TARGET" ]]; then INPUT=$(git diff "$MB" HEAD -- "$TARGET"); else INPUT=$(git diff "$MB" HEAD); fi
      DRIFT=$(git rev-list --count "$MB".."$BASE" 2>/dev/null || echo 0)
      [[ "${DRIFT:-0}" -gt 0 ]] && BASE_DRIFT_NOTE="base drift: \`$BASE\` 가 merge-base 이후 ${DRIFT}커밋 앞서 있다. 그 커밋들은 이 변경의 일부가 아니며 위 diff 에 포함돼 있지 않다 — 결함으로 보고하지 말 것."
    fi
    printf '%s\n' "$INPUT" > "$IN_DIR/target.diff"
    I=$(python3 "$S/codex-review-input.py" --diff-file "$IN_DIR/target.diff" --out-dir "$IN_DIR/out") || exit 1 ;;
esac
CHUNKS=$(sed -n 's/^CHUNKS=//p' <<<"$I"); INPUT=$(cat "$(sed -n 's/^CHUNK_1=//p' <<<"$I")")
echo "[codex-review] $(sed -n 's/^KIND=//p' <<<"$I") · 파일 $(sed -n 's/^FILES=//p' <<<"$I") · 제외 $(sed -n 's/^EXCLUDED=//p' <<<"$I") · 조각 $CHUNKS (제외 목록: $(sed -n 's/^EXCLUDED_LIST=//p' <<<"$I"))"
```
입력은 `codex-review-input.py` 가 만든다(#3638 폴더 검수 5조건): 파일·폴더·diff 모두 받고, 민감 경로(재무·법무·`.env`·키 파일)·`node_modules`·`.evidence`·생성물·바이너리는 **보내기 전에** 빼서 제외 목록에 남긴다. rc 1 = 보낼 것이 없다(전부 제외) → 중단. `CHUNKS` 가 2 이상이면(상한 `CODEX_REVIEW_MAX_BYTES` · 기본 200000) 조각 수를 알리고 **`CHUNK_<i>` 마다** `INPUT` 을 바꿔 Step 2~6 을 돈다 — Step 3~6 의 `--target` 은 `part<i>-$(basename "$TARGET")` 로 줘서 기록이 덮이지 않게 한다. Step 7 은 조각 중 하나라도 FAIL 이면 FAIL.
### Step 1.5~1.6 — 게이트(auto-stage · --cr · skip 패턴) + 분석 doc auto-route
`bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/codex-review-gate.sh" --stage "$STAGE" --target "$TARGET" --cr "${CR_ARG:-}"` → `RUN`·`STAGE`·`REASON`.
`RUN=0` → `[codex-review] <REASON> → 생략` 출력 후 exit 0(`CODEX_REVIEW_AUTO_STAGES` 기본 off · `--cr off|degrade` · `CODEX_REVIEW_SKIP_PATTERNS`, plan 계열은 skip 우회). `RUN=1` → 출력 `STAGE` 로 교체해 진행(plan + frontmatter `stage:` analysis|backlog|runbook → analysis; 끄기 `CODEX_REVIEW_NO_AUTOROUTE=1`). rc 2 = 판정 불가 → 중단·보고.
### Step 2 — Codex 호출 (모델: `CODEX_REVIEW_MODEL` > registry `codex:$CODEX_TIER` > `gpt-6.1-sol`)
```bash
CODEX_TIER="${CODEX_TIER:-high}"; if [[ -n "${CODEX_REVIEW_MODEL:-}" ]]; then MODEL="$CODEX_REVIEW_MODEL"
else MODEL=$("${FORGE_ROOT:-$HOME/forge}/shared/scripts/model-registry-resolve.sh" "codex:$CODEX_TIER" 2>/dev/null) || MODEL="gpt-6.1-sol"; fi
MODEL="$(bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/codex-transport.sh" gate "$MODEL" exec || echo "$MODEL")"   # 보낼 길(exec)의 codex 가 못 부르면 한 칸 아래로(#1971)
EFFORT_LEVEL="${EFFORT:-high}"   # #2058 검수 레그 high(사람 결정 2026-10-05)
[[ "$STAGE" == "final" ]] && case "$EFFORT_LEVEL" in low|medium) EFFORT_LEVEL="high" ;; esac; PROMPT_STAGE="$STAGE"; [[ "$PROMPT_STAGE" == "article-apply-plan" ]] && PROMPT_STAGE="yt-apply-plan"
PROMPT_FILE="${FORGE_ROOT:-$HOME/forge}/.claude/prompts/codex-review-${PROMPT_STAGE}.md"
[[ -f "$PROMPT_FILE" ]] || PROMPT_FILE="${FORGE_ROOT:-$HOME/forge}/.claude/prompts/codex-review-default.md"
( cat "$PROMPT_FILE"; echo; echo "---"; [[ -n "${BASE_DRIFT_NOTE:-}" ]] && { echo "## 범위 고지"; echo "$BASE_DRIFT_NOTE"; echo; }
  echo "## TARGET"; echo "$INPUT" ) | codex exec --model "$MODEL" -c model_reasoning_effort="\"$EFFORT_LEVEL\"" --skip-git-repo-check > "$WORK_DIR/codex-raw.txt"
```
모델은 `codex-transport.sh gate … exec` 를 한 번 거친다 — PATH 의 codex 가 그 id 를 못 부르면 한 칸 아래로 착지하고 stderr 로 `codex update` 를 권고한다(gpt-6.1-sol → 0.156.1 이면 gpt-6-sol → 0.153.4 이면 gpt-5.6-sol · 버전을 못 읽으면 gpt-6-sol). `CODEX_REVIEW_MODEL` 로 지정한 id 도 같은 게이트를 탄다.

**스키마**: `{stage, target, verdict: PASS|WARN|FAIL, score: 0-100, issues: [{severity: critical|high|medium|low, category: logic|security|performance|spec|test|architecture, file, line, message, fix}], suggestions, delta_vs_claude: agreement|disagreement|extension|null, model, cost_usd, ts}`
### Step 3~6 — JSON 정규화 · 저장 · Delta · INDEX
`bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/codex-review-save.sh" --stage "$STAGE" --target "$TARGET" --work-dir "$WORK_DIR" --model "$MODEL"` → `DATE`·`SLUG`·`OUT_DIR`·`OUT_JSON`·`OUT_MD`·`VERDICT`·`SCORE`·`DELTA`.
`codex-raw.txt` 에서 `"stage"`·`"verdict"` 첫 JSON 블록을 뽑아 `docs/reviews/{stage}/{DATE}-{SLUG}.{json,md}` 저장, Claude JSON 있으면 `delta/` 비교(`codex-monthly-stats.sh` 입력), `INDEX.md` 상단 1행. rc 1(블록 없음) = 실패 — 진행 금지. 출력 `OUT_DIR`·`DATE`·`SLUG` 를 같은 이름 변수로 Step 7 에 넘긴다.

### Step 7 — Blocking (차단선 = critical/high severity, 스키마 이탈은 fail-closed)
```bash
if [[ "$BLOCKING" == "true" ]]; then
  J="${OUT_DIR}/${DATE}-${SLUG}.json"; VERDICT=$(jq -r '.verdict' "$J")
  ELIGIBLE=$(jq -r 'if (.issues|type) != "array" then "no-array" elif (.issues|length) == 0 then "empty"
    elif ([.issues[] | (.severity//""|ascii_downcase|gsub("^\\s+|\\s+$";"")) | select(. != "critical" and . != "high" and . != "medium" and . != "low")] | length) > 0 then "bad-severity" else "ok" end' "$J" 2>/dev/null)
  if [[ "$ELIGIBLE" != "ok" ]]; then echo "⛔ 강등 자격 없음(${ELIGIBLE:-jq-failed}) — verdict 그대로"
    [[ "$VERDICT" == "FAIL" ]] && { echo "보고: ${OUT_DIR}/${DATE}-${SLUG}.md"; exit 1; }; fi
  BLOCKERS=$(jq '[.issues[]? | select((.severity//""|ascii_downcase|gsub("^\\s+|\\s+$";"")) as $s | $s=="critical" or $s=="high")] | length' "$J")
  [[ ! "$BLOCKERS" =~ ^[0-9]+$ ]] && { echo "⛔ severity 집계 실패 — 차단"; echo "보고: ${OUT_DIR}/${DATE}-${SLUG}.md"; exit 1; }
  if [[ "$VERDICT" == "FAIL" && "$BLOCKERS" -eq 0 && "$ELIGIBLE" == "ok" ]]; then
    VERDICT=WARN; TMP_J="$(mktemp)"   # INDEX 행도 'FAIL→WARN(severity-downgrade)' 로 정정
    jq --arg r "critical/high 0건 — severity 차단선에 의한 강등" '.effective_verdict="WARN" | .downgrade_reason=$r' "$J" > "$TMP_J" && mv "$TMP_J" "$J"; fi
  [[ "$VERDICT" == "FAIL" ]] && { echo "❌ Codex 2차 리뷰 FAIL — critical/high ${BLOCKERS}건 — 진행 차단"; echo "보고: ${OUT_DIR}/${DATE}-${SLUG}.md"; exit 1; }
fi
```
**FAIL 후**: 고치고 **테스트·기계 검사**로 확인한다 — 이 명령을 다시 부르지 않고 `/forge-multi` 로 올리지도 않는다(`dev-workflow-rules.md §운영 규칙 1`). 2회 고쳐도 테스트가 안 붙으면 멈추고 보고. 강등은 이 레인 한정(forge-multi 는 `combined<60` = FAIL → forge-pr `[STOP]`).
## 통합 지점 · 산출물
- Forge Dev: P3·P4 `plan`(권고) · P5.7 `code` · P6 6-TX `test` · P7 7-X `final`(blocking). SDD C-1·PGE 4.5(점수 60+ 시) = `code`. `analysis` 는 수동 전용. `code` WARN/FAIL → 사용자 컨펌 후 진행.
- plan PASS 기준(AD-50, score 무관): Critical 0 + High ≤2 + 보안·롤백 무결 — Critical/High 만 정정 의무, Medium/Low 는 정보용. OAuth $0 — env `CODEX_REVIEW_DAILY_LIMIT`·`CODEX_REVIEW_MONTHLY_BUDGET_USD`. 정책 `dev/rules-on-demand/codex-review-policy.md`.

## 단축 래퍼 공통 (#2288)
`/forge-{analysis,bug,code,plan,test}-review` 5개가 똑같이 들고 있던 단락의 정본이다 — 래퍼에는 이 절을 가리키는 1줄만 둔다(감사 2026-10-09 중복 축 C023).
- **개명**: 구 이름 `/cr-analysis`·`/cr-bug`·`/cr-code`·`/cr-plan`·`/cr-test` 는 2026-09-07 개명했다. 헬퍼 스크립트 파일명·감사로그·증거 경로(`cr-evidence/`)는 **그대로 둔다** — 쌓인 증거가 그 이름으로 묶여 있어서다. 간판만 바꾸고 배달 주소를 바꾸면 옛 증거가 통째로 안 보이게 된다.
- **모델**: **`codex:high`** 티어(high effort · #2058) — 이 단일 리뷰 레인은 astra 를 쓰지 않는다. id·하향 스위치(`--terra`/`--luna`)의 정본 = 위 §Step 2.
근거: 감사 2026-10-09 M-8 · #2288 — 같은 단락 5벌이 따로 낡는다(#1139 C034 가 모델 줄만 줄였고 사본은 남았다).
폐기조건: 옛 증거를 더 안 읽어도 되면 헬퍼 파일명까지 후속 개명하고 개명 줄을 지운다 · 래퍼가 없어지면 이 절도 지운다.
