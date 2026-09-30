---
description: "Forge 기획 파이프라인 P3 — 상세 기획 패키지 작성 (PRD/GDD → s4 산출물 3종 + 검증 3종 + 게이트)"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent
argument-hint: "<프로젝트 slug 또는 P2 PRD/GDD 경로>"
model: sonnet
group: plan
---
> **⚠️ 실행 모드 확인**: 쓰기 모드 전용. Plan mode 감지 시 즉시 [STOP] — "Escape로 plan mode 해제 후 재실행하세요. 내부 검증 게이트(Check 4)가 승인 지점입니다."

# /forge-plan — P3 진입 (Planning Package)
P2 기획서(`s3-prd.md`/`s3-gdd.md` + `s3-mockup/`)로 **P3 상세 기획 패키지**를 만든다. 절차 정본 = `~/forge/pipeline.md` "## P3: Dev Plan+Package". 사용: `/forge-plan <slug | P2 PRD/GDD 경로>`.
- 모델: 작성 Sonnet · 탐색 `Agent(model:"haiku")` · 기술검토 `cto-advisor` · 전략 `advisor-strategist` — advisor 모델은 항상 `advisor-spawn-guard.sh resolve` 출력(`gpt-*` → `mcp__codex__codex` read-only).
- 범위: greenfield + 기존 Forge 산출물 delta 보강(M5). 임의 legacy retrofit은 `migration-audit`.
- `{project-root}` = `forge-outputs/02-product/{project-slug}/`.

## Step 0 — 기억 회상 (선행 필수)
`bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/recall-context.sh" --stage forge-plan --query "<키워드>"` (조회 기록 자동). 적중은 "선행 지식"에 출처(learnings ID·파일 경로), 0건이면 "조회함 + 0건" 1줄.

## Phase 0 — Readiness (공통 헬퍼 `/readiness-gate`)
```bash
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/forge-gate-check.sh" {project} P3-ENTRY
```
`exit 1` → 즉시 GUIDE-STOP(P2 미완). 이후 `/readiness-gate` 진입계약 표의 **모든 행**을 4-state(ok/normalize/derive/absent) 판정: 전부 ok → PASS · normalize/derive만 → ADAPT(자동보완) · absent 1+ → GUIDE-STOP(`forge-plan-readiness-{date}.md` 출력 후 정지). PIPELINE-IRON-1: 기획서·`s3-style-guide.md`·`s3-mockup/` 없으면 진입 금지.

## Step 1 — 도메인 폴더 + 상세 기획서 *(메인 AI)*
화면별 동작·데이터 흐름·사이트맵·**핵심 화면 목록 표**(`화면 ID` kebab-case 고유 | 화면명 | 1줄 목적 — `s4-pages/` 디렉토리명 SSoT). 도메인명 = slug 또는 PRD §핵심 도메인. 구조:
`{domain}/` = `00-도메인개요.md` · `_registry.yaml` · `기능명세/F-01-{기능명}.md`(**반드시 `{feature_id}-` 접두**) · `10-화면정의.md` · `11-테이블명세.md` · `12-상세개발계획서.md` · `s4-pages/` · `_STATUS.md`. (legacy `s4-detailed-plan.md` 하위호환)
- **1-M5**: 기존 `{domain}/` 있으면 검증·보강 모드(`/readiness-gate` M5 — 누락만 추가, orphan FAIL/WARN) / 없으면 신규 생성. 재진입은 `/readiness-gate §M9`(완료 M스텝 재실행 금지).
- **M8 freshness (WARN, fail-open)**: 보강 모드 진입 시와 Step 2~6 진입 직전:
```bash
P2_FILE=$(ls -t "{project-root}"/*s3-prd*.md "{project-root}"/*s3-gdd*.md 2>/dev/null | head -1)
P2_MTIME=$(stat -c %Y "$P2_FILE" 2>/dev/null)
P3_MTIME=$(stat -c %Y "{domain}/_registry.yaml" 2>/dev/null)
[ -n "$P2_MTIME" ] && [ -n "$P3_MTIME" ] && [ "$P2_MTIME" -gt "$P3_MTIME" ] && echo "WARN: P2 기획서가 세션 중 변경됨 — 현재 Step 진행 전 영향받는 Step 재실행 권고 (M8 mid-session stale)"
```
  감지 시 재실행 권고 + 계속 여부 확인(강제 아님).
