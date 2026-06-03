---
name: qa
description: QA 전 사이클 오케스트레이터 (AD-93 Phase A~H). 브랜치 생성→시나리오 전수→버그 발견→수정 계획→Healer 병렬→cr-* + Codex 검증→develop 자동 머지→Wiki 축적. 스코프 지정 가능 (--scope=full|domain|file-pattern).
role: orchestrator
user-invocable: true
model: sonnet
---

**역할**: QA 전 사이클 오케스트레이터 (AD-93). Phase A~H 전체를 메인 컨텍스트에서 순서대로 실행한다.
**컨텍스트**: Phase 8 Check 8.7 PASS 후 자동 트리거 또는 `/qa` 호출 시. 메인 컨텍스트 직접 실행 (context:fork 폐지 — AD-92-1).
**출력**: `docs/qa/YYYY-MM-DD-final-qa-report.md` + `docs/qa/baseline.json` + PR (develop 자동 머지)

# QA — E2E 자율 QA 파이프라인 (AD-93, Phase A~H)

> **AD-92-1**: 메인 컨텍스트 실행. 서브에이전트 스폰은 메인→1레벨만 (중첩 금지 — Claude Code 공식 제약).
> **AD-92-2**: 기대값 = Spec/Human/레거시. 코드 역산 금지.
> **AD-92-3**: DB 변이 테스트 = 트랜잭션 롤백 or 매 사이클 seed 재주입.

## 사용법

```
/qa                                       # 전체 QA (Phase A~H, --scope=full)
/qa --scope=auth                          # auth 도메인만 (qa-config domains 매칭)
/qa --scope="src/routes/payment/**"       # file-pattern 스코프
/qa --spec auth.md                        # 특정 Spec만
/qa --cycle 1                             # 1사이클만 (Phase B~C)
/qa --migration --legacy http://HOST:PORT # AD-92 P1 migration 패리티 모드
/qa --mode=hotfix --bug "<이슈 설명>"     # hotfix 모드 (Phase B~C 스킵, forge-fix 내부 전달)
/qa --mode=hotfix --bug "<text>" --skip-final  # cr-test/cr-final 선택 스킵
```

자동 트리거: Phase 8 Check 8.7 PASS → 자동 실행

---

## E2E 자율 시퀀스 (Phase A~H)

> **Human 개입 없이 100% 자율 진행. Human은 develop 머지 후 final-qa-report만 검수.**

```
[User] /qa --scope={domain|full}
   │
   ▼ AI 자율 진행
   ├─ Phase A: branch 생성 (fix/qa-{scope}-{YYYY-MM-DD}) [자동, §A13 idempotency]
   │           develop 브랜치 확인 → 기존 fix/qa-* 브랜치 검사 → resume/신규/v2 분기
   │           LOG_HTTP=1 / LOG_SOCKET=1 / LOG_DB=1 자동 export
   │
   ├─ Phase B: 시나리오 전수 작성
   │           qa-setup → gitnexus route_map → scenarios.md (전체 API/페이지)
   │           --scope 필터 적용 → scenarios-filtered.md
   │           출처 격리: Spec FR 우선, Spec 없음 → legacy 동작 출처 (코드 역산 금지)
   │
   ├─ Phase C: 버그 발견 + 아티팩트 수집
   │           T1(API) + T2(UI) + T3(DB) + T6(보안) + T7(성능) 실행
   │           FAIL → artifacts/bug-{N}-{shot|http|server|console}.* 강제 생성
   │           6하원칙 bug-report.md 작성
   │
   ├─ Phase D: 버그 수정 계획서
   │           docs/qa/{date}-bug-fix-plan.md 신규 생성
   │           버그별: 원인가설 / 영향파일 / 수정방향 / 회귀위험 / healer분담 / 복잡도
   │           docs-diff → bug-fix-plan-diff.md (healer worktree 스코프 가드)
   │
   ├─ Phase E: Healer 병렬 수정 (worktree 격리)
   │           복잡도별 자동 라우팅: SIMPLE→subagent1 / MODERATE→AgentTeams+worktree
   │           HIGH→PGE+5specialist / AMBIGUOUS→/investigate 선행
   │           직렬 회귀 게이트: 병렬 완료 후 순서대로 머지 + 회귀 감지
   │
   ├─ Phase F: 검증 전수 (cr-* + Codex)
   │           1. /cr-bug {bug-report}       (수정 적정성)
   │           2. /cr-code {changed-files}   (코드 품질)
   │           3. /cr-test {qa-report}       (커버리지·fake-pass)
   │           4. /cr-final {PR-body}        (Claude, 적대적 리뷰)
   │           5. Codex /cr-final            (third-party LLM, PR 머지 직전 1회)
   │           → 전부 PASS/WARN 시에만 Phase G 진입
   │
   ├─ Phase G: PR 생성 → CI → develop 자동 머지 [자동]
   │           gh pr create --base develop --head fix/qa-{scope}-{date}
   │           bash scripts/ci-wait.sh {branch} (15분 timeout + CI FAIL 패턴 분석)
   │           bash scripts/codex-cr-final.sh {pr-body} → docs/reviews/codex-final/{date}-*.json
   │           9 조건 모두 충족 시 → gh pr merge --squash --delete-branch
   │           (MVP: 수동 머지. auto-merge hook = AD-97 향후)
   │           git checkout develop && git pull && git worktree prune
   │
   └─ Phase H: 지식 축적 + 메트릭 + 정리 (AD-93 W5)
               learnings.jsonl append (healer 종료 시)
               wiki-sync 자동 트리거 (nohup background, Human 승인 유지)
               docs/qa/intervention-log.jsonl append (Human override 발생 시)
               docs/qa/metrics.jsonl append {date, scope, bugs_found, bugs_fixed, cycles, mttr_min, regression_count}
               docs/qa/{date}-final-qa-report.md (Human 검수용)
               git worktree prune (orphan cleanup, §A10)
               ~/.claude/worktrees/qa-* 7일+ 자동 삭제
   │
   ▼
[User] final-qa-report 검수 (develop 머지 완료 상태)
```

### 자동 머지 조건 (9개 전부 충족)

- [✓] /cr-bug PASS/WARN
- [✓] /cr-code PASS/WARN
- [✓] /cr-test PASS/WARN
- [✓] /cr-final PASS/WARN (Claude Sonnet, 적대적)
- [✓] Codex /cr-final PASS (third-party LLM — 미충족 시 develop 머지 X)
- [✓] 보안 CRITICAL 0건
- [✓] 회귀 0건 (baseline 대조)
- [✓] GitHub CI PASS
- [✓] 모든 시나리오 PASS

### Iron Laws (전 Phase 공통)

- **main 직접 머지 X** (MERGE-IRON-1 — develop만 자동, main은 Human)
- 회귀 감지 / same-issue 3회 (`sha256({file_path}:{symbol}:{error_class})`) / 6사이클 초과 → 즉시 [STOP]
- 보안 CRITICAL → 즉시 [STOP] + Human 알림
- Lethal Trifecta (미신뢰 외부 입력 + DB write + 코드쓰기 동시) → 즉시 [STOP]
- subagent → subagent 중첩 금지 (Claude Code 1-level)

---

## Hotfix 모드 (`--mode=hotfix`) — AD-95

`/forge-fix <이슈>` 또는 직접 `--mode=hotfix` 호출 시 경량 흐름 (Phase B~C 스킵):

```
/qa --mode=hotfix --bug "<text>"
  ├─ Phase A: 브랜치 생성 (hotfix/{slug} prefix)
  ├─ Phase B~C: SKIP (시나리오 전수 + 버그 발견 생략)
  ├─ Phase D: bug-fix-plan.md 자동 생성 (SIMPLE 고정)
  ├─ Phase E: SIMPLE 라우팅만 (healer 1개, model=sonnet)
  ├─ Phase F: cr-bug + cr-code 필수 / cr-test + cr-final = 옵션
  └─ Phase G~H: 동일 (PR + CI + develop 자동 머지 + 지식 축적)
```

### Hotfix bug-fix-plan.md 자동 생성 (Phase D 진입 직전)

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
print(f'[Hotfix] bug-fix-plan.md 자동 생성')
```

### 단일 파일 가드 (Phase E 완료 후)

```bash
# healer worktree 병합 직전 — 2+ 파일 변경 감지 시 [STOP]
CHANGED=$(git diff --name-only HEAD~1 HEAD 2>/dev/null | grep -v "^docs/" | wc -l)
if [ "${CHANGED:-0}" -gt 1 ] && [ "${QA_MODE:-}" = "hotfix" ]; then
    echo "[STOP] Hotfix 단일파일 초과: ${CHANGED}개 파일. /qa 풀모드 재분류 필요." >&2
    exit 2
