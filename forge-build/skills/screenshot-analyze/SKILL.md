---
name: screenshot-analyze
description: "스크린샷(UI·HUD·이펙트·경쟁작)을 Vision 모델로 분석해 구조·컬러팔레트·구현가이드 생성. 화면이미지 첨부 또는 경쟁작 분석 요청 시 사용."
context: fork
model: sonnet
---

**역할**: 게임/웹/앱 스크린샷을 Codex Vision(GPT-5.6 Sol, `codex-critic` 경유)으로 분석해 UI 구조·컬러 팔레트·구현 가이드를 만드는 시각 분석 전문가. 본문의 "Astra" = 이 Codex Vision 레그.
**출력**: 5개 필수 요소를 갖춘 마크다운 분석 보고서.
**컨텍스트**: 정적 이미지(게임 UI, HUD, 이펙트 프레임, 경쟁작, 구현 검증) 분석이 필요할 때 호출됩니다.

# Screenshot Analyze

| 도구 | 입력 | 대상 |
|---|---|---|
| `/video-reference-guide` | 동영상 | 타이밍·연출·모션 |
| **이 스킬** | 정적 이미지(png/jpg/webp/gif/bmp/URL, `/clip` 클립보드) | 레이아웃·컬러·컴포넌트·아이콘 |
| `/yt` | YouTube 음성 | 강좌 요약 |

분석 유형: UI 레이아웃 · HUD · 아이콘/에셋 · 이펙트 프레임 · 경쟁작 비교 · 구현 검증(레퍼런스 이미지 필수) · 스타일 추출 · 일관성 검증.

## Step 1: 모드·플랫폼 판별 (묻지 않고 컨텍스트로 자동 판단)

출력 첫 줄: `**분석 모드**: [기본/Task Doc/시안 분석/구현 검증/컴포넌트 추출]` + `**플랫폼**: [Game (Unity)/Web (HTML/CSS)/App (Mobile Native)]`
- 모드: `--extract`·"분리/추출/컴포넌트 뽑아줘" → 컴포넌트 추출 · `--mockup`·`_assets/` 우리 시안 → 시안 분석(확정값) · Element Task Doc 작성 중 → Task Doc(추정값) · 레퍼런스 vs 구현 → 구현 검증 · 그 외 → 기본(추정값)
- 플랫폼: 게임 프로젝트 → Game · Portfolio·웹 URL → Web · 앱스토어/모바일 → App · 불명 → 이미지로 추정
- 입력 변수: `IMAGE_PATH`(공백 구분) · `ANALYSIS_TYPE`(기본 UI 레이아웃) · `REF_NAME` · `PLATFORM` · `EXTRACT_MODE`

## Step 2: 프롬프트 조립

MUST 출력 형식을 프롬프트에 직접 포함한다. 모델 = `ASTRA_MODEL=gpt-6-sol`, `ASTRA_EFFORT=high`.
공통 분해 규칙·필수 출력 형식·유형별 프롬프트 전문·`--extract` bbox JSON 스키마 → `references/output-format.md`

`--extract` 구조: Pass 1 Analyzer×N(gpt-6-sol, 이미지별 초안 bbox) + 형제 IoU 사전검사 → Pass 2 Verifier×M(크롭 재전송, 잘림 시 확장 방향·px 반환 → bbox 보정) → Extractor(Sonnet, `extract-components.py`) ∥ Evaluator(루브릭 5항목).

## Step 3: 분석 실행 — `analyze-screenshot.sh` (Codex CLI `-i` 첨부, 캐시: output-file 있으면 호출 안 함)

```bash
bash ~/.claude/scripts/analyze-screenshot.sh "{IMAGE_PATH}" \
  "docs/assets/screenshot-refs/{YYYY-MM-DD}-{REF_NAME}-analysis.md" "{Step 2 전체 프롬프트}"
# 비교(2-3장 1회 전송, 4장+는 순차): 결과 파일 -compare.md, 뒤에 "{IMAGE2_PATH}" "{IMAGE3_PATH}"
```

## Step 3.5: 컴포넌트 추출 (`--extract` 전용)

Verifier(컴포넌트별 병렬): bbox 로 `/tmp/verify_{comp_id}.png` 크롭(PIL, 정규화 x/y/w/h × 이미지 크기) 후
```bash
ASTRA_MODEL=gpt-6-sol bash ~/.claude/scripts/analyze-screenshot.sh "/tmp/verify_{comp_id}.png" "" \
  "'{comp_name}'({comp_type}) 가 완전히 포함됐나? 잘렸으면 {\"clipped\": true, \"expand\": {\"top\":0,\"bottom\":0,\"left\":0,\"right\":0}}, 아니면 {\"clipped\": false}"
```
잘림 시 expand 만큼 원본 기준 보정 후 재크롭. 이어서 Extractor:
```bash
ASTRA_MODEL=gpt-6-sol python3 ~/.claude/scripts/extract-components.py --image "{IMAGE_PATH}" \
  --analysis "{ANALYSIS_MD_PATH}" --output "docs/assets/screenshot-refs/{YYYY-MM-DD}-{REF_NAME}-components"
```
Kill: bbox JSON 없음 → 재프롬프트 1회 → 실패 시 텍스트 분석만 · Codex 오류 → 즉시 폴백+오류 출력 · 이미지 20MB 초과 → 추출 차단 · 크롭 0개 → 오류+안내.
Canary: 🟢 루브릭 5항목 PASS · 🟡 1~2 WARN · 🔴 bbox JSON 없음 또는 추출 0개.

