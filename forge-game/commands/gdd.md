---
description: Game Design Document(GDD) 작성 — 게임 아이디어를 입력하면 S1/S2 기반 GDD 완성본 생성
argument-hint: <게임 아이디어 또는 프로젝트명>
allowed-tools: Read, Write, Edit, WebSearch, WebFetch, Glob, Grep
model: sonnet
group: plan
---
> **⚠️ 실행 모드 확인**: 이 커맨드는 쓰기 모드에서만 정상 동작합니다. Plan mode 감지 시 즉시 [STOP] — "Escape로 plan mode 해제 후 재실행하세요. 내부 [STOP] 게이트가 승인 지점입니다."


당신은 gdd-writer 에이전트의 전문성을 활용하는 게임 기획 전문가입니다.

## 게임 아이디어
$ARGUMENTS

## 수행 절차

1. **forge-workspace.json 확인**: `forge-workspace.json`에서 프로젝트 경로 해석
2. **기존 문서 확인** (M5 모드 판정): `{folderMap.product}/projects/{project}/` 하위에서 S1 리서치, S2 컨셉, 기존 GDD 문서 존재 여부 확인
   - **자산 존재 → 검증·보강 모드**: ① Import(기존 문서 SSoT 채택, 신규 화면 ID 금지) ② Verify(coverage·orphan·기능셋 1:1·조건전환 포맷) ③ Augment(normalize 자동 / derive → [STOP] 1회, `ai-inferred` 태그) ④ Output(출처 태깅). 비파괴.
   - **자산 전무 → 신규 생성 모드**: 3단계부터 진행
3. **GDD 템플릿 로드**: `{folderMap.templates}/gdd-template.md` 참조
   - **질의 규약 필수** (사용자 확인이 필요한 모든 지점): `${FORGE_ROOT:-$HOME/forge}/.claude/rules-on-demand/grilling-protocol.md` — 질문은 **한 번에 하나씩**, 각 질문에 **권고안 + 근거 1줄** 동반, 확인 가능한 **사실은 묻지 말고 직접 조사**.
