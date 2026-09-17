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
#
# 범위 (2026-09-15 — harness-gaps 2026-09-14-security-scanners-false-positive G-1):
#   종전 `--all` 은 **모든 브랜치**를 읽어, 브랜치 A 의 PR 게이트가 브랜치 B 의 테스트 픽스처
#   더미 키를 HIGH 로 올렸다(줄 수도 남의 브랜치 커밋에 따라 4→7→11 로 흔들렸다).
#   기본 범위 = `git log -p HEAD <base>` — "현재 브랜치에서 도달 가능한 이력 + base 브랜치 이력".
#   왜 `<merge-base>..HEAD` 가 아닌가: 그건 이 PR 이 **새로 넣은** 커밋만 본다. 이미 base 에 머지된
#   시크릿(흔한 실제 유출 형태)을 못 보게 돼 false negative 가 생긴다. `HEAD` 는 base..HEAD 와
#   분기점 이전 base 이력을 둘 다 덮고, `<base>` 를 함께 주면 분기 뒤 base 에 들어온 이력까지 덮는다.
#   merge-base 계산이 필요 없어 가장 단순하다.
#   base = FORGE_SECURITY_BASE(명시) → origin/develop → origin/main → develop → main 중 첫 존재 ref.
#   `--all` 은 FORGE_SECURITY_S8_ALL=1 일 때만(전 브랜치 고고학이 필요한 수동 감사용).
# ⚠️ 이 범위가 무력화되는 입력: 시크릿이 **base 에도 HEAD 에도 없는 제3 브랜치**에만 있는 경우 —
#   기본 범위에선 안 잡힌다(의도된 축소). 그 브랜치가 원격에 push 돼 있으면 노출은 실재하므로
#   정기 감사는 FORGE_SECURITY_S8_ALL=1 로 돌린다.
S8_SCOPE=""
if ! git -C "$TARGET" rev-parse --git-dir &>/dev/null 2>&1; then
  # 판정 불가는 조용한 PASS 가 아니다 — 안 본 것과 깨끗한 것은 다르다.
  S8_SCOPE="UNVERIFIED: git 레포 아님"
  add_finding "LOW" "S8-UNVERIFIED" ".git/history" "-" "Git 히스토리 시크릿 검사 판정 불가: git 레포가 아니다" "git 레포 루트를 TARGET 으로 지정해 재실행"
  echo "  [S8] UNVERIFIED — git 레포 아님 (히스토리 미검사)"
elif ! git -C "$TARGET" rev-parse --verify -q HEAD >/dev/null 2>&1; then
  S8_SCOPE="UNVERIFIED: HEAD 없음(커밋 0개)"
  add_finding "LOW" "S8-UNVERIFIED" ".git/history" "-" "Git 히스토리 시크릿 검사 판정 불가: HEAD 커밋이 없다" "첫 커밋 후 재실행"
  echo "  [S8] UNVERIFIED — HEAD 없음 (히스토리 미검사)"
