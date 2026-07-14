---
name: qa-setup
description: "QA 하네스 부트스트랩 스킬 (AD-92 Phase 0 + P0-FIX). /qa 실행 전 자동 호출되어 서버 생명주기 관리, qa-config.json 생성, DB seed 격리, API 전수 발견, scenarios.md 게이트를 준비한다. 트리거: /qa 실행 시 Phase 0 자동 진입, 또는 QA 환경 세팅, 서버 기동 후 테스트, scenarios.md 생성 요청 시."
---

# qa-setup — QA 하네스 부트스트랩 (Phase 0, AD-92 P0-FIX)

**역할**: `/qa` 실행 전 QA 환경 전체를 준비한다. 스택 감지→qa-config.json 생성→서버 기동→seed 격리→API 발견→scenarios.md 게이트.
**입력**: 프로젝트 루트 경로 (기본값: CWD). 선택: `--spec <path>`, `--seed <path>`, `--migration`, `--legacy <URL>`, `--scope <scope>`

**`--force-new` 플래그** (§A13 idempotency 강제 신규):
- `--force-new` = 기존 `fix/qa-*` 브랜치 무시 + 신규 브랜치 생성 강제
- `QA_FORCE_NEW=1` 환경변수로 동일 효과
- 미지정 = 기존 브랜치 검사 → resume/v2 분기 (Phase A 자동 처리)

**`--scope` 파싱 규칙**:
- `--scope=full` (기본값) = 전체 API/페이지 (discovery_mode: "full")
- `--scope=<domain>` = qa-config.json `domains[]` 매칭 또는 자동 감지 (예: auth, payment, member)
- `--scope="src/routes/payment/**"` = file-pattern 직접 지정
- `--scope` 미지정 = full 동작. scenarios.md 전체 생성 후 스코프 필터링 → `scenarios-filtered.md`
**컨텍스트**: `/qa` Phase 0에서 메인 컨텍스트에서 직접 실행 (context:fork 없음).
**출력**: `docs/qa/qa-config.json` + `docs/qa/scenarios.md` + `verify.sh` + 서버 PID 파일 + DB seed 주입 완료 → Phase 1 진입 허가.

> **`--migration` 플래그**: legacy ↔ admin 행동 패리티 검증 모드. Step 0.5에서 분기, R1~R4 실행 후 Step 4 qa-config migration 블록 주입.

## 실행 순서 (9단계)

### 0. 전제 — qa-config.json이 이미 존재하면 재생성 스킵 + --scope 파싱

> **config 계약 검증 + 의존 서비스 선확인 (2026-07-10, 범용 — 프로젝트 값 하드코딩 금지)**
> - **스키마 검증(4-3b)**: qa-config에 `surfaceAdapters`·`authBootstrap`·`dependencies` 필드가 있으면 형식 검증 — `authBootstrap.type ∈ {cookie-inject, token-header, login-flow, none}`(시크릿 값은 `.env` 참조만, 평문 발견 시 WARN+마스킹), `dependencies[] = {name, check: "port:<n>" | "url:<healthcheck>"}`. invalid = **WARN + 해당 필드 무시(fail-open)** — 기존 동작 불변.
> - **의존 서비스 liveness(4-4)**: `dependencies[]` 선언이 있으면 서버 기동 전 각 항목을 `ss -tln`(port) 또는 curl(url)로 선확인. DOWN 발견 시 WARN + "의존 서비스 DOWN이 404/Unauthorized로 위장할 수 있음" 명시 후 Human 확인 — 포트·서비스 목록은 **프로젝트 선언 값**이며 이 스킬에 어떤 기본 포트도 하드코딩하지 않는다. 선언 부재 = 스킵(기존 동작).

