---
description: "develop → staging 배포 커맨드 (scaffold/dry-run — deploy target NOT YET ACTIVE)"
model: haiku
group: deploy
status: "scaffold only, not active"
---

> **⚠️ 실행 모드 확인**: 이 커맨드는 쓰기 모드에서만 정상 동작합니다. Plan mode 감지 시 즉시 [STOP] — "Escape로 plan mode 해제 후 재실행하세요. 내부 [STOP] 게이트가 승인 지점입니다."

> **⚠️ NOT YET ACTIVE**: deploy target 미확정 — staging 환경 미구성. 이 커맨드는 scaffold/dry-run입니다. 실제 배포는 staging 환경 구성 후 활성화됩니다.

# /forge-staging — develop → staging 배포

develop 브랜치를 staging 환경에 배포합니다.
`/forge-deploy` 흐름의 GATE-1 단계로 사용됩니다.

## [HUMAN GATE-1] forge-qa 실행 여부 확인

```
[STOP] staging 배포 전 full forge-qa 진행 여부를 확인해주세요.

  (A) YES — /forge-qa full 실행 후 staging 배포 진행
  (B) NO  — forge-qa 스킵, staging 배포 직행 (단: P6 QA 미통과 상태)

선택: A 또는 B
```

- **옵션 A 선택 시**: `/forge-qa` 먼저 실행 → PASS 확인 후 staging 배포 진행
- **옵션 B 선택 시**: QA 미통과 상태임을 명기하고 staging 배포 진행 (prod 배포 전 반드시 통과 필요)

## staging 배포 실행 (NOT YET ACTIVE)

```bash
# TODO: deploy target 미확정 — release-staging.yml NOT YET ACTIVE
# staging 환경 구성 후 활성화 예정
gh workflow run release-staging.yml --ref develop \
  -f DEPLOY_STAGING=true
```

## 다음 단계

staging 배포 완료 → `/forge-deploy` 흐름으로 GATE-2(prod 머지 승인) 진행