## Step 4: 결과 검증 + 출력

```bash
python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/skill-report-lint.py" \
  --skill screenshot-analyze --report "<분석 결과 .md 절대경로>" > /tmp/sa-lint.json
echo "lint rc=$?"
```
- `rc=1` → `items[]` 중 FAIL 요소만 보완(전체 재생성 금지) · `rc=0`+`residual` 없음 → 통과 · `rc=2` → 경로 고쳐 재실행.
- 필수 5요소: ①컴포넌트 분해 테이블(≥5행) ②컬러 팔레트(#RRGGBB ≥3) ③Prefab 계층 트리(코드블록) ④구현 가이드(Canvas/Anchor) ⑤(추정)/(확정) 태그 — ⑤의 "모든 추정값" 전수 여부는 LLM 이 본다. 누락 상태로 출력 금지.
- `--extract` 루브릭: bbox JSON 블록 존재 · 커버리지 ≥60% · 2≤N≤50(0~1 재시도, 51+ 상위 50) · PNG 저장 정상 · `_overlap-report.json` GREEN.

모드별 포맷:
- **기본**: 5요소 순서대로.
- **시안 분석**(`--mockup`, 전부 `(확정)`): Section 16-1 시안 바인딩(`시안 경로|시안 내 요소|매핑 대상 섹션|매핑 파라미터|확정값`) · Section 10 디자인 토큰(`요소|토큰명|값|출처`, `style-guide.md` 토큰 우선, 없으면 `--color-{용도}`) · Section 7 Prefab 계층(트리+테이블).
- **Task Doc**(추정값): Section 7 Prefab 계층(UI 프레임워크 명시, `Canvas (Screen Space - Overlay)` 트리 + `오브젝트|컴포넌트 (추정)|역할|Anchor 추정|Pivot 추정|비고`) · Section 10 토큰(`--color-/--space-/--font-` 패턴) · Section 16 레퍼런스 바인딩(`레퍼런스 유형|원본 경로|참고 구간|적용 대상|분석 결과 요약`).

## Step 5: 저장 + 후속

1. 결과 출력 + `docs/assets/screenshot-refs/` 에 저장. GDD/Spec 작성 중이면 삽입 위치 안내.
2. `--extract`: `{YYYY-MM-DD}-{REF_NAME}-components/` 아래 `_manifest.json`(메타+픽셀 bbox) · `_overlap-report.json` · `backgrounds/ buttons/ icons/ overlays/ text/ images/ containers/ etc/`. `_manifest.json` 은 `game-asset-generate` 레퍼런스로 전달 가능.

## 파이프라인 연동
S3 GDD(경쟁작 UI 비교) · S4 UI/UX 기획서 · Spec Section 9.5 · Element Task Doc(Task Doc 모드 → Section 7+10+16) · 구현 시 재참조 · 구현 후 역비교(구현 검증 모드).

## 부가 모드
- **스타일 추출**: 에셋 5-10개 → 컬러(Primary/Secondary/Accent/Background)·스타일 키워드·일관성 패턴·타이포 추정 → `style-guide-template.md` 형식 초안.
- **일관성 검증**: 에셋 5+개 컴포지트 → 컬러·아트 스타일·비율/규격·조명 방향 → High/Medium/Low + 불일치 에셋 목록.
- **AI 크리틱**: 계층 · `style-guide.md` 일관성 · `ai-anti-patterns.md` 안티패턴 · `art-direction-brief.md` 부합.

## 환경·보안
- Codex CLI 0.156.1+ 구독 인증(`auth_mode=chatgpt`) · `~/.claude/scripts/analyze-screenshot.sh` · Python 3 · curl(URL 다운로드). 반복 분석 자제(구독 사용량 소비).
- 전송 전 확인: 미공개 기능·NDA 베타·PII 화면은 보내지 않는다(공개 스토어/공식 사이트 스크린샷만, PII 는 마스킹).

## Workflow 실행
`Workflow({ script: Bash("cat ~/.claude/skills/screenshot-analyze/workflow.js"), args: { imagePath, intent, crMode } })` — Codex Vision → Claude 자체 분석 fallback. `CLAUDE_CODE_DISABLE_WORKFLOWS=1` 시 위 Step 직접 실행.
`crMode`: caller 가 `~/forge/shared/scripts/cr-mode.sh` 조회 후 전달 — `on`(기본, Codex Vision) · `degrade`/`off`(Codex 제외, Claude 자체 Vision). 로그: `[cr] screenshot Codex Vision skipped (crMode=<value>) → Claude 자체 분석`
⚠️ 전제: Vision 용 codex-critic approve-worker 토큰 외부 선발행 필수(Workflow 는 셸 직접 호출 불가).
