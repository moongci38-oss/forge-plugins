---
description: Multi-worker 검수 — Codex+Gemini (Double) 또는 Opus+Codex+Gemini (Triple) 병렬 리뷰 + Triage 합산
group: review
---

# /cr-multi

## 사용법

```
/cr-multi <target-file> [--mode double|triple] [--stage plan|code|test|final] [--cr on|degrade|off] [--no-codex] [--fable]
```

**`--cr` / `--no-codex`**: codex-critic 워커 게이트.
- `--cr on` (default): 기존 동작 유지 (Codex 포함)
- `--cr degrade` 또는 `--no-codex`: Codex 제외 (triple → Opus+Gemini, double → Gemini만)
- `--cr off`: `degrade`와 동일

**`--fable`** (Human 수동 전용 — 비가역·최고위험 검수만): Claude 레그(기본 Sonnet 하드핀)를 **Fable 5로 승격**. Codex·Gemini 레그는 불변. workflow.js args에 `fable: true` 전달.
- ⚠️ **자동 발동 없음** — 사용자가 명시적으로 `--fable`을 줄 때만. forge-pr/자동 게이트에는 절대 배선 금지(매 PR Fable 실행 = 비용 폭발).
- ⚠️ 종량 **$10/$50**(= Opus 4.8의 2배) · org usage-credits 활성 필수(미활성 시 실행 불가). 미지정 시 기존 Sonnet 동작 100% 동일.
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
# pandoc + weasyprint (Gemini PDF 변환용)
command -v pandoc weasyprint || echo "install: apt install pandoc && pip install weasyprint"
```

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

## Step 4: Gemini PDF 변환

```bash
PDF_PATH="/tmp/cr-multi-$(basename $TARGET_FILE .md).pdf"
bash ${FORGE_ROOT:-$HOME/forge}/dev/scripts/cr-multi-md-to-pdf.sh "$TARGET_FILE" "$PDF_PATH"
```

## Step 5: Worker 병렬 호출

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
  model="gpt-5.5",
  config={"model_reasoning_effort": "medium"}
)
→ save to $REVIEWS_DIR/$DATE-$SLUG-$VERSION-codex.json
```

Gemini 호출 (analyze_media PDF):
```
mcp__gemini__analyze_media(
  prompt="<contents of ${FORGE_ROOT:-$HOME/forge}/.claude/prompts/cr-multi-gemini.md>",
  file_path="$PDF_PATH"
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

- 모드 룰: `~/.claude/rules-on-demand/multi-gate-review.md`
- Triage: `${FORGE_ROOT:-$HOME/forge}/shared/scripts/cr-multi-triage.py`
- Plateau: `${FORGE_ROOT:-$HOME/forge}/shared/scripts/cr-multi-plateau-guard.py`