- **1-M2 `_registry.yaml`** (직접편집 금지, 기존 있으면 diff-merge — 덮어쓰기 금지): `domain`·`generated`·`features[]`{`id`,`name`,`priority`(Must|Should|Could|Won't),`fr_refs`,`ac_refs`,`pages`,`spec_ref: .specify/specs/YYYY-MM-DD-{slug}.md`, 선택 `state`(design→modeled→spec'd→converted→implemented→verified),`stack`,`mockup_refs`{page-id: `s3-mockup/{page-id}.png`},`api_contract`,`aggregate`}·`pages[]`{`id`,`name`,`purpose`,`feature_refs`}. 전 기능 등록. legacy `status` 보존, 읽기는 `state ‖ map(status)`(planned→design, in_progress→converted, done→verified). fr/ac_refs는 기능명세 §FR·§AC와 1:1.
- **1-M2b `_product.yaml`** (도메인 ≥2일 때만, advisory): `generated`·`size_profile`(S=1/M=2-5/L=6+)·`domains[]`{`slug`,`registry`,`must_count`}.
```bash
python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/spec-registry/registry_gate.py" --product {project-root} || echo "WARN: registry_gate 미가용(스크립트 미발견/실행실패) — advisory 스킵"
```
- **1-M3 게이트 B**: ①orphan — feature ↔ `기능명세/{feature_id}-*.md` 누락 = **FAIL** · page ↔ `s4-pages/{화면ID}/` 누락 = WARN · sub-flow FR 미역매핑 = WARN ②발산 — 같은 엔티티(기능 수·화면 수 등)가 문서 간 3개+ 값 = **FAIL**(`발산 탐지: {엔티티} = {값A}(출처A) / ...`) ③충분 바 floor: Must 전수 + 기능마다 ≥1 FR·AC·화면. Should/Could 미완 WARN. 기존 Figma 자산을 HTML/스크린샷으로 대체해도 감점 없음(Figma 신규 생성 금지). FAIL → [STOP] + 보강 지시 · WARN만 → 목록 보고 후 계속.
```bash
test -f "${FORGE_ROOT:-$HOME/forge}/shared/scripts/spec-registry/registry_gate.py" && python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/spec-registry/registry_gate.py" --domain {domain} || echo "WARN: registry_gate 미발견/실행실패 — advisory 스킵(orphan FAIL로 오판 금지)"
```
  exit 2 = FAIL([STOP]) · exit 0 = 통과 · 스크립트 부재/실패 = fail-open WARN.
- **1-M4**: 기능명세마다 `## 조건별 페이지 전환` 표(`| 조건 | 전환 유형 | 목적지/처리 | 비고 |` — 성공·에러(입력/서버/권한)·확인필요·로딩). 전환 유형 ∈ `페이지이동|팝업|토스트|모달|인라인`. Must 누락/미명시 = FAIL, Should/Could = WARN.
- **1-M4b** (advisory, UI 표와 별도 섹션): `## 도메인 상태전이/이벤트/불변식` — 상태전이 표(현재|이벤트|다음|조건)·도메인 이벤트·불변식·Aggregate. 누락 WARN. 불변식≥2/상태전이≥3/aggregate 참조≥2면 registry `aggregate` 채움.
- **1-M6 `{domain}/_STATUS.md`** 초기화: `# {domain} 진행 원장` / `## 현재 Phase`(stage: P3_IN_PROGRESS, updated, session) / `## Phase 이력` 표(Phase|시작|완료|산출물) / `## 수렴 상태`(round: 0, last_delta: —, plateau_count: 0, status: OPEN) / `## 미결 항목`. 규약: 각 Phase 진입 시 `stage` 확인(충돌 = [STOP]) · 쓰기 = Step1 `P3_IN_PROGRESS` · Step5 PASS `P3_DONE` · [STOP] 시 `P3_BLOCKED` + 미결 추가.

