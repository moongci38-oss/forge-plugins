---
name: code-quality-rules
description: "정적 분석기가 못 잡는 의미적 품질 결함(로직·아키텍처·UX)을 검출한다. 코드를 작성하거나 수정한 직후 자동으로 사용한다."
user-invocable: false
context: fork
model: sonnet
---

**역할**: 당신은 Hook이 잡지 못하는 시맨틱 코드 품질 이슈를 4개 카테고리 10룰로 검출하는 코드 품질 감사 전문가입니다.
**컨텍스트**: Forge Dev Check 8.7Q(Quality)에서 자동 검증되거나 코드 리뷰 시 참조됩니다.
**출력**: API 패턴·HTML/접근성·아키텍처·로직 카테고리별 위반 항목 목록과 수정 권고를 마크다운으로 반환합니다.

## Evaluator 핵심 원칙: 절대 관대하게 보지 마라
아래 생각이 들면 더 엄격하게 본다:
- "나쁘지 않은데..." → 감점
- "이 정도면 괜찮지 않나?" → 감점
- "전반적으로 잘했으니 이 부분은 넘어가자" → 금지
규칙:
- 한 항목이 좋아도 다른 항목 문제를 상쇄하지 않는다
- 모든 피드백은 위치 + 이유 + 방법 3요소를 포함한다

# Code Quality Rules (Semantic)

Hook(lint-staged, ESLint)이 잡지 못하는 시맨틱 코드 품질 이슈를 Agent가 검출한다.
Forge Dev Check 8.7Q(Quality)에서 자동 검증하며, 코드 리뷰 시 참조한다.

4개 카테고리 10룰.

## When to Apply

- Forge Dev Check 8.7Q 코드 품질 검증 시
- PR 코드 리뷰 시
- 새 모듈/컴포넌트 작성 완료 후 자체 검증 시
- 리팩토링 전 이슈 진단 시

## Hook vs Agent 역할 분리

| 계층 | 담당 | 예시 |
|------|------|------|
| **Hook (정적)** | 문법, 포맷, import 순서, 미사용 변수 | ESLint, Prettier, lint-staged |
| **Agent (시맨틱)** | 로직 결함, 아키텍처 위반, 런타임 이슈 | 이 스킬의 10개 룰 |

Hook은 AST 기반 패턴 매칭으로 빠르게 잡을 수 있는 이슈를 처리한다.
Agent는 파일 간 관계, 실행 흐름, 비즈니스 로직 맥락을 이해해야 하는 이슈를 처리한다.

## Rule Index

### 1. API Patterns — `api-`

| # | ID | 룰 제목 | 심각도 |
|:-:|------|---------|:------:|
| 1 | api-unnecessary-call | mutation 후 불필요한 refetch 금지 | warning |
| 2 | api-error-swallow | catch에서 에러 삼킴 금지 | critical |
| 3 | api-state-coupling | 과도한 Context/전역 상태 의존 금지 | warning |

### 2. HTML/Accessibility — `html-`

| # | ID | 룰 제목 | 심각도 |
|:-:|------|---------|:------:|
| 4 | html-mailto-target | mailto에 target="_blank" 불필요 | warning |
| 5 | html-button-in-anchor | a 태그 내 button 중첩 금지 | warning |

### 3. Architecture — `arch-`

| # | ID | 룰 제목 | 심각도 |
|:-:|------|---------|:------:|
| 6 | arch-circular-dep | 모듈 간 순환 import 금지 | critical |
| 7 | arch-layer-violation | 레이어 경계 침범 금지 | critical |

### 4. Logic — `logic-`

| # | ID | 룰 제목 | 심각도 |
|:-:|------|---------|:------:|
| 8 | logic-redundant-mutation | 동일 상태 연속 덮어쓰기 금지 | warning |
| 9 | logic-race-condition | 비동기 cleanup 없이 상태 업데이트 금지 | critical |
| 10 | logic-missing-cleanup | useEffect cleanup 미반환 금지 | warning |

### 5. Fowler Smell Baseline — `smell-` (판단 보조, 전부 warning)

> 출처: Fowler _Refactoring_ ch.3 (mattpocock/skills code-review 2026-07-10 흡수). 위 1~4 룰과 달리 **항상 판단 보조(judgement call)** — "possible Feature Envy"처럼 라벨링하지 위반 단정하지 않는다. 레포 문서화 표준이 우선(표준이 승인하면 smell 억제), 툴링이 이미 잡는 것은 스킵.

| # | ID | smell → 처방 |
|:-:|------|---------|
| 11 | smell-mysterious-name | 이름이 역할을 안 드러냄 → rename. 정직한 이름이 안 나오면 설계가 탁한 것 |
| 12 | smell-duplicated-code | 같은 로직 형상이 2+ hunk/파일에 → 공통 형상 추출 |
| 13 | smell-feature-envy | 자기 데이터보다 남의 데이터에 더 손대는 메서드 → 그 데이터 쪽으로 이동 |
| 14 | smell-data-clumps | 같은 필드/파라미터 몇 개가 늘 함께 이동 → 타입으로 묶어 전달 |
| 15 | smell-primitive-obsession | 도메인 개념을 원시타입/문자열이 대행 → 작은 전용 타입 부여 |
| 16 | smell-repeated-switches | 같은 타입에 같은 switch/if-계단이 반복 → 다형성 또는 공유 map |
| 17 | smell-shotgun-surgery | 논리적 변경 1개가 여러 파일 산발 수정 강제 → 함께 변하는 것을 한 모듈로 |
| 18 | smell-divergent-change | 한 파일이 무관한 이유 여럿으로 수정됨 → 이유별 분리 |
| 19 | smell-speculative-generality | spec에 없는 필요를 위한 추상화·파라미터·훅 → 삭제, 실 수요 생길 때까지 인라인 |
| 20 | smell-message-chains | 긴 `a.b().c().d()` 탐색 의존 → 첫 객체의 메서드 뒤로 숨김 |
| 21 | smell-middle-man | 위임만 하는 클래스/함수 → 제거, 실 대상 직접 호출 |
| 22 | smell-refused-bequest | 상속분 대부분을 무시/오버라이드 → 상속 버리고 합성 |

## How to Use

개별 룰 파일을 참조하여 상세한 코드 예제와 감지 패턴을 확인한다:

```
rules/api-unnecessary-call.md
rules/arch-circular-dep.md
```

각 룰 파일에 포함된 내용:
- 문제 설명
- 감지 패턴 (Agent가 어떻게 식별하는가)
- Bad/Good 코드 예제
- 검증 방법

## Compressed Reference

전체 10룰의 압축 원라이너 참조: `AGENTS.md`
