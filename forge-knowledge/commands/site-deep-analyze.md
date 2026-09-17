---
description: 사이트 URL 정밀 분석 → 재구현 가이드 생성 (Playwright + Vision + Tavily)
allowed-tools: Bash, Read, Write, Edit, WebFetch, Glob, Grep, Agent
argument-hint: "<URL> [--depth=N] [--pages=N] [--task=ui-audit|api-discovery] [--viewport=desktop,mobile] [--cu --scenario '...'] [--dry-run]"
model: sonnet
group: research
---

# /site-deep-analyze

사이트 URL → 정밀 분석 → 재구현 가이드 생성. 기존 도구(playwright-cli, screenshot-analyze, Tavily, style-forge) wrapper 스킬.

> **절차·가드레일 SSoT = `skills/site-deep-analyze/SKILL.md`.** 이 커맨드는 진입점(6-Phase 요약)일 뿐이다.
> robots.txt Disallow 시 STOP·localhost/RFC1918(사설망) 접근 차단·PII redact·rate limit(윤리·법적 가드레일),
> Computer Use 사용 시 자격증명은 `env://` 참조만 허용·**결제 직전 [STOP]**·max-cost/max-actions 상한
> (Computer Use 가드레일), Phase 2.5 추론검증, fan-out+Coverage Loop는 **전부 스킬이 정의**한다.
> 이 커맨드 문서만 읽고 실행하지 마라 — 가드레일이 누락된 채 사이트를 크롤링·조작하게 된다.

## 절차

| Phase | 동작 | 도구 |
|:-:|---|---|
| 0 | URL boundary + robots.txt + ToS 확인 | hook + WebFetch |
| 1 | 사이트 매핑 (depth/pages/viewport 캡처) | playwright-cli |
| 2 | DOM 컴포넌트 + CSS 토큰 + API endpoint 추론 | DOM 파싱 |
| 3 | Vision 시각 분석 (핵심 화면 5-10개) — `codex-critic` 에이전트 (Codex 레인). ⚠️ 모델명은 여기서 못 박지 않는다 — 정본은 `.claude/agents/codex-critic.md` frontmatter 다 (아래 각주) | /screenshot-analyze |
| 4 | 시맨틱 추출 (JS 렌더링) | Tavily tavily_extract |
| 4.5 | Computer Use 시나리오 (--cu) | `.claude/skills/site-deep-analyze/scripts/cu-runner.py` |
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

<!--
2026-09-17 정정 2건 (감사 C그룹 §2-7·§22):
① Phase 3 의 구 표기 "GPT-6 Astra(codex-critic)" 폐기 — 2026-09-17 사람 결정으로 최고급 모델(Fable 5.1·gpt-6-astra)은
   advisor·cto-advisor 전용이 됐고 Vision 은 advisor 레인이 아니다(정본 `~/.claude/rules/model-routing.md §워커 tier`).
   ✅ **뿌리를 고쳤다 (2026-09-17)** — `.claude/agents/codex-critic.md` 가 이제 레인별로 갈라 적는다.
   Vision 레그 = `codex:high`(`gpt-5.6-sol`) 고정 · 검수 2레그 = `codex:max`(Astra) — "최고급은 advisor 전용" 의 명시적 예외라 그대로 둔다.
   그 에이전트는 screenshot-analyze·video-reference-guide·forge-check-ui·visual-loop·system-audit 의 Vision 레그를 함께 담당하므로
   커맨드 한 곳에서 모델명을 다르게 못 박으면 문서끼리 어긋난다. 그래서 여기서는 여전히 **에이전트를 가리키기만** 한다.
   ⚠️ 구 표기 "뿌리는 아직 안 고쳐졌다 — frontmatter 가 여전히 `GPT-6 Astra`" 는 2026-09-17 폐기.
   재현: `grep -n 'Vision 레그 모델' ~/forge/.claude/agents/codex-critic.md` → `codex:high`(= `gpt-5.6-sol`) 고정 (2026-09-17 관측)
② Phase 4.5 의 구 표기 `cu-runner.py`(경로 없음) 폐기 — `shared/scripts/` 에는 없다.
   재현: `find ~/forge -name cu-runner.py -not -path '*/.git/*'` → `~/forge/.claude/skills/site-deep-analyze/scripts/cu-runner.py` 1건 (2026-09-17 관측)
폐기조건: codex-critic 의 모델 핀이 정리되면 ①을, cu-runner.py 가 옮겨지면 ②를 갱신한다.
-->

## 산출물 경로

`${FORGE_OUTPUTS:-$HOME/forge-outputs}/05-design/site-analysis/{hostname-slug}/`

## 관련 스킬

- `playwright-cli` — Phase 1 크롤
- `screenshot-analyze` — Phase 3 시각 분석
- `style-forge` — Phase 5 스타일 가이드 형식
