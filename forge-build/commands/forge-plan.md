---
description: "Forge 기획 파이프라인 P3 — 상세 기획 패키지 작성 (PRD/GDD → s4 산출물 3종 + 검증 3종 + 게이트)"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent
argument-hint: "<프로젝트 slug 또는 Phase 3 PRD/GDD 경로>"
model: sonnet
group: plan
---
> **⚠️ 실행 모드 확인**: 이 커맨드는 쓰기 모드에서만 정상 동작합니다. Plan mode 감지 시 즉시 [STOP] — "Escape로 plan mode 해제 후 재실행하세요. 내부 검증 게이트(Check 4)가 승인 지점입니다."


# /forge-plan — P3 진입 (Planning Package)

P2 기획서(`s3-prd.md` / `s3-gdd.md` + `s3-mockup/`)를 가지고 있을 때 **P3 상세 기획 패키지**를 작성하는 단일 진입 커맨드.

> 절차 정본 = `~/forge/pipeline.md` "## P3: Dev Plan+Package" (필수 산출물 3종 / Spec 크기 가드레일 5원칙 / 실행 순서 Step 1~6 / Check 3 게이트). 본 커맨드는 그 절차의 실행 래퍼.

## 모델 라우팅 (2026-07-04)

| 작업 | 모델 | 방법 |
|------|------|------|
| 기획 패키지 작성 | **Sonnet** | frontmatter `model: sonnet` |
| 탐색(기존 spec/제품 인덱스·레포 확인) | **Haiku** | `Agent(model:"haiku")` subagent |
| 기술 검토(7축 ADR) | (기존) | `cto-advisor` 에이전트/스킬 |
| 비기술 전략 자문 | **Opus** | `advisor-strategist` |

근거: `~/.claude/rules/model-routing.md`. advisor=Opus 고정(Fable 자동 없음).

## 사용법

```
/forge-plan <프로젝트 slug>          # forge-outputs/02-product/<slug>/ 에 s3-* 존재
/forge-plan <Phase 3 PRD/GDD 경로>   # 경로에서 프로젝트 추론
```

## 적용 범위 (스코프 가드 — P5)

> **greenfield 한정** — brownfield(임의 legacy 코드/도메인 역설계·retrofit)는 본 파이프라인 범위 밖, 별도 `migration-audit` 트랙.
> **단 기존 Forge P2/P3 산출물의 delta 검증·보강(M5)은 유효**(범위 내) — M5 검증·보강 모드(Step 1-M5)가 이 경로를 처리한다.
> 즉: "기존 Forge 산출물 보강 = in-scope / 임의 legacy retrofit = out-of-scope"

## 전제조건

- `PIPELINE-IRON-1`: P2 기획서(`s3-prd.md` 또는 `s3-gdd.md`) + `s3-style-guide.md` + `s3-mockup/` 없이는 진입 금지 — 기획서 absent 시 GUIDE-STOP, 형식 불일치는 ADAPT 자동보완
- 산출물 경로 `{project-root}` = `forge-outputs/02-product/{project-slug}/` (`folderMap.product` 해석 결과)

## Phase 0 — Readiness 판정 (요건 기반 3-way 게이트)

→ 공통 헬퍼: `/readiness-gate` 참조 (4-state 판정 + GUIDE-STOP 산출기 + ADAPT 규칙)

forge-plan 진입 계약(A~D 요소) 기준으로 P2 아티팩트 스캔:
- 요소별 4-state 판정(ok/normalize/derive/absent)
- 라우팅:
  - 전부 ok       → **PASS** (실행 흐름 Step 1 진행)
  - normalize/derive만 → **ADAPT** (자동보완 후 Step 1 진행)
  - absent 1개+  → **GUIDE-STOP** (`forge-plan-readiness-{date}.md` 출력 후 정지)

기존 PIPELINE-IRON-1 [STOP]은 absent A(기획서)=GUIDE-STOP으로 대체:
기획서가 완전히 없으면 GUIDE-STOP. 있으나 불완전하면 ADAPT.

