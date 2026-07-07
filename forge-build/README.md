# forge-build

> Forge 제품 생성 파이프라인 — 기획(Spec/Plan)부터 Phase 1~12 구현·QA·버그수정·보안·테스트·배포까지, SDD 본류를 담당하는 통합 플러그인

**버전**: v0.2.0 | **의존성**: `forge-core` | **레포**: `moongci38-oss/forge-plugins`

---

## 개요

`forge-build`는 백엔드·풀스택 개발자와 기획자(PM)를 위한 Forge 제품 생성 파이프라인 도구 모음입니다. 구 `forge-dev`(구현·검증)와 구 `forge-plan`(기획: spec-write/writing-plans/requirements-clarity/autoplan)을 통합해, 기획부터 배포까지 SDD 파이프라인 전 과정을 하나의 플러그인으로 제공합니다. axis-* 감사 에이전트는 `forge-core`로 이동했고, 대신 `cto-advisor`·`spec-writer-base` 에이전트가 새로 편입되었습니다.

```
P1 환경설정 → P2 디자인 검토 → P3 Spec 작성(기획) → P4 기술 설계 →
P5 구현(Check 5.5~5.9) → P6 QA → P7 PR+머지 →
P8~P9 배포 → P10~P12 모니터링·롤백
```

---

## 설치

```bash
# forge-core 먼저 설치 필수
claude plugin install forge-core
claude plugin install forge-build

# Claude Code 재시작
```

---

## 스킬 목록

### QA / 테스트

| 스킬 | 설명 | 자동 트리거 |
|------|------|------------|
| `qa` | QA 전 사이클 오케스트레이터 (Phase A~H) | `/forge-qa` |
| `qa-setup` | QA 하네스 부트스트랩 | `/qa` 실행 시 Phase 0 |
| `api-e2e` | REST API E2E 자동 테스트 | `/qa` (API 프로젝트 감지 시) |
| `playwright-cli` | 브라우저 자동화 테스트 | 수동 |
| `playwright-parallel-test` | 3개 subagent 병렬 UI 테스트 | 수동 |
| `benchmark` | 브랜치간 성능 비교 | P7 PR 생성 전 |
| `canary` | 배포 후 15분 헬스 모니터링 | P7-DI PASS 후 |

#### qa

QA 전 사이클 오케스트레이터입니다 (AD-93 Phase A~H).

```bash
/forge-qa                          # 전체 QA
/forge-qa --scope=domain           # 도메인 한정
/forge-qa --scope=auth             # 특정 모듈
/forge-qa --scope="src/auth/**"    # 파일 패턴
```

Phase A~H 실행 순서:
1. **Phase A**: 브랜치 생성 + qa-setup 자동 호출
2. **Phase B**: 시나리오 전수 (scenarios.md)
3. **Phase C**: 버그 발견 (bug-report 스킬)
4. **Phase D**: 수정 계획 수립
5. **Phase E**: Healer 병렬 수정
6. **Phase F**: cr-* 검수 + Codex 검증
7. **Phase G**: develop 자동 머지
8. **Phase H**: Wiki 축적 (wiki-sync)

#### qa-setup

`/qa` 실행 시 Phase 0으로 자동 호출됩니다.

- 서버 생명주기 관리 (시작·종료·재시작)
- `qa-config.json` 자동 생성
- DB seed 격리 (테스트 전용 데이터)
- API 전수 발견 (엔드포인트 목록 추출)
- `scenarios.md` 게이트 준비

#### api-e2e

OpenAPI/Swagger YAML 기반으로 엔드포인트별 테스트를 자동 생성하고 curl로 실행합니다.

```bash
/api-e2e docs/openapi.yaml
/api-e2e docs/openapi.yaml --base-url http://localhost:3000
```

테스트 케이스 자동 생성:
- Happy path (정상 요청)
- 인증 실패 (401/403)
- 잘못된 입력 (400/422)
- 경계값 테스트

OpenAPI 스펙 드리프트 자동 감지 (실제 응답 vs 스펙 불일치).

#### playwright-parallel-test

3개 subagent를 동시에 스폰하여 UI를 병렬 검증합니다:
- subagent-1: 폼 유효성 검사
- subagent-2: 네비게이션/라우팅
- subagent-3: 반응형 레이아웃

```bash
/playwright-parallel-test
```

#### canary

배포 후 15분간 서비스 헬스를 모니터링합니다.

