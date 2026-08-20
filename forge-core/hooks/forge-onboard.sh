#!/usr/bin/env bash
# forge-onboard.sh — SessionStart hook
# Runs once per session. Idempotent: skips if already initialized.
#
# ── 복원 이력 (2026-07-25) ───────────────────────────────────────────────────
# 이 파일은 615ba01("forge SSoT 직접 조립으로 전환")에서 사라졌는데, plugin.json 의
# SessionStart 참조는 남아 있었다 → 설치 사용자는 매 세션마다 **존재하지 않는 훅**을
# 실행 시도했다. 원인은 그 커밋이 플러그인 내용을 forge SSoT 에서 조립하도록 바꿨는데
# **hooks 는 forge SSoT 에 없어서**(sync-from-forge.py 의 SUBDIRS 에 hooks 미포함)
# 조립 대상에서 빠진 것. 죽은 코드라 지운 게 아니라 배포 파이프라인의 사각지대였다.
# 내용은 삭제 직전(615ba01^) 원본 그대로 복원했고, 아래 fail-open 하드닝만 추가했다.
#
# ── fail-open (AD-168 / 전역 무블로킹 롤아웃) ────────────────────────────────
# 종전 `set -euo pipefail` 은 openssl 부재·권한 문제 등에서 훅을 중도 중단시켰다.
# SessionStart 훅이 사용자 세션 시작을 방해해선 안 된다.
#
# ⚠️ `trap 'exit 0' ERR` 만으로는 "남은 단계 계속 진행"이 **되지 않는다** — set -e 가
#    없어도 ERR 트랩은 실패한 명령에서 발동해 그 자리에서 스크립트를 끝낸다(실측:
#    `false` 다음 줄이 실행되지 않음). 그래서 트랩은 **최후 방어선**으로만 두고,
#    각 초기화 단계는 개별적으로 `|| true` 로 감싸 실패해도 다음 단계가 돌게 한다.
#    (cr-final MEDIUM 2026-07-25 — 종전 주석은 이 점에서 사실과 달랐다.)
# ⚠️ nounset(`set -u`) 위반은 ERR 트랩이 잡지 못하고 non-zero 로 죽는다. 그래서
#    CLAUDE_PLUGIN_ROOT 를 먼저 기본값으로 확정한다(미설정 실행 환경 대비).
set -uo pipefail
trap 'exit 0' ERR

CLAUDE_PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-}"
ORCH_TOKEN_DIR="$HOME/.config/forge"
ORCH_TOKEN_FILE="$ORCH_TOKEN_DIR/orch-token.key"
RULES_DST="$HOME/.claude/rules"
RULES_SRC="${CLAUDE_PLUGIN_ROOT}/rules"
PLUGIN_DATA="${CLAUDE_PLUGIN_DATA:-$HOME/.claude/plugins/data/forge-core}"

# 1. orch-token.key — create if missing
# openssl 이 없는 환경이 실제로 있다(최소 컨테이너·일부 WSL 이미지). 없으면 이 단계만
# 건너뛰고 나머지 초기화는 계속한다 — 종전엔 여기서 훅 전체가 죽었다.
if [ ! -f "$ORCH_TOKEN_FILE" ]; then
  if command -v openssl >/dev/null 2>&1; then
    mkdir -p "$ORCH_TOKEN_DIR" 2>/dev/null || true
    if openssl rand -base64 32 > "$ORCH_TOKEN_FILE" 2>/dev/null; then
      chmod 600 "$ORCH_TOKEN_FILE" 2>/dev/null || true
      echo "[forge-onboard] orch-token.key created: $ORCH_TOKEN_FILE" >&2
    else
      rm -f "$ORCH_TOKEN_FILE" 2>/dev/null || true   # 부분 생성물 잔재 제거
    fi
  else
    echo "[forge-onboard] openssl 없음 — orch-token.key 생성 건너뜀(세션은 계속)" >&2
  fi
fi