## 실행 흐름 (pipeline.md P3 Step 1~6)

### Step 1 — 도메인 폴더 + 상세 기획서 자동생성 *(메인 AI 직접)*
- 입력: `s3-prd.md`/`s3-gdd.md` + `s3-mockup/`
- 화면별 동작 + 데이터 흐름 + 사이트맵 + **핵심 화면 목록 표** (`화면 ID`(kebab-case 영문, 고유) | 화면명 | 1줄 목적) — `s4-pages/` 디렉토리명의 SSoT
- **도메인 폴더 구조 자동생성** (s4-detailed-plan.md 단일 파일 → 폴더화, 고정번호 규약):
  ```
  {project-root}/{domain}/
  ├── 00-도메인개요.md           ← 개요(목적·범위·용어)
  ├── _registry.yaml             ← canonical manifest (Phase 3 M2에서 생성)
  ├── 기능명세/                  ← 기능별 분할 (api-정의서·sequences와 일관)
  │   └── 01-{기능명}.md ...
  ├── 10-화면정의.md             ← 고정번호 (화면 ID·레이아웃·상태)
  ├── 11-테이블명세.md           ← 고정번호 (스키마·관계)
  ├── 12-상세개발계획서.md       ← 고정번호 (세션 로드맵·기술스택·ADR)
  ├── s4-pages/                  ← 화면별 UI 소스코드 (구 s4-ui-source/ 대체)
  └── _STATUS.md                 ← 진행 원장(M6)
  ```
- 도메인명 = 프로젝트 slug (단일 도메인 프로젝트) 또는 PRD §핵심 도메인에서 추출 (멀티 도메인).
- 기존 `s4-detailed-plan.md` = legacy 단일 포맷 (기존 프로젝트 하위호환). 신규 = 도메인 폴더 우선.
- 산출물: `{project-root}/{domain}/` 도메인 폴더

#### 1-M5: 자산 감지 → 검증·보강 모드 판정
Step 1 실행 전 기존 도메인 폴더 유무 확인:
- **기존 `{domain}/` 존재 → 검증·보강 모드**: `/readiness-gate` M5 섹션 실행 (delta 방식 — 누락 파일만 추가, 기존 파일 SSoT 유지). orphan 감지 시 FAIL/WARN 분류.
- **기존 폴더 없음 → 신규 생성 모드**: 아래 도메인 폴더 구조 전체 생성.

> **⚠️ M8 stale-cascade는 pull-only(WARN, additive)**: `/readiness-gate` M8은 forge-plan이 재호출될 때만 stale을 감지·전파한다 — P2 기획서(`s3-prd.md`/`s3-gdd.md`)가 변경됐는데 forge-plan이 재호출되지 않으면 P3 산출물(`{domain}/` 전체)이 조용히 stale된 채 방치될 수 있다. 검증·보강 모드 진입 시 P2 산출물 mtime이 `{domain}/_STATUS.md` 마지막 갱신일보다 최신이면 → "P2 변경 감지 — M8 stale-cascade 재검증 권고" WARN 1줄 출력(차단 아님, 강제 재실행 아님).

