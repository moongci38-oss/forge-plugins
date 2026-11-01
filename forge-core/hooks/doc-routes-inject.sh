#!/usr/bin/env bash
# doc-routes-inject.sh — 상황에 맞는 지침 절을 **훅이 넣어 준다** (#2808)
#
# 왜: 지침 문서(rules-on-demand 등)는 모델이 기억해서 찾아 읽어야 해 잘 안 읽힌다.
#   그래서 정본 표 1개(shared/config/doc-routes.tsv)를 세 지점에서 읽어, 맞는 상황이면 "문서§절 + 꼭 알 것 1줄"을 넣는다.
#     SessionStart      모든 세션에 "상황 → 문서" 색인(표의 session `*` 행) · 팀장 방(FORGE_BUS_FROM)이면 그 역할 절(`room=<정규식>` 행)
#     UserPromptSubmit  요청·버스 브리프 문구가 prompt 행 정규식과 맞으면
#     PreToolUse[Bash]  명령이 bash 행 정규식과 맞으면(pr-merge.sh·gh pr create 등)
#   넣는 것은 본문이 아니라 **문서 경로§절 + 1줄**이다 — 읽을지는 모델이 정한다(길이 상한을 넘으면 자른다).
# 규칙:
#   - 같은 세션에 같은 절(표 3칸 값)은 1번만 — 상태 파일 ${XDG_RUNTIME_DIR:-/tmp}/forge-doc-routes-<uid>/<세션 id>.
#     색인 줄은 따로 센다(색인에 나온 문서라도 그 상황이 오면 꼭 알 것 1줄을 넣는다).
#     SessionStart source=compact|clear 면 그 세션 기록을 비운다(맥락이 지워졌으니 다시 넣는다) · resume 은 그대로 둔다.
#   - 상한: 한 번에 6줄(색인 줄은 세지 않는다) · 한 줄 200자 · 전체 1200자. 줄 수로 잘린 행은 기록하지 않아 다음 매칭 때 들어간다.
#   - 매칭은 대소문자 무시 정규식(python re). 깨진 정규식 줄은 그 줄만 건너뛴다.
# 끄기: FORGE_DOC_ROUTES=off (kill-switch 1개) · 시험 주입구: FORGE_DOC_ROUTES_FILE=<표 경로>
# fail-open: 표 없음·python3 없음·깨진 입력·상태 폴더를 못 씀 → 조용히 rc 0(상태 폴더가 없으면 중복 막기만 빠진다). 아무것도 막지 않는다.
# 배선: 프로젝트 레인 .claude/settings.json(세 이벤트) · 다른 프로젝트 = register-forge-hooks.sh REQUIRED(PROJECT_DEDUP 꼴 — forge 세션은 프로젝트 레인만 돈다)
#   · 플러그인 사용자 = forge-core 플러그인 plugin.json — 세 이벤트 · 인자 --via-plugin · 설정에 등록이 있으면 침묵(#2825)
# ⚠️ 무력화되는 입력: 표에 없는 말로 요청하면 안 넣는다(정규식이 아는 낱말만) · Bash 명령을 변수로 조립하면(`S=pr-merge.sh; bash $S`) 못 본다 ·
#   상태 폴더가 남의 것·심링크면 중복 막기를 끈다(같은 절이 매번 들어갈 수 있다 — 넘치지 않게 상한은 그대로).
# 재현: bash shared/scripts/tests/doc-routes-inject.test.sh
# 폐기조건: 하네스가 상황별 문서 주입을 자체 기능으로 제공하면 지운다.

