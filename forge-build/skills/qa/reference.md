# QA Skill — 상세 구현 참조 (reference.md)

> SKILL.md에서 분리된 세부 구현 코드 및 절차.
> SKILL.md의 핵심 흐름 + 디스패치를 숙지한 후 필요 섹션만 Read on-demand.

---

## §Phase A 상세 — 자동 브랜치 생성 (AD-93 W4, §A13 idempotency)

```bash
# 1. develop 확인
CURRENT=$(git branch --show-current)
[ "$CURRENT" = "develop" ] || { echo "[STOP] develop 브랜치 아님: ${CURRENT}" >&2; exit 2; }

# 1b. stale-base preflight (D2d, WARN-only 비차단 — forge-implement preflight와 동일)
BEHIND=$(git fetch origin develop 2>/dev/null && git rev-list --left-right --count origin/develop...HEAD 2>/dev/null | awk '{print $1}')
if [ "${BEHIND:-0}" -ge 10 ] 2>/dev/null; then
  echo "[stale-base WARN] 현재 브랜치가 origin/develop 대비 ${BEHIND}커밋 뒤처짐 — git rebase origin/develop 권장(비차단)." >&2
fi  # fetch 실패·원격 없음 = fail-open silent skip

# 2. 기존 브랜치 검사 (idempotency)
DATE=$(date '+%Y-%m-%d')
BRANCH="fix/qa-${QA_SCOPE:-full}-${DATE}"

if git show-ref --verify --quiet "refs/heads/${BRANCH}"; then
  if git log develop --merges --oneline 2>/dev/null | grep -q "${BRANCH}"; then
    BRANCH="${BRANCH}-v2"
    echo "[Phase A] 기존 브랜치 머지됨 → ${BRANCH} 신규 생성" >&2
  else
    echo "[RESUME] 기존 ${BRANCH} 재진입 (미머지 → resume 모드)" >&2
    git checkout "${BRANCH}"
    exit 0
  fi
else
  echo "[Phase A] 신규 브랜치: ${BRANCH}" >&2
fi

if [ "${QA_FORCE_NEW:-0}" = "1" ]; then
  BRANCH="fix/qa-${QA_SCOPE:-full}-${DATE}-$$"
fi

git checkout -b "${BRANCH}"
export QA_BRANCH="${BRANCH}"

# 로깅 자동 export
export LOG_HTTP=1 LOG_SOCKET=1 LOG_DB=1
TS=$(date +%Y%m%d%H%M%S)
mkdir -p docs/qa/artifacts
exec > >(tee "docs/qa/run-${TS}.log") 2>&1

# Entropy snapshot (갭 12, §A17)
python3 -c "
import json, os, sys
from datetime import datetime
snap = {
    'timestamp': datetime.utcnow().isoformat() + 'Z',
    'session_id': os.environ.get('CLAUDE_SESSION_ID', ''),
    'scope': os.environ.get('QA_SCOPE', 'full'),
    'branch': '${BRANCH}',
    'token_count': 0,
    'tool_call_count': 0,
    'repeated_pattern_count': 0
}
with open('docs/qa/entropy-snapshot-${TS}.json', 'w') as f:
    json.dump(snap, f, indent=2)
print('[Phase A] entropy-snapshot 생성')
" 2>/dev/null || true
```

**⚠️ 라이브 공유 dev서버 과도기 해저드 (라이브서버 과도기 — 리포트 Q1, WARN)**: 사람이 라이브 테스트하는 dev서버(HMR 상주)를 에이전트 편집 트리로 그대로 쓰면, 다단계 편집의 **중간(과도기) 상태**가 실사용자에게 크래시로 노출된다("최종 상태 GREEN"으로는 이 창을 못 막는다). 권고(비차단): (a) human-test는 **빌드 산출물**(안정) 서빙 + 에이전트는 별도 워크트리에서 편집 후 승격, 또는 (b) 최소한 "라이브 편집 중 human-test는 과도기 크래시 가능" 경고 배너. dev-HMR을 사람 검증 서버로 직결하면 원자성 없는 편집이 실사용자 오류가 된다. 완전한 서버 분리는 인프라 작업(별도) — 여기선 규율·경고로 surface. (F4 GREEN 검증의 "편집 창 서버로그 throw 0" 스캔과 연동.)

---

## §Phase B 상세 — 시나리오 8 카테고리 + 병렬 실행 (AD-96 W14)

**시나리오 schema** (H29 스키마 검증):
```yaml
시나리오 #{N}:
  카테고리: 1-8       # 필수
  기법: <equivalence|BVA|fault-injection|state-transition|pairwise|OWASP|...>  # 필수
  대상: <엔드포인트 또는 컴포넌트>
  Given: <초기 상태>   # 필수
  When: <트리거 입력/동작>  # 필수
  Then: <기대 결과>    # 필수
  실행 방법:
    - playwright spec | curl + jq | SQL | k6
  병렬 그룹: <A|B|C>  # 필수 — 같은 그룹 병렬 실행, 다른 그룹 직렬
```

### Bug-ID Allocator (MED#6 수용)

```python
# Phase B T1/T2/T3 실행 중 FAIL 시
if scenario.result == "FAIL":
    bug_id = allocate_bug_id()  # docs/qa/.bug-id-counter (atomic increment)
    mkdir(f"docs/qa/artifacts/bug-{bug_id}/")
    collect_artifacts(bug_id, scenario)  # 프론트: 4종 + trace / 백엔드: 3종
    for vp in ["mobile", "tablet", "desktop"]:
        capture(f"docs/qa/artifacts/bug-{bug_id}-red-{vp}-shot.png")
```

### 카테고리별 병렬 실행 코드 (MED#7)

```python
serial_cats   = [s for s in scenarios if s.카테고리 in [5, 7]]
worktree_cats = [s for s in scenarios if s.카테고리 in [4, 6]]
parallel_cats = [s for s in scenarios if s.카테고리 in [1,2,3,8]]

parallel_set = parallel_cats + worktree_cats
if len(parallel_set) >= 5:
    agents = [
        Agent(
            subagent_type="general-purpose", model="haiku",
            isolation="worktree" if s.카테고리 in [4,6] else None,
            prompt=f"시나리오 #{s.N} 실행 + 7축 발견 기준 적용"
        )
        for s in parallel_set
    ]

for s in serial_cats:
    run_scenario(s)
```

---

## §Phase 0 — 하네스 부트스트랩

`qa-setup` 스킬 호출:
- 서버 생명주기 (기동/재사용/폴링)
- DB seed 격리 (매 사이클 재주입)
- API 전수 발견 (gitnexus route_map → scenarios.md)
- verify.sh 생성 (인증 하네스 포함)
- **oracle-manifest 감지** (`{project}/.specify/oracle-manifest.json`): 존재 시 T1 axis 5 scope 확장
- Phase 0 완료 조건 미충족 시 → **[STOP]** (진입 불가)

---

## §T1~T7 검증 상세

### T1: API 전수 테스트 — 백엔드 7축 (AD-96)