## Step 2 — 개발 계획 → `{project-root}/s4-development-plan.md`
기술 스택 + C4(Mermaid) · ADR(`/cto-advisor` 템플릿 — 스택·데이터스토어·인증인가·배포·비가역 결정별 1개; 모듈/이음매 ADR은 `${FORGE_ROOT:-$HOME/forge}/.claude/rules-on-demand/codebase-design.md` 어휘, 이음매 신설은 변하는 것 2개+ 근거) · 보안 설계(인증·인가·시크릿 관리·감사 로깅·입력 검증 — 각 항목 설계 또는 `N/A`+사유) · DB 스키마·마이그레이션(역방향·백업/복원·롤백 트리거) · 세션 로드맵 `"Session N — Spec M: [제목] (X SP)"`(X 1-8, 12+ 분리, 번들링 사유) · 테스트 전략(테스트 계층 unit/integration/e2e + 커버리지 목표). `admin_required: true`면 `s4-admin-detailed-plan.md` 추가.
- 표면 분할(권고, 차단 아님): 각 Spec 항목에 새 장치 수를 적고 `python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/cr-surface-count.py" declare --count <N> --name "<Spec 제목>"` → rc 1이면 `⚠️ spec 단계에서 분할 예정` 표기(진행 계속).

## Step 3 — UI 소스 *[Human 직접]*
- 3.0: `shared/design-tokens/DESIGN.template.md` → `{project-root}/DESIGN.md` 복사 후 `s3-style-guide.md`·`s3-mockup/`·전역 기본값 근거로 채움(direction 1개, primitive→semantic→component). 이후 Edit-only. advisory(프론트는 권고).
- Primary **`/forge-mockup`**: `s3-mockup/{화면ID}/screen.html`이 있으면 그대로 `s4-pages/{화면ID}/` 초안으로 채택, 없으면 먼저 실행(모델은 `/forge-mockup §모델 선택`). 자립형 아니거나 화면 ID 1:1 아니면 새로 생성. Fallback: Human 통보 후 Claude Design. Stitch 금지.
- 산출: `{domain}/s4-pages/{화면 ID}/` — `10-화면정의.md` ID와 1:1(누락/중복/잉여 = [STOP]). `s4-ui-source/` 허용.

## Step 4 — 검증 (병렬 3종)
헤더 규약: md 첫 줄 `Verdict: PASS|FAIL`, 둘째 `Critical: N`(트레이서빌리티는 `Missing: N` 추가) · JSON `{"verdict":"PASS|FAIL","critical_count":N}` · 재실행 `-r2`/`-r3` 접미사.
- ① 트레이서빌리티+디렉션 *(메인)*: P2 FR/NFR → 상세기획 매핑(누락=Missing) · 화면 ID 1:1(Critical) · 로드맵 SP/번들링(Critical) · P2 디렉션 5축 Don't 위반(Critical, P2 skip 시 gate-log 5요소 5/5 확인) → `{project-root}/docs/reviews/wave2-verification-{date}.md`
- ② cto-advisor **리졸버 경유**: `MODEL=$(bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/advisor-spawn-guard.sh" resolve)` → `claude-*`면 `Agent(subagent_type="cto-advisor", model:"fable"|"opus")`, `gpt-*`면 `mcp__codex__codex`(read-only). 7축(아키텍처·API·데이터모델·보안·성능·테스트·기술부채, 부적절한 `N/A` 포함) → `{project-root}/docs/reviews/wave3-cto-{date}.md`
- ③ `/forge-check-ui` on `s4-pages/`: critical ≥1이면 `/visual-loop` 최대 2회 재시도, 3회 후 잔존 [STOP] → `{project-root}/docs/reviews/ui-check-{date}.json`
- 전략 advisor(조건부, advisory): MVP 범위·L 제품 순서/리소스·타임라인-스코프 충돌 시만 리졸버 경유 `Agent(subagent_type="advisor-strategist", prompt="<계획 맥락+전략 분기 500토큰> 범위·순서·리소스 권고 + trade-off 1~2개")`. 기술 결정은 cto-advisor — 중복 금지.

