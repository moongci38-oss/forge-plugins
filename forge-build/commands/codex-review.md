---
description: OpenAI Codex 경유 2차 리뷰 게이트 (Claude 1차 리뷰 후 추가 검증). 모든 개발 단계 (plan/code/test/final/bugfix) 지원.
argument-hint: "--stage <plan|analysis|code|test|final|bugfix> --target <path|PR#> [--effort low|medium|high] [--blocking] [--cr <on|degrade|off>]"
group: verify
---

# /codex-review

Claude 자체 리뷰(1차)의 **동일 모델 맹점**을 보완하기 위해 OpenAI Codex로 **2차 게이트 리뷰**를 호출한다. SDD·PGE·Forge Dev 모든 단계에서 사용 가능. 단계별 정책(차단/권고)은 `--stage`로 분기.

**원칙**:
- Claude 1차 리뷰는 **그대로 유지**
- Codex 2차 리뷰는 **추가** (이중 검증)
- 결과는 표준 JSON 스키마 + Markdown 동시 저장
- Claude 결과 존재 시 자동 diff 생성

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
/codex-review --stage final --target PR-1234 --effort high --blocking
/codex-review --stage bugfix --target patches/fix-token-expiry.diff
```

단축 래퍼: `/cr-plan`, `/cr-analysis`, `/cr-code`, `/cr-test`, `/cr-final`, `/cr-bug` (각각 stage 자동 매핑).

---

## 인자

| 인자 | 값 | 기본값 | 의미 |
|------|-----|--------|------|
| `--stage` | `plan\|analysis\|code\|test\|final\|bugfix\|yt-apply-plan\|article-apply-plan\|phase1-validate` | (필수) | 리뷰 단계 |
| `--target` | 파일 경로 또는 `PR-N` | (필수) | 리뷰 대상 |
| `--effort` | `low\|medium\|high` | `medium` | 리뷰 강도 (high = adversarial) |
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
| `article-apply-plan` | article 스킬 `*-apply-plan.md` (개별/통합) | 동상 (article용 prompt = yt symlink) | **YES** |
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
    # PR 번호면 gh pr diff, 파일이면 git diff
    if [[ "$TARGET" =~ ^PR-([0-9]+)$ ]]; then
      INPUT=$(gh pr diff "${BASH_REMATCH[1]}")
    elif [[ -f "$TARGET" ]]; then
      INPUT=$(git diff develop -- "$TARGET")
    else
      INPUT=$(git diff develop)
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
# 모델·effort 선택 — 2026-06-17 OAuth(chatgpt) 전환 완료. config model=gpt-5.5. codex 호출 $0.
# apikey 폴백: ~/.codex/auth.json.apikey-backup-20260617 복원 가능. 폴백 시 gpt-5.5 API 가격 과금.
MODEL="${CODEX_REVIEW_MODEL:-gpt-5.5}"
EFFORT_LEVEL="${EFFORT:-medium}"
[[ "$STAGE" == "final" ]] && EFFORT_LEVEL="high"

# 프롬프트 stage별 선택
PROMPT_FILE="${FORGE_ROOT:-$HOME/forge}/.claude/prompts/codex-review-${STAGE}.md"
[[ -f "$PROMPT_FILE" ]] || PROMPT_FILE="${FORGE_ROOT:-$HOME/forge}/.claude/prompts/codex-review-default.md"

# 호출 (stdin = prompt + target)
( cat "$PROMPT_FILE"; echo; echo "---"; echo "## TARGET"; echo "$INPUT" ) | \
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
  "model": "gpt-5.5",
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

```bash
if [[ "$BLOCKING" == "true" ]]; then
  VERDICT=$(jq -r '.verdict' "${OUT_DIR}/${DATE}-${SLUG}.json")
  [[ "$VERDICT" == "FAIL" ]] && {
    echo "❌ Codex 2차 리뷰 FAIL — 진행 차단"
    echo "보고: ${OUT_DIR}/${DATE}-${SLUG}.md"
    exit 1
  }
fi
```

#### FAIL 후 에스컬레이션 경로 (WAVE-2 P3 — bound=1, light-touch)

`--blocking` FAIL 시 두 가지 경로 중 선택:

**A. 호출자 재호출 (cap=1 — 별도 CLI 플래그 아님, 동작 규약)**: 호출자가 FAIL 이슈를 수정한 뒤 동일 명령을 1회 재실행. codex-review는 leaf gate이므로 내부 루프 추가 없이 **호출자 책임으로 재호출**. 재실행 횟수 cap=1 (동일 대상에 대한 두 번째 재호출은 cr-triple 에스컬레이션 의무).

```bash
# 수정 후 1회 재호출 예시 (cap=1):
/codex-review --stage final --target PR-1234 --effort high --blocking
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
/codex-review --stage final --target PR-1234 --effort high --blocking
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
- `analysis` — 분석노트·cross-repo·backlog·runbook doc. `/cr-analysis <path>` 수동 호출만. SDD/PGE/Forge Dev 자동 게이트에 배선하지 않음 (분석노트는 즉시 실행 가능 산출물이 아님 — plan/code/test 게이트와 성격 다름). `--stage plan`이 분석 doc에 잘못 걸리면 Step 1.6 auto-route가 가로챔.

---

## 비용 통제

**현재 설정 (2026-06-17 전환 완료)**: auth_mode=`chatgpt` (OAuth), model=`gpt-5.5` (`~/.codex/config.toml`) → **ChatGPT Plus 구독 포함, API 과금 $0**. effort로 강도만 차등.
> apikey 폴백: `~/.codex/auth.json.apikey-backup-20260617` 복원 시 gpt-5.5 API 가격 과금.

| Stage | 모델 | Reasoning Effort | 비용 (OAuth) | 비상 폴백 (apikey 시) |
|-------|------|------------------|-------------|----------------------|
| `plan` | gpt-5.5 | medium | **$0.00** | ~$0.01~0.03 |
| `analysis` | gpt-5.5 | medium | **$0.00** | ~$0.01~0.03 |
| `code` | gpt-5.5 | medium | **$0.00** | ~$0.02~0.05 |
| `test` | gpt-5.5 | medium | **$0.00** | ~$0.01~0.03 |
| `final` | **gpt-5.5** | **high** | **$0.00** | ~$0.10~0.30 |
| `bugfix` | gpt-5.5 | medium | **$0.00** | ~$0.02~0.05 |

모델 override (env):
```
export CODEX_REVIEW_MODEL="gpt-5.5"          # 현재 기본값
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
- 정책: `forge/dev/rules/codex-review-policy.md`
- 단축 래퍼: `/cr-plan`, `/cr-analysis`, `/cr-code`, `/cr-test`, `/cr-final`, `/cr-bug`
- 통합 게이트: SDD Check C-1, PGE Phase 4.5, Forge Dev Phase 2~9
- 프롬프트: `forge/.claude/prompts/codex-review-{stage}.md` (analysis stage = `codex-review-analysis.md`, backlog/runbook frontmatter도 공용)
> 실패 시 [[pev-self-correction]] 적용
