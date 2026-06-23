---
description: "Forge Dev platform층 릴리스 — 릴리스 브랜치 생성 + 스테이징 배포 + Release MR (reference only)"
model: sonnet
group: deploy
status: "reference only, not active phase"
---
> **⚠️ 실행 모드 확인**: 이 커맨드는 쓰기 모드에서만 정상 동작합니다. Plan mode 감지 시 즉시 [STOP] — "Escape로 plan mode 해제 후 재실행하세요. 내부 [STOP] 게이트가 승인 지점입니다."


Forge Dev platform층 릴리스 파이프라인을 시작합니다.

## 사용법

```
/forge-release <version>
예: /forge-release 1.2.0
```

## 전제 조건 확인

아래 항목을 먼저 확인해주세요:

1. **P7 Merge PASS**: develop 브랜치의 `develop-integration.yml` 파이프라인이 green인지 확인
   ```bash
   gh run list --branch develop
   ```
2. **release-config.json 존재**: 프로젝트 루트에 `release-config.json`이 있는지 확인 (없으면 템플릿 복사)
   ```bash
   ls release-config.json || echo "Missing — copy from forge template"
   ```
3. **Codex 적대적 최종 리뷰 (blocking)**: develop diff에 대해 Codex final-stage 리뷰 자동 호출
   ```
   /codex-review --stage final --target develop --effort high --blocking
   ```
   - 정책: Plan v2-C1 — `final` stage = blocking YES
   - FAIL → 릴리스 차단. 결과 검토: `forge-outputs/docs/reviews/final/{date}-{slug}.md`
   - 비용: ChatGPT OAuth = $0.00. API key + gpt-5 high = ~$0.10~0.30
   - 비활성: `CODEX_REVIEW_AUTO_STAGES=off` (env)

## 실행 방법

Phase 11은 GitHub CLI로 트리거합니다:

```bash
# TODO: deploy target 미확정 — release-staging.yml NOT YET ACTIVE
gh workflow run release-staging.yml --ref develop \
  -f VERSION=<version> \
  -f DEPLOY_STAGING=true
```

또는 GitHub Actions → `release-staging.yml` → `Run workflow`에서 수동 실행.

## 결과 확인

```bash
# 파이프라인 실행 상태 확인
gh run list

# Release PR 확인
gh pr list --head "release/<version>"
```

## 다음 단계

Release MR이 생성되면 **[STOP]** Human 검토 + 승인 + merge to main → platform층 Production Deploy (`/forge-deploy`) 자동 시작.