```bash
[ -f docs/qa/qa-config.json ] && echo "qa-config 재사용" && QA_CONFIG_EXISTS=1

# --scope 파싱 (AD-93 갭 19)
QA_SCOPE="full"
for arg in "$@"; do
  case "$arg" in
    --scope=full)    QA_SCOPE="full" ;;
    --scope=*)       QA_SCOPE="${arg#--scope=}" ;;  # domain 이름 또는 file-pattern
  esac
done
export QA_SCOPE

# --dry-run → discovery_mode=dry-run
QA_DISCOVERY_MODE="full"
echo "$@" | grep -q "\-\-dry-run" && QA_DISCOVERY_MODE="dry-run"
export QA_DISCOVERY_MODE

# 스코프 필터링: scenarios.md 전체 생성 후 필터 (full 이외)
# full → scenarios-filtered.md = scenarios.md 그대로
# domain → qa-config.json domains[] 매칭 시나리오만
# file-pattern → 해당 경로 관련 시나리오만
apply_scope_filter() {
  if [ "$QA_SCOPE" = "full" ]; then
    cp docs/qa/scenarios.md docs/qa/scenarios-filtered.md
    echo "scope=full → scenarios-filtered.md = 전체"
    return
  fi
  python3 -c "
import re, os, sys
scope = os.environ.get('QA_SCOPE', 'full')
lines = open('docs/qa/scenarios.md').readlines()
filtered = []
in_scope = False
for line in lines:
    # 헤더 유지
    if line.startswith('#'):
        # scope가 domain명이면 FR 섹션명 매칭
        in_scope = scope.lower() in line.lower() or scope == 'full'
        filtered.append(line)
    elif in_scope or scope == 'full':
        filtered.append(line)
with open('docs/qa/scenarios-filtered.md', 'w') as f:
    f.writelines(filtered)
print(f'scope={scope} → {sum(1 for l in filtered if l.startswith(\"|\"))} 시나리오 필터링')
"
}
```

### 0.2. 스테일 브랜치 Preflight (base 최신성 경고, WARN-first — 2026-07-07 로컬 QA 갭 재발 방지)

로컬 QA를 develop보다 크게 뒤처진 feature/fix 브랜치 위에서 실행하면 이미 수정된 버그가 재발한 것처럼 보여 불필요한 삽질을 유발한다(2026-07-07 실측 근본원인). `git fetch` 후 base 브랜치 대비 behind 커밋 수를 확인해 WARN만 출력한다 — **비차단**.

```bash
QA_BASE_BRANCH="${QA_BASE_BRANCH:-develop}"
QA_STALE_THRESHOLD="${QA_STALE_THRESHOLD:-5}"

if git fetch origin "$QA_BASE_BRANCH" --quiet 2>/dev/null; then
  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
  BEHIND_COUNT=$(git rev-list --count "HEAD..origin/${QA_BASE_BRANCH}" 2>/dev/null || echo 0)
  if [ "${BEHIND_COUNT:-0}" -gt "$QA_STALE_THRESHOLD" ] 2>/dev/null; then
    echo "WARN: 현재 브랜치(${CURRENT_BRANCH})가 origin/${QA_BASE_BRANCH} 대비 ${BEHIND_COUNT}커밋 behind — stale base 위 QA 위험, ${QA_BASE_BRANCH} 기반 재기동 권고 (비차단, 계속 진행)"
  fi
else
  echo "WARN: git fetch 실패(네트워크/권한/오프라인) — 브랜치 최신성 확인 스킵, 계속 진행 (fail-open)"
fi
```

### 0.5. Migration 모드 감지 (AD-92 P1-A)

`--migration` 플래그 또는 `MIGRATION_MODE=true` 환경변수 → 아래 R1~R4 실행 후 Step 1~12 계속.

