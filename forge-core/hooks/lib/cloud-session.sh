# cloud-session.sh — 웹 클라우드 세션(claude.ai/code · Anthropic 클라우드 컨테이너) 판정 1곳 (#3613)
#
# 쉽게 말하면: 클라우드 세션은 일회용 컨테이너라 이 PC 의 다른 세션·미러·로컬 설정을 망칠 수 없다.
#   그런데 PC 기준으로 만든 가드(다른 세션의 미커밋 보호 · 훅 파일 보호 · settings 잠금)가 그대로 돌아 작업이 멈췄다
#   (2026-10-24 실측 — 이슈 #3613 표). 사람 결정(2026-10-24): "웹 cloud session 에서 작업 진행하는 건 hook 으로 막지 마".
# 쓰는 곳: 등록 정본 `shared/config/forge-hooks.tsv` 의 `cloud_skip` 줄에 적힌 훅만(그 목록이 정본 — 시험이 대조).
#   원격·외부에 피해가 남는 가드(비밀값 · force push · main 쓰기 · 공급망 · 외부 입력 주입 · DB 파괴 · 루트 삭제)는 여기 쓰지 않는다.
# 판정: 하네스가 넣는 환경변수 둘이 다 있으면 클라우드 — `CLAUDE_CODE_REMOTE_SESSION_ID` · `CLAUDE_CODE_REMOTE_ENVIRONMENT_TYPE`.
# 사람용 스위치: `FORGE_CLOUD_HOOK_SKIP=off` 면 클라우드여도 건너뛰지 않는다(종전대로 막는다).
# ⚠️ 무력화되는 입력: 로컬 PC 에서 두 환경변수를 손으로 넣으면 로컬도 클라우드로 본다 — 이 가드들은 원래 실수 방지선이다(보안 통제 아님).
# 재현: bash shared/scripts/tests/cloud-session-hooks.test.sh

forge_cloud_session() {
  [ "${FORGE_CLOUD_HOOK_SKIP:-on}" != off ] \
    && [ -n "${CLAUDE_CODE_REMOTE_SESSION_ID:-}" ] \
    && [ -n "${CLAUDE_CODE_REMOTE_ENVIRONMENT_TYPE:-}" ]
}
