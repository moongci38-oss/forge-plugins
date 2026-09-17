---
name: doc-verifier
description: "Verify docs accuracy/completeness against source code. Use: existing docs vs code behavior, after doc-writer, PR doc review. Checks: generated vs source, stale/incorrect docs, API ref accuracy. SKIP: new docs (use doc-writer)."
---

# doc-verifier

기존 문서와 소스 코드를 비교해 정확성·완전성을 검증한다.

## 역할

기존 문서와 소스 코드를 3-Pass(존재/동작/완전성)로 대조해 STALE/INCORRECT/MISSING 이슈를 판정하는 검증자. 신규 문서 생성은 하지 않는다(그건 doc-writer 담당).

## 컨텍스트

`/doc-writer` 실행 직후 생성물 검증, PR 리뷰 시 `docs/` 변경 대응 소스 대비 검증, 또는 정기 문서 감사에서 호출. 입력은 문서 파일 + 대응 소스 파일/디렉토리.

## 출력

PASS/WARN/FAIL 판정 + 이슈 목록 표(유형/위치/설명/권고). STALE 이슈 존재 시 FAIL.

## Quick Start

```
/doc-verifier <doc-file.md> --source <source-file>
/doc-verifier <doc-file.md> --source <source-dir> --type api|module|skill
```

## 실행 흐름

### Step 1. 대상 로드

1. 문서 파일 Read
2. 소스 파일/디렉토리 Read
3. 문서 유형 결정 (api / module / skill / agent / pipeline)

### Step 2. 3-Pass 검증

#### Pass A — 존재 확인

문서에 기술된 항목이 소스에 실제 존재하는가:
- 함수명·파라미터명·반환 타입 → 코드에서 grep 확인
- 엔드포인트 경로 → 라우터 파일 확인
- 필드명·스키마 → 타입 정의 파일 확인

존재하지 않는 항목 = **STALE** 이슈.

#### Pass B — 동작 확인

기술된 동작이 실제 구현과 일치하는가:
- 파라미터 기본값 → 소스 확인
- 에러 처리 분기 → 코드 흐름 확인
- 예시 코드 → 실제 호출 가능 여부 확인

불일치 항목 = **INCORRECT** 이슈.

#### Pass C — 완전성 확인

소스에 있는 주요 요소가 문서에 누락되지 않았는가:
- public 함수 중 미문서화된 것
- 중요 파라미터 누락
- 에러 케이스 미기술

누락 항목 = **MISSING** 이슈.

### Step 3. 판정

```
PASS: 이슈 없음 또는 MISSING MINOR만
WARN: MISSING MAJOR 1개+ or INCORRECT 이슈 (동작 오류)
FAIL: STALE 이슈 (존재하지 않는 내용 기술)
```

### Step 4. 결과 출력

```markdown
## 검증 결과

**판정**: PASS / WARN / FAIL
**대상**: <doc-file> vs <source-file>

### 이슈 목록

| 유형 | 위치 | 설명 | 권고 |
|------|------|------|------|
| STALE | §파라미터 userId | 소스에서 id로 변경됨 | 문서 수정 |
| MISSING | — | onError 콜백 미기술 | 섹션 추가 |
| INCORRECT | §예시 L12 | timeout 기본값 1000, 문서는 500 | 수정 필요 |
```

## Inversion 검증

PASS 판정 직전 반전 체크:
1. "문서가 맞다"는 이유 3가지 → 각각 "왜 틀릴 수 있나?" 확인
2. 소스가 최근 변경됐을 가능성 → git log 확인 권고
3. 문서가 다른 버전 기준일 가능성 → 파일 상단 날짜/버전 확인

## 활용 시점

- `/doc-writer` 실행 직후 → 생성된 문서 즉시 검증
- PR 리뷰 시 `docs/` 변경 포함 → 대응 소스 파일 대비 검증
- 정기 문서 감사 → `docs/` 폴더 전체 스캔

## 참조

- 문서 생성: `/doc-writer`
- spec-compliance-checker (FR 레벨 검증): `~/forge/.claude/skills/spec-compliance-checker/SKILL.md`