| # | 축 | 도구 | 판정 기준 |
|---|---|------|---------|
| 1 | HTTP status | api-e2e + verify.sh | expected status 일치 |
| 2 | Response schema | OpenAPI 스키마 대조 | drift 0건 |
| 3 | Server log ERROR/FATAL | tail -f server.log + grep | ERROR/FATAL 0건 |
| 4 | 데이터 무결성 (5 하위) | (아래 참조) | 5개 모두 PASS |
| 5 | Spec FR / API 계약 + oracle-PEV | spec-compliance-checker | FR-ID ↔ 엔드포인트 동작 |
| 6 | Latency SLO | performance-checker | p95 < threshold |
| 7 | 트랜잭션 정합 | 동시 요청 + race | 데드락/lost update 0건 |

**데이터 무결성 5 하위** (축4):
- 4a 제약 무결성 (FK/UNIQUE/NOT NULL/CHECK)
- 4b 트랜잭션 ACID
- 4c 논리 정합 (cross-row/cross-table 비즈니스 룰)
- 4d 상태 머신 정합 (전이 룰 skip/역행)
- 4e 시계열·참조 무결성 (orphan FK, created_at > updated_at)

**백엔드 3종 로그 자동 수집** (H3 차단):
```bash
tail -n 1000 server.log | grep -E "ERROR|FATAL|Exception" > docs/qa/artifacts/bug-${N}-server.log
psql "$DATABASE_URL" -c "SELECT * FROM pg_stat_statements WHERE query LIKE '%${TARGET}%'" > docs/qa/artifacts/bug-${N}-db.log
```

### T2: UI/UX 시각 검증 — 프론트 7축 (AD-96)

> **DevTools 증거 번들(F12 전수)** — 콘텐츠 스펙 SSoT = `commands/forge-fix.md §DevTools 증거 번들`. qa 발견(Phase B/C, RED)과 healer 수정(Phase D~F, RED/GREEN)이 **동일 `playwright-devtools-capture.mjs` 헬퍼**를 재사용한다 — 발견 단계도 자체 Playwright 리스너 코드를 두지 않고 헬퍼 CLI 1회 호출로 캡처 메커니즘을 단일화한다(캡처=헬퍼 공용, 판정·시나리오 로직만 qa 고유 유지).

| # | 축 | 도구 | 판정 기준 |
|---|---|------|---------|
| 1 | Console error | 헬퍼 `-console.json` (전 레벨 캡처, error만 게이트) | error 0건 |
| 2 | Network 4xx/5xx | 헬퍼 `-network.json` (전 요청 캡처 — method/URL/status/req·res 헤더/바디/타이밍, 4xx/5xx만 게이트) | 4xx/5xx 0건 |
| 3 | JS exception | 헬퍼 `-js-errors.log` (uncaught exception + unhandledrejection) | exception 0건 |
| 4 | Spec FR 정합 | bug-fix-plan `위반 FR` 필드 | Spec FR ↔ UI 동작 매핑 |
| 5 | Visual diff | 헬퍼 `-{vp}-shot.png` (mobile/tablet/desktop, RED/GREEN 대조) | pixel ratio < 1% |
| 6 | a11y / Lighthouse | forge-check-ui (axe-core + Lighthouse) | a11y ≥ 90, perf ≥ 80 |
| 7 | 인터랙션 정합 | 헬퍼 `--actions` 시퀀스 + Vision evaluator | 클릭/폼/네비/모달 expected |

> **scroll-reveal 위양성 가드 (L-20260711)**: 가시성(visibility) 판정 전 대상 요소까지 실제 스크롤 필수 — `whileInView`/IntersectionObserver 기반 scroll-reveal 컴포넌트는 로드 직후 캡처하면 조상 `opacity:0`으로 위양성("텍스트 안 보임")이 난다. 자식 `getComputedStyle` `opacity=1`이어도 부모 곱셈으로 실제 투명일 수 있어 자식만 확인해도 놓친다. 대상 요소까지 스크롤한 뒤 캡처 → 그래도 안 보이면 진짜 버그로 판정한다.

**DevTools 증거 번들 자동 수집** (F12 전수 — 발견 단계 캡처를 healer/forge-fix RED 캡처와 동일 엔진으로 통일. 기존 하드게이트("console error 0건" / "network 4xx·5xx 0건")는 그대로 유지 — 헬퍼 재사용은 캡처 범위 확장(헤더/바디/타이밍 포함)이며 새 hard-BLOCK 아님):
```bash
node "${FORGE_ROOT:-$HOME/forge}/shared/scripts/playwright-devtools-capture.mjs" \
  --url <재현 URL> --out-prefix docs/qa/artifacts/bug-{N}-red --phase red \
  [--actions <재현 인터랙션 시퀀스 json경로>]
```
- 정적 페이지 로드만으로 재현되지 않는 버그(클릭·입력·선택·스크롤·hover 이후 발생)는 §Phase B 재현 스텝을 인터랙션 시퀀스 JSON으로 변환해 `--actions`로 전달 — 스텝별 스냅샷 + `actions-trace.json`이 함께 남는다.
- 헬퍼가 기본으로 mobile/tablet/desktop 3-viewport를 모두 캡처하므로 발견 단계에서 별도 viewport 순회 코드는 불필요 — multi-viewport 강제는 헬퍼 기본 동작으로 충족된다.
- 출력 파일(기존 산출물 규약과 동일, 변경 없음): `bug-{N}-red-console.json`(전 레벨) / `bug-{N}-red-network.json`(전 요청, req/res 헤더·바디·타이밍 포함) / `bug-{N}-red-js-errors.log` / `bug-{N}-red-failed-resources.log` / `bug-{N}-red-{vp}-shot.png` / best-effort `-network.har` / `-trace.zip` / `-aria.json` / (인터랙션 시) `-actions-trace.json` + `-step{NN}-{action}-desktop.png`.
- 서버 로그(`bug-${N}-server.log`)는 헬퍼 범위 밖 — 위 "백엔드 3종 로그 자동 수집"(T1) 절 그대로 유지. 프론트 앱 자체 로거(front.log)도 헬퍼 미캡처 항목 — 프로젝트별 best-effort로 있으면 별도 수집, 없으면 스킵(기존 로직 유지).
- exit code 3(playwright 미설치) 시 GUIDE-STOP — `forge-fix.md §DevTools 증거 번들`의 `playwright_unavailable` carve-out과 동일 규약 적용.