fi
```

### Hotfix cr-* 시퀀스 (Phase F 경량)

- `cr-bug` + `cr-code` = **필수**
- `cr-test` + `cr-final` = `--skip-final` 플래그 시 SKIP (기본 = 실행)

---

## Phase A — 자동 브랜치 생성 (AD-93 W4, §A13 idempotency)

```bash
# 1. develop 확인
CURRENT=$(git branch --show-current)
[ "$CURRENT" = "develop" ] || { echo "[STOP] develop 브랜치 아님: ${CURRENT}" >&2; exit 2; }

# 2. 기존 브랜치 검사 (idempotency)
DATE=$(date '+%Y-%m-%d')
BRANCH="fix/qa-${QA_SCOPE:-full}-${DATE}"

if git show-ref --verify --quiet "refs/heads/${BRANCH}"; then
  # 머지 여부 확인
  if git log develop --merges --oneline 2>/dev/null | grep -q "${BRANCH}"; then
    BRANCH="${BRANCH}-v2"  # 이미 머지됨 → 신규 브랜치
    echo "[Phase A] 기존 브랜치 머지됨 → ${BRANCH} 신규 생성" >&2
  else
    echo "[RESUME] 기존 ${BRANCH} 재진입 (미머지 → resume 모드)" >&2
    git checkout "${BRANCH}"
    # resume: 기존 산출물 확인 → 미처리 Phase부터 재개
    exit 0  # Phase 0으로 이어짐
  fi
else
  echo "[Phase A] 신규 브랜치: ${BRANCH}" >&2
fi

# --force-new: 기존 브랜치 무시하고 신규 생성
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

---

## Phase B — 시나리오 작성 8 카테고리 강제 (AD-96 W14)

> **H26·H27 phase-gate**: scenarios.md 미작성 or 8 카테고리 미커버 → Phase B 실행 차단.

**8 카테고리 강제** (모두 1개 이상 포함):

| # | 카테고리 | 기법 | 면제 조건 |
|---|---------|------|---------|
| 1 | Happy Path | Equivalence partitioning | - |
| 2 | Boundary Value | BVA | - |
| 3 | Negative Input | Error guessing + Security | - |
| 4 | Error / Exception Flow | Fault injection | 프론트 컴포넌트 면제 가능 |
| 5 | State Transition | State transition + Decision table | 정적 페이지 면제 가능 |
| 6 | Concurrency / Race | Pairwise + Load | 정적 페이지 면제 가능 |
| 7 | Security | OWASP Top 10 | - |
| 8 | A11y / Cross-env / i18n | Compatibility + WCAG | - |

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

**면제 시**: `면제 카테고리: [N] / 사유: <1줄>` 명시. 3건 이상 동시 면제 = [STOP].

---

## Phase B — Bug-ID Allocator + 카테고리별 병렬 실행 (AD-96-MVP M2)

### Bug-ID Allocator (MED#6 수용)

**시나리오 FAIL 시점에 bug-ID 부여**. Phase B에서 시나리오 실행 → FAIL 감지 즉시:

```python
# Phase B T1/T2/T3 실행 중 FAIL 시
if scenario.result == "FAIL":
    bug_id = allocate_bug_id()  # docs/qa/.bug-id-counter (atomic increment)
    # artifacts/ 디렉토리 생성 + 로그 수집 즉시 시작
    mkdir(f"docs/qa/artifacts/bug-{bug_id}/")
    collect_artifacts(bug_id, scenario)  # 프론트: 4종 + trace / 백엔드: 3종
    # before(RED) 3장 캡처 (UI 버그)
    for vp in ["mobile", "tablet", "desktop"]:
        capture(f"docs/qa/artifacts/bug-{bug_id}-red-{vp}-shot.png")
```

### 카테고리별 병렬 실행 룰 (MED#7 수용)

> **H28 phase-gate**: 카테고리 1·2·3·4·6·8 합산 5+건인데 직렬 시도 → 차단.

| 카테고리 | 병렬 정책 | 이유 |
|---------|---------|------|
| 1·2·3·8 | 병렬 가능 (worktree 권장) | 상태 독립 |
| 4·6 | **worktree 격리 필수** + 병렬 가능 | fault injection / race condition 격리 |
| 5·7 | **직렬 의무** (5+건 산정 제외) | 상태·세션·보안 오염 방지 |

```python
# Phase B 실행 — 카테고리 분류 먼저
serial_cats   = [s for s in scenarios if s.카테고리 in [5, 7]]   # 직렬 의무
worktree_cats = [s for s in scenarios if s.카테고리 in [4, 6]]   # worktree 격리
parallel_cats = [s for s in scenarios if s.카테고리 in [1,2,3,8]]  # 병렬 가능

# H28: parallel_cats + worktree_cats 합산 5+건 = Agent Teams 병렬 강제
parallel_set = parallel_cats + worktree_cats
if len(parallel_set) >= 5:
    agents = [
        Agent(
            subagent_type="general-purpose", model="haiku",
            isolation="worktree" if s.카테고리 in [4,6] else None,
            prompt=f"시나리오 #{s.N} 실행 + 7축 발견 기준 적용"
        )
        for s in parallel_set
    ]  # 단일 메시지로 묶어야 실제 병렬

# serial_cats (카테고리 5/7): 항상 직렬
for s in serial_cats:
    run_scenario(s)
```

---

## Phase 0 — 하네스 부트스트랩

`qa-setup` 스킬 호출:
- 서버 생명주기 (기동/재사용/폴링)
- DB seed 격리 (매 사이클 재주입)
- API 전수 발견 (gitnexus route_map → scenarios.md)
- verify.sh 생성 (인증 하네스 포함)
- Phase 0 완료 조건 미충족 시 → **[STOP]** (진입 불가)

## Phase 1 — 테스트 실행 (메인 → 서브에이전트, 1레벨)

### T1: API 전수 테스트 (verify.sh) — 인증 포함 + 백엔드 7축 (AD-96)

> **백엔드 7축 발견 기준**:

| # | 축 | 도구 | 판정 기준 |
|---|---|------|---------|
| 1 | HTTP status | api-e2e + verify.sh | expected status 일치 |
| 2 | Response schema | OpenAPI 스키마 대조 | drift 0건 |
| 3 | Server log ERROR/FATAL | tail -f server.log + grep | ERROR/FATAL 0건 (allowlist 외) |
| 4 | **데이터 무결성** (5 하위) | (아래 참조) | 5개 모두 PASS |
| 5 | Spec FR / API 계약 | spec-compliance-checker | FR-ID ↔ 엔드포인트 동작 |
| 6 | Latency SLO | performance-checker | p95 < threshold |
| 7 | 트랜잭션 정합 | 동시 요청 + race | 데드락/lost update 0건 |

**데이터 무결성 5 하위** (축4, H12 baseline-vs-postfix 강제):
- 4a 제약 무결성 (FK/UNIQUE/NOT NULL/CHECK) — 위반 row 0건
- 4b 트랜잭션 ACID — 부분 commit/dirty read/lost update 0건
- 4c 논리 정합 (cross-row/cross-table 비즈니스 룰) — 위반 row 0건
- 4d 상태 머신 정합 (전이 룰 skip/역행) — 비정상 전이 row 0건
- 4e 시계열·참조 무결성 (orphan FK, created_at > updated_at) — 위반 0건

**백엔드 3종 로그 자동 수집** (H3 차단):
```bash
tail -n 1000 server.log | grep -E "ERROR|FATAL|Exception" > docs/qa/artifacts/bug-${N}-server.log
psql "$DATABASE_URL" -c "SELECT * FROM pg_stat_statements WHERE query LIKE '%${TARGET}%'" > docs/qa/artifacts/bug-${N}-db.log
# http.log = api-e2e 도구 자동 수집
```

- scenarios.md 전 엔드포인트 → verify.sh TEST CASES 자동 채움
- **flaky 방어**: FAIL 시 2회 재시도 → 3/3 FAIL만 진짜 버그 (재현율 기록)
- DB seed 데이터 사용, mock 금지

