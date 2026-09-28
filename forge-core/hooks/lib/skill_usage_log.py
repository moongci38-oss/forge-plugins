#!/usr/bin/env python3
"""skill_usage_log.py — 스킬 사용 기록 1줄을 ~/.claude/audit/skill-usage.jsonl 에 덧붙인다 (#1139 C028).

무엇: skill-tool-tracker.py(PreToolUse Skill — LLM 자동 호출)와 skill-usage-tracker.py(UserPromptSubmit — 슬래시)가
  똑같이 복사해 두던 "로그 폴더 준비 → 레코드 조립 → JSONL 한 줄 append → 실패는 삼킴" 블록. 둘이 따로 고치면
  같은 파일에 두 형식이 섞인다(drift) — 그래서 한 곳에 둔다. 두 훅의 차이는 trigger 값("tool_use"|"slash") 하나다.
쓰는 법(훅 쪽): **파일 경로로 직접 로드**한다 — sys.path 검색에 맡기면 lib 이 없을 때 다른 곳의 같은 이름 모듈이 잡힐 수 있다.
    lib = Path(__file__).resolve().parent / "lib" / "skill_usage_log.py"
    spec = importlib.util.spec_from_file_location("skill_usage_log", lib)  # lib.is_file() 확인 뒤
    ...; mod.append_skill_usage(data, skill_name, "tool_use")
  로드에 실패하면 훅은 기록 없이 exit 0 으로 통과한다(AD-168 — 훅은 세션을 막지 않는다).
계약: 돌려주는 값 True = 기록 시도함 · False = 로그 폴더를 못 만들었다(기록 안 함). 어떤 경우에도 예외를 밖으로 내지 않는다.
  레코드 키 순서·형식(ensure_ascii=False, 한 줄)은 분리 전과 바이트 단위로 같다 — 소비처(`skill-usage` 집계)가 이 형식을 읽는다.
⚠️ 이 방어가 무력화되는 입력: HOME 이 쓰기 불가한 환경 — makedirs 가 실패해 조용히 기록 0 이 된다(경고도 없다 — 종전과 같다).
폐기조건: 두 트래커가 하나로 합쳐지거나 스킬 사용 기록이 다른 저장소로 옮겨지면 이 lib 을 지운다.
"""
import json
import os
from datetime import datetime, timezone


def append_skill_usage(data, skill_name, trigger):
    log_dir = os.path.expanduser("~/.claude/audit")
    try:
        os.makedirs(log_dir, exist_ok=True)
    except Exception:
        return False

    log_path = os.path.join(log_dir, "skill-usage.jsonl")

    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "skill": skill_name,
        "trigger": trigger,
        "cwd": data.get("cwd", ""),
        "session_id": data.get("session_id", ""),
    }

    try:
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception:
        pass
    return True