```bash
MIGRATION_MODE="${MIGRATION_MODE:-false}"
LEGACY_URL="${LEGACY_URL:-${2:-http://localhost:8081}}"

if [ "${MIGRATION_MODE}" = "true" ] || echo "${@}" | grep -q "\-\-migration"; then
  MIGRATION_MODE="true"
  echo "=== Migration 모드 활성 ==="

  # R1 — 듀얼 서버 부트스트랩
  echo "[R1] 듀얼 서버 부트스트랩"
  bash "$(dirname "$0")/scripts/migration-bootstrap.sh" "$(pwd)" \
    || { echo "ERROR: R1 부트스트랩 실패"; exit 1; }

  # R2 — 병렬 인증 (legacy ci_session + admin access_token)
  echo "[R2] 병렬 인증"
  LEGACY_URL="${LEGACY_URL}" \
  ADMIN_URL="${ADMIN_URL:-http://localhost:3001}" \
  bash "$(dirname "$0")/scripts/migration-auth.sh" \
    || { echo "ERROR: R2 인증 실패"; exit 1; }
  MIGRATION_AUTH_FILE="/tmp/qa-migration-auth.json"

  # R5 — 1E 커버리지 필터 (COVERED→run, PARTIAL→run+flag, MISSING/FALSE+→skip)
  echo "[R5] 1E 커버리지 필터 적용"
  COVERAGE_FILE="$(find docs/infrastructure -name '*1e*coverage*.md' -o -name '*phase1*1e*.md' 2>/dev/null | head -1)"
  if [ -z "${COVERAGE_FILE}" ]; then
    echo "WARN: 1E coverage 파일 미발견 — 모든 라우트 COVERED 처리"
  fi

  # R4 — 라우트 페어 빌더
  echo "[R4] 라우트 페어 빌더"
  ROUTE_MAP="docs/qa/parity-route-map.md"
  PAIRS_OUT="docs/qa/migration-route-pairs.json"
  if [ -f "${ROUTE_MAP}" ]; then
    python3 "$(dirname "$0")/scripts/route-pair-builder.py" \
      --route-map "${ROUTE_MAP}" \
      --coverage  "${COVERAGE_FILE:-/dev/null}" \
      --output    "${PAIRS_OUT}" \
    || echo "WARN: R4 route-pair-builder 실패 — ${PAIRS_OUT} 없이 계속"
  else
    echo "WARN: parity-route-map.md 없음 — R4 스킵"
  fi

  echo "=== Migration 준비 완료 (R1~R4) — Step 1 계속 ==="
fi
```

### 1. 스택·서버 감지 (FIX-3 — split-server)

> **게임 프로젝트** (server/ + client/ + bot-dotnet8/): `/game-qa` 스킬 전용. qa-setup 스킵.

```bash
# 백엔드 런타임 자동 감지 (다양한 스택 지원)
detect_runtime() {
  local dir="${1:-.}"
  [ -f "$dir/package.json" ] && echo "nodejs" && return
  [ -f "$dir/pom.xml" ] || [ -f "$dir/build.gradle" ] && echo "java" && return
  [ -f "$dir/requirements.txt" ] || [ -f "$dir/pyproject.toml" ] || [ -f "$dir/manage.py" ] && echo "python" && return
  [ -f "$dir/go.mod" ] && echo "go" && return
  ls "$dir"/*.sln 2>/dev/null | head -1 | grep -q "." && echo "dotnet" && return
  [ -f "$dir/composer.json" ] && echo "php" && return
  [ -f "$dir/Cargo.toml" ] && echo "rust" && return
  echo "unknown"
}

# split-server 감지: backend/ + frontend/ 동시 존재
if [ -d backend/ ] && [ -d frontend/ ]; then
  STACK_TYPE="split-server"
  BE_RUNTIME=$(detect_runtime backend)
  FE_RUNTIME=$(detect_runtime frontend)
  # 포트 추출 (Node.js 기본 + 기타)
  BE_PORT=$(grep -r '"PORT"' backend/.env backend/.env.example 2>/dev/null | head -1 | grep -oP '\d{4,5}' | head -1 || echo "3000")
  FE_PORT=$(grep -r 'port:' frontend/vite.config.* 2>/dev/null | grep -oP '\d{4,5}' | head -1 || echo "5173")
  # dev 커맨드 런타임별
  case "$BE_RUNTIME" in
    nodejs)  BE_DEV_CMD=$(jq -r '.scripts.dev // "npm run dev"' backend/package.json) ;;
    java)    BE_DEV_CMD="mvn spring-boot:run" ;;
    python)  BE_DEV_CMD="uvicorn main:app --reload" ;;
    go)      BE_DEV_CMD="go run ." ;;
    php)     BE_DEV_CMD="php artisan serve" ;;
    *)       BE_DEV_CMD="echo 'BE_DEV_CMD 수동 설정 필요'" ;;
  esac
  FE_DEV_CMD=$(jq -r '.scripts.dev // "npm run dev"' frontend/package.json 2>/dev/null || echo "npm run dev")
else
  STACK_TYPE="single"
  BE_RUNTIME=$(detect_runtime .)
  PORT=$(grep -r '"PORT"' .env .env.example 2>/dev/null | head -1 | grep -oP '\d{4,5}' | head -1 || echo "3000")
fi
BACKEND_FRAMEWORK="$BE_RUNTIME"
echo "스택: $STACK_TYPE | 런타임: $BE_RUNTIME"
```