### T2: UI/UX 시각 검증 (playwright-parallel-test + 7축 발견 기준) — AD-96

> **프론트 7축 발견 기준** (H2 artifact-verifier 차단):

| # | 축 | 도구 | 판정 기준 |
|---|---|------|---------|
| 1 | Console error | playwright console listener | error 0건 (allowlist 외) |
| 2 | Network 4xx/5xx | playwright network listener | 4xx/5xx 0건 (의도된 401 제외) |
| 3 | JS exception | window.onerror + unhandledrejection | exception 0건 |
| 4 | Spec FR 정합 | bug-fix-plan `위반 FR` 필드 | Spec FR ↔ UI 동작 매핑 |
| 5 | Visual diff | Playwright `toHaveScreenshot()` | pixel ratio < 1% |
| 6 | a11y / Lighthouse | forge-check-ui (axe-core + Lighthouse) | a11y ≥ 90, perf ≥ 80 |
| 7 | 인터랙션 정합 | playwright user-flow + Vision evaluator | 클릭/폼/네비/모달 expected |

**우선순위**: 축1~3 (자동 명백) > 축4~5 (스키마/Spec) > 축6~7 (자가판정 영역, evaluator 격리)

**프론트 4종 로그 자동 수집** (T2 + Phase E a0/a4 — H2 차단):
```javascript
// docs/qa/artifacts/bug-{N}-*.log 자동 생성
await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
const consoleErrors = [], networkFailures = [], jsExceptions = [];
page.on('console', msg => msg.type() === 'error' && consoleErrors.push(msg.text()));
page.on('response', r => r.status() >= 400 && networkFailures.push({ url: r.url(), status: r.status() }));
page.on('pageerror', e => jsExceptions.push(e.message));
// ...시나리오 실행...
await context.tracing.stop({ path: `docs/qa/artifacts/bug-${N}-trace.zip` });
fs.writeFileSync(`docs/qa/artifacts/bug-${N}-console.log`, consoleErrors.join('\n'));
fs.writeFileSync(`docs/qa/artifacts/bug-${N}-network.log`, JSON.stringify(networkFailures));
fs.writeFileSync(`docs/qa/artifacts/bug-${N}-js-exceptions.log`, jsExceptions.join('\n'));
```

**forge-check-ui 자동 호출** (T2 완료 후 → Phase E a4도 동일):
```python
Agent(subagent_type="general-purpose", model="haiku",
      prompt="forge-check-ui 스킬 실행. 결과 FAIL 항목 = 버그 자동 등록 (docs/qa/bugs/{N}-ui-quality.md)")
# Lighthouse(perf/a11y) + 디자인 토큰 + AI 슬롭 검출
# FAIL → bug-fix-plan.md 자동 append
```

**multi-viewport 강제** (3 viewport × N 버그):
```javascript
const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 667 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 }
];
for (const vp of VIEWPORTS) {
  await page.setViewportSize(vp);
  await page.screenshot({ path: `docs/qa/artifacts/bug-${N}-${vp.name}-red.png` });
}
```

- **flaky 방어**: UI FAIL 2회 재시도

### T3: DB 데이터 검증

- seed 기준 CRUD 결과 대조 + 무결성(FK/nullable/타입)
- 직접 쿼리로 실제 저장값 확인

### T-migration: 마이그레이션 패리티 비교 (AD-92 P1-A — `--migration` 시만)

> **진실 계층**: COVERED 기능 → legacy=oracle. admin-only 신규 기능 → Spec 기준. 코드 역산 금지 (AD-92-2).

```python
# migration-route-pairs.json에서 COVERED 페어 필터링 (R5)
import json
pairs = json.load(open("docs/qa/migration-route-pairs.json"))
auth = json.load(open("/tmp/qa-migration-auth.json"))

for pair in pairs["pairs"]:
    cov = pair["coverageStatus"]
    if cov == "MISSING":
        print(f"  SKIP {pair['legacyUrl']} (MISSING)")
        continue
    flag = cov == "PARTIAL"  # PARTIAL → run + warn flag

    # 1. legacy 응답 수집 (oracle)
    legacy_resp = curl(
        url=f"{auth['legacyUrl']}{pair['legacyUrl']}",
        cookie=auth["legacyCookie"]
    )

    # 2. admin API 응답 수집
    admin_resp = curl(
        url=f"{auth['adminUrl']}{pair['newApiUrl']}",
        cookie=auth["newCookie"]
    )

    # 3. 추출 규칙 로드 (R3 extraction rules)
    rules = load_extraction_rules(
        domain=pair["domain"],
        screen=pair["legacyUrl"],
        rules_dir="docs/qa/extraction-rules"
    )

    # 4. 구조 데이터 추출 + 비교
    legacy_data = extract(legacy_resp.html, rules)   # HTML → structured
    admin_data  = normalize(admin_resp.json)         # JSON → structured
    diff = compare(legacy_data, admin_data)

    # 5. 결과 기록
    status = "WARN(PARTIAL)" if flag else ("PASS" if not diff else "FAIL")
    record_parity_result(pair, legacy_data, admin_data, diff, status)
```

**비교 대상**: 행 수(total_rows), 페이지네이션, 핵심 컬럼값(숫자/상태). 이미지 URL, 액션 버튼 제외.

**결과 파일**: `docs/qa/migration-parity-{date}.md` — 스크린별 PASS/FAIL/WARN 표 + diff 상세.

#### R6 — Write 패리티 (member write 3건: 등록/수정/삭제)

> **DB 상태 격리 (AD-92-3)**: 각 write 전 DB 스냅샷 → write 후 diff → 검증 완료 후 롤백.

```python
for write_case in WRITE_CASES:  # 등록, 수정, 삭제
    # before snapshot (legacy oracle)
    before_legacy = legacy_fetch(write_case.list_url, auth.legacy_cookie)

    # legacy write (master action — source of truth)
    legacy_write(write_case.form_url, write_case.payload, auth.legacy_cookie)
    state_A_legacy = legacy_fetch(write_case.list_url, auth.legacy_cookie)

    # restore (DB rollback or seed re-inject)
    db_rollback_or_reseed()

    # admin write
    admin_write(write_case.api_url, write_case.payload, auth.new_cookie)
    state_B_admin = admin_fetch(write_case.api_url, auth.new_cookie)

    # compare state_A vs state_B
    diff = compare_write_states(state_A_legacy, state_B_admin)
    record_write_parity(write_case, diff)
```

**Write 대상 (member 도메인)**:
- 등록: `POST /admin/member/members/write` vs `POST /api/v1/member`
- 수정: `POST /admin/member/members/write/{id}` vs `PATCH /api/v1/member/{memId}`
- 삭제: `POST /admin/member/members/delete/{id}` vs `DELETE /api/v1/member/{memId}`

### T6: 보안 스캔 (forge-check-security — WARN 게이트)

> **게임 프로젝트**: `/game-qa` 스킬 사용.

`forge-check-security` 스킬을 서브에이전트로 호출 (1레벨):

```python
Agent(
  subagent_type="general-purpose",
  prompt=f"""
forge-check-security 스킬 실행.
프로젝트 루트: {PROJECT_ROOT}
출력: {PROJECT_ROOT}/docs/qa/security-report.md
판정만 반환: PASS / WARN (HIGH N건) / FAIL (CRITICAL N건)
  """
)
```

- **FAIL** (CRITICAL) → Phase 1 즉시 [STOP] — 보안 결함 수정 후 재실행
- **WARN** (HIGH) → Phase 4 PR 본문에 HIGH 항목 추가, Human 확인 후 머지
- **PASS** → 계속 진행

### T7: 성능 기준선 체크 (benchmark — WARN 게이트)

scenarios.md에서 GET 시나리오 N개(기본 10개) 자동 선택 후 측정 (C-2 정정 — health 단독 측정 제거):