else
  if [ "${FORGE_SECURITY_S8_ALL:-0}" = "1" ]; then
    S8_REVS=(--all); S8_SCOPE="--all (FORGE_SECURITY_S8_ALL=1)"
  else
    S8_BASE=""
    if [ -n "${FORGE_SECURITY_BASE:-}" ]; then
      if git -C "$TARGET" rev-parse --verify -q "${FORGE_SECURITY_BASE}^{commit}" >/dev/null 2>&1; then
        S8_BASE="$FORGE_SECURITY_BASE"
      else
        # 명시 base 가 틀렸는데 조용히 다른 base 로 떨어지면 사람이 의도한 범위가 아니다 — 알린다.
        echo "  [S8] WARN — FORGE_SECURITY_BASE='${FORGE_SECURITY_BASE}' ref 없음, 자동 탐지로 진행"
      fi
    fi
    if [ -z "$S8_BASE" ]; then
      for _b in origin/develop origin/main develop main; do
        if git -C "$TARGET" rev-parse --verify -q "${_b}^{commit}" >/dev/null 2>&1; then S8_BASE="$_b"; break; fi
      done
    fi
    if [ -n "$S8_BASE" ]; then
      S8_REVS=(HEAD "$S8_BASE"); S8_SCOPE="HEAD + $S8_BASE"
    else
      # base 를 못 찾아도 PR 내용(HEAD 도달 이력)은 볼 수 있다 — 범위가 줄었다는 사실을 명시한다.
      S8_REVS=(HEAD); S8_SCOPE="HEAD only (base 미탐지: origin/develop·origin/main·develop·main 없음)"
      echo "  [S8] NOTICE — base ref 미탐지, HEAD 도달 이력만 검사 (FORGE_SECURITY_BASE 로 지정 가능)"
    fi
  fi
  # 탐지 대입 매치를 **하나씩** 보고, 더미가 아닌 매치가 하나라도 있는 줄만 남긴다(입력: "sha<TAB>+줄").
  #   위 탐지 grep 과 **같은 정규식**을 쓴다(키워드 목록이 갈리면 여기서 탐지를 빼거나 남기는 기준이 어긋난다).
  #   python3 가 없으면 **S8 을 UNVERIFIED 로 선언하고 검사를 건너뛴다**(아래 `_S8_UNVERIFIED`).
  #   종전 폴백(줄 단위 grep -v)은 같은 줄의 더미 라벨 옆 진짜 키를 다시 지웠다 — 조용한 false negative 다
  #   (PR #561 cr-final r2 HIGH). 안 본 것은 '깨끗함'이 아니라 '판정 불가'로 적는다(이 파일의 git 부재 분기와 같은 규칙).
  #   FORGE_S8_PYTHON 은 테스트가 python 부재를 재현하려고 쓰는 스위치다(기본 python3).
  _S8_PY="${FORGE_S8_PYTHON:-python3}"
  s8_drop_dummy_only() {
      "$_S8_PY" -c '
import re, sys
pat = re.compile(r"(password|secret|api_key|apikey|access_token|token|private_key|client_secret|AKIA[A-Z0-9]{16}|ghp_[a-zA-Z0-9]+)\s*[=:]\s*[\x27\"]([^\x27\"]{6,})", re.I)
dummy = re.compile(r"sk-test|not-real|dummy|fake", re.I)
for line in sys.stdin:
    vals = [m.group(2) for m in pat.finditer(line)]
    if not vals or any(not dummy.search(v) for v in vals):
        sys.stdout.write(line)
'
  }
  _S8_UNVERIFIED=0
  if ! command -v "$_S8_PY" >/dev/null 2>&1; then
    _S8_UNVERIFIED=1
    S8_SCOPE="UNVERIFIED: python3 없음(더미 판정 불가)"
    add_finding "LOW" "S8-UNVERIFIED" ".git/history" "-" "Git 히스토리 시크릿 검사 판정 불가: python3(${_S8_PY}) 가 없어 더미 값 판정을 매치 단위로 못 한다" "python3 설치 후 재실행하거나 FORGE_S8_PYTHON 으로 인터프리터를 지정"
    echo "  [S8] UNVERIFIED — python3 없음 (히스토리 미검사). 줄 단위 grep 폴백은 같은 줄의 진짜 키를 지우므로 쓰지 않는다."
  fi
  # root-cause: cr-double R1 — max-count=50 too shallow (Codex HIGH), keywords expanded
  # root-cause: cr-double R3 HIGH — ghp_[a-zA-Z0-9] no quantifier → only 1 char matched; fix: ghp_[a-zA-Z0-9]+
  # 매치 줄에 커밋을 붙이려고 커밋 헤더를 `@@S8C <sha>` 마커로 찍고 awk 로 "sha<TAB>줄" 을 만든다.
  #   (추가 줄은 항상 '+' 로 시작하므로 마커와 섞이지 않는다)
  #   ⚠️ 파일 경로는 일부러 줄에 붙이지 않는다 — 아래 grep -v(example·sample·dummy…)가 경로까지 읽어
  #   `examples/config.ts` 의 진짜 키를 빼 버린다(false negative). 짧은 SHA 는 16진수라 어느 필터에도 안 걸린다.
  S8_LINES=""
  [ "$_S8_UNVERIFIED" = 0 ] && S8_LINES=$(git -C "$TARGET" log -p --format='@@S8C %h' --max-count=200 "${S8_REVS[@]}" 2>/dev/null \
    | awk '/^@@S8C /{c=$2; next} /^\+\+\+ /{next} /^\+/{print c "\t" $0}' \
    | grep -iE "(password|secret|api_key|apikey|access_token|token|private_key|client_secret|AKIA[A-Z0-9]{16}|ghp_[a-zA-Z0-9]+)\s*[=:]\s*['\"][^'\"]{6,}" \
    | grep -v "process\.env\|os\.getenv\|os\.environ\|example\|sample\|placeholder" \
    | s8_drop_dummy_only)
  # ↑ 더미 값 제외: **탐지된 시크릿 대입의 값**에 sk-test·not-real·dummy·fake 가 있을 때만 그 매치를 픽스처로 본다.
  #   한 줄에 탐지 대입이 여럿이면 **전부 더미일 때만** 줄을 뺀다. 종전 `grep -v` 는 같은 줄의 무관한
  #   `label="dummy"` 하나로 진짜 `token="…"` 까지 지웠다(PR #561 cr-final r1 HIGH — 삭제된 시크릿 이력 누락).
  #   키 이름(`fake_token = "..."`)은 값이 아니라 이 판정에 안 걸린다 — 진짜 값은 그대로 잡힌다.
  #   ⚠️ 이 방어가 무력화되는 입력: 진짜 키 값 **안에** 해당 낱말이 섞인 경우(`"sk-live-…dummy…"`) — 그 매치는 빠진다.
  S8_HITS=0
  [ -n "$S8_LINES" ] && S8_HITS=$(printf '%s\n' "$S8_LINES" | wc -l)
  if [ "${S8_HITS:-0}" -gt 0 ]; then
    # 판정 근거: 커밋(짧은 SHA)과 그 커밋을 포함한 브랜치 1~2개. 값 자체는 출력하지 않는다(시크릿 재노출 금지).
    #   브랜치 조회는 커밋당 1회라 비용이 있어 고유 커밋 5개까지만 조회한다.
    S8_REFS=""
    _n=0
    while IFS= read -r _c; do
      [ -z "$_c" ] && continue
      _n=$((_n+1)); [ "$_n" -gt 5 ] && break
      _br=$(git -C "$TARGET" branch -a --contains "$_c" --format='%(refname:short)' 2>/dev/null | head -2 | paste -sd, -)
      S8_REFS="${S8_REFS}${S8_REFS:+ }${_c}[${_br:-브랜치 없음}]"
    done < <(printf '%s\n' "$S8_LINES" | cut -f1 | awk '!seen[$0]++')
    add_finding "HIGH" "S8" ".git/history" "-" "Git 히스토리 시크릿: ${S8_HITS}건 의심 패턴 (범위: ${S8_SCOPE}; 커밋: ${S8_REFS})" "BFG Repo Cleaner로 이력 정리 + 해당 시크릿 즉시 교체"
    echo "  [S8] git history: ${S8_HITS} suspicious lines (scope: ${S8_SCOPE}) commits: ${S8_REFS}"
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
  's8_scope':sys.argv[6],
  'findings':findings
}
print(json.dumps(result,indent=2,ensure_ascii=False))
" "$VERDICT" "$CRITICAL" "$HIGH" "$MEDIUM" "$LOW" "$S8_SCOPE" > "$OUT_JSON"

echo "Scan complete: $VERDICT (CRITICAL=$CRITICAL HIGH=$HIGH MEDIUM=$MEDIUM LOW=$LOW)"
echo "Results: $OUT_JSON"