> **➕ M8 mid-session 재트리거 (freshness check, WARN-first, fail-open)**: 위 pull-only 갭 보완 — forge-plan 재호출 없이도 **같은 세션 내에서** Step 2~6 각 진입 직전, P2 기획서 mtime을 직전 생성된 P3 산출물(Step 1 `_registry.yaml` 또는 도메인 폴더) mtime과 비교:
> ```
> P2_MTIME=$(stat -c %Y "{project-root}/s3-prd.md" 2>/dev/null || stat -c %Y "{project-root}/s3-gdd.md" 2>/dev/null)
> P3_MTIME=$(stat -c %Y "{domain}/_registry.yaml" 2>/dev/null)
> [ -n "$P2_MTIME" ] && [ -n "$P3_MTIME" ] && [ "$P2_MTIME" -gt "$P3_MTIME" ] && echo "WARN: P2 기획서가 세션 중 변경됨 — 현재 Step 진행 전 영향받는 Step 재실행 권고 (M8 mid-session stale)"
> ```
> 감지 시 → 영향받는 Step(대개 Step 1 재실행 후 하위 Step 이어가기) 재실행을 권고하는 WARN 1줄 출력 + 계속 진행 여부 확인 프롬프트(사용자 확인, 강제 재실행 아님). mtime 조회 실패(파일 부재·권한·`stat` 미가용 등 `P2_MTIME`/`P3_MTIME` 공백)는 **fail-open** — freshness 판정 불가 시에도 조용히 진행, 차단 금지. 기존 pull-only 흐름을 대체하지 않고 병행(재호출 시점 + 세션 내 매 Step 진입 시점 이중 커버).

#### 1-M2: canonical 레지스트리 자동생성 (`_registry.yaml`)
도메인 폴더 생성 직후 `{domain}/_registry.yaml` 자동 생성:
```yaml
# {domain}/_registry.yaml — canonical manifest (M2). 직접편집 금지: forge-plan이 SSoT.
domain: {slug}
generated: YYYY-MM-DD
features:
  - id: F-01
    name: {기능명}
    priority: Must|Should|Could|Won't   # PRD RICE / GDD MoSCoW
    fr_refs: [FR-01, FR-02]             # 기능명세/01-{기능명}.md §FR
    ac_refs: [AC-01, AC-02]             # 기능명세/01-{기능명}.md §AC
    pages: [page-id-1, page-id-2]       # 10-화면정의.md 화면 ID
    spec_ref: .specify/specs/YYYY-MM-DD-{slug}.md
    # ── P1 신규 필드 (additive, 모두 선택적) ──────────────────────────────
    state: design       # 신규 라이프사이클. 값: design→modeled→spec'd→converted→implemented→verified
    # status: planned   # legacy 보존 (기존 프로젝트 마이그레이션 금지). read alias: state ‖ map(status)
    stack: next.js      # 이 feature의 주 기술 스택
    mockup_refs:        # 연관 목업 파일 (key: 화면ID, value: 경로)
      {page-id}: s3-mockup/{page-id}.png
    api_contract:       # 핵심 API 계약 (EP + 응답 1줄)
      - "POST /endpoint → 201 {resultId}"
    aggregate: null     # DDD 집합체 (P3 기능명세 DDD 섹션 작성 후 채움 — 2차)
```
> **state / status read alias 규약 (P1)**: 신규 feature = `state` 사용. 기존 `status` 보존 (재작성·migration 금지).
> 레지스트리를 읽는 도구는 `state ‖ map(status)` 순서로 해석 — `state` 있으면 우선, 없으면 `status`를 state-enum으로 매핑(planned→design, in_progress→converted, done→verified).
> **⚠️ 상태 전이 enum 검증은 P1 범위 밖** — 상태머신이 미완성 상태임을 인지하고 진행 (P4 소비자 배선과 함께 2차 도입).
pages:
  - id: {화면ID-kebab-case}
    name: {화면명}
    purpose: {1줄 목적}
    feature_refs: [F-01]