[ "${FORGE_DOC_ROUTES:-on}" = off ] && exit 0
# 플러그인 사본(#2825) — forge-core 플러그인이 `bash "${CLAUDE_PLUGIN_ROOT}/hooks/doc-routes-inject.sh" --via-plugin` 으로 건다.
#   전역(register-forge-hooks.sh)·프로젝트 레인 등록이 있으면 그쪽이 돌므로 플러그인 사본은 침묵한다(두 번 넣지 않게).
#   왜 상태 파일 중복 막기로 안 되나: 같은 이벤트의 훅들은 **동시에** 돈다 — 둘 다 상태를 쓰기 전에 읽어 둘 다 넣는다
#   (compact 때는 둘 다 기록을 비운다). 왜 register 쪽에서 건너뛰지 않나: 등록은 갱신할 때 한 번이라 그 뒤 플러그인을
#   깔거나 지우면 어긋난다 — 훅이 돌 때마다 설정 파일을 보는 쪽이 맞다.
# ⚠️ 무력화되는 입력: 설정에 등록 줄만 있고 ~/forge 클론이 없으면 등록된 쪽도 표를 못 찾아 아무도 안 넣는다(플러그인 사용자는 클론 필수).
if [ "${1:-}" = --via-plugin ]; then
  for _dr_s in "$HOME/.claude/settings.json" "$HOME/.claude/settings.local.json" \
               "${CLAUDE_PROJECT_DIR:-/nonexistent}/.claude/settings.json" "${CLAUDE_PROJECT_DIR:-/nonexistent}/.claude/settings.local.json"; do
    [ -f "$_dr_s" ] && grep -q 'doc-routes-inject\.sh' "$_dr_s" 2>/dev/null && exit 0
  done
fi
_dr_here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 표 찾기: 주입구 → 원본 레포 옆(../../shared) → ~/forge 클론. 미러(~/.claude/hooks)·플러그인 캐시 사본은 옆에 표가 없다(#2825).
_dr_tsv="${FORGE_DOC_ROUTES_FILE:-$_dr_here/../../shared/config/doc-routes.tsv}"
[ -n "${FORGE_DOC_ROUTES_FILE:-}" ] || [ -f "$_dr_tsv" ] || _dr_tsv="${FORGE_ROOT:-$HOME/forge}/shared/config/doc-routes.tsv"
[ -f "$_dr_tsv" ] || exit 0
command -v python3 >/dev/null 2>&1 || exit 0
_HDL_D="${BASH_SOURCE[0]%/*}"; [ "$_HDL_D" = "${BASH_SOURCE[0]}" ] && _HDL_D=.; [ -f "$_HDL_D/lib/hook-deadline.sh" ] && . "$_HDL_D/lib/hook-deadline.sh"   # #3279-6 공통 입구 — 입력 읽기만(막지 않는 훅이라 시간 상한 hook_entry 는 걸지 않는다)
unset HOOK_INPUT _HOOK_INPUT_READ; declare -F hook_read_input >/dev/null && hook_read_input 2>/dev/null || HOOK_INPUT="$(cat)"; _dr_in="$HOOK_INPUT"

# 빠른 길 — PreToolUse 는 Bash 호출마다 돈다. 표의 bash 정규식을 하나로 묶어 입력 원문에 한 번 대 보고, 안 걸리면 python 을 띄우지 않는다.
#   원문(JSON)은 명령을 그대로 담고 있어 여기서 안 걸리면 아래 정밀 판정에서도 안 걸린다(따옴표가 \" 로 바뀌는 정도의 차이만 있다).
case "$_dr_in" in
  *'"PreToolUse"'*)
    _dr_alt="$(awk -F'\t' '$1=="bash" && NF>=4 { printf "%s(%s)", (n++ ? "|" : ""), $2 }' "$_dr_tsv" 2>/dev/null)"
    [ -n "$_dr_alt" ] || exit 0
    printf '%s' "$_dr_in" | grep -qiE -- "$_dr_alt" 2>/dev/null || exit 0 ;;
esac

_DR_IN="$_dr_in" timeout 4 python3 - "$_dr_tsv" <<'PY' 2>/dev/null || true
import hashlib, json, os, re, sys

MAX_LINES, MAX_LINE, MAX_TOTAL = 6, 200, 1200
try:
    d = json.loads(os.environ.get("_DR_IN", ""))
    assert isinstance(d, dict)
except Exception:
    sys.exit(0)
ev = str(d.get("hook_event_name") or "")
if ev == "SessionStart":
    trig, text = "session", ""
