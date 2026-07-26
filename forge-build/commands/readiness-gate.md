---
description: "Readiness 판정 공통 헬퍼 — forge-plan/spec/implement Phase 0 공유. 4-state 게이트 + GUIDE-STOP 산출기 + ADAPT 처리 규칙."
---

# Readiness Gate — 공통 헬퍼

forge-plan / forge-spec / forge-implement Phase 0에서 공유하는 진입 게이트 로직.
침묵 종료(exit 1 무피드백)·generic-AI fallback·absent 날조 전부 금지.

## 입력 수용 (3종)

| 형태 | 처리 |
|------|------|
| 파일경로 (`--spec <path>` / `--plan <dir>`) | 파일 Read → 요소별 스캔 |
| 인라인텍스트 (기능 설명 직접 입력) | 텍스트 분석 → 요소별 스캔 |
| 디렉토리 (`--bulk <dir>`) | 디렉토리 내 문서 전체 통합 스캔 |

## 4-state 판정 규칙

| 상태 | 의미 | 판정 기준 |
|------|------|---------|
| `ok` | 요건 완전 충족 | 내용·형식 모두 있음 |
| `normalize` | 내용 있음, 형식 변환 필요 | 재료 O, ID체계·통합·정량화 필요 / 실측 있으나 Spec 범위 대비 커버 불완전 |
| `derive` | 재료로 추론 가능, 명시 없음 | 기존 문서에서 추론 가능 (예: AC ← 테스트전략) |
| `absent` | 재료 자체 없음 / 인간결정 필요 | 문서 전무 / 외부작업 필요 / 수치 미결정 |

## 라우팅

```
if absent.count == 0 and derive.count == 0 and normalize.count == 0:
  → PASS  (기존 Phase 1+ 즉시 진행)
elif absent.count == 0:
  → ADAPT (normalize 자동처리 → derive [STOP] 1회 → Phase 1+ 진행)
else:
  → GUIDE-STOP (absent 항목 보강 작업지시서 + {stage}-readiness-{date}.md 저장 후 정지)
```

GUIDE-STOP 시 normalize는 **보류** — stage가 absent로 어차피 막히므로 미리 변환해도 무의미(낭비). absent 보강 후 재호출 시 normalize 자동처리 + 재판정. (결정 2026-06-20: GUIDE-STOP 분기에서 normalize 선실행 안 함. ADAPT 분기에서만 normalize 실행.)

## ADAPT 처리

### normalize (무승인 자동 변환)

- FR-ID 없음 → FR-NN-001 체계 부여 (인접 도메인 패턴 차용)
- 분산 API 문서 → 단일 통합 수집
- 서술형 검증기준 → 정량 PASS 조건 변환
- 실측 커버리지 불완전 (Spec 범위 테이블/컴포넌트 중 일부만 읽음) → 미커버 항목 자동 추가 실측 후 박제
- 결과 1줄씩 출력 후 계속

### derive (ai-inferred 태깅 + [STOP] 1회)

derive 항목 전부 수집 → 초안 생성 → **[STOP] 1회 일괄 확인**:

```
[ADAPT] 추론 초안 확인 후 진행:
• {요소}: {추론 근거} → {초안 내용} [vetted_by: ai-inferred]
확인 → 진행 / 수정 → 수정 후 재실행
```

derive 항목에 `vetted_by: ai-inferred` 태그 부착 필수 (다운스트림 QA/PR 인식용).

