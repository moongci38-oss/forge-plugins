---
description: OpenAI Codex 경유 2차 리뷰 게이트 (Claude 1차 리뷰 후 추가 검증). 모든 개발 단계 (plan/code/test/final/bugfix) 지원.
argument-hint: "--stage <plan|analysis|code|test|final|bugfix> --target <path|PR#> [--effort low|medium|high|xhigh] [--blocking] [--cr <on|degrade|off>] [--sol|--terra|--luna]"
group: verify
---

# /codex-review

수동 슬래시 인터페이스. 자동 레인은 `skills/codex-review/SKILL.md`(기본 off — `CODEX_REVIEW_AUTO_STAGES`). 로직 변경 시 양쪽 동기.
Claude 1차 리뷰에 Codex **단일 레인** 2차 리뷰를 추가한다(2벤더 교차는 `/forge-multi`). ⛔ `mcp__codex__codex` 직접 호출 금지 — 기록(`docs/reviews/`)·cap=1·stage rubric(`prompts/codex-review-*.md`)이 빠진다.
단축 래퍼: `/forge-plan-review` `/forge-analysis-review` `/forge-code-review` `/forge-test-review` `/forge-final` `/forge-bug-review`. 선결: codex CLI 설치 + `codex` /login(ChatGPT OAuth).
## 인자
| 인자 | 기본 | 의미 |
|---|---|---|
| `--stage` | 필수 | `plan\|analysis\|code\|test\|final\|bugfix\|yt-apply-plan\|article-apply-plan\|phase1-validate` |
| `--target` | 필수 | 파일 경로 또는 `PR-N` |
| `--effort` | `xhigh` | final 은 xhigh 고정 |
| `--blocking` | stage별 | FAIL 시 exit 1 — 기본 YES: `final`·`yt-apply-plan`·`article-apply-plan`·`phase1-validate` / 그 외 권고(plan = AD-50) |
| `--cr` | `FORGE_AUTO_CR`→`on` | `degrade`/`off` = Codex 호출 skip (`cr-mode.sh`) |
| `--sol/--terra/--luna` | sol | `CODEX_TIER`=high/default/low |