- 에러율 추적 (임계값 초과 시 FAIL)
- 응답 시간 P95/P99 추적
- 메모리 사용량 추적
- PASS/WARN/FAIL 자동 판정 (canary-judge 에이전트)

---

### 버그 / 이슈 처리

| 스킬 | 설명 | 트리거 |
|------|------|--------|
| `bug-report` | 웹앱 자동 순회 버그 탐지 + 표준 리포트 생성 | 'QA 해줘', '버그 찾아줘' |
| `investigate` | 버그 근본 원인 4단계 구조화 분석 | '원인 찾아줘', `/investigate` |
| `healer` | 버그 리포트 기반 자동 수정 (TDD red-green) | '/healer BUG-001' |

#### bug-report

웹앱 LNB 전체 메뉴를 자동 순회하며 기능 오류와 레이아웃 이슈를 탐지합니다.

출력 형식: `docs/bug_report/BUG-NNN-{slug}.md` (6하원칙 + INDEX.md)

```
QA 해줘 → 자동 실행
버그 찾아줘 → 자동 실행
```

#### investigate

버그 증상만 설명하면 근본 원인을 찾아냅니다. "근본 원인 없이 수정 금지" 철칙을 강제합니다.

```bash
/investigate 로그인 후 토큰이 바로 만료됨
```

4단계 프로세스: 증상 → 분석 → 가설 → 검증 → 수정 지점 특정

#### healer

bug-report로 생성된 리포트를 읽고 자동으로 버그를 수정합니다.

```bash
/healer BUG-001
버그 고쳐줘
이 버그 수정해줘
```

TDD red-green 사이클:
1. 버그 재현 (RED)
2. 근본 원인 분석
3. 외과적 수정
4. 코드 리뷰 (blocking)
5. 재현 확인 (GREEN)
6. 회귀 체크
7. 영구 회귀 테스트화

---

### 코드 품질 / 검수

| 스킬 | 설명 | 자동 트리거 |
|------|------|------------|
| `codex-review` | OpenAI Codex(gpt-5.5) 2차 리뷰 게이트 | P3/P5/P6/P7 자동 |
| `forge-check-security` | 15-phase OWASP+STRIDE 보안 스캔 | P6 T6 보안 게이트 |
| `spec-compliance-checker` | Spec ↔ 코드 추적성 검증 | P5 Check 5.5 |
| `inspection-checklist` | P5+P6 통합 최종 검수 체크리스트 | PR 직전 |
| `screenshot-analyze` | Gemini Vision UI 스크린샷 분석 | 수동 |

#### codex-review

OpenAI Codex(gpt-5.5)를 경유한 2차 리뷰 게이트입니다. Claude 1차 리뷰 후 동일 모델 맹점을 보완합니다.

**스테이지별 자동 호출**:

| 스테이지 | 호출 시점 | Blocking |
|----------|----------|---------|
| `plan` | Spec/Plan 작성 후 (P3) | blocking |
| `code` | 코드 변경 PR (P5) | 권고 |
| `test` | E2E 시나리오 작성 후 (P6) | 권고 |
| `final` | PR 머지 직전 (P7) | **blocking** (high effort) |
| `bugfix` | 버그 수정 patch 후 | 수동 |

OAuth 모드 사용 시 **비용 $0** (ChatGPT 구독 사용).

#### forge-check-security

15단계 심층 보안 감사를 수행합니다.

```bash
/forge-check-security
/forge-check-security --path src/
```

감사 항목: OWASP Top 10 · CI/CD 보안 · STRIDE 위협 모델 · 익스플로잇 패턴 · 최신 트렌드

출력: `docs/qa/security-report.md` (CRITICAL/HIGH/MEDIUM/LOW + PASS/WARN/FAIL)

#### spec-compliance-checker

Spec 문서와 구현 코드 간 추적성(Traceability)을 검증합니다.

검증 항목:
- FR별 구현 파일 매핑 (모든 요구사항이 코드에 존재하는지)
- 테스트 존재 여부 (각 FR에 테스트 있는지)
- API 계약 일치 (Spec vs 실제 엔드포인트)
- 데이터 모델 일치

출력: PASS/WARN/FAIL JSON 리포트

---

### 복잡한 구현 / 자동화

| 스킬 | 설명 |
|------|------|
| `forge-pge` | Planner-Generator-Evaluator 하네스 |

#### forge-pge

복잡한 구현을 Planner-Generator-Evaluator 3단계로 자동화합니다.