4. **시장 검증**: 유사 게임/경쟁작 조사 (출처 URL, 날짜 포함)
4.5. **(Phase 2 skip 시) 5요소 체크리스트 작성**: `gate-log.md`에 페르소나·가치제안·Moat·가격·위험 5요소 각각 = `충족` + 근거 1줄 기록. 1개라도 미충족 → **[STOP]** (Phase 2 진행 권고)
5. **에이전트 회의 (5관점 3라운드) → GDD 초안 작성**: 게임 특화 5관점 병렬 스폰
   - Round 1: 전략가·사용자 옹호자·기술 아키텍트·비판자·**플레이어** 독립 초안 (병렬, 게임=5명)
             → 탈락 필터: Phase 2 완료 시 = Don't 태그 위반 초안 탈락 / Phase 2 skip 시 = 4.5의 5요소 체크리스트 미반영 초안 탈락
   - Round 2: 교차 크리틱 — 각 에이전트가 타 관점 반박·보완
   - Round 3: Lead가 수렴 → 최적안으로 GDD 초안 완성. **필수: GDD 파일 상단(제목 다음 줄)에 `admin_required: true|false` + 섹션 "핵심 화면 목록"(표: 화면 ID(kebab-case 영문, 고유) | 화면명 | 1줄 목적) + "기능 우선순위(MoSCoW)"**
     - 구현 가능 수준의 상세도 (개발자가 바로 구현 시작 가능)
     - 수치 명시 ("적당한" 대신 구체적 수치/범위)
     - 모든 화면 전환, 유저 액션을 플로우차트 수준으로 기술
     - 밸런싱 수치의 의도와 근거 함께 기술
     - 기능 우선순위 = MoSCoW (Must / Should / Could / Won't) — RICE는 게임에 비적합, MoSCoW로 대체
     - `admin_required` = 운영자/관리자 콘솔 기능 포함 여부 (Phase 4 게이트가 이 플래그로 s4-admin-detailed-plan.md 필수 여부 판정)
     - **기능별 4 필수산출**: 각 Must 기능에 UX 플로우차트(조건분기 포함)·acceptance_predicate·에러UI·테스트시나리오 포함 (출력 형식 §기능별 상세 명세 참조)
   - `{folderMap.templates}/agent-meeting-template.md` 형식 비교표 포함 + GDD 최상단 "에이전트 회의 결과" 섹션
   - 충돌 해소 불가 → **[STOP]**
   - 산출물: `YYYY-MM-DD-s3-gdd.md` (초안 — admin_required 헤더 + MoSCoW + 핵심 화면 목록 표 포함된 완성본)
6. **[MANDATORY — 건너뛰기 금지] /autoplan 3관점 리뷰**: GDD 초안 완성 직후 반드시 실행.
   - 입력: 단계 5의 GDD 초안 (핵심 화면 목록 포함)
   - CEO(비즈니스) → Design(UX) → Engineering(기술) 순서로 검토 + 어노테이션(AGREE/WARN/BLOCK)
   - **BLOCK ≥1 → GDD 수정 후 `/autoplan` 재호출** (반복 3회까지). 3회 후에도 BLOCK 잔존 → **[STOP]**
   - BLOCK 0건 → 어노테이션 GDD 반영 후 단계 7로 진행
7. **[BLOCKING] /codex-review --stage plan**:
   - `/codex-review --stage plan --target <YYYY-MM-DD-s3-gdd.md 경로> --blocking`
   - 호출 횟수: 최초 1회 + FAIL 시 수정 재호출 최대 2회 (총 3회). 3회 후에도 FAIL → **[STOP]**
   - 결과: `forge-outputs/docs/reviews/plan/{date}-{slug}.{md,json}`
8. **디자인 방향 + 시안**:
   - Human이 방향 정의 (텍스트 서술 또는 참고 URL·이미지)
   - 참고 URL·이미지 제공 시: `/screenshot-analyze` → 스타일 키워드 추출 (URL = https 공개 출처만 / 이미지 ≤10MB, PNG·JPG·WEBP, EXIF 제거, PII·시크릿 금지 → 위반 입력 폐기. 출처·라이선스 = style-guide에 기록)
   - `/style-forge` → `YYYY-MM-DD-s3-style-guide.md`
   - Human: `claude.ai/design`에서 시안 생성 → `s3-mockup/{화면 ID}.{png|fig}` (핵심 화면별 1개 이상, 누락 = [STOP])
     - Claude Design 접근/생성 실패 1회 기록 후 Fallback: Stitch MCP로 목업 export (png/fig만, 코드 산출물 폐기, Human 통보)
   - 검수: `/forge-check-ui` (**blocking** — CRITICAL ≥1 시 `/visual-loop` 1사이클 후 재검수, 최대 2사이클, 이후 잔존 → [STOP])
9. **(Human 요청 시만) PPT 변환**: `/pptx` 스킬로 .pptx 생성
10. **저장**: `{folderMap.product}/projects/{project}/YYYY-MM-DD-s3-gdd.md` (+ s3-style-guide.md, s3-design-prompt.md, s3-mockup/) 저장

## 기능별 상세 명세 출력 형식 (**4 필수산출 — Must 기능 전수**)
> 아래 4개 요소를 각 Must 기능별로 반복 작성한다. Should/Could는 UX 플로우차트만 최소 작성.

### {기능명}
#### UX 플로우차트 (조건별)
```
[시작] → 화면A
  ├ 성공 → 화면B
  └ 에러: {에러유형} → {처리방식: 인라인/팝업/토스트}
```
#### acceptance_predicate (FR별)
| FR | GIVEN | WHEN | THEN |
|---|---|---|---|
| FR-01 | | | |
#### 에러UI 정의
| 에러 유형 | 발생 조건 | UI 처리 | 복구 액션 |
|---|---|---|---|
#### 테스트 시나리오
| # | 시나리오 | 입력 | 기대 결과 |
|---|---|---|---|

## Iron Laws

- S3-1: 단일 에이전트 초안만으로 GDD 확정 금지 (게임 5관점 3라운드 에이전트 회의 필수)
- S3-2: `YYYY-MM-DD-s3-style-guide.md` + `s3-mockup/`(핵심 화면 전수) 없이 Check 3 승인 금지
- S3-3: `/autoplan` BLOCK ≥1 또는 `/codex-review --stage plan` FAIL 상태로 Check 3 진입 금지
- S3-4: GDD에 "핵심 화면 목록" + "기능 우선순위(MoSCoW)" 섹션 없이 Check 3 승인 금지

## 완료 후 안내

GDD 작성 완료 시 다음을 안내:
1. GDD + 스타일 가이드 + 시안 리뷰 요청 (S3 [STOP] 게이트)
2. `.pptx` 변환 필요 여부 확인 (선택)
3. 승인 시 S4 기획 패키지 진행 안내
