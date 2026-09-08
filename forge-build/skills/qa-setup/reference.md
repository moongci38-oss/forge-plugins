# qa-setup — Reference (상세 기준·표·예시)

> SKILL.md 본문에서 분리된 참고자료. 필요 시에만 Read.

## 목차

**필요한 절만 골라 읽는다** — 442줄이라 통째로 열면 그 세션 예산을 그만큼 먹는다.

| 절 | 언제 읽나 |
|---|---|
| [§시나리오 출처 격리 (AD-93 §A8 — CRITICAL)](#시나리오-출처-격리-ad-93-a8--critical-상세) | scenarios.md 를 만들거나 고칠 때 |
| [§Coverage Map 검증 (A6)](#coverage-map-검증-a6-상세--알고리즘스키마표) | 커버리지 게이트를 돌릴 때 |
| [§E2E 러너 폴백 상세 (P1-⑤)](#e2e-러너-폴백-상세-p1--2026-07-07-로컬-qa-갭--b1) | E2E 러너가 없거나 실패할 때 |
| [§web 안정성 권고 (M4)](#web-안정성-권고-m4) | 웹 QA 가 불안정할 때 |
| [§portConflictPolicy 상세](#portconflictpolicy-상세) | 포트 충돌이 났을 때 |
| [§QA-SEED 계약 상세](#qa-seed-계약-상세) | DB seed 를 격리할 때 |
| [§5. 개발 서버 생명주기](#5-개발-서버-생명주기) | 서버를 띄우고 내릴 때 |
| [§8. DB Seed + 격리](#8-db-seed--격리) | 테스트 데이터를 준비할 때 |
| [§2. 로그인 엔드포인트 발견 (FIX-2)](#2-로그인-엔드포인트-발견-fix-2) | 인증이 필요한 시나리오를 짤 때 |

> 근거: `skill-creator` SKILL.md — 100줄 초과 reference 에는 목차를 둔다.
> 폐기조건: 이 파일이 100줄 이하로 줄면 목차를 뺀다.

---

## §시나리오 출처 격리 (AD-93 §A8 — CRITICAL) 상세

**출처 우선순위 (amendments §A8)**:

| 우선순위 | 출처 | 처리 |
|---------|------|------|
| 1 | Spec FR 명세 (`docs/planning/active/*.md` / `.specify/specs/*.md` / `02-product/`) | 직접 사용, `source: {file}#L{N}` 명시 |
| 2 | legacy 동작 (`git log -p` + 기존 테스트) | `source: legacy-test:{path}#L{N}` 명시 |
| 3 | Human 입력 | [STOP] "기대값 입력 요청" |
| 4 | 코드 read 후 추론 | **금지 — AD-93 §A8, tautology** |

**금지 패턴**: 소스 파일 Read 후 시나리오 작성 = 동어반복. 코드 구현이 버그여도 테스트가 PASS됨.

**예외**: scenarios.md 각 행에 `source:` 필드 명시 시 허용.

#### 기대값 출처 명시 (AD-92-2 — CRITICAL)

| 우선순위 | 출처 | 처리 |
|---------|------|------|
| 1 | Spec FR 명세 | 직접 사용 |
| 2 | Human 입력 | [STOP] "기대값 입력 요청" |
| 3 | 레거시 응답 (마이그레이션 모드) | P1 deferred |
| 4 | 추론 | **금지** |

#### scenarios.md 형식 (AD-93 W2 — source 필드 필수)

```markdown
# QA Scenarios — {프로젝트명}

## FR-001: {기능명}
| # | Method | Path | Auth | Body | Expected Status | Expected Body | source |
|---|--------|------|------|------|-----------------|---------------|--------|
| 1 | POST | /api/auth/login | no | {"email":"..."} | 200 | {token:...} | docs/planning/active/auth-spec.md#L45 |
| 2 | POST | /api/auth/login | no | {"email":"wrong"} | 401 | {error:...} | legacy-test:tests/auth.test.ts#L120 |
```

## §Coverage Map 검증 (A6) 상세 — 알고리즘·스키마·표

### Coverage Map — entity×action×screen×viewport full-cartesian

```python
# coverage_map.py (개념 코드)
entities   = [e for e in spec_entities]        # Spec FR에서 추출
actions    = ["create", "read", "update", "delete"]
screens    = [s for s in uiux_screens]         # oracle-manifest.json uiux.screens
viewports  = ["pc", "mobile"]

matrix = {}
for entity in entities:
    for action in actions:
        for screen in screens:
            for viewport in viewports:
                key = f"{entity}×{action}×{screen}×{viewport}"
                matrix[key] = {
                    "covered": False,  # scenarios.md에 해당 셀 시나리오 있으면 True
                    "scenario_ids": []
                }

# scenarios.md 파싱 후 matrix 업데이트
# 누락 셀 집계
missing_cells = [k for k,v in matrix.items() if not v["covered"]]
if missing_cells:
    print(f"[EXIT 2] Coverage Map 누락 셀 {len(missing_cells)}건:")
    for cell in missing_cells:
        print(f"  - {cell}")
    exit(2)
```

**출력**: `docs/qa/coverage-map.json` (matrix 전체) + `docs/qa/coverage-gaps.md` (누락 셀 목록)

### flow-chain schema 검증

scenarios.md 내 다단계 플로우(A→B→C) 시나리오는 `flow_chain:` 필드 필수:

```markdown
| # | Method | Path | Auth | Body | Expected Status | Expected Body | source | flow_chain | state_after |
|---|--------|------|------|------|-----------------|---------------|--------|------------|-------------|
| 5 | POST | /api/order | yes | {...} | 201 | {id:...} | spec#L45 | order-flow:step1 | order.status=PENDING |
| 6 | PUT  | /api/order/{id}/pay | yes | {...} | 200 | {...} | spec#L60 | order-flow:step2 | order.status=PAID |
| 7 | GET  | /api/order/{id} | yes | — | 200 | {status:PAID} | spec#L70 | order-flow:step3-verify | — |
```

`flow_chain:` 필드 없는 다단계 시나리오(≥2단계) 발견 시 → WARN (exit 1)

### round-trip oracle 검증

쓰기 시나리오(POST/PUT/DELETE) 각각에 대해 후속 검증 행 필수:

```markdown
| 3 | POST | /api/user | yes | {name:...} | 201 | {id:42} | spec#L30 | — | — |
| 4 | GET  | /api/user/42 | yes | — | 200 | {name:...} | spec#L30 | round-trip:row3 | — |  ← 필수
```

`round-trip:row{N}` 태그 없는 쓰기 시나리오 → WARN (exit 1)

### entity CRUD 완결성 체크

```bash
# Spec FR에서 entity 추출 후 CRUD 누락 검사
check_entity_crud() {
  local entity="$1"
  local missing=""
  grep -i "create.*${entity}\|${entity}.*create\|POST.*${entity}" docs/qa/scenarios.md >/dev/null || missing="${missing} C"
  grep -i "read.*${entity}\|${entity}.*read\|GET.*${entity}" docs/qa/scenarios.md >/dev/null || missing="${missing} R"
  grep -i "update.*${entity}\|${entity}.*update\|PUT.*${entity}\|PATCH.*${entity}" docs/qa/scenarios.md >/dev/null || missing="${missing} U"
  grep -i "delete.*${entity}\|${entity}.*delete\|DELETE.*${entity}" docs/qa/scenarios.md >/dev/null || missing="${missing} D"
  if [ -n "$missing" ]; then
    echo "[EXIT 2] entity '${entity}' CRUD 누락: ${missing}"
    return 2
  fi
}
```

게임/Non-CRUD 프로젝트 도메인 N/A carve-out(비-CRUD 프로젝트 — CRUD 축 부재 시에만): `qa-config.json`에 `"crud_check": false` 명시 시.
// 이는 full-cartesian waiver가 아님 — CRUD 엔티티가 존재하는 프로젝트는 예외 없이 entity×action 전수 강제.

### responsive 전수 생성

UI 시나리오(화면 조작 포함)는 PC + Mobile 두 viewport 모두 있어야:

```bash
# UI 시나리오 행에서 viewport 열 확인
UI_SCENARIOS=$(grep -c "pc\|mobile\|viewport" docs/qa/scenarios.md || echo 0)
TOTAL_UI=$(grep -c "browser\|screen\|page\|화면" docs/qa/scenarios.md || echo 0)
# PC+Mobile 2배가 안 되면 누락
if [ "$UI_SCENARIOS" -lt "$((TOTAL_UI * 2 / 3))" ]; then
  echo "[EXIT 2] UI 시나리오 responsive 미완성 — PC/Mobile 양쪽 viewport 추가 필요 (full-cartesian 전수 필수)"
  exit 2
fi
```

### 값축(value-axis) 검증

입력 필드별 eq-class×boundary:

| 필드 유형 | 필수 케이스 |
|---------|-----------|
| 문자열(유한 유효값) | 각 eq-class 대표 1건 + 경계 |
| 숫자(범위) | min, max, min-1, max+1, 중간값 |
| 필수 필드 누락 | 빈 값 / null |
| unbounded 문자열 | eq-class(정상, 너무 짧, 너무 김) 대표 |

pairwise 축소 금지 — 각 eq-class+boundary 전수. scenarios.md에 `value_class:` 열 명시 권장.

## §E2E 러너 폴백 상세 (P1-⑤, 2026-07-07 로컬 QA 갭 — B1)

**배경**: `scripts/run-e2e-local.sh` / `test-e2e-full.sh`는 `${HOME}/.claude/trine/scripts/e2e-runner.sh`에 위임한다. 이 러너가 파일시스템에 실재하지 않으면 로컬 스택 부트스트랩이 조용히 실패한다(2026-07-07 실측). qa-setup은 러너 실재를 먼저 확인하고, 부재 시 **WARN + 인라인 부트스트랩 폴백**으로 계속 진행한다(하드스톱 금지, fail-open).

**인라인 폴백 절차** (`E2E_RUNNER_FALLBACK=1`일 때 qa-setup이 대신 수행 — 신규 러너 스크립트 작성 없이 기존 step 재사용):
1. API 서버 기동 — step 5 `start_server` 로직 재사용 (role=backend/server)
2. 헬스 대기 — step 5 폴링 루프(최대 30회 × 2초) 그대로 사용
3. seed 주입 — step 8 로직 재사용, **auth/account seed 선행**(admin 의존 seed는 그 다음). `assert-db-isolation.sh` 게이트 그대로 적용
4. web(frontend) 서버 기동 — step 5 `start_server` 재사용 (role=frontend/web)
5. 스모크 확인 — `curl` 레벨로 BASE_URL 홈/로그인 페이지 200 확인 (Playwright 풀 E2E 아님, 최소 생존 확인)


## §web 안정성 권고 (M4)

Playwright 부하 중 `next dev`가 반복 사망하면 워크플로가 실패한다(실측 2회). (a) web을 `next build && next start`(prod 모드)로 기동하면 개발 서버보다 안정적, (b) 서버 라이프사이클을 세션 독립(nohup/pm2 + healthcheck)으로 두면 장시간 Phase A~H 워크플로가 세션 종료에도 생존, (c) 워크플로 중단 시 `resumeFromRunId`로 재개. 권고이며 프로젝트 여건에 맞게 선택 — 강제 아님.


## §portConflictPolicy 상세

(qa-config.json 최상위, 선택 필드, 기본 `isolate`): 대상 포트를 QA가 띄우지 않은 프로세스가 이미 점유 중일 때의 정책.
- `isolate` (기본): dev 스택은 그대로 두고 QA만 격리 포트(`port+1000`대 빈 포트)로 재배정, `qa-config.json`(`servers[].port` + `baseUrl`)에 즉시 반영 → 이후 Step 9 scenarios.md/verify.sh가 갱신된 포트를 그대로 사용.
- `restore-dev`: 점유 중인 dev 프로세스를 정지시키고 QA가 원 포트를 사용, QA 종료 시 동일 `cmd`/`cwd`로 best-effort 재기동 시도(완전 보장 아님 — 프로젝트별 dev 기동 스크립트 차이로 실패 가능, 실패 시 WARN).
- `warn-only`: 조치 없이 경고만 남기고 기존 REUSE 동작 유지 (구버전 호환 opt-out).

전부 **WARN-first·fail-open**: 점유 PID 판별 도구(lsof/fuser)가 없으면 판정 자체를 스킵하고 기존 REUSE로 진행 — 하드 실패 없음.


## §QA-SEED 계약 상세

로그인 의존 E2E(로그인 스모크 등)는 fresh/reset DB에서 admin/editor/user 같은 multi-role 계정이 먼저 심어져 있어야 통과한다. 기존 엔진은 일반 단일파일 seed(`seed.sql`/`.ts`/`.js`) 디스패치와 계정 1건 삽입만 가정해 이 순서를 보장하지 않았다. 이 계약은 프로젝트가 `qa-config.json`에 아래 두 형태 중 하나(또는 둘 다)로 명시한다 — 특정 앱의 자격증명·파일명은 하드코딩하지 않고 계약 자체만 정의:

- `seed.authSeed`: DB 드라이버로 직접 주입하는 파일 경로(.sql/.ts/.js) — 나머지 seed와 동일 방식이나 **가장 먼저** 실행.
- `seed.authSeedHook`: 백엔드가 UP된 뒤에만 실행 가능한 커맨드 문자열(예: 내부 provisioning 엔드포인트를 호출해 admin/editor/user 계정을 생성하는 방식 — DB row insert가 아니라 API 경유로만 계정이 만들어지는 프로젝트용). Step 8은 Step 5(서버 기동) 이후에 실행되므로 순서 문제 없음.
- `seed.dependentSeeds`: authSeed(Hook) 이후에 순서대로 실행할 나머지 seed 파일 배열.

`qa-config.json`에 `seed.authSeed`도 `seed.authSeedHook`도 없으면 **WARN만(비차단)**: 프로젝트가 이미 다른 방식으로 auth 계정을 공급 중일 수 있으므로 하드 블록하지 않는다.

---

## §5. 개발 서버 생명주기

> SKILL.md 실행 순서 5단계를 **실제로 돌릴 때** Read 한다.
> (2026-08-28 이동 — 명령·주석 원문 그대로.)


split-server는 서버 배열 순회 기동.

```bash
start_server() {
  local role="$1" cmd="$2" cwd="$3" port="$4" health="${5:-/}" port_env_var="${6:-PORT}"
  local pid_file="/tmp/qa-${role}.pid"

  if curl -s -o /dev/null -w "%{http_code}" "http://localhost:$port$health" 2>/dev/null | grep -qE "^[23]"; then
    # ── QA-PORT: 포트 응답 주체가 QA 자체 프로세스인지 확인 (dev 스택 오인 재사용 방지, 2026-07-07) ──
    # 배경: 기존 로직은 2xx/3xx 응답만 보고 무조건 REUSE했다 → 대상 포트를 QA와 무관한
    # dev 스택이 점유 중이어도 그대로 재사용해 QA T1 direct-API가 dev를 오타격할 위험이 있었다.
    local bound_pid=""
    if command -v lsof >/dev/null 2>&1; then
      bound_pid=$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null | head -1)
    elif command -v fuser >/dev/null 2>&1; then
      bound_pid=$(fuser "${port}/tcp" 2>/dev/null | tr -d ' ')
    fi
    local our_pid=""; [ -f "$pid_file" ] && our_pid=$(cat "$pid_file" 2>/dev/null)

    if [ -z "$bound_pid" ]; then
      echo "WARN: 포트 ${port} 점유 프로세스 판별 불가(lsof/fuser 부재) — 소유 미확인 상태로 재사용 (fail-open, 기존 REUSE 동작 유지)"
      echo "REUSE $role:$port"; return
    fi
    if [ "$bound_pid" = "$our_pid" ]; then
      echo "REUSE $role:$port (QA 자체 기동 프로세스로 확인됨)"; return
    fi

    # bound_pid가 QA 자신의 PID(pid_file)와 불일치 → QA가 띄우지 않은(dev 등) 스택으로 판단
    echo "WARN: 포트 ${port} 이미 다른 프로세스(pid ${bound_pid})가 점유 중 — QA T1 direct-API가 dev 스택을 잘못 타격할 위험."
    local policy; policy=$(jq -r '.portConflictPolicy // "isolate"' docs/qa/qa-config.json 2>/dev/null); [ -z "$policy" ] && policy="isolate"

    case "$policy" in
      warn-only)
        echo "WARN: portConflictPolicy=warn-only — 경고만 남기고 기존 응답 그대로 재사용 (위험 수용, isolate/restore-dev 권장)"
        echo "REUSE $role:$port"; return ;;
      restore-dev)
        echo "WARN: portConflictPolicy=restore-dev — dev 프로세스(pid ${bound_pid}) 정지 후 QA 스택으로 교체 (QA 종료 시 best-effort 복원 시도)"
        echo "${cmd}|${cwd}" > "/tmp/qa-dev-restore-${role}.info"
        kill "$bound_pid" 2>/dev/null; sleep 1 ;;
      isolate|*)
        local new_port=$((port + 1000))
        while curl -s -o /dev/null "http://localhost:$new_port" 2>/dev/null; do new_port=$((new_port + 1)); done
        echo "WARN: portConflictPolicy=isolate(기본) — dev 스택 무변경 보존, QA는 격리 포트 ${new_port}로 재배정"
        jq --arg role "$role" --argjson newport "$new_port" '
          (.servers[] | select(.role == $role) | .port) = $newport
          | if ($role == "backend" or $role == "server") then .baseUrl = ("http://localhost:" + ($newport|tostring)) else . end
        ' docs/qa/qa-config.json > /tmp/qa-config.json.tmp 2>/dev/null \
          && mv /tmp/qa-config.json.tmp docs/qa/qa-config.json \
          || echo "WARN: qa-config.json 포트 갱신 실패 — 수동 확인 필요 (비차단)"
        port="$new_port" ;;
    esac
  fi

  (cd "$cwd" && env "${port_env_var}=${port}" $cmd &> "/tmp/qa-${role}.log" &)
  echo $! > "$pid_file"
  for i in $(seq 1 30); do
    curl -s -o /dev/null -w "%{http_code}" "http://localhost:$port" 2>/dev/null | grep -qE "^[23]" && echo "UP $role:$port" && return
    sleep 2
  done
  echo "ERROR: $role 서버 기동 실패 — /tmp/qa-${role}.log 확인" >&2; exit 1
}

# qa-config.json servers[] 순회
jq -c '.servers[]' docs/qa/qa-config.json | while read -r server; do
  role=$(echo "$server" | jq -r '.role')
  cmd=$(echo "$server" | jq -r '.cmd')
  cwd=$(echo "$server" | jq -r '.cwd')
  port=$(echo "$server" | jq -r '.port')
  health=$(echo "$server" | jq -r '.health // "/"')
  port_env_var=$(echo "$server" | jq -r '.portEnvVar // "PORT"')
  start_server "$role" "$cmd" "$cwd" "$port" "$health" "$port_env_var"
done
```

**`portConflictPolicy`** (qa-config.json 최상위, 선택 필드, 기본 `isolate`) 3값 의미·WARN-first 원칙 → `reference.md §portConflictPolicy 상세`

QA 종료 시 정리:
```bash
for pid_file in /tmp/qa-*.pid; do kill $(cat "$pid_file") 2>/dev/null; done

# restore-dev 정책으로 정지됐던 dev 프로세스 best-effort 복원 (완전 보장 아님)
for restore_file in /tmp/qa-dev-restore-*.info; do
  [ -f "$restore_file" ] || continue
  IFS='|' read -r r_cmd r_cwd < "$restore_file"
  (cd "$r_cwd" && $r_cmd &> /tmp/qa-dev-restored.log &) 2>/dev/null \
    && echo "INFO: dev 스택 복원 시도(best-effort) 완료 — ${restore_file}" \
    || echo "WARN: dev 스택 복원 실패 — 수동 재기동 필요 (${restore_file})"
  rm -f "$restore_file"
done
```

---

## §8. DB Seed + 격리

> SKILL.md 실행 순서 8단계를 **실제로 돌릴 때** Read 한다.
> (2026-08-28 이동 — 명령·주석 원문 그대로.)


**QA-SEED — auth 계정 seed 선행 게이트**: fresh DB에서 admin/editor/user 같은 multi-role 계정이 먼저 심어져 있어야 로그인 의존 E2E가 통과한다. 계약 필드(`seed.authSeed`/`seed.authSeedHook`/`seed.dependentSeeds`) 의미·미지정 시 WARN 근거 → `reference.md §QA-SEED 계약 상세`

```bash
# ── QA-SEED: auth 계정 seed 선행 (admin 의존 seed보다 반드시 먼저) ──
AUTH_SEED=$(jq -r '.seed.authSeed // empty' docs/qa/qa-config.json 2>/dev/null)
AUTH_SEED_HOOK=$(jq -r '.seed.authSeedHook // empty' docs/qa/qa-config.json 2>/dev/null)
DEPENDENT_SEEDS=$(jq -r '.seed.dependentSeeds[]? // empty' docs/qa/qa-config.json 2>/dev/null)

if [ -z "$AUTH_SEED" ] && [ -z "$AUTH_SEED_HOOK" ]; then
  echo "WARN: qa-config.json에 seed.authSeed / seed.authSeedHook 계약 없음 — login 의존 E2E(스모크 등)가 fresh DB에서 실패할 수 있음. multi-role 계정(admin/editor/user 등)을 공급하는 seed 계약 명시 권장 (비차단, WARN-only)."
else
  bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/assert-db-isolation.sh" "${DATABASE_URL:-}"
  if [ -n "$AUTH_SEED" ]; then
    if [ -f "$AUTH_SEED" ]; then
      echo "[QA-SEED] authSeed 우선 주입: $AUTH_SEED"
      case "$AUTH_SEED" in
        *.sql) psql "$DATABASE_URL" < "$AUTH_SEED" 2>&1 | tail -3 ;;
        *.ts)  npx ts-node "$AUTH_SEED" 2>&1 | tail -3 ;;
        *.js)  node "$AUTH_SEED" 2>&1 | tail -3 ;;
        *)     echo "WARN: authSeed 확장자 미지원($AUTH_SEED) — 수동 확인 필요" ;;
      esac
    else
      echo "WARN: qa-config.json .seed.authSeed=$AUTH_SEED 지정됐으나 파일 부재 — login E2E 실패 위험 (비차단)"
    fi
  fi
  if [ -n "$AUTH_SEED_HOOK" ]; then
    echo "[QA-SEED] authSeedHook 실행 (서버 UP 후 provisioning): $AUTH_SEED_HOOK"
    eval "$AUTH_SEED_HOOK" 2>&1 | tail -3 || echo "WARN: authSeedHook 실행 실패 — login E2E 실패 위험 (비차단)"
  fi
  for ds in $DEPENDENT_SEEDS; do
    [ -f "$ds" ] || { echo "WARN: dependentSeed 파일 부재: $ds — 스킵"; continue; }
    echo "[QA-SEED] dependentSeed 주입(authSeed 이후): $ds"
    case "$ds" in
      *.sql) psql "$DATABASE_URL" < "$ds" 2>&1 | tail -3 ;;
      *.ts)  npx ts-node "$ds" 2>&1 | tail -3 ;;
      *.js)  node "$ds" 2>&1 | tail -3 ;;
    esac
  done
fi
```

기존 단일파일 generic seed(`seed.sql`/`.ts`/`.js`) 디스패치는 하위 호환을 위해 별도로 계속 동작(아래) — `seed.authSeed*` 계약과 병행 가능하며 상호 배타적이지 않다:

seed 파일 없으면 **[STOP] 대신** 스키마 탐침 → draft 제안:

```bash
if [ ! -f seed.sql ] && [ ! -f seed.ts ] && [ ! -f seed.js ]; then
  echo "INFO: seed 파일 없음 — 스키마 탐침 후 draft 생성"
  # 마이그레이션/엔티티 파일에서 users/members 테이블 탐지
  USER_TABLE=$(grep -rEl "(users|members|member)" migrations/ src/ --include="*.sql" --include="*.ts" 2>/dev/null | head -1)
  if [ -n "$USER_TABLE" ]; then
    python3 -c "
print('''-- seed.sql.draft (자동 생성 — 실제 해시값·필수 컬럼 수동 완성 필요)
-- Human 확인 후 seed.sql 로 rename
INSERT INTO \`member\` (member_id, member_pw, agent_type, use_yn) VALUES
  ('"'"'qa@test.com'"'"', '"'"'\$2b\$10\$HASH_HERE'"'"', '"'"'J'"'"', '"'"'Y'"'"');
''')
" > docs/qa/seed.sql.draft
    echo "[STOP] seed.sql.draft 생성 완료 → 해시값·컬럼 확인 후 seed.sql 로 rename 하여 재실행"
    exit 2
  else
    echo "WARN: seed 파일도 스키마도 없음 — 인증 없는 프로젝트로 간주 (auth.mode=none 확인)"
  fi
else
  # 주입
  # ── DB 격리 실증 게이트 (P0, assert-db-isolation) — seed mutation 직전 필수 ──
  # WARN-first/fail-open. 격리 미증명(dev/prod/불명) 시 stderr WARN. FORGE_DB_ISOLATION_ENFORCE=1 시 exit 2 BLOCK.
  bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/assert-db-isolation.sh" "${DATABASE_URL:-}"
  [ -f seed.sql ] && psql "$DATABASE_URL" < seed.sql 2>&1 | tail -3
  [ -f seed.ts ]  && npx ts-node seed.ts 2>&1 | tail -3
  [ -f seed.js ]  && node seed.js 2>&1 | tail -3
fi
```

---

## §2. 로그인 엔드포인트 발견 (FIX-2)

> SKILL.md 실행 순서 2단계를 **실제로 돌릴 때** Read 한다.
> (2026-08-28 이동 — 명령·주석 원문 그대로.)


하드코딩 엔드포인트 제거. 발견 순서:
1. `AUTH_ENDPOINT` env 존재 → 사용
2. 2단계 grep (Express mount prefix + sub-route 조합):
   - 단계 A: `app.js|server.js`에서 `app.use('/api/X', ...)` 패턴 → mount prefix 추출
   - 단계 B: 각 routes 파일에서 `login|signin|auth` 포함 라우트 → sub-path 추출
   - 결합: `/api/X` + `/free/login` = `/api/X/free/login`
3. NestJS: `@Post('login')` + `@Controller('auth')` 조합 탐색
4. 후보 1개 → 자동 채택 / 복수 → Human 선택 **[STOP]** / 0개 → `auth.mode: none`

```bash
discover_login_endpoint() {
  # 단계 A: mount prefix 추출
  local main_file; main_file=$(ls src/app.js backend/src/app.js app.js server.js 2>/dev/null | head -1)
  local mount_prefix=""
  if [ -n "$main_file" ]; then
    # e.g. app.use('/api/member', require('./routes/member'))
    mount_prefix=$(grep -E "app\.use\s*\(" "$main_file" | \
      grep -iE "(member|auth|user|login)" | \
      grep -oE "'/[a-zA-Z/]+'|\"(/[a-zA-Z/]+)\"" | head -1 | tr -d "'\""  )
  fi
  # 단계 B: sub-route 탐색 (login/signin 우선, auth는 폴백)
  local sub_path
  # 우선 1: /login 또는 /signin 포함 경로
  sub_path=$(grep -rE "router\.(get|post)\s*\('[^']*(?:login|signin)[^']*'" \
    backend/src/ src/ routes/ --include="*.js" --include="*.ts" -h 2>/dev/null | \
    grep -oP "'/[^']+'" | tr -d "'" | grep -vE "update_login|change_login|login_history" | head -1)
  # 폴백: /auth 포함 경로
  if [ -z "$sub_path" ]; then
    sub_path=$(grep -rE "router\.(get|post)\s*\('[^']*auth[^']*'" \
      backend/src/ src/ routes/ --include="*.js" --include="*.ts" -h 2>/dev/null | \
      grep -oP "'/[^']+'" | tr -d "'" | grep -vE "update_auth|check_auth|send_auth" | head -1)
  fi
  # FIX-2 NestJS 보강: @Post('login') + @Controller('auth') 조합 (Decorator 방식)
  if [ -z "$sub_path" ]; then
    local nestjs_controller_prefix=""
    nestjs_controller_prefix=$(grep -rE "@Controller\s*\(" backend/src/ --include="*.ts" -l 2>/dev/null | \
      xargs grep -lE "@Post\s*\(\s*['\"]login['\"]" 2>/dev/null | head -1 | \
      xargs grep -oP "(?<=@Controller\s*\(\s*['\"])[^'\"]+(?=['\"])" 2>/dev/null | head -1 || echo "")
    if [ -n "$nestjs_controller_prefix" ]; then
      local global_prefix
      global_prefix=$(grep -rE "setGlobalPrefix" backend/src/main.ts 2>/dev/null | \
        grep -oP "(?<=setGlobalPrefix\s*\(\s*['\"])[^'\"]+(?=['\"])" | head -1 || echo "api/v1")
      sub_path="/${global_prefix}/${nestjs_controller_prefix}/login"
      echo "FIX-2: NestJS @Post('login') 감지 → ${sub_path}"
    fi
  fi
  # 결합
  if [ -n "$mount_prefix" ] && [ -n "$sub_path" ]; then
    echo "${mount_prefix}${sub_path}"
  elif [ -n "$sub_path" ]; then
    echo "$sub_path"
  else
    echo ""  # 발견 실패 → auth.mode: none
  fi
}

if [ -n "${AUTH_ENDPOINT:-}" ]; then
  LOGIN_ENDPOINT="$AUTH_ENDPOINT"
else
  LOGIN_ENDPOINT=$(discover_login_endpoint)
  CANDIDATE_COUNT=$(echo "$LOGIN_ENDPOINT" | grep -c '/' 2>/dev/null || echo 0)
  if [ "$CANDIDATE_COUNT" -gt 1 ]; then
    echo "[STOP] 로그인 엔드포인트 후보 다수 — 선택 필요:"; echo "$LOGIN_ENDPOINT"
    exit 2
  fi
  [ -z "$LOGIN_ENDPOINT" ] && AUTH_MODE="none"
fi
```
