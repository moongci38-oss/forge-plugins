#!/usr/bin/env bash
# check-security.sh — OWASP 기반 정적 보안 스캔 (AD-92 P1-C)
# 사용법: bash check-security.sh [--s8-full] [TARGET_DIR]
#   --s8-full (= FORGE_SECURITY_S8_FULL=1): S8 을 PR 범위가 아니라 base 이력 전체로 감사한다(정기 감사용).
# 출력: /tmp/security-scan-results.json
#   결과 JSON 을 못 쓰면 요약 줄이 `Scan complete: UNVERIFIED …` 이고 종료코드 2 다(판정 불가 — PASS 로 읽지 말 것).

S8_FULL="${FORGE_SECURITY_S8_FULL:-0}"
TARGET=""
for _a in "$@"; do
  case "$_a" in
    --s8-full) S8_FULL=1 ;;
    *) [ -z "$TARGET" ] && TARGET="$_a" ;;
  esac
done
TARGET="${TARGET:-$(pwd)}"
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

# 줄 단위 허용목록 (2026-09-18 — 스캐너·탐지기 자기참조 오탐 정리)
#   탐지된 **바로 그 줄**에 `forge-sec: allow <ID> <사유>` 표식이 있을 때만 그 한 건을 억제한다.
#   예: `secret = "..."  # forge-sec: allow S1 HMAC 검증 픽스처`
#   - 경로·확장자·디렉터리 단위 제외가 아니다 — 같은 파일의 다른 줄은 그대로 잡힌다.
#   - ID 가 일치해야 한다(S1 표식은 S4 를 못 끈다) · 사유가 비면 억제하지 않는다.
#   - 표식이 다른 줄로 옮겨가면 원래 줄이 다시 잡힌다(표식은 매치된 줄 텍스트에서만 읽는다).
#   - 억제는 조용히 사라지지 않는다: stdout `[allow]` 줄 + 요약 `suppressed=N` + JSON `suppressed`·`suppressed_findings`.
#   적용 범위 = 줄 단위 grep 스캔(S1·S2·S3·S4·S5·S9-XSS·S9-APIKEY). S6·S7·S8 은 줄이 없어 해당 없음.
# 지문 허용목록(보조): 줄에 표식을 **달 수 없는** 경우만 쓴다 — `<TARGET>/.claude/forge-sec-allowlist.tsv`
#   (override `FORGE_SEC_ALLOWLIST`), 한 줄 = `ID<TAB>TARGET 기준 상대경로<TAB>sha256(그 줄 원문)<TAB>사유`.
#   왜 필요한가: 로컬 pre-commit 시크릿 훅은 diff 의 **삭제 줄**까지 검사해, AKIA 형태 공개 예시 키가 든 줄은
#   표식을 달려고 고치는 것조차 막는다(`shared/scripts/brain-privacy-scan.py` 골든셋 줄, 2026-09-18 실측).
#   지문은 경로 + 줄 원문 전체에 묶인다 — 줄 내용이 한 글자라도 바뀌거나 다른 파일로 가면 다시 잡힌다.
#   (줄 번호에는 묶지 않는다 — 위에 줄이 추가될 때마다 억제가 풀리는 소음을 피하려고.)
# ⚠️ 이 방어가 무력화되는 입력: 진짜 시크릿 줄에 누군가 표식을 붙이거나 지문을 등록하는 경우 — 억제 자체는 막지 못한다.
#   그래서 억제 건수·위치를 매번 출력한다. 표식·허용목록 추가 diff 는 `suppressed>0` 으로
#   skill-report-lint.py sc-3 을 UNDECIDED 로 만들어 C1 LLM 검토를 강제한다.
SUPPRESSED=0
SUPPRESSED_FINDINGS="[]"
SEC_ALLOWLIST="${FORGE_SEC_ALLOWLIST:-${TARGET%/}/.claude/forge-sec-allowlist.tsv}"
sec_allowed() { # <id> <file> <매치된 줄 텍스트> → 0 = 억제
  SEC_ALLOW_VIA=inline
  # 표식 문구(주석 토큰 포함)가 비밀 **문자열 값 안**에 들어가도 억제되던 우회를 막는다.
  # 따옴표 밖의 언어별 주석(#=.py, //=.js/.ts/.go/...) 뒤 표식만 인정한다.
  printf '%s' "$3" | python3 -c '
import os, re, sys

line = sys.stdin.read()
scan_id, path = sys.argv[1:]
tokens = ("#",) if os.path.splitext(path)[1].lower() == ".py" else ("//",)
quote = None
comment = None
i = 0
while i < len(line):
    ch = line[i]
    if quote:
        if ch == "\\":
            i += 2
            continue
        if ch == quote:
            quote = None
    elif ch in ("\"", "\x27", "`"):
        quote = ch
    else:
        token = next((t for t in tokens if line.startswith(t, i)), None)
        if token:
            comment = line[i + len(token):]
            break
    i += 1

pat = r"forge-sec:\s*allow\s+" + re.escape(scan_id) + r"\s+\S"
sys.exit(0 if comment is not None and re.search(pat, comment) else 1)
' "$1" "$2" && return 0
  SEC_ALLOW_VIA=fingerprint
  [ -f "$SEC_ALLOWLIST" ] && command -v sha256sum >/dev/null 2>&1 || return 1
  local rel="${2#"${TARGET%/}"/}" h
  h=$(printf '%s' "$3" | sha256sum | cut -c1-64)
  awk -F'\t' -v id="$1" -v p="$rel" -v h="$h" \
    '$1==id && $2==p && $3==h && $4 ~ /[^[:space:]]/ {f=1} END{exit !f}' "$SEC_ALLOWLIST"
}
add_suppressed() { # <id> <file> <line>
  SUPPRESSED=$((SUPPRESSED+1))
  SUPPRESSED_FINDINGS=$(echo "$SUPPRESSED_FINDINGS" | python3 -c "
import json,sys
data=json.load(sys.stdin); a=sys.argv[1:]
data.append({'id':a[0],'file':a[1],'line':a[2],'via':a[3]})
print(json.dumps(data))
" "$1" "$2" "$3" "$SEC_ALLOW_VIA")
  echo "  [allow] $1 $2:$3 (suppressed via ${SEC_ALLOW_VIA})"
}

# 제외 패턴 빌드
EXCLUDE_PATTERN=""
for d in $EXCLUDE_DIRS; do EXCLUDE_PATTERN="$EXCLUDE_PATTERN --exclude-dir=$d"; done

echo "Scanning: $TARGET"

# head 제한은 억제 판정 **뒤**의 실제 finding 에만 적용한다. 억제 줄이 슬롯을 소진하면 뒤의 진짜 finding 이 사라진다.
# S1: 하드코딩 시크릿 (CRITICAL)
S1_EMITTED=0
while IFS=: read -r file line match; do
  [ -z "$file" ] && continue
  if sec_allowed S1 "$file" "$match"; then add_suppressed S1 "$file" "$line"; continue; fi
  [ "$S1_EMITTED" -ge 20 ] && break
  add_finding "CRITICAL" "S1" "$file" "$line" "하드코딩 시크릿 의심: $match" "환경변수(process.env)로 이동 + .env 파일 사용"
  S1_EMITTED=$((S1_EMITTED+1))
done < <(grep -rn $EXCLUDE_PATTERN \
  -E "(password|passwd|secret|api_key|apikey|access_token)\s*[=:]\s*['\"][^'\"]{6,}" \
  "$TARGET" --include="*.js" --include="*.ts" --include="*.py" --include="*.go" 2>/dev/null \
  | grep -v "process\.env\|os\.getenv\|os\.environ\|config\." \
  | grep -v "test\|spec\|\.md\|\.example\|sample")

# S2: SQL 인젝션 (HIGH)
S2_EMITTED=0
while IFS=: read -r file line match; do
  [ -z "$file" ] && continue
  if sec_allowed S2 "$file" "$match"; then add_suppressed S2 "$file" "$line"; continue; fi
  [ "$S2_EMITTED" -ge 20 ] && break
  add_finding "HIGH" "S2" "$file" "$line" "SQL 인젝션 위험: 문자열 연결 SQL" "prepared statement 또는 ORM 파라미터화 사용"
  S2_EMITTED=$((S2_EMITTED+1))
done < <(grep -rn $EXCLUDE_PATTERN \
  -E "(query|sql)\s*[+=]\s*(req\.|\"SELECT|\"INSERT|\"UPDATE|\"DELETE|\`SELECT|\`INSERT|\`UPDATE|\`DELETE)" \
  "$TARGET" --include="*.js" --include="*.ts" 2>/dev/null)

# S3: 인증 누락 — app-level 전역 인증 미들웨어 없을 때만 검사
# app.use('/api', authMiddleware) 전역 패턴 있으면 S3 스킵
GLOBAL_AUTH=$(grep -rn $EXCLUDE_PATTERN \
  -E "app\.use\s*\(.*['\"/]api['\"/].*require|app\.use\s*\(.*middleware.*['\"/]auth|app\.use\s*\(.*jwtVerify|app\.use\s*\(.*authenticate|app\.use\s*\(.*passModChk|app\.use\s*\(.*verifyToken|app\.use\s*\(.*authMiddle" \
  "$TARGET" --include="*.js" --include="*.ts" 2>/dev/null | head -1)

if [ -z "$GLOBAL_AUTH" ]; then
  S3_EMITTED=0
  while IFS=: read -r file line match; do
    [ -z "$file" ] && continue
    if sec_allowed S3 "$file" "$match"; then add_suppressed S3 "$file" "$line"; continue; fi
    [ "$S3_EMITTED" -ge 10 ] && break
    add_finding "HIGH" "S3" "$file" "$line" "보호 라우트에 인증 미들웨어 없음 의심 (전역 auth 미감지)" "requireAuth/verifyToken 미들웨어 추가 또는 app.use 전역 인증 확인"
    S3_EMITTED=$((S3_EMITTED+1))
  done < <(grep -rn $EXCLUDE_PATTERN \
    -E "router\.(post|put|delete|patch)\s*\(" \
    "$TARGET" --include="*.js" --include="*.ts" 2>/dev/null \
    | grep -v "auth\|login\|logout\|register\|free\|public\|health\|status" \
    | grep -v "require\|verif\|protect\|guard\|middleware")
fi

# S4: 민감 데이터 로그 (MEDIUM)
S4_EMITTED=0
while IFS=: read -r file line match; do
  [ -z "$file" ] && continue
  if sec_allowed S4 "$file" "$match"; then add_suppressed S4 "$file" "$line"; continue; fi
  [ "$S4_EMITTED" -ge 15 ] && break
  add_finding "MEDIUM" "S4" "$file" "$line" "민감 데이터 로그 노출 위험" "민감 필드 마스킹 또는 로그 제거"
  S4_EMITTED=$((S4_EMITTED+1))
done < <(grep -rn $EXCLUDE_PATTERN \
  -E "console\.(log|error|warn|info).*\b(password|passwd|token|secret|key)\b" \
  "$TARGET" --include="*.js" --include="*.ts" 2>/dev/null \
  | grep -v "test\|spec")

# S5: XSS 위험 (MEDIUM)
S5_EMITTED=0
while IFS=: read -r file line match; do
  [ -z "$file" ] && continue
  if sec_allowed S5 "$file" "$match"; then add_suppressed S5 "$file" "$line"; continue; fi
  [ "$S5_EMITTED" -ge 10 ] && break
  add_finding "MEDIUM" "S5" "$file" "$line" "XSS 위험: innerHTML 미검증 입력 사용 가능성" "DOMPurify 등 sanitizer 적용 또는 textContent 사용"
  S5_EMITTED=$((S5_EMITTED+1))
done < <(grep -rn $EXCLUDE_PATTERN \
  -E "\.innerHTML\s*=" \
  "$TARGET" --include="*.js" --include="*.ts" --include="*.vue" --include="*.jsx" --include="*.tsx" 2>/dev/null \
  | grep -v "DOMPurify\|sanitize\|escape\|test\|spec")

# S6: 취약 의존성 (HIGH) — lockfile 로 패키지 매니저를 골라 audit 한다.
#   (2026-09-23 — harness-gaps 2026-09-20-check-security-s6-silent-zero-pnpm)
#   종전: pnpm·yarn 레포에서 `npm audit` 이 ENOLOCK 으로 죽으면 `except: print(0)`·`|| echo 0` 이
#   "못 쟀다"를 "0건"으로 적었다(실측: 파서 0 · 실제 pnpm audit HIGH 17). 고장 난 체온계가 "열 없음"을 적은 셈.
#   지금: package.json 없음 = N/A(해당 없음) · 도구 없음/실행 실패/파싱 실패/lockfile 없음 = UNMEASURED
#   (MEDIUM finding `S6-UNMEASURED` + 요약 `S6=UNMEASURED`) · 파싱 성공 = MEASURED. **못 잰 것은 0 이 아니다.**
#   audit 의 종료코드는 판정에 쓰지 않는다 — npm·pnpm·yarn 은 취약점이 있으면 0 이 아닌 코드로 끝난다. 판정 근거는 파싱뿐.
# ⚠️ 이 방어가 무력화되는 입력: audit 가 **형식은 맞지만 거짓인** JSON 을 내는 경우(예: 레지스트리 미러가
#   빈 advisories 를 돌려줌) — 파서는 그것을 MEASURED 0 으로 읽는다. 또 yarn berry 는 취약점 0건일 때 빈 출력을
#   낼 수 있는데, 이것은 UNMEASURED 로 떨어진다(fail-closed 쪽 오판 — 과소 보고가 아니라 과잉 경고).
#
# 스캔 대상 레포가 심은 코드를 **스캐너가 실행하지 않는다** (PR #688 보안 리포트 H1 · CWE-829):
#   yarn 은 `.yarnrc` 의 yarn-path · `.yarnrc.yml` 의 yarnPath 로 레포 안 JS 를 자기 대신 실행한다
#   → yarn 호출(`--version` 포함)은 전부 YARN_IGNORE_PATH=1.
#   pnpm 은 `.pnpmfile.cjs`(또는 .npmrc 의 pnpmfile)를 로드한다 → `--ignore-pnpmfile`.
#   yarn berry 는 `.yarnrc.yml` 의 `plugins:` JS 도 로드한다(YARN_IGNORE_PATH 로 안 꺼진다)
#   → plugins 가 있으면 yarn 을 **아예 부르지 않고** UNMEASURED 로 둔다(못 잰 것 = 미측정, 실행보다 안전).
#   npm audit 은 레포 코드를 실행하지 않는다.
# ⚠️ 이 방어가 무력화되는 입력: 위 세 경로 밖의 도구 설정 실행 훅(예: 새 버전 yarn/pnpm 이 추가하는 설정 키) ·
#   corepack 이 package.json `packageManager` 대로 받아 오는 도구 바이너리(레지스트리 출처, 레포 코드는 아님).
S6_STATUS="N/A"
if [ -f "$TARGET/package.json" ]; then
  S6_PM=""; S6_WHY=""
  if [ -f "$TARGET/package-lock.json" ] || [ -f "$TARGET/npm-shrinkwrap.json" ]; then S6_PM=npm
  elif [ -f "$TARGET/pnpm-lock.yaml" ]; then S6_PM=pnpm
  elif [ -f "$TARGET/yarn.lock" ]; then S6_PM=yarn
  else S6_WHY="lockfile 없음(package-lock.json·pnpm-lock.yaml·yarn.lock) — audit 불가"
  fi
  if [ -n "$S6_PM" ] && ! command -v "$S6_PM" >/dev/null 2>&1; then
    S6_WHY="${S6_PM} 미설치 (lockfile 은 ${S6_PM})"; S6_PM=""
  fi
  if [ "$S6_PM" = yarn ] && [ -f "$TARGET/.yarnrc.yml" ] && grep -qE '^[[:space:]]*plugins[[:space:]]*:' "$TARGET/.yarnrc.yml"; then
    S6_WHY="yarn 미실행 — .yarnrc.yml 에 plugins 가 있다(레포 JS 가 스캐너 권한으로 실행될 수 있어 audit 생략)"; S6_PM=""
  fi
  if [ -n "$S6_PM" ]; then
    case "$S6_PM" in
      npm)  S6_CMD=(npm audit --json) ;;
      pnpm) S6_CMD=(pnpm audit --json --ignore-pnpmfile) ;;
      yarn)
        _yv=$( (cd "$TARGET" && YARN_IGNORE_PATH=1 yarn --version) 2>/dev/null | head -1)
        case "$_yv" in
          1.*) S6_CMD=(env YARN_IGNORE_PATH=1 yarn audit --json) ;;
          *)   S6_CMD=(env YARN_IGNORE_PATH=1 yarn npm audit --json) ;;
        esac ;;
    esac
    _s6_err=$(mktemp)
    if S6_COUNT=$( (cd "$TARGET" && "${S6_CMD[@]}") 2>/dev/null | python3 -c '
import json, sys

def fail(msg):
    sys.stderr.write(msg)
    sys.exit(2)

def sev(v):
    keys = ("info", "low", "moderate", "high", "critical")
    if not isinstance(v, dict) or not any(k in v for k in keys):
        return None
    try:
        return int(v.get("high", 0)) + int(v.get("critical", 0))
    except (TypeError, ValueError):
        return None

raw = sys.stdin.read()
if not raw.strip():
    fail("빈 출력")
try:
    docs = [json.loads(raw)]
except ValueError:
    try:
        docs = [json.loads(l) for l in raw.splitlines() if l.strip()]
    except ValueError:
        fail("JSON 파싱 실패")
for d in docs:
    if isinstance(d, dict) and (d.get("error") or d.get("type") == "error"):
        e = d.get("error") or d.get("data")
        fail("도구 오류: " + str(e.get("code", e) if isinstance(e, dict) else e)[:120])
for d in docs:
    if not isinstance(d, dict):
        continue
    m = d.get("metadata")
    n = sev(m.get("vulnerabilities")) if isinstance(m, dict) else None
    if n is None and d.get("type") == "auditSummary" and isinstance(d.get("data"), dict):
        n = sev(d["data"].get("vulnerabilities"))
    if n is not None:
        print(n)
        sys.exit(0)
rows = [d for d in docs if isinstance(d, dict) and isinstance(d.get("children"), dict) and "Severity" in d["children"]]
if rows:
    print(sum(1 for r in rows if str(r["children"]["Severity"]).lower() in ("high", "critical")))
    sys.exit(0)
fail("알 수 없는 출력 형식(취약점 집계 필드 없음)")
' 2>"$_s6_err") && [[ "$S6_COUNT" =~ ^[0-9]+$ ]]; then
      S6_STATUS="MEASURED"
      if [ "$S6_COUNT" -gt 0 ]; then
        add_finding "HIGH" "S6" "package.json" "-" "${S6_PM} audit: ${S6_COUNT}개 HIGH/CRITICAL 취약 의존성" "${S6_PM} audit 결과대로 해당 패키지 업데이트"
      fi
    else
      # 오류 문구는 **문자 단위**로 자른다. 종전 `head -c 160` 은 UTF-8 바이트 중간(한글)을 잘라 최종 JSON 쓰기가
      # UnicodeEncodeError 로 죽고 결과 JSON 이 0 바이트가 됐다(PR #688 보안 리포트 M3). 깨진 바이트는 U+FFFD 로 바꾼다.
      _s6_msg=$(python3 -c 'import sys; print(open(sys.argv[1], "rb").read().decode("utf-8", "replace")[:160].replace("\n", " "))' "$_s6_err" 2>/dev/null)
      S6_WHY="${S6_PM} audit 실행·파싱 실패: ${_s6_msg}"
    fi
    rm -f "$_s6_err"
  fi
  if [ "$S6_STATUS" != "MEASURED" ]; then
    S6_STATUS="UNMEASURED"
    add_finding "MEDIUM" "S6-UNMEASURED" "package.json" "-" "S6 미측정: ${S6_WHY}" "lockfile 에 맞는 패키지 매니저(npm·pnpm·yarn)를 설치하고 네트워크가 되는 곳에서 재실행 — 0건으로 읽지 말 것"
    echo "  [S6] UNMEASURED — ${S6_WHY}"
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
# 범위 (2026-09-23 — harness-gaps 2026-09-18-s8-base-history-blocks-sc3 · 구 2026-09-15 `HEAD <base>` 대체):
#   기본 = `git log -p <merge-base(base, HEAD)>..HEAD` — **이 PR 이 새로 들인 커밋만** 본다.
#   왜: 종전 `HEAD <base>` 는 base(develop) 이력 전체를 읽어, PR 과 무관한 과거 커밋 5개가 **모든 PR** 에
#   HIGH 1 을 영구히 남겼다(매 PR 보안 리포트가 그것을 수동 제외 — 소음 게이트). 이미 base 에 들어간
#   시크릿은 PR 게이트가 아니라 **정기 감사**의 몫이다 → `--s8-full`(= FORGE_SECURITY_S8_FULL=1) 은
#   종전 `HEAD + <base>` 범위, `FORGE_SECURITY_S8_ALL=1` 은 전 브랜치 `--all`.
#   ⚠️ 전체 감사 모드는 **커밋 상한도 함께 푼다**(#827 — 상한 200 은 PR 범위용). 정기 실행처 = `.github/workflows/security-history-audit.yml`(주 1회).
#   base = FORGE_SECURITY_BASE(명시) → origin/develop → origin/main → develop → main 중 첫 존재 ref.
#   fail-closed: base 를 못 찾거나 merge-base 가 없으면(무관한 이력) 범위를 **좁히지 않는다** —
#   HEAD 도달 이력 전체(+ base 가 있으면 base 이력)를 본다. 판정 불가를 "PR 범위 0건"으로 읽지 않는다.
#   범위(와 PR 범위면 커밋 수)는 항상 stdout `[S8] scope:` 줄로 찍는다 — JSON 에만 있으면 사람이 못 본다
#   (PR #688 보안 리포트 M1). 명시 base 인데 0 커밋이면 `[S8] NOTICE` 를 낸다(막지는 않는다 — 빈 PR 도 있다).
# ⚠️ 이 범위가 무력화되는 입력: ①이미 base 에 머지된 시크릿 — 기본 범위에선 안 잡힌다(의도된 축소, 정기 감사로
#   `--s8-full` 을 돌린다) ②base 에서 곧장(HEAD == base) 돌리면 범위가 0 커밋이다 — scope 에 커밋 수가 찍힌다
#   ③base·HEAD 어느 쪽에도 없는 제3 브랜치 — FORGE_SECURITY_S8_ALL=1.
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
    S8_MB=""
    [ -n "$S8_BASE" ] && S8_MB=$(git -C "$TARGET" merge-base "$S8_BASE" HEAD 2>/dev/null)
    if [ -n "$S8_BASE" ] && [ "$S8_FULL" = "1" ]; then
      S8_REVS=(HEAD "$S8_BASE"); S8_SCOPE="HEAD + $S8_BASE (--s8-full)"
    elif [ -n "$S8_MB" ]; then
      _s8n=$(git -C "$TARGET" rev-list --count "${S8_MB}..HEAD" 2>/dev/null)
      S8_REVS=("${S8_MB}..HEAD"); S8_SCOPE="merge-base($S8_BASE)..HEAD (${_s8n:-?} commits)"
      if [ "${_s8n:-}" = "0" ] && [ -n "${FORGE_SECURITY_BASE:-}" ] && [ "$S8_BASE" = "$FORGE_SECURITY_BASE" ]; then
        echo "  [S8] NOTICE — 명시 base '${FORGE_SECURITY_BASE}' 기준 PR 범위가 0 커밋이다(검사한 커밋 없음). base 가 HEAD 를 포함하는지 확인 — 빈 PR 이면 정상"
      fi
    elif [ -n "$S8_BASE" ]; then
      # fail-closed: 공통 조상이 없으면 PR 범위를 정의할 수 없다 — 좁히지 않고 종전 전체 범위로 본다.
      S8_REVS=(HEAD "$S8_BASE"); S8_SCOPE="HEAD + $S8_BASE (fail-closed: merge-base 없음)"
      echo "  [S8] NOTICE — merge-base($S8_BASE, HEAD) 없음, 전체 범위로 검사(fail-closed)"
    else
      # fail-closed: base 를 못 찾으면 PR 범위를 알 수 없다 — HEAD 도달 이력 전체를 본다.
      S8_REVS=(HEAD); S8_SCOPE="HEAD 전체 (fail-closed: base 미탐지 — origin/develop·origin/main·develop·main 없음)"
      echo "  [S8] NOTICE — base ref 미탐지, HEAD 도달 이력 전체를 검사(fail-closed · FORGE_SECURITY_BASE 로 지정 가능)"
    fi
  fi
# 커밋 상한(#827): 기본 200 은 **PR 범위**를 위한 값이다. 정기 감사(`--s8-full`·`S8_ALL`)에서 그대로 두면
#   develop 2837 커밋 중 최근 13일치만 보고 "이력 감사 완료"가 된다 — 안 본 것을 통과로 읽는 그 사고다.
#   그래서 전체 감사 모드에서는 **상한을 없앤다**(0 = 무제한). 사람이 필요하면 FORGE_SECURITY_S8_MAX 로 덮는다.
#   ⚠️ 이 해제가 무력화되는 입력: FORGE_SECURITY_S8_MAX 를 명시하면 전체 감사에서도 그 값이 이긴다(의도 — 사람 override).
#   재현: bash shared/scripts/tests/check-security-s8-scope.test.sh
if [ -n "${FORGE_SECURITY_S8_MAX:-}" ]; then
  S8_MAX="$FORGE_SECURITY_S8_MAX"
elif [ "$S8_FULL" = "1" ] || [ "${FORGE_SECURITY_S8_ALL:-0}" = "1" ]; then
  S8_MAX=0
else
  S8_MAX=200
fi
case "$S8_MAX" in ''|*[!0-9]*) S8_MAX=200 ;; esac      # 형식 밖 = 기본값(조용히 무제한으로 넓히지 않는다)
S8_MAXARG=(); [ "$S8_MAX" != "0" ] && S8_MAXARG=(--max-count="$S8_MAX")
S8_SCOPE="${S8_SCOPE} · 상한 $([ "$S8_MAX" = 0 ] && echo 무제한 || echo "$S8_MAX 커밋")"
  echo "  [S8] scope: ${S8_SCOPE}"
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
  [ "$_S8_UNVERIFIED" = 0 ] && S8_LINES=$(git -C "$TARGET" log -p --format='@@S8C %h' ${S8_MAXARG[@]+"${S8_MAXARG[@]}"} "${S8_REVS[@]}" 2>/dev/null \
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
S9_XSS_EMITTED=0
while IFS=: read -r file line match; do
  [ -z "$file" ] && continue
  if sec_allowed S9-XSS "$file" "$match"; then add_suppressed S9-XSS "$file" "$line"; continue; fi
  [ "$S9_XSS_EMITTED" -ge 10 ] && break
  # root-cause: cr-double HIGH — S9 ID duplication with API key scan; renamed to S9-XSS for distinct filtering
  add_finding "MEDIUM" "S9-XSS" "$file" "$line" "LLM 출력 미검증: dangerouslySetInnerHTML/eval에 LLM 응답 직접 전달 위험" "출력 sanitize 또는 textContent 사용"
  S9_XSS_EMITTED=$((S9_XSS_EMITTED+1))
done < <(grep -rn $EXCLUDE_PATTERN \
  -E "(dangerouslySetInnerHTML|(^|[^a-z])eval[[:space:]]*\()" \
  "$TARGET" --include="*.js" --include="*.ts" --include="*.jsx" --include="*.tsx" 2>/dev/null \
  | grep -v "DOMPurify\|sanitize\|escape\|test\|spec")

S9_APIKEY_EMITTED=0
while IFS=: read -r file line match; do
  [ -z "$file" ] && continue
  if sec_allowed S9-APIKEY "$file" "$match"; then add_suppressed S9-APIKEY "$file" "$line"; continue; fi
  [ "$S9_APIKEY_EMITTED" -ge 10 ] && break
  # root-cause: cr-double R1 — ${match} injection risk in Python string → remove variable interpolation
  # root-cause: cr-double HIGH — S9 ID duplication with XSS scan; renamed to S9-APIKEY for distinct filtering
  add_finding "MEDIUM" "S9-APIKEY" "$file" "$line" "AI API 키 하드코딩 의심 (패턴 검출)" "환경변수(process.env / os.environ)로 이동"
  S9_APIKEY_EMITTED=$((S9_APIKEY_EMITTED+1))
done < <(grep -rn $EXCLUDE_PATTERN \
  -E "(OPENAI_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY)\s*[=:]\s*['\"][^'\"]{10,}|sk-[a-zA-Z0-9]{32,}" \
  "$TARGET" --include="*.js" --include="*.ts" --include="*.py" 2>/dev/null \
  | grep -v "process\.env\|os\.getenv\|os\.environ\|example\|sample\|\.env")

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
# 깨진 UTF-8(짝 없는 surrogate)이 finding 문구에 섞여도 JSON 을 쓴다 — backslashreplace 는 `\udcXX` 를 내는데
#   그것은 JSON 문자열 안에서 유효한 이스케이프다. 그래도 쓰기가 실패하면 **판정 불가**다: 0 바이트 JSON 옆에
#   `PASS` 를 찍으면 모든 finding 이 사라진 채 통과로 읽힌다(PR #688 보안 리포트 M3).
if ! printf '%s\n%s\n' "$FINDINGS" "$SUPPRESSED_FINDINGS" | python3 -c "
import json,sys
sys.stdout.reconfigure(errors='backslashreplace')
findings=json.loads(sys.stdin.readline())
suppressed=json.loads(sys.stdin.readline())
verdict=sys.argv[1]
result={
  'verdict':verdict,
  'critical':int(sys.argv[2]),
  'high':int(sys.argv[3]),
  'medium':int(sys.argv[4]),
  'low':int(sys.argv[5]),
  's8_scope':sys.argv[6],
  's6_status':sys.argv[7],
  # PMO #154: SKILL.md 가 선언한 15-phase 중 S10~S15 는 이 스캐너에 **구현돼 있지 않다** — 안 본 것을 PASS 로 읽지 않게 명시한다.
  'phases_unmeasured':['S10','S11','S12','S13','S14','S15'],
  'suppressed':len(suppressed),
  'findings':findings,
  'suppressed_findings':suppressed
}
print(json.dumps(result,indent=2,ensure_ascii=False))
" "$VERDICT" "$CRITICAL" "$HIGH" "$MEDIUM" "$LOW" "$S8_SCOPE" "$S6_STATUS" > "$OUT_JSON"; then
  rm -f "$OUT_JSON"
  echo "Scan complete: UNVERIFIED (결과 JSON 쓰기 실패 — 판정 불가, PASS 로 읽지 말 것; 원 판정 $VERDICT CRITICAL=$CRITICAL HIGH=$HIGH MEDIUM=$MEDIUM LOW=$LOW) suppressed=$SUPPRESSED S6=$S6_STATUS"
  exit 2
fi

# PMO #154(갭 2026-09-20-security-scanner-s10-s15-unimplemented): SKILL.md 는 15-phase 를 선언하지만 이 스크립트는 S1~S9 만 돈다.
#   S10 CI/CD · S11 STRIDE · S12 API · S13 컨테이너/인프라 · S14 익스플로잇(path traversal·SSRF) · S15 트렌드 — 여섯 칸은 **미측정**이다.
#   요약 줄 끝과 JSON `phases_unmeasured` 에 매번 싣는다. 이 판정(VERDICT)은 S1~S9 기준이다.
#   ⚠️ 무력화되는 입력: 요약 줄의 앞부분만 잘라 읽는 소비자 — 그래서 JSON 필드로도 싣는다.
echo "  [S10~S15] UNMEASURED — 미구현(CI/CD·STRIDE·API·컨테이너·익스플로잇·트렌드). 이 스캐너는 보지 않는다 — 안 본 것은 통과가 아니다"
echo "Scan complete: $VERDICT (CRITICAL=$CRITICAL HIGH=$HIGH MEDIUM=$MEDIUM LOW=$LOW) suppressed=$SUPPRESSED S6=$S6_STATUS unmeasured=S10-S15"
echo "Results: $OUT_JSON"