```
- Must 기능 전수 등록. Should/Could/Won't도 등록(state=design 또는 legacy status=planned).
- fr_refs/ac_refs = 기능명세 파일 §FR·§AC 항목 ID와 1:1 (누락 = orphan, Phase 4 M3 게이트 대상).
- 기존 `_registry.yaml` 존재 시 → diff-merge (기존 항목 보존, 신규 추가만). 덮어쓰기 금지.

#### 1-M2b: `_product.yaml` reconcile (P2 additive — domains≥2 시만)
_registry.yaml 생성·갱신 직후, 프로젝트 루트 전체 도메인 폴더 수를 확인:

| 규모 프로파일 | 도메인 수 | _product.yaml |
|-------------|---------|--------------|
| **S** (단일) | 1개 | **미생성** — 단일 도메인 프로젝트는 불필요 |
| **M** (중간) | 2~5개 | **advisory 생성** — 제품 인덱스 권고 |
| **L** (대규모) | 6개+ | **advisory 생성** — 제품 인덱스 권고 |

도메인 수 ≥2 → `{project-root}/_product.yaml` 생성 (없으면 신규, 있으면 reconcile):
```yaml
# {project-root}/_product.yaml — 제품 인덱스 (P2 additive, advisory). forge-plan이 SSoT.
generated: YYYY-MM-DD
size_profile: M      # S(1 domain) / M(2-5) / L(6+)
domains:
  - slug: {domain-slug}
    registry: {domain}/_registry.yaml
    must_count: {Must 기능 수}
```

**advisory 원칙**: `_product.yaml` 미생성/미갱신은 WARN(advisory)만 — 기존 파이프라인 게이트 차단 불가.

**verify**: `python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/spec-registry/registry_gate.py" --product {project-root} || echo "WARN: registry_gate 미가용(스크립트 미발견/실행실패) — advisory 스킵"` → exit 0 (advisory WARN 확인). 스크립트 미발견/실행실패 시 fail-open(WARN만 남기고 진행, 차단 금지).

#### 1-M3: 기능셋 1:1 게이트 B (orphan + 발산 탐지)
`_registry.yaml` 생성·갱신 직후 실행:

**① orphan 체크 (계층 매핑)**:
- `_registry.yaml` features 전수 → 기능명세/ 파일 1:1 매핑 (누락 = 기능 orphan → **FAIL**)
- `_registry.yaml` pages 전수 → `s4-pages/{화면ID}/` 디렉토리 1:1 매핑 (누락 = visual asset orphan → **WARN**)
- 기능명세/에 있는 sub-flow FR → 부모 feature `fr_refs`로 전수 역매핑 (미연결 = FR orphan → **WARN**)

**② 발산(divergence) 탐지**:
동일 엔티티(기능 수·화면 수·팀원 수·SP 합계 등)가 문서 간 3개 이상 다른 값으로 기술될 경우 → **FAIL**:
```
발산 탐지: {엔티티명} = {값A}(출처A) / {값B}(출처B) / {값C}(출처C)
```
예: PRD "기능 3개", registry features 7개, 기획서 "총 5개 기능" → 발산 탐지: 기능 수 = 3/7/5 → FAIL

**③ 충분 바(sufficiency bar)**:
- floor(강제) 기준: Must 기능 전수 + 각 기능 ≥1 FR + ≥1 AC + ≥1 화면 매핑
- ceiling(권고) 아님: Should/Could 기능 명세 미완성은 WARN만
- substitution matrix(→ readiness-gate.md §M5) 적용: HTML/스크린샷이 Figma 대체 시 비율로 감산하지 않음 (대체형 자체가 ok)

**결과**: orphan FAIL 또는 발산 FAIL → [STOP] + 보강 작업지시. WARN만 → 목록 보고 후 계속.

**verify**: `test -f "${FORGE_ROOT:-$HOME/forge}/shared/scripts/spec-registry/registry_gate.py" && python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/spec-registry/registry_gate.py" --domain {domain} || echo "WARN: registry_gate 미발견/실행실패 — advisory 스킵(orphan FAIL로 오판 금지)"` → exit 2 = FAIL([STOP]), exit 0 = 통과 (WARN은 stderr 출력 후 계속). 스크립트 미발견·실행실패는 fail-open — orphan 게이트의 exit 2(FAIL)와 혼동 금지, WARN만 남기고 진행.

#### 1-M4: 조건별 페이지 전환 포맷 검증 (M4)
기능명세/ 파일 생성 직후 실행. 각 기능명세 파일에 **조건별 페이지 전환** 표 포함 여부 체크:

