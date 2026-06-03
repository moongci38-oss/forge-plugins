---
description: "Forge 기획 파이프라인 Phase 4 — 상세 기획 패키지 작성 (PRD/GDD → s4 산출물 3종 + 검증 3종 + 게이트)"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent
argument-hint: "<프로젝트 slug 또는 Phase 3 PRD/GDD 경로>"
model: sonnet
group: plan
---
> **⚠️ 실행 모드 확인**: 이 커맨드는 쓰기 모드에서만 정상 동작합니다. Plan mode 감지 시 즉시 [STOP] — "Escape로 plan mode 해제 후 재실행하세요. 내부 검증 게이트(Check 4)가 승인 지점입니다."


# /forge-plan — Phase 4 진입 (Planning Package)

Phase 3 기획서(`s3-prd.md` / `s3-gdd.md` + `s3-mockup/`)를 가지고 있을 때 **Phase 4 상세 기획 패키지**를 작성하는 단일 진입 커맨드.

> 절차 정본 = `~/forge/pipeline.md` "## Phase 4: Planning Package" (필수 산출물 3종 / Spec 크기 가드레일 5원칙 / 실행 순서 Step 1~6 / Check 4 게이트). 본 커맨드는 그 절차의 실행 래퍼.

## 사용법

```
/forge-plan <프로젝트 slug>          # forge-outputs/02-product/projects/<slug>/ 에 s3-* 존재
/forge-plan <Phase 3 PRD/GDD 경로>   # 경로에서 프로젝트 추론
```

## 전제조건

- `PIPELINE-IRON-1`: Phase 3 기획서(`s3-prd.md` 또는 `s3-gdd.md`) + `s3-style-guide.md` + `s3-mockup/` 없이는 진입 금지 — 없으면 [STOP] "Phase 3을 먼저 완료하세요 (`/prd` 또는 `/gdd`)"
- 산출물 경로 `{project-root}` = `forge-outputs/02-product/projects/{project-slug}/` (`folderMap.product` 해석 결과)

## 실행 흐름 (pipeline.md Phase 4 Step 1~6)

### Step 1 — 상세 기획서 작성 *(메인 AI 직접)*
- 입력: `s3-prd.md`/`s3-gdd.md` + `s3-mockup/`
- 화면별 동작 + 데이터 흐름 + 사이트맵 + **핵심 화면 목록 표** (`화면 ID`(kebab-case 영문, 고유) | 화면명 | 1줄 목적) — `s4-ui-source/` 디렉토리명의 SSoT
- 산출물: `{project-root}/s4-detailed-plan.md`

### Step 2 — 개발 계획 작성 *(메인 AI 직접 + 헬퍼 스킬)*
- 기술 스택 + C4 아키텍처(Mermaid 인라인 — Context/Container/Component)
- ADR: `/cto-advisor` 스킬의 ADR 템플릿 — 한정 범위(기술 스택·데이터 스토어·인증/인가·배포 방식·되돌리기 어려운 결정)별 1 ADR
- 보안 설계: 인증·인가·시크릿 관리·감사 로깅·입력 검증 — 각 항목 = 설계 명시 또는 `N/A` + 1줄 사유
- DB 필요 시: `/database-schema-designer` → 스키마 + 마이그레이션(역방향 가능 명시 + 백업/복원 경로 + 롤백 트리거)
- 세션 로드맵: 각 줄 = `"Session N — Spec M: [제목] (X SP)"` 형식 (X 권장 1-8, 12+ = Spec 분리). 번들링 시 분리 불가 사유 1줄
- 테스트 전략: 테스트 계층(unit/integration/e2e) + 커버리지 목표
- 산출물: `{project-root}/s4-development-plan.md`
- `s3-prd.md`/`s3-gdd.md` 헤더 `admin_required: true` 시: `{project-root}/s4-admin-detailed-plan.md` 추가 필수 (PHASE4-IRON-2)

### Step 3 — UI 소스코드 추출 *[Human 직접]*
- 입력: `s3-mockup/` + `s4-detailed-plan.md`
- Primary: `claude.ai/design` 접속 → 시안 기반 화면별 소스코드 생성. Fallback: 실패 시 Human에게 통보 후 Stitch MCP `get_screen_code`
- 산출물: `{project-root}/s4-ui-source/{화면 ID}/` — `화면 ID` 디렉토리 = `s4-detailed-plan.md` 핵심 화면 목록 표의 ID와 정확히 1:1 (누락/중복/잉여 = [STOP])