# 2. rules — copy plugin rules to $HOME/.claude/rules/ if missing
if [ -d "$RULES_SRC" ]; then
  for src_file in "$RULES_SRC"/*.md; do
    [ -f "$src_file" ] || continue
    # 외부 명령(basename) 대신 파라미터 확장 — 실패할 수 있는 명령치환이 하나라도
    # 남으면 ERR 트랩이 거기서 스크립트를 끝낸다(cr-final LOW: 6블록 중 유일한 무가드 지점).
    fname="${src_file##*/}"
    dst_file="$RULES_DST/$fname"
    if [ ! -f "$dst_file" ]; then
      # `[ ! -f ]` 가드 = 사용자가 고친 rules 를 덮어쓰지 않는다(최초 설치 시에만 복사).
      if mkdir -p "$RULES_DST" 2>/dev/null && cp "$src_file" "$dst_file" 2>/dev/null; then
        echo "[forge-onboard] rules installed: $fname" >&2
      fi
    fi
  done
fi

# 3. plugin data dir — ensure writable persistent dir exists
mkdir -p "$PLUGIN_DATA" 2>/dev/null || true

# 4. session management dirs — handover + checkpoints
SESSION_DIRS=(
  "$HOME/.claude/handover/sonnet"
  "$HOME/.claude/handover/opus"
  "$HOME/.claude/checkpoints"
)
for dir in "${SESSION_DIRS[@]}"; do
  if [ ! -d "$dir" ]; then
    if mkdir -p "$dir" 2>/dev/null; then
      echo "[forge-onboard] session dir created: $dir" >&2
    fi
  fi
done

# 5. (제거 2026-07-26 v0.7.0) handover-manager.sh 설치 블록 삭제
# — /forge-start·/forge-end 통합(upstream)으로 커맨드의 handover-manager 참조가 0이 됨.
#   dead bundle 유지는 dangling의 역방향 부채(onboard.test가 적발). 신규 의존
#   (session-recall.sh 등)은 forge 체크아웃이 소유 — 플러그인 번들 안 함(드리프트 방지).

# 6. bundled skill scripts — self-install if missing (plugin self-containment)
# commands/skills invoke these via $HOME/.claude/skills/... (Bash tool has no
# CLAUDE_PLUGIN_ROOT access outside hook processes), but marketplace-only installs
# only bundle them under ${CLAUDE_PLUGIN_ROOT}/skills/... — copy them out so
# /cr-multi, /cr-triple, /approve-worker work post-install.
SKILL_SCRIPT_SRCS=(
  "${CLAUDE_PLUGIN_ROOT}/skills/cr-multi/workflow.js"
  "${CLAUDE_PLUGIN_ROOT}/skills/approve-worker/scripts/approve-worker-sign.py"
  "${CLAUDE_PLUGIN_ROOT}/skills/approve-worker/scripts/approve-worker-verify.py"
)
SKILL_SCRIPT_DSTS=(
  "$HOME/.claude/skills/cr-multi/workflow.js"
  "$HOME/.claude/skills/approve-worker/scripts/approve-worker-sign.py"
  "$HOME/.claude/skills/approve-worker/scripts/approve-worker-verify.py"
)
for i in "${!SKILL_SCRIPT_SRCS[@]}"; do
  src="${SKILL_SCRIPT_SRCS[$i]}"
  dst="${SKILL_SCRIPT_DSTS[$i]}"
  if [ -f "$src" ] && [ ! -f "$dst" ]; then
    if mkdir -p "$(dirname "$dst")" 2>/dev/null && cp "$src" "$dst" 2>/dev/null; then
      echo "[forge-onboard] skill script installed: $dst" >&2
    fi
  fi
done

# 7. 설치본 ↔ 마켓플레이스 버전 대조 (갭 G4, 2026-08-20)
# 왜: 전파는 3층이다 — ①repo ②마켓플레이스 클론 ③설치 캐시. ①②는 명령 한 줄로 확인되는데
#   ③은 `/plugin` **사람 조작**이라 자동 확인 지점이 없다. 그래서 밀려 있어도 아무 신호가 없다.
#   실측(2026-08-20): 설치본이 클론보다 **7~10 패치** 뒤처진 채 약 3주 방치돼 있었고,
#   그동안 1·2층만 밀어 놓고 "배포 완료"로 읽혔다.
#   **택배가 문 앞까지 왔는데 아무도 안 들여놓았고, 안 들여놨다고 알려주는 사람도 없는 상태**였다.
# 설계: 둘 다 **로컬 파일**이라 네트워크가 필요 없다. AD-168 대로 **WARN 만** — 차단하지 않는다.
#   python3 가 없거나 파일이 없으면 조용히 넘어간다(fail-open).
_INST="$HOME/.claude/plugins/installed_plugins.json"
_MKT="$HOME/.claude/plugins/marketplaces/forge-plugins"
_SET="$HOME/.claude/settings.json"
if command -v python3 >/dev/null 2>&1 && [ -f "$_INST" ] && [ -d "$_MKT" ]; then
  python3 - "$_INST" "$_MKT" "$_SET" >&2 <<'PYEOF' || true