**`--exhaustive`(요소 전수 크롤, 2026-07-06)** — 헬퍼 `--crawl` 모드:
```bash
node "${FORGE_ROOT:-$HOME/forge}/shared/scripts/playwright-devtools-capture.mjs" \
  --url <대상 URL> --out-prefix docs/qa/artifacts/{scope}-crawl --phase red --crawl \
  [--accounts <계정 로그인시퀀스 json경로>]
```
- `button, a[href], input, select, textarea, [role=button], [onclick], [tabindex]` 전수 열거 → 클릭(폼 필드는 안전한 placeholder 입력) → 콘솔/네트워크 delta + 스냅샷.
- **파괴적 액션 가드(CRITICAL)**: 텍스트/class/id/role에 삭제·탈퇴·해지·환불·결제·출금·delete·remove·withdraw·refund·purchase·checkout·deactivate·unsubscribe·cancel 패턴(`isDestructiveElement` export, 순수함수 — 단위테스트 가능) 매칭 시 클릭하지 않고 `{prefix}-crawl-skipped.json`에 사유 기록(silent skip 금지). 매칭 요소는 인간 QA가 별도 확인.
- 내비게이션 발생 요소는 클릭 직후 원래 `--url`로 되돌아가 상태를 복원(단일 page 재사용 undo).
- 출력: `{prefix}-crawl{NNN}-desktop.png`(요소별 스냅샷) + `{prefix}-crawl-trace.json`(index/tag/text/ok/console·network delta/navigated) + `{prefix}-crawl-skipped.json`.
- DB diff는 이 헬퍼 범위 밖(브라우저 전용 캡처) — §T3(SQL 직접 조회)가 별도 담당, 중복 구현하지 않는다.
- **H1-3 오탐 방지 필터(crawl 한정)**: dev-overlay(nextjs-portal/`[data-nextjs-*]`) 열거 제외 / 진짜 렌더 에러는 에러페이지 TEXT 매칭만 / connection 실패 = INFRA FAIL(pass 아님) / isolation 마커는 unique 토큰 필수 — 상세·헬퍼는 §Coverage & Isolation (H1-3). trace의 `renderError`/`infraFail` 필드로 판정.
- 결과 bugs[]는 T2와 동일 `TEST_SCHEMA`로 반환 — 신규 시나리오 카테고리를 만들지 않고 기존 8카테고리 파이프라인에 흡수된다.

**`--accounts`(계정별 로그인 매트릭스, 2026-07-06)** — 헬퍼 `--accounts <json경로>`:
```bash
node "${FORGE_ROOT:-$HOME/forge}/shared/scripts/playwright-devtools-capture.mjs" \
  --url <대상 URL> --out-prefix docs/qa/artifacts/{scope}-{account}-red --phase red \
  --accounts docs/qa/.accounts/{account}-login.json
```
- 로그인 시퀀스 JSON은 `--actions`와 동일 스텝 스키마(`{"action":"fill|click|...","selector":"...","value":"..."}`)를 배열(또는 `{"label":"...","steps":[...]}`) 형식으로 받는다.
- `value`에 `"ref:.env#KEY"` 또는 `"env:KEY"`를 쓰면 헬퍼가 `process.env`에서 런타임 치환(`resolveCredentialValue` export, 순수함수) — qa-config·아티팩트·에러 로그 어디에도 평문 크레덴셜을 남기지 않는다.
- 로그인은 페이지 최초 로드 직후, 스크린샷/`--actions`/`--crawl`보다 먼저 실행되어 이후 모든 캡처가 로그인 상태를 반영한다.
- workflow.js Phase C는 계정마다 T1/T2를 별도로 실행하고 결과 bugs[]에 `account` 필드를 태깅한다 — T3/T6/T7은 계정 무관 인프라 검증이라 combo당 1회만 실행(비용 방지).

---

## §qa-config 스키마 — app/domains/accounts 매트릭스 (신규 2026-07-06)

> **파일 위치**: 워크스페이스(멀티레포) 또는 프로젝트(단일레포) 루트 `.claude/qa-config.json`. **부재 시 graceful fallback** — `--app`/`--domains`/`--accounts`/`--exhaustive` 미지정 시 이 파일은 전혀 읽히지 않고(신규 agent 호출 0건, 회귀 0), 4축 중 하나라도 지정되면 workflow.js Phase A0가 이 파일을 참조하도록 위임 에이전트에 안내한다 — 실 파싱은 그 에이전트가 Read 도구로 수행한다(workflow.js 자체는 fs를 import하지 않는 이 파일의 기존 아키텍처를 따름).
> **크레덴셜은 반드시 `ref:.env#KEY` 형식만** — 평문 절대 금지(secret guard).

**멀티레포(예: starbeginz) 예시** — app 레지스트리 포함:
```json
{
  "apps": {
    "portal": {
      "baseUrl": "http://localhost:3000",
      "domains": ["auth", "profile", "board", "payment"]
    },
    "opstool": {
      "baseUrl": "http://localhost:3002",
      "apiUrl": "http://localhost:5080",
      "domains": ["settlement-management", "sales-management", "member-management"]
    }
  },
  "accounts": {
    "admin": {
      "role": "operator",
      "loginUrl": "/login",
      "steps": [
        { "action": "fill", "selector": "#email", "value": "ref:.env#QA_ADMIN_EMAIL" },
        { "action": "fill", "selector": "#password", "value": "ref:.env#QA_ADMIN_PASSWORD" },
        { "action": "click", "selector": "button[type=submit]" }
      ]
    },
    "partner": {
      "role": "partner",
      "loginUrl": "/login",
      "steps": [
        { "action": "fill", "selector": "#email", "value": "ref:.env#QA_PARTNER_EMAIL" },
        { "action": "fill", "selector": "#password", "value": "ref:.env#QA_PARTNER_PASSWORD" },
        { "action": "click", "selector": "button[type=submit]" }
      ]
    }
  },
  "aliases": { "settlement": "settlement-management", "sales": "sales-management" }
}
```

**단일레포(예: portfolio) 예시** — `apps` 블록 생략(단일 앱은 `--app` 불요):
```json
{
  "domains": ["admin-console", "editor-console", "public-site"],
  "accounts": {
    "admin": {
      "steps": [
        { "action": "fill", "selector": "#email", "value": "ref:.env#TEST_ADMIN_EMAIL" },
        { "action": "fill", "selector": "#password", "value": "ref:.env#TEST_ADMIN_PASSWORD" },
        { "action": "click", "selector": "button[type=submit]" }
      ]
    },
    "editor": {
      "steps": [
        { "action": "fill", "selector": "#email", "value": "ref:.env#TEST_EDITOR_EMAIL" },
        { "action": "fill", "selector": "#password", "value": "ref:.env#TEST_EDITOR_PASSWORD" },
        { "action": "click", "selector": "button[type=submit]" }
      ]
    }
  }
}
```

**필드 표**:
| 필드 | 필수 | 설명 |
|------|------|------|
| `apps.<id>.baseUrl` | 멀티레포만 | 해당 앱 접속 URL |
| `apps.<id>.apiUrl` | 선택 | 별도 API 서버(운영툴 등) |
| `apps.<id>.domains` | 선택 | 해당 앱의 도메인(LNB 메뉴군) 목록 — 없으면 top-level `domains` 공용 |
| `domains` | 단일레포 또는 apps 공용 fallback | App Router 라우트/LNB 메뉴군 이름 목록 |
| `accounts.<id>.steps` | 선택(계정 매트릭스 시 필수) | 로그인 액션 시퀀스(`--actions`/`--accounts` 헬퍼와 동일 스텝 스키마), `value`는 `ref:.env#KEY`만 |
| `accounts.<id>.role` | 선택 | 역할 식별자 — C2 404 역참조·C3 최소권한의 기대-접근 매핑 키(menuSource `roleField`와 매칭) |
| `accounts.<id>.expectedRoutes` | 선택 | (menuSource 역할 매핑이 없을 때) 이 역할이 접근 가능해야 하는 라우트 목록 — C3 least-privilege 기대치 |
| `menuSource` | 선택 | menu-centric 커버리지(C1) 소스 — 아래 스키마. 없으면 route_map 단독(route-centric, WARN) |
| `aliases` | 선택 | `--domains`/`--app` 입력 정규화 매칭 보조(축약형 → 정식 id) |
| `serverSetup` | 선택 | 서버 생명주기 훅 — 아래 스키마. qa-setup 서버 기동이 이 값을 사용(라이선스 env·health·기동커맨드). 없으면 스택 자동감지 fallback |
| `pathTransform` | 선택 | 메뉴 path → FE 라우트 변환 규칙 — 아래 스키마. 없으면 메뉴 path를 그대로 크롤 URL로 사용 |
| `portStrategy` | 선택 | 포트 전략(`"single"` 기본 = 단일포트 도메인 순차 / `"multi"` = 도메인별 포트 병렬). 없으면 single |

