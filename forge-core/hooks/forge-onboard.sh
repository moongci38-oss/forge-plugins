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
# SessionStart 훅이 사용자 세션 시작을 방해해선 안 되므로, 실패해도 남은 단계를
# 진행하고 항상 exit 0 한다(초기화 1건 실패 > 세션 블로킹).
set -uo pipefail
trap 'exit 0' ERR

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
      mkdir -p "$RULES_DST"
      cp "$src_file" "$dst_file"
      echo "[forge-onboard] rules installed: $fname" >&2
    fi
  done
fi

# 3. plugin data dir — ensure writable persistent dir exists
mkdir -p "$PLUGIN_DATA"

# 4. session management dirs — handover + checkpoints
SESSION_DIRS=(
  "$HOME/.claude/handover/sonnet"
  "$HOME/.claude/handover/opus"
  "$HOME/.claude/checkpoints"
)
for dir in "${SESSION_DIRS[@]}"; do
  if [ ! -d "$dir" ]; then
    mkdir -p "$dir"
    echo "[forge-onboard] session dir created: $dir" >&2
  fi
done

# 5. handover-manager.sh — install if missing
HM_SRC="${CLAUDE_PLUGIN_ROOT}/hooks/handover-manager.sh"
HM_DST="$HOME/.claude/scripts/handover-manager.sh"
if [ -f "$HM_SRC" ] && [ ! -f "$HM_DST" ]; then
  mkdir -p "$(dirname "$HM_DST")"
  cp "$HM_SRC" "$HM_DST"
  chmod +x "$HM_DST"
  echo "[forge-onboard] handover-manager.sh installed: $HM_DST" >&2
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
    mkdir -p "$(dirname "$dst")"
    cp "$src" "$dst"
    echo "[forge-onboard] skill script installed: $dst" >&2
  fi
done

exit 0