### 1.5. E2E 러너 실재 확인 + 폴백 (P1-⑤, 2026-07-07 로컬 QA 갭 — B1)

`scripts/run-e2e-local.sh` / `test-e2e-full.sh`는 `${HOME}/.claude/trine/scripts/e2e-runner.sh`에 위임한다. 이 러너가 파일시스템에 실재하지 않으면 로컬 스택 부트스트랩이 조용히 실패한다(2026-07-07 실측). qa-setup은 러너 실재를 먼저 확인하고, 부재 시 **WARN + 인라인 부트스트랩 폴백**으로 계속 진행한다(하드스톱 금지, fail-open).

```bash
E2E_RUNNER="${HOME}/.claude/trine/scripts/e2e-runner.sh"
PROJECT_RUNNER_WRAPPER=$(ls scripts/run-e2e-local.sh scripts/test-e2e-full.sh 2>/dev/null | head -1)

if [ ! -f "$E2E_RUNNER" ]; then
  echo "WARN: e2e-runner.sh 부재 (${E2E_RUNNER}) — ${PROJECT_RUNNER_WRAPPER:-run-e2e-local.sh} 위임 실패 예상. 인라인 부트스트랩 폴백으로 계속 진행 (비차단)."
  E2E_RUNNER_FALLBACK=1
else
  E2E_RUNNER_FALLBACK=0
  echo "INFO: e2e-runner.sh 확인됨 — 정상 위임 경로 사용"
fi
export E2E_RUNNER_FALLBACK
```

**인라인 폴백 절차** (`E2E_RUNNER_FALLBACK=1`일 때 qa-setup이 대신 수행 — 신규 러너 스크립트 작성 없이 기존 step 재사용):
1. API 서버 기동 — step 5 `start_server` 로직 재사용 (role=backend/server)
2. 헬스 대기 — step 5 폴링 루프(최대 30회 × 2초) 그대로 사용
3. seed 주입 — step 8 로직 재사용, **auth/account seed 선행**(admin 의존 seed는 그 다음). `assert-db-isolation.sh` 게이트 그대로 적용
4. web(frontend) 서버 기동 — step 5 `start_server` 재사용 (role=frontend/web)
5. 스모크 확인 — `curl` 레벨로 BASE_URL 홈/로그인 페이지 200 확인 (Playwright 풀 E2E 아님, 최소 생존 확인)

### 1.6. 런타임 위생 — Redis 격리·포트 충돌·web 안정성 (WARN-first, 2026-07-07 로컬 QA 갭)

로컬 QA에서 dev 스택과 자원을 공유하면 오판·불안정이 발생한다(실측). 아래는 전부 **비차단 WARN/권고** — 자동 강제 아님.

```bash
# M1. Redis 캐시 교차오염 방지 — test는 별도 db index 사용 권고
#   dev API와 같은 Redis db(0)를 공유하면 QA가 dev 캐시 응답을 읽어 오판(실측: /blog에 dev 데이터 노출).
if [ "${NODE_ENV:-}" = "test" ]; then
  case "${REDIS_URL:-}" in
    */1|*/2|*/3) : ;;  # 이미 분리된 db index
    *) echo "WARN: NODE_ENV=test인데 REDIS_URL이 dev와 같은 db(0) 공유 의심 — 별도 db index(redis://…/1) 또는 key prefix 권고 (교차오염 방지, 비차단)" ;;
  esac
fi

# M3. 포트 충돌 사전 경고 — dev 스택이 대상 포트를 점유 중이면 QA가 dev를 때릴 위험
#   (실제 판별 + 조치는 아직 서버 기동 전이라 여기선 불가 — Step 5 start_server()의 QA-PORT 처리가 실행)
for p in "${BE_PORT:-${PORT:-3000}}" "${FE_PORT:-3000}"; do
  if command -v fuser >/dev/null 2>&1 && fuser "${p}/tcp" >/dev/null 2>&1; then
    echo "WARN: 포트 ${p} 이미 점유(dev 스택?) — QA가 dev를 때릴 위험. Step 5 기동 시 QA-PORT 로직(portConflictPolicy)이 자동 판별·조치 (비차단)"
  fi
done
```

