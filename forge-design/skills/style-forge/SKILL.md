---
name: style-forge
description: "참조 에셋에서 화풍을 뽑아 style-guide.md 를 만든다(또는 LoRA 파인튜닝). 쓸 때: 게임 에셋 생성(/game-asset-generate) 전에 스타일 기준이 없을 때. SKIP: 시각 에셋 작업이 아닐 때, 참조 이미지가 없을 때, 유효한 style-guide.md 가 이미 있을 때."
context: fork
model: sonnet
---

# Style Forge

게임 에셋 파이프라인 P0 — 스타일 정의 도구. 모드 2개.

## 사용하지 않을 때

- 시각 에셋 작업이 아님(코드·문서·기획).
- 참조 에셋 0개 — 이미지 없이 스타일만 상의(아래 입력 검증 [STOP] 과 동일).
- 이미지 1~2장 — 공통 스타일 추출 불가. `/screenshot-analyze` 를 직접 쓴다.
- 유효한 style-guide.md 존재 — 갱신이 필요할 때만 재실행.
- 웹/앱 UI 디자인 — `tool-rules.md §디자인 도구 순위` 를 따른다.

## Mode A: 스타일 추출 (P0)

기존 에셋 5-10개 → `style-guide.md`.

1. 사용자가 에셋 폴더 경로를 준다.
2. `/screenshot-analyze --mode style-extraction --assets {에셋폴더경로}` 호출 → YAML 팔레트·아트키워드·패턴.
3. `${FORGE_ROOT:-$HOME/forge}/planning/templates/style-guide-template.md` 기반으로 `style-guide.md` 생성.
   - **DESIGN.md 스키마 필수**: YAML front matter(palette, art_style, lora_model 등) + Markdown body.
   - front matter 팔레트/아트스타일은 screenshot-analyze 결과로 채워 기계 파싱 가능하게.
4. Human 확인 후 확정.

- 입력: 에셋 폴더 경로(5-10개 이미지) · 출력: `{project-path}/style-guide.md`

## Mode B: LoRA 학습 (선택)

전제: `REPLICATE_API_TOKEN` 설정 · Replicate MCP 연결 · 일관된 학습 이미지 5-10개.

1. Mode A 실행(style-guide.md 먼저).
2. 학습 이미지를 ZIP 으로 압축.
3. Replicate MCP 로 LoRA fine-tuning 시작.
4. 완료 후 style-guide.md 에 `모델 ID` + `트리거 워드` 기록.
5. 테스트 이미지 1장 생성 → Human 검증.

- 입력: 에셋 폴더 경로 + 트리거 워드 · 출력: Replicate 모델 ID + 갱신된 `style-guide.md`

## 환경 요구사항

실행 전 자동 체크(누락 시 [STOP]):
```bash
# Mode A — Vision 은 Codex CLI(구독)
command -v codex >/dev/null 2>&1 || { echo "[STOP] codex CLI 미설치 — Mode A Vision 불가"; exit 1; }
# Mode B (추가)
[ -z "$REPLICATE_API_TOKEN" ] && echo "[STOP] REPLICATE_API_TOKEN 미설정" && exit 1
```
- Mode A: `codex` CLI **0.153.4 이상**(`screenshot-analyze` 의존, `codex --version`). 미만이면 `ASTRA_MODEL=gpt-6-astra` override 가 HTTP 400.
- Vision 용 `codex-critic` approve-worker 토큰 선발행이 별도로 필요(`screenshot-analyze/SKILL.md`).
- Mode B: `REPLICATE_API_TOKEN`(Replicate MCP 의존).

입력 검증(Mode A 진입 시):
- 에셋 폴더 존재 확인
- 이미지 5개 미만 → [WARN] 후 계속(3개 이상 허용) · 0개 → [STOP]
- style-guide.md 이미 존재 → "덮어쓸까요?" Human 확인 후 진행

## 파이프라인 위치

```
P0 (/style-forge) → P1 (Art Direction Brief) → P2 (프로토타입) → P3 (대량 생성) → P4 (품질 검증)
```

P2·P3 생성 경로 = `/forge-image`(구독). `style-guide.md` 를 반드시 넘긴다(안 넘기면 스타일 미반영):

```bash
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/generate-image-codex.sh" \
  --prompt "<무엇을 그릴지>" --style-guide "<style-guide.md 절대경로>" \
  --output "<절대경로>/asset.png"
```

`/game-asset-generate` 는 아카이브됨 — 호출하지 않는다.

## 주의사항

- LoRA 학습은 Replicate 종량제($0.5-2/학습) · 15-30분 소요.
- 결과 불만족 시 이미지 교체 후 재학습(재과금).