```bash
# scenarios.md에서 GET 엔드포인트 추출 (최대 10개)
ENDPOINTS=$(grep -E "^\| [0-9]+ \| GET" docs/qa/scenarios.md | \
  grep -oE '\| /[a-zA-Z0-9/_?=&-]+' | tr -d '| ' | head -10)
# 인증 후 각 엔드포인트 5회 평균 응답시간 측정
echo "endpoint,avg_ms,p95_ms" > /tmp/qa-perf-$$.csv
while IFS= read -r endpoint; do
  times=()
  for i in 1 2 3 4 5; do
    ms=$(curl -s -o /dev/null -w "%{time_total}" \
      -H "Content-Type: application/json" "${CURL_AUTH[@]}" \
      "$BASE_URL$endpoint" | awk '{printf "%d", $1*1000}')
    times+=("$ms")
  done
  avg=$(printf '%s\n' "${times[@]}" | awk '{s+=$1}END{printf "%d", s/NR}')
  p95=$(printf '%s\n' "${times[@]}" | sort -n | tail -1)
  echo "$endpoint,$avg,$p95" >> /tmp/qa-perf-$$.csv
  echo "  $endpoint: avg=${avg}ms p95=${p95}ms"
done <<< "$ENDPOINTS"
```

임계값 (WARN 게이트):
- 평균 응답시간 **> 2000ms** → WARN
- 평균 응답시간 **> 5000ms** → FAIL
- 이전 `perf-baseline.json` 대비 **+25%** 이상 → WARN

결과 → `docs/qa/perf-baseline.json` 저장 (다음 사이클 대조용).

### 회귀 baseline 생성

```bash
# Phase 1 전체 결과 → baseline.json (Healer가 회귀 감지에 사용)
cat > docs/qa/baseline.json << 'EOF'
{
  "generated": "YYYY-MM-DDTHH:MM:SSZ",
  "scenarios": [
    {"id": "T1-FR001-1", "method": "POST", "path": "/api/auth/login", "status": "PASS"},
    ...
  ]
}
EOF
```

## Phase A 시작 — 로깅 자동 export (AD-93 W2)

```bash
# Phase A 브랜치 생성 직후 즉시 실행
export LOG_HTTP=1
export LOG_SOCKET=1
export LOG_DB=1
TS=$(date +%Y%m%d%H%M%S)
mkdir -p docs/qa/artifacts
exec > >(tee "docs/qa/run-${TS}.log") 2>&1
echo "[Phase A] QA 세션 시작 ($(date)). LOG_HTTP=$LOG_HTTP LOG_SOCKET=$LOG_SOCKET"
```

## Phase 1.5 — 버그 아티팩트 수집 (AD-93 W2: 3종 필수)

FAIL 직후 즉시 (Healer 증거):
- **UI 버그**: `artifacts/bug-{N}-red-{vp}-shot.png` × 3 (before) + `bug-{N}-green-{vp}-shot.png` × 3 (after)
- **API 버그**: `artifacts/bug-{N}-http.log` (LOG_HTTP) + `artifacts/bug-{N}-server.log` + `artifacts/bug-{N}-console.log`
- **최소 3종** (`shot.png` + `healer.log` + `http.log`) — artifact-verifier hook이 0건 시 exit 2 차단

## Phase 2 — 버그 리포트 (6하원칙 + Failure Attribution)

`docs/qa/{date}-{slug}-bug-report.md`, 버그별:

```markdown
## Bug-{N}: {제목}

- **What**: 발견한 증상 (1줄)
- **Where**: 영향 파일 + line (e.g., src/routes/auth.ts:L45)
- **When**: 재현 단계 (시나리오 ID 또는 트리거)
- **Who**: 영향 사용자/역할 (admin/user/guest)
- **Why**: 원인 가설 (3개 이상, 우선순위)
- **How**: 재현율 (3/3 / 1/3 / 0/3) + 환경

### Failure Attribution (amendments §갭 12, W5 강화)
- 컴포넌트: {API / DB / FE / Auth / etc.}
- 계층: {presentation / business / data}
- 결정 시점: {Spec / impl / config}
- **H-래더 레벨**: H2(감지) / H3(해결) / H4(예방)
- **반복 가능성**: 1회성 / 재현 패턴 / 만성

### 기대값
출처: Spec FR-XX 또는 legacy-test:{path}

### 실제값
(관찰된 값)

### 증거
- screenshot: artifacts/bug-{N}-red-{vp}-shot.png × 3 (RED) / bug-{N}-green-{vp}-shot.png × 3 (GREEN)
- http log: artifacts/bug-{N}-http.log
- healer log: artifacts/bug-{N}-healer.log
```

**리포트 없으면 Phase D [STOP]. artifacts 0건이면 artifact-verifier hook exit 2.**

## Phase D — 버그 수정 계획서 (AD-93 W2)

**자동 생성**: `python3 ~/forge/.claude/skills/qa/scripts/bug-fix-plan-gen.py --report docs/qa/{date}-bug-report.md`

출력:
- `docs/qa/{date}-bug-fix-plan.md` — 버그별 수정 계획
- `docs/qa/{date}-bug-fix-plan-diff.md` — 영향 파일 + 라인 범위 (healer worktree 스코프 가드)

**bug-fix-plan.md 버그별 필수 필드** (AD-96-MVP M1 — Why 시점 분리):
```yaml
## Fix-{N}: {bug-report.md Bug-N 제목}

유형: UI/UX | API | DB | 혼합
cross_repo: false  # 자동 감지 (Phase D): 영향 파일 경로 repo root ≥ 2종 → true (AD-96-MVP N3)

# === 6하 원칙 (5W1H) — 모두 필수 (H1 phase-gate 차단) ===
Who: <발견자/롤> (예: QA / E2E 시나리오 #12 / Sentry 알람)
What: <증상 1줄 + 기대값 vs 실제값>
When: <조건/타이밍> (예: "로그인 직후 첫 클릭" / "viewport=mobile")
Where: <위치> (예: "POST /api/payments" / "src/components/PayButton.tsx")
Why_hypothesis: <추정 원인 1줄>  # Phase D 필수 (추정, 증거 없어도 OK). 예: "트랜잭션 commit 누락 의심"
Why_root_cause: <미작성>  # healer a4 완료 후 필수 (증거-가설-검증방법 3-튜플). 빈 채로 Phase E 진입
How: |
  재현 단계:
  1. <단계>
  2. <단계>
  기대값: <기대값>
  실제값: <실제값>
  재현율: N/3

# === 유형별 필수 필드 ===
영향 컴포넌트: <ComponentName>  # UI/UX 필수 (H4 component scope 가드)
viewport: [mobile, tablet, desktop]  # UI/UX 필수
# cross_component + escape_reason = AD-97 이동 (cross-component-approved 라벨 게이트 = H4+PR 라벨 강제)
영향 엔드포인트: <METHOD /path>  # API 필수
영향 테이블: <table_name>  # DB 필수
위반 FR: <FR-ID or Spec 섹션>
증거 로그:
  - docs/qa/artifacts/bug-{N}-console.log    # UI: Phase B T2 수집
  - docs/qa/artifacts/bug-{N}-network.log    # UI
  - docs/qa/artifacts/bug-{N}-js.log         # UI
  - docs/qa/artifacts/bug-{N}-trace.zip      # UI
  - docs/qa/artifacts/bug-{N}-server.log     # API/DB
  - docs/qa/artifacts/bug-{N}-db.log         # API/DB
  - docs/qa/artifacts/bug-{N}-http.log       # API/DB

# === 분석/수정 ===
발견 축: [1-7]  # 프론트 7축 또는 백엔드 7축 어느 축에서 잡혔는지
영향 파일: [...]
수정 방향: <3줄 이내>
회귀 위험: LOW | MEDIUM | HIGH
healer 분담: 병렬 | 순차
복잡도: SIMPLE | MODERATE | HIGH | AMBIGUOUS
```