**M4. web 안정성 + 세션 생존성 (권고)**: Playwright 부하 중 `next dev`가 반복 사망하면 워크플로가 실패한다(실측 2회). (a) web을 `next build && next start`(prod 모드)로 기동하면 개발 서버보다 안정적, (b) 서버 라이프사이클을 세션 독립(nohup/pm2 + healthcheck)으로 두면 장시간 Phase A~H 워크플로가 세션 종료에도 생존, (c) 워크플로 중단 시 `resumeFromRunId`로 재개. 권고이며 프로젝트 여건에 맞게 선택 — 강제 아님.

### 2. 로그인 엔드포인트 발견 (FIX-2)

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

### 3. 인증 방식 자동 감지 (FIX-1)

qa-setup이 실제 로그인 시도 → 응답 분석:

```bash
detect_auth_mode() {
  local creds="${TEST_CREDENTIALS:-{\"email\":\"qa@test.com\",\"password\":\"qa-seed-pw\"}}"
  local response headers body
  response=$(curl -s -i -X POST "$BASE_URL$LOGIN_ENDPOINT" \
    -H "Content-Type: application/json" \
    -d "$creds" 2>/dev/null)
  headers=$(echo "$response" | sed '/^$/q')
  body=$(echo "$response" | sed '1,/^$/d')

  if echo "$headers" | grep -qi "set-cookie"; then
    AUTH_MODE="cookie"
    COOKIE_NAME=$(echo "$headers" | grep -i "set-cookie" | grep -oP '(?<=Set-Cookie: )\w+' | head -1 || echo "access_token")
    TOKEN_FIELD=""
  elif echo "$body" | jq -e '.accessToken // .token // .jwt' >/dev/null 2>&1; then
    AUTH_MODE="bearer"
    TOKEN_FIELD=$(echo "$body" | jq -r 'keys[] | select(. == "accessToken" or . == "token" or . == "jwt")' | head -1)
    COOKIE_NAME=""
  else
    AUTH_MODE="none"
    COOKIE_NAME=""; TOKEN_FIELD=""
  fi
}
[ -z "$AUTH_MODE" ] && detect_auth_mode
```

### 4. qa-config.json 생성 (단일 진실)

위 탐침 결과를 파일로 고정. verify.sh + scenarios + healer가 이 파일을 소비.

```bash
mkdir -p docs/qa
python3 -c "
import json, sys, os
config = {
  'stack': {'type': '${STACK_TYPE}', 'backend': '${BACKEND_FRAMEWORK}'},
  'servers': $(
    if [ '$STACK_TYPE' = 'split-server' ]; then
      echo '[{"role":"backend","cmd":"'$BE_DEV_CMD'","cwd":"backend","port":'$BE_PORT',"health":"/api/health"},{"role":"frontend","cmd":"'$FE_DEV_CMD'","cwd":"frontend","port":'$FE_PORT'}]'
    else
      echo '[{"role":"server","cmd":"npm run dev","cwd":".","port":'${PORT:-3000}'}]'
    fi
  ),
  'auth': {
    'mode': '${AUTH_MODE:-bearer}',
    'loginEndpoint': '${LOGIN_ENDPOINT:-/api/auth/login}',
    'loginMethod': 'POST',
    'credentialsEnv': 'TEST_CREDENTIALS',
    'cookieName': '${COOKIE_NAME:-}',
    'tokenField': '${TOKEN_FIELD:-accessToken}'
  },
  'baseUrl': 'http://localhost:${BE_PORT:-3000}',
  'discovery_mode': os.environ.get('QA_DISCOVERY_MODE', 'full'),
  'domains': json.loads(os.environ.get('QA_DOMAINS', '[]')),
  'scope': os.environ.get('QA_SCOPE', 'full')
}
if os.environ.get('MIGRATION_MODE') == 'true':
  config['migration'] = {
    'legacyPath': os.environ.get('LEGACY_PATH', '../../admin-legacy'),
    'legacyPort': int(os.environ.get('LEGACY_PORT', '8081')),
    'legacyUrl': os.environ.get('LEGACY_URL', 'http://localhost:8081'),
    'legacyDbPort': int(os.environ.get('LEGACY_DB_PORT', '13306')),
    'sessionPath': '/tmp/ci_sessions',
    'authFile': '/tmp/qa-migration-auth.json',
    'routePairsFile': 'docs/qa/migration-route-pairs.json',
    'extractionRulesDir': 'docs/qa/extraction-rules'
  }
print(json.dumps(config, indent=2, ensure_ascii=False))
" > docs/qa/qa-config.json
echo "qa-config.json 생성 완료"
```

