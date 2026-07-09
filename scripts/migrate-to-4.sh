#!/usr/bin/env bash
# Forge 플러그인 통합 마이그레이션 (9종 → 4종 + game)
# 신규·기존 사용자 모두 커버: 마켓 추가(idempotent) → 구 제거 → 캐시 갱신 → 새 4종 재설치 → 활성화
#
# ⚠️ install ≠ upgrade:
#   `claude plugin install`은 이미 설치된 플러그인에 대해 no-op 이며 버전 핀을 올리지 않는다.
#   따라서 새 4종도 반드시 uninstall → install 순서로 재설치해야 최신 버전이 잡힌다.
#
# 실행: bash migrate-to-4.sh   (또는 아래 명령을 수동 복사)
set -uo pipefail

MARKET="forge-plugins"
REPO="moongci38-oss/forge-plugins"

FAILED=""
fail() { FAILED="$FAILED $1"; }

# 0) 마켓플레이스 추가 — 이미 있으면 무시(신규 사용자 커버, idempotent)
echo "▶ 0/4 마켓플레이스 확인·추가 ($REPO)"
claude plugin marketplace add "$REPO" 2>/dev/null || true

# 1) 구 forge 플러그인 제거 (forge-game 은 건드리지 않음 — 사용자 유지)
#    신규 사용자: 설치된 게 없으면 무해하게 skip
OLD="forge-brain forge-harness forge-audit forge-research forge-plan forge-dev"
echo "▶ 1/4 구 플러그인 제거"
for p in $OLD; do
  echo "  - uninstall $p"
  claude plugin uninstall "$p" 2>/dev/null || true
done

# 2) 마켓플레이스 캐시 갱신 (재구성된 marketplace.json 반영 — 필수)
echo "▶ 2/4 마켓플레이스 캐시 갱신"
if ! claude plugin marketplace update "$MARKET"; then
  echo "❌ 마켓플레이스 캐시 갱신 실패 — 이후 단계는 구 버전을 설치하게 되므로 중단합니다." >&2
  echo "   확인:  claude plugin marketplace list" >&2
  exit 1
fi

# 3) 새 4종 재설치 (uninstall 선행 = 버전 핀 강제 갱신)
NEW="forge-core forge-knowledge forge-build forge-design"
echo "▶ 3/4 새 4종 재설치 (uninstall → install)"
for p in $NEW; do
  echo "  - reinstall $p@$MARKET"
  claude plugin uninstall "$p" 2>/dev/null || true
  if ! claude plugin install "$p@$MARKET"; then
    echo "    ❌ install 실패: $p" >&2
    fail "$p"
  fi
done

# 4) 활성화 (설치 ≠ 활성. 비활성 상태면 커맨드가 로드되지 않음)
echo "▶ 4/4 활성화"
for p in $NEW; do
  case " $FAILED " in
    *" $p "*) echo "  - skip $p (설치 실패)" ;;
    *) claude plugin enable "$p" 2>/dev/null || echo "    ⚠️ enable 실패(무시 가능): $p" >&2 ;;
  esac
done

echo
if [ -n "$FAILED" ]; then
  echo "❌ 일부 플러그인 설치 실패:$FAILED" >&2
  echo "   재시도:  claude plugin install <name>@$MARKET" >&2
  exit 1
fi

echo "✅ 완료. 설치 확인:  claude plugin list"
echo "ℹ️  슬래시 커맨드는 **새 Claude Code 세션**에서 로드됩니다 — 현재 세션을 재시작하세요."
