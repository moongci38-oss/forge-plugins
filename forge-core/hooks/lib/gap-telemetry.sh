#!/usr/bin/env bash
# lib/gap-telemetry.sh — 하네스 갭 후보 텔레메트리 공용 헬퍼 (W10, 2026-08-10)
#
# source "$(dirname "${BASH_SOURCE[0]}")/lib/gap-telemetry.sh" 2>/dev/null || true
# 사용: type gap_log >/dev/null 2>&1 && gap_log <event> <hook> <reason> [checks] [file] || true
#   event = BLOCK | WARN | BYPASS
#   hook  = 호출 훅 이름(파일명 stem)
#   reason = 사유(내부에서 80**문자**로 truncate, 바이트 아님 — 명령 원문·파일 내용·경로 전체는
#            호출부가 절대 넘기지 않는다)
#   checks = (선택) 쉼표로 이은 check_id 목록 — 있으면 `"checks":[...]` 배열로 실린다.
#            표본을 사유 문자열이 아니라 id 축으로 집계하기 위한 것이다(subagent-brief-lint 용).
#            빈 문자열·미전달이면 키 자체를 넣지 않는다(기존 소비자 스키마 무변경).
#   file = (선택, W2-J 2026-08-15 — 2026-08-11/08-12 리포트의 `file: null` 진단불가 갭 봉합)
#          트리거를 특정할 최소 식별자(파일 경로 또는 트리거 요약 문자열). reason과 동일하게
#          80문자 truncate. 빈 문자열·미전달이면 기존 그대로 `"file": null`(4-인자 호출부
#          전원 하위호환 — 스키마 무변경).
#
# 새 jsonl 을 만들지 않는다 — 기존 hook-fp-telemetry.jsonl(secret-content-scan·subagent-brief-lint
# 가 이미 event="WARN" 으로 쓰고 있던 파일)에 이어 쓴다. 스키마를 그 두 소비자와 호환되게 고정한다:
#   {"ts","hook","event","file":null|string,"reason","id"} — file 은 5번째 인자 미전달 시 null
# id = "<hook>-<epoch-nanoseconds>" — DISPOSED 이벤트({"event":"DISPOSED","id":...})가 이 id 를
# 참조해 "이미 처분됨"을 표시한다(warn-digest.py 가 그 매칭을 한다 — 이 헬퍼의 책임 밖).
#
# G-14 (2026-08-10, cr-final 재현·HIGH 2/MED 1 — bash printf/sed 수기 JSON 조립 결함 3건 수정):
#   ① hook/event 필드가 이스케이프를 안 거쳐 `hook` 인자에 `","event":"DISPOSED"` 를 넣으면
#      DISPOSED 이벤트를 위조할 수 있었다(재현: event 가 실제로 DISPOSED 로 파싱됨).
#   ② `tr '\n\r'` 만 개행을 치환해 탭 등 다른 제어문자(U+0000~U+001F)가 원시 바이트로 남아
#      무효 JSON 이 됐다(재현: 탭 포함 reason → `Invalid control character`).
#   ③ `cut -c1-80` 이 이 환경(LC_CTYPE 미설정)에서 **바이트 단위**로 잘라 멀티바이트 UTF-8
#      문자 중간을 끊었다(재현: 한글 40자 → 깨진 바이트로 저장, 이 코드베이스 reason 은 전부
#      한글이라 80바이트=약 26자에서 상시 재발 가능한 시한폭탄이었다).
#   → 손으로 조립하지 않고 **직렬화를 python3 의 json.dumps 에 전량 위임**한다(제어문자 이스케이프·
#     따옴표 이스케이프·UTF-8 전부 정확). 값은 **환경변수로만** 전달한다(python 소스에 문자열
#     보간 금지 — 인젝션 재발 방지, settings-json-lock BYPASS 로깅 지적과 동일 원칙). 문자 단위
#     truncate 는 파이썬 문자열 슬라이싱(`[:80]`)이 코드포인트 기준이라 바이트 절단이 없다.
#     jq 를 쓰지 않는 이유는 'jq 가 없어서'가 아니다 — 실측(2026-08-10): develop 훅 31개
#     파일이 여전히 jq 를 쓴다. PR #217 은 jq 의존을 **전역 제거한 게 아니라 특정 지점을
#     python3 로 옮긴 것**이고, PR #220 이 그 서술을 정정했다(파서 SPOF 이중화·가시화).
#     여기서 python3 를 고른 진짜 이유는 `json.dumps` 가 이스케이프·제어문자·UTF-8 을
#     한 번에 정확히 처리하고 슬라이싱이 코드포인트 단위이기 때문이다.
#     ⚠️ 대가: python3 가 없는 런타임(Windows Git Bash)에서는 이 계측이 조용히 남지 않는다.
#     기록 실패는 fail-open 이라 훅 동작에는 영향이 없지만 **텔레메트리에 구멍이 생긴다** —
#     그 환경 판별은 python3-availability-guard.sh(PR #220)가 SessionStart 에서 알린다.
#     재현: git grep -l 'jq ' origin/develop -- '.claude/hooks/*.sh' | wc -l  → 31
#
# fail-open 절대 준수(설계 제약): 이 훅 라이브러리를 쓰는 호출부는 대부분 `set -euo pipefail` 이다.
#   내부에서 어떤 명령이 실패해도 훅 자체의 exit code·동작에 영향을 주면 안 된다 — 그래서
#   전체를 서브셸로 감싸고 항상 `|| true` 로 끝맺는다. 호출부도 반드시
#   `type gap_log >/dev/null 2>&1 && gap_log ... || true` 형태로 불러야 한다(정의 자체가 실패해
#   `command not found`(exit 127)가 나는 경우까지 `set -e` 로부터 방어하기 위함 — gap_log 함수
#   내부의 안전장치만으로는 "소싱 자체가 실패해 함수가 없는" 경우를 못 막는다).
#
# ⚠️ 이 방어(텔레메트리 자체)가 무력화되는 입력: FORGE_OUTPUTS 디렉토리가 쓰기 불가(권한 없음)면
#   mkdir -p 가 조용히 실패하고 이 호출은 아무 것도 기록하지 않는다 — 그래도 항상 exit 0(fail-open).
#   python3 부재 시에도 마찬가지로 조용히 skip(fail-open, 아래 `2>/dev/null` 이 흡수).