**stale 실측 의심 (derive 처리)**: 스키마 SSoT 파일이 수동 마이그레이션 관리 프로젝트(Migrations/*.sql 등 별도 마이그레이션 파일 존재)인 경우 → 파일 Read만으로 `ok` 금지. "이 파일이 현재 배포 DB 상태를 반영하는가?" [STOP] 1회 확인. 확인 → `ok` / 불확실 → 최신 Migrations 파일 Read 대조 권고 후 차이 있으면 WARN 명시.

## GUIDE-STOP 산출기 — 보강 작업지시서

stdout + `{stage}-readiness-{date}.md` (프로젝트 `.specify/` 또는 루트 저장):

```
🟡 {stage} 진입 보류 — 요건 {N}개 중 {M}개 부족 (자동보완 {K}개 처리완료)

[자동 처리됨] normalize {n1}건, derive {n2}건
  {normalize·derive 목록}

[보강 필요] absent {M}건:
  • {요소}: {왜 부족} → {정확히 무엇을 추가} → {어디에 추가} → 담당: {사용자결정|외부작업|AI재실행}

재호출: 보강 완료 후 `/{stage} {args}` 다시 실행 → 진행
```

**각 absent 항목 = "무엇을·어디에·누가" 3요소 필수. "더 자세히 작성하세요" 류 모호 가이드 금지.**

## M5 검증·보강 모드 (자산 존재 감지 시)

forge-plan/gdd/prd에서 기존 자산 탐지 시 자동 진입.

### 자산 감지 기준
- `{domain}/00-도메인개요.md` 또는 `s3-prd.md`/`s3-gdd.md` 기존 파일 존재
- 또는 `{domain}/_registry.yaml` 존재
- 또는 `_product.yaml` 존재 (domains≥2 프로젝트 — P2 additive, advisory)

### 모드 전환
| 자산 상태 | 모드 | 처리 |
|----------|------|------|
| 기존 자산 존재 | **검증·보강** | Import→Verify→Augment→Output (비파괴) |
| 자산 전무 | **신규 생성** | 전체 생성 흐름 진행 |

### delta 검증 순서 (검증·보강 모드)
1. **Import**: 기존 문서 SSoT 채택. 신규 화면 ID 추가 금지.
2. **Verify**: coverage·orphan·기능셋 1:1·조건전환 포맷 체크
3. **Augment**: normalize 자동 / derive → [STOP] 1회, `ai-inferred` 태그
4. **Output**: 출처 태깅 (기존 vs 신규 추가 구분)

### 대체형(Substitution) 추출 규칙
Figma/이미지 시안을 다른 자산으로 대체하는 경우:
| 대체 자산 | 대체 가능 조건 | 신뢰도 |
|---------|------------|-------|
| HTML/CSS 코드 | style-guide + 화면정의 동시 존재 | MEDIUM |
| 스크린샷(.png/.webp) | 화면 ID 1:1 매핑 확인 | HIGH |
| Figma export(.fig) | 화면 ID 포함 | HIGH |
| 서술형 UI 명세 | 화면 레이아웃 항목 포함 | LOW |

LOW 신뢰도 대체형 = 도메인 폴더 `_registry.yaml`에 `substitute: low` 태그 기록 → Phase 5 이후 실 시안으로 교체 권고.

### orphan 심각도
| orphan 유형 | 심각도 | 처리 |
|-----------|--------|------|
| 기능 orphan — 기능명세에 없는 FR/화면 | **FAIL** | 차단 + 보강 작업지시 |
| visual asset orphan — registry 미등록 mockup 파일 | **WARN** | 계속 + 목록 보고 |
| spec orphan — 기능명세에 spec_ref 없음 | **WARN** | 계속 + [STOP] 요청 |
| _product.yaml 없음 (domains≥2) | **WARN (advisory)** | 계속 — 생성 권고, 차단 불가 (P2 additive) |

## 금지 행동 (§2.1 — Iron Rule)

- ❌ 침묵 종료 — absent 있을 때 무피드백 exit 금지
- ❌ generic-AI fallback — 게이트 미충족인데 "일반 AI 기능으로 진행" 금지
- ❌ absent 날조 — 없는 재료를 AI가 지어내 진행 금지

## 진입 계약 (단계별)

### forge-plan 진입 계약 (P3 진입용)

> **적용 범위 (스코프 가드 — P5)**: **greenfield 한정** — brownfield(임의 legacy 코드/도메인 역설계·retrofit)는 본 파이프라인 범위 밖, 별도 `migration-audit` 트랙.
> **단 기존 Forge P2/P3 산출물의 delta 검증·보강(M5)은 유효**(범위 내) — M5 검증·보강 모드가 이 경로를 처리한다.
> 즉: "기존 Forge 산출물 보강 = in-scope / 임의 legacy retrofit = out-of-scope"

| ID | 요소 | ok 조건 |
|----|------|---------|
| A | P2 기획서 | s3-prd.md / s3-gdd.md 또는 동등 기획 문서 |
| B | 스타일가이드 | 디자인 원칙·컬러·타이포 (s3-style-guide 또는 동등) |
| C | 목업/와이어프레임 | 핵심 화면 레이아웃 (s3-mockup/ 또는 동등) |
| D | 기능 기준선 | P2 FR 초안 또는 기능 목록 |

### forge-spec 진입 계약 (P4 진입용 — 8요소)

| ID | 요소 | ok 조건 |
|----|------|---------|
| A | 목표·범위 | 기능 목적 + 사용자 + 경계 명시 |
| B | FR 목록 | FR 목록 + FR-ID 체계 |
| C | 인수기준 | 각 FR acceptance_predicate |
| D | 화면/UI | 화면 정의 또는 UI 흐름 + **FE 실측 근거 첨부** (기존 FE 코드베이스 수정 시). 기존 컴포넌트·라우팅·스타일 의존인데 실측 근거 없음 → `absent` |
| E | 데이터모델 | 핵심 테이블/엔티티 명세 + **실측 근거 첨부** (스키마 소스 스니펫 또는 live query 출력). DB 의존 기능에서 실측 근거 없음 → `absent` |
| F | API 계약 | EP 목록 + 요청/응답 스키마 + **FE API 실측 근거 첨부** (기존 API 라우트 수정 시). 기존 라우트 구조 미확인 → `absent` |
| G | 개발계획 | WBS + 세션 로드맵 또는 아키텍처 |
| H | NFR | 성능·보안 수치 명시 (p95, TPS, RBAC) |

> **[스키마 실측 게이트 — E(데이터모델)]** DB 스키마 의존 기능: 스키마 SSoT 파일(Schema.cs / Prisma schema.prisma / TypeORM entity / Unity SO 등) 스니펫 또는 live query(`SHOW COLUMNS` / `DESCRIBE` / `\d`) 출력이 실측 근거로 첨부돼야 `ok`. 실측 근거 없으면 해당 항목 `absent` → GUIDE-STOP. 순수 UI·문서 Spec(DB 스키마 미의존)은 `ok` N/A 통과.
> - **불완전 실측**(Spec 범위 테이블 중 일부만 읽음) → `normalize`(미커버 항목 자동 추가 실측). **stale 의심**(수동 마이그레이션 프로젝트) → `derive` [STOP] 1회.
> - **SSoT 불명확**(경쟁 소스 — Schema.cs vs Migrations vs live DB 내용 불일치) → `absent` → GUIDE-STOP: 경쟁 소스 목록 나열 + "어느 것이 현재 권위 소스인지 결정하라" Human 요청. AI 임의 SSoT 선택 금지 — absent 날조(§2.1)와 동등.
>
> **[FE 리소스 실측 게이트 — D(화면/UI) · F(API 계약)]** 기존 FE 코드베이스(컴포넌트·라우팅·스타일·API 라우트) 수정을 포함하는 기능: 해당 영역 실측 근거 첨부 필수.
> - D(화면/UI): `components/` 구조 스니펫 / `globals.css`·`tailwind.config.js` CSS 변수 / Next.js `app/` 또는 `pages/` 라우팅 트리 (`find app/ -name "*.tsx" -o -name "page.tsx"` 출력 등)
> - F(API 계약): Next.js `app/api/` 또는 `pages/api/` 라우트 목록 / 기존 엔드포인트 파일 Read 스니펫
> - 실측 형태: 관련 파일 Read 스니펫 또는 `find`·`ls` 트리 출력. `source: <파일경로> @ <date>` 태그 동반.
> - **감지 기준**: 기존 파일 경로(components/xxx.tsx, pages/xxx, app/api/xxx) 변경·import 포함 = 수정(실측 필수). 완전 신규 경로 파일만 추가 + 기존 공용 스타일/컴포넌트 미재사용 = 신규(N/A 통과).
> - **N/A 정밀화**: 기존 tailwind 설정·공용 컴포넌트·디자인시스템 재사용 예정이면 신규 기능이라도 FE 실측 필수("신규라서 생략" 주관 판단 금지).
> - **SSoT 불명확**(중복 컴포넌트/라우팅 버전 혼재 — 예: Button.tsx vs ButtonV2.tsx) → 경쟁 파일 목록 나열 후 GUIDE-STOP. AI 임의 선택 금지.

### forge-implement 진입 계약 (P5 진입용)

| ID | 요소 | ok 조건 |
|----|------|---------|
| A | Spec 파일 | .specify/specs/*.md 존재 + INDEX 등재 |
| B | FR + AC | 각 FR acceptance_predicate 필수 |
| C | 태스크 분해 | §8 커밋단위 태스크 + 검증기준 |
| D | API 명세 | EP 목록 + 스키마 |
| E | 데이터모델 | 테이블/타입 + Spec §데이터모델 provenance 태그 포함 확인 (P4 실측 근거 전파) |
| F | 보안 | 인증·인가·입력검증 |
| G | NFR | 측정가능 수치 |
| H | Phase 상태 | phase4_complete 또는 phase5_pending |

### forge-design 진입 계약 (P2 진입용 — 경량 3요소)

| ID | 요소 | ok 조건 |
|----|------|---------|
| A | 컨셉/목표 | 만들려는 것의 목적·아이디어 언급 |
| B | 타깃 사용자 | 누구를 위한 기능인지 명시 또는 유추 가능 |
| C | 문제정의 | 해결하려는 문제·필요 언급 |

⚠️ 경량 게이트: 3요소 중 1개+ ok/derive = PASS. 전부 absent(완전 공백)만 GUIDE-STOP. PRD/GDD 수준 사전 요구 금지.

### forge-qa 진입 계약 (P6 진입용)

| ID | 요소 | ok 조건 |
|----|------|---------|
| A | 구현 코드 | P5 구현 결과물(소스코드) 존재 |
| B | 시나리오 정의 | QA 시나리오 기술 가능 (스펙·FR 기반) |
| C | 서버 기동 | 앱 실행 가능 (서버 기동 가능 상태) |
| D | QA 스코프 | 테스트 대상 기능·범위 특정 가능 |

P5(`forge-implement`) 미완료 → 구현코드 absent → GUIDE-STOP: "P5 구현 완료 후 재호출"

## M7 단계 전이 게이트 (P2→P3→P4만 적용)

forge-design(P2) / forge-plan(P3) / forge-spec(P4) 전환 시 EXIT self-check + `{stage}-exit-readiness.md` 자동생성.

### EXIT self-check 실행 조건
각 Phase의 마지막 단계(Check gate 통과 직전) 자동 실행. 생성한 `{stage}-exit-readiness.md`가 PASS여야 다음 Phase 진입 허용.

### EXIT self-check 항목

| Stage | EXIT 검사 항목 | FAIL 기준 |
|-------|------------|---------|
| **P2 (forge-design)** | ① s3-prd/gdd 존재 ② s3-style-guide 존재 ③ s3-mockup/ 존재 ④ admin_required 헤더 선언 | 항목 1개+ absent |
| **P3 (forge-plan)** | ① 도메인 폴더 구조 완성 ② _registry.yaml 존재 ③ M3 gate PASS ④ Check 4 전체 PASS ⑤ _STATUS.md P3_DONE | 항목 1개+ 미충족 |
| **P4 (forge-spec)** | ① .specify/specs/*.md 존재 ② FR 전수 acceptance_predicate ③ codex-review PASS ④ conflict-detection PASS | 항목 1개+ 미충족 |

### `{stage}-exit-readiness.md` 자동생성 템플릿

저장 경로: `{project-root}/.specify/{stage}-exit-readiness-{date}.md`

```markdown
# {Stage} EXIT Readiness — {date}

## 판정: PASS | FAIL

## EXIT self-check 결과
| # | 항목 | 상태 | 비고 |
|---|------|------|------|
| 1 | {항목} | ✅/❌ | |

## 진입 계약 — {다음 Stage}
→ /readiness-gate 진입 계약 ({다음 stage}) 기준:
| ID | 요소 | 4-state | 비고 |
|----|------|---------|------|

## Advisory checkpoints (P5 computed 트리거 — 소멸 방지)
> forge-plan Step 6-M7-P5에서 `registry_gate.py --product` 실행 결과를 여기에 기록.
> advisory(blocking 아님) — 실행 후 소멸 방지를 위해 이 파일에 보존.

| 항목 | 값 | 비고 |
|------|-----|------|
| p4_review_recommended | true / false | domains≥2이면 true |
| p4_review_reasons | {이유 목록} | |
| ddd_activation_recommended | true / false | domains≥2이면 true (opt-in) |
| ddd_reasons | {이유 목록} | |
| p4_trigger_status (각 도메인 _STATUS.md 기록) | PENDING / ACTIVE / BYPASSED | |

## 판정 상세
- PASS: 다음 Phase 진입 허용. `{domain}/_STATUS.md` `stage: {next_stage}_READY` 기록.
- FAIL: [STOP] + absent 항목 보강 작업지시.
```

sufficiency bar + substitution matrix는 각 Phase의 진입 계약 §M5 / §orphan 심각도 기준 적용.
FAIL 항목이 substitution matrix LOW 대체형만인 경우 = WARN 강등(FAIL 아님) + `substitute: low` 태그.

## M8 변경 관리 + 재진입 (P2~P4만 적용)

P2/P3/P4 문서 변경 시 하위 Phase 영향 범위 전파 + stale 감지. impl(P5)·qa(P6) → 상위 재진입은 backlog (이번 범위 외).

### 변경 발생 시 흐름

```
변경 탐지 → 영향 범위 매핑 → change ledger 기록 → stale 표시 → 최소 재진입
```

### impact scope 매트릭스 (변경 발생 Phase → stale 대상)

| 변경 Phase | stale가 되는 하위 항목 |
|-----------|---------------------|
| P2 (기획서 변경) | P3 전체 (도메인 폴더·_registry·기능명세·M3·M4 전부), P4 Spec |
| P3 _registry.yaml 변경 | M3 gate 재실행, 기능명세/ 해당 파일, P4 Spec |
| P3 기능명세/01-*.md 변경 | M4 조건별 전환 포맷 재체크, P4 Spec (해당 FR/AC) |
| P4 Spec 변경 | {stage}-exit-readiness.md 무효화 → M7 재실행 필요 |

### change ledger

변경 발생 시 `{domain}/_STATUS.md` "변경 이력" 섹션에 append:

```markdown
## 변경 이력
| 날짜 | 변경 파일 | 변경 유형 | stale 대상 | 전파 상태 |
|------|---------|---------|-----------|---------|
| {date} | {파일} | 요건변경/오류수정/보강 | {stale 항목 목록} | PENDING/DONE |
```

### stale 감지 + 최소 재진입

stale 항목 존재 → 변경된 Phase의 M 서브스텝부터 재진입 (전 Phase 재시작 금지):
- P3 _registry 변경 → 1-M3 게이트만 재실행
- P3 기능명세 변경 → 1-M4 재실행
- P2 기획서 변경 → P3 Step 1 전체 재실행 (M5 검증·보강 모드 진입)

stale 전파 완료 후 `_STATUS.md` 변경 이력 `전파 상태: DONE` + 재실행된 M 스텝 기록.

## M9 세션 재진입 안전성 (resumability) — P2~P4 적용

forge-plan / forge-spec / forge-design 등 **도메인 재호출 시** 반드시 아래 규약을 순서대로 실행한다. 신규 메커니즘 신설 금지 — forge-resume / checkpoint 기존 메커니즘 재사용.

### 규약 1 — 진입 시 `_STATUS.md` read 필수

도메인 재호출(Phase 커맨드가 이미 한 번 이상 실행된 프로젝트 재진입) 즉시:

```
{domain}/_STATUS.md 존재 확인
  존재 → stage / round / 수렴상태(status) / 마지막 완료 M스텝 / in-progress 항목 파싱
  부재 → fresh 모드 (Step 1부터 신규 실행)
```

파싱 대상 필드: `stage`, `round`, `status`, `마지막 완료 M스텝(completed_steps)`, `미결 항목`.

### 규약 2 — resume vs fresh 판정

| 조건 | 판정 | 행동 |
|------|------|------|
| `_STATUS.md` 존재 + `stage` 미완(`_IN_PROGRESS` / `_BLOCKED`) | **resume 모드** | 다음 미완료 M스텝부터 재개. restart 금지 |
| `_STATUS.md` 부재 또는 `stage: (초기값/없음)` | **fresh 모드** | Step 1부터 신규 실행 |
| `_STATUS.md` 존재 + `stage: *_DONE` 또는 `*_READY` | **완료 확인** | [STOP] "이미 완료됨 — 다음 Phase 진입 또는 M8 변경관리 경로 확인" |

### 규약 3 — resume 리포트 출력 (사용자 가시 1블록 필수)

resume 모드 진입 시 아래 블록을 **반드시** 사용자에게 출력 후 작업 재개:

```
⟳ RESUME — 도메인 {domain}
  마지막 round: {round}
  완료 M스텝: {completed_steps 목록 또는 "없음"}
  다음 실행: {다음 M스텝 또는 미결 항목}
  이어서 진행합니다.
```

### 규약 4 — 멱등 재개 (완료 항목 재실행 금지)

`_STATUS.md`에 `completed_steps`로 기록된 M스텝·기능은 재실행하지 않는다. 재실행 금지 기준:
- 해당 M스텝의 산출물 파일이 실제로 존재하는지 `ls`/`Read`로 확인 (기록만으로 skip 금지 — subagent 검증 원칙 L-38 적용)
- 파일 존재 확인 후 skip. 파일 부재 시 기록 무시하고 해당 M스텝 재실행.

### 규약 5 — crash-safety: 각 M스텝 완료 즉시 `_STATUS` append

작업 경계 = 기록 경계. 각 M스텝·기능 완료 직후 즉시 `_STATUS.md`에 append:

```markdown
## 완료 이력 (completed_steps)
| M스텝 | 완료일시 | 산출물 |
|-------|---------|--------|
| {M스텝 ID} | {YYYY-MM-DD HH:MM} | {파일명} |
```

중간 크래시 발생 시 마지막 append 지점부터 재개 (규약 1~4 적용).

### 규약 6 — handover 연동

| 이벤트 | 행동 |
|--------|------|
| 세션 중간 종료 | `/checkpoint` 실행 + `_STATUS.md` 현재 stage/round/completed_steps 기록 |
| 마일스톤 완료 | `/end-sonnet` 또는 `/end-opus` 실행 + `_STATUS.md` 최종 stage 기록 |
| 재진입 | `_STATUS.md` read(규약 1) → handover 문서 read → resume 판정(규약 2) 순 |

handover 문서 경로: `${FORGE_ROOT:-$HOME/forge}-outputs/.claude/handover/{sonnet|opus}/` (기존 경로 재사용, 신규 경로 신설 금지).
