---
name: inspection-checklist
description: "Forge Dev 파이프라인 모든 Check(8.5, 8.6, 8.7, 8.8)를 통합한 최종 검수 체크리스트를 생성한다. Phase 8 모든 Check 완료 후 PR 생성 직전 또는 릴리스 전 최종 점검 시 실행. 빌드/테스트, Spec 추적성, UI 품질, 코드 리뷰, 보안 5개 영역을 종합 판정한다."
context: fork
agent: general-purpose
model: haiku
---

**역할**: 당신은 Forge Dev Phase 8의 모든 Check(8.5, 8.6, 8.7, 8.8)를 통합한 최종 검수 전문가입니다.
**컨텍스트**: PR 생성 직전 또는 릴리스 전 최종 점검 시 호출됩니다.
**출력**: 빌드/테스트/Spec/UI/보안 5개 영역 PASS/WARN/FAIL 체크리스트을 반환합니다.

# Inspection Checklist

Forge Dev 파이프라인의 모든 Check를 통합한 최종 검수 체크리스트를 생성하는 스킬.
PR 생성 전(Phase 9 직전) 또는 릴리즈 전 최종 점검에 사용된다.

## 사용 시점

- Phase 8의 모든 Check (8.5, 8.6, 8.7, 8.8) 완료 후
- Phase 9 PR 생성 직전 최종 검수
- 릴리즈 전 종합 점검

## 체크리스트 항목

### 1. 빌드/테스트 (Check 8)

- [ ] `verify.sh code` 통과 (빌드 성공)
- [ ] `verify.sh test` 통과 (전체 테스트 PASS)
- [ ] `verify.sh lint` 통과 (코드 스타일)
- [ ] 타입 체크 통과
- [ ] 신규 경고 없음

### 2. Spec 추적성 (Check 8.5)

- [ ] 모든 기능 요구사항 구현됨
- [ ] 모든 기능 요구사항에 테스트 존재
- [ ] API 계약 일치 (Method, 경로, 요청/응답)
- [ ] 데이터 모델 일치

### 3. UI/품질 (Check 8.6) — Frontend 변경 시

**기존 5카테고리:**

- [ ] 반응형 디자인 확인 (mobile/tablet/desktop)
- [ ] 접근성 (WCAG 2.1 AA) 기준 충족
- [ ] Lighthouse 성능 점수 ≥ 90
- [ ] 이미지 최적화 (WebP/AVIF, lazy loading)
- [ ] 크로스 브라우저 호환성

**Typography (신규):**

- [ ] `font-display: swap` 적용 (FOUT 방지)
- [ ] 본문 행간(line-height) ≥ 1.5
- [ ] 본문 폰트 크기 ≥ 16px
- [ ] 텍스트 대비 비율 ≥ 4.5:1 (WCAG AA)
- [ ] 숫자 데이터에 `font-variant-numeric: tabular-nums` 적용

**Animation (신규):**

- [ ] `prefers-reduced-motion` 미디어 쿼리 대응
- [ ] 애니메이션은 compositor 속성만 사용 (transform, opacity)
- [ ] 애니메이션 60fps 유지 (layout thrashing 없음)
- [ ] `will-change` 속성 남용 금지 (필요한 요소에만)
- [ ] 전환 시간 ≤ 300ms (사용자 인지 한계)

**Forms (신규):**

- [ ] 모든 input에 연결된 `<label>` 존재
- [ ] `autocomplete` 속성 적절히 설정
- [ ] 에러 메시지에 `role="alert"` 또는 `aria-live` 적용
- [ ] Submit 버튼 중복 클릭 방지 (disabled + loading)
- [ ] 필수 필드에 `aria-required="true"` 표시

**Focus States (신규):**

- [ ] `:focus-visible` 스타일 정의 (outline 제거 금지)
- [ ] 논리적 탭 순서 (`tabindex` 남용 금지)
- [ ] Skip-to-content 링크 존재
- [ ] 모달/드롭다운에 포커스 트랩 구현
- [ ] 포커스 이동 후 스크롤 위치 적절

**Dark Mode (신규):**

- [ ] `color-scheme: light dark` 메타 설정
- [ ] CSS 변수 기반 테마 토큰 사용
- [ ] `prefers-color-scheme` 미디어 쿼리 대응
- [ ] 다크 모드에서 이미지 밝기/대비 조정
- [ ] 수동 테마 전환 시 시스템 설정 오버라이드 가능

**Navigation (신규):**

- [ ] URL과 UI 상태 동기화 (searchParams/hash 반영)
- [ ] 뒤로가기 시 이전 상태 복원
- [ ] 페이지 전환 시 스켈레톤 UI 표시
- [ ] Deep-linking 지원 (공유 URL로 동일 뷰 재현)
- [ ] 현재 위치 표시 (active nav, breadcrumb)

### 4. 코드 리뷰 (Check 8.7) — Hook + Agent 하이브리드

**Layer 1 — Git Hook (정적, 자동 실행):**

- [ ] tsc --noEmit 통과 (pre-commit: lint-staged)
- [ ] ESLint 통과 (pre-commit: lint-staged)
- [ ] Prettier 통과 (pre-commit: lint-staged)
- [ ] 하드코딩 시크릿 없음 (pre-push: check-secrets.sh)
- [ ] dev/prerelease 의존성 없음 (pre-push: check-deps.sh)
- [ ] dead i18n 키 없음 (pre-push: check-i18n.sh)
- [ ] JSON 구조 유효 (pre-push: check-json-integrity.sh)

**Layer 2 — Agent (시맨틱, Check 8.7 실행 시):**

