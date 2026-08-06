---
name: style-forge
description: 5-10개 에셋에서 스타일 추출→style-guide.md 생성(Mode A) 또는 Replicate LoRA 파인튜닝(Mode B). /game-asset-generate 실행 전 필수 선행 스킬 — 시각적 일관성 기준 정립.
context: fork
model: sonnet
---

# Style Forge

프로젝트의 시각적 일관성을 위한 스타일 정의 도구. 두 가지 모드를 지원한다.

## 모드

### Mode A: 스타일 추출 (P0)

기존 에셋 5-10개에서 공통 스타일을 추출하여 `style-guide.md`를 생성한다.

**워크플로우:**
1. 사용자가 에셋 폴더 경로를 제공한다
2. `/screenshot-analyze --mode style-extraction --assets {에셋폴더경로}` 호출 → YAML 형식 팔레트·아트키워드·패턴 반환
3. `${FORGE_ROOT:-$HOME/forge}/planning/templates/style-guide-template.md` 기반으로 `style-guide.md` 생성
   - **DESIGN.md 스키마 필수**: YAML front matter(palette, art_style, lora_model 등) + Markdown body
   - front matter의 팔레트/아트스타일은 screenshot-analyze 결과로 채워 기계 파싱 가능하게 유지
4. Human 확인 후 확정

**입력**: 에셋 폴더 경로 (5-10개 이미지)
**출력**: `{project-path}/style-guide.md`

### Mode B: LoRA 학습 (선택)

기존 에셋으로 Replicate LoRA 모델을 학습한다.

**전제조건:**
- `REPLICATE_API_TOKEN` 환경변수 설정
- Replicate MCP 연결 확인
- 학습 이미지 5-10개 (일관된 스타일)

**워크플로우:**
1. Mode A 실행 (style-guide.md 먼저 생성)
2. 학습 이미지를 ZIP으로 압축
3. Replicate MCP로 LoRA fine-tuning 작업 시작
4. 학습 완료 후 style-guide.md에 `모델 ID` + `트리거 워드` 기록
5. 테스트 이미지 1장 생성 → Human 검증

**입력**: 에셋 폴더 경로 + 트리거 워드
**출력**: Replicate 모델 ID + 업데이트된 `style-guide.md`

## 환경 요구사항

**실행 전 자동 체크** (누락 시 [STOP]):
```bash
# Mode A 실행 전
[ -z "$GEMINI_API_KEY" ] && echo "[STOP] GEMINI_API_KEY 미설정" && exit 1
# Mode B 실행 전 (추가)
[ -z "$REPLICATE_API_TOKEN" ] && echo "[STOP] REPLICATE_API_TOKEN 미설정" && exit 1
```
- Mode A: `GEMINI_API_KEY` (screenshot-analyze 의존)
- Mode B: `REPLICATE_API_TOKEN` (Replicate MCP 의존)

**입력 검증** (Mode A 진입 시):
- 에셋 폴더 존재 여부 확인
- 이미지 파일 수 5개 미만이면 [WARN] 후 계속 (3개 이상이면 허용)
- 이미지 파일 수 0개이면 [STOP]
- style-guide.md 이미 존재하면 "덮어쓸까요?" Human 확인 후 진행

## Diamond Architecture 단계

이 스킬은 리소스 파이프라인의 **P0 (스타일 정의)** 단계를 담당한다.

```
P0 (/style-forge) → P1 (Art Direction Brief) → P2 (프로토타입) → P3 (대량 생성) → P4 (품질 검증)
```

## 주의사항

- LoRA 학습은 Replicate 종량제 과금 ($0.5-2/학습)
- 학습 시간: 15-30분 (이미지 수/해상도에 따라)
- 학습 결과가 불만족스러우면 이미지 교체 후 재학습 (재과금)
