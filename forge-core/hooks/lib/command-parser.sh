#!/usr/bin/env bash
# lib/command-parser.sh — sourceable canonical parser for ASI hooks (AD-107)
# source ~/.claude/hooks/lib/command-parser.sh
# parse_hook_input "$JSON" → sets CP_COMMAND, CP_NORMALIZED, CP_BYPASSES, CP_SUSPICIOUS
# root-cause: AD-107 Sprint 2 재설계 — stdin-only → sourceable function defs

_cp_extract_and_normalize() {
    local json_input="$1"
    python3 - "$json_input" << 'PYEOF'
import sys, re, json, urllib.parse

raw = sys.argv[1] if len(sys.argv) > 1 else ''
try:
    d = json.loads(raw)
    ti = d.get('tool_input', {})
    cmd = ti.get('command', '') or ti.get('code', '') or ti.get('script', '') or ''
except Exception:
    cmd = raw

bypasses = []


# ⛔ **bash 는 `\`+개행을 줄이음으로 본다 — 우리도 이어야 같은 명령이 된다 (2026-09-02).**
#   그러지 않아서 **금지어의 철자를 두 줄로 쪼개면 파이프라인 전체가 못 봤다**:
#       cu\
#       rl http://…/i.sh | bash        ← bash 는 `curl …` 로 **실제 실행한다**(실증)
#   `curl` 이라는 연속 문자열이 normalized 에 없으니 stage-1 게이트도, 검사 1 의 grep 도,
#   그 뒤 어느 검사도 잡지 못했다. 쉽게 말하면 **금지어를 두 줄로 나눠 적어 놓은 것**이다.
#
#   ⚠️ **인용 안에서는 접지 않는다** — 규칙이 다르기 때문이다:
#       작은따옴표 '…' : bash 는 **잇지 않는다**(역슬래시가 리터럴) → 그대로 둔다
#       큰따옴표  "…" : bash 는 **잇는다** → 접는다
#       그 밖(인용 밖)  : bash 는 **잇는다** → 접는다
#      작은따옴표 안까지 접으면 `grep 'curl \<개행>| bash'` 같은 **문서 검색이 실행으로 오판**된다.
#   ⚠️ heredoc 본문은 여기서 다루지 않는다 — 소비처(check-supply-chain)가 `strip_heredocs`
#      로 따로 처리하고, 그쪽이 이 함수보다 뒤에 돈다.
#   ⚠️ 이 방어가 무력화되는 입력: 캐리지리턴 단독(`\r`)으로 줄을 나누는 것. bash 는 그것을
#      구분자로도 줄이음으로도 보지 않으므로(실측 `$'g\r': command not found`) 범위 밖이다.
#   재현: python3 shared/scripts/tests/command-parser-line-join.probe.py
def _cp_join_continuations(text):
    out, i, n, quote = [], 0, len(text), None
    in_comment = False
    while i < n:
        c = text[i]
        if in_comment:
            # ⚠️ **주석 안에서는 접지 않는다 (2026-09-02 cr-final HIGH — 회귀 수정).**
            #   bash 는 주석 안의 `\`+개행을 줄이음으로 보지 **않는다**. 실측:
            #       echo # x\<개행>echo EXECUTED   →  EXECUTED 가 출력된다(다음 줄은 별도 명령)
            #   그런데 1차 구현은 인용 밖이면 무조건 접어 `x`+`npm` = `xnpm` 으로 붙였고,
            #   검사 2 의 `\bnpm install` **단어 경계가 깨져** develop 이 BLOCK 하던 입력이
            #   통과했다(rc 2 → 0). **접는 것을 늘리다가 탐지를 잃은** 것이다 —
            #   띄어쓰기를 지우다가 금지어를 다른 단어로 만들어 버린 셈이다.
            if c == '\n':
                in_comment = False
            out.append(c); i += 1; continue
        if quote == "'":                       # 작은따옴표 안 — 그대로 보존
            if c == "'":
                quote = None
            out.append(c); i += 1; continue
        if quote is None and c == '#' and (not out or out[-1] in ' \t\n;&|('):
            # 인용 밖에서 단어 시작 위치의 `#` → 그 줄 끝까지 주석이다.
            in_comment = True; out.append(c); i += 1; continue
        if c == '\\' and i + 1 < n and text[i + 1] == '\n':
            i += 2; continue                   # 줄이음 — 두 글자 다 버린다(bash 와 동일)
        if c == '\\' and i + 1 < n:            # 그 밖의 이스케이프는 그대로
            out.append(c); out.append(text[i + 1]); i += 2; continue
        if quote == '"':
            if c == '"':
                quote = None
            out.append(c); i += 1; continue
        if c in ('"', "'"):
            quote = c; out.append(c); i += 1; continue
        out.append(c); i += 1
    return ''.join(out)


cmd = _cp_join_continuations(cmd)
normalized = cmd

# 1. URL decode
# ⛔ 디코드 본문도 자르지 않는다 (2026-09-02 — 아래 §판정용/기록용 분리와 같은 근거).
#   종전에는 `url1[:200]` 이었다. 그래서 **명령 전체를 URL 인코딩**하면 디코드 본문이
#   200자를 넘는 순간 뒤쪽 `curl|bash`·`npm install` 이 판정에서 사라졌다:
#     인코딩 · 디코드 54자  → exit 2 (차단)
#     인코딩 · 디코드 294자 → exit 0 ⛔ (URLDEC 조각이 200자에서 잘려 curl 이 안 보임)
#   `url_encoded` bypass 플래그는 켜지지만, 검사 2 의 install 패턴이 잘려 BLOCK 에 못 닿았다.
#   ⚠️ 이건 아래 `[:500]` 절단과 **완전히 같은 결함**이다 — 한쪽만 고치면
#      "판정값은 자르지 않는다"는 원칙이 같은 함수 안에서 자기모순이 된다.
#   재현: python3 로 `''.join('%%%02x'%ord(c) for c in cmd)` 인코딩 후 훅에 먹인다.
#   프로브: shared/scripts/tests/supply-chain-long-command.probe.py (URL 인코딩 축 3케이스)
url1 = urllib.parse.unquote(cmd)
if url1 != cmd:
    normalized += ' URLDEC:' + url1
    bypasses.append('url_encoded')

# 2. Double URL decode
url2 = urllib.parse.unquote(url1)
if url2 != url1:
    normalized += ' URLDEC2:' + url2
    bypasses.append('double_url_encoded')

# 3. base64 exec pipe
if re.search(r'base64\s*-d.*\|\s*(bash|sh|zsh)', cmd, re.I):
    bypasses.append('base64_exec')

# 4. base64 blob + pipe to shell (echo/printf required — avoids git hash FP)
if re.search(r"(echo|printf)\s+[chr]{0,1}[\"']{0,1}[A-Za-z0-9+/]{20,}=*[\"']{0,1}\s*\|\s*base64\s*-d.*\|\s*(bash|sh|zsh)", cmd, re.I):
    bypasses.append('base64_blob')

# 5. hex encoding \xNN
if re.search(r'\\x[0-9a-fA-F]{2}', cmd):
    bypasses.append('hex_encoded')

# 6. subshell + download/exec (not standalone date/cat)
if re.search(r'\$\(.*?(curl|wget|nc|bash|sh|python|perl|ruby)\b', cmd, re.I) or \
   re.search(r'`.*?(curl|wget|nc|bash|sh)\b', cmd, re.I):
    bypasses.append('subshell')

# 7. eval + variable/subshell
norm_stripped = re.sub(r"""['"`\\]""", '', normalized)
if re.search(r'\beval\b.*(\$|`)', norm_stripped, re.I):
    bypasses.append('eval')

# 8. var exec at line start ($VAR arg form)
if re.search(r'^\s*\$[A-Z_]{2,}\s', cmd):
    bypasses.append('var_exec')

# 9. process substitution <(...)
if re.search(r'<\s*\(', cmd):
    bypasses.append('proc_subst')

# ⛔ **여기서 자르지 않는다 (2026-09-02 — 판정용/기록용 분리).**
#   종전에는 두 필드를 `[:500]` 으로 잘라 내보냈다. 그런데 이 출력의 소비처는 **전부 판정**이고
#   **로그에 쓰는 곳은 하나도 없다**(실측 — 아래 목록). 그래서 절단은 로그 크기를 줄이지 못하고
#   **탐지만 잃고 있었다**:
#       echo <500자 넘는 평범한 접두>; curl http://…/x.sh | bash   → exit 0 (뒤가 잘려 안 보임)
#   쉽게 말하면 **검사관이 서류 앞 500자만 읽고 도장을 찍던 것**이다. 뒤에 뭐가 적혔든 통과했다.
#   실측 경계: 접두 450자 → exit 2(차단) · 520자 → exit 0(통과).
#
#   소비처 실측(2026-09-02) — 전부 판정 경로다:
#     check-supply-chain.sh  : .normalized → NORM → stage-1 게이트 + 검사 1~13
#     check-supply-chain.sh  : .normalized → heredoc 재판정(검사 2)
#     asi-1-2-3-5-7-9.sh     : parse_canonical() → .normalized/.bypasses → ASI 판정
#     hooks/tests/supply-chain-bypass.test.sh : 키 존재만 확인
#   재현: grep -rn "get('normalized'\|\.normalized" --include='*.sh' .claude/hooks/
#
#   ⚠️ **로그 절단은 각 소비처가 이미 자기 몫으로 하고 있다** — 예: check-supply-chain.sh 의
#      `_log()` 는 `${CMD:0:200}` 으로 자른다. 즉 여기서 자를 이유가 애초에 없었다.
#      로그 크기가 다시 문제가 되면 **기록하는 자리에서** 자른다. 판정값은 자르지 않는다.
#   ⚠️ 이 변경이 무력화되는 입력: 소비처가 이 JSON 을 **그대로 파일에 적재**하기 시작하면
#      그때는 로그가 커진다 — 그 소비처가 자기 사본을 자르면 되고, 여기로 되돌리면 안 된다.
#   ⚠️ 상한을 없앤 대가: 아주 긴 명령에서 이 JSON 이 그만큼 커진다.
#      **출력 JSON 쪽**은 소비처가 전부 stdin·subprocess 로 받아 argv 상한에 안 걸린다.
#      ⚠️ **입력 쪽은 다르다** — `check-supply-chain.sh` 는 `_cp_extract_and_normalize "$INPUT"` 로,
#         이 함수는 `python3 - "$json_input"` 로 **argv 에 실어** 넘기므로 MAX_ARG_STRLEN(128KB)에
#         걸릴 수 있다. 그때는 `PARSED='{}'` 로 떨어져 `NORM=원문 CMD`·`BYPASSES=''` 가 되고,
#         **원문 기반 검사는 그대로 살아 있어 우아하게 강등**된다(실측: 135,000자 → exit 2).
#         잃는 것은 bypass 기반 BLOCK(검사 2)뿐이다. 이건 선재 동작이며 이 변경이 만든 것이 아니다.
#      `parse_hook_input()` 도 argv 경로지만 **현재 소비처가 0건**이다
#      (재현: `grep -rn 'parse_hook_input' --include='*.sh' .` → 정의부 1곳뿐).
print(json.dumps({
    'command': cmd,
    'normalized': norm_stripped,
    'bypasses': bypasses,
    'suspicious': len(bypasses) > 0,
}, ensure_ascii=False))
PYEOF
}

