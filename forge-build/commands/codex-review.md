---
description: OpenAI Codex 경유 2차 리뷰 게이트 (Claude 1차 리뷰 후 추가 검증). 모든 개발 단계 (plan/code/test/final/bugfix) 지원.
argument-hint: "--stage <plan|analysis|code|test|final|bugfix> --target <path|PR#> [--effort low|medium|high|xhigh] [--blocking] [--cr <on|degrade|off>] [--sol|--terra|--luna]"
group: verify
---

# /codex-review

> **인터페이스 구분(harness #3 2026-07-30)**: 이 문서 = **수동 슬래시 인터페이스**(`/codex-review --stage ...`). 자동/파이프라인 레인(P3~P7)은 `skills/codex-review/SKILL.md`. 의도적 이중 인터페이스 — 한쪽 삭제 금지, 로직 변경 시 양쪽 동기.
> ⚠️ **그 자동 레인은 기본 꺼져 있다**(`CODEX_REVIEW_AUTO_STAGES` 미설정 = off — 아래 §Step 1.5). 구 표기 "P3~P7 **자동 호출**" 은 2026-09-17 폐기 — 켜야 도는 것을 "자동" 으로만 읽으면 아무도 안 도는 게이트를 믿게 된다. 재현: `echo "[${CODEX_REVIEW_AUTO_STAGES:-미설정}]"` → `[미설정]`

Claude 자체 리뷰(1차)의 **동일 모델 맹점**을 보완하기 위해 OpenAI Codex로 **2차 게이트 리뷰**를 호출한다. SDD·PGE·Forge Dev 모든 단계에서 사용 가능. 단계별 정책(차단/권고)은 `--stage`로 분기.

**원칙**:
- Claude 1차 리뷰는 **그대로 유지**
- Codex 2차 리뷰는 **추가** (이중 검증)
- 결과는 표준 JSON 스키마 + Markdown 동시 저장
- Claude 결과 존재 시 자동 diff 생성

---

## ⛔ 이 커맨드를 건너뛰고 `mcp__codex__codex` 를 직접 부르지 마라

직접 호출하면 **검수의 실체가 통째로 빠진다.** 프롬프트만 비슷하고 게이트는 하나도 안 걸린다:

| 이 커맨드가 주는 것 | 직접 호출 시 |
|---|---|
| `docs/reviews/{stage}/` 에 점수·verdict JSON + INDEX 기록 | **아무것도 안 남는다** |
| 재호출 **cap=1** → 2회째 FAIL 은 `/cr-triple` 에스컬레이션 의무(§Step 7) | 상한이 없어 **같은 게이트를 무한히 돈다** |
| stage별 고정 rubric(`prompts/codex-review-*.md`) | 매번 호출자가 프롬프트를 새로 써 **채점 축이 흔들린다** |
| Step 1.6 auto-route · Step 5 `delta_vs_claude` | 없다 |

⚠️ **이 커맨드는 단일 Codex 레인이다 — "2벤더 교차" 를 준다고 적지 마라**(2026-09-13 cr-final HIGH
지적으로 정정). 2벤더 교차(Claude Opus + Codex Sol — 2026-09-17, 구 Fable+Astra)는 `/cr-triple`·`/cr-double`(= `forge-multi`)이고,
`/forge-pr §Step 3` 이 부르는 것도 그쪽이다. **두 레인은 증거를 다른 곳에 쓴다.**

**판별(사후에라도 확인하라)** — 레인마다 볼 경로가 다르다:

```bash
# ① codex-review 레인(이 커맨드·/forge-final 등 래퍼)
find "${FORGE_OUTPUTS:-$HOME/forge-outputs}/docs/reviews" -newermt "$(date +%F)" -type f | wc -l
# ② forge-multi 레인(/cr-triple·/cr-double — /forge-pr 이 부르는 정규 경로)
find "${FORGE_OUTPUTS:-$HOME/forge-outputs}/.claude/audit/cr-evidence" -newermt "$(date +%F)" -type f | wc -l
# 둘 다 0 이면 그날 "검수했다"는 보고는 근거가 없다.
```

⛔ **①만 보고 판정하지 마라.** `forge-multi` 의 `docs/reviews/` 발행은 **2026-07-24 에 폐지**됐다
(`skills/forge-multi/SKILL.md §산출물`). 그래서 정규 경로로 제대로 검수해도 ①은 **항상 0** 이다 —
①만 보면 멀쩡한 검수를 "근거 없음" 으로 오판한다.

근거: 2026-09-13 PR #545 에서 이 커맨드를 건너뛰고 MCP 를 직접 호출해 **같은 게이트를 5라운드**
돌았다. 문서 결함은 2라운드에 0 이 됐는데 cap=1·에스컬레이션 규약이 경로 밖이라 적용되지 않았다
(`harness-gaps/2026-09-13-cr-final-vs-string-contract-test-has-no-termination-rule.md`).
⚠️ **그 갭 리포트가 처음 근거로 든 "산출물 0건" 은 무효다** — 위 폐지 시점(07-24)과 겹쳐 생긴
오독이었고, 같은 날 cr-final 이 그 오류를 잡았다. 우회 사실은 **호출 기록**으로 확인할 일이지
이 판별 명령이 증명해 주지 않는다.
⚠️ **이 경고가 무력화되는 입력**: 이것은 문서 규약일 뿐 실행 차단이 아니다 — 호출자가 읽지 않으면
그대로 우회된다.
폐기조건: MCP 직접 호출을 감지·차단하는 훅이 생기면 이 절을 그 훅 설명으로 바꾼다.

---

## 선결 조건 (최초 1회)

```bash
npm install -g @openai/codex
npm install -g cc-plugin-codex
cc-plugin-codex install
codex   # /login → moongci38 ChatGPT 계정 OAuth
```

확인: `cat ~/.codex/auth.json | jq -r '.tokens.id_token'` JWT payload `email` 필드.

## 사용법

```
/codex-review --stage plan --target docs/spec/feature-x.md --blocking
/codex-review --stage code --target src/auth.ts
/codex-review --stage code --target PR-1234
/codex-review --stage test --target tests/e2e/login.spec.ts
/codex-review --stage final --target PR-1234 --effort xhigh --blocking
/codex-review --stage bugfix --target patches/fix-token-expiry.diff
```

단축 래퍼: `/forge-plan-review`, `/forge-analysis-review`, `/forge-code-review`, `/forge-test-review`, `/forge-final`, `/forge-bug-review` (각각 stage 자동 매핑).

---

## 인자

| 인자 | 값 | 기본값 | 의미 |
|------|-----|--------|------|
| `--stage` | `plan\|analysis\|code\|test\|final\|bugfix\|yt-apply-plan\|article-apply-plan\|phase1-validate` | (필수) | 리뷰 단계 |
| `--target` | 파일 경로 또는 `PR-N` | (필수) | 리뷰 대상 |
| `--effort` | `low\|medium\|high\|xhigh` | **`xhigh`** | 리뷰 강도 (2026-08-22 기본 상향 — 구 `medium`) |
| `--blocking` | 플래그 | stage별 자동 (아래 표) | FAIL 시 종료 코드 1 반환 |
| `--cr` | `on\|degrade\|off` | (없으면 `FORGE_AUTO_CR` env → 기본 `on`) | Codex 호출 제어. `degrade`/`off` 모두 단일 Codex 경로 skip. `on`은 env off도 강제. `cr-mode.sh`로 resolve. |

### Stage별 정책

| `--stage` | 입력 형태 | 리뷰 포커스 | `--blocking` 기본 |
|-----------|-----------|-------------|-------------------|
| `plan` | spec/plan `.md` 파일 | 요구 명확성, 누락, 모순, YAGNI 위반 | NO (권고, AD-50) |
| `analysis` | 분석노트·cross-repo·backlog·runbook `.md` (frontmatter `stage:` analysis\|backlog\|runbook) | 근거 충실도, 추정 태그 누락, 범위 명확성, 내부 모순, SSoT 주장 위험 (AC·testability·YAGNI 적용 X) | NO (권고) |
| `code` | 변경 파일/PR | 로직 버그, 보안(OWASP), 성능, 컨벤션 | NO (권고) |
| `test` | E2E 시나리오 (`.md`/`.spec.ts`) | 커버리지 갭, edge case, 가짜 통과 | NO |
| `final` | PR 전체 diff | 통합 검수 (스펙 추적성·롤백·UX) | **YES** |
| `bugfix` | patch + 재현 케이스 | 근본 원인 vs 우회, 회귀 가능성 | NO |
| `yt-apply-plan` | yt 스킬 `*-apply-plan.md` (개별/통합) | Forge 적용 가능성, 중복 제안, YAGNI, 근거 인용, 롤백 | **YES** |
| `article-apply-plan` | article 스킬 `*-apply-plan.md` (개별/통합) | 동상 (stage 별칭으로 yt 프롬프트 사용 — 심링크 폐지 2026-08-20) | **YES** |
| `phase1-validate` | `/forge-find-item` `validated-item.md` (Phase 1 사업 결정 게이트) | Reject 4·5 신호 근거·Moat·카테고리 옵션·Mike Hill 5·1인 규모 | **YES** |

---

## 절차

### Step 1 — 대상 확인 + diff 추출

```bash
# Stage별 입력 정규화
case "$STAGE" in
  plan|analysis|test|bugfix|yt-apply-plan|article-apply-plan|phase1-validate)
    # 파일 직접 읽기
    [[ -f "$TARGET" ]] || exit 1
    INPUT=$(cat "$TARGET")
    ;;
  code|final)
    # ── 범위 산정 규약 (필수) ────────────────────────────────────────────
    # 멀티세션이 기본이다 — 검수가 도는 동안에도 다른 세션이 develop 에 커밋한다.
    # `git diff develop` / `develop..HEAD` 는 **내 변경이 아닌 타 세션 커밋까지** 끌어와
    # 검수자가 "범위 오염 / 무관한 파일 포함"으로 오판한다(2026-07 PR #121·#122 에서
    # 2라운드 연속 발생, 회수 비용 = 검수 2회). 항상 merge-base 를 기준으로 내 변경만 자른다.
    BASE="${REVIEW_BASE:-develop}"
    BASE_DRIFT_NOTE=""
    if [[ "$TARGET" =~ ^PR-([0-9]+)$ ]]; then
      INPUT=$(gh pr diff "${BASH_REMATCH[1]}")   # gh 는 이미 merge-base 기준이라 안전
    else
      # merge-base 실패(base 미존재·shallow clone·공통 조상 부재)는 **fail-closed** 다.
      # 여기서 빈 MB 로 진행하면 INPUT 이 비어도 검수는 그대로 돌아 "지적 없음 → PASS" 가
      # 나온다. 범위를 못 정하면 검수를 하지 않는 것이 맞다.
      if ! MB=$(git merge-base "$BASE" HEAD 2>/dev/null) || [[ -z "$MB" ]]; then
        echo "[codex-review] merge-base($BASE, HEAD) 실패 — 검수 범위를 정할 수 없어 중단." >&2
        echo "  base 를 바꾸려면 REVIEW_BASE=<ref> 로 지정하라(shallow clone 이면 git fetch --unshallow)." >&2
        exit 1
      fi
      if [[ -f "$TARGET" ]]; then
        INPUT=$(git diff "$MB" HEAD -- "$TARGET")
      else
        INPUT=$(git diff "$MB" HEAD)
      fi
      # base drift 는 숨기지 않고 **사실만 분리 고지**한다. 검수자가 "왜 이 커밋이 섞였나"를
      # 결함으로 오판하지 않게 하는 것이 목적이며, 이 커밋들은 검수 대상이 아니다.
      DRIFT=$(git rev-list --count "$MB".."$BASE" 2>/dev/null || echo 0)
      if [[ "${DRIFT:-0}" -gt 0 ]]; then
        BASE_DRIFT_NOTE="base drift: \`$BASE\` 가 merge-base 이후 ${DRIFT}커밋 앞서 있다. 그 커밋들은 이 변경의 일부가 아니며 위 diff 에 포함돼 있지 않다 — 결함으로 보고하지 말 것."
      fi
    fi
    ;;
esac
```

### Step 1.5 — Auto-stage 게이트 (env 기반 활성/비활성) + --cr 모드 게이트

```bash
# CODEX_REVIEW_AUTO_STAGES 미설정 = off (기본 off, 팀 비용절감). 복원 = CODEX_REVIEW_AUTO_STAGES=all 또는 --cr on.
# "all" = 모든 stage 활성. 특정 값 설정 시 매칭 stage만 호출. "off"면 즉시 종료.
AUTO_STAGES="${CODEX_REVIEW_AUTO_STAGES:-off}"
if [[ "$AUTO_STAGES" == "off" ]]; then
  echo "[codex-review] CODEX_REVIEW_AUTO_STAGES=off → 호출 생략"
  exit 0
fi
if [[ "$AUTO_STAGES" != "all" && ! ",$AUTO_STAGES," == *",$STAGE,"* ]]; then
  echo "[codex-review] $STAGE 미포함 ($AUTO_STAGES) → 호출 생략"
  exit 0
fi

# --cr 게이트: cr-mode.sh로 effective mode 결정 (우선순위: --cr 인자 > FORGE_AUTO_CR env > on)
# codex-review = 단일 Codex 경로 → degrade/off 모두 "Codex 호출 없음"과 동일 → skip
# --cr on이면 CODEX_REVIEW_AUTO_STAGES=off보다 위에서 이미 빠져나갔으므로 여기서 on = 통과만
CR_MODE=$(~/forge/shared/scripts/cr-mode.sh "${CR_ARG:-}")
if [[ "$CR_MODE" == "off" || "$CR_MODE" == "degrade" ]]; then
  echo "[codex-review] --cr $CR_MODE → Codex 호출 생략"
  exit 0
fi

# 스킵 패턴 매칭 (TARGET이 파일 경로일 때만)
# 문서형 stage(plan/analysis/yt-apply-plan/article-apply-plan/phase1-validate)는 .md 파일이 정상 입력 → SKIP 회피
SKIP_PATTERNS="${CODEX_REVIEW_SKIP_PATTERNS:-}"
SKIP_BYPASS_STAGES="^(plan|analysis|yt-apply-plan|article-apply-plan|phase1-validate)$"
if [[ -n "$SKIP_PATTERNS" && -f "$TARGET" && ! "$STAGE" =~ $SKIP_BYPASS_STAGES && "$TARGET" =~ $SKIP_PATTERNS ]]; then
  echo "[codex-review] $TARGET → SKIP_PATTERNS 매칭, 호출 생략"
  exit 0
fi
```

### Step 1.6 — 분석 doc frontmatter auto-route (oscillation 방지)

`--stage plan`으로 호출됐으나 target `.md`의 YAML frontmatter `stage:` 값이 `analysis|backlog|runbook`이면 → `analysis` stage로 자동 전환. plan 기준(AC·testability·YAGNI)을 분석노트에 오적용해 영구 FAIL → 부분 수정 → 새 critical 재발하는 oscillation(L-55/L-56)을 caller-proof하게 차단. spec 파일(`docs/spec/*`, `.specify/specs/*`)은 이 frontmatter가 없어 영향 없음. 명시 override = `CODEX_REVIEW_NO_AUTOROUTE=1`.

```bash
if [[ "$STAGE" == "plan" && -f "$TARGET" && "${CODEX_REVIEW_NO_AUTOROUTE:-0}" != "1" ]]; then
  DOC_STAGE=$(awk 'BEGIN{n=0} /^---[[:space:]]*$/{n++; if(n==2) exit; next} n==1 && /^stage:[[:space:]]*/{sub(/^stage:[[:space:]]*/,""); gsub(/[[:space:]"'\'']/,""); print; exit}' "$TARGET")
  if [[ "$DOC_STAGE" =~ ^(analysis|backlog|runbook)$ ]]; then
    echo "[codex-review] $TARGET frontmatter stage:$DOC_STAGE 감지 → --stage plan을 analysis로 자동 전환 (plan 기준 오적용 방지)"
    STAGE="analysis"
  fi
fi
```

> backlog/runbook frontmatter도 `analysis` 프롬프트를 공용 (L-57 결정 — 분석노트·runbook·백로그 = analysis stage rubric). 별도 프롬프트 분리는 추후 필요 시.

### Step 2 — Codex 호출

```bash
# 모델·effort 선택 — 2026-06-17 OAuth(chatgpt) 전환 완료. codex 호출 $0(구독 포함).
# ⚠️ 2026-09-17 사람 지시 "advisor 에서만 최고급 모델 사용해" 로 **기본값 하향**: gpt-6-astra(codex:max) → gpt-5.6-sol(codex:high).
#   최고급 codex:max 는 advisor 전용이다. 이하 astra 서술(2026-09-06 재상향·CLI 0.153.4 가드)은 그 시점의 역사 기록이다.
# (구) 2026-09-06 Human 지시(GPT-6 Astra 출시 반영·advisor 병용)로 기본값 재상향: 모델 gpt-5.6-sol → gpt-6-astra.
#   effort 는 xhigh 유지(5단계 low/medium/high/xhigh/max 중 max 승격은 이번 범위 아님).
#   ⚠️ 구 표기 "기본값 상향: gpt-5.6-terra → gpt-5.6-sol"(2026-08-22)은 폐기 — 그때는 참이었고 지금 기본은 astra 다.
#   ⚠️ 로컬 codex CLI < 0.153.4 는 astra 를 HTTP 400 으로 거부한다.
#      ⚠️ **2026-09-07 정정: 구 표기 "그때는 sol 로 fail-open" 은 거짓이라 폐기.**
#         자동 하향은 `advisor-model-resolve.sh`(advisor 레인)에만 있다 — **이 검수 레인은 버전 가드가 없다.**
#         그래서 구 CLI 머신에서는 Codex 호출이 400 으로 죽는다. 내리려면 사람이 `--sol`(codex:high)을
#         **직접** 준다(아래 §비용 절 같은 취지).
#      ⚠️ **2026-09-12 정정: 구 표기 "그 레그가 분모에서 빠져 조용히 2-레그로 축소된다" 는 폐기.**
#         두 군데가 틀렸다. ①**조용하지 않다** — `forge-multi/workflow.js` 가 죽은 레그를 무효 처리하고
#         (`r._error === true` 필터) `expected` 와 어긋나면 `⚠️ DEGRADED` 배너 +
#         "근거등급은 낮다(상관된 맹점 공유)" 를 찍는다.
#         ⚠️ **구 표기의 줄번호 좌표(`:2564`·`:2330`·`:2327`)는 2026-09-17 폐기 — 셋 다 전혀 다른 줄을 가리키고 있었다**
#            (엔진이 커지면서 밀렸다). 주장 자체는 여전히 참이고 **틀린 것은 좌표뿐**이었다.
#            줄번호 대신 **문자열 앵커**를 쓴다 — 엔진이 바뀌어도 따라간다:
#              grep -n "_error === true" .claude/skills/forge-multi/workflow.js      # 무효 레그 필터
#              grep -n "LOADFAIL-REJECT" .claude/skills/forge-multi/workflow.js      # 로딩 실패 거부 블록
#              grep -n "_mkDegradedBanner\|DEGRADED" .claude/skills/forge-multi/workflow.js  # 배너
#            근거: 줄번호는 커밋 한 번에 썩는데 아무도 갱신하지 않는다. 실제로 이 파일이 그걸 근거로
#            갭 리포트 초판을 틀리게 썼다(아래 2026-09-12 항 참조) — 좌표를 지우는 것이 그 재발을 막는다.
#            폐기조건: 위 앵커 문자열이 엔진에서 사라지면 그때의 앵커로 바꿔 적는다.
#         ②"**2-레그로 축소**" 는 Gemini 3레그 시절 표현이다 — 2레그 체제에서 탈락하면 1레그다.
#         ⚠️ 이 구 문구에 실제로 속은 사례가 있다(2026-09-12, 주석을 1차 자료로 써서 갭 리포트
#            초판이 "조용히 축소된다"고 단정 → 같은 날 코드 실측으로 철회).
#            경위 → `forge-outputs/…/harness-gaps/2026-09-12-codex-cli-version-gate-silent-leg-loss.md`
#         ⚠️ 단, **이 파일(codex-review)은 단일 Codex 경로**다 — 여기서 400 이 나면 축소가 아니라
#            그 검수 자체가 실패한다(아래 §Step 2 실패 처리).
#      재현: grep -c 'codex --version' .claude/skills/forge-multi/workflow.js → 0 (버전 가드 부재 — 2026-09-12 재확인)
#      재현: grep -n "? _a.crMode : 'on'" .claude/skills/forge-multi/workflow.js → 439 (명시 호출 기본 on)
#      재현: grep -c DEGRADED .claude/skills/forge-multi/workflow.js → 1+ (배너 실재)
#      재현: codex --version → 0.153.4 (2026-09-06 관측)
#   이 파일이 `/forge-final`·`/forge-plan-review`·`/forge-code-review`·`/forge-test-review`·`/forge-bug-review`·`/forge-analysis-review` 6개 래퍼의
#   **실제 실행 경로**다 — 래퍼 문서만 고치면 값은 여기서 구 값으로 되돌아간다(PR #320 cr-final CRITICAL 실적발).
# apikey 폴백: ~/.codex/auth.json.apikey-backup-20260617 복원 가능. 폴백 시 API 가격 과금.
# --sol/--terra/--luna: Codex 검수 레그 tier 선택 (model-registry SSoT).
#   caller 인자 파싱: --sol→CODEX_TIER=high · --terra→default · --luna→low (사다리 재지정 2026-09-06).
#   미지정 시 기본 = codex:high = gpt-5.6-sol(2026-09-17). 즉 `--sol` 은 no-op(이미 기본) · `--terra`·`--luna` 가 하향 스위치다.
#   ⚠️ 구 표기 "미지정 기본 = codex:max = gpt-6-astra · `--sol` 도 하향"(2026-09-06)은 2026-09-17 폐기.
#   resolve 실패 시 fail-open → gpt-5.6-sol 폴백. 모델 id SSoT = model-registry.json.
# 기본 tier 도 registry 를 거친다 — 리터럴은 **resolve 실패 시 폴백**으로만 남는다.
#   (구 코드는 CODEX_TIER 미지정 시 registry 를 건너뛰고 리터럴을 썼다. 그러면 registry 가
#    max 티어 모델을 바꿔도 이 파일만 stale 해져 이번과 같은 드리프트가 재발한다 — PR #320 MEDIUM.)
CODEX_TIER="${CODEX_TIER:-high}"   # 2026-09-17: max(astra, advisor 전용) → high(sol)
# 우선순위: CODEX_REVIEW_MODEL(사람 명시) > registry(codex:$CODEX_TIER) > 리터럴 폴백.
#   ⚠️ 구판은 `resolve || MODEL="${CODEX_REVIEW_MODEL:-...}"` 라 **resolve 가 성공하면 env 가 아예
#   평가되지 않았다** — 문서는 "override" 라 안내하는데 실제로는 무시됐다(PR #320 r4 cr-final MEDIUM).
if [[ -n "${CODEX_REVIEW_MODEL:-}" ]]; then
  MODEL="$CODEX_REVIEW_MODEL"
else
  MODEL=$("${FORGE_ROOT:-$HOME/forge}/shared/scripts/model-registry-resolve.sh" "codex:$CODEX_TIER" 2>/dev/null) \
    || MODEL="gpt-5.6-sol"
fi
# effort: 2026-08-22 기본 xhigh. final 은 blocking 게이트라 **바닥값**을 xhigh 로 고정한다
#   (구 코드는 여기서 "high" 로 덮어써서 --effort xhigh 를 조용히 무효화했다 — PR #320 CRITICAL).
EFFORT_LEVEL="${EFFORT:-xhigh}"
[[ "$STAGE" == "final" ]] && EFFORT_LEVEL="xhigh"

# 프롬프트 stage별 선택
# stage 별칭: article-apply-plan 은 yt-apply-plan 프롬프트를 그대로 쓴다
#   (그 프롬프트 1행이 "--stage yt-apply-plan / --stage article-apply-plan" 겸용임을 스스로 명시).
#   종전에는 codex-review-article-apply-plan.md 를 **절대경로 심볼릭 링크**로 뒀는데, 이 한 개가
#   Windows/UNC(9p)에서 lstat 이 안 돼 세 가지를 동시에 일으켰다 — ①git 이 상시 "수정됨"으로 보고
#   (갭 L-2) ②forge-sync 가 이 항목만 건너뛰어 Windows 미러에 파일이 아예 없고 ③바로 아래 -f 가
#   실패해 default.md 로 **조용히 폴백**했다(= article 검수가 잘못된 프롬프트로 돌았다).
#   파일시스템 마법 대신 별칭으로 바꿔 심링크 자체를 없앤다. (부록 Z L-2·L-5, 2026-08-20)
# ⚠️ 이 별칭이 무력화되는 입력: 앞으로 article 전용 기준이 생겨 두 프롬프트가 갈라져야 하면
#   별칭을 지우고 codex-review-article-apply-plan.md 를 **실제 파일로** 새로 만들어야 한다.
PROMPT_STAGE="$STAGE"
[[ "$PROMPT_STAGE" == "article-apply-plan" ]] && PROMPT_STAGE="yt-apply-plan"
PROMPT_FILE="${FORGE_ROOT:-$HOME/forge}/.claude/prompts/codex-review-${PROMPT_STAGE}.md"
[[ -f "$PROMPT_FILE" ]] || PROMPT_FILE="${FORGE_ROOT:-$HOME/forge}/.claude/prompts/codex-review-default.md"

# 호출 (stdin = prompt + target)
( cat "$PROMPT_FILE"; echo; echo "---"
  [[ -n "${BASE_DRIFT_NOTE:-}" ]] && { echo "## 범위 고지"; echo "$BASE_DRIFT_NOTE"; echo; }
  echo "## TARGET"; echo "$INPUT" ) | \
  codex exec \
    --model "$MODEL" \
    -c model_reasoning_effort="\"$EFFORT_LEVEL\"" \
    --skip-git-repo-check \
  > "$WORK_DIR/codex-raw.txt"

# JSON 추출 (Codex stdout에 sandbox/hook 노이즈 섞임 → brace 균형 파싱)
python3 -c "
import re,json,pathlib,sys
raw=pathlib.Path('$WORK_DIR/codex-raw.txt').read_text()
i=0;n=len(raw);blocks=[]
while i<n:
    if raw[i]=='{':
        d=0;j=i
        while j<n:
            if raw[j]=='{':d+=1
            elif raw[j]=='}':
                d-=1
                if d==0:blocks.append(raw[i:j+1]);i=j+1;break
            j+=1
        else:break
    else:i+=1
for b in blocks:
    if '\"stage\"' in b and '\"verdict\"' in b:
        try:
            data=json.loads(b)
            data.setdefault('suggestions',[])
            data['model']='$MODEL'
            data['cost_usd']=0.0
            print(json.dumps(data,indent=2,ensure_ascii=False))
            sys.exit(0)
        except: continue
sys.exit('no valid JSON in codex output')
" > "$WORK_DIR/codex-raw.json"
```

대안 (Codex CLI exec 미지원 시): `cc-plugin-codex` 호출 또는 ChatGPT 웹 API 사용.

### Step 3 — JSON 표준 스키마

Codex 출력을 다음 스키마로 정규화:

```json
{
  "stage": "plan|analysis|code|test|final|bugfix",
  "target": "path/or/PR-N",
  "verdict": "PASS|WARN|FAIL",
  "score": 0-100,
  "issues": [
    {
      "severity": "critical|high|medium|low",
      "category": "logic|security|performance|spec|test|architecture",
      "file": "src/auth.ts",
      "line": 42,
      "message": "토큰 만료 검사가 < 대신 <= 사용 — 경계값에서 1초 누수",
      "fix": "Math.floor(Date.now()/1000) <= exp 로 변경"
    }
  ],
  "suggestions": ["..."],
  "delta_vs_claude": "agreement|disagreement|extension|null",
  "model": "gpt-5.6-sol",
  "cost_usd": 0.0,
  "ts": "2026-05-07T05:30:00Z"
}
```

### Step 4 — 저장

```bash
DATE=$(date +%Y-%m-%d)
SLUG=$(basename "$TARGET" | tr '/' '-' | sed 's/\.[^.]*$//')

OUT_DIR="${FORGE_OUTPUTS:-$HOME/forge-outputs}/docs/reviews/${STAGE}"
mkdir -p "$OUT_DIR"

# JSON 저장
cp "$WORK_DIR/codex-raw.json" "${OUT_DIR}/${DATE}-${SLUG}.json"

# Markdown 변환 저장
jq -r '...' "${OUT_DIR}/${DATE}-${SLUG}.json" > "${OUT_DIR}/${DATE}-${SLUG}.md"
```

### Step 5 — Claude vs Codex Delta 자동 기록 (JSON + Markdown)

이전 단계에서 Claude가 동일 대상을 리뷰한 결과(`forge-outputs/docs/reviews/claude/{stage}/{DATE}-{SLUG}.json`)가 있으면 자동 비교 후 **codex JSON의 `delta_vs_claude` 필드를 채운다**.

```bash
CLAUDE_JSON="${FORGE_OUTPUTS:-$HOME/forge-outputs}/docs/reviews/claude/${STAGE}/${DATE}-${SLUG}.json"
CODEX_JSON="${OUT_DIR}/${DATE}-${SLUG}.json"

# 비교 알고리즘 → "agreement" | "disagreement" | "extension" | "null"
DELTA=$(python3 ~/forge/shared/scripts/codex-delta-compute.py "$CLAUDE_JSON" "$CODEX_JSON" 2>/dev/null || echo "null")

# JSON 갱신 (delta_vs_claude 필드 자동 기록)
jq --arg d "$DELTA" '.delta_vs_claude = $d' "$CODEX_JSON" > "$CODEX_JSON.tmp" \
  && mv "$CODEX_JSON.tmp" "$CODEX_JSON"

# Markdown delta 생성 (Claude 결과 존재 시만)
if [[ -f "$CLAUDE_JSON" ]]; then
  cat > "${FORGE_OUTPUTS:-$HOME/forge-outputs}/docs/reviews/delta/${DATE}-${SLUG}.md" <<MD
## Claude vs Codex Delta — ${SLUG}

**판정**: ${DELTA}

### Claude verdict
$(jq -r '.verdict' "$CLAUDE_JSON")

### Codex verdict
$(jq -r '.verdict' "$CODEX_JSON")

### Claude 카테고리
$(jq -r '.issues[].category' "$CLAUDE_JSON" | sort -u)

### Codex 카테고리
$(jq -r '.issues[].category' "$CODEX_JSON" | sort -u)
MD
fi
```

**비교 알고리즘** (`codex-delta-compute.py`):
- `disagreement`: 정반대 verdict 또는 Claude critical 카테고리가 Codex에 없음
- `extension`: Claude PASS + Codex WARN/FAIL / Claude 무이슈 + Codex 이슈 / 카테고리 불일치
- `agreement`: 카테고리 ≥50% 일치 (Jaccard)
- `null`: Claude 결과 부재

`delta_vs_claude` 필드는 `codex-monthly-stats.sh` 효과 측정의 입력. 미기록 시 통계 의사결정 불가.

### Step 6 — INDEX 갱신

`forge-outputs/docs/reviews/INDEX.md` 상단에 1줄 추가:

```markdown
| {DATE} | {STAGE} | {SLUG} | {VERDICT} | {SCORE} | [link]({STAGE}/{DATE}-{SLUG}.md) |
```

### Step 7 — Blocking 처리

**차단선은 `verdict` 가 아니라 `severity` 다.** `verdict` 는 검수기가 자유롭게 정하므로
critical/high 가 **0건인데도** medium/low 몇 건만으로 `FAIL` 이 나온다. 그대로 막으면
"고쳐야 할 치명적 결함은 없는데 진행이 막히는" 상태가 무한히 이어진다.

```bash
if [[ "$BLOCKING" == "true" ]]; then
  J="${OUT_DIR}/${DATE}-${SLUG}.json"
  VERDICT=$(jq -r '.verdict' "$J")
  # 차단 대상은 critical/high 뿐이다. medium/low 는 권고다.
  # ⚠️ `ascii_downcase` 필수 — 외부 워커가 'Critical'·'HIGH' 로 내면 엄격 비교는 0 으로 센다.
  #    workflow.js 가 2026-08-11 에 같은 결함을 겪고 toLowerCase 로 고친 전례가 있다.
  # ⛔ **강등 자격을 먼저 검사한다 — 이게 fail-closed 의 실체다.**
  #    ⚠️ `.issues[]?` 와 `.severity//""` 는 스키마 이탈을 **전부 삼켜 0 을 만든다**.
  #    그래서 "숫자가 아니면 차단" 만으로는 JSON 파싱 오류 하나밖에 못 잡는다 —
  #    issues 부재·null·문자열·키명 변경·미지 severity 가 전부 "critical/high 0건" 으로
  #    통과했다(2026-09-13 cr-final 2차 HIGH, jq 6케이스 실측).
  #    자격 조건 셋을 **모두** 만족해야만 강등을 검토한다:
  #      ①`.issues` 가 배열  ②모든 severity 가 {critical,high,medium,low} 중 하나
  #      ③총 issues ≥ 1  (FAIL 인데 0건 = 검수를 못 한 것이지 통과가 아니다)
  ELIGIBLE=$(jq -r '
    if (.issues|type) != "array" then "no-array"
    elif (.issues|length) == 0 then "empty"
    elif ([.issues[] | (.severity//""|ascii_downcase|gsub("^\\s+|\\s+$";""))
           | select(. != "critical" and . != "high" and . != "medium" and . != "low")] | length) > 0
      then "bad-severity"
    else "ok" end' "$J" 2>/dev/null)
  if [[ "$ELIGIBLE" != "ok" ]]; then
    echo "⛔ 강등 자격 없음(${ELIGIBLE:-jq-failed}) — 판정 불가다. verdict 를 그대로 적용한다."
    echo "   (issues 가 배열이 아니거나 비었거나 severity 가 규격 밖이다 — '0건이라 안전' 이 아니다)"
    [[ "$VERDICT" == "FAIL" ]] && { echo "보고: ${OUT_DIR}/${DATE}-${SLUG}.md"; exit 1; }
  fi
  BLOCKERS=$(jq '[.issues[]? | select((.severity//""|ascii_downcase|gsub("^\\s+|\\s+$";"")) as $s | $s=="critical" or $s=="high")] | length' "$J")
  ADVISORY=$(jq '[.issues[]? | select((.severity//""|ascii_downcase|gsub("^\\s+|\\s+$";"")) as $s | $s=="medium" or $s=="low")] | length' "$J")
  if [[ ! "$BLOCKERS" =~ ^[0-9]+$ ]]; then
    echo "⛔ severity 집계 실패(BLOCKERS='${BLOCKERS}') — 판정 불가. 강등하지 않고 차단한다."
    echo "보고: ${OUT_DIR}/${DATE}-${SLUG}.md"
    exit 1
  fi
  if [[ "$VERDICT" == "FAIL" && "$BLOCKERS" -eq 0 && "$ELIGIBLE" == "ok" ]]; then
    echo "⚠️ verdict=FAIL 이나 critical/high 0건 — WARN 으로 강등하고 진행한다."
    echo "   권고 ${ADVISORY}건은 보고에 그대로 싣는다(무시가 아니라 비차단이다)."
    VERDICT=WARN
    # 강등 사실을 **산출물에도** 남긴다 — Step 6 이 INDEX 에 이미 FAIL 을 적었으므로,
    # 기록만 FAIL 이고 진행은 WARN 인 어긋남을 여기서 닫는다.
    TMP_J="$(mktemp)"
    jq --arg r "critical/high 0건 — severity 차단선에 의한 강등" \
       '.effective_verdict="WARN" | .downgrade_reason=$r' "$J" > "$TMP_J" && mv "$TMP_J" "$J"
    echo "   ↳ INDEX 행을 'FAIL→WARN(severity-downgrade)' 로 정정하라(Step 6 산출물)."
  fi
  [[ "$VERDICT" == "FAIL" ]] && {
    echo "❌ Codex 2차 리뷰 FAIL — critical/high ${BLOCKERS}건 — 진행 차단"
    echo "보고: ${OUT_DIR}/${DATE}-${SLUG}.md"
    exit 1
  }
fi
```

⚠️ **이 강등은 `codex-review` 레인 한정이다.** `/forge-pr §Step 3` 이 부르는 정규 경로
(`/cr-triple` = `forge-multi`)는 **다른 판정선**을 쓴다 — `combined<60` 이면 critical/high 0 이어도
`FAIL` 이고, `forge-pr` 은 그 FAIL 을 `[STOP]` 으로 받는다. 두 레인의 차단선을 하나로 합치는 것은
별건이다(`harness-gaps/2026-09-13-…-no-termination-rule.md §추가 제안 5`).

근거: 2026-09-13 PR #545 에서 2~5라운드가 전부 **CRITICAL/HIGH 0 + MEDIUM 몇 건**으로 `FAIL` 이
나왔다. 차단선과 개선 제안이 한 등급판에 섞여 있어서, 고칠 치명적 결함이 없는데도 게이트가 계속
닫혔다. ⚠️ **이 강등이 무력화되는 입력**: 검수기가 실제 critical 을 medium 으로 낮춰 적으면
그대로 통과한다 — 등급 자체의 타당성은 이 로직이 보지 않는다.
폐기조건: 검수기 rubric 에 "무엇이 차단인가" 가 직접 박히면 이 강등 로직을 지운다.

#### FAIL 후 에스컬레이션 경로 (WAVE-2 P3 — bound=1, light-touch)

`--blocking` FAIL 시 두 가지 경로 중 선택:

**A. 호출자 재호출 (cap=1 — 별도 CLI 플래그 아님, 동작 규약)**: 호출자가 FAIL 이슈를 수정한 뒤 동일 명령을 1회 재실행. codex-review는 leaf gate이므로 내부 루프 추가 없이 **호출자 책임으로 재호출**. 재실행 횟수 cap=1 (동일 대상에 대한 두 번째 재호출은 cr-triple 에스컬레이션 의무).

```bash
# 수정 후 1회 재호출 예시 (cap=1):
/codex-review --stage final --target PR-1234 --effort xhigh --blocking
# 재호출에서도 FAIL → /cr-triple 에스컬레이션 (아래 B)
```

**B. `cr-triple` 에스컬레이션**: `--blocking` FAIL + 수정 후 재호출에서도 FAIL → `/cr-triple` 호출. cr-triple은 3-LLM 병렬 리뷰로 최종 판정. codex-review 단독 루프 추가 금지 — 에스컬레이션이 유일한 bounded 경로.

```bash
# cr-triple 에스컬레이션 (cap=1, 재호출 FAIL 후에만):
/cr-triple --target PR-1234
```

> **Note**: codex-review는 단일 Codex 경로 leaf gate. 내부 retry 루프 추가 X. 모델/인증/비용 로직 변경 X.

---

## Stage별 호출 예시

### plan (Spec/Plan 작성 직후) — 권고 (AD-50)
```bash
/codex-review --stage plan --target docs/spec/auth-refactor.md
```
- AD-50 (2026-05-15): blocking 격하 (YES → NO). codex 자체 verdict (`PASS|WARN|FAIL`) = 참고만.
- **Forge 적용 PASS 기준**: Critical 0 + High ≤2 + 보안·롤백 무결 (score 무관).
- Critical/High만 정정 의무. Medium/Low = 정보용.
- 근거: plan stage history PASS 0건 = score ≥80 임계 비현실 입증.

### code (PR 또는 파일 변경 후)
```bash
/codex-review --stage code --target src/auth/middleware.ts
/codex-review --stage code --target PR-1234
```
- WARN/FAIL → 사용자 컨펌 후 진행 (권고).

### test (E2E 시나리오 작성 후)
```bash
/codex-review --stage test --target tests/e2e/checkout.spec.ts
```
- 커버리지 갭, edge case 누락 검토.

### final (PR 머지 직전)
```bash
/codex-review --stage final --target PR-1234 --effort xhigh --blocking
```
- 적대적 리뷰. FAIL → PR 차단.

### bugfix (버그 수정 patch)
```bash
/codex-review --stage bugfix --target patches/fix-token-leak.diff
```
- 근본 원인 vs 우회 판별.

---

## 통합 지점 (이중 게이트)

### SDD
- Phase 1 끝: `--stage plan` (수동, 권고 — AD-50)
- Check C-1: `--stage code` (자동, 권고)

### PGE
- Phase 1 Planner 산출 후: `--stage plan` (수동, 권고 — AD-50)
- Phase 4.5 (Evaluator 후): `--stage code` (자동, 점수 60+ 시)

### Forge Dev
| Phase | Codex stage | Blocking |
|-------|-------------|----------|
| P3 (개발계획 패키지 — `/forge-plan`) | `plan` | NO (권고, AD-50) |
| P4 (Spec — `/forge-spec`) | `plan` | NO (권고, AD-50) |
| P5 Check P5.7 | `code` | NO |
| P6 Check 6-TX | `test` | NO |
| P7 Check 7-X | `final` | YES |

### 수동 전용 (파이프라인 미배선)
- `analysis` — 분석노트·cross-repo·backlog·runbook doc. `/forge-analysis-review <path>` 수동 호출만. SDD/PGE/Forge Dev 자동 게이트에 배선하지 않음 (분석노트는 즉시 실행 가능 산출물이 아님 — plan/code/test 게이트와 성격 다름). `--stage plan`이 분석 doc에 잘못 걸리면 Step 1.6 auto-route가 가로챔.

---

## 비용 통제

**현재 설정**: auth_mode=`chatgpt` (OAuth), 이 레인 기본 model=`gpt-5.6-sol`(codex:high) + `model_reasoning_effort="xhigh"` → **구독 포함, API 과금 $0**.
> ⚠️ 구 표기 "model=`gpt-6-astra`(2026-09-06 상향)" 은 2026-09-17 폐기 — 최고급 astra 는 advisor 전용(사람 지시). 아래 astra 호출 조건은 advisor·사람 override(`CODEX_REVIEW_MODEL`) 용 참고다.
> ✅ `gpt-6-astra` 는 ChatGPT OAuth 로 **호출 가능**하다(`gpt-6` 단독·`gpt-6-terra` 등은 OAuth 거부).
> ⚠️ **로컬 codex CLI 0.153.4 이상 필요** — 그 아래(예: 0.144.3)는 astra 요청을 HTTP 400 으로 거부한다.
>    재현: `codex --version` → `0.153.4` (2026-09-06 관측).
> apikey 폴백: `~/.codex/auth.json.apikey-backup-20260617` 복원 시 API 가격 과금(그때는 effort 도 비용에 직결).

| Stage | 모델 | Reasoning Effort | 비용 (OAuth) | 비상 폴백 (apikey 시) |
|-------|------|------------------|-------------|----------------------|
| `plan` | gpt-5.6-sol | xhigh | **$0.00** | 종량 시 상승 |
| `analysis` | gpt-5.6-sol | xhigh | **$0.00** | 종량 시 상승 |
| `code` | gpt-5.6-sol | xhigh | **$0.00** | 종량 시 상승 |
| `test` | gpt-5.6-sol | xhigh | **$0.00** | 종량 시 상승 |
| `final` | **gpt-5.6-sol** | **xhigh** | **$0.00** | 종량 시 상승 |
| `bugfix` | gpt-5.6-sol | xhigh | **$0.00** | 종량 시 상승 |

모델 override (env):
```
export CODEX_REVIEW_MODEL="gpt-5.6-sol"            # 현재 기본값 (2026-09-17 하향, 구: gpt-6-astra — advisor 전용)
export CODEX_REVIEW_DAILY_LIMIT=20
export CODEX_REVIEW_MONTHLY_BUDGET_USD=20
```

---

## 출력 디렉토리

```
forge-outputs/docs/reviews/
├── INDEX.md                          ← 자동 갱신
├── plan/{DATE}-{slug}.{md,json}
├── analysis/{DATE}-{slug}.{md,json}  ← 분석노트·cross-repo·backlog·runbook
├── code/...
├── test/...
├── final/...
├── bugfix/...
└── delta/{DATE}-{slug}.md            ← Claude vs Codex diff
```

---

## 관련

- 1차 리뷰: `code-reviewer` 에이전트 (`forge/.claude/agents/code-reviewer/`)
- 정책: `forge/dev/rules-on-demand/codex-review-policy.md`
- 단축 래퍼: `/forge-plan-review`, `/forge-analysis-review`, `/forge-code-review`, `/forge-test-review`, `/forge-final`, `/forge-bug-review`
- 통합 게이트: SDD Check C-1, PGE Phase 4.5, Forge Dev Phase 2~9
- 프롬프트: `forge/.claude/prompts/codex-review-{stage}.md` (analysis stage = `codex-review-analysis.md`, backlog/runbook frontmatter도 공용)
> 실패 시 [[pev-self-correction]] 적용
