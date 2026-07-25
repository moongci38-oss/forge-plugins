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
    fname="$(basename "$src_file")"
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

# 5. handover-manager.sh — install if missing
# /end-opus·/end-sonnet·/start-opus 가 $HOME/.claude/scripts/handover-manager.sh 를
# 직접 호출한다 — 이 복사가 없으면 신규 설치에서 세션관리 커맨드가 깨진다
# (cr-final HIGH 2026-07-25: 종전엔 소스가 미번들이라 이 블록이 통째로 no-op 이었다).
HM_SRC="${CLAUDE_PLUGIN_ROOT}/hooks/handover-manager.sh"
HM_DST="$HOME/.claude/scripts/handover-manager.sh"
if [ -f "$HM_SRC" ] && [ ! -f "$HM_DST" ]; then
  if mkdir -p "$(dirname "$HM_DST")" 2>/dev/null && cp "$HM_SRC" "$HM_DST" 2>/dev/null; then
    chmod +x "$HM_DST" 2>/dev/null || true
    echo "[forge-onboard] handover-manager.sh installed: $HM_DST" >&2
  fi
fi

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

exit 0