import json, os, sys

inst_path, mkt = sys.argv[1], sys.argv[2]
set_path = sys.argv[3] if len(sys.argv) > 3 else ""


def disabled_set(path):
    """`enabledPlugins` 에서 **명시적으로 false** 인 것만 모은다.

    ⚠️ 왜 '명시적 false' 만인가: 키가 아예 없는 것은 "꺼둔 것"이 아니라 "아직 안 만진 것"이다.
       모르는 것을 껐다고 단정하면 진짜 뒤처짐을 놓친다 — 조용해지는 쪽으로만 고치면
       경보가 아니라 장식이 된다.
    """
    try:
        with open(path, encoding="utf-8") as f:
            ep = (json.load(f) or {}).get("enabledPlugins") or {}
    except Exception:
        return set()          # 못 읽으면 아무것도 끄지 않는다(알리는 쪽이 안전)
    return {k for k, v in ep.items() if v is False}


OFF = disabled_set(set_path)


def parts(v):
    """'0.7.10' -> (0,7,10). **순수 숫자 점표기만** 판정한다. 그 밖은 None.

    ⚠️ 처음엔 숫자가 아닌 조각을 -1 로 뒀는데, 자체 탐침에서 **오탐 5건**이 나왔다:
       '0.7' vs '0.7.0'(같은 버전인데 뒤처짐) · 'unknown' · '1.0.0-rc1' · '0.7.10+build'.
       경보가 한 번 거짓이면 사람은 다음부터 안 읽는다 — 이 훅이 막으려는 병이 바로 그거다.
       그래서 **판정 불가는 뒤처짐이 아니다**: 애매하면 조용히 넘어간다(오탐 0 우선).
    """
    ss = str(v).strip()
    if not ss:
        return None
    out = []
    for x in ss.split("."):
        if not x.isdigit():
            return None
        out.append(int(x))
    return tuple(out)


def behind_of(cur, latest):
    """cur 가 latest 보다 낮은가. 판정 불가면 False(경보 안 함)."""
    a, b = parts(cur), parts(latest)
    if a is None or b is None:
        return False
    n = max(len(a), len(b))          # '0.7' 과 '0.7.0' 을 같게 본다
    a += (0,) * (n - len(a))
    b += (0,) * (n - len(b))
    return a < b


try:
    with open(inst_path, encoding="utf-8") as f:
        data = json.load(f)
except Exception:
    sys.exit(0)

behind = []
for key, entries in (data.get("plugins") or {}).items():
    if not key.endswith("@forge-plugins"):
        continue
    if key in OFF:
        # 일부러 꺼둔 플러그인은 뒤처져도 문제가 아니다. SSoT 머신은 플러그인을 끄고
        # standalone 미러를 정본으로 쓴다(둘 다 켜면 double-load) — 문서화된 구성이다.
        continue
    name = key.split("@", 1)[0]
    mf = os.path.join(mkt, name, ".claude-plugin", "plugin.json")
    if not os.path.isfile(mf):
        continue
    try:
        with open(mf, encoding="utf-8") as f:
            latest = json.load(f).get("version")
    except Exception:
        continue
    # 여러 항목(scope 별)이 있으면 **판정 가능한 것 중 최신**을 설치본으로 본다.
    cands = [e.get("version") for e in entries if parts(e.get("version")) is not None]
    if not cands or parts(latest) is None:
        continue                      # 판정 불가 — 조용히 넘어간다
    cur = max(cands, key=parts)
    if behind_of(cur, latest):
        behind.append(f"{name} {cur}→{latest}")

if behind:
    print(f"[forge-onboard] ⚠️ 플러그인 설치본이 뒤처져 있습니다 ({len(behind)}종): "
          + " · ".join(sorted(behind)))
    print("[forge-onboard]    `/plugin` 으로 갱신하세요 — 지금 로드되는 것은 옛 버전입니다.")
PYEOF
fi

exit 0