### 5. 개발 서버 생명주기

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

**`portConflictPolicy`** (qa-config.json 최상위, 선택 필드, 기본 `isolate`): 대상 포트를 QA가 띄우지 않은 프로세스가 이미 점유 중일 때의 정책.
- `isolate` (기본): dev 스택은 그대로 두고 QA만 격리 포트(`port+1000`대 빈 포트)로 재배정, `qa-config.json`(`servers[].port` + `baseUrl`)에 즉시 반영 → 이후 Step 9 scenarios.md/verify.sh가 갱신된 포트를 그대로 사용.
- `restore-dev`: 점유 중인 dev 프로세스를 정지시키고 QA가 원 포트를 사용, QA 종료 시 동일 `cmd`/`cwd`로 best-effort 재기동 시도(완전 보장 아님 — 프로젝트별 dev 기동 스크립트 차이로 실패 가능, 실패 시 WARN).
- `warn-only`: 조치 없이 경고만 남기고 기존 REUSE 동작 유지 (구버전 호환 opt-out).

전부 **WARN-first·fail-open**: 점유 PID 판별 도구(lsof/fuser)가 없으면 판정 자체를 스킵하고 기존 REUSE로 진행 — 하드 실패 없음.

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

### 6. verify.sh 없으면 템플릿 복사

```bash
[ ! -f verify.sh ] && cp ~/forge/dev/templates/verify.sh.template verify.sh && chmod +x verify.sh
```

### 7. 디렉토리 생성

```bash
mkdir -p docs/qa/artifacts
```

### 8. DB Seed + 격리 (AD-92-3, FIX-4, +QA-SEED 2026-07-07)

**QA-SEED — auth 계정 seed 선행 게이트**: 로그인 의존 E2E(로그인 스모크 등)는 fresh/reset DB에서 admin/editor/user 같은 multi-role 계정이 먼저 심어져 있어야 통과한다. 기존 엔진은 일반 단일파일 seed(`seed.sql`/`.ts`/`.js`) 디스패치와 계정 1건 삽입만 가정해 이 순서를 보장하지 않았다. 이 계약은 프로젝트가 `qa-config.json`에 아래 두 형태 중 하나(또는 둘 다)로 명시한다 — 특정 앱의 자격증명·파일명은 하드코딩하지 않고 계약 자체만 정의:

- `seed.authSeed`: DB 드라이버로 직접 주입하는 파일 경로(.sql/.ts/.js) — 나머지 seed와 동일 방식이나 **가장 먼저** 실행.
- `seed.authSeedHook`: 백엔드가 UP된 뒤에만 실행 가능한 커맨드 문자열(예: 내부 provisioning 엔드포인트를 호출해 admin/editor/user 계정을 생성하는 방식 — DB row insert가 아니라 API 경유로만 계정이 만들어지는 프로젝트용). Step 8은 Step 5(서버 기동) 이후에 실행되므로 순서 문제 없음.
- `seed.dependentSeeds`: authSeed(Hook) 이후에 순서대로 실행할 나머지 seed 파일 배열.

