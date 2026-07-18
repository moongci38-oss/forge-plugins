---
description: 이미지 생성 — gpt-image-1 primary, Gemini 폴백.
allowed-tools: Bash, Read, Write, mcp__plugin_forge-core_gemini__generate_image
argument-hint: "<mode: generate|edit> <prompt or image-path> [--aspect 16:9|1:1|9:16] [--quality low|medium|high] [--output path]"
model: sonnet
group: ops
---

# AI Image Generation / Editing

이미지를 생성하거나 편집합니다: $ARGUMENTS

## 실행 순서 (2단계)

### 1단계 — 기본 경로: gpt-image-1

```bash
python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/generate-image.py" \
  --prompt "<프롬프트>" \
  --output "<저장경로>" \
  --aspect <16:9|1:1|9:16> \
  --quality <low|medium|high>
```

- exit 0 → 성공. stdout 마지막 줄이 저장된 절대경로.
- exit 2 → 실패(키 없음/SDK 없음/API 오류) → 2단계 폴백으로 전환.

### 2단계 — 폴백: Gemini (1단계가 exit 2로 실패한 경우에만)

`mcp__plugin_forge-core_gemini__generate_image` 도구를 호출한다.

**폴백 사용 시 반드시 다음을 명시**:
```
gpt-image-1 실패 → Gemini 폴백
```

## 모드

### `generate` — 텍스트에서 이미지 생성

위 2단계 순서를 그대로 따른다.

**인자 파싱:**
- 첫 번째 인자: 프롬프트 텍스트
- `--aspect`: `16:9` (히어로/배너), `1:1` (정사각), `9:16` (모바일)
- `--quality`: `low` / `medium`(기본) / `high`
- `--output`: 저장 경로 (기본: `05-design/images/`)

**예시:**
```
/generate-image generate "포트폴리오 히어로 이미지, 미니멀 디자인, 파란 그라데이션" --aspect 16:9
/generate-image generate "AlbaNow 프로젝트 쇼케이스 썸네일" --aspect 1:1
/generate-image generate "마케팅 캠페인 배너, 모던 SaaS 스타일" --aspect 16:9 --output 03-marketing/assets/
```

### `edit` — 기존 이미지 편집

gpt-image-1 wrapper는 편집을 지원하지 않는다 — edit는 `mcp__plugin_forge-core_gemini__generate_image`(Gemini edit_image)가 유일한 수단이다.

**인자 파싱:**
- 첫 번째 인자: 편집할 이미지 파일 경로
- 두 번째 인자: 편집 지시사항
- `--output`: 저장 경로 (기본: 원본과 같은 디렉토리, `-edited` 접미사)

**예시:**
```
/generate-image edit 05-design/images/my-project/thumbnail.png "해상도 개선, 색감 보정"
/generate-image edit 03-marketing/assets/banner.png "텍스트 제거하고 배경만"
```

## 기본 출력 경로

| 용도 | 경로 |
|------|------|
| 프로젝트 갤러리 | `05-design/images/` |
| 마케팅 비주얼 | `03-marketing/assets/` |
| 블로그 이미지 | `04-content/images/` |
| 디자인 목업 | `05-design/mockups/` |

## 비용 원칙

- 호출자: `game-asset-generate`(게임 에셋 파이프라인) + Human 명시 호출(마케팅/블로그 이미지 등).
- 개발·구현 파이프라인(forge-implement/forge-pge/forge-design)은 이 커맨드를 호출하지 않는다 — 그 단계의 이미지는 Claude Design/Stitch 산출물이거나, 없으면 없는 대로 진행한다.
- 디자인 시안은 Human이 /forge-claude-design(메인) 또는 /forge-stitch(서브)를 직접 호출한다.
- 검증 게이트에서 사용 금지(부가 기능)
- 생성 후 파일 크기/포맷 수동 확인

> 이 커맨드는 프롬프트를 보고 도구를 판정하지 않는다. 디자인 시안이 필요하면 Human이 /forge-claude-design 또는 /forge-stitch를 직접 호출한다.
