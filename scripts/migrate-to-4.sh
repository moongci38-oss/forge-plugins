#!/usr/bin/env bash
# Forge 플러그인 통합 마이그레이션 (9종 → 4종 + game)
# 신규·기존 사용자 모두 커버: 사전점검 → 마켓 추가 → 구 제거 → 캐시 갱신 → 새 4종 재설치 → 활성화
#
# ⚠️ install ≠ upgrade:
#   `claude plugin install`은 이미 설치된 플러그인에 대해 no-op 이며 버전 핀을 올리지 않는다.
#   따라서 새 4종도 반드시 uninstall → install 순서로 재설치해야 최신 버전이 잡힌다.
#   uninstall 후 install 이 실패하면 그 플러그인은 미설치 상태로 남는다 — 아래 재시도·복구 안내 참고.
#
# 전체를 main() 으로 감싸고 마지막 줄에서 호출한다.
#   → `curl -fsSL ... | bash` 도중 연결이 끊겨 스크립트가 잘려도,
#     bash 가 잘린 본문을 부분 실행하지 못하게 막는다.
#
# 실행: bash migrate-to-4.sh
set -uo pipefail

MARKET="forge-plugins"
REPO="moongci38-oss/forge-plugins"
OLD="forge-brain forge-harness forge-audit forge-research forge-plan forge-dev"
NEW="forge-core forge-knowledge forge-build forge-design"

main() {
  local failed="" enable_failed="" p

  # 사전 점검 — claude CLI 부재 시 이후 단계가 조용히 실패하므로 즉시 중단
  if ! command -v claude >/dev/null 2>&1; then
    echo "❌ 'claude' CLI 를 찾을 수 없습니다. Claude Code 설치 후 다시 실행하세요." >&2
    return 1
  fi

  # 0) 마켓플레이스 추가 — 이미 있으면 무시(신규 사용자 커버, idempotent)
  echo "▶ 0/4 마켓플레이스 확인·추가 ($REPO)"
  claude plugin marketplace add "$REPO" 2>/dev/null || true

  # 1) 구 forge 플러그인 제거 (forge-game 은 건드리지 않음 — 사용자 유지)
  #    신규 사용자: 설치된 게 없으면 무해하게 skip
  echo "▶ 1/4 구 플러그인 제거"
  for p in $OLD; do
    echo "  - uninstall $p"
    claude plugin uninstall "$p" 2>/dev/null || true
  done

  # 2) 마켓플레이스 캐시 갱신 (재구성된 marketplace.json 반영)
  #    NEW 를 uninstall 하기 "전에" 레지스트리 도달 가능성을 먼저 증명한다 —
  #    실패 시 여기서 멈춰야 사용자의 기존 플러그인이 지워지지 않는다.
  echo "▶ 2/4 마켓플레이스 캐시 갱신"
  if ! claude plugin marketplace update "$MARKET"; then
    echo "❌ 마켓플레이스 캐시 갱신 실패 — 기존 플러그인은 그대로 두고 중단합니다." >&2
    echo "   확인:  claude plugin marketplace list" >&2
    return 1
  fi

  # 3) 새 4종 재설치 (uninstall 선행 = 버전 핀 강제 갱신). install 은 1회 재시도.
  echo "▶ 3/4 새 4종 재설치 (uninstall → install)"
  for p in $NEW; do
    echo "  - reinstall $p@$MARKET"
    claude plugin uninstall "$p" 2>/dev/null || true
    if ! claude plugin install "$p@$MARKET"; then
      echo "    ⚠️ install 실패 — 1회 재시도: $p" >&2
      if ! claude plugin install "$p@$MARKET"; then
        echo "    ❌ install 최종 실패: $p (현재 미설치 상태)" >&2
        failed="$failed $p"
      fi
    fi
  done

  # 4) 활성화 (설치 ≠ 활성. 비활성 상태면 슬래시 커맨드가 로드되지 않음)
  echo "▶ 4/4 활성화"
  for p in $NEW; do
    case " $failed " in
      *" $p "*) echo "  - skip $p (설치 실패)"; continue ;;
    esac
    if ! claude plugin enable "$p" 2>/dev/null; then
      echo "    ❌ enable 실패: $p" >&2
      enable_failed="$enable_failed $p"
    fi
  done

  echo
  if [ -n "$failed" ] || [ -n "$enable_failed" ]; then
    [ -n "$failed" ] && {
      echo "❌ 설치 실패(현재 미설치):$failed" >&2
      echo "   복구:  for p in$failed; do claude plugin install \"\$p@$MARKET\"; done" >&2
    }
    [ -n "$enable_failed" ] && {
      echo "❌ 활성화 실패(설치됐으나 커맨드 미로드):$enable_failed" >&2
      echo "   복구:  for p in$enable_failed; do claude plugin enable \"\$p\"; done" >&2
    }
    return 1
  fi

  echo "✅ 완료. 설치 확인:  claude plugin list"
  echo "ℹ️  슬래시 커맨드는 **새 Claude Code 세션**에서 로드됩니다 — 현재 세션을 재시작하세요."
}

main "$@"
