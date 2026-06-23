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
  local role="$1" cmd="$2" cwd="$3" port="$4" health="${5:-/}"
  # 이미 기동 중이면 재사용
  curl -s -o /dev/null -w "%{http_code}" "http://localhost:$port$health" 2>/dev/null | grep -qE "^[23]" && echo "REUSE $role:$port" && return
  (cd "$cwd" && $cmd &> "/tmp/qa-${role}.log" &)
  echo $! > "/tmp/qa-${role}.pid"
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
  start_server "$role" "$cmd" "$cwd" "$port" "$health"
done
```

QA 종료 시 정리:
```bash
for pid_file in /tmp/qa-*.pid; do kill $(cat "$pid_file") 2>/dev/null; done
```

### 6. verify.sh 없으면 템플릿 복사

```bash
[ ! -f verify.sh ] && cp ${FORGE_ROOT:-$HOME/forge}/dev/templates/verify.sh.template verify.sh && chmod +x verify.sh
```

### 7. 디렉토리 생성

```bash
mkdir -p docs/qa/artifacts
```

### 8. DB Seed + 격리 (AD-92-3, FIX-4)

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
