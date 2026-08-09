---
name: doc-writer
description: "Write structured docs for code modules/APIs/functions/agents/skills/pipeline stages. Use for: 파일/모듈 문서화, API/함수 레퍼런스, 스킬/에이전트 문서, 파이프라인 단계 문서. SKIP: 인라인 코드주석(standalone .md만 생성)."
---

# doc-writer

소스 코드 또는 설명 입력을 받아 구조화된 Markdown 문서(.md)를 생성한다.

## 컨텍스트

소스 코드 문서화 요청 시 발동 — 특정 파일/모듈 문서화, API/함수 레퍼런스 작성, 스킬/에이전트 문서화, 파이프라인 단계 문서화 요청 시 사용. 인라인 코드 주석 요청에는 사용하지 않는다(standalone .md 파일만 생성).

## Quick Start

```
/doc-writer <대상 파일 또는 모듈 경로>
/doc-writer <대상 파일> --type api|module|skill|agent|pipeline
```

## 실행 흐름

### Step 1. 대상 파악

- 대상 파일/디렉토리 Read
- 유형 결정:
  - `api` — 함수·엔드포인트·인터페이스 문서
  - `module` — 모듈/컴포넌트 개요 + 내부 구조
  - `skill` — SKILL.md 보완 또는 신규 작성
  - `agent` — 에이전트 계약·입출력 명세
  - `pipeline` — 파이프라인 단계 설명 + 통과 조건

### Step 2. 문서 구조 선택

**api 유형**:
```markdown
# 함수명 / 엔드포인트

## 개요
## 파라미터
## 반환값
## 예시
## 에러
```

**module 유형**:
```markdown
# 모듈명

## 목적
## 구조
## 주요 컴포넌트
## 의존성
## 사용 예시
```

**agent/skill 유형**:
```markdown
# 에이전트/스킬명

## 역할
## 입력 (Input Contract)
## 출력 (Output Contract)
## 전제조건 / 사후조건
## 실행 흐름
## 예시
```

**pipeline 유형**:
```markdown
# 단계명

## 목적
## 진입 조건
## 실행 내용
## 통과 조건
## 실패 처리
```

### Step 3. 소스 분석

- 핵심 로직 추출 (구현 상세 X — 계약·동작 중심)
- public interface와 internal detail 구분
- 주석·docstring·타입 힌트에서 의도 추론

### Step 4. 문서 생성

- 출력 경로: `docs/{type}/{module-name}.md` (기본) 또는 사용자 지정 경로
- 코드 블록 예시는 실제 작동 가능한 것만 포함
- "구현이 변경되면 깨질 수 있는" 내부 세부사항 최소화

### Step 5. doc-verifier 검증 권고

생성 후 `/doc-verifier <생성된-doc.md> --source <대상-파일>` 실행 권고.

## 문서 품질 기준

| 기준 | PASS | FAIL |
|------|------|------|
| 목적 명확성 | 첫 문단에 "무엇을 하는가" 명시 | "이 모듈은..." 으로 시작 후 모호 |
| 예시 포함 | 실제 사용 코드 1개+ | 예시 없음 |
| 계약 명시 | 입력/출력 타입 명시 | "적절한 값 전달" 수준 |
| 에러 처리 | 주요 실패 케이스 명시 | 에러 섹션 없음 |

## Diataxis 4-Quadrant 커버리지

문서 생성 시 해당 문서가 아래 4분면 중 어느 유형인지 반드시 분류한다.

| 분면 | 목적 | 독자 상태 | 핵심 질문 |
|------|------|----------|----------|
| **Tutorial** (학습) | 학습 경험 제공 — 따라 하며 배움 | 입문자, 처음 시작 | "어떻게 시작하나?" |
| **How-to** (과업) | 특정 목표 달성 절차 안내 | 이미 알지만 방법 필요 | "X를 어떻게 하나?" |
| **Reference** (정보) | 정확한 기술 정보 제공 | 검색하는 사람 | "Y의 정확한 스펙은?" |
| **Explanation** (이해) | 개념·설계 배경 이해 | 왜인지 궁금한 사람 | "왜 이렇게 설계했나?" |

### 분류 절차

1. 대상 파일 분석 후 **주 분면 1개 + 부 분면(있으면)** 선택
2. 문서 헤더에 분면 태그 명시:
   ```markdown
   <!-- diataxis: how-to -->
   ```
3. **커버리지 갭 플래그**: 모듈 또는 스킬 문서화 시 4분면 중 빠진 분면이 있으면 `<!-- gap: tutorial, explanation -->` 형태로 명시

### 분면별 문서 구조 힌트

- **Tutorial** — 단계별 실습, 중간 결과 확인 포함, "다음에 배울 것" 안내
- **How-to** — 목표 먼저, 전제조건 명시, 결과 확인 방법 포함
- **Reference** — 완전성·정확성 최우선, 알파벳/논리 순 정렬, 예시는 최소
- **Explanation** — 맥락·배경·trade-off 서술, 아키텍처 결정 이유 포함

### 커버리지 갭 판정 기준

| 갭 레벨 | 조건 | 권고 |
|---------|------|------|
| WARN | Tutorial 또는 How-to 중 하나 없음 | 갭 플래그 + 생성 권고 |
| INFO | Explanation 없음 | 갭 플래그만 |
| OK | 4분면 모두 존재 | 통과 |

## 참조

- doc-verifier로 문서 정확성 검증: `/doc-verifier`
- 에이전트 계약 표준: `$HOME/.claude/rules-on-demand/agent-contracts.md`
- Diataxis 공식 문서: https://diataxis.fr
