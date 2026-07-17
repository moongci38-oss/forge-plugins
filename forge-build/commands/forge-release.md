---
description: "staging → main 승격 = 프로덕션 릴리스 (PR 기반 + [STOP] Human 승인)"
model: sonnet
group: deploy
---
> **⚠️ 실행 모드 확인**: 이 커맨드는 쓰기 모드에서만 정상 동작합니다. Plan mode 감지 시 즉시 [STOP] — "Escape로 plan mode 해제 후 재실행하세요. 내부 [STOP] 게이트가 승인 지점입니다."

# /forge-release — staging → main 승격 (프로덕션 릴리스)

staging을 main으로 승격한다. **main 머지 = 프로덕션 자동 배포**(`production-deploy.yml` → 서버 폴링 cron). 표준 머지 경로 `feature/* → develop → staging → main`의 최종 단계이자 유일한 비가역 지점.

> **메커니즘 주의**: 과거 `release-staging.yml`은 미구성이다. staging→main 승격은 **GitHub PR 브랜치 머지**로 수행한다(실측 검증된 경로). main push가 프로덕션 배포를 트리거하므로 아래 [STOP] 게이트가 최종 승인 지점이다.

## 전제 조건 확인

1. **staging CI green**: staging 브랜치 최신 CI 통과 확인
   ```bash
   gh run list --branch staging --limit 3
   ```
2. **staging→main 델타 확인**: 프로덕션에 갈 실제 제품 변경 파악
   ```bash
   git fetch --quiet origin
   git diff --stat origin/main origin/staging
   ```
   - main이 staging보다 앞선 발산이 있으면 2-dot 트리 diff로 양성(머지 토폴로지) 판별. 고유 제품코드 발산 시 [STOP] 조사.
3. **Codex 적대적 최종 리뷰 (blocking)**: 대규모/고위험 변경 시
   ```
   /codex-review --stage final --target staging --effort high --blocking
   ```
   - background/headless 세션(외부 워커 블로킹) → Opus code-reviewer 서브에이전트 폴백.
   - 콘텐츠/저위험 변경이 이미 develop 단계에서 cr-final PASS면 재실행 생략 가능.

## Advisor 자문 (advisory-only · non-blocking · Opus)

프로덕션 배포(비가역) 직전 `advisor-strategist`(Opus) 조언을 구한다. **advisory-only — 미가용·실패 시 기본 흐름 진행(fail-open).**

```
Agent(subagent_type="advisor-strategist", prompt="릴리스 변경 요약·breaking 여부 3-5줄. 질문: breaking/하위호환 리스크 2-3개와 롤백 전략 점검.")
```
- **Fable 5 미배선** — Human 수동 에스컬레이션 전용. `advisor-model-resolve` 호출 금지.

## 승격 실행 (PR 기반)

```bash
gh pr create --base main --head staging \
  --title "release: staging → main" \
  --body "staging→main 승격. 프로덕션 배포 대상 제품 델타: <요약>. main push → production-deploy.yml."
# CI 통과 대기
gh pr checks <PR#> --watch --interval 20
```

## [STOP] Human 승인 게이트 (프로덕션 배포 = 비가역)

```
[STOP] main 머지 = 프로덕션 자동 배포입니다.
  - 배포 대상 제품 델타: <요약>
  - 롤백 경로: git revert <merge-sha> 후 재배포 / 직전 태그 재배포
Human 승인 후에만 머지하세요.
```

승인 후:
```bash
gh pr merge <PR#> --merge     # main은 영구 브랜치 — --delete-branch 금지
```

## 배포 검증

main 머지 후 `production-deploy.yml` 런을 실측 검증한다:
```bash
gh run list --branch main --workflow="Production Deploy" --limit 1
gh run watch <run-id>
```
- 워크플로 전체 conclusion만 보지 말 것 — **Deploy to Production·Smoke Test·Create GitHub Release 잡별 결과**를 확인(과거 릴리스 태깅 실패가 전체 red 오탐을 낸 이력).
- 실 반영 검증: 서버 cron(최대 5분) 후 프로덕션 URL 콘텐츠 assert.
