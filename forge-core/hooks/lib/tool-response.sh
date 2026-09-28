#!/bin/bash
# .claude/hooks/lib/tool-response.sh — PostToolUse 페이로드의 tool_response 해석 (#1139 C038)
#
# 무엇: log-tool-metrics.sh 와 post-tool-use-offload.sh 가 똑같이 복사해 두던 필드 해석 + 종료코드 부재 root-cause.
#   한쪽만 고치면 두 기록(tool-metrics.jsonl · offload/index.jsonl)의 "실패" 뜻이 갈린다(drift) — 그래서 한 곳에 둔다.
# 쓰는 법: 훅이 **자기 위치를 절대경로로 푼 뒤** source 하고 `hook_parse_tool_response "$INPUT"` 를 부른다.
#   호출자 전역을 채운다: TOOL_NAME · EXIT_CODE · STDERR_LEN · INTERRUPTED · OUTPUT · OUTPUT_LEN
#   자기 위치 해석은 lib 으로 뺄 수 없다(source 되기 전엔 lib 이 어디 있는지 모른다) — 호출부의 4줄 관용구가 정본이다:
#     `readlink -f "${BASH_SOURCE[0]}"` 가 **절대경로 실존 파일**일 때만 그 옆 `lib/` 를 `cd -P`·`pwd -P` 로 물리 경로로 잡고,
#     아니면(stdin·`bash -c` 실행 · readlink 부재) lib 을 찾지 않고 **exit 0**(훅 원래의 비차단 통과 — AD-168).
#     `dirname ""` = `.` 이라 대충 풀면 **작업 폴더의 가짜 lib** 를 source 한다(#1250 R1-1 과 같은 함정).
# ⚠️ 이 방어가 무력화되는 입력: jq 가 없는 런타임 — 모든 값이 빈 문자열/기본값이 된다(종전 인라인 코드와 같은 동작이다).
# 폐기조건: 두 훅이 하나로 합쳐지거나 Claude Code 가 tool_response 에 종료코드를 싣게 되면 이 lib 을 다시 본다.

# root-cause (2026-08-03 실측): PostToolUse 페이로드의 `tool_response` 에는
# **exit code 필드가 아예 없다.** Bash 도구 실측 shape:
#   {"stdout":"...", "stderr":"...", "interrupted":false, "isImage":false, "noOutputExpected":false}
# 따라서 `.tool_response.exit_code // 0` 은 "잘못된 필드명"이 아니라 **없는 필드**를 읽고
# 기본값 0(=성공)으로 떨어진다 — 계측기가 실패를 성공으로 조작해 왔다.
# 실측 증거: execution.jsonl 36세션 3,958건 **전부 exit:0**, errors.jsonl 전 세션 **0개**.
# 재현: `bash -c 'exit 9'` 실행 후 tool-metrics 최신 행 확인 → exit:"0".
# → 없는 값을 0으로 위조하지 않는다. 관측 가능한 신호(stderr 유무 / interrupted)만 기록하고
#   exit 는 `unavailable` 로 남긴다(측정 못 한 것을 성공으로도 실패로도 집계하지 않는다 —
#   qa-post-merge-canary INCONCLUSIVE · forge-deploy 헬스 미측정과 같은 사상).
hook_parse_tool_response() {
  local _in="${1-}"
  TOOL_NAME=$(echo "$_in" | jq -r '.tool_name // ""' 2>/dev/null)
  EXIT_CODE="unavailable"   # 위 root-cause 참조 — 페이로드에 존재하지 않는다
  STDERR_LEN=$(echo "$_in" | jq -r '.tool_response.stderr // "" | length' 2>/dev/null || echo 0)
  INTERRUPTED=$(echo "$_in" | jq -r '.tool_response.interrupted // false' 2>/dev/null || echo false)
  OUTPUT=$(echo "$_in" | jq -r '.tool_response.output // .tool_response.stdout // ""' 2>/dev/null)
  OUTPUT_LEN=${#OUTPUT}
}