- **Planner**: 구현 계획 수립
- **Generator**: 코드 생성 (메인 컨텍스트)
- **Evaluator**: 독립 검수 (subagent 격리 — self-grade 방지)

QA/버그/마이그레이션 이외의 복잡한 구현에 사용합니다.

---

### 기획 (PM/기획자, v0.2.0 흡수 — 구 forge-plan)

| 스킬/커맨드 | 사용법 | 설명 |
|------------|--------|------|
| `/spec-write` | `/spec-write <기능명>` | Spec 문서 작성 |
| `/forge-spec` | `/forge-spec <기능 설명>` | Spec 작성 단독 실행 (옛 /sdd Phase 0~2) |
| `/prd` | `/prd <제품명>` | PRD 작성 |
| `/forge-plan` | `/forge-plan` | 기획 파이프라인 실행 |
| `writing-plans` | `/writing-plans` | Spec/요구사항 문서를 TDD 지향의 세분화 구현 계획으로 전환 |
| `requirements-clarity` | `/requirements-clarity` | 모호한 요구사항을 Why?(YAGNI)/Simpler?(KISS) 대화로 명확화 |
| `autoplan` | `/autoplan <목표>` | 기획서를 CEO/Design/Engineering 3관점 리뷰 + Synthesizer 종합 |

#### writing-plans

Spec이나 요구사항 문서를 실제 구현에 착수하기 전, 바이트 크기 단위의 TDD 지향 구현 계획으로 전환합니다. 정확한 파일 경로·2~5분 단위 스텝·명시적 테스트 검증 절차를 포함합니다.

#### requirements-clarity

모호한 요구사항을 Why?(YAGNI)/Simpler?(KISS) 중심 대화로 명확화해 점수화된 PRD로 정리합니다. 명확한 재현 절차가 있는 버그 수정, 구체적 파일·함수를 지목한 변경, 오타·한 줄 수정에는 사용하지 않습니다.

#### autoplan

기획서를 CEO(비즈니스)→Design(UX)→Engineering(기술) 3관점 순차 리뷰 + Synthesizer 종합 + 독립 Evaluator 검증(5-Wave)으로 처리합니다. Phase 3 에이전트 회의 후 자동 트리거됩니다.

---

## 커맨드 목록

### 개발 파이프라인

| 커맨드 | 설명 | Phase |
|--------|------|-------|
| `/forge-implement` | Spec 기준 구현 + 빌드/린트 통과 게이트 | P5 (P8 진입) |
| `/forge-qa` | QA phase 실행 | P6 |
| `/forge-fix <이슈설명>` | Hotfix 흐름으로 버그 빠르게 처리 (AD-95) | — |
| `/forge-pr` | PR 생성 + cr-final 검수 + 머지 | P7 |

```bash
# 전형적인 구현 흐름
/forge-implement    # Spec 기반 구현
/forge-qa           # QA 실행
/forge-pr           # PR 생성·머지
```

### 기획 파이프라인 (v0.2.0 흡수 — 구 forge-plan)

| 커맨드 | 설명 | Phase |
|--------|------|-------|
| `/spec-write` | Spec 문서 작성 | P3 |
| `/forge-spec` | Spec 작성 단독 실행 (옛 /sdd Phase 0~2) | P3 |
| `/prd` | PRD 작성 | P2~P3 |
| `/forge-plan` | 기획 파이프라인 실행 | P3 |

```bash
# 전형적인 기획 흐름
/forge-spec 사용자 알림 기능    # Spec 작성
/forge-implement                # 구현 진입
```

### 검수 커맨드

| 커맨드 | 설명 | Check |
|--------|------|-------|
| `/forge-check-traceability` | 추적성 검수 독립 실행 | 8.5 |
| `/forge-check-ui` | UI/UX 품질 검수 독립 실행 | 8.6 |
| `/forge-check-security` | 보안 검수 독립 실행 | 8.8 |
| `/forge-design-review` | 디자인 검수 facade (forge-check-ui → visual-loop) | — |
| `/codex-review <파일>` | Codex 단독 2차 리뷰 | 모든 단계 |

### 배포 / 운영

| 커맨드 | 설명 |
|--------|------|
| `/forge-staging` | develop → staging 배포 |
| `/forge-deploy` | staging → prod 배포 파이프라인 (Phase 11~12) |
| `/forge-release` | 릴리스 브랜치 생성 + Release MR |
| `/forge-develop` | prod 머지 후 main→develop 동기화 |
| `/forge-rollback` | 프로덕션 롤백 (L1 Quick / L2 Release / L3 Hotfix Forward) |
| `/forge-dev-undo` | 마지막 개발 액션 롤백 |

