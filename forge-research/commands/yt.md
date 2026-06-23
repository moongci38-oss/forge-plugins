---
description: YouTube 영상 심층 분석 — 트랜스크립트·댓글·링크 추출 + AI 분석 + GTC 검증 + ACHCE 개선 제안. 멀티 영상 병렬 지원.
argument-hint: <YouTube-URL> [--format summary|timeline|mindmap|full|blog] [--deep]
allowed-tools: Read, Write, Bash, Glob, Grep, WebFetch, mcp__brave-search__brave_web_search, Agent
model: sonnet
group: research
---

# /yt — YouTube 영상 심층 분석

**ARGUMENTS**: $ARGUMENTS

`yt` 스킬을 실행하여 입력된 YouTube URL을 분석합니다. 스킬 본체는 `$HOME/.claude/skills/yt/SKILL.md`에 정의되어 있으며, 이 커맨드는 얇은 진입점 래퍼입니다.

## 실행

`yt` 스킬을 즉시 호출하고, `$ARGUMENTS`를 스킬 입력으로 전달합니다.

## 사용 예시

```
/yt https://www.youtube.com/watch?v=XXXXXXXXXXX
/yt https://www.youtube.com/watch?v=XXXXXXXXXXX --format timeline
/yt https://www.youtube.com/watch?v=AAA https://www.youtube.com/watch?v=BBB
/yt https://www.youtube.com/watch?v=XXXXXXXXXXX --deep
```

## 분석 단계

1. **yt-analyzer.py** — 트랜스크립트 + 댓글 + 설명 링크 추출
2. **AI 분석** — 핵심 인사이트 + 비판적 평가 + 팩트체크 대상 도출
3. **웹 리서치** — 주요 클레임 검증 (Brave Search)
4. **GTC 검증** — 4단계 Ground Truth Check
5. **ACHCE 태깅** — Forge 시스템 개선 제안

## 포맷 옵션

| 포맷 | 설명 |
|------|------|
| `summary` | TL;DR + 핵심 3포인트 (기본) |
| `timeline` | 타임스탬프별 요약 |
| `mindmap` | Mermaid 마인드맵 |
| `full` | 전체 상세 분석 |
| `blog` | 블로그 포스트 형식 |

## 산출물

- `${FORGE_OUTPUTS:-$HOME/forge-outputs}/01-research/yt/{YYYY-MM-DD}/{date}-{video-id}-analysis.md`

> 멀티 영상 분석 시 Agent Teams로 병렬 실행됩니다.