```
## 조건별 페이지 전환
| 조건 | 전환 유형 | 목적지/처리 | 비고 |
|------|---------|-----------|------|
| 성공 | 페이지이동 | /home | |
| 에러(입력오류) | 인라인 | 필드 오류 메시지 | 팝업 금지 |
| 에러(서버) | 토스트 | "서버 오류" | |
| 에러(권한없음) | 모달 | 로그인 유도 | |
| 확인필요(비가역) | 모달 | 확인/취소 | |
| 로딩 | 인라인 | 스켈레톤 | 전체차단 금지 |
```

검증 기준:
- Must 기능 전수 = 조건별 페이지 전환 표 **필수** (누락 = FAIL)
- 전환 유형 = `페이지이동|팝업|토스트|모달|인라인` 중 명시 (미명시 = FAIL)
- Should/Could = WARN (차단 아님)

#### 1-M4b: 도메인 상태전이/이벤트/불변식 섹션 (P3 additive — UI 전환표와 분리)
기능명세 파일에 **조건별 페이지 전환** 표와 **별도 섹션**으로 추가. UI 행동 표(1-M4)와 절대 혼합 금지.

```markdown
## 도메인 상태전이/이벤트/불변식
> *(P3 DDD 데이터 자리. 상태전이/이벤트/불변식이 명확해지면 채움. opt-in — 비워도 파이프라인 차단 없음)*

### 도메인 상태전이
| 현재 상태 | 이벤트 | 다음 상태 | 조건 |
|---------|-------|---------|------|
| | | | |

### 도메인 이벤트
- `{EventName}`: {발생 조건 1줄}

### 불변식 (Invariant)
- {불변식 1}: {위반 시 결과}

### Aggregate (registry `aggregate` 필드와 동기화)
> aggregate: {AggregateRoot명} — registry _registry.yaml features[id=F-xx].aggregate 에 채움
```

**advisory 원칙**:
- 이 섹션 **누락 = WARN만** (blocking 아님). DDD opt-in 게이트는 2차(P4 spec-writer 소비자 배선과 함께).
- `불변식 ≥2` 또는 `도메인 상태전이 ≥3` 또는 `aggregate 참조 ≥2` → registry `aggregate` 필드 채움 권고.
- 채운 경우 → `_registry.yaml` 해당 feature `aggregate: {AggregateRoot}` 동기화.

#### 1-M6: `_STATUS.md` 진행 원장 초기화 (M6)
도메인 폴더 생성 완료 직후 `{domain}/_STATUS.md` 초기 기록:

```markdown
# {domain} 진행 원장
> Phase 전환 시 업데이트. 직접편집 가능 (forge-plan이 자동기록, 수동 보정 허용).

## 현재 Phase
- stage: P3_IN_PROGRESS
- updated: YYYY-MM-DD
- session: {세션ID or 날짜}

## Phase 이력
| Phase | 시작 | 완료 | 산출물 |
|-------|------|------|--------|
| P2 기획 | {날짜} | {날짜} | s3-prd.md |
| P3 상세기획 | {날짜} | — | |

## 수렴 상태
- round: 0
- last_delta: —
- plateau_count: 0
- status: OPEN

## 미결 항목
- (없음)
```

**`_STATUS.md` 읽기/쓰기 규약**:
- **읽기**: 각 Phase Step 0 진입 시 → `_STATUS.md` 존재 확인 + `stage` 필드 확인 (충돌 Phase = [STOP])
- **쓰기**: ① Step 1 완료 시 `stage: P3_IN_PROGRESS` ② Step 5 PASS 시 `stage: P3_DONE` ③ [STOP] 에스컬레이션 시 `stage: P3_BLOCKED` + 미결 항목 추가

> **⟳ 세션 재진입 시**: `/readiness-gate §M9` 재진입 안전성 규약 적용 — `_STATUS.md` read → resume/fresh 판정 → resume 리포트 출력 후 다음 미완료 M스텝부터 재개. 완료 M스텝 재실행 금지.