**`menuSource` 스키마** (C1 menu-centric 커버리지 — 앱 특정값은 전부 여기서만 온다, 하드코딩 금지):
```json
{
  "menuSource": {
    "type": "db-query",                 // "db-query" | "api"
    "query": "SELECT menu_path, is_active, role_id FROM <메뉴테이블>",  // type=db-query 시
    "endpoint": "/api/admin/menus",     // type=api 시 (활성 메뉴 반환 엔드포인트)
    "pathField": "menu_path",           // 라우트 경로 필드명
    "activeField": "is_active",         // 활성 여부 필드명 (truthy = ACTIVE)
    "roleField": "role_id"              // 선택 — 메뉴별 접근 역할(C2/C3 기대-접근 매트릭스 도출)
  }
}
```
- 테이블명·필드명·엔드포인트는 모두 프로젝트가 선언 — 엔진은 어떤 앱 스키마도 하드코딩하지 않는다.
- `roleField` 있으면 (활성 메뉴 × 역할) → 역할별 기대-접근 라우트 집합이 자동 도출되어 C2/C3에 사용된다. 없으면 accounts `role`/`expectedRoutes`로 대체하거나 least-privilege 검증을 WARN으로 제한한다.

**`serverSetup` 스키마** (앱-특정 인프라 흡수 — 하드코딩 금지, 전부 프로젝트 선언):
```json
{
  "serverSetup": {
    "startCommand": "scripts/run-admin-api.sh",   // 서버 기동 커맨드(상대=프로젝트 루트 기준)
    "licenseEnv": ["SERVICESTACK_LICENSE"],        // 기동 전 주입할 env 키 목록(값은 .env/secret에서 — 평문 금지). 예: ServiceStack OrmLite 10테이블 캡 해제
    "healthUrl": "http://localhost:5080/health",   // 기동 완료 판정 헬스체크 URL(선택)
    "readyTimeoutSec": 60,                         // 헬스 대기 타임아웃(선택, 기본 60)
    "humanTestServer": {                           // (선택) 사람 검증 서버를 에이전트 편집 트리에서 분리 — 과도기 크래시 방지
      "mode": "build",                             // "build"(빌드산출물 안정 서빙, 권장) | "dev"(HMR, 과도기 노출 위험)
      "buildCommand": "npm run build",             // mode=build 시 승격 빌드 커맨드
      "serveCommand": "npm run start"              // 빌드산출물 서빙 커맨드
    }
  }
}
```
- `licenseEnv`는 키 이름만 나열 — 실제 값은 `.env`/secret에서 런타임 주입(평문 크레덴셜 금지 원칙). 미선언·기동 실패 시 스택 자동감지 fallback(WARN, 비차단).
- `humanTestServer.mode="build"`: 사람 검증용 서버는 **빌드 산출물(안정)**을 서빙하고, 에이전트는 **별도 워크트리에서 편집 후 승격(rebuild)**한다 — 라이브 HMR을 사람 검증 서버로 직결하면 다단계 편집의 과도기 상태가 실사용자 크래시로 노출된다(§Phase A 과도기 해저드·forge-fix F4와 연동). 미선언·`"dev"`는 기존 HMR 동작(과도기 노출 가능, WARN). **완전 자동 분리 오케스트레이션은 런타임 qa-setup 에이전트가 이 config를 소비해 수행**(엔진 하드코딩 없음, config-driven). 실행 헬퍼: `${FORGE_ROOT:-$HOME/forge}/shared/scripts/qa-human-test-server.sh <start|promote|stop|status>` — promote는 build-먼저-then-swap 원자 교체(빌드 실패 시 기존 서버 유지, 사람 노출 0). ⚠️ 스크립트 레벨 검증만 완료, 실앱 E2E는 첫 소비 세션에서.

**`pathTransform` 스키마** (메뉴 path ↔ FE 라우트 규칙 — QA 크롤 URL 함정 방지):
```json
{
  "pathTransform": {
    "stripPrefix": ["/admin", "/partner"],     // 메뉴 path에서 제거할 도메인 프리픽스(FE는 cleanPath 단일트리)
    "portalCookie": "sb.portal",               // 포털 분기 쿠키명(선택 — 서브도메인/쿠키로 포털 결정)
    "note": "프리픽스 경로 직접 nav 시 catch-all placeholder(PREPARING) — 반드시 cleanPath 적용"
  }
}
```
- 크롤/nav URL 구성 시 메뉴 `pathField` 값에 `stripPrefix`를 적용해 실제 FE 라우트를 얻는다. 미선언 시 메뉴 path 그대로 사용(기존 동작, fail-open).

- `--domains=all` / `--app=all` → 위 목록 전체 자동 열거.
- 파일 부재·읽기 실패 시 workflow.js Phase A0는 `--scope`(콤마 다중 가능) 값으로 graceful fallback(guideStop=false) — **매칭 시도 자체가 있었는데 0건**인 경우만 GUIDE-STOP.

---

## §Coverage & Isolation — C1/C2/C3 + H1-3 오탐 방지 (신규 2026-07-07)

> 전부 **config-driven**(qa-config `menuSource`/`accounts`) + **AD-168 WARN-우선**(신규 hard-BLOCK 없음, 설정·신호 부재 시 fail-open으로 기존 동작 fallback).

### C1 — menu-centric 커버리지 (route-centric 사각지대 보완)

route_map(gitnexus) 시드는 **route-centric** — "구현된 라우트"만 열거하므로 *메뉴가 존재하지 않는 화면을 가리키는* 사각지대를 못 본다. qa-config에 `menuSource`가 있으면 Phase B에서 **menu-centric** 소스를 추가한다:
1. `menuSource`(db-query 또는 api)로 **ACTIVE 메뉴** 항목 열거(`activeField` truthy만).
2. `active_menu(pathField) ∖ implemented_route(route_map)` = **미구현 메뉴 목록** 계산.
3. scenarios.md "미구현 메뉴(unimplemented-menu) 커버리지" 절에 surface(각 항목은 C2 BROKEN_LINK 후보).
- `menuSource` 미선언·조회 실패 → route_map 단독 + **WARN**: "menu-centric 커버리지 off — 존재하지 않는 화면을 가리키는 메뉴 미탐지". (기존 동작 fallback, 비차단.)

### C2 — 404 역참조 → BROKEN_LINK (isolation 흡수 방지)

