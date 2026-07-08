#!/usr/bin/env bash
# Forge 플러그인 통합 마이그레이션 (9종 → 4종 + game)
# 신규·기존 사용자 모두 커버: 마켓 추가(idempotent) → 구 제거 → 캐시 갱신 → 새 4종 설치
# 실행: bash migrate-to-4.sh   (또는 아래 명령을 수동 복사)
set -u

MARKET="forge-plugins"
REPO="moongci38-oss/forge-plugins"

# 0) 마켓플레이스 추가 — 이미 있으면 무시(신규 사용자 커버, idempotent)
echo "▶ 0/3 마켓플레이스 확인·추가 ($REPO)"
claude plugin marketplace add "$REPO" 2>/dev/null || true

# 1) 구 forge 플러그인 제거 (forge-game 은 건드리지 않음 — 사용자 유지)
#    신규 사용자: 설치된 게 없으면 무해하게 skip
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