gap_log() {
  (
    set +e
    # 테스트 실행 중 기록 끄기(2026-09-17 갭 hook-tests-pollute-real-telemetry): 훅 테스트가 훅을 직접
    # 부르면 실제 텔레메트리에 가짜 WARN/BLOCK 이 쌓였다(route-warn 테스트 1회 = +10줄 실측).
    # 테스트 러너(pre-commit-test·local-ci·cr-machine-checks)가 이 값을 export 한다.
    # ⚠️ 무력화되는 입력: 사람이 테스트 파일을 러너 없이 `bash x.test.sh` 로 직접 돌리면 여전히 기록된다.
    # BYPASS 는 끄지 않는다 — 우회 사용 기록이 이 스위치 하나로 사라지면 우회 흔적 숨기기 경로가 된다(보안 부록 3).
    [ "${FORGE_GAP_TELEMETRY:-on}" = "off" ] && [ "${1:-BLOCK}" != "BYPASS" ] && exit 0
    event="${1:-BLOCK}"
    hook="${2:-unknown}"
    reason="${3:-}"
    checks="${4:-}"
    file="${5:-}"
    audit_dir="${FORGE_OUTPUTS:-$HOME/forge-outputs}/.claude/audit"
    # 실존 확인을 mkdir 보다 먼저 한다(2026-08-17 갭 ②): Windows Git Bash 의 mkdir -p 는
    # UNC 경로(//wsl.localhost/...)에서 대상이 실존해도 루트 세그먼트 EROFS 로 exit 1 을 내
    # 이 함수 전체가 조용히 소멸했다. ⚠️ 이 방어가 무력화되는 입력: 디렉토리가 실제로 없는
    # UNC 경로 — mkdir 가 여전히 실패해 기록이 안 남는다(그 경우는 종전과 동일한 fail-open).
    [ -d "$audit_dir" ] || mkdir -p "$audit_dir" 2>/dev/null || exit 0
    ts=$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null) || exit 0
    nonce=$(date -u +%s%N 2>/dev/null) || nonce=$(date -u +%s 2>/dev/null) || nonce="0"
    GAP_TS="$ts" GAP_HOOK="$hook" GAP_EVENT="$event" GAP_REASON="$reason" GAP_NONCE="$nonce" \
    GAP_CHECKS="$checks" GAP_FILE="$file" \
      python3 - >> "$audit_dir/hook-fp-telemetry.jsonl" 2>/dev/null <<'PY'
import json, os
hook = os.environ.get("GAP_HOOK", "unknown")
nonce = os.environ.get("GAP_NONCE", "0")
# 모든 공백류(스페이스·탭·개행·CR 등)를 단일 스페이스로 정규화 후 문자(코드포인트) 단위로 자른다
# — 바이트 단위 truncate 는 멀티바이트 UTF-8(한글 등)을 깬다(G-14 ③).
reason = " ".join(os.environ.get("GAP_REASON", "").split())[:80]
_file_raw = os.environ.get("GAP_FILE", "")
# cr-final pr267-chunk3(2026-08-15 MEDIUM): 경로 원문에는 사용자명($HOME 접두)이 실린다 —
# truncate 는 길이 제한이지 비식별화가 아니다. 홈 접두를 ~ 로 치환해 식별 정보를 걷어내되
# 트리아지에 필요한 레포 내 상대 위치는 남긴다. ⚠️ 이 마스킹이 무력화되는 입력: 홈 밖 경로에
# 박힌 사용자명(/mnt/c/Users/<name> 등)은 못 걷어낸다 — 그 경로를 쓰는 훅이 스스로 줄여 보낼 것.
# cr-final pr267-fixes1(LOW/MEDIUM 3레그 합류): 경계 없는 startswith 는 형제 디렉터리
# (/home/damools2/...)를 ~2/... 로 오치환한다 — 정확 일치 또는 구분자 경계까지 요구한다.
_home = os.path.expanduser("~")
if _home and _home != "~" and (_file_raw == _home or _file_raw.startswith(_home + os.sep)):
    _file_raw = "~" + _file_raw[len(_home):]
file_field = " ".join(_file_raw.split())[:80] if _file_raw.strip() else None
rec = {
    "ts": os.environ.get("GAP_TS", ""),
    "hook": hook,
    "event": os.environ.get("GAP_EVENT", "BLOCK"),
    "file": file_field,
    "reason": reason,
    "id": f"{hook}-{nonce}",
}
# checks 는 선택 필드다 — 값이 있을 때만 키를 만든다. 빈 값에 `[""]` 를 넣으면 집계에서
# 빈 문자열 check_id 가 1건으로 세어져 분모를 오염시킨다(그래서 filter 를 건다).
_checks = [c for c in os.environ.get("GAP_CHECKS", "").split(",") if c.strip()]
if _checks:
    rec["checks"] = _checks
# json.dumps 가 따옴표·백슬래시·제어문자를 전부 정확히 이스케이프한다 — hook/event 에 어떤
# 값이 들어와도 JSON 문자열 컨텍스트를 벗어날 수 없다(G-14 ① 위조 경로 차단).
print(json.dumps(rec, ensure_ascii=False))
PY
    exit 0
  ) || true
}
