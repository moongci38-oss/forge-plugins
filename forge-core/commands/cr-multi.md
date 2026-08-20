---
description: Multi-worker 검수 — Codex+Gemini (Double) 또는 Opus+Codex+Gemini (Triple) 병렬 리뷰 + Triage 합산
group: review
---

# /cr-multi

## 사용법

```
/cr-multi <target-file> [--mode double|triple] [--stage plan|code|test|bugfix|final] [--cr on|degrade|off] [--no-codex] [--fable] [--sol|--terra|--luna] [--gemini-max] [--repo-root <path>]
```

**`repoRoot` (args 필수 — 2026-08-07 배선)**: workflow.js args 에 **검수 대상 레포의 절대경로**를
반드시 넣는다. 빠뜨리면 레그가 자기 CWD(=세션 시작 디렉터리)에서 파일을 찾는데, 그게 같은
레포의 낡은 워크트리면 경로가 전부 해석돼 **확신을 갖고 정반대 결론**을 낸다(PR #53 실사례:
"이 아카이브는 일어난 적 없다" conf 0.95 → 실제 대상 트리에서는 정확히 반대였다).

```
Workflow({ scriptPath: "${FORGE_ROOT:-$HOME/forge}/.claude/skills/cr-multi/workflow.js",
           args: { targetPath, mode, stage, slug, repoRoot, crMode, fable, codexModel, geminiModel } })
```

⚠️ **`crMode`·`fable` 이 이 목록에 추가된 이유**(2026-08-20 — 신규 기능이 아니다): `workflow.js` 는
**전부터** 이 둘을 읽고 있었는데(`--cr` 게이트·`--fable` 승격) 예시에는 5개만 적혀 있었다. 예시가
전달 목록의 일부만 보여주면 "나머지는 안 실린다"로 오독된다 — **실제 전달 목록으로 맞춘 것**이다.
- **이름이 `cr` 가 아니라 `crMode` 인 이유**: 이 필드는 플래그 유무가 아니라 **값**(`on|degrade|off`)을
  싣는다. `--no-codex` 는 별칭이라 래퍼가 `degrade` 로 **정규화해서** 이 한 필드에 모은다 —
  그래서 플래그명(`--cr`)이 아니라 "무엇을 담는가"(mode)로 이름 지었다. 오탈자가 아니다.
- 재현: `grep -n 'crMode\|fable' ${FORGE_ROOT:-$HOME/forge}/.claude/skills/cr-multi/workflow.js` → 파싱·소비처가 나온다.

- 값: `git rev-parse --show-toplevel` 결과, 워크트리 작업 시에는 **그 워크트리의 절대경로**.
- 미지정 시 차단하지는 않는다(fail-open) — 대신 레그가 자기 트리를 summary 에 보고하도록
  프롬프트가 강제하고 `[RepoRoot] pin=(미지정 …)` 이 로그로 남는다. 조용히 넘어가지는 않는다.
- 레그는 pin 과 `git -C <pin> rev-parse --show-toplevel` 이 불일치하면 판정을 내지 않고
  `INCONCLUSIVE(repo_root_mismatch)` 로 반환한다.
- 재현: `node --test ${FORGE_ROOT:-$HOME/forge}/.claude/skills/cr-multi/tests/repo-root-pin.test.mjs`

**`--repo-root <path>` (2026-08-20 신설 — CLI 플래그)**: 위 `repoRoot` 를 **명령줄에서** 지정한다.
미지정 시 `git rev-parse --show-toplevel`(세션 CWD 기준)을 쓴다.
- ⚠️ **대상이 CWD 밖이면 반드시 명시한다.** 기본값이 세션 CWD 라, 다른 레포·다른 워크트리의
  파일을 검수하면 **엉뚱한 레포의 HEAD 가 조용히 pin** 되고 그 값이 `reviewedSha` 로 기록된다.
- 근거: 종전에는 이 값이 **Workflow args 로만** 전달돼 CLI 에 진입점이 없었다. 그래서
  `/cr-triple --repo-root ...` 가 `/cr-multi` 로 폴백하면 pin 이 **조용히 사라졌다**
  (handover 2026-08-20 §열린 질문).
  재현: `grep -c '\-\-repo-root' ${FORGE_ROOT:-$HOME/forge}/.claude/commands/cr-multi.md` → **수정 전 0 / 후 3**.
  ⚠️ 종전 재현 명령은 `grep -c 'repo-root'`(대시 없음)였는데 **판별력이 없었다** — 무관한
  `repo-root-pin.test.mjs` 참조가 잡혀 수정 전에도 1 을 반환했다(실측). 플래그 형태(`--`)를
  요구해야 "플래그가 있는가"를 실제로 가른다.