`qa-config.json`에 `seed.authSeed`도 `seed.authSeedHook`도 없으면 **WARN만(비차단)**: 프로젝트가 이미 다른 방식으로 auth 계정을 공급 중일 수 있으므로 하드 블록하지 않는다.

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

### 9. scenarios.md 없으면 Feature Discovery (FIX-5 포함)

#### API 전수 발견 (우선순위 순)

1. **gitnexus route_map 명시 호출** (FIX-5): `mcp__gitnexus__route_map` → 결과 없음/에러 시 grep fallback (둘 다 로그)
2. grep fallback: `@Controller\|@Get\|@Post\|@Put\|@Delete\|router\.\(get\|post\|put\|delete\)` → 엔드포인트 추출
3. Spec 있으면 FR 매핑 (`FR-001` 레이블 추가)

gitnexus 호출:
```
mcp__gitnexus__route_map({project: "<project-name>"})
→ 결과 있으면 사용 / 에러/빈값이면 grep fallback + 로그: "gitnexus route_map 미지원 — grep fallback"
```

#### 시나리오 출처 격리 (AD-93 §A8 — CRITICAL)

> **코드에서 기대값 역산 금지.** 동어반복 = 로직버그 못 잡음.

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

**`source:` 필드 없는 행 = qa-event-router check_scenario_source → exit 2**.
파일 미작성 → Phase B **[STOP]**: "scenarios.md 작성 완료 후 /qa 재실행"

### 9.5. Coverage Map 검증 (A6 — 시나리오 깊이 모델)

scenarios.md 초안 생성 직후 실행. 깊이 부족=exit 2.

#### Coverage Map — entity×action×screen×viewport full-cartesian

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

#### flow-chain schema 검증

scenarios.md 내 다단계 플로우(A→B→C) 시나리오는 `flow_chain:` 필드 필수:

```markdown
| # | Method | Path | Auth | Body | Expected Status | Expected Body | source | flow_chain | state_after |
|---|--------|------|------|------|-----------------|---------------|--------|------------|-------------|
| 5 | POST | /api/order | yes | {...} | 201 | {id:...} | spec#L45 | order-flow:step1 | order.status=PENDING |
| 6 | PUT  | /api/order/{id}/pay | yes | {...} | 200 | {...} | spec#L60 | order-flow:step2 | order.status=PAID |
| 7 | GET  | /api/order/{id} | yes | — | 200 | {status:PAID} | spec#L70 | order-flow:step3-verify | — |
```

`flow_chain:` 필드 없는 다단계 시나리오(≥2단계) 발견 시 → WARN (exit 1)

#### round-trip oracle 검증

쓰기 시나리오(POST/PUT/DELETE) 각각에 대해 후속 검증 행 필수:

```markdown
| 3 | POST | /api/user | yes | {name:...} | 201 | {id:42} | spec#L30 | — | — |
| 4 | GET  | /api/user/42 | yes | — | 200 | {name:...} | spec#L30 | round-trip:row3 | — |  ← 필수
```

`round-trip:row{N}` 태그 없는 쓰기 시나리오 → WARN (exit 1)

#### entity CRUD 완결성 체크

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

#### responsive 전수 생성

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

#### 값축(value-axis) 검증

입력 필드별 eq-class×boundary:

| 필드 유형 | 필수 케이스 |
|---------|-----------|
| 문자열(유한 유효값) | 각 eq-class 대표 1건 + 경계 |
| 숫자(범위) | min, max, min-1, max+1, 중간값 |
| 필수 필드 누락 | 빈 값 / null |
| unbounded 문자열 | eq-class(정상, 너무 짧, 너무 김) 대표 |

pairwise 축소 금지 — 각 eq-class+boundary 전수. scenarios.md에 `value_class:` 열 명시 권장.

#### Coverage Map 검증 완료 조건

- [ ] `docs/qa/coverage-map.json` 생성 + 누락 셀 0건
- [ ] 다단계 플로우 → `flow_chain:` 필드 있음
- [ ] 쓰기 시나리오 → round-trip 검증 행 있음
- [ ] 엔티티별 CRUD 전수 (면제 명시 시 제외)
- [ ] UI 시나리오 × {PC, Mobile} 전수
- [ ] 주요 입력 필드 eq-class×boundary 케이스 있음

