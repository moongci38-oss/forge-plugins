---
description: "develop → staging 승격 (PR 기반 브랜치 프로모션 + CI 게이트)"
model: haiku
group: deploy
---

> **⚠️ 실행 모드 확인**: 이 커맨드는 쓰기 모드에서만 정상 동작합니다. Plan mode 감지 시 즉시 [STOP] — "Escape로 plan mode 해제 후 재실행하세요. 내부 [STOP] 게이트가 승인 지점입니다."

# /forge-staging — develop → staging 승격

develop 브랜치를 staging으로 승격한다. **staging은 별도 배포 환경이 아니라 main(프로덕션) 직전 CI 게이트 브랜치**다 — 실제 프로덕션 배포는 `/forge-release`의 main 머지에서 트리거된다. 표준 머지 경로 `feature/* → develop → staging → main`의 3번째 단계.

> **메커니즘 주의**: 과거 `release-staging.yml` 배포 워크플로는 미구성(deploy target 미확정)이다. staging 승격은 **GitHub PR 브랜치 머지**로 수행한다(실측 검증된 경로). 별도 staging 서버가 생기면 그때 배포 스텝을 추가한다.

## [HUMAN GATE-1] forge-qa 실행 여부 확인

```
[STOP] staging 승격 전 full forge-qa 진행 여부를 확인해주세요.

  (A) YES — /forge-qa full 실행 후 승격 진행
  (B) NO  — forge-qa 스킵, 승격 직행 (단: P6 QA 미통과 상태 명기)

선택: A 또는 B
```

## 승격 실행 (PR 기반)

1. **develop→staging 델타 확인** (제품 코드 승격 대상 파악):
   ```bash
   git fetch --quiet origin
   git diff --stat origin/staging origin/develop
   ```
   - staging이 develop보다 앞선 고유 커밋이 있으면(발산) 2-dot 트리 diff로 양성(머지 토폴로지) 여부 판별 후 진행. 고유 제품코드 발산 시 [STOP] 조사.

2. **PR 생성 → CI 대기 → 머지**:
   ```bash
   gh pr create --base staging --head develop \
     --title "chore(release): develop → staging" \
     --body "develop→staging 승격. 제품 델타: <요약>."
   # CI 통과 대기 (조건 기반 폴링, 임의 sleep 금지)
   gh pr checks <PR#> --watch --interval 20
   # CLEAN 확인 후 merge 커밋으로 머지 (squash 아님 — 브랜치 동기 보존)
   gh pr merge <PR#> --merge
   ```
   - CI FAIL → **[STOP]** Human 에스컬레이션.
   - staging은 영구 브랜치 — `--delete-branch` 금지.

## 다음 단계

staging 승격 완료 → `/forge-release`로 staging → main 승격(= 프로덕션 배포) 진행.