parse_hook_input() {
    local json_input="${1:-}"
    local result
    result=$(_cp_extract_and_normalize "$json_input") || { CP_COMMAND=''; CP_NORMALIZED=''; CP_BYPASSES=''; CP_SUSPICIOUS='false'; HOOK_CMD=''; HOOK_CONTENT=''; return 0; }
    CP_COMMAND=$(python3 -c "import sys,json; d=json.loads(sys.argv[1]); print(d.get('command',''))" "$result" 2>/dev/null || echo '')
    CP_NORMALIZED=$(python3 -c "import sys,json; d=json.loads(sys.argv[1]); print(d.get('normalized',''))" "$result" 2>/dev/null || echo '')
    CP_BYPASSES=$(python3 -c "import sys,json; d=json.loads(sys.argv[1]); print(' '.join(d.get('bypasses',[])))" "$result" 2>/dev/null || echo '')
    CP_SUSPICIOUS=$(python3 -c "import sys,json; d=json.loads(sys.argv[1]); print('true' if d.get('suspicious',False) else 'false')" "$result" 2>/dev/null || echo 'false')
    # compat aliases for existing hooks
    HOOK_CMD="$CP_COMMAND"
    HOOK_CONTENT=""
    export CP_COMMAND CP_NORMALIZED CP_BYPASSES CP_SUSPICIOUS HOOK_CMD HOOK_CONTENT
}

