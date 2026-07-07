#!/usr/bin/env bash
# Forge 플러그인 통합 마이그레이션 (9종 → 4종 + game)
# 기존 설치자용: 구 플러그인 전부 제거 → 마켓 캐시 갱신 → 새 4종 설치
# 실행: bash migrate-to-4.sh   (또는 아래 명령을 수동 복사)
set -u

MARKET="forge-plugins"

# 1) 구 forge 플러그인 제거 (forge-game 은 건드리지 않음 — 사용자 유지)
OLD="forge-core forge-brain forge-harness forge-audit forge-research forge-plan forge-dev forge-design"
echo "▶ 1/3 구 플러그인 제거"
for p in $OLD; do
  echo "  - uninstall $p"
  claude plugin uninstall "$p" 2>/dev/null || true
done

# 2) 마켓플레이스 캐시 갱신 (재구성된 marketplace.json 반영 — 필수)
echo "▶ 2/3 마켓플레이스 캐시 갱신"
claude plugin marketplace update "$MARKET"

# 3) 새 4종 설치
NEW="forge-core forge-knowledge forge-build forge-design"
echo "▶ 3/3 새 4종 설치"
for p in $NEW; do
  echo "  - install $p@$MARKET"
  claude plugin install "$p@$MARKET"
done

echo "✅ 완료. 설치 확인:  claude plugin list"