### Step 4 — 검증 (병렬 3종)
리포트 헤더 규약: 마크다운(`*wave2-verification*.md` / `*wave3-cto*.md`) 첫 줄 = `Verdict: PASS|FAIL`, 둘째 줄 = `Critical: N` (트레이서빌리티는 `Missing: N` 추가). JSON(`ui-check-*.json`) = `{"verdict":"PASS|FAIL","critical_count":N,...}`. 동일 날짜 재실행 시 `-r2`/`-r3` 접미사, gate = 사전순 최후순.
- ① 트레이서빌리티 + 디렉션 일관성 *(메인 AI 직접)*: Phase 3 FR/NFR 전수 → `s4-detailed-plan.md` 매핑(누락=`Missing`) / 화면 ID 1:1 대조(누락·중복·잉여=`Critical`) / 세션 로드맵 SP·번들링 검토(위반=`Critical`) / Phase 2 디렉션 5축 vs 산출물(Don't 위반=`Critical`, Phase 2 skip 시 gate-log 5요소 5/5 확인) → `{project-root}/docs/reviews/wave2-verification-{date}.md`
- ② `cto-advisor` 에이전트 Subagent: `s4-development-plan.md` 7축(아키텍처·API·데이터모델·보안·성능·테스트전략·기술부채) 검토 — 부적절한 보안 `N/A`도 검토 → `{project-root}/docs/reviews/wave3-cto-{date}.md`
- ③ `/forge-check-ui`: `s4-ui-source/` UI 품질. 초기 1회 + `critical_count` ≥1 시 `/visual-loop` 재시도 최대 2회(총 3회). 3회 후 잔존 → [STOP] → `{project-root}/docs/reviews/ui-check-{date}.json`

### Step 5 — 게이트 판정 (Check 4 — 모두 충족. 리포트 = 패턴 매칭 중 최후순 1개 `ls {dir}/{pattern} | sort | tail -1`. 매칭 0개 = FAIL)
1. `bash ~/.claude/scripts/forge-gate-check.sh {project} S4` → PASS (필수 파일·리포트 존재 + 테스트전략/보안설계 grep + 세션로드맵 형식 grep + Phase 3 `admin_required:` 헤더 + `true` 시 admin plan 존재)
2. `wave2-verification-*.md` 최후순: `head -1` == `Verdict: PASS` && `grep '^Missing: 0$'` && `grep '^Critical: 0$'`
3. `wave3-cto-*.md` 최후순: `head -1` == `Verdict: PASS` && `grep '^Critical: 0$'`
4. `ui-check-*.json` 최후순: `jq '.verdict == "PASS" and .critical_count == 0'` == true

하나라도 FAIL → [STOP] 에스컬레이션.

### Step 6 — 전환
`gate-log.md` 업데이트 (s3 → s4 전환). 게이트 통과 시점 1 커밋 (`chore(s4): check 4 pass — {slug}`). **Phase 5 진입** (`/forge-onboard`가 Phase 5에서 자동 호출됨).

## Iron Laws

- **PHASE4-IRON-1**: 필수 산출물 3종(`s4-detailed-plan` + `s4-development-plan` + `s4-ui-source/`) 완성 전 게이트 통과 금지
- **PHASE4-IRON-2**: Phase 3에 관리자 기능 포함(`admin_required: true`) 시 `s4-admin-detailed-plan.md` 필수
- **PHASE4-IRON-3**: 세션 로드맵 `"Session N — Spec M: [제목] (X SP)"` 형식 미준수 시 gate-check FAIL. SP 추정 12+ 또는 번들링 정당화 누락 = `wave2-verification`에 `Critical` → Check 4 FAIL

## 에스컬레이션

| 상황 | 행동 |
|------|------|
| Phase 3 기획서/style-guide/mockup 부재 | **[STOP]** "`/prd` 또는 `/gdd`로 Phase 3 먼저 완료하세요" |
| 화면 ID 1:1 불일치 (누락·중복·잉여) | **[STOP]** 불일치 목록 + 수정 방향 |
| Check 4 항목 1개 이상 FAIL | **[STOP]** 실패 항목 + 리포트 헤더 값 보고 |
| `/forge-check-ui` 3회 후에도 critical 잔존 | **[STOP]** UI 잔여 이슈 + Claude Design 재시도 제안 |

## 도구

Claude Design(primary), Stitch MCP(fallback), `/cto-advisor`(스킬 — ADR), `cto-advisor`(에이전트 — 7축 검토), `/database-schema-designer`, `/forge-check-ui`, `/visual-loop`, `forge-gate-check.sh`, Mermaid(인라인)

## forge-sync 배포 대상

이 커맨드는 `forge-sync` 실행 시 `~/.claude/commands/forge-plan.md`에 자동 배포된다.
