---
description: "Forge Dev 배포 파이프라인 — staging prefix → prod 연장 (Phase 11~12)"
model: sonnet
group: deploy
status: "reference only, not active phase"
---
> **⚠️ 실행 모드 확인**: 이 커맨드는 쓰기 모드에서만 정상 동작합니다. Plan mode 감지 시 즉시 [STOP] — "Escape로 plan mode 해제 후 재실행하세요. 내부 [STOP] 게이트가 승인 지점입니다."

# /forge-deploy — 배포 파이프라인

develop → staging prefix를 거쳐 prod까지 연장하는 통합 배포 흐름입니다.

## 전체 흐름

```
develop
  ↓
[GATE-1] /forge-staging — "full forge-qa 진행 여부?" Human 확인
  ↓ (YES) /forge-qa full 실행 → PASS
  ↓
staging 배포 (release-staging.yml — NOT YET ACTIVE)
  ↓
[GATE-2] forge-release.md [STOP] 재사용
         "Release MR 검토 + 승인 + merge to main" — bypass 불가
  ↓
/forge-release → prod (main)
  ↓
/forge-develop (main → develop 동기화)
  ↓
production-deploy.yml 자동 트리거 (Phase 12)
```

## GATE-1 — staging 진입 ([HUMAN GATE-1])

`/forge-staging` 커맨드로 실행:

```
/forge-staging
```

Human에게 확인:
- **A (권장)**: `/forge-qa full` 실행 후 staging 배포
- **B**: forge-qa 스킵, staging 직행 (prod 배포 전 반드시 통과 필요)

## GATE-2 — prod 머지 승인 ([STOP], bypass 불가)

`forge-release.md` [STOP] 게이트 그대로 재사용:

```
Release MR이 생성되면 [STOP] Human 검토 + 승인 + merge to main → Production Deploy 자동 시작.
```

이 게이트는 bypass 불가. Human 명시 승인 없으면 prod 머지 불허.

## staging 배포 (Phase 11)

```bash
# TODO: deploy target 미확정 — release-staging.yml NOT YET ACTIVE
gh workflow run release-staging.yml --ref develop \
  -f VERSION=<version> \
  -f DEPLOY_STAGING=true
```

## prod 배포 확인 (Phase 12)

Phase 12는 Release PR이 main에 merge되면 `production-deploy.yml`이 자동 실행됩니다.

```bash
# 최신 production-deploy 실행 상태 확인
gh run list

# 수동 트리거 (필요 시)
# TODO: deploy target 미확정 — production-deploy.yml NOT YET ACTIVE
gh workflow run production-deploy.yml --ref main
```

## 배포 결과 확인

```bash
# 최신 GitHub Release 확인
gh release list --limit 5

# 최신 태그 확인
git tag --sort=-creatordate | head -5
```

## develop 동기화 (prod 머지 후 필수)

prod merge to main 완료 직후:

```
/forge-develop
```

`dev-workflow-rules` "main 머지 시 develop 동기화" 준수. develop 방치 금지.

## 실패 시 롤백

배포 실패 → `/forge-rollback`으로 롤백 레벨 선택:
- **L1** (< 30분): Quick Revert — 최근 커밋 revert
- **L2** (< 2시간): Release Revert — 이전 태그로 재배포
- **L3** (> 2시간): Hotfix Forward — hotfix 브랜치에서 수정 후 재배포
