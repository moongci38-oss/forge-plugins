---
description: 사이트 URL 정밀 분석 → 재구현 가이드 생성 (Playwright + Vision + Tavily)
allowed-tools: Bash, Read, Write, Edit, WebFetch, Glob, Grep, Agent
argument-hint: "<URL> [--depth=N] [--pages=N] [--task=ui-audit|api-discovery] [--viewport=desktop,mobile] [--cu --scenario '...'] [--dry-run]"
model: sonnet
group: research
---

# /site-deep-analyze

사이트 URL → 정밀 분석 → 재구현 가이드 생성. 기존 도구(playwright-cli, screenshot-analyze, Tavily, style-forge) wrapper 스킬.

## 절차

| Phase | 동작 | 도구 |
|:-:|---|---|
| 0 | URL boundary + robots.txt + ToS 확인 | hook + WebFetch |
| 1 | 사이트 매핑 (depth/pages/viewport 캡처) | playwright-cli |
| 2 | DOM 컴포넌트 + CSS 토큰 + API endpoint 추론 | DOM 파싱 |
| 3 | Gemini Vision 시각 분석 (핵심 화면 5-10개) | /screenshot-analyze |
| 4 | 시맨틱 추출 (JS 렌더링) | Tavily tavily_extract |
| 4.5 | Computer Use 시나리오 (--cu) | cu-runner.py |
| 5 | 산출물 7종 생성 | 자동 |
| 6 | 다음 액션 안내 | 자동 |

## 실행

```bash
# 기본
/site-deep-analyze https://example.com

# 깊은 크롤
/site-deep-analyze https://example.com --depth=3 --pages=50

# UI 위주
/site-deep-analyze https://example.com --task=ui-audit

# BE API 위주
/site-deep-analyze https://example.com --task=api-discovery

# Computer Use 통합 (AD-59, ANTHROPIC_API_KEY 필요)
/site-deep-analyze https://example.com --cu --scenario "회원가입 플로우" --max-cost=5

# dry-run (estimate만 출력, 실제 분석 X)
/site-deep-analyze https://example.com --dry-run
```

## 산출물 경로

`${FORGE_OUTPUTS:-$HOME/forge-outputs}/05-design/site-analysis/{hostname-slug}/`

## 관련 스킬

- `playwright-cli` — Phase 1 크롤
- `screenshot-analyze` — Phase 3 시각 분석
- `style-forge` — Phase 5 스타일 가이드 형식
