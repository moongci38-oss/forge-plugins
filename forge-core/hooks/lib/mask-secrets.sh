#!/bin/bash
# .claude/hooks/lib/mask-secrets.sh
# 감사 로그에 명령 원문을 남기는 훅이 source 해서 쓰는 마스킹 래퍼.
# 실제 규칙은 같은 디렉터리의 mask-secrets.py 가 소유한다(§계약·근거·폐기조건은 그 파일 상단).
#
# fail-CLOSED: 마스커를 못 부르면 원문을 흘리지 않고 자리표시자를 반환한다.
#   (무블로킹 fail-open 은 "차단하지 말라"는 뜻이지 "평문을 남기라"는 뜻이 아니다)
#
# ⚠️ 이 파일은 `set -e` 가 걸린 훅에서 source 된다 — 여기의 어떤 실패도 훅을 죽이면 안 된다.
#    조건문·`|| true` 로 감싸 둔 이유가 그것이다(무블로킹 4원칙 ③ fail-open).

if [ -n "${_FORGE_MASK_SECRETS_LOADED:-}" ]; then
  return 0
fi
_FORGE_MASK_SECRETS_LOADED=1

_FORGE_MASK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-.}")" 2>/dev/null && pwd)" || _FORGE_MASK_DIR=""
_FORGE_MASK_PY="${_FORGE_MASK_DIR}/mask-secrets.py"

# mask_secrets "<text>" → 마스킹된 텍스트를 stdout 으로
mask_secrets() {
  local _text="${1-}"
  [ -z "$_text" ] && return 0

  if [ ! -f "$_FORGE_MASK_PY" ]; then
    printf '<mask-unavailable>'
    return 0
  fi

  local _out=""
  if _out=$(printf '%s' "$_text" | python3 "$_FORGE_MASK_PY" 2>/dev/null); then
    printf '%s' "$_out"
  else
    printf '<mask-error>'
  fi
  return 0
}