- [ ] 불필요한 API 재호출 없음 (api-unnecessary-call)
- [ ] 에러 삼킴 없음 (api-error-swallow) [Critical]
- [ ] 과도한 Context 커플링 없음 (api-state-coupling)
- [ ] HTML 시맨틱 UX 위반 없음 (html-mailto-target, html-button-in-anchor)
- [ ] 순환 의존성 없음 (arch-circular-dep) [Critical]
- [ ] 레이어 침범 없음 (arch-layer-violation) [Critical]
- [ ] 비동기 경합/cleanup 문제 없음 (logic-race-condition, logic-missing-cleanup) [Critical]
- [ ] 중복 mutation 없음 (logic-redundant-mutation)

### 5. 보안 (Check 8.8)

- [ ] 입력 검증 (SQL Injection, XSS 방지)
- [ ] 인증/인가 로직 검증
- [ ] 민감 데이터 노출 없음
- [ ] 의존성 취약점 없음
- [ ] CORS/CSP 설정 적절

### 6. 문서/PR 준비

- [ ] Spec 파일 최신 상태
- [ ] 변경 사항 요약 작성
- [ ] Breaking Change 있으면 마이그레이션 가이드
- [ ] 커밋 메시지 Conventional Commits 준수

### 7. Codex 2차 게이트 (Plan v2-C1)

- [ ] `--stage code` 호출 결과 확인 (Check 8.7-X) — `forge-outputs/docs/reviews/code/`
- [ ] `--stage test` 호출 결과 확인 (Check 8.8-X) — `forge-outputs/docs/reviews/test/`
- [ ] `--stage final` 적대적 리뷰 PASS (Check 9-X, blocking) — `forge-outputs/docs/reviews/final/`
- [ ] Claude vs Codex delta 분류 = `agreement` 또는 `extension` (disagreement = Human 판단 필요)
- [ ] 미호출 시 `/cr-final <PR-N or branch>` 수동 실행

## 출력 형식

```markdown
# 통합 검수 체크리스트

## 프로젝트: {project}
## 세션: {session}
## 날짜: {date}

### 결과 요약

| 영역 | 상태 | 비고 |
|------|:----:|------|
| 빌드/테스트 | ✅ | 전체 PASS |
| Spec 추적성 | ✅ | 100% 매핑 |
| UI/품질 | ⬜ | N/A (백엔드만) |
| 코드 리뷰 | ✅ | 이슈 0건 |
| 보안 | ✅ | 취약점 없음 |

### 최종 판정: ✅ PR 생성 가능 / ❌ 수정 필요
```

## 프로세스

1. 현재 세션의 Check 결과 수집 (session-state.mjs에서 읽기)
2. 각 Check 영역별 상세 항목 검증
3. Frontend 변경 없으면 Check 8.6은 N/A 처리
4. 체크리스트 생성 + 최종 판정
5. 결과를 세션 상태에 기록

## 자동 평가 (eval-rubric 통합)

본 스킬 결과 산출 후 자동으로 `eval-rubric` 호출 → 4축 Rubric 채점 (clarity/consistency/completeness/safety) → `eval_cases.jsonl` 누적.

### 호출 시점
- 본 스킬 핵심 산출물 저장 직후 — 종합 체크리스트 (`docs/reviews/inspection/{date}-{feature}.md`)

### 절차
1. 스킬 산출물 저장 후 다음 호출:
   ```
   /eval-rubric --target {산출물 경로}
   ```
2. eval-rubric의 verdict (PASS/WARN/FAIL) + 4축 점수 + rationale 수신
3. `eval_cases.jsonl` append:
   - 위치: `~/.claude/skills/inspection-checklist/eval_cases.jsonl`
   - case_id: `EC-inspection-checklist-{N}` (auto-increment)
   - split: holdout 결정 (`hash(case_id) % 100 < 20` → holdout, 그 외 sample)
   - dedupe key: `sha256(skill+input.context+input.args)` 충돌 시 observed_count++

### 자동 비활성 조건
- 환경변수 `EVAL_RUBRIC_AUTO=off` 설정 시 스킵
- 본 스킬 frontmatter에 `eval_cases: off` 명시 시 스킵 (특수 케이스)

### 통합 효과
- FAIL 케이스 자동 누적 → 회귀 평가 데이터셋 구축
- WARN 시 사용자 알림 (자동 차단 X — 본 스킬 verdict 우선)
- 분기별 Harness GC 사이클의 Quality Audit 입력으로 활용

### 보안 / 데이터 보호
- eval-rubric의 입력 redaction 정책 자동 적용 (`~/.claude/skills/eval-rubric/SKILL.md` "보안 정책" 참조)
- 산출물에 secret/PII 의심 시 → eval-rubric STOP fail-safe 발화 → 본 스킬도 STOP

> 출처: 하네스 백과사전 제5장 평가 하네스, eval_cases.jsonl 설계 (`forge-outputs/11-platform/skills/eval-cases/2026-05-10-v1-design/plan.md`)

## Evaluator (Wave 2.5)

독립 Evaluator subagent가 산출물 품질을 검증합니다.

```
Evaluator 역할: 산출물 독립 검증
모델: claude-haiku-4-5 (경량, 편향 최소화)
격리: 메인 컨텍스트 오염 방지
```

판정 기준:
- PASS: 모든 핵심 기준 충족, 즉시 사용 가능
- WARN: 사용 가능하나 개선 권장, 사용자 확인 후 진행
- FAIL: 핵심 기준 미충족, 재실행 필요

eval_cases.jsonl에 결과 자동 누적.