### Step 2 — 개발 계획 작성 *(메인 AI 직접 + 헬퍼 스킬)*
- 기술 스택 + C4 아키텍처(Mermaid 인라인 — Context/Container/Component)
- ADR: `/cto-advisor` 스킬의 ADR 템플릿 — 한정 범위(기술 스택·데이터 스토어·인증/인가·배포 방식·되돌리기 어려운 결정)별 1 ADR
  - 모듈·이음매 결정을 담는 ADR은 `${FORGE_ROOT:-$HOME/forge}/.claude/rules-on-demand/codebase-design.md` 어휘로 서술(깊이·이음매·어댑터). 이음매 신설 ADR은 **변하는 것이 실제로 2개 이상**임을 근거로 제시해야 한다.
- 보안 설계: 인증·인가·시크릿 관리·감사 로깅·입력 검증 — 각 항목 = 설계 명시 또는 `N/A` + 1줄 사유
- DB 필요 시: AI 직접 스키마 + 마이그레이션 설계(역방향 가능 명시 + 백업/복원 경로 + 롤백 트리거)
- 세션 로드맵: 각 줄 = `"Session N — Spec M: [제목] (X SP)"` 형식 (X 권장 1-8, 12+ = Spec 분리). 번들링 시 분리 불가 사유 1줄
- 테스트 전략: 테스트 계층(unit/integration/e2e) + 커버리지 목표
- 산출물: `{project-root}/s4-development-plan.md`
- `s3-prd.md`/`s3-gdd.md` 헤더 `admin_required: true` 시: `{project-root}/s4-admin-detailed-plan.md` 추가 필수 (PHASE3-IRON-2)

### Step 3 — UI 소스코드 추출 *[Human 직접]*

#### 3.0 — DESIGN.md 커밋 계약 생성 (선행, UI 소스 추출 전)
- `shared/design-tokens/DESIGN.template.md`를 `{project-root}/DESIGN.md`로 복사 → `s3-style-guide.md`·`s3-mockup/`·전역 기본값(design-rules.md/instagram-default.json)을 근거로 프로젝트 특화 채움(committed direction 1개 확정, 토큰 계층 primitive→semantic→component 작성).
- **생성 후 Edit-only**(재작성 금지). 이후 claude.ai/design UI 소스 생성·forge-check-ui·visual-loop·pge가 이 DESIGN.md를 SSoT로 참조.
- advisory(WARN-우선) — 미생성이 기존 게이트를 차단하지 않음. 단 프론트 프로젝트는 생성 권고.

- 입력: `s3-mockup/` + `{domain}/10-화면정의.md`(또는 기존 `s4-detailed-plan.md`)
- Primary: `claude.ai/design` 접속 → 시안 기반 화면별 소스코드 생성. Fallback: 실패 시 Human에게 통보 후 Stitch MCP `get_screen_code`
- 산출물: `{project-root}/{domain}/s4-pages/{화면 ID}/` — `화면 ID` 디렉토리 = `{domain}/10-화면정의.md` 핵심 화면 목록의 ID와 정확히 1:1 (누락/중복/잉여 = [STOP]). 기존 `s4-ui-source/` 경로 허용(하위호환)

