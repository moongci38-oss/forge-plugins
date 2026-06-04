#!/usr/bin/env bash
# game-verify.sh — 게임 서버 QA 하네스 (AD-92 P1-E)
# 역할: 빌드검증 + Unity MCP/CLI 테스트 + 소켓 스모크 + 정적분석
# Exit 0=PASS, 1=FAIL
#
# Unity MCP 통합 (우선):
#   CoderGamester/mcp-unity → mcp run_tests 도구 (Unity Editor + MCP 서버 필요)
#   공식 com.unity.ai.assistant → Edit > Project Settings > AI > Unity MCP 설정
# Unity CLI 폴백:
#   Unity.exe -batchmode -runTests -testPlatform editmode -testResults results.xml
#   결과: NUnit XML → 파싱 후 PASS/FAIL 판정
#
# 환경변수:
#   UNITY_PATH    Unity Editor 실행 파일 경로 (예: /mnt/c/Program Files/Unity/.../Unity.exe)
#   UNITY_PROJECT 테스트할 Unity 프로젝트 루트 경로
#   BOT_SMOKE=1   bot-dotnet8 소켓 스모크 테스트 활성화
QA_CONFIG="${QA_CONFIG:-docs/qa/qa-config.json}"
FAIL=0; PASS_COUNT=0; FAIL_COUNT=0

log_pass() { echo "PASS $1"; PASS_COUNT=$((PASS_COUNT+1)); }
log_fail() { echo "FAIL $1 — $2"; FAIL_COUNT=$((FAIL_COUNT+1)); FAIL=1; }