라우트 404를 무조건 "isolation-OK"로 흡수하면 **끊긴 메뉴 링크**가 은폐된다. Phase C(T1/T2)에서 404 발생 시:
- 활성 메뉴 목록(C1)에서 **이 계정 역할이 접근 가능해야 하는** 메뉴가 그 라우트를 가리키면 → **BROKEN_LINK 버그로 승격**(isolation 아님). "권한 있는데 404 = 항상 버그".
- isolation(정상 미노출) 판정은 **역할이 실제로 grant가 없는** 경우에만 유효.
- 기대-접근 매트릭스 = menuSource `roleField` 매핑 우선, 없으면 accounts `role`/`expectedRoutes`.

### C3 — 역할 최소권한(least-privilege) 테스트 (over-exposure/leak 탐지)

모든 grant를 가진 super-role 하나만 테스트하면 *의도된 공유 라우트*와 *진짜 가드 누수*를 구분할 수 없다. 각 configured 역할(qa-config accounts)마다:
- 도달한 라우트가 **기대-접근 집합에 없는데 2xx**(grant 없음에도 접근됨) → **over-exposure/leak 버그**(403/redirect 기대).
- 기대-접근 매트릭스 부재 → **WARN**: "최소권한 검증 제한(기대-접근 매트릭스 없음)"(비차단).
- 제네릭: 역할·기대치 전부 qa-config에서만 도출(앱 역할 하드코딩 없음).

### H1-3 — 오탐 방지 필터 (exhaustive/crawl 경로 한정)

`playwright-devtools-capture.mjs`가 crawl 경로에서만 적용(기본 비-crawl 동작 불변). 순수 export 헬퍼로 단위테스트 가능:
| # | 필터 | 헬퍼/메커니즘 | 규칙 |
|---|------|-------------|------|
| 1 | dev-overlay 제외 | `nextjs-portal`/`[data-nextjs-*]` 조상 판정(page.evaluate) | 오버레이 요소는 열거 제외(존재≠에러) → `crawl-skipped.json` reason=`dev-overlay-excluded` |
| 2 | 진짜 렌더 에러 | `isRealRenderError(pageText)` | portal 존재가 아니라 에러페이지 **TEXT** 매칭(`Unhandled Runtime Error`/`Application error`/`Internal Server Error`)만 렌더 에러로 인정 → trace `renderError` |
| 3 | unique isolation 마커 | `isGenericIsolationMarker(marker)` | 격리 마커는 **unique 비추측 토큰**(예: `qa-iso-<uuid>`) 필수. 둥근/generic 값(`200000`, 순수 정수, `test`/`admin` 등)은 거부(실데이터 우연 일치 = false isolation pass) |
| 4 | connection 실패 = INFRA FAIL | `isConnectionFailure(errorText)` | `ERR_CONNECTION_REFUSED` 등 연결 실패는 **INFRA FAIL** — 절대 pass/isolation-OK로 채점 금지 → trace `infraFail` |

- crawl-trace의 `renderError`/`infraFail` 필드 + summary `crawl_dev_overlay_excluded`/`crawl_render_error`/`crawl_infra_fail` 카운터로 노출. Phase C T2 판정이 이 시그널을 그대로 소비(위 workflow.js T2 프롬프트).

### C4 — mock-unwired 탐지 (load-crawl false-green 방지, 신규)

로드/list 크롤이 "화면 렌더됨 + 데이터 행 보임 = PASS"로 판정하면 **BE 미배선 mock 화면**(`@/lib/mock/*` 인라인 데이터만 쓰는 화면)을 false-green으로 통과시킨다 — 가짜 정산금액·가짜 승인완료를 실제처럼 노출(placeholder보다 위험). 실사용 QA에서 CRITICAL 다수가 이 유형이었다.
- **탐지 신호(이미 캡처됨)**: crawl-trace의 `network_delta_since_prev` — 요소 상호작용(클릭/필터/제출) 전후 네트워크 요청 증분. 데이터화면인데 상호작용 delta=0(특히 `/api`·`/api/proxy` 호출 0건) = **mock 미배선 의심**.
- **판정**: 데이터 행이 렌더되는 화면 + 상호작용 후 백엔드 호출 0 → **WARN 버그**("mock 미배선 의심 — 활성 메뉴가 가짜 데이터 노출"). placeholder(빈 화면/'준비중')와 구분: placeholder는 행이 없거나 명시적 안내, mock은 그럴듯한 데이터 행을 렌더.
- **fail-open**: `network_delta` 신호 부재·비-데이터 화면(정적 안내/폼 only)·판정 모호 → 기존 PASS 유지(비차단, WARN 신설 아님·hard-BLOCK 아님). AD-168 정합.

### D2d — stale-base preflight (Phase A, WARN-only)

forge-implement preflight와 동일하게 Phase A에서 base(develop) 신선도를 확인한다(비차단):
```bash
git fetch origin develop 2>/dev/null && git rev-list --left-right --count origin/develop...HEAD
```
behind(좌측 카운트) ≥ 10 → **WARN**: "현재 브랜치가 origin/develop 대비 {behind}커밋 뒤처짐 — git rebase origin/develop 권장". fetch 실패·원격 없음 = **fail-open silent skip**(그대로 진행).

---

### T3: DB 데이터 검증
- seed 기준 CRUD 결과 대조 + 무결성(FK/nullable/타입)
- 직접 쿼리로 실제 저장값 확인

### T6: 보안 스캔 (forge-check-security)
```python
Agent(
  subagent_type="general-purpose",
  prompt="forge-check-security 스킬 실행. FAIL(CRITICAL) → [STOP]. WARN(HIGH) → PR 본문 추가."
)
```

### T7: 성능 기준선 체크
임계값: 평균 > 2000ms → WARN / > 5000ms → FAIL / 이전 baseline 대비 +25% → WARN
결과 → `docs/qa/perf-baseline.json`

### T-migration: 마이그레이션 패리티 (`--migration` 시만)
```python
for pair in pairs["pairs"]:
    legacy_resp = curl(url=f"{auth['legacyUrl']}{pair['legacyUrl']}", cookie=auth["legacyCookie"])
    admin_resp  = curl(url=f"{auth['adminUrl']}{pair['newApiUrl']}", cookie=auth["newCookie"])
    rules = load_extraction_rules(domain=pair["domain"], screen=pair["legacyUrl"])
    legacy_data = extract(legacy_resp.html, rules)
    admin_data  = normalize(admin_resp.json)
    diff = compare(legacy_data, admin_data)
    status = "WARN(PARTIAL)" if flag else ("PASS" if not diff else "FAIL")
```

---

## §런타임 위생 — dev 환경 stale/오염 함정 (신규 2026-07-07)

> 전부 WARN·비차단. dev 서버 특유의 캐시·스로틀이 GREEN 검증을 오염시키는 것을 방지.

### Q2 — i18n/메시지 dev 캐시 (세션 중 추가한 키 미반영)
next-intl 등은 dev 서버가 메시지 번들을 캐시한다 — 세션 중 새 i18n 키를 추가하면 일부 로케일(예: `en`)은 stale(구 fallback 렌더), 다른 로케일(`ko`)만 반영될 수 있다. GREEN 검증은 **빌드 기준** 또는 **"dev-stale, prod-correct" 라벨**로 감안한다. 새 i18n 키 추가 시 dev 서버 재시작이 필요할 수 있음(런타임 위생 등록). fail-open(빌드 검증 불가 시 dev-stale 명시 후 진행).