### Step 4 — 검증 (병렬 3종)
리포트 헤더 규약: 마크다운(`*wave2-verification*.md` / `*wave3-cto*.md`) 첫 줄 = `Verdict: PASS|FAIL`, 둘째 줄 = `Critical: N` (트레이서빌리티는 `Missing: N` 추가). JSON(`ui-check-*.json`) = `{"verdict":"PASS|FAIL","critical_count":N,...}`. 동일 날짜 재실행 시 `-r2`/`-r3` 접미사, gate = mtime 기준 최신 1개 (`-r2`/`-r3` 접미사는 사전순 정렬을 깨뜨려 `-2` < `.md`가 되므로 사전순 최후순 금지 — 아래 Step 5 참조).
- ① 트레이서빌리티 + 디렉션 일관성 *(메인 AI 직접)*: P2 FR/NFR 전수 → `s4-detailed-plan.md` 매핑(누락=`Missing`) / 화면 ID 1:1 대조(누락·중복·잉여=`Critical`) / 세션 로드맵 SP·번들링 검토(위반=`Critical`) / P2 디렉션 5축 vs 산출물(Don't 위반=`Critical`, P2 skip 시 gate-log 5요소 5/5 확인) → `{project-root}/docs/reviews/wave2-verification-{date}.md`
- ② `cto-advisor` 에이전트 Subagent: `s4-development-plan.md` 7축(아키텍처·API·데이터모델·보안·성능·테스트전략·기술부채) 검토 — 부적절한 보안 `N/A`도 검토 → `{project-root}/docs/reviews/wave3-cto-{date}.md`
- ③ `/forge-check-ui`: `s4-pages/`(또는 기존 `s4-ui-source/`) UI 품질. 초기 1회 + `critical_count` ≥1 시 `/visual-loop` 재시도 최대 2회(총 3회). 3회 후 잔존 → [STOP] → `{project-root}/docs/reviews/ui-check-{date}.json`

**전략 advisor (조건부, advisory-only — cto-advisor 기술축과 별개)**: 비-기술 전략 분기에서 advisor-strategist(Opus) 자문 — 트리거: MVP 범위 결정 분기 / L(대규모) 제품 순서·리소스 배분 / 타임라인-스코프 충돌. `Agent(subagent_type="advisor-strategist", prompt="<계획 맥락+전략 분기 500토큰> 범위·순서·리소스 권고 + trade-off 1~2개")`. 단순 계획(단일 제품·명확 범위)은 스폰 X. advisory only, non-blocking. 기술 결정(아키텍처·스택·보안)은 cto-advisor가 담당 — 중복 스폰 금지. 중첩 시 [→Lead 위임].

### Step 5 — 게이트 판정 (Check 4 — 모두 충족. 리포트 = 패턴 매칭 중 mtime 최신 1개 `ls -t {dir}/{pattern} | head -1`. 매칭 0개 = FAIL)
<!-- mtime 기준 선정 이유: `-r2`/`-r3` 재시도 접미사는 사전순 정렬을 깨뜨림 (`-` 0x2D < `.` 0x2E → `...-r2.md`가 `....md`보다 사전순 앞섬), 따라서 `sort | tail -1`은 원본(stale) 리포트를 오선택할 수 있음 -->
1. `bash ~/.claude/scripts/forge-gate-check.sh {project} S4` → PASS (필수 파일·리포트 존재 + 테스트전략/보안설계 grep + 세션로드맵 형식 grep + Phase 3 `admin_required:` 헤더 + `true` 시 admin plan 존재)
2. `wave2-verification-*.md` mtime 최신: `head -1` == `Verdict: PASS` && `grep '^Missing: 0$'` && `grep '^Critical: 0$'`
3. `wave3-cto-*.md` mtime 최신: `head -1` == `Verdict: PASS` && `grep '^Critical: 0$'`
4. `ui-check-*.json` mtime 최신: `jq '.verdict == "PASS" and .critical_count == 0'` == true

하나라도 FAIL → [STOP] 에스컬레이션.

### Step 5.5 — 수렴 루프 + plateau guard (M6)

Step 5 FAIL 시 재작성 루프 진입 전 수렴 상태 체크:

```
수렴 루프:
  round++ → _STATUS.md 수렴 상태 업데이트
  delta = (FAIL 항목 수 이번 라운드 - 이전 라운드) / 이전 라운드
  → last_delta 기록, plateau_count 갱신
```

**plateau guard** (무한 루프 차단):
- `last_delta < 5%` 인 라운드가 **2회 연속**이면 plateau 선언 → `status: PLATEAU`
- plateau 선언 시 → **[STOP]** 다음 옵션 제시:
  ```
  📊 plateau 감지 — {round}라운드 진행, 개선율 < 5% 2회 연속.
  A. 추가 라운드 (사용자 직접 수정 후 재시도)
  B. 현재 상태로 P3 override 진행 (AD-50 기준 human override)
  C. 범위 축소 (scope-down + D 단순화)
  ```
- `round ≥ 4` 이상에서도 FAIL 잔존 → `status: PLATEAU` 자동 선언 (override 여부 무관)

`_STATUS.md` 수렴 상태 필드는 Step 5 매 재시도 후 갱신 의무.

### Step 6 — 전환
1. **M7 EXIT self-check** (`/readiness-gate §M7`): P3 EXIT 항목 전수 확인 → `forge-plan-exit-readiness-{date}.md` 자동생성. FAIL = [STOP].
2. **M7-P5 computed 트리거 기록** (advisory — P5 스코프 가드):
   `python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/spec-registry/registry_gate.py" --product {project-root} || echo "WARN: registry_gate 미가용 — computed 트리거 기록 스킵(advisory)"` 실행 → (CWD 무관 절대경로 — 프로젝트 워크트리 등 non-forge cwd에서도 스크립트 탐색 가능). 스크립트 미발견/실행실패 시 fail-open(WARN 후 진행, 차단 금지).
   결과의 `p4_review_recommended` / `ddd_activation_recommended` 값을 각 `{domain}/_STATUS.md`에 기록:
   ```
   p4_trigger_status: PENDING   # domains<2 (p4_review_recommended=false)
   p4_trigger_status: ACTIVE    # domains>=2 (p4_review_recommended=true)
   ```
   **멱등 규칙**: 이미 `ACTIVE` 또는 `BYPASSED`이면 덮어쓰기 금지. `PENDING`만 갱신 허용.
   이 스텝은 advisory(exit 0) — 기존 게이트 차단 불가.
3. `gate-log.md` 업데이트 (s3 → s4 전환). `_STATUS.md` `stage: P3_DONE` + `수렴 상태 status: CONVERGED` + `stage: P4_READY` 기록.
4. 게이트 통과 시점 1 커밋 (`chore(s4): check 3 pass — {slug}`).
5. **P4 진입** (/forge-onboard P3 packaging checklist 흡수 완료 → `/forge` 또는 `/spec-write`로 P4 시작).

## Iron Laws

- **PHASE3-IRON-1**: `s4-development-plan.md`(또는 `{domain}/12-상세개발계획서.md`) 완성 전 Gate 통과 금지. `s4-pages/`(또는 기존 `s4-ui-source/`) = 조건부 (미존재 허용)
- **PHASE3-IRON-2**: P2 기획서 `admin_required: true` 시 `s4-admin-detailed-plan.md` 필수
- **PHASE3-IRON-3**: 세션 로드맵 `"Session N — Spec M: [제목] (X SP)"` 형식 미준수 시 gate-check FAIL. SP 추정 12+ 또는 번들링 정당화 누락 = `wave2-verification`에 `Critical` → Check 3 FAIL

## 에스컬레이션

| 상황 | 행동 |
|------|------|
| Phase 3 기획서/style-guide/mockup 부재 | **[STOP]** "`/forge-design`으로 Phase 3 먼저 완료하세요" |
| 화면 ID 1:1 불일치 (누락·중복·잉여) | **[STOP]** 불일치 목록 + 수정 방향 |
| Check 4 항목 1개 이상 FAIL | **[STOP]** 실패 항목 + 리포트 헤더 값 보고 |
| `/forge-check-ui` 3회 후에도 critical 잔존 | **[STOP]** UI 잔여 이슈 + Claude Design 재시도 제안 |

## 도구

Claude Design(primary), Stitch MCP(fallback), `/cto-advisor`(스킬 — ADR), `cto-advisor`(에이전트 — 7축 검토), `/forge-check-ui`, `/visual-loop`, `forge-gate-check.sh`, Mermaid(인라인)

## forge-sync 배포 대상

이 커맨드는 `forge-sync` 실행 시 `~/.claude/commands/forge-plan.md`에 자동 배포된다.