---

## 에이전트 목록

forge-build 설치 시 다음 전문 에이전트들이 활성화됩니다. (v0.2.0부터 axis-* 감사 에이전트는 `forge-core`로 이동 — 시스템 감사는 forge-core의 `/system-audit`를 사용하세요.)

### 기획 에이전트 (v0.2.0 흡수 — 구 forge-plan)

| 에이전트 | 역할 |
|---------|------|
| `spec-writer-base` | Spec 문서 작성 전문가 — Constitution 기반 정확한 형식의 Spec 생성 |
| `cto-advisor` | Forge S4(Phase 4) 기술 검토 전문 — 아키텍처·API·데이터모델·보안·성능·테스트전략·기술부채 7축 |

### QA / 검수 에이전트

| 에이전트 | 역할 |
|---------|------|
| `canary-judge` | canary 모니터링 결과 자동 판정 (PASS/WARN/FAIL) |
| `code-reviewer` | 코드 변경 리뷰 (correctness·보안·best practices) |
| `healer` | QA 버그 리포트 기반 자동 버그 수정 |
| `performance-checker` | 백엔드 API 성능 품질 정적 분석 |
| `ui-quality-checker` | UI/UX 품질 검증 (Lighthouse/a11y MCP 연동) |

---

## 빠른 시작

```bash
# 버그 수정 흐름
/investigate 결제 시 중복 청구 발생
/healer BUG-001

# API 테스트
/api-e2e docs/openapi.yaml --base-url http://localhost:8080

# 보안 검수
/forge-check-security

# 전체 QA 파이프라인
/forge-qa

# PR 생성
/forge-pr
```

---

## 파일 구조

```
forge-build/
├── .claude-plugin/
│   └── plugin.json             — 플러그인 매니페스트 (v0.2.0)
├── skills/                     — 19개
│   ├── api-e2e/                — REST API E2E 자동 테스트
│   ├── benchmark/              — 성능 벤치마크
│   ├── bug-report/             — 웹앱 버그 탐지
│   ├── canary/                 — 배포 후 헬스 모니터링
│   ├── codex-review/           — Codex 2차 리뷰 게이트
│   ├── forge-check-security/   — OWASP+STRIDE 보안 스캔
│   ├── healer/                 — 자동 버그 수정
│   ├── inspection-checklist/   — P5+P6 통합 체크리스트
│   ├── investigate/            — 근본 원인 분석
│   ├── forge-pge/              — Planner-Generator-Evaluator
│   ├── playwright-cli/         — 브라우저 자동화
│   ├── playwright-parallel-test/ — 3-way 병렬 UI 테스트
│   ├── qa/                     — QA 전 사이클 오케스트레이터
│   ├── qa-setup/               — QA 하네스 부트스트랩
│   ├── screenshot-analyze/     — Vision 기반 UI 분석
│   ├── spec-compliance-checker/ — Spec-코드 추적성 검증
│   ├── autoplan/               — 기획서 3관점 리뷰 + Synthesizer (구 forge-plan)
│   ├── requirements-clarity/   — 요구사항 명확화 (구 forge-plan)
│   └── writing-plans/          — Spec → TDD 구현 계획 전환 (구 forge-plan)
├── commands/                   — 21개 슬래시 커맨드 (spec-write/forge-spec/prd/forge-plan 포함)
└── agents/                     — 7개 전문 에이전트
    ├── canary-judge.md
    ├── code-reviewer.md
    ├── cto-advisor.md          — (구 forge-plan)
    ├── healer.md
    ├── performance-checker.md
    ├── spec-writer-base.md     — (구 forge-plan)
    └── ui-quality-checker.md
```

---

## Changelog

### v0.2.0 (2026-07-07)
- `forge-dev` → `forge-build` 개명
- 구 `forge-plan`(spec-write/forge-spec/prd/forge-plan/writing-plans/requirements-clarity/autoplan) 통합
- axis-* 감사 에이전트 5종 → `forge-core`로 이동
- `cto-advisor`·`spec-writer-base` 에이전트 신규 편입

### v0.1.4 (2026-06-23)
- workflow.js 동기화 확인 완료
- gemini-text MCP 레그 정합 업데이트

### v0.1.0 (2026-06-02)
- forge-dev 최초 패키징
- 16개 스킬 + 10개 에이전트 번들
