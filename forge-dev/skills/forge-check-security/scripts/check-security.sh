#!/usr/bin/env bash
# check-security.sh — OWASP 기반 정적 보안 스캔 (AD-92 P1-C)
# 사용법: bash check-security.sh [TARGET_DIR]
# 출력: /tmp/security-scan-results.json

TARGET="${1:-$(pwd)}"
OUT_JSON="/tmp/security-scan-results.json"
EXCLUDE_DIRS="node_modules vendor .git dist build coverage .next .nuxt"

CRITICAL=0; HIGH=0; MEDIUM=0; LOW=0
FINDINGS="[]"

add_finding() {
  local level="$1" id="$2" file="$3" line="$4" desc="$5" fix="$6"
  FINDINGS=$(echo "$FINDINGS" | python3 -c "
import json,sys
data=json.load(sys.stdin)
data.append({'level':'$level','id':'$id','file':'$file','line':'$line','desc':'$desc','fix':'$fix'})
print(json.dumps(data))
")
  case "$level" in
    CRITICAL) CRITICAL=$((CRITICAL+1)) ;;
    HIGH)     HIGH=$((HIGH+1)) ;;
    MEDIUM)   MEDIUM=$((MEDIUM+1)) ;;
    LOW)      LOW=$((LOW+1)) ;;
  esac
}

# 제외 패턴 빌드
EXCLUDE_PATTERN=""
for d in $EXCLUDE_DIRS; do EXCLUDE_PATTERN="$EXCLUDE_PATTERN --exclude-dir=$d"; done

echo "Scanning: $TARGET"

# S1: 하드코딩 시크릿 (CRITICAL)
while IFS=: read -r file line match; do
  [ -z "$file" ] && continue
  add_finding "CRITICAL" "S1" "$file" "$line" "하드코딩 시크릿 의심: $match" "환경변수(process.env)로 이동 + .env 파일 사용"
done < <(grep -rn $EXCLUDE_PATTERN \
  -E "(password|passwd|secret|api_key|apikey|access_token)\s*[=:]\s*['\"][^'\"]{6,}" \
  "$TARGET" --include="*.js" --include="*.ts" --include="*.py" --include="*.go" 2>/dev/null \
  | grep -v "process\.env\|os\.getenv\|os\.environ\|config\." \
  | grep -v "test\|spec\|\.md\|\.example\|sample" \
  | head -20)

# S2: SQL 인젝션 (HIGH)
while IFS=: read -r file line match; do
  [ -z "$file" ] && continue
  add_finding "HIGH" "S2" "$file" "$line" "SQL 인젝션 위험: 문자열 연결 SQL" "prepared statement 또는 ORM 파라미터화 사용"
done < <(grep -rn $EXCLUDE_PATTERN \
  -E "(query|sql)\s*[+=]\s*(req\.|\"SELECT|\"INSERT|\"UPDATE|\"DELETE|\`SELECT|\`INSERT|\`UPDATE|\`DELETE)" \
  "$TARGET" --include="*.js" --include="*.ts" 2>/dev/null \
  | head -20)

# S3: 인증 누락 — app-level 전역 인증 미들웨어 없을 때만 검사
# app.use('/api', authMiddleware) 전역 패턴 있으면 S3 스킵
GLOBAL_AUTH=$(grep -rn $EXCLUDE_PATTERN \
  -E "app\.use\s*\(.*['\"/]api['\"/].*require|app\.use\s*\(.*middleware.*['\"/]auth|app\.use\s*\(.*jwtVerify|app\.use\s*\(.*authenticate|app\.use\s*\(.*passModChk|app\.use\s*\(.*verifyToken|app\.use\s*\(.*authMiddle" \
  "$TARGET" --include="*.js" --include="*.ts" 2>/dev/null | head -1)

if [ -z "$GLOBAL_AUTH" ]; then
  while IFS=: read -r file line match; do
    [ -z "$file" ] && continue
    add_finding "HIGH" "S3" "$file" "$line" "보호 라우트에 인증 미들웨어 없음 의심 (전역 auth 미감지)" "requireAuth/verifyToken 미들웨어 추가 또는 app.use 전역 인증 확인"
  done < <(grep -rn $EXCLUDE_PATTERN \
    -E "router\.(post|put|delete|patch)\s*\(" \
    "$TARGET" --include="*.js" --include="*.ts" 2>/dev/null \
    | grep -v "auth\|login\|logout\|register\|free\|public\|health\|status" \
    | grep -v "require\|verif\|protect\|guard\|middleware" \
    | head -10)
fi

# S4: 민감 데이터 로그 (MEDIUM)
while IFS=: read -r file line match; do
  [ -z "$file" ] && continue
  add_finding "MEDIUM" "S4" "$file" "$line" "민감 데이터 로그 노출 위험" "민감 필드 마스킹 또는 로그 제거"
done < <(grep -rn $EXCLUDE_PATTERN \
  -E "console\.(log|error|warn|info).*\b(password|passwd|token|secret|key)\b" \
  "$TARGET" --include="*.js" --include="*.ts" 2>/dev/null \
  | grep -v "test\|spec" \
  | head -15)

# S5: XSS 위험 (MEDIUM)
while IFS=: read -r file line match; do
  [ -z "$file" ] && continue
  add_finding "MEDIUM" "S5" "$file" "$line" "XSS 위험: innerHTML 미검증 입력 사용 가능성" "DOMPurify 등 sanitizer 적용 또는 textContent 사용"
done < <(grep -rn $EXCLUDE_PATTERN \
  -E "\.innerHTML\s*=" \
  "$TARGET" --include="*.js" --include="*.ts" --include="*.vue" --include="*.jsx" --include="*.tsx" 2>/dev/null \
  | grep -v "DOMPurify\|sanitize\|escape\|test\|spec" \
  | head -10)

# S6: 취약 의존성 (HIGH) — npm audit if available
if command -v npm &>/dev/null && [ -f "$TARGET/package.json" ]; then
  AUDIT_HIGH=$(npm audit --json --prefix "$TARGET" 2>/dev/null | python3 -c "
import json,sys
try:
  d=json.load(sys.stdin)
  h=d.get('metadata',{}).get('vulnerabilities',{})
  print(h.get('high',0)+h.get('critical',0))
except: print(0)
" 2>/dev/null || echo 0)
  if [ "$AUDIT_HIGH" -gt 0 ]; then
    add_finding "HIGH" "S6" "package.json" "-" "npm audit: ${AUDIT_HIGH}개 HIGH/CRITICAL 취약 의존성" "npm audit fix 또는 해당 패키지 업데이트"
  fi
fi

# 최종 판정
if [ "$CRITICAL" -gt 0 ]; then
  VERDICT="FAIL"
elif [ "$HIGH" -gt 0 ]; then
  VERDICT="WARN"
else
  VERDICT="PASS"
fi

# JSON 출력
python3 -c "
import json
result = {
  'verdict': '$VERDICT',
  'critical': $CRITICAL,
  'high': $HIGH,
  'medium': $MEDIUM,
  'low': $LOW,
  'findings': $FINDINGS
}
print(json.dumps(result, indent=2, ensure_ascii=False))
" > "$OUT_JSON"

echo "Scan complete: $VERDICT (CRITICAL=$CRITICAL HIGH=$HIGH MEDIUM=$MEDIUM LOW=$LOW)"
echo "Results: $OUT_JSON"
