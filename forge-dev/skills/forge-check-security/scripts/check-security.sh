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
  # root-cause: cr-double R3 CRITICAL — $file/$line/$desc/$fix direct Python string interpolation → injection via single-quoted paths/matches. sys.argv bypasses completely.
  FINDINGS=$(echo "$FINDINGS" | python3 -c "
import json,sys
data=json.load(sys.stdin)
a=sys.argv[1:]
data.append({'level':a[0],'id':a[1],'file':a[2],'line':a[3],'desc':a[4],'fix':a[5]})
print(json.dumps(data))
" "$level" "$id" "$file" "$line" "$desc" "$fix")
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

# S7: 취약 의존성 (Python) (HIGH) — pip-audit if available
if command -v pip-audit &>/dev/null; then
  PIP_VULN=0
  if [ -f "$TARGET/requirements.txt" ]; then
    PIP_VULN=$(pip-audit --format=json --progress-spinner off -r "$TARGET/requirements.txt" 2>/dev/null | python3 -c "
import json,sys
try:
  d=json.load(sys.stdin); deps=d.get('dependencies',[]) if isinstance(d,dict) else d
  print(sum(len(x.get('vulns',[])) for x in deps))
except: print(0)" 2>/dev/null || echo 0)
  elif [ -f "$TARGET/pyproject.toml" ]; then
    PIP_VULN=$( (cd "$TARGET" && pip-audit --format=json --progress-spinner off 2>/dev/null) | python3 -c "
import json,sys
try:
  d=json.load(sys.stdin); deps=d.get('dependencies',[]) if isinstance(d,dict) else d
  print(sum(len(x.get('vulns',[])) for x in deps))
except: print(0)" 2>/dev/null || echo 0)
  fi
  if [ "${PIP_VULN:-0}" -gt 0 ]; then
    add_finding "HIGH" "S7" "requirements.txt/pyproject.toml" "-" "pip-audit: ${PIP_VULN}개 취약 Python 의존성 (OSV)" "pip-audit --fix 또는 해당 패키지 업데이트"
  fi
fi

# S8: Git 히스토리 시크릿 (HIGH) — 삭제된 커밋 포함 이력 스캔
# root-cause: gsd WI-20 — 현재 코드엔 없지만 git 이력에 남은 시크릿은 노출 위험 동일
if git -C "$TARGET" rev-parse --git-dir &>/dev/null 2>&1; then
  # root-cause: cr-double R1 — max-count=50 too shallow (Codex HIGH), keywords expanded
  # root-cause: cr-double R3 HIGH — ghp_[a-zA-Z0-9] no quantifier → only 1 char matched; fix: ghp_[a-zA-Z0-9]+
  S8_HITS=$(git -C "$TARGET" log -p --all --max-count=200 2>/dev/null \
    | grep "^\+" | grep -v "^+++" \
    | grep -iE "(password|secret|api_key|apikey|access_token|token|private_key|client_secret|AKIA[A-Z0-9]{16}|ghp_[a-zA-Z0-9]+)\s*[=:]\s*['\"][^'\"]{6,}" \
    | grep -v "process\.env\|os\.getenv\|os\.environ\|example\|sample\|placeholder" \
    | wc -l)
  if [ "${S8_HITS:-0}" -gt 0 ]; then
    add_finding "HIGH" "S8" ".git/history" "-" "Git 히스토리 시크릿: ${S8_HITS}건 의심 패턴 (삭제 커밋 포함)" "BFG Repo Cleaner로 이력 정리 + 해당 시크릿 즉시 교체"
    echo "  [S8] git history: ${S8_HITS} suspicious lines"
  fi
fi

# S9: LLM 보안 (MEDIUM) — LLM 출력 미검증 XSS + AI API 키 하드코딩
# root-cause: gsd WI-15 — LLM 출력이 DOM에 직접 주입되거나 AI 키가 소스에 노출되는 패턴
# root-cause: cr-double R3 HIGH — inline comment inside process substitution breaks bash syntax; removed
while IFS=: read -r file line match; do
  [ -z "$file" ] && continue
  # root-cause: cr-double HIGH — S9 ID duplication with API key scan; renamed to S9-XSS for distinct filtering
  add_finding "MEDIUM" "S9-XSS" "$file" "$line" "LLM 출력 미검증: dangerouslySetInnerHTML/eval에 LLM 응답 직접 전달 위험" "출력 sanitize 또는 textContent 사용"
done < <(grep -rn $EXCLUDE_PATTERN \
  -E "(dangerouslySetInnerHTML|(^|[^a-z])eval[[:space:]]*\()" \
  "$TARGET" --include="*.js" --include="*.ts" --include="*.jsx" --include="*.tsx" 2>/dev/null \
  | grep -v "DOMPurify\|sanitize\|escape\|test\|spec" \
  | head -10)

while IFS=: read -r file line match; do
  [ -z "$file" ] && continue
  # root-cause: cr-double R1 — ${match} injection risk in Python string → remove variable interpolation
  # root-cause: cr-double HIGH — S9 ID duplication with XSS scan; renamed to S9-APIKEY for distinct filtering
  add_finding "MEDIUM" "S9-APIKEY" "$file" "$line" "AI API 키 하드코딩 의심 (패턴 검출)" "환경변수(process.env / os.environ)로 이동"
done < <(grep -rn $EXCLUDE_PATTERN \
  -E "(OPENAI_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY)\s*[=:]\s*['\"][^'\"]{10,}|sk-[a-zA-Z0-9]{32,}" \
  "$TARGET" --include="*.js" --include="*.ts" --include="*.py" 2>/dev/null \
  | grep -v "process\.env\|os\.getenv\|os\.environ\|example\|sample\|\.env" \
  | head -10)

# 최종 판정
if [ "$CRITICAL" -gt 0 ]; then
  VERDICT="FAIL"
elif [ "$HIGH" -gt 0 ]; then
  VERDICT="WARN"
else
  VERDICT="PASS"
fi

# JSON 출력
# root-cause: cr-double R4 CRITICAL — $VERDICT/$FINDINGS direct Python string interpolation → injection. sys.argv for verdict, stdin for findings.
echo "$FINDINGS" | python3 -c "
import json,sys
findings=json.load(sys.stdin)
verdict=sys.argv[1]
result={
  'verdict':verdict,
  'critical':int(sys.argv[2]),
  'high':int(sys.argv[3]),
  'medium':int(sys.argv[4]),
  'low':int(sys.argv[5]),
  'findings':findings
}
print(json.dumps(result,indent=2,ensure_ascii=False))
" "$VERDICT" "$CRITICAL" "$HIGH" "$MEDIUM" "$LOW" > "$OUT_JSON"

echo "Scan complete: $VERDICT (CRITICAL=$CRITICAL HIGH=$HIGH MEDIUM=$MEDIUM LOW=$LOW)"
echo "Results: $OUT_JSON"
