# Wave 3 Notion 등록 JSON 템플릿

> SKILL.md에서 이관됨 — Wave 3에서 `mcp__notion__notion-create-pages` 호출 시 이 스키마를 따른다.
> Data Source ID·DB URL은 SKILL.md 본문(Wave 3)에 고정 기재되어 있음 — 여기서는 페이로드 구조만 다룬다.
>
> ⚠️ **날짜 속성 세터 키 정정 (2026-08-04 실측)**: 날짜 속성 세터 키는 `date:날짜:start`가 아니라
> **`date:date:날짜:start:start`**다. 구 표기로 첫 호출하면 400 `validation_error`로 실패한다.

## `mcp__notion__notion-create-pages` 호출 예시

```json
{
  "parent": { "data_source_id": "43829f7b-8d3f-47f1-90a1-84f40d39239e" },
  "pages": [{
    "properties": {
      "제목": "{date} AI 시스템 분석",
      "Executive Summary": "{리포트의 Executive Summary 3줄 그대로}",
      "date:date:날짜:start:start": "{date}",
      "상태": "완료",
      "Critical 갭": {Critical 갭 개수},
      "High 갭": {High 갭 개수},
      "Medium 갭": {Medium 갭 개수},
      "P0 액션": {P0 액션 개수},
      "P1 액션": {P1 액션 개수},
      "리포트 경로": "01-research/daily/{date}/ai-system-analysis.md",
      "적용계획 경로": "01-research/daily/{date}/system-improvement-plan.md"
    },
    "content": "{ai-system-analysis.md 전체 내용}\n\n---\n\n{system-improvement-plan.md 전체 내용}"
  }]
}
```

## 속성 값 추출 규칙

- Executive Summary: 리포트의 `## Executive Summary` 섹션 전문
- Critical/High/Medium 갭: 리포트 섹션 4의 각 등급별 항목 수 카운트
- P0/P1 액션: 적용 계획서의 P0/P1 항목 수 카운트
- content: 핵심 요약만 포함 (전체 리포트가 아닌 Notion에서 빠르게 읽을 수 있는 분량)