### Q3 — 전역 단일 스로틀 버킷 (qa 트래픽이 실 fetch를 429로 차단)
백엔드 전역 ThrottlerGuard가 단일 버킷(예: 200req/60s/IP)을 공유하면, qa 자동 재현 트래픽이 버킷을 소진해 **실 페이지 SSR fetch가 429 → 화이트스크린**(qa가 스스로 버그 유발). qa 성능/재현은 **전역 스로틀 인지** — 테스트 트래픽 스로틀 또는 test 환경 스로틀 상향. (forge-fix F6 rate-limit 신호오염 판별과 동일 축.) fail-open(스로틀 정보 없으면 요청 간 간격만 두고 진행).

### Q4 — NEXT_PUBLIC_* 빌드 베이킹
`NEXT_PUBLIC_*`는 빌드 시 베이킹된다. web을 로컬 API로 붙이려면 `NEXT_PUBLIC_API_URL` 오버라이드 필요(원격 dev URL이 `.env.local` 기본). qa-web 런처에 표준 주입한다(런처가 env를 주입 후 기동). 미주입 시 원격 dev API로 붙어 로컬 변경 미반영 — 오탐 위험(WARN).

---

## §Phase C.5 상세 — Spec-Code 판별 + Reconciliation

Phase C에서 FR 불일치(FAIL)가 발견될 때마다, 코드를 자동으로 스펙 방향에 맞춰 되돌리기 전에 방향을 판별한다.

**판별기 호출**:
```bash
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/spec-code-discriminate.sh" <spec_file> <impl_file1>[,<impl_file2>,...]
```
- `spec_file`: 불일치가 참조하는 `.spec.md` (FR 항목 출처)
- `impl_file(s)`: bug-fix-plan의 "영향 파일" / bug-report의 "Where" 필드에서 취득한 실 구현 파일(들). 콤마 또는 공백 구분, 여러 개면 가장 최근 커밋 파일 기준으로 판별
- CWD는 반드시 대상 제품 레포(git 명령이 그 레포 히스토리를 조회)

**출력 JSON 필드**:
| 필드 | 설명 |
|------|------|
| `classification` | `IMPL_GAP` \| `SPEC_STALE_CANDIDATE` \| `AMBIGUOUS` |
| `route` | `lane_a_fix` \| `reconciliation_gate` |
| `signals.code_newer` | impl 최신 커밋 timestamp > spec 커밋 timestamp 여부 |
| `signals.intentional_commit` | impl 최신 커밋 메시지가 `feat/fix/refactor/perf(...)` 패턴 + `qa-/revert/reconcile/rollback` 아님 |
| `signals.spec_commit_ts` / `signals.impl_commit_ts` | 각 파일의 최신 커밋 unix timestamp (git 미추적 시 0) |
| `signals.impl_subject` | impl 최신 커밋 메시지 (120자 절삭) |
| `reason` | 판정 근거 1줄 |

**라우팅 표**:
| classification | route | 처리 |
|---|---|---|
| `IMPL_GAP` | `lane_a_fix` | 그대로 Phase D~F Lane A(`/forge-fix`) 위임 — 코드 수정 |
| `SPEC_STALE_CANDIDATE` | `reconciliation_gate` | Reconciliation 게이트 — Human 승인 필요 |
| `AMBIGUOUS` | `reconciliation_gate` | Reconciliation 게이트 (안전 기본값 — 판별 불가/신호부족/spec 미추적/판별기 실행실패 전부 포함) |

**스펙 정정 경로 흐름** (Human "스펙 노후 확정" 선택 시만):
```
Human 승인(reconciliation 게이트 [STOP])
  → .spec.md 해당 FR 항목 갱신 (실제 구현 동작 반영)
  → contract-gen.py 재실행 (evaluator-contract.json 재생성)
  → scenarios.md / scenarios-filtered.md 해당 FR 시나리오 재생성
  → 재검증 (Phase C 해당 시나리오 재실행 → PASS 확인)
```
이 경로에서의 `.spec.md` 변경은 `dev-workflow-rules.md §Spec 관리`의 "구현 중 사후 변경 금지" 예외(Human 승인 하 B 국면)에 해당한다. AI가 Human 승인 없이 자체적으로 spec을 정정하는 것은 여전히 금지.

**advisor 스폰 예시** (qa는 메인 컨텍스트이므로 직접 1-level 스폰, 중첩 시 `[→Lead 위임]`):
```python
Agent(
    subagent_type="advisor-strategist",
    prompt=f"""
불일치 요약: {mismatch_summary}          # ~200 토큰
판별 신호: {discriminate_json}           # spec-code-discriminate.sh 출력
영향: {impact_summary}                   # ~300 토큰 (FR/화면/사용자 영향)
질문: 이 불일치는 (A) 구현 미달(코드 수정) vs (B) 스펙 노후(spec 정정) 중 어느 쪽으로 권고하는가?
    """
)
```
이 게이트의 advisor는 **Opus**(비-Fable — T4 비가역 결정 아님, 통상 자문 등급).

---

## §qa advisor 자문 지점 (Q1/Q2) 상세

버그 수정(Lane A `/forge-fix`)의 advisor T1~T4·위 Phase C.5 Reconciliation 게이트와 별개로, qa 자신의 **discovery 국면**(Phase B/C)에도 2개 저빈도 고위험 자문 지점이 있다. 공통 규약은 Phase C.5 절의 것과 동일 — Opus(비-Fable), advisory only, non-blocking, `[→Lead 위임]`(중첩 시).

### Q1 — Phase B 테스트 커버리지 3건+ 동시 면제

- **스폰 시점**: Phase B 8카테고리 시나리오 작성 완료 후, 면제(exempt) 카테고리 수 집계 시점.
- **트리거 조건**: 동시 면제 카테고리 수 ≥ 3 (2건 이하는 스폰하지 않음 — 비용 방지).
- **프롬프트 형식**:
```python
Agent(
    subagent_type="advisor-strategist",
    prompt=f"""
면제 제안 카테고리: {exempt_list}         # N개, 각 "카테고리: [번호] / 사유: <1줄>" 나열, ~500 토큰
질문: 테스트 커버리지 축소 리스크는 무엇이며, 대안(부분 커버리지/후속 스캔/스코프 축소 등)이 있는가?
    """
)
```
- **응답 반영**: advisor 응답(400~700 토큰)을 [STOP] 보고서에 그대로 포함 — 면제 승인·최종결정은 Human. advisor 결론은 참고용이며 자동 승인/거부에 사용하지 않는다.

### Q2 — Phase C 대량 동시 FAIL(구조적 결함 의심)