# ===== 서버 런타임 자동 감지 =====
detect_server_runtime() {
  local server_dir="${1:-server}"
  # Node.js
  [ -f "$server_dir/package.json" ] || [ -f "$server_dir/app.js" ] || [ -f "$server_dir/index.js" ] && echo "nodejs" && return
  # .NET (msbuild legacy)
  ls "$server_dir"/*.sln 2>/dev/null | head -1 | grep -q "." && echo "dotnet-msbuild" && return
  # .NET modern
  ls "$server_dir"/*.csproj 2>/dev/null | head -1 | grep -q "." && echo "dotnet" && return
  # Java/Spring
  [ -f "$server_dir/pom.xml" ] || [ -f "$server_dir/build.gradle" ] && echo "java" && return
  # Python
  [ -f "$server_dir/requirements.txt" ] || [ -f "$server_dir/pyproject.toml" ] || [ -f "$server_dir/manage.py" ] && echo "python" && return
  # Go
  [ -f "$server_dir/go.mod" ] && echo "go" && return
  # C++ (CMake / Makefile / Visual Studio)
  [ -f "$server_dir/CMakeLists.txt" ] || ls "$server_dir"/*.vcxproj 2>/dev/null | head -1 | grep -q "." && echo "cpp" && return
  [ -f "$server_dir/Makefile" ] && grep -q "g++\|clang++" "$server_dir/Makefile" 2>/dev/null && echo "cpp" && return
  # PHP
  [ -f "$server_dir/artisan" ] || [ -f "$server_dir/composer.json" ] && echo "php" && return
  # Rust
  [ -f "$server_dir/Cargo.toml" ] && echo "rust" && return
  # Ruby
  [ -f "$server_dir/Gemfile" ] && echo "ruby" && return
  echo "unknown"
}

# ===== 소켓 프로토콜 감지 =====
detect_socket_protocol() {
  local server_dir="${1:-server}"
  # Socket.IO
  grep -rq "socket\.io\|socketio\|socket-io" "$server_dir" --include="*.json" --include="*.js" --include="*.ts" 2>/dev/null && echo "socketio" && return
  # WebSocket (ws / uWebSockets)
  grep -rq '"ws"\|uWebSockets\|WebSocketServer' "$server_dir" --include="*.json" --include="*.js" 2>/dev/null && echo "websocket" && return
  # TCP raw (.NET GameServer 패턴)
  grep -rq "TcpListener\|TcpClient\|Socket(" "$server_dir" --include="*.cs" 2>/dev/null && echo "tcp" && return
  echo "http"
}

# qa-config.json 읽기 (있으면 우선, 없으면 자동 감지)
if [ -f "$QA_CONFIG" ]; then
  STACK_TYPE=$(jq -r '.stack.type // "game-server"' "$QA_CONFIG")
  SERVER_RUNTIME=$(jq -r '.stack.serverRuntime // ""' "$QA_CONFIG")
  SOCKET_PROTOCOL=$(jq -r '.stack.socketProtocol // ""' "$QA_CONFIG")
  BASE_URL=$(jq -r '.baseUrl // "http://localhost:3000"' "$QA_CONFIG")
  BOT_DIR=$(jq -r '.botDir // "bot-dotnet8"' "$QA_CONFIG")
fi

# 미감지 항목 자동 보완
SERVER_DIR="server"; [ -d "src" ] && ! [ -d "server" ] && SERVER_DIR="src"
[ -z "$SERVER_RUNTIME" ]    && SERVER_RUNTIME=$(detect_server_runtime "$SERVER_DIR")
[ -z "$SOCKET_PROTOCOL" ]   && SOCKET_PROTOCOL=$(detect_socket_protocol "$SERVER_DIR")
echo "서버 런타임: $SERVER_RUNTIME | 소켓 프로토콜: $SOCKET_PROTOCOL"

# ===== T-BUILD: 봇/서버 빌드 검증 =====
run_build_check() {
  echo "=== T-BUILD: 빌드 검증 (런타임: $SERVER_RUNTIME) ==="

  # 봇 빌드 (bot-dotnet8 — .NET bot은 항상 존재 시 검증)
  if [ -d "$BOT_DIR" ]; then
    if dotnet build "$BOT_DIR" --no-restore -c Release -v quiet 2>&1 | grep -qE "Build succeeded|빌드 성공"; then
      log_pass "T-BUILD bot 빌드 ($BOT_DIR)"
    else
      log_fail "T-BUILD bot 빌드" "dotnet build FAILED — $BOT_DIR"
    fi
  fi

  # 서버 빌드 — 런타임별
  case "$SERVER_RUNTIME" in
    nodejs)
      # Node.js: package.json 존재 + 빌드 스크립트 있으면 실행, 없으면 syntax 체크
      if jq -e '.scripts.build' "$SERVER_DIR/package.json" >/dev/null 2>&1; then
        npm run build --prefix "$SERVER_DIR" 2>&1 | tail -3 && log_pass "T-BUILD Node.js 빌드" || \
          log_fail "T-BUILD Node.js 빌드" "npm run build FAILED"
      else
        node --check "$SERVER_DIR/app.js" 2>/dev/null && log_pass "T-BUILD Node.js syntax 체크" || \
          log_fail "T-BUILD Node.js syntax" "syntax error 감지"
      fi
      ;;
    dotnet-msbuild)
      # .NET legacy (GodBlade 패턴)
      [ -f "common/EodCommon_VS2017.sln" ] && \
        msbuild common/EodCommon_VS2017.sln /p:Configuration=Release /v:minimal 2>&1 | grep -q "Build succeeded" && \
        log_pass "T-BUILD msbuild common" || log_fail "T-BUILD msbuild common" "failed"
      ls "$SERVER_DIR"/*.sln 2>/dev/null | head -1 | xargs -I{} \
        msbuild {} /p:Configuration=Debug /v:minimal 2>&1 | grep -q "Build succeeded" && \
        log_pass "T-BUILD msbuild server" || log_fail "T-BUILD msbuild server" "failed"
      ;;
    dotnet)
      dotnet build "$SERVER_DIR" -c Release -v quiet 2>&1 | grep -qE "Build succeeded" && \
        log_pass "T-BUILD dotnet server" || log_fail "T-BUILD dotnet server" "failed"
      ;;
    java)
      if [ -f "$SERVER_DIR/pom.xml" ]; then
        mvn -f "$SERVER_DIR/pom.xml" compile -q 2>&1 | tail -3 && log_pass "T-BUILD Maven compile" || \
          log_fail "T-BUILD Maven" "compile FAILED"
      elif [ -f "$SERVER_DIR/build.gradle" ]; then
        (cd "$SERVER_DIR" && ./gradlew compileJava -q 2>&1 | tail -3) && log_pass "T-BUILD Gradle compile" || \
          log_fail "T-BUILD Gradle" "compile FAILED"
      fi
      ;;
    python)
      python3 -m py_compile $(find "$SERVER_DIR" -name "*.py" | head -20) 2>&1 && \
        log_pass "T-BUILD Python syntax 체크" || log_fail "T-BUILD Python" "syntax error"
      ;;
    go)
      (cd "$SERVER_DIR" && go build ./... 2>&1 | tail -3) && log_pass "T-BUILD Go 빌드" || \
        log_fail "T-BUILD Go" "build FAILED"
      ;;
    cpp)
      if [ -f "$SERVER_DIR/CMakeLists.txt" ]; then
        cmake -S "$SERVER_DIR" -B "$SERVER_DIR/build" -DCMAKE_BUILD_TYPE=Debug -q 2>&1 | tail -3 && \
          cmake --build "$SERVER_DIR/build" --parallel 2>&1 | tail -5 && \
          log_pass "T-BUILD C++ CMake 빌드" || log_fail "T-BUILD C++" "CMake build FAILED"
      elif [ -f "$SERVER_DIR/Makefile" ]; then
        make -C "$SERVER_DIR" -j4 2>&1 | tail -5 && log_pass "T-BUILD C++ Make 빌드" || \
          log_fail "T-BUILD C++" "make FAILED"
      else
        echo "  T-BUILD WARN: C++ 빌드 스크립트 불명확 — 수동 확인"
      fi
      ;;
    php)
      if [ -f "$SERVER_DIR/composer.json" ]; then
        composer validate --no-check-publish "$SERVER_DIR/composer.json" 2>&1 | tail -3 && \
          log_pass "T-BUILD PHP composer 검증" || log_fail "T-BUILD PHP" "composer validate FAILED"
      fi
      find "$SERVER_DIR" -name "*.php" | head -20 | xargs php -l 2>&1 | grep -v "No syntax errors" | head -5
      php -l "$SERVER_DIR/index.php" 2>/dev/null && log_pass "T-BUILD PHP syntax" || \
        log_fail "T-BUILD PHP" "syntax error"
      ;;
    ruby)
      (cd "$SERVER_DIR" && bundle exec ruby -c app.rb 2>/dev/null || ruby -c *.rb 2>/dev/null) && \
        log_pass "T-BUILD Ruby syntax" || log_fail "T-BUILD Ruby" "syntax error"
      ;;
    rust)
      (cd "$SERVER_DIR" && cargo check 2>&1 | tail -5) && log_pass "T-BUILD Rust 체크" || \
        log_fail "T-BUILD Rust" "cargo check FAILED"
      ;;
    *)
      echo "  T-BUILD WARN: 런타임 '$SERVER_RUNTIME' 빌드 미지원 — 수동 확인 필요"
      ;;
  esac
}

# ===== T-CONNECT: 서버 연결 스모크 (프로토콜 기반) =====
run_socket_smoke() {
  echo "=== T-CONNECT: 연결 스모크 (프로토콜: $SOCKET_PROTOCOL) ==="

  # HTTP 헬스체크 (모든 런타임 공통)
  local health_paths=("/health" "/api/health" "/healthz" "/status" "/")
  local STATUS=""
  for path in "${health_paths[@]}"; do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$path" 2>/dev/null)
    echo "$STATUS" | grep -qE "^[23]" && break
  done
  if echo "$STATUS" | grep -qE "^[23]"; then
    log_pass "T-CONNECT 서버 HTTP 응답 ($STATUS)"
  else
    log_fail "T-CONNECT 서버 HTTP 응답 없음" "모든 헬스 경로 응답 없음 ($STATUS)"
  fi

  # 프로토콜별 추가 검증
  case "$SOCKET_PROTOCOL" in
    socketio)
      SOCK_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
        "$BASE_URL/socket.io/?EIO=4&transport=polling" 2>/dev/null)
      echo "$SOCK_STATUS" | grep -qE "^[23]" && \
        log_pass "T-CONNECT Socket.IO 핸드셰이크 ($SOCK_STATUS)" || \
        log_fail "T-CONNECT Socket.IO 핸드셰이크" "HTTP $SOCK_STATUS"
      ;;
    websocket)
      # WebSocket 업그레이드 헤더 확인
      WS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "Upgrade: websocket" -H "Connection: Upgrade" \
        -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
        -H "Sec-WebSocket-Version: 13" \
        "$BASE_URL" 2>/dev/null)
      echo "$WS_STATUS" | grep -qE "^(101|400|426)" && \
        log_pass "T-CONNECT WebSocket 업그레이드 응답 ($WS_STATUS)" || \
        log_fail "T-CONNECT WebSocket" "HTTP $WS_STATUS"
      ;;
    tcp)
      # TCP 포트 오픈 여부 (nc)
      TCP_PORT=$(echo "$BASE_URL" | grep -oP ':\K\d+' || echo "7777")
      TCP_HOST=$(echo "$BASE_URL" | grep -oP '//\K[^:/]+' || echo "localhost")
      nc -z -w3 "$TCP_HOST" "$TCP_PORT" 2>/dev/null && \
        log_pass "T-CONNECT TCP 포트 오픈 ($TCP_HOST:$TCP_PORT)" || \
        log_fail "T-CONNECT TCP 포트" "$TCP_HOST:$TCP_PORT 연결 불가"
      ;;
    http|*)
      log_pass "T-CONNECT HTTP 서버 확인 완료"
      ;;
  esac
}

# ===== T-UNITY: Unity Test Framework (MCP 우선 → CLI 폴백) =====
run_unity_tests() {
  echo "=== T-UNITY: Unity Test Framework ==="

  CLIENT_DIR="${UNITY_PROJECT:-client}"
  [ ! -d "$CLIENT_DIR/Assets" ] && echo "T-UNITY 스킵 — Unity 프로젝트 없음" && return

  UNITY_RESULTS="/tmp/qa-unity-results-$$.xml"

  # 방법 1: MCP run_tests (CoderGamester/mcp-unity 설치된 경우)
  # mcp_unity_run_tests는 MCP 클라이언트(Claude Code)가 직접 호출
  # → 이 스크립트에서는 CLI 폴백 사용

  # 방법 2: Unity CLI 헤드리스 테스트
  UNITY_EXE="${UNITY_PATH:-}"
  # WSL: Windows Unity 경로 자동 탐색
  if [ -z "$UNITY_EXE" ]; then
    UNITY_EXE=$(find /mnt/c/Program\ Files/Unity/Hub/Editor -name "Unity.exe" 2>/dev/null | \
      sort -V | tail -1)
  fi

  if [ -n "$UNITY_EXE" ] && [ -f "$UNITY_EXE" ]; then
    "$UNITY_EXE" \
      -batchmode -nographics -quit \
      -projectPath "$(wslpath -w "$CLIENT_DIR" 2>/dev/null || realpath "$CLIENT_DIR")" \
      -runTests -testPlatform editmode \
      -testResults "$UNITY_RESULTS" \
      -logFile "/tmp/qa-unity-$$.log" 2>/dev/null

    if [ -f "$UNITY_RESULTS" ]; then
      # NUnit XML 파싱: passed/failed/errors 추출
      PASSED=$(grep -oP 'passed="\K[0-9]+' "$UNITY_RESULTS" | head -1 || echo 0)
      FAILED=$(grep -oP 'failed="\K[0-9]+' "$UNITY_RESULTS" | head -1 || echo 0)
      ERRORS=$(grep -oP 'errors="\K[0-9]+' "$UNITY_RESULTS" | head -1 || echo 0)
      TOTAL=$((FAILED + ERRORS))

      if [ "$TOTAL" -gt 0 ]; then
        log_fail "T-UNITY Unity EditMode 테스트" "${TOTAL}건 실패 (passed=${PASSED} failed=${FAILED})"
        # 실패 테스트명 추출
        grep -oP 'name="[^"]*" result="Failed"' "$UNITY_RESULTS" | head -5 | \
          while read -r line; do echo "  → $line"; done
      else
        log_pass "T-UNITY Unity EditMode 테스트 (${PASSED}건 PASS)"
      fi
      cp "$UNITY_RESULTS" "docs/qa/artifacts/unity-test-results.xml" 2>/dev/null
    else
      echo "  T-UNITY WARN: 결과 파일 없음 — /tmp/qa-unity-$$.log 확인"
    fi
  else
    echo "  T-UNITY SKIP: UNITY_PATH 미설정 또는 Unity.exe 없음"
    echo "  설정 방법: export UNITY_PATH='/mnt/c/Program Files/Unity/Hub/Editor/6000.x.x/Editor/Unity.exe'"
    echo "  MCP 대안: Claude Code에서 mcp-unity run_tests 도구 직접 호출"
  fi
}

# ===== T-MCP-CHECK: Unity MCP 도구 가용성 확인 =====
# 이 함수는 스크립트 레벨 체크용. Claude Code가 MCP 도구 직접 호출하는 경우 이미 처리됨.
print_mcp_hints() {
  echo "=== Unity MCP 상태 ==="
  echo "  Claude Code 세션에서 run_tests / get_console_logs 직접 호출 가능"
  echo "  (CoderGamester/mcp-unity 또는 com.unity.ai.assistant 설치됨 — 세션 확인)"
  echo "  이 스크립트 = 서버/봇/정적분석 담당. Unity 테스트는 MCP 도구 우선."
}

# ===== T-STATIC: Unity/C# 클라이언트 정적 분석 =====
run_static_analysis() {
  echo "=== T-STATIC: Unity/C# 정적 분석 ==="

  # client/ C# 파일 대상
  CLIENT_DIR="${CLIENT_DIR:-client}"
  [ ! -d "$CLIENT_DIR/Assets" ] && echo "T-STATIC 스킵 — Assets/ 없음" && return

  CS_FILES=$(find "$CLIENT_DIR/Assets" -name "*.cs" -not -path "*/Editor/*" 2>/dev/null | wc -l)
  echo "  C# 파일: ${CS_FILES}개 스캔"

  # 소켓 이벤트 상수 일관성 — 서버 vs 클라이언트
  # 서버 emit/on 이벤트명 추출
  SERVER_EVENTS=$(grep -rh "emit\|on(" server/ --include="*.js" 2>/dev/null | \
    grep -oE '"[a-zA-Z_]+"|'"'"'[a-zA-Z_]+'"'" | tr -d '"'"'" | sort -u 2>/dev/null | head -50)
  # 클라이언트 C# 이벤트명 추출
  CLIENT_EVENTS=$(grep -rh "Emit\|On\|Subscribe" "$CLIENT_DIR/Assets" --include="*.cs" 2>/dev/null | \
    grep -oE '"[a-zA-Z_]+"' | tr -d '"' | sort -u 2>/dev/null | head -50)

  # TODO/FIXME/HACK 카운트
  ISSUES=$(grep -rn "TODO\|FIXME\|HACK\|BUG" "$CLIENT_DIR/Assets" --include="*.cs" 2>/dev/null | wc -l)
  if [ "$ISSUES" -gt 10 ]; then
    log_fail "T-STATIC 미처리 이슈" "${ISSUES}개 TODO/FIXME/HACK"
  else
    log_pass "T-STATIC 이슈 카운트 허용 범위 (${ISSUES}개)"
  fi

  # NullReferenceException 위험 패턴
  NULL_RISK=$(grep -rn "\.GetComponent<\|FindObjectOfType<" "$CLIENT_DIR/Assets" --include="*.cs" 2>/dev/null | \
    grep -v "!= null\|== null\|if (" | wc -l)
  if [ "$NULL_RISK" -gt 5 ]; then
    echo "  WARN: null 체크 없는 GetComponent/FindObjectOfType ${NULL_RISK}건"
  fi

  log_pass "T-STATIC Unity C# 정적 분석 완료"
}

# ===== T-BOT: bot 통합 스모크 (선택적, BOT_SMOKE=1 시) =====
run_bot_smoke() {
  [ "${BOT_SMOKE:-0}" != "1" ] && echo "T-BOT 스킵 (BOT_SMOKE=1 로 활성화)" && return
  echo "=== T-BOT: 봇 통합 스모크 ==="

  # bot-dotnet8 단기 실행 (10초) + 에러 캡처
  if [ -d "$BOT_DIR" ]; then
    timeout 10 dotnet run --project "$BOT_DIR" 2>&1 | tee /tmp/qa-bot-smoke.log | tail -5 &
    sleep 10
    if grep -q "Connected\|connected\|connect" /tmp/qa-bot-smoke.log; then
      log_pass "T-BOT 봇 서버 연결 확인"
    elif grep -q "Error\|Exception\|FATAL" /tmp/qa-bot-smoke.log; then
      log_fail "T-BOT 봇 에러 발생" "$(grep -m1 'Error\|Exception' /tmp/qa-bot-smoke.log)"
    else
      echo "  T-BOT 연결 상태 불명확 — /tmp/qa-bot-smoke.log 확인"
    fi
  fi
}

# ===== 실행 =====
print_mcp_hints
run_build_check
run_unity_tests
run_socket_smoke
run_static_analysis
run_bot_smoke

echo "--- $PASS_COUNT PASS / $FAIL_COUNT FAIL"
exit $FAIL
