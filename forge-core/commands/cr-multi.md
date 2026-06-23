---
description: Multi-worker 검수 — Codex+Gemini (Double) 또는 Opus+Codex+Gemini (Triple) 병렬 리뷰 + Triage 합산
group: review
---

# /cr-multi

## 사용법

```
/cr-multi <target-file> [--mode double|triple] [--stage plan|code|test|final]
```

**예시**:
```bash
/cr-multi ${FORGE_OUTPUTS:-$HOME/forge-outputs}/11-platform/pipelines/plans/2026-05-24-mas-plan-p0-adr.md --mode double
/cr-multi ${FORGE_OUTPUTS:-$HOME/forge-outputs}/02-product/projects/forge-platform/specs/approve-worker-spec.md --mode triple --stage plan
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

### Double mode (Codex + Gemini)

Codex 호출:
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

```bash
python3 -c "
import json, time
entry = {
    'event': 'CR_MULTI_COMPLETE',
    'file': '$TARGET_FILE',
    'mode': '$MODE',
    'verdict': '<from triage>',
    'ts': time.time()
}
open('${FORGE_OUTPUTS:-$HOME/forge-outputs}/.claude/audit/cr-multi-calls.jsonl', 'a').write(json.dumps(entry)+'\n')
"
```

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