- **스폰 시점**: Phase C 시나리오 실행 직후, FAIL 집계 시점 (개별 bug-N 파일링·Lane A 위임 **전**).
- **트리거 조건(기본값, 튜닝 가능)**: 동일 도메인/FR군 시나리오의 50%+ FAIL **또는** 절대 5건+ 동시 FAIL. 두 임계값 중 하나라도 충족하면 스폰.
- **프롬프트 형식**:
```python
Agent(
    subagent_type="advisor-strategist",
    prompt=f"""
대량 FAIL 패턴 요약: {fail_pattern_summary}   # 도메인/FR군, FAIL 시나리오 수, 공통 에러 시그니처 ~500 토큰
질문: 이 대량 FAIL은 (A) 구조적 단일결함(공통 근본원인 1건) vs (B) 개별 무관 버그 N건 중 어느 쪽으로 보이는가? 접근 재정렬 조언은?
    """
)
```
- **응답 반영**: 구조적 단일결함으로 판단되면 bug-fix-plan을 근본원인 1건으로 수렴 작성(개별 N건 bug-report 남발 방지). 개별 버그로 판단되면 기존대로 각각 파일링. **최종 판단은 Human/오케스트레이터** — advisor는 조언만 제공, Phase D~F 라우팅을 자동 결정하지 않는다.

### 공통 규약 (Q1/Q2)

- 모델 = Opus(비-Fable — `advisor-model-resolve.sh` 호출 불필요, `advisor-strategist` 기본이 Opus).
- advisory only: `[STOP]` 해제·자동재시도·최종판정 불가.
- 저빈도 고위험 지점에만 스폰 — 매 시나리오·매 버그마다 스폰 금지(비용 방지).
- non-blocking: advisor 스폰 실패/미가용 시에도 해당 [STOP]·판단은 그대로 Human에게 진행(advisor는 augmentation, 하드 의존 아님).
- 중첩 실행 컨텍스트(subagent 내부)에서는 직접 스폰 대신 `[→Lead 위임]` 요청.

---

## §Phase D 상세 — bug-fix-plan 필수 필드

```yaml
## Fix-{N}: {bug-report.md Bug-N 제목}

유형: UI/UX | API | DB | 혼합
cross_repo: false

Who: <발견자/롤>
What: <증상 1줄 + 기대값 vs 실제값>
When: <조건/타이밍>
Where: <위치>
Why_hypothesis: <추정 원인 1줄>  # Phase D 필수
Why_root_cause: <미작성>          # healer a4 완료 후 필수
How: |
  재현 단계: ...
  재현율: N/3

영향 파일: [...]
수정 방향: <3줄 이내>
회귀 위험: LOW | MEDIUM | HIGH
healer 분담: 병렬 | 순차
복잡도: SIMPLE | MODERATE | HIGH | AMBIGUOUS
```

**evaluator-contract.json 자동 생성**:
```bash
python3 ~/forge/.claude/skills/qa/scripts/contract-gen.py \
  --plan docs/qa/{date}-bug-fix-plan.md \
  --scenarios docs/qa/scenarios-filtered.md \
  --scope {scope}
```

---

## §Phase E 상세 — Healer 복잡도 라우팅

### SIMPLE
```python
Agent(subagent_type="healer", model="sonnet",
      prompt=f"bug_report: {bug_report_path} Bug #{bug_num}\ncontract: {contract_path}")
```

### MODERATE (Agent Teams + worktree)
```python
for bug_id in independent_set:
    Agent(subagent_type="healer", model="sonnet", isolation="worktree",
          prompt=f"Bug #{bug_id}...")
```

### HIGH (PGE + 5 specialist) — cross-repo 전용
```python
is_cross_repo = bug_fix_plan.cross_repo
pge_available = (bash("pge_skill_available").returncode == 0)

if is_cross_repo and pge_available:
    agents = [
        Agent(subagent_type="healer", model="sonnet", isolation="worktree"),
        Agent(subagent_type="code-reviewer", model="sonnet"),
        Agent(subagent_type="security-best-practices-reviewer", model="sonnet"),
        Agent(subagent_type="general-purpose", model="haiku",
              prompt="gitnexus impact_analysis for {changed_files}"),
        Agent(subagent_type="general-purpose", model="haiku",
              prompt="rag-search for similar bugs: {error_class}"),
    ]
```

### Vision evaluator (UI/UX 버그 — JSON schema)
```python
vision_eval = Agent(
    subagent_type="general-purpose", model="sonnet",
    prompt=f"""
JSON schema 출력 (필수):
{{
  "schema_version": "1.0",
  "bug_id": "bug-{N}",
  "verdict": "PASS|FAIL",
  "evaluator_model": "claude-sonnet-vision",
  "aspect_details": {{
    "layout_alignment": {{"pass": true|false, "comment": "..."}},
    "color_spacing": {{"pass": true|false, "comment": "..."}},
    "interactive_state": {{"pass": true|false, "comment": "..."}},
    "text_legibility": {{"pass": true|false, "comment": "..."}}
  }},
  "viewports": ["mobile", "tablet", "desktop"],
  "ts": "<ISO-8601>"
}}
출력: docs/qa/reviews/visual/{DATE}-bug-{N}.json
    """
)
```

### bug 유형 라우터
```python
if bug.유형 == "UI/UX":
    verify_path = "visual-pipeline"  # 7축(프론트) + Vision evaluator + pixel diff
elif bug.유형 in ["API", "DB"]:
    verify_path = "verify-sh"        # verify.sh + 7축(백엔드) + data integrity
else:
    verify_path = "both"
```

---

## §Hotfix 상세 — Phase D 자동 생성 + 단일 파일 가드

```python
import os
from datetime import datetime
DATE = datetime.now().strftime('%Y-%m-%d')
BUG_TEXT = os.environ.get('QA_BUG_TEXT', '')
plan = f"""## Fix-1: {BUG_TEXT}

- **원인 가설 (확정)**: {BUG_TEXT}
- **영향 파일**: 미확정 (healer가 특정)
- **수정 방향**: 단일 파일 수정 (hotfix 가드 적용)
- **회귀 위험**: LOW
- **healer 분담**: 순차
- **복잡도**: SIMPLE
- **hotfix-mode**: true
"""
os.makedirs('docs/qa', exist_ok=True)
with open(f'docs/qa/{DATE}-bug-fix-plan.md', 'w') as f:
    f.write(plan)
```

**단일 파일 가드** (Phase E 완료 후):
```bash
CHANGED=$(git diff --name-only HEAD~1 HEAD 2>/dev/null | grep -v "^docs/" | wc -l)
if [ "${CHANGED:-0}" -gt 1 ] && [ "${QA_MODE:-}" = "hotfix" ]; then
    echo "[STOP] Hotfix 단일파일 초과: ${CHANGED}개 파일. /qa 풀모드 재분류 필요." >&2
    exit 2
fi
```

---

## §Phase F~H 상세 코드

### Phase F — cr-* queue 폴링
```python
queue_path = "docs/qa/cr-trigger-queue.jsonl"
if os.path.exists(queue_path):
    with open(queue_path) as f:
        for line in f:
            entry = json.loads(line)
            if entry.get("status") == "pending":
                # 1. /cr-bug {entry['bug_report']}
                # 2. /cr-code {changed_files}
                # 3. /cr-test {qa_report}
                # 4. /cr-final {pr_body}
                # 5. bash scripts/codex-cr-final.sh {pr_body}
```

### Phase G — PR + CI + develop 머지
```bash
gh pr create \
  --title "QA Auto-Fix: ${QA_SCOPE} — ${BUG_COUNT} bugs resolved" \
  --body "$(cat docs/qa/${DATE}-final-qa-report.md)" \
  --base develop \
  --head "${QA_BRANCH}"

bash ~/forge/.claude/skills/qa/scripts/ci-wait.sh "${QA_BRANCH}"
bash ~/forge/.claude/skills/qa/scripts/codex-cr-final.sh "${PR_BODY_PATH}"
gh pr merge --squash --delete-branch
git checkout develop && git pull
git worktree prune
```