**`--sol` / `--terra` / `--luna`** (Human opt-in): **Codex 검수 레그 모델 승격**(Claude·Gemini 불변).
`--sol`→`codex:max` · `--terra`→`codex:high` · `--luna`→`codex:low`. 미지정 시 기본 유지(no-op).
- 해석은 **`model-registry-resolve.sh` 가 소유**한다(버전무관) — 모델 id 를 이 문서에 적지 않는다.
  `CODEX_MODEL = Bash("${FORGE_ROOT:-$HOME/forge}/shared/scripts/model-registry-resolve.sh codex:<tier>")` → args `codexModel`.
  resolve 실패 시 `null`(기본 유지, fail-open).
- **ChatGPT Plus 정액이라 추가 비용 0** — `--fable`(종량)과 혼동하지 말 것.

**`--gemini-max`** (Human opt-in): **Gemini 검수 레그 모델 승격**(Claude·Codex 불변).
`GEMINI_MODEL = Bash("${FORGE_ROOT:-$HOME/forge}/shared/scripts/model-registry-resolve.sh gemini:max")` → args `geminiModel`.
- 미지정 시 **no-op** — args 에서 생략하면 workflow.js 가 model 파라미터를 빼고, MCP 서버가
  `GEMINI_REVIEW_MODEL` env → 서버 기본값 순으로 정한다(우선순위: per-run arg > 서버 env > 서버 기본).
- ⚠️ **과금 미확인** — 확인 전까지 "기본값 무변경"이 계약이다. **자동 배선 금지**(Human 명시 전용).

⚠️ **이 세 묶음은 `/cr-triple` 과 동일 의미여야 한다.** 한쪽에만 플래그가 생기면 폴백 경로에서
조용히 사라진다 — `shared/scripts/cr-multi-flag-parity.test.sh` 가 그 드리프트를 고정한다.

**`--cr` / `--no-codex`**: codex-critic 워커 게이트.
- `--cr on` (default): 기존 동작 유지 (Codex 포함)
- `--cr degrade` 또는 `--no-codex`: Codex 제외 (triple → Opus+Gemini, double → Gemini만)
- `--cr off`: `degrade`와 동일

**`--fable`** (Human 수동 전용 — 비가역·최고위험 검수만): Claude 레그(기본 Sonnet 하드핀)를 **Fable 5로 승격**. Codex·Gemini 레그는 불변. workflow.js args에 `fable: true` 전달.
- ⚠️ **자동 발동 없음** — 사용자가 명시적으로 `--fable`을 줄 때만. forge-pr/자동 게이트에는 절대 배선 금지(매 PR Fable 실행 = 비용 폭발).
- **구독 정액**(Human 확인 2026-08-12) — 사람이 `--fable` 을 명시할 때 호출당 비용 마찰은 없다.
- **`--fable` 은 여전히 Human 수동 전용이다** — 2026-08-12 에 바뀐 것은 **advisor 자문 레그**이고, 여기 **검수 워커 레그**가 아니다. AI 자동 발동 금지 유지. 미지정 시 기존 Sonnet 동작 100% 동일.
- 용도: ADR·아키텍처 분기·비가역 마이그레이션·결제/보안 비가역 등 최고위험 검수에서만.

**예시**:
```bash
/cr-multi ${FORGE_OUTPUTS:-$HOME/forge-outputs}/11-platform/pipelines/plans/2026-05-24-mas-plan-p0-adr.md --mode double
/cr-multi ${FORGE_OUTPUTS:-$HOME/forge-outputs}/02-product/forge-platform/specs/approve-worker-spec.md --mode triple --stage plan
/cr-multi ${FORGE_ROOT:-$HOME/forge}/.claude/skills/cr-multi/workflow.js --mode triple --cr degrade   # Codex 제외
/cr-multi ./plan.md --mode triple --no-codex                                        # --cr degrade 별칭
```

## Step 1: 선행 조건

```bash
# MCP 등록 확인
claude mcp list | grep -E "^codex|^gemini"
```

> **절차 SSoT = `skills/cr-multi/workflow.js`.** 이 커맨드는 진입점(인자 파싱)이다.
> Gemini 레그는 `mcp__gemini-text__generate_text`(텍스트 생성)를 쓴다 — 구 미디어 전용
> Gemini vision 도구 경유 + PDF 사전변환 경로는 **폐기**됐다(2026-06-04, 상세 사유는
> `workflow.js:4` 주석 참조). 그 경로로 진입하면 실제로는 Opus+Codex 2-worker만 돌면서
> "3-LLM triple 검수"로 오인될 위험이 있다.

## Step 2: 산출물 경로 설정

```bash
DATE=$(date +%Y-%m-%d)
SLUG=$(basename "$TARGET_FILE" .md | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g')
REVIEWS_DIR="${FORGE_OUTPUTS:-$HOME/forge-outputs}/docs/reviews/cr-multi"
mkdir -p "$REVIEWS_DIR"
VERSION=v1  # increment if re-reviewing
```

