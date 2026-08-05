---
description: "웹 기사 URL 심층 분석 — 본문 추출 + 내부 링크 파고들기 + 시스템 비교 + 적용 계획서 생성 (Agent Teams 4-Wave) MAS P1: Sonnet 1M 기본 + Gemini Pro 폴백 (50p+)."
argument-hint: <article-URL> [--deep] [--skip-research]
allowed-tools: Read, Write, Bash, Glob, Grep, WebFetch, WebSearch, mcp__brave-search__brave_web_search, Agent
model: sonnet
group: research
---

# /article — 웹 기사 심층 분석 파이프라인

**ARGUMENTS**: $ARGUMENTS

`article` 스킬을 실행하여 입력된 URL(들)을 분석한다. 스킬 본체는 `~/.claude/skills/article/SKILL.md`에 정의되어 있으며, 이 커맨드는 얇은 진입점 래퍼다.

## 실행

`article` 스킬을 즉시 호출하고, `$ARGUMENTS`를 스킬 입력으로 전달한다.

## 사용 예시

```
/article https://news.hada.io/topic?id=28491
/article https://news.hada.io/topic?id=28491 --deep
/article https://techcrunch.com/2026/04/14/foo https://www.theverge.com/bar
```

## 산출물

- `${FORGE_OUTPUTS:-$HOME/forge-outputs}/01-research/articles/{YYYY-MM-DD}/{date}-{domain}-{slug}-analysis.md`
- `${FORGE_OUTPUTS:-$HOME/forge-outputs}/docs/reviews/{date}-{slug}-comparison.md` (tech 카테고리만)
- `${FORGE_OUTPUTS:-$HOME/forge-outputs}/docs/planning/active/plans/{date}-{slug}-apply-plan.md` (tech 카테고리만)
- `${FORGE_OUTPUTS:-$HOME/forge-outputs}/01-research/articles/{YYYY-MM-DD}/{date}-{domain}-{slug}-dashboard.html` (HTML 대시보드)

## HTML 대시보드 (최종 단계 — 조사 리포트 공통)

분석 md 저장 완료 후, 단일 HTML 대시보드로 변환한다 (시각적 가독성):

```bash
A="${FORGE_OUTPUTS:-$HOME/forge-outputs}/01-research/articles/{date}/{date}-{domain}-{slug}-analysis.md"
python3 ~/forge/shared/scripts/report_to_html.py \
  "${A%-analysis.md}-dashboard.html" --title "기사 분석 — {slug}" \
  "$A" \
  "${FORGE_OUTPUTS:-$HOME/forge-outputs}/docs/reviews/{date}-{slug}-comparison.md" \
  "${FORGE_OUTPUTS:-$HOME/forge-outputs}/docs/planning/active/plans/{date}-{slug}-apply-plan.md"
```

> 비기술 카테고리는 comparison/apply-plan 없음 → 변환기가 자동 skip (analysis만 변환).

추후 `/wiki-sync`로 Obsidian vault에 반영.