### Phase H — 지식 축적
```bash
# metrics.jsonl append
python3 -c "
import json, os; from datetime import datetime
metrics = {'date': '${DATE}', 'scope': os.environ.get('QA_SCOPE','full'),
           'bugs_found': 0, 'bugs_fixed': 0, 'cycles': 0, 'mttr_min': 0, 'regression_count': 0}
with open('docs/qa/metrics.jsonl', 'a') as f:
    f.write(json.dumps(metrics) + '\n')
"
git worktree prune
find "${HOME}/.claude/worktrees/qa-"* -maxdepth 0 -mtime +7 -exec rm -rf {} \; 2>/dev/null || true
```

---

## §Healer 루프 상세 (Phase 3 / Phase E — P1-B, AD-92)

### 3-0. 파일·도메인 친화도 분석
```python
DOMAIN_KEYWORDS = ["customer", "payment", "member", "order", "alarm", "board", "auth"]
bug_meta = {}
for bug in bug_list:
    files = extract_files_from_report(bug.report_path)
    domain = extract_domain_from_report(bug.report_path, DOMAIN_KEYWORDS)
    bug_meta[bug.id] = {"files": files or {"UNKNOWN"}, "domain": domain or "unknown"}

independent_set = []
sequential_queue = []
all_files = set(); all_domains = set()

for bug_id, meta in bug_meta.items():
    file_conflict   = bool(meta["files"] & all_files)
    domain_conflict = meta["domain"] != "unknown" and meta["domain"] in all_domains
    if file_conflict or domain_conflict:
        sequential_queue.append(bug_id)
    else:
        independent_set.append(bug_id)
        all_files |= meta["files"]
        if meta["domain"] != "unknown":
            all_domains.add(meta["domain"])
```

### 3-2. 직렬 회귀 게이트 + worktree 병합
```bash
for (bug_id, branch) in completed_parallel_results_in_order:
    git merge --no-ff "$branch" -m "Healer: Bug #${bug_id} fix"
    # merge 실패 시 [STOP]
    bash verify.sh
    # 회귀 감지 시 git revert HEAD + [STOP]
    update_baseline_json()
```

### 3-4. 전역 가드
- 총 사이클 6 초과 → [STOP]
- same-issue 3회(sha256 키) → [STOP]
- 회귀 감지 → 즉시 [STOP]
- worktree 병합 충돌 → [STOP]

---

## §Phase 입출력 책임 표 (AD-96-MVP M9)

| Phase | 입력 | 출력 | 책임자 |
|-------|------|------|--------|
| Phase A | `/qa` 호출 + scope | `fix/qa-{scope}-{date}` 브랜치 | qa orchestrator |
| Phase B | scenarios.md | bug-fix-plan.md + artifacts/ + before(RED) 3장 | qa orchestrator |
| Phase D | bug-report.md | bug-fix-plan.md (Why_hypothesis) + evaluator-contract.json | qa orchestrator |
| Phase E a0 | bug-fix-plan.md + 증거 로그 | READ_CONFIRMED prefix + before(RED) 재현 확인 | healer |
| Phase E a1 | a0 결과 | Why_root_cause append | healer |
| Phase E a4 | 수정 코드 | after(GREEN) 3장 + Vision evaluator 위임 요청 | healer |
| Phase E Vision | GREEN 6장 + expected | vision JSON (`docs/qa/reviews/visual/`) | Lead (Vision evaluator subagent) |
| Phase F | bug-fix-plan.md + vision JSON | cr-* 결과 JSON | cr-* agents |
| Phase G | cr-* PASS | PR + CI 대기 | qa orchestrator |
| Phase H | 완료 PR | metrics.jsonl + wiki-sync | qa orchestrator |

---

## §Artifact 보존 정책 (AD-96-MVP M9)

| 종류 | 경로 | 보존 기간 | 비고 |
|------|------|----------|------|
| before(RED) 스크린샷 | `docs/qa/artifacts/bug-{N}-red-{vp}-shot.png` | 30일 | H2 gate |
| after(GREEN) 스크린샷 | `docs/qa/artifacts/bug-{N}-green-{vp}-shot.png` | 30일 | H2 gate |
| trace.zip | `docs/qa/artifacts/bug-{N}-trace.zip` | 14일 | **git LFS** |
| 로그 (console/network/js) | `docs/qa/artifacts/bug-{N}-*.log` | 30일 | **secret redact 의무** |
| 백엔드 로그 | `docs/qa/artifacts/bug-{N}-*.log` | 30일 | **secret redact 의무** |
| Vision evaluator JSON | `docs/qa/reviews/visual/{date}-bug-{N}.json` | 영구 | H6 gate |
| data integrity JSON | `docs/qa/artifacts/bug-{N}-data-integrity-*.json` | 30일 | row sample PII 마스킹 |

**Secret redact 의무**: 이메일, 전화번호, 토큰, API 키, 비밀번호 → `[REDACTED_EMAIL]`, `[REDACTED_TOKEN]`, `[REDACTED_KEY]`

---

## §Rubric 상세 — AI 슬롭 체크리스트 + 도메인별 불합격 기준

### AI 슬롭(Slop) 체크리스트
- [ ] 기능과 무관한 코드 블록 없음
- [ ] 동일 로직 중복 없음 (copy-paste)
- [ ] 미사용 변수/함수/import 없음
- [ ] 주석이 코드와 일치함

### 도메인별 즉시 불합격 기준

**UI/Web 작업**
- "Bootstrap 기본 느낌" UI → 불합격 (디자인 시스템 미반영)
- 하드코딩된 색상/폰트 (design-tokens 미사용) → 불합격
- 모바일 미대응 레이아웃 → 불합격

**코드 작업**
- "AI 슬롭" (무의미 반복, 복붙, 미사용 코드) → 불합격
- 하드코딩된 시크릿/API키 → 즉시 불합격
- Spec 의도와 다른 구현 방향 → 불합격

**게임 (GodBlade) 작업**
- Unity 빌드 에러 잔존 → 불합격
- 테스트 환경에서 60fps 미달 → 불합격

### 피드백 작성 규칙

모든 피드백은 **위치 + 이유 + 방법** 3요소:
- 나쁜: "코드가 지저분합니다"
- 좋은: "auth.ts 45~60줄에 중복 로직이 있습니다(위치). 같은 토큰 검증 코드가 3번 반복되어 AI 슬롭입니다(이유). 공통 함수 `validateToken()`으로 추출하세요(방법)."

### Evaluator 핵심 원칙: 절대 관대하게 보지 마라

LLM은 다른 LLM 결과물에 관대해지는 경향이 있음 — 더 엄격하게 본다:
- "나쁘지 않은데..." → 감점
- "이 정도면 괜찮지 않나?" → 감점
- 한 항목이 좋아도 다른 항목 문제를 상쇄하지 않는다
- SELF_CHECK.md(Generator 자체 점검)를 그대로 믿지 않는다
