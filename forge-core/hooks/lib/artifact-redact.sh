#!/bin/bash
# .claude/hooks/lib/artifact-redact.sh — QA 아티팩트 로그 파일의 이메일·토큰 가리기 (#1139 C046)
#
# 무엇: qa-artifact-backend.sh(H3) 와 qa-artifact-frontend.sh(H2) 가 똑같이 복사해 두던 마스킹 블록.
#   한쪽만 고치면 백엔드 로그와 프런트 로그의 가리는 규칙이 갈린다(drift) — 그래서 한 곳에 둔다.
# 규칙(로그 파일용): 이메일 → `[REDACTED_EMAIL]` · `token|api_key|secret|password` 뒤 값 → `\1=[REDACTED_TOKEN]`.
#   ⚠️ `lib/mask-secrets.{sh,py}` 와 **다른 규칙**이다(그쪽 = 명령 원문용 `***`·이메일 미마스킹·`$VAR` 보존). 합치지 마라 —
#   합치면 한쪽 출력이 바뀐다.
# 쓰는 법: 훅이 **자기 위치를 절대경로로 푼 뒤** source 하고 `declare -F artifact_redact_file` 로 정의를 확인한 다음
#   `artifact_redact_file <파일>` 을 부른다. 파일을 제자리에서 고쳐 쓴다.
#   자기 위치 해석은 lib 으로 뺄 수 없다(source 되기 전엔 lib 이 어디 있는지 모른다) — 호출부 관용구가 정본이다
#   (`lib/tool-response.sh` 머리말과 같은 관용구 — 단 두 훅은 `set -euo pipefail` 이라 `${BASH_SOURCE[0]-}` 와
#   lib 경로 대입 뒤 `|| true` 가 필요하다. 빼면 `bash -c` 실행·lib/ 폴더 부재에서 훅이 rc 1 로 죽는다): `readlink -f` 가 **절대경로 실존 파일**일 때만
#   그 옆 `lib/` 를 `cd -P`·`pwd -P` 로 잡는다. 못 잡거나 lib 이 없음·깨짐·함수 미정의면 호출부는 가리기를 건너뛰고
#   **"redact 완료" 를 찍지 않고** stderr 경고 1줄 + exit 0(비차단 — AD-168). `dirname ""` = `.` 이라 대충 풀면
#   **작업 폴더의 가짜 lib** 를 source 한다(#1250 R1-1 과 같은 함정).
# 신뢰 경계: 이 관용구가 막는 것은 **CWD·인자·BASH_SOURCE 빈 값·심볼릭 링크 경로**다. 환경변수·PATH·**exported bash function**
#   (`export -f readlink`·`export -f declare` 등)은 신뢰 경계 **안**으로 본다 — 기존에도 PATH 의 `python3` 를 바꿔치기하면 같은 일이
#   되므로 같은 급이다. exported function 주입(가짜 경로를 내는 readlink 로 옆 가짜 lib 를 source·`declare -F` 속이기)은 **막지 않는다**.
#   코드 방어(`builtin`·`command` 강제)는 5/5c `lib/tool-response.sh` 관용구와 갈리므로 이번에 하지 않았다 — 후속(#1321 검수 S14)으로 남긴다.
# 계약: 항상 0 을 돌려준다(호출부도 `|| true` 로 받는다 — lib 이 계약을 어겨도 훅은 rc 0, AD-168) — 파이썬 실패(python3 부재·UTF-8 아닌 파일·쓰기 불가)는 삼키고 파일은 원문 그대로 남는다.
#   이것은 분리 전 인라인 코드의 동작을 **그대로** 옮긴 것이다(`2>/dev/null || true`).
# ⚠️ 이 방어가 무력화되는 입력: UTF-8 이 아닌 로그 파일 — 파이썬이 읽다 실패해 **아무것도 가리지 않고** 조용히 넘어가며,
#   호출부는 여전히 "redact 완료" 를 찍는다(기존 약점 — 이 lib 분리 범위 밖, #1139 5/5d 보고에 적었다).
# 폐기조건: 두 훅이 하나로 합쳐지거나 QA 아티팩트 마스킹이 다른 도구로 옮겨지면 이 lib 을 지운다.
artifact_redact_file() {
    python3 -c "
import re, sys
content = open(sys.argv[1]).read()
content = re.sub(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', '[REDACTED_EMAIL]', content)
content = re.sub(r'(?i)(token|api_key|secret|password)[\"\':\s=]+[^\s\"\']+', r'\1=[REDACTED_TOKEN]', content)
open(sys.argv[1], 'w').write(content)
" "$1" 2>/dev/null || true
    return 0
}