미충족 항목 → exit 2 (waiver 없음). responsive 매트릭스 누락 셀 = exit 2, 값축(eq-class×boundary) 누락 = exit 2. unbounded 자유텍스트 입력만 eq-class 전수 대표 케이스로 갈음 허용(무한 케이스 회피 carve-out). Phase 1 진입 불가.

### 10. Spec-소스 2-way diff (Spec 존재 시)

`spec-compliance-checker` 호출 → `docs/qa/spec-drift.md` 저장:
- **spec-only** (구현 누락) → 버그로 등록
- **code-only** (미문서) → scenarios.md에 추가 + spec 갱신 제안

### 11. LOG_HTTP=true 설정

```bash
export LOG_HTTP=true  # AD-91 로깅 활성화 — Healer 증거용
```

### 12. 사전 Obsidian 컨텍스트 수집 (D-1 정정 — Healer 참조용)

프로젝트 관련 기존 지식을 rag-search로 수집 → `docs/qa/obsidian-context.md` 저장.
Healer가 a0 수정 전 필독 항목으로 사용 (⑤).

```bash
PROJECT_NAME=$(basename "$(pwd)")
mkdir -p docs/qa

# 프로젝트 디버깅 + 아키텍처 사전 검색
{
  echo "# Obsidian 컨텍스트 — ${PROJECT_NAME} ($(date +%Y-%m-%d))"
  echo ""
  echo "## 디버깅 이력"
  # /rag-search "${PROJECT_NAME} 디버깅" 호출 결과 삽입
  # 결과 없음 = 콜드스타트 — 빈 섹션 유지
  echo ""
  echo "## 아키텍처 참조"
  # /rag-search "${PROJECT_NAME} 아키텍처" 호출 결과 삽입
  echo ""
} > docs/qa/obsidian-context.md
```

호출 방법 (메인 컨텍스트에서):
```
/rag-search "{PROJECT_NAME} 디버깅"  → 결과 obsidian-context.md 디버깅 섹션에 기록
/rag-search "{PROJECT_NAME} 아키텍처" → 결과 아키텍처 섹션에 기록
```

콜드스타트(결과 없음) = 정상 — 빈 파일로 생성. Phase 1 차단 X.

## 완료 조건

다음 모두 충족 시 Phase 1 진입 허가:
- [ ] `docs/qa/qa-config.json` 존재 (스택·인증 설정 고정)
- [ ] 서버 UP (모든 servers[] health check 200)
- [ ] `docs/qa/artifacts/` 존재
- [ ] `verify.sh` 존재 + 실행 권한
- [ ] DB seed 주입 완료 (또는 seed.sql.draft Human 확인 중)
- [ ] `scenarios.md` 존재 + 1개 이상 시나리오
- [ ] `docs/qa/obsidian-context.md` 존재 (빈 파일도 OK — 콜드스타트 허용)
- [ ] **Coverage Map 통과 (A6)**: `docs/qa/coverage-map.json` 누락 셀 0건 + entity CRUD 전수 + round-trip oracle + responsive 전수

**Migration 모드 추가 조건** (`--migration` 시):
- [ ] `/tmp/qa-migration-auth.json` 존재 (R2 — legacy+admin 양쪽 세션)
- [ ] `docs/qa/migration-route-pairs.json` 존재 (R4 — COVERED 페어 1건 이상)
- [ ] `qa-config.json.migration` 블록 존재 (legacyUrl, routePairsFile 포함)

## 자동 평가 (eval-rubric 통합)

본 스킬 결과 산출 후 자동으로 `eval-rubric` 호출 → 4축 Rubric 채점 → `eval_cases.jsonl` 누적.

### 호출 시점
- scenarios.md 생성 완료 직후 (`docs/qa/scenarios.md`)

### 절차
1. 산출물 저장 후: `/eval-rubric --target docs/qa/scenarios.md`
2. verdict + 4축 점수 + rationale 수신
3. eval_cases.jsonl append — case_id: EC-qa-setup-{N}

### 자동 비활성
- `EVAL_RUBRIC_AUTO=off`
- frontmatter `eval_cases: off`

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
