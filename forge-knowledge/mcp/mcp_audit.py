#!/usr/bin/env python3
"""
MCP 도구 호출 감사 로그 — forge-tools-server 전용, 기록만 하고 아무것도 막지 않는다.

쉽게 말하면 **창구에 놓는 방문 기록부**다. 누가 와서 무슨 도구를 시켰고 성공했는지만 한 줄씩 적는다.
장부를 못 적는다고 손님을 돌려보내지는 않는다(fail-open).

근거: 2026-08-27 실측 — forge-tools-server 의 @mcp.tool() 17개가 전량 무기록이고,
      로컬 훅 로그(~/.claude/tool-metrics.jsonl)에는 mcp__ 호출이 0건이다(1,178,759행 중).
      게다가 이 서버의 존재 이유인 cloudflared 터널 레인(forge-mcp-service.sh)은
      로컬 훅이 구조적으로 볼 수 없는 경로라, 훅 matcher 추가로는 덮이지 않는다.
폐기조건: Claude Code 런타임이 MCP 호출을 자체 기록하고 그 기록이 클라우드(터널) 레인까지
      덮는 것이 실측되면 이 모듈과 서버 배선 3곳을 삭제한다.

무력화되는 입력(알고 쓰는 한계):
  - 라벨 없는 평문 시크릿은 마스킹되지 않는다. secret_mask 는 알려진 형식만 덮는다.
    그래서 로그 파일은 chmod 600 + .gitignore 가 2차 방어선이고, 인자에 시크릿을
    넣지 않는 것이 1차다.
  - 서버가 안 떠 있으면 0건이다. 빈 로그를 "호출이 없었다"로 읽으면 안 된다 — 측정 불가다.
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

HOME = Path.home()
FORGE_ROOT = Path(os.environ.get("FORGE_ROOT", HOME / "forge"))
FORGE_OUTPUTS = Path(os.environ.get("FORGE_OUTPUTS", HOME / "forge-outputs"))

AUDIT_LOG = Path(
    os.environ.get("FORGE_MCP_AUDIT_LOG")
    or (FORGE_OUTPUTS / ".claude/audit/mcp-tool-calls.jsonl")
)

# 회전 임계값 — 1세대만 남긴다. 2세대 이상 보존은 '무한 증가'의 다른 이름이다.
MAX_BYTES = int(os.environ.get("FORGE_MCP_AUDIT_MAX_BYTES", 5 * 1024 * 1024))

_ARG_MAX = 512   # 인자 1개당 기록 상한
_ERR_MAX = 200   # 예외 문자열 기록 상한

# 마스킹은 새로 짜지 않는다 — shared/scripts/secret_mask.py 가 정본이다(재사용 사다리 ②).
# 그 파일이 존재하는 이유 자체가 "서버가 축소판 패턴을 새로 짰다가 걸린 것"이다.
try:
    sys.path.insert(0, str(FORGE_ROOT / "shared/scripts"))
    from secret_mask import mask_secrets  # type: ignore
except Exception:  # pragma: no cover - 마스킹 불가 시 기록 자체를 포기한다(누출보다 낫다)
    mask_secrets = None


def _mask_leaf(value):
    """leaf 값 1개를 마스킹 후 절단. 재귀는 _mask_args 가 한다."""
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, default=str)
    masked = mask_secrets(text) if mask_secrets else "***"
    return masked[:_ARG_MAX]


def _mask_args(obj):
    """dict/list 를 재귀 순회하며 leaf 만 마스킹한다.

    ⚠️ 직렬화 **후** 마스킹하면 안 된다 — mask_secrets 가 닫는 따옴표를 삼켜 JSON 이 깨진다
    (2026-08-27 실측: {"args": ["--***, "plain"]} → json.loads 실패).
    그래서 값별로 먼저 마스킹하고, 그 결과를 마지막에 dumps 한다.
    """
    if isinstance(obj, dict):
        return {str(k): _mask_args(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_mask_args(v) for v in obj]
    return _mask_leaf(obj)


def _rotate_if_needed():
    try:
        if AUDIT_LOG.exists() and AUDIT_LOG.stat().st_size > MAX_BYTES:
            AUDIT_LOG.replace(AUDIT_LOG.with_suffix(".jsonl.1"))
    except Exception:
        pass


def log_call(tool, args=None, ok=True, err=None, dur_ms=None):
    """호출 1건을 1행 JSON 으로 append 한다.

    절대 예외를 밖으로 올리지 않는다 — 이 함수는 17개 도구 전부가 통과하는 지점이라
    여기서 던지면 서버 전체가 같이 죽는다(AD-168 fail-open).
    """
    try:
        record = {
            "ts": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
            "tool": str(tool),
            "args": _mask_args(args or {}),
            "ok": bool(ok),
            "transport": os.environ.get("FORGE_MCP_TRANSPORT", "?"),
        }
        if err is not None:
            record["err"] = _mask_leaf(str(err))[:_ERR_MAX]
        if dur_ms is not None:
            record["dur_ms"] = int(dur_ms)

        AUDIT_LOG.parent.mkdir(parents=True, exist_ok=True)
        _rotate_if_needed()
        with open(AUDIT_LOG, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")
        try:
            os.chmod(AUDIT_LOG, 0o600)
        except Exception:
            pass
    except Exception:
        # 기록 실패는 침묵한다. 도구 호출을 막는 것이 더 비싸다.
        pass