포커스: plan=요구 명확성·누락·모순·YAGNI · analysis=근거·추정 태그·범위·SSoT 주장 · code=로직·보안·성능 · test=커버리지 갭·가짜 통과 · final=통합(추적성·롤백) · bugfix=근본원인 vs 우회.
## 절차
### Step 1 — 입력 (code/final 은 merge-base 기준, 실패 시 fail-closed)
```bash
case "$STAGE" in
  plan|analysis|test|bugfix|yt-apply-plan|article-apply-plan|phase1-validate)
    [[ -f "$TARGET" ]] || exit 1; INPUT=$(cat "$TARGET") ;;
  code|final)
    BASE="${REVIEW_BASE:-develop}"; BASE_DRIFT_NOTE=""
    if [[ "$TARGET" =~ ^PR-([0-9]+)$ ]]; then INPUT=$(gh pr diff "${BASH_REMATCH[1]}")
    else
      if ! MB=$(git merge-base "$BASE" HEAD 2>/dev/null) || [[ -z "$MB" ]]; then
        echo "[codex-review] merge-base($BASE, HEAD) 실패 — 중단 (REVIEW_BASE=<ref> 또는 git fetch --unshallow)" >&2; exit 1; fi
      if [[ -f "$TARGET" ]]; then INPUT=$(git diff "$MB" HEAD -- "$TARGET"); else INPUT=$(git diff "$MB" HEAD); fi
      DRIFT=$(git rev-list --count "$MB".."$BASE" 2>/dev/null || echo 0)
      [[ "${DRIFT:-0}" -gt 0 ]] && BASE_DRIFT_NOTE="base drift: \`$BASE\` 가 merge-base 이후 ${DRIFT}커밋 앞서 있다. 그 커밋들은 이 변경의 일부가 아니며 위 diff 에 포함돼 있지 않다 — 결함으로 보고하지 말 것."
    fi ;;
esac
```
### Step 1.5~1.6 — 게이트(auto-stage · --cr · skip 패턴) + 분석 doc auto-route
`bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/codex-review-gate.sh" --stage "$STAGE" --target "$TARGET" --cr "${CR_ARG:-}"` → `RUN`·`STAGE`·`REASON`.
`RUN=0` → `[codex-review] <REASON> → 생략` 출력 후 exit 0(`CODEX_REVIEW_AUTO_STAGES` 기본 off · `--cr off|degrade` · `CODEX_REVIEW_SKIP_PATTERNS`, plan 계열은 skip 우회). `RUN=1` → 출력 `STAGE` 로 교체해 진행(plan + frontmatter `stage:` analysis|backlog|runbook → analysis; 끄기 `CODEX_REVIEW_NO_AUTOROUTE=1`). rc 2 = 판정 불가 → 중단·보고.
### Step 2 — Codex 호출 (모델: `CODEX_REVIEW_MODEL` > registry `codex:$CODEX_TIER` > `gpt-6-sol`)
```bash
CODEX_TIER="${CODEX_TIER:-high}"; if [[ -n "${CODEX_REVIEW_MODEL:-}" ]]; then MODEL="$CODEX_REVIEW_MODEL"
else MODEL=$("${FORGE_ROOT:-$HOME/forge}/shared/scripts/model-registry-resolve.sh" "codex:$CODEX_TIER" 2>/dev/null) || MODEL="gpt-6-sol"; fi
EFFORT_LEVEL="${EFFORT:-xhigh}"
[[ "$STAGE" == "final" ]] && EFFORT_LEVEL="xhigh"; PROMPT_STAGE="$STAGE"; [[ "$PROMPT_STAGE" == "article-apply-plan" ]] && PROMPT_STAGE="yt-apply-plan"
PROMPT_FILE="${FORGE_ROOT:-$HOME/forge}/.claude/prompts/codex-review-${PROMPT_STAGE}.md"
[[ -f "$PROMPT_FILE" ]] || PROMPT_FILE="${FORGE_ROOT:-$HOME/forge}/.claude/prompts/codex-review-default.md"
( cat "$PROMPT_FILE"; echo; echo "---"; [[ -n "${BASE_DRIFT_NOTE:-}" ]] && { echo "## 범위 고지"; echo "$BASE_DRIFT_NOTE"; echo; }
  echo "## TARGET"; echo "$INPUT" ) | codex exec --model "$MODEL" -c model_reasoning_effort="\"$EFFORT_LEVEL\"" --skip-git-repo-check > "$WORK_DIR/codex-raw.txt"
```
구 CLI(<0.156.1)는 gpt-6-* 를 400 거부 — 사람이 `CODEX_REVIEW_MODEL` 로 내린다.

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
**FAIL 후 (cap=1)**: 수정 후 동일 명령 1회 재호출 → 또 FAIL 이면 `/forge-multi --target <대상>` 에스컬레이션 의무. 내부 retry 루프 금지. 강등은 이 레인 한정(forge-multi 는 `combined<60` = FAIL → forge-pr `[STOP]`).
## 통합 지점 · 산출물
- Forge Dev: P3·P4 `plan`(권고) · P5.7 `code` · P6 6-TX `test` · P7 7-X `final`(blocking). SDD C-1·PGE 4.5(점수 60+ 시) = `code`. `analysis` 는 수동 전용. `code` WARN/FAIL → 사용자 컨펌 후 진행.
- plan PASS 기준(AD-50, score 무관): Critical 0 + High ≤2 + 보안·롤백 무결 — Critical/High 만 정정 의무, Medium/Low 는 정보용. OAuth $0 — env `CODEX_REVIEW_DAILY_LIMIT`·`CODEX_REVIEW_MONTHLY_BUDGET_USD`. 정책 `dev/rules-on-demand/codex-review-policy.md`.
