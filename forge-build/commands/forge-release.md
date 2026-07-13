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

## Advisor 자문 (advisory-only · non-blocking · Opus)

릴리스 확정(버전 태깅·배포) 직전에 `advisor-strategist`(Opus) 조언을 구한다. **advisory-only — 게이트 차단 아님. 미가용·실패 시 기본 흐름 진행(fail-open).**

```
Agent(subagent_type="advisor-strategist", prompt="릴리스 버전·변경 요약·breaking 여부 맥락 3-5줄. 질문: 이 릴리스의 breaking change 노출·하위호환 리스크 2-3개와 릴리스노트 누락 가능성은?")
```

- 트리거: 버전 태깅·릴리스 배포 직전(비가역)
- 반환 조언은 참고만 — 최종 판단·실행은 커맨드(및 기존 Human 승인 게이트)가 수행.
- **Fable 5 미배선** — Human 수동 에스컬레이션 전용(자동분기는 forge-fix T4 한정). `advisor-model-resolve` 호출 금지.
- 모델 라우팅: 본 커맨드 작업=Sonnet · 탐색=Haiku · advisor/결정=Opus.

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