elif ev == "UserPromptSubmit":
    trig, text = "prompt", str(d.get("prompt") or "")
elif ev == "PreToolUse" and d.get("tool_name") == "Bash":
    trig, text = "bash", str((d.get("tool_input") or {}).get("command") or "")
else:
    sys.exit(0)
room = os.environ.get("FORGE_BUS_FROM", "")

def clip(s, n):
    return s if len(s) <= n else s[: n - 1] + "…"

picked = []   # (기록 키, 줄)
try:
    rows = open(sys.argv[1], encoding="utf-8").read().splitlines()
except Exception:
    sys.exit(0)
for ln in rows:
    if not ln.strip() or ln.lstrip().startswith("#"):
        continue
    c = ln.split("\t")
    if len(c) < 4 or c[0] != trig:
        continue
    m, doc, key = c[1], c[2].strip(), c[3].strip()
    try:
        if trig == "session":
            if m == "*":
                rec = "index:" + doc
            elif m.startswith("room=") and room and re.search(m[5:], room, re.I):
                rec = doc
            else:
                continue
        elif re.search(m, text, re.I):
            rec = doc
        else:
            continue
    except re.error:
        continue
    picked.append((rec, clip("- %s — %s" % (doc, key), MAX_LINE)))

# 상태 — 세션 id 는 안전한 글자만 그대로, 아니면 해시(../ 로 폴더 밖에 쓰지 못한다)
state = None
try:
    base = os.environ.get("XDG_RUNTIME_DIR") or ""
    if not (base and os.path.isdir(base) and os.access(base, os.W_OK)):
        base = "/tmp"
    sdir = os.path.join(base, "forge-doc-routes-%d" % os.getuid())
    if not os.path.lexists(sdir):
        os.mkdir(sdir, 0o700)
    st = os.lstat(sdir)
    if os.path.isdir(sdir) and not os.path.islink(sdir) and st.st_uid == os.getuid():
        sid = str(d.get("session_id") or "nosession")
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", sid):
            sid = "h" + hashlib.sha1(sid.encode("utf-8", "replace")).hexdigest()
        state = os.path.join(sdir, sid)
        if os.path.islink(state):
            state = None
except Exception:
    state = None

def wopen(flags):   # 상태 파일은 링크를 따라 쓰지 않는다(O_NOFOLLOW — 검사와 쓰기 사이에 심은 링크도 거부)
    return os.fdopen(os.open(state, os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW | flags, 0o600), "w", encoding="utf-8")

seen = set()
if state:
    try:
        if trig == "session" and str(d.get("source") or "") in ("compact", "clear"):
            wopen(os.O_TRUNC).close()
        elif os.path.exists(state):
            seen = set(open(state, encoding="utf-8").read().splitlines())
    except Exception:
        pass

head = ("[문서 길잡이] 상황 → 문서 (그 상황이 오면 그 절만 읽는다)" if trig == "session"
        else "[문서 길잡이] 지금 하는 일에 맞는 지침 절 — 필요하면 읽고 진행한다")
# 방 역할 행을 색인보다 먼저 — 색인 줄은 줄 수 상한(MAX_LINES)에 세지 않는다(표의 `*` 행 수가 곧 상한이고 전체 1200자는 그대로 건다).
picked.sort(key=lambda p: p[0].startswith("index:"))
out, used, total, counted = [], [], len(head), 0
for rec, line in picked:
    if rec in seen or rec in used:
        continue
    if total + len(line) + 1 > MAX_TOTAL:
        break
    is_index = rec.startswith("index:")
    if not is_index and counted >= MAX_LINES:
        continue
    out.append(line); used.append(rec); total += len(line) + 1
    counted += 0 if is_index else 1
if not out:
    sys.exit(0)
if state:
    try:
        with wopen(os.O_APPEND) as f:
            f.write("".join(r + "\n" for r in used))
    except Exception:
        pass
print(json.dumps({"hookSpecificOutput": {"hookEventName": ev, "additionalContext": head + "\n" + "\n".join(out)}},
                 ensure_ascii=False))
PY
exit 0