## Step 5 — 게이트 (Check 4 — 전부 충족. 리포트 = `ls -t {dir}/{pattern} | head -1`, 0개 = FAIL; 사전순 금지)
1. `bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/forge-gate-check.sh" {project} S4` → PASS (`~/.claude/scripts/` 사본 사용 금지 — 의존 파일 부재로 오진)
2. `wave2-verification-*.md`: `head -1` == `Verdict: PASS` && `grep '^Missing: 0$'` && `grep '^Critical: 0$'`
3. `wave3-cto-*.md`: `head -1` == `Verdict: PASS` && `grep '^Critical: 0$'`
4. `ui-check-*.json`: `jq '.verdict == "PASS" and .critical_count == 0'` == true
5. 사람 결정 선수집: `python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/spec-open-decisions.py" {domain}/<기능명세>.md {project-root}/s4-development-plan.md` — `0` 통과 · `1` **[STOP]** 항목 전부 한 번에 질문 → 답을 `O-N`으로 결정표·`<기능명세>.impl-notes.md`에 기록 후 재실행(`_STATUS.md`로 닫지 않음) · `2` = FAIL(0으로 읽지 않음). "결정 대기 없음" 기재 전 반드시 `0`.

하나라도 FAIL → [STOP] 에스컬레이션.

## Step 5.5 — 수렴 루프 + plateau guard
FAIL 재시도마다 `_STATUS.md` 수렴 상태 갱신: `round++`, `delta = (이번 FAIL 수 - 이전)/이전` → `last_delta`, `plateau_count`. `last_delta < 5%` 2회 연속 또는 `round ≥ 4` FAIL 잔존 → `status: PLATEAU` + **[STOP]**: A. 추가 라운드(사용자 수정 후) / B. P3 override(AD-50 human override) / C. 범위 축소.

## Step 6 — 전환
1. M7 EXIT self-check(`/readiness-gate §M7`) → `forge-plan-exit-readiness-{date}.md`. FAIL = [STOP].
2. `python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/spec-registry/registry_gate.py" --product {project-root} || echo "WARN: registry_gate 미가용 — computed 트리거 기록 스킵(advisory)"` → `p4_review_recommended` 값으로 각 `_STATUS.md`에 `p4_trigger_status: PENDING`(false)/`ACTIVE`(true). `ACTIVE`/`BYPASSED`는 덮어쓰기 금지.
3. `gate-log.md` 갱신(s3→s4). `_STATUS.md` `stage: P3_DONE` + `status: CONVERGED` + `stage: P4_READY`.
4. 커밋 `chore(s4): check 3 pass — {slug}`.
5. P4 진입 = `/forge` 또는 **`/forge-spec`** (`/spec-write` 사용 금지 — 모델 호출 불가).

## Iron Laws
- PHASE3-IRON-1: `s4-development-plan.md`(또는 `12-상세개발계획서.md`) 완성 전 Gate 금지. `s4-pages/`는 조건부.
- PHASE3-IRON-2: `admin_required: true` → `s4-admin-detailed-plan.md` 필수.
- PHASE3-IRON-3: 로드맵 형식 미준수 = gate-check FAIL. SP 12+ 또는 번들링 정당화 누락 = wave2 `Critical`.

## 에스컬레이션
| 상황 | 행동 |
|---|---|
| P2 기획서/style-guide/mockup 부재 | **[STOP]** "`/forge-design`으로 **P2** 먼저 완료하세요" |
| 화면 ID 1:1 불일치 | **[STOP]** 불일치 목록 + 수정 방향 |
| Check 4 항목 FAIL | **[STOP]** 실패 항목 + 리포트 헤더 값 |
| `/forge-check-ui` 3회 후 critical 잔존 | **[STOP]** 잔여 이슈 + Claude Design 재시도 제안 |
