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

## 배포 워크플로 정적 검증 (WARN-first, 2026-07-12 실발화, Batch 4-3)

**배경**: PR 단계 CI(전부 green)와 프로덕션 배포 워크플로 자체의 정합성은 별개다 — 실측: 4회 연속 배포 실패, 원인 전부 기존 인프라 결함(actions 버전/캐시 순서/engines 불일치/권한 누락 등). staging 배포 실행(Phase 11) **직전** 아래 검증을 1회 실행한다:

```bash
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/deploy-workflow-lint.sh" .github/workflows [--rules <project-root>/.claude/deploy-lint-rules.json]
```

- **규칙셋은 프로젝트가 선언**한다(`.claude/deploy-lint-rules.json`) — forge는 실행 엔진만 제공. 규칙셋 미선언 시 skip(fail-open, WARN만 — 배포 차단 안 함).
- findings 발견 시 WARN으로 표시하고 계속 진행(kill-switch: `FORGE_DEPLOY_LINT=off`). ERROR severity findings는 Human에게 명시적으로 알리고 GATE-1 진행 여부 확인을 받는다 — hard-BLOCK 아님(AD-168).
- 규칙 스키마·샘플 규칙셋: `shared/scripts/deploy-workflow-lint.sh` 헤더 주석 + `shared/scripts/__fixtures__/deploy-workflow-lint/sample-rules.json` 참조.

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

## Advisor 자문 (advisory-only · non-blocking · Opus)

프로덕션 배포 실행 go/no-go 직전에 `advisor-strategist`(Opus) 조언을 구한다. **advisory-only — 게이트 차단 아님. 조언 미가용·실패 시 기본 흐름 진행(fail-open).**

```
Agent(subagent_type="advisor-strategist", prompt="배포 대상·변경범위·CI 상태 맥락 3-5줄. 질문: 이 배포에서 놓치기 쉬운 비가역 리스크와 즉시 롤백 트리거 2-3개는?")
```

- 트리거: 프로덕션 배포 확정 직전(비가역)
- 반환 조언은 참고만 — 최종 판단·실행은 커맨드(및 기존 Human 승인 게이트)가 수행.
- **Fable 5 미배선** — Human 수동 에스컬레이션 전용(자동분기는 forge-fix T4 한정, 카브아웃 준수). `advisor-model-resolve` 호출 금지.
- 모델 라우팅: 본 커맨드 작업=Sonnet · 탐색=Haiku · advisor/결정=Opus.

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
