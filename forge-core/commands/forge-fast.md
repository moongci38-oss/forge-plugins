---
description: 소규모(≤3파일) 변경을 즉시 실행·커밋하는 fast-path 커맨드
group: ops
---

# /forge-fast

소규모(파일 ≤3개) 변경의 fast-path 실행. 풀 SDD 파이프라인 스킵.

## 트리거 조건 (GATE) — AI-instruction 전용 (기계적 강제 없음)

실행 전 자동 확인:
- 변경 예상 파일 ≤ 3개
- 예상 소요 시간 ≤ 1분 (탐색·설계·연구 없이 즉시 작성 가능)
- 신규 외부 의존성 없음 (no deps)
- 사전 리서치 불필요 (no research) — 모르는 API·라이브러리 도입 시 forge-implement로 에스컬레이션
- 신규 공개 API 없음 (기존 API 내부 수정만)
- 단일 모듈 범위 (cross-module 설계 변경 X)

조건 미충족 → [STOP]: "이 변경은 `/forge-implement` 파이프라인이 필요합니다. 이유: {이유}"

## 실행 흐름

### Step 1. 범위 선언

변경 대상 파일 목록을 명시한 후 진행. 3개 초과 시 자동 중단.

```bash
git diff HEAD --name-only  # 이미 스테이징된 변경 확인
```

### Step 2. 즉시 실행

- 변경 사항 인라인 구현 (외부 에이전트 스폰 없이 직접 편집)
- 연관 테스트 파일 grep 확인 (영향 범위 파악)

### Step 3. 자체 검증

영향 테스트만 실행 (전체 테스트 스킵):

```bash
# 영향 파일 기준 테스트만
npm test -- --testPathPattern="{영향파일키워드}"
# 또는
pytest {영향모듈}/ -x
```

실패 시 → 즉시 수정 후 재검증 1회. 2회 실패 시 → forge-implement로 에스컬레이션.

### Step 4. 원자적 커밋

```bash
git add {변경파일1} {변경파일2}  # 선택적 add (git add -A 금지)
git commit -m "fix|feat|refactor: {1줄 설명} [fast-path]

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

`[fast-path]` 태그로 추후 감사 추적.

### Step 5. STATE 로그 (선택)

`.claude/state/fast-path.log` 에 append:

```
{YYYY-MM-DD HH:MM} {slug} files={N} test={PASS|SKIP}
```

## 금지 패턴

- 신규 파일 2개+ 생성 금지 (신규 모듈 → forge-implement 트리거)
- `--no-verify` 사용 금지
- `git add -A` / `git add .` 금지 — 파일별 선택적 add 의무

## 에스컬레이션 조건

다음 중 하나라도 발생 시 forge-fast 중단 → `/forge-implement`:
- 실제 변경 파일이 3개 초과된 것을 발견
- 인접 파일에 cascade 영향 발생
- 테스트 2회 연속 실패
