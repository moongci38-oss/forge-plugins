# investigate — Reference

> SKILL.md 본문에서 분리된 상세 기준표·예시·템플릿. 해당 Stage 실행 시에만 Read.

## §11-Category Bug Pattern 카탈로그

Stage 0.5 빠른 매핑 + Stage 2 가설 수립에 공통 참조하는 전체 인라인 SSoT(외부 파일 없음).

| # | 카테고리 | 증상 힌트 |
|---|---------|----------|
| 1 | **off-by-one** | 경계값 근처에서만 실패, N-1개 처리, 마지막 요소 누락 |
| 2 | **race-condition** | 간헐적 실패, 동시 요청 시에만, 타이밍 의존, 재현 불안정 |
| 3 | **null-deref** | NPE/NullReference, undefined 접근, optional 미처리 |
| 4 | **type-coercion** | 타입 변환 후 잘못된 비교, JS `==` vs `===`, implicit cast |
| 5 | **state-mutation** | 전역 변수 오염, 클로저 캡처 오류, 공유 상태 예상 외 변경 |
| 6 | **async-order** | Promise chain 순서 오류, callback hell, await 누락, 이벤트 순서 의존 |
| 7 | **boundary-check** | 배열 범위 초과, 페이지 0/마지막, 빈 입력 미처리 |
| 8 | **resource-leak** | 파일/커넥션 미닫힘, 메모리 누수, 소켓 고갈, GC pressure |
| 9 | **config-mismatch** | 환경별 설정 불일치, 시크릿 미주입, 피처 플래그 반전, 경로 불일치 |
| 10 | **dependency** | 라이브러리 버전 충돌, 패키지 누락, peer dependency 불일치 |
| 11 | **regression** | 이전에 정상이었으나 특정 커밋 이후 재발, git bisect 대상 |

## §4 디버그 추론 모델

Stage 2(분석) 및 Stage 3(가설 검증) 진행 시, 상황에 맞는 모델을 선택 적용. 기존 5-step 역추적(Stage 2 §코드 경로 역추적)과 병행 사용.

| 모델 | 적용 상황 | 방법 |
|------|---------|------|
| **binary-search** | 재현 가능하나 원인 범위가 넓을 때 (대규모 코드베이스, 수백 커밋) | 범위를 절반씩 좁힘. git bisect 또는 코드 경로를 반으로 나눠 어느 쪽이 실패하는지 확인 → 반복 |
| **differential** | "A 환경에서는 정상, B 환경에서는 실패" 패턴일 때 | 두 환경의 차이점 목록화 (설정·버전·데이터·실행 순서) → 차이 항목을 하나씩 교체하며 실패 재현 |
| **causal-chain** | 에러 스택트레이스 또는 로그가 있을 때 (원인-결과 체인 역추적) | 증상(결과)에서 출발해 "무엇이 이것을 유발했는가"를 거슬러 올라감. 5-Whys와 결합. 최초 입력/상태 오류 지점 도달 시 종료 |
| **invariant-check** | 복잡한 상태 기계·데이터 파이프라인·분산 시스템에서 간헐적 실패 | 시스템이 항상 참이어야 하는 불변 조건(invariant)을 명시 → 각 체크포인트에서 불변 조건 위반 여부 확인 → 위반 지점 = 원인 |

**추론 모델 선택 가이드**:
- 로그/스택 있음 → **causal-chain** 우선
- 환경·버전 차이 있음 → **differential**
- 재현 가능·범위 불명 → **binary-search**
- 상태 복잡·간헐적 → **invariant-check**
- 여러 조건 복합 → 두 모델 병행 허용

## §Stage 1 다층 시스템 boundary 진단 예시 (starbeginz 3 repo)

avatarplay-frontend → .NET API → MySQL:

```bash
# Layer 1: Frontend 요청
console.log('[FE→API] req:', { url, headers: { Authorization: token?.substring(0,20) }, body });

# Layer 2: .NET 진입
_logger.LogInformation("[API entry] User={UserId}, Endpoint={Path}, JwtClaims={Claims}", ...);

# Layer 3: ServiceStack OrmLite 쿼리
_logger.LogInformation("[DB query] SQL={Sql}, Params={Params}", db.GetLastSql(), parameters);

# Layer 4: 응답
_logger.LogInformation("[API exit] resultCode={Code}, dataKeys={Keys}", result.ResultCode, ...);
```

**원칙**: 1 회 실행 + 4 layer 로그 = 깨진 경계 즉시 식별 → 해당 1개 layer만 깊이 조사. 4 layer 동시 추측 = thrashing.

## §합리화 반박 — 금지 패턴표

| 합리화 패턴 | 반박 | 올바른 행동 |
|------------|------|------------|
| "증상이 명확하니 원인도 명확하다" | 증상 ≠ 원인. 증상은 여러 원인의 결과일 수 있다 | Stage 2 가설 최소 2개 이상 |
| "이 파일만 보면 충분하다" | 다층 시스템에서 레이어 간 경계가 진짜 실패 지점 | Stage 1 boundary 진단 먼저 |
| "긴급하니 Stage 건너뜀" | 빠른 우회 패치 = 재발 보장 | Stage 순서 고정, 긴급 = 근거 수집 속도 ↑ |
| "3번 시도했으니 이게 맞다" | 반복 실패 = 가설이 틀렸다는 신호 | 3-fix 에스컬레이션 규칙 적용 |
| "테스트 추가는 나중에" | 재현 테스트 없으면 수정 검증 불가 | Stage 4 Prove-It 먼저 |

## §Stage 6 bug log MD 템플릿

저장 경로: `forge-outputs/01-research/bugs/{project}/{YYYY-MM-DD}-{slug}.md`

- `{project}`: 현재 작업 디렉토리에서 추론 (godblade, portfolio, pingame-server 등)
- `{slug}`: 증상 요약 kebab-case (예: `session-not-persisted-after-login`)

```markdown
---
project: {project}
date: {YYYY-MM-DD}
severity: P0/P1/P2
status: fixed
tags: [관련 키워드]
---

## 증상
[Stage 1의 증상 요약]

## 근본 원인
[Stage 5의 근본 원인 1문장]

## 수정 내용
- 파일: ...
- 변경: ...

## 재발 방지
[Stage 5의 재발 방지 내용]

## 관련 버그
[rag-search에서 발견된 연관 버그 링크, 없으면 "없음"]
```

> **rag-search 자동 인덱싱**: 저장 즉시 `forge-outputs/01-research/bugs/`가 rag-search 범위에 포함되어
> 다음 `/investigate` 호출 시 Stage 1에서 이 버그가 참조됨.