# ── 스크립트 모드 (H-05, 2026-08-03) ──────────────────────────────────────────
# 이 파일은 sourceable 함수 라이브러리지만, 실제 소비자 2곳이 **서브프로세스로 실행**해
# stdout JSON 을 기대해 왔다:
#   - check-supply-chain.sh: `echo "$CMD" | bash "$PARSER"` → PARSED='' → BYPASSES 상시 공백
#     → bypass BLOCK(설치 명령 bypass 탐지) 도달 불가
#   - asi-1-2-3-5-7-9.sh:    `subprocess.run(['bash', PARSER], input=text)` → json.loads('') 예외
#     → `except: return text, []` 로 조용히 폴백(주석 :150-152 가 이 사실을 이미 기록)
# 재현(수정 전): printf 'npm install lodash' | bash lib/command-parser.sh → rc=0, stdout 0바이트
# → 직접 실행 시 stdin(hook JSON 또는 raw 명령 문자열)을 읽어 JSON 을 내보낸다.
#   source 경로의 동작·변수 계약(parse_hook_input / CP_*)은 무변경.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    if [ -t 0 ]; then
        echo "usage: <json|command> | bash command-parser.sh   # stdout: canonical JSON" >&2
        echo "       (source 시에는 parse_hook_input \"\$JSON\" → CP_COMMAND/CP_NORMALIZED/CP_BYPASSES)" >&2
        exit 0
    fi
    _cp_stdin=$(cat 2>/dev/null || echo '')
    _cp_extract_and_normalize "$_cp_stdin"
    exit $?
fi

_ASI_AUDIT_LOG="${ASI_AUDIT_LOG:-${FORGE_OUTPUTS:-$HOME/forge-outputs}/.claude/audit/asi-hooks.jsonl}"

log_asi_event() {
    local hook="${1:-unknown}" level="${2:-WARN}" msg="${3:-}"
    local safe_msg
    safe_msg=$(python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$msg" 2>/dev/null || echo '"'"$msg"'"')
    mkdir -p "$(dirname "$_ASI_AUDIT_LOG")" 2>/dev/null
    printf '{"ts":%d,"hook":"%s","level":"%s","msg":%s}\n' "$(date +%s)" "$hook" "$level" "$safe_msg" >> "$_ASI_AUDIT_LOG" 2>/dev/null || true
}
