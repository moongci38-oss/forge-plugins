#!/usr/bin/env bash
# forge-plugin-learn-reminder.sh — Stop hook (FR-003)
#
# 세션에서 forge 스킬을 1회 이상 썼다면, 종료 시점에 "이번 세션에 misfire 있었나?
# /forge-learn-sweep 로 남겨라" 1줄을 emit 한다.
#
# 왜 Stop hook 인가 (SPEC FR-003 결정):
#   플러그인 사용자에게는 우리 end-sonnet/end-opus/checkpoint 같은 **세션 랩업 스킬이
#   존재한다는 보장이 없다**. 존재하지 않는 앵커에 트리거를 매달면 캡처율이 0이 된다.
#   Stop hook 은 플러그인이 스스로 배선할 수 있는 유일한 무설정 앵커다.
#
# 지키는 것:
#   - forge 스킬 사용 0회 세션에서는 발화하지 않는다(노이즈 방지).
#   - 정확히 1회만 발화한다.
#   - **절대 Stop 을 차단하지 않는다** — 항상 exit 0 (AD-168 하드 BLOCK 신설 금지).
#
# opt-out: FORGE_PLUGIN_LEARN=off

set -u
trap 'exit 0' ERR

[ "${FORGE_PLUGIN_LEARN:-}" = "off" ] && exit 0

# stdin 으로 들어오는 훅 페이로드에서 transcript 경로를 얻는다(없으면 조용히 종료).
HOOK_JSON=$(cat 2>/dev/null || true)
[ -z "$HOOK_JSON" ] && exit 0

command -v python3 >/dev/null 2>&1 || exit 0

python3 - "$HOOK_JSON" <<'PYEOF' 2>/dev/null || true
import json, os, re, sys, time

try:
    payload = json.loads(sys.argv[1])
except Exception:
    sys.exit(0)

transcript = payload.get("transcript_path") or ""
if not transcript or not os.path.exists(transcript):
    sys.exit(0)

# 세션 중복 발화 방지 — 세션 ID 기준 1회.
# 마커는 별도 서브디렉토리에 두고 오래된 것은 지운다 — store 디렉토리에 세션마다 파일이
# 하나씩 영구 누적되면(세션 수만큼) 사용자 디렉토리를 쓰레기로 채운다.
session_id = str(payload.get("session_id") or "")
marker_dir = os.path.join(os.path.expanduser("~"), ".claude", "forge-plugin", ".session-markers")
marker = os.path.join(marker_dir, re.sub(r'[^A-Za-z0-9_-]', '_', session_id)[:64])
if session_id and os.path.exists(marker):
    sys.exit(0)

MARKER_TTL = 7 * 24 * 3600
try:
    if os.path.isdir(marker_dir):
        now = time.time()
        for name in os.listdir(marker_dir):
            p = os.path.join(marker_dir, name)
            try:
                if now - os.path.getmtime(p) > MARKER_TTL:
                    os.remove(p)
            except Exception:
                pass
except Exception:
    pass

# forge 스킬/커맨드가 이 세션에서 실제로 쓰였는지 — 안 썼으면 발화하지 않는다.
FORGE_SIGNAL = re.compile(
    r'"skill"\s*:\s*"(forge|cr-|qa|rag-search|advisor|spec-|healer|investigate)'
    r'|<command-name>/(forge|cr-|qa|rag-search|advisor|spec-)'
    r'|forge-(core|build|knowledge|design|game):',
    re.IGNORECASE,
)
used = False
try:
    with open(transcript, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            if FORGE_SIGNAL.search(line):
                used = True
                break
except Exception:
    sys.exit(0)

if not used:
    sys.exit(0)

if session_id:
    try:
        os.makedirs(marker_dir, mode=0o700, exist_ok=True)
        fd = os.open(marker, os.O_CREAT | os.O_WRONLY | os.O_EXCL, 0o600)
        os.close(fd)
    except FileExistsError:
        sys.exit(0)
    except Exception:
        pass   # 마커 실패해도 발화는 진행(fail-open)

print("[forge-plugin] 이번 세션에 misfire(잘못 발동·헛수고·게이트 오탐)가 있었나요? "
      "→ /forge-learn-sweep 로 로컬 메모에 남기면 다음 세션에 반영됩니다.")
PYEOF

exit 0