## Step 3: Secret 사전 스캔

```bash
SECRET_PATTERN='(API_KEY|token|JWT|password|SECRET)[=:][\x27"]?[A-Za-z0-9+/]{16,}'
grep -iE "$SECRET_PATTERN" "$TARGET_FILE" && {
    echo "[BLOCKED] Secret detected — external transmission aborted"
    exit 1
}
```

## Step 4~5: Worker 병렬 호출

> 실제 호출 절차(스폰 순서·에러 폴백·crMode 게이트)는 `skills/cr-multi/workflow.js`가 정본이다.
> 아래는 각 워커의 MCP 도구 계약만 명시한다.

> **crMode 게이트**: `--cr degrade`/`--no-codex`/`--cr off` 시 Codex 워커 및 ApproveWorker 건너뜀.
> workflow.js가 `[cr] codex-critic worker skipped (crMode=degrade/off)` 로그 출력.

### Double mode (Codex + Gemini)

Codex 호출 (`--cr on` 시에만):
```
mcp__codex__codex(
  prompt="<contents of ${FORGE_ROOT:-$HOME/forge}/.claude/prompts/cr-multi-codex.md with TARGET_FILE replaced>",
  cwd=<dirname of target>,
  sandbox="read-only",
  approval_policy="never",
  model="gpt-5.6-terra",
  config={"model_reasoning_effort": "medium"}
)
→ save to $REVIEWS_DIR/$DATE-$SLUG-$VERSION-codex.json
```

Gemini 호출 (`generate_text` — 텍스트 리뷰, PDF 변환 불필요):
```
mcp__gemini-text__generate_text(
  prompt="<contents of ${FORGE_ROOT:-$HOME/forge}/.claude/prompts/cr-multi-gemini.md with TARGET_FILE contents inlined>"
)
→ parse JSON from response
→ save to $REVIEWS_DIR/$DATE-$SLUG-$VERSION-gemini.json
```

### Triple mode (+ Opus subagent)

추가 Opus 서브에이전트 (Task tool, single-level):
```python
Agent(
  subagent_type="advisor-strategist",
  # --fable 시에만: model="fable" 추가 (Claude 레그 Fable 5 승격, Human 수동 전용). 미지정 시 기존 동작.
  prompt="<contents of ${FORGE_ROOT:-$HOME/forge}/.claude/prompts/cr-multi-opus.md with TARGET replaced>"
)
→ save result to $REVIEWS_DIR/$DATE-$SLUG-$VERSION-opus.json
```

## Step 6: Triage + 합산 verdict

```bash
python3 ${FORGE_ROOT:-$HOME/forge}/shared/scripts/cr-multi-triage.py \
  --codex "$REVIEWS_DIR/$DATE-$SLUG-$VERSION-codex.json" \
  --gemini "$REVIEWS_DIR/$DATE-$SLUG-$VERSION-gemini.json" \
  [--opus "$REVIEWS_DIR/$DATE-$SLUG-$VERSION-opus.json"] \
  --slug "$SLUG" \
  --reviews-dir "$REVIEWS_DIR" \
  --output "$REVIEWS_DIR/$DATE-$SLUG-$VERSION-report.md"
```

## Step 7: Plateau 감지

```bash
python3 ${FORGE_ROOT:-$HOME/forge}/shared/scripts/cr-multi-plateau-guard.py \
  --slug "$SLUG" \
  --reviews-dir "$REVIEWS_DIR"
EC=$?
if [ $EC -eq 2 ]; then
    echo "[WARN] Oscillation detected — AD-50 override 검토"
fi
```

## Step 8: 감사 로그

workflow.js가 자동 기록 (`cr-multi-calls.jsonl`, 2026-06-12 배선). 수동 실행 불필요.

## Step 9: 결과 표 출력

| worker | score | verdict | CRIT | HIGH |
|--------|-------|---------|------|------|
| Codex | ? | ? | ? | ? |
| Gemini | ? | ? | ? | ? |
| Opus (Triple) | ? | ? | ? | ? |
| **Combined** | **?** | **?** | **?** | **?** |

## 산출물

```
${FORGE_OUTPUTS:-$HOME/forge-outputs}/docs/reviews/cr-multi/
  {DATE}-{slug}-v{N}-codex.json
  {DATE}-{slug}-v{N}-gemini.json
  {DATE}-{slug}-v{N}-opus.json    # Triple only
  {DATE}-{slug}-v{N}-report.md   # Triage 합산
```

## 참조

- 모드 룰: `$HOME/.claude/rules-on-demand/multi-gate-review.md`
- Triage: `${FORGE_ROOT:-$HOME/forge}/shared/scripts/cr-multi-triage.py`
- Plateau: `${FORGE_ROOT:-$HOME/forge}/shared/scripts/cr-multi-plateau-guard.py`
