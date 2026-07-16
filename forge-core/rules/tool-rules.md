# Tool Usage Rules

## 스킬 발동 1% 임계값 (CRITICAL)

**1% 확률로라도 스킬이 적용될 가능성이 있으면 반드시 해당 스킬을 호출한다.**

```
IF 스킬 적용 가능성 ≥ 1% → 즉시 Skill 도구 호출 (호출 후 판단)
IF 스킬 호출 후 맞지 않으면 → 그냥 진행 (호출 자체는 문제 없음)
```

**합리화 금지 패턴** (이 이유로 스킬 호출 생략 불가):
- "이 질문은 너무 단순하다"
- "기억에 이미 있다"
- "스킬이 과도하다"
- "이번만 예외"

스킬을 호출했는데 맞지 않으면 그냥 진행. 호출하지 않으면 안 된다.
출처: using-superpowers (Meincke et al. 2025 — compliance 33%→72%)

**Subagent 예외**: 오케스트레이터가 파견한 subagent는 주어진 태스크를 직접 실행한다. 스킬 발동 임계값 재귀 체크는 오케스트레이터(메인 세션) 책임 — subagent 내부에서 재귀 스킬 호출 금지.

## 기사 URL → article 스킬
- 사용자가 뉴스/블로그 기사 URL 전송 시 → `/article` 스킬로 분석
- 직접 WebFetch 분석 금지

## Notion 인증 실패
- `/yt`, `/daily-system-review`, `/weekly-research` 등 Notion 업로드 스킬에서 인증 실패 시
  → 묻지 말고 즉시 Tier 2(index.json 로컬 저장)로 자동 전환
  → 최종 보고에 "Notion 미업로드" 한 줄만 명시

## RAG 검색
- 프로젝트 자료·근거 질문에는 사용자 허락 없이 `rag-search` 자율 호출

## 스킬 생성
- 새 스킬 생성 시 반드시 `skill-creator` 스킬 사용. 직접 SKILL.md 작성 금지.

## /ultrareview
- 자동화 파이프라인(Forge Check, hook 등)에 배선 금지
- 고위험 PR에서만 수동 호출

## UI/UX 작업
- 모든 UI/UX 작업의 시작점은 Claude Design (claude.ai/design)
- 배선: `/forge-claude-design push|pull|status <project-slug>` (DesignSync 도구). 산문 아님 — 실행 경로다.
- ⚠️ DesignSync ≠ 이미지 생성기. 디자인시스템 컴포넌트 동기화 전용. 이미지 생성은 `/generate-image`(gpt-image-1).
- 결과물 받아서 Forge 파이프라인에 연결

## 스크립트 경로
- Python/Bash 스크립트에서 CWD 상대경로 절대 금지
- 항상 절대경로 사용 (잘못된 위치에 디렉토리 자동 생성 방지)