> **Why 시점 분기** (Codex HIGH#1 수용):
> - `Why_hypothesis`: Phase D에서 qa가 작성 (추정, 증거 없어도 OK)
> - `Why_root_cause`: healer a4 완료 후 healer가 append (증거-가설-검증방법 3-튜플 필수). Phase F 진입 전 H1' 검증.

**Phase E (healer) 진입 조건**: bug-fix-plan.md 존재 + `Why_hypothesis` 작성 필수 — H1 exit 2 차단.
**Phase F 진입 조건**: `Why_root_cause` 작성 필수 — H1 exit 2 차단 (healer a4 후 검증).

**evaluator-contract.json 자동 생성 (Phase D 완료 직후)**:
```bash
python3 ~/forge/.claude/skills/qa/scripts/contract-gen.py \
  --plan docs/qa/{date}-bug-fix-plan.md \
  --scenarios docs/qa/scenarios-filtered.md \
  --scope {scope}
# → docs/qa/{date}-evaluator-contract.json
```

Contract 내용: FR 목록 / rubric_threshold=70 / regression_count=0 / healer_model=sonnet / deadline=+4h

---

## Phase E — Healer 복잡도 라우팅 (AD-93 W3)

> **Brain-Hands 분리 (amendments §갭 12)**:
> - 메인 컨텍스트 = orchestrator ONLY
> - healer + cr-* = **Sonnet 강제** (Agent tool `model: sonnet` 명시)

### 복잡도 라우팅 매트릭스

bug-fix-plan.md의 `복잡도:` 필드를 소비:

| 복잡도 | 하네스 | 트리거 |
|--------|-------|--------|
| SIMPLE | subagent 1개 (healer, model=sonnet) | 영향 파일 1 + 재현율 3/3 |
| MODERATE | Agent Teams (healer 병렬, worktree) | CRITICAL / 회귀 위험 HIGH / 독립 버그 ≥ 2 / 영향 파일 ≥ 2 |
| HIGH | PGE + Agent Teams (5 specialist 병렬) | **cross-repo 버그 전용** (영향 리포 ≥ 2) — AD-95 W3 |
| AMBIGUOUS | `/investigate` 4단계 선행 → 원인 특정 후 재분류 | Why 가설만 있음 / 재현율 < 3/3 |

### SIMPLE 라우팅

```python
Agent(
    subagent_type="healer",
    model="sonnet",  # Brain-Hands: Sonnet 강제
    prompt=f"bug_report: {bug_report_path} Bug #{bug_num}\ncontract: {contract_path}\n..."
)
```

### MODERATE 라우팅 (Agent Teams + worktree)

```python
# 단일 메시지에 병렬 스폰 (독립 버그별)
for bug_id in independent_set:
    Agent(
        subagent_type="healer",
        model="sonnet",  # Brain-Hands: Sonnet 강제
        isolation="worktree",
        prompt=f"Bug #{bug_id}..."
    )
```

### HIGH 라우팅 (PGE + 5 specialist 병렬) — cross-repo 전용 (AD-95 W3/W4, AD-96-MVP M18)

> **진입 조건**: cross-repo 버그(영향 리포 ≥ 2) **AND** `pge_skill_available()` 둘 다 true.
> 어느 하나 false → MODERATE (Agent Teams fallback).

```bash
# PGE 가용성 함수 (AD-96-MVP M18 — LOW#7 수용)
pge_skill_available() {
  [ -f "$HOME/forge/.claude/skills/pge/SKILL.md" ] || return 1
  command -v claude >/dev/null 2>&1 || return 1
  return 0
}
```

```python
# Phase D: cross_repo 자동 감지 (N3) + bug-fix-plan.md에 자동 채움
repos_affected = set(
    path.split('/')[0] + '/' + (path.split('/')[1] if len(path.split('/')) > 1 else '')
    for path in bug_fix_plan.impact_files if '/' in path
)
cross_repo = len(repos_affected) >= 2
bug_fix_plan.cross_repo = cross_repo  # bug-fix-plan.md 자동 갱신

# HIGH 진입 전 cross_repo 필드 + PGE 가용성 동시 확인
is_cross_repo = bug_fix_plan.cross_repo  # Phase D에서 자동 감지된 값 사용
pge_available = (bash("pge_skill_available").returncode == 0)

if not is_cross_repo or not pge_available:
    # cross-repo 아님 OR PGE 미설치 → MODERATE fallback
    routing = "MODERATE"
else:
    # cross-repo AND PGE 가용 → PGE + 5 specialist 병렬 스폰
    agents = [
        Agent(subagent_type="healer", model="sonnet", isolation="worktree"),
        Agent(subagent_type="code-reviewer", model="sonnet"),
        Agent(subagent_type="security-best-practices-reviewer", model="sonnet"),
        Agent(subagent_type="general-purpose", model="haiku",
              prompt="gitnexus impact_analysis for {changed_files}"),
        Agent(subagent_type="general-purpose", model="haiku",
              prompt="rag-search for similar bugs: {error_class}"),
    ]
    evaluator = Agent(subagent_type="general-purpose", model="sonnet",
                      prompt=f"contract: {contract_path}\n평가 기준: rubric 70점...")
```

## Phase Gate 호출 표 (AD-96-MVP M14 — dispatcher)

> **호출 방법**: `bash ~/forge/.claude/hooks/dispatch/phase-gate.sh <gate-name> [bug_id] [artifacts_dir] [scenarios_path]`

| Gate | 호출 시점 | 실행 Hook | Exit 2 조건 |
|------|----------|---------|------------|
| `phase-a-to-b` | Phase A 완료 → Phase B 진입 직전 | H26 `scenarios-required.sh` | scenarios.md 없음 |
| `phase-b-entry` | Phase B 실행 시작 직전 | H27 `scenarios-coverage-8.sh` | 8 카테고리 미커버 |
| `phase-e-entry` | Phase E 진입 (healer 스폰 직전) | H1 `qa-6w-validate.sh` (Phase E) | Why_hypothesis 없음 |
| `phase-e-a4-ui` | Phase E a4 완료 (UI 버그) | H2 `qa-artifact-frontend.sh` + H7 `pixel-diff-gate.sh` + H6 `vision-evaluator-required.sh` | 6장 미완성 / diff>1% / vision FAIL |
| `phase-e-a4-backend` | Phase E a4 완료 (API/DB 버그) | H3 `qa-artifact-backend.sh` | 3종 로그 없음 |
| `phase-f-entry` | Phase F 진입 직전 | H1 `qa-6w-validate.sh` (Phase F) | Why_root_cause 미작성 |
| `phase-a-branch` | Phase A (AD-97 예약) | skip (MVP) | - |
| `phase-g-merge` | Phase G (AD-97 예약) | skip (MVP) | - |

```bash
# qa SKILL 구현 예시
bash ~/forge/.claude/hooks/dispatch/phase-gate.sh phase-a-to-b
bash ~/forge/.claude/hooks/dispatch/phase-gate.sh phase-e-entry
bash ~/forge/.claude/hooks/dispatch/phase-gate.sh phase-e-a4-ui "bug-${N}"
bash ~/forge/.claude/hooks/dispatch/phase-gate.sh phase-f-entry
```

---

### Phase E — Vision evaluator + JSON Schema (AD-96-MVP M4)

UI/UX 버그인 경우 healer a4 완료 후 Lead(메인)가 Vision evaluator 스폰:

```python
# healer "Vision evaluator 스폰 필요" 보고 후 Lead 실행 (1-레벨)
vision_eval = Agent(
    subagent_type="general-purpose",
    model="sonnet",  # or gemini-2.5-flash via screenshot-analyze skill
    prompt=f"""
Vision 평가 전문가. UI 버그 수정 결과 독립 평가.

baseline_shots:
  - docs/qa/artifacts/bug-{N}-red-mobile-shot.png
  - docs/qa/artifacts/bug-{N}-red-tablet-shot.png
  - docs/qa/artifacts/bug-{N}-red-desktop-shot.png
fixed_shots:
  - docs/qa/artifacts/bug-{N}-green-mobile-shot.png
  - docs/qa/artifacts/bug-{N}-green-tablet-shot.png
  - docs/qa/artifacts/bug-{N}-green-desktop-shot.png
expected_behavior: {bug_report.What.기대값}

JSON schema (반드시 이 형식으로 출력):
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
  "baseline_shot": "docs/qa/artifacts/bug-{N}-red-desktop-shot.png",
  "fixed_shot": "docs/qa/artifacts/bug-{N}-green-desktop-shot.png",
  "ts": "<ISO-8601>"
}}

PASS 조건: verdict=PASS AND aspect_details.*.pass=true 모두. 1개라도 false → FAIL.
출력: docs/qa/reviews/visual/{DATE}-bug-{N}.json
    """
)
# evaluator FAIL → healer a1 재분석 (사이클 카운트 +1)
# evaluator PASS + pixel diff(H7) PASS → Phase F 진입
```

**H6 phase-gate**: JSON 미존재 OR `verdict != PASS` OR `aspect_details.*.pass` 1개라도 false → Phase F 진입 차단.

### Phase E — bug 유형 라우터 (AD-96 W6)

bug-fix-plan.md `유형:` 필드 기반 healer 검증 분기:

```python
if bug.유형 == "UI/UX":
    # visual-pipeline: 7축(프론트) + Vision evaluator + pixel diff + forge-check-ui
    verify_path = "visual-pipeline"
elif bug.유형 == "API" or bug.유형 == "DB":
    # verify.sh + 7축(백엔드) + data integrity baseline-vs-postfix
    verify_path = "verify-sh"
else:  # 혼합
    verify_path = "both"  # 두 파이프라인 모두 실행
```

### Phase F — cr-* queue 폴링 (cr-trigger-queue.jsonl)

healer 완료 후 qa-event-router hook이 `docs/qa/cr-trigger-queue.jsonl` append.
메인 컨텍스트에서 queue read → cr-* 순서 실행:

```python
import json
queue_path = "docs/qa/cr-trigger-queue.jsonl"
if os.path.exists(queue_path):
    with open(queue_path) as f:
        for line in f:
            entry = json.loads(line)
            if entry.get("status") == "pending":
                # Phase F sequence (claude CLI 직접 호출 X — 메인 컨텍스트 직접 실행)
                # 1. /cr-bug {entry['bug_report']}  → docs/reviews/auto/bugfix/{date}-*.json
                # 2. /cr-code {changed_files}        → docs/reviews/auto/code/{date}-*.json
                # 3. /cr-test {qa_report}             → docs/reviews/auto/test/{date}-*.json
                # 4. /cr-final {pr_body}              → docs/reviews/auto/final/{date}-*.json
                # 5. bash scripts/codex-cr-final.sh {pr_body}  → docs/reviews/codex-final/{date}-*.json
```

**Phase F 진입 첫 단계 — queue 폴링 강제 (W4 §1B)**:
1. `docs/qa/cr-trigger-queue.jsonl` 파일 존재 + pending entry 확인
2. pending entry 순회 → cr-* 시퀀스 실행 (claude CLI 직접 호출 X — 메인 컨텍스트)
3. 모든 entry 처리 완료 후에만 Phase G 진입 허용
4. **queue entry 미소비 + Phase G 진입 시도 = phase-gate hook 차단 (exit 2)**

⚠️ **Codex CLI 미설치 경고**: `codex-cr-final.sh`가 WARN을 반환하면 머지 게이트 약화. 운영 환경에서 `npm install -g @openai/codex` 또는 PATH 설정 필요.

---

## Phase G — 자동 PR + CI + develop 머지 (AD-93 W4)

```bash
# 1. PR 생성 (develop 기준)
DATE=$(date '+%Y-%m-%d')
gh pr create \
  --title "QA Auto-Fix: ${QA_SCOPE} — ${BUG_COUNT} bugs resolved" \
  --body "$(cat docs/qa/${DATE}-final-qa-report.md)" \
  --base develop \
  --head "${QA_BRANCH}"

# PR body 경로 저장
PR_BODY_PATH="docs/qa/${DATE}-pr-body.md"
gh pr view --json body -q .body > "$PR_BODY_PATH" 2>/dev/null || \
  cp "docs/qa/${DATE}-final-qa-report.md" "$PR_BODY_PATH"

# 2. CI 폴링 (ci-wait.sh: 15분 timeout + FAIL 패턴 분석)
bash ~/forge/.claude/skills/qa/scripts/ci-wait.sh "${QA_BRANCH}"

# 3. Codex /cr-final (PR 머지 직전 1회 — §A5)
bash ~/forge/.claude/skills/qa/scripts/codex-cr-final.sh "${PR_BODY_PATH}"
# → docs/reviews/codex-final/{date}-codex-cr-final.json (codex-verified 라벨)

# 4. MVP: 수동 머지 (auto-merge = AD-97 향후 H24)
# (아래 명령은 hook을 통과해야만 실행됨)
gh pr merge --squash --delete-branch

# 5. 정리 (M1 §A10)
git checkout develop && git pull
git worktree prune
```

**자동 머지 폐쇄 루프** — AD-97 향후 구현 (H14~H25 = _ad97-pending/). MVP에서는 수동 PR 머지.

> PR 생성 → CI 확인 → 수동 `gh pr merge --squash` → develop pull

**자동 머지 차단 → Human 알림**: check_auto_merge가 exit 2 시 `docs/qa/auto-merge-block.md`에 사유 기록.

---

## Phase H — 지식 축적 + 정리 (AD-93 W5)

```bash
DATE=$(date +%Y-%m-%d)
TS=$(date +%Y%m%d%H%M%S)

# 1. Wiki 자동 트리거 (background, Human 승인 게이트 유지)
# background queue — PR 진행 차단 X
nohup bash -c "
  sleep 10
  echo 'wiki-sync background from Phase H' | \
    cat docs/qa/${DATE}-bug-report.md docs/reviews/auto/final/*.json 2>/dev/null | head -100
" > /dev/null 2>&1 &

# 2. metrics.jsonl append (§A17)
python3 -c "
import json, os
from datetime import datetime
metrics = {
    'date': '${DATE}',
    'scope': os.environ.get('QA_SCOPE', 'full'),
    'branch': os.environ.get('QA_BRANCH', ''),
    'bugs_found': 0,
    'bugs_fixed': 0,
    'cycles': 0,
    'mttr_min': 0,
    'regression_count': 0,
    'wave': 'production'
}
os.makedirs('docs/qa', exist_ok=True)
with open('docs/qa/metrics.jsonl', 'a') as f:
    f.write(json.dumps(metrics) + '\n')
print('[Phase H] metrics.jsonl append')
" 2>/dev/null || true

# 3. worktree prune (§A10)
git worktree prune
find "${HOME}/.claude/worktrees/qa-"* -maxdepth 0 -mtime +7 -exec rm -rf {} \; 2>/dev/null || true

# 4. Intervention log (Human override 발생 시 append)
# phase_override_types: qa-phase-gate-bypass / manual-merge-trigger / force-new-branch
# append 예시:
# python3 -c "
# import json; from datetime import datetime
# entry = {'timestamp': ..., 'phase': ..., 'override_type': ..., 'reason': ..., 'user': 'human'}
# with open('docs/qa/intervention-log.jsonl', 'a') as f: f.write(json.dumps(entry) + '\n')
# "
```

---

## Phase 3 — Healer 루프 (P1-B: 병렬+순차 혼합, AD-92)

> **AD-92-1 준수**: 메인 → healer 서브에이전트 1레벨. 중첩 스폰 금지.
> **P1-B 설계**: 독립 버그(다른 파일) = 병렬+worktree 격리 / 공유 파일 버그 = 순차.

### 3-0. 파일·도메인 친화도 분석 (pre-scan, B-1 정정)

버그 리포트에서 영향 파일 + 도메인 추출 → 충돌 그래프 빌드:

```python
# 파일경로 + 도메인 키워드 동시 추출
# 도메인 키워드: "Where" 파일경로 + "What" 기능명에서 테이블/엔티티 추정
DOMAIN_KEYWORDS = ["customer", "payment", "member", "order", "alarm", "board", "auth"]

bug_meta = {}  # {bug_id: {files: set, domain: str}}
for bug in bug_list:
    files = extract_files_from_report(bug.report_path)
    domain = extract_domain_from_report(bug.report_path, DOMAIN_KEYWORDS)
    bug_meta[bug.id] = {"files": files or {"UNKNOWN"}, "domain": domain or "unknown"}

# 충돌 판정: 파일 겹침 OR 같은 도메인
all_files = set(); all_domains = set()
independent_set = []
sequential_queue = []

for bug_id, meta in bug_meta.items():
    file_conflict   = bool(meta["files"] & all_files)
    domain_conflict = meta["domain"] != "unknown" and meta["domain"] in all_domains
    if file_conflict or domain_conflict:
        sequential_queue.append(bug_id)
    else:
        independent_set.append(bug_id)
        all_files  |= meta["files"]
        if meta["domain"] != "unknown":
            all_domains.add(meta["domain"])
```

### 3-1. 병렬 배치 (Agent Teams + worktree 격리)

독립 버그들을 **단일 메시지에 여러 Agent 호출** (동시 실행):

```python
# independent_set 병렬 스폰 (단일 메시지로 묶어야 실제 병렬)
# isolation="worktree" → 각자 독립 git worktree에서 수정
parallel_results = []
for bug_id in independent_set:
    result = Agent(
        subagent_type="healer",
        isolation="worktree",  # 파일 충돌 방지
        prompt=f"""
프로젝트 루트: {PROJECT_ROOT} (절대경로 사용 의무 — worktree 실행)
bug_report: {PROJECT_ROOT}/docs/qa/{DATE}-bug-report.md 의 Bug #{bug_id}
baseline: {PROJECT_ROOT}/docs/qa/baseline.json
artifacts_dir: {PROJECT_ROOT}/docs/qa/artifacts/
verify_sh: {PROJECT_ROOT}/verify.sh
qa_config: {PROJECT_ROOT}/docs/qa/qa-config.json
        """
    )
    parallel_results.append(result)
# ↑ 모든 Agent() 호출을 단일 응답에 포함시켜야 실제 병렬 실행됨
```

### 3-2. 직렬 회귀 게이트 + worktree 병합 (B-4 정정)

모든 병렬 healer 완료 후 오케스트레이터가 **완료 순서대로** 직렬 처리:

```bash
# worktree 브랜치 1개씩 순서대로 처리
for (bug_id, branch) in completed_parallel_results_in_order:
    if not branch:  # 변경사항 없음 (skip)
        continue

    # 1. seed 재주입 (DB 상태 초기화 — write 버그 검증 보장)
    psql "$DATABASE_URL" < seed.sql 2>&1

    # 2. worktree 브랜치 develop에 머지
    git merge --no-ff "$branch" -m "Healer: Bug #${bug_id} fix"
    if git merge failed (conflict):
        echo "[STOP] worktree 병합 충돌 — Bug #${bug_id} 수동 처리 필요"
        break

    # 3. 전체 시나리오 검증 (baseline 회귀 체크)
    bash verify.sh
    if regression_detected vs baseline.json:
        echo "[회귀] Bug #${bug_id} 수정(healer worktree)이 {시나리오명} 깨뜨림"
        git revert HEAD  # 해당 머지 롤백
        echo "[STOP] 회귀 healer = Bug #${bug_id}. Human 검토 후 재수정 필요."
        break
    # 4. 이 시점 baseline 갱신
    update_baseline_json()
```

**write 버그 병렬 허용 근거**: 수정(코드 변경)은 병렬, 검증(DB 상태 의존)은 직렬 게이트로 분리. 모든 write 버그도 병렬 처리 가능.

### 3-3. 순차 처리 (sequential_queue + 파일 미확인 버그)

기존 MVP 방식 — 파일 공유 또는 UNKNOWN 버그를 하나씩 처리:

```python
for bug_id in sequential_queue:
    Agent(
        subagent_type="healer",
        # isolation 없음 — 메인 워킹디렉토리에서 직접 수정
        prompt=f"""
bug_report: docs/qa/{DATE}-bug-report.md 의 Bug #{bug_id}
baseline: docs/qa/baseline.json
artifacts_dir: docs/qa/artifacts/
verify_sh: verify.sh
qa_config: docs/qa/qa-config.json
        """
    )
```

### 3-4. 전역 가드 (병렬/순차 공통)

- 총 사이클 6 초과 → [STOP]
- same-issue 3회(sha256 키) → [STOP]
- 회귀 감지(baseline 대조, 기존 PASS 깸) → 즉시 [STOP]
- worktree 병합 충돌 → [STOP] (수동 처리 필요)

## Phase 4 / Phase F+G+H — 검증 전수 + PR + 지식 축적

> Phase A~H 시퀀스에서 Phase F(검증) → Phase G(PR+머지) → Phase H(지식 축적) 순서.

### Phase F — cr-* 전수 검증

```
1. /cr-bug {bug-report}          → docs/reviews/auto/bugfix/{date}-*.json
2. /cr-code {changed-files}      → docs/reviews/auto/code/{date}-*.json
3. /cr-test {qa-report}          → docs/reviews/auto/test/{date}-*.json
4. /cr-final {PR-body}           → docs/reviews/auto/final/{date}-*.json  (Claude, 적대적)
5. Codex /cr-final               → docs/reviews/codex-final/{date}-*.json (PR 머지 직전 1회)
```

**판정 룰**: cr-bug/code/test/final = Claude Sonnet (auto-evidence 라벨). Codex /cr-final = codex-verified 라벨. 자동 머지는 **codex-verified PASS 확인** 후에만 (auto-evidence 단독 = 머지 X).

1. 전체 regression 재실행 → `baseline.json` 대조 (신규 FAIL 0 확인)
2. 독립 Evaluator 서브에이전트 스폰 (메인 → 1레벨)
3. `/cr-test {report}` 자동
4. `inspection-checklist`
5. 보안 WARN 항목 있으면 PR 본문에 HIGH 항목 목록 추가

### Phase G — PR + CI + develop 자동 머지

```bash
# PR 생성
gh pr create \
  --title "QA Auto-Fix: {scope} — {N} bugs resolved" \
  --body "$(cat docs/qa/{date}-final-qa-report.md)" \
  --base develop \
  --head fix/qa-{scope}-{date}

# Codex /cr-final (PR 머지 직전 1회 — scripts/codex-cr-final.sh)
bash ~/forge/.claude/skills/qa/scripts/codex-cr-final.sh {PR-body-path}
# → docs/reviews/codex-final/{date}-codex-cr-final.json 생성
# → PASS 확인 후에만 gh pr merge

# CI 폴링 (15분 timeout)
bash ~/forge/.claude/skills/qa/scripts/ci-wait.sh

# 자동 머지 (9개 조건 전부 충족 시)
gh pr merge --squash --delete-branch
git checkout develop && git pull
git worktree prune
```

**자동 머지 차단 조건**: Codex FAIL / 미응답(5분 timeout → WARN + Human 알림) / 보안 CRITICAL / 회귀 / CI FAIL.

### Phase H — 지식 축적

6. **지식 축적 (wiki-sync)**:
   - 해결된 버그별 wiki note 초안 생성 (healer 산출물 기반)
   - `/wiki-sync` 호출 → Human 승인 게이트 → `20-wiki/{project}/bugs/` 저장
   - 승인 거부 = 정상 — PR 진행 차단 X
   - `docs/qa/intervention-log.jsonl` append (Human override 발생 시)
   - `docs/qa/metrics.jsonl` append: `{date, scope, bugs_found, bugs_fixed, cycles, mttr_min, regression_count}`

### 종료 조건 (동적 한도)

- 모든 시나리오 PASS → QA 완료
- **same-issue 3회** → [STOP] (이슈 식별 키 = `sha256(파일경로+에러타입+정규화_메시지)`)
- **총 6사이클 초과** → [STOP]
- Hotfix 규모 → QA 스킵

> `/goal` 루프는 이 종료 조건만 소비 (PASS/FAIL/STOP). PEV 자기수정이 Check STOP을 override하지 않음.

## Evaluator 핵심 원칙: 절대 관대하게 보지 마라

> LLM은 다른 LLM이 만든 결과물에 관대해지는 경향이 있다. (Anthropic 공식 관찰)

아래 생각이 들면 그것은 관대해지고 있다는 신호 → 더 엄격하게 본다:
- "나쁘지 않은데..." → 감점
- "이 정도면 괜찮지 않나?" → 감점
- "전반적으로 잘 만들었으니 이 부분은 넘어가자" → 금지

행동 규칙:
- 한 항목이 좋아도 다른 항목 문제를 상쇄하지 않는다
- 첫인상이 좋아도 세부 항목을 반드시 하나씩 검증한다
- SELF_CHECK.md(Generator 자체 점검)를 그대로 믿지 않는다

## 피드백 작성 규칙

모든 피드백은 **위치 + 이유 + 방법** 3요소를 포함한다:

나쁜 피드백: "코드가 지저분합니다"
좋은 피드백: "auth.ts 45~60줄에 중복 로직이 있습니다(위치). 같은 토큰 검증 코드가 3번 반복되어 AI 슬롭입니다(이유). 공통 함수 `validateToken()`으로 추출하세요(방법)."

## 평가 Rubric (합격/불합격 기준)

> 4항목 가중 점수 합산. **70점 미만 → FAIL (재작업 필수)**

| 항목 | 가중치 | 만점 | 불합격 기준 |
|------|:------:|:----:|-----------|
| 기능성 | 40% | 40점 | FR 미충족 1개라도 있으면 즉시 FAIL |
| 코드 품질 | 30% | 30점 | AI 슬롭(복붙·무의미 반복·미사용 코드) 감지 시 0점 |
| 아키텍처 | 20% | 20점 | Spec 설계 의도 위반 시 0점 |
| 문서 | 10% | 10점 | 주요 변경 미반영 시 5점 이하 |

### 판정 기준

- **PASS**: 70점 이상 + 기능성 항목 FAIL 없음
- **조건부 PASS**: 70점 이상이나 개선 권고 존재 → Human 확인 후 머지
- **FAIL**: 70점 미만 또는 기능성 즉시 FAIL → Cycle 2 재작업

### AI 슬롭(Slop) 체크리스트

- [ ] 기능과 무관한 코드 블록 없음
- [ ] 동일 로직 중복 없음 (copy-paste)
- [ ] 미사용 변수/함수/import 없음
- [ ] 주석이 코드와 일치함

### 도메인별 즉시 불합격 기준

> 구체적인 불합격 언어가 Generator 산출물 품질을 결정한다 (AI 사용성연구소 EP.04)

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
- 프레임 드롭 없이 테스트 환경에서 60fps 미달 → 불합격

## 산출물

`docs/qa/YYYY-MM-DD-{spec-name}-qa-report.md`

| 항목 | 내용 |
|------|------|
| 시나리오 수 | FR별 시나리오 개수 |
| PASS/FAIL | 각 시나리오 결과 |
| Rubric 점수 | 항목별 점수 + 합산 |
| 이슈 목록 | 발견된 이슈 + 수정 내역 |
| 사이클 수 | 실행된 사이클 수 |

## Hotfix 진입 (AD-95)

작업 규모가 Hotfix인 경우 `/qa --mode=hotfix`로 경량 진입한다. `/forge-fix`가 내부적으로 `--mode=hotfix`를 전달하므로 Phase B~C(시나리오 전수 + 버그 발견) 스킵. 자세한 흐름 → 위 "Hotfix 모드 (`--mode=hotfix`)" 섹션.

## Workflow 통합 (계획서 P2-1)
병렬/다단계 실행 = Workflow 도구로 컨텍스트 격리 + resume 지원.
패턴: Phase A~D(순차) → Phase C(parallel T1~T7) → Phase E(parallel healer 복잡도 라우팅) → Phase F~H(순차).
실행: `Workflow({ script: Bash("cat ~/.claude/skills/qa/workflow.js"), args: { scope, mode } })`
`CLAUDE_CODE_DISABLE_WORKFLOWS=1` 시 기존 Phase A~H 메인 컨텍스트 방식 fallback.

## Codex 2차 게이트 (Plan v2-C1, 자동)

QA 시나리오 작성 완료 후 Codex `--stage test` 자동 호출:

```bash
/codex-review --stage test --target docs/qa/YYYY-MM-DD-*-qa-report.md
```

- 정책: `test` stage = blocking NO. WARN/FAIL → 사용자 컨펌 후 진행.
- 검증 포커스: 커버리지 갭, fake-pass 위험, 외부 의존, edge case 누락
- 결과: `forge-outputs/docs/reviews/test/{date}-{slug}.{md,json}`
- 비활성: `CODEX_REVIEW_AUTO_STAGES=off` (env)


---

## 독립 Evaluator (Phase 4 — 메인 → 1레벨 서브에이전트)

> QA 보고서 완성 후 반드시 실행. **Generator(QA Lead) ≠ Evaluator** — 자기평가 편향 방지.

```python
# Phase 4 Step 2에서 메인이 스폰 (1레벨, 합법)
Agent(
  subagent_type="general-purpose",
  model="sonnet",
  prompt=f"""
당신은 QA 보고서 품질을 독립 평가하는 Evaluator입니다. Generator 의도를 모른 채 결과물만 평가합니다.

평가 대상: {QA_REPORT_PATH}

평가 기준 (rubric 70점):
- 기능성(40): 모든 FR에 최소 1개 시나리오 대응?
- 코드품질(30): AI 슬롭(관대·두루뭉술 피드백) 없음?
- 아키텍처(20): baseline.json 존재 + 회귀 대조 수행?
- 문서(10): 6하원칙 + 기대값 출처 명시?

판정: PASS(70+) / FAIL(70 미만)
FAIL 시 피드백: [위치] — [이유] → [방법]
"""
)
# PASS → inspection-checklist → gh pr create
# FAIL → 보고서 수정 후 1회 재평가. 재FAIL → [STOP]
```

**PASS 후 PR 생성**:
```bash
gh pr create \
  --title "{Spec 제목} — QA PASS" \
  --body "$(cat {QA_REPORT_PATH})" \
  --base develop \
  --head $(git branch --show-current)
```

## 자동 평가 (eval-rubric 통합)

본 스킬 결과 산출 후 자동으로 `eval-rubric` 호출 → 4축 Rubric 채점 (clarity/consistency/completeness/safety) → `eval_cases.jsonl` 누적.

### 호출 시점
- 본 스킬 핵심 산출물 저장 직후 — qa 시나리오 결과 (`docs/reviews/qa/{date}-{feature}.json`)

### 절차
1. 스킬 산출물 저장 후 다음 호출:
   ```
   /eval-rubric --target {산출물 경로}
   ```
2. eval-rubric의 verdict (PASS/WARN/FAIL) + 4축 점수 + rationale 수신
3. `eval_cases.jsonl` append:
   - 위치: `~/.claude/skills/qa/eval_cases.jsonl`
   - case_id: `EC-qa-{N}` (auto-increment)
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
> 실패 시 [[pev-self-correction]] 적용

---

## Phase 입출력 책임 표 (AD-96-MVP M9)

| Phase | 입력 | 출력 | 책임자 |
|-------|------|------|--------|
| Phase A | `/qa` 호출 + scope | `fix/qa-{scope}-{date}` 브랜치 | qa orchestrator |
| Phase B | scenarios.md | bug-fix-plan.md (bug-ID 포함) + artifacts/ + before(RED) 3장 | qa orchestrator (시나리오 실행자) |
| Phase D | bug-report.md | bug-fix-plan.md (Why_hypothesis 포함) + evaluator-contract.json | qa orchestrator |
| Phase E a0 | bug-fix-plan.md + 증거 로그 | READ_CONFIRMED prefix + before(RED) 재현 확인 | healer |
| Phase E a1 | a0 결과 | Why_root_cause append to bug-fix-plan.md | healer |
| Phase E a4 | 수정 코드 | after(GREEN) 3장 + Vision evaluator 위임 요청 | healer |
| Phase E Vision | GREEN 6장 + expected | vision JSON (`docs/qa/reviews/visual/`) | Lead (Vision evaluator subagent) |
| Phase F | bug-fix-plan.md + vision JSON | cr-* 결과 JSON | cr-* agents |
| Phase G | cr-* PASS | PR + CI 대기 | qa orchestrator |
| Phase H | 완료 PR | metrics.jsonl + wiki-sync | qa orchestrator |

---

## Artifact 보존 정책 (AD-96-MVP M9 — SUGG#2 수용)

| 종류 | 경로 | 보존 기간 | 보관 방식 | 비고 |
|------|------|----------|---------|------|
| before(RED) 스크린샷 | `docs/qa/artifacts/bug-{N}-red-{vp}-shot.png` | 30일 | git tracked | H2 gate |
| after(GREEN) 스크린샷 | `docs/qa/artifacts/bug-{N}-green-{vp}-shot.png` | 30일 | git tracked | H2 gate |
| trace.zip | `docs/qa/artifacts/bug-{N}-trace.zip` | 14일 | **git LFS** | 대용량 |
| 로그 (console/network/js) | `docs/qa/artifacts/bug-{N}-*.log` | 30일 | git tracked | **secret redact 의무** |
| 백엔드 로그 (server/db/http) | `docs/qa/artifacts/bug-{N}-*.log` | 30일 | git tracked | **secret redact 의무** |
| Vision evaluator JSON | `docs/qa/reviews/visual/{date}-bug-{N}.json` | 영구 | git tracked | H6 gate |
| data integrity JSON | `docs/qa/artifacts/bug-{N}-data-integrity-*.json` | 30일 | git tracked | row sample PII 마스킹 (AD-97) |

**Secret redact 의무** (H2/H3 내장):
- 로그 수집 직후 자동 마스킹: 이메일, 전화번호, 토큰, API 키, 비밀번호
- 패턴: `[REDACTED_EMAIL]`, `[REDACTED_TOKEN]`, `[REDACTED_KEY]`
- H2/H3 hook이 artifacts/ 저장 전 redact 실행 (file I/O only, 외부 의존성 X)
