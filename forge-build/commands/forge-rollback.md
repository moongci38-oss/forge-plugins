---
description: "Forge Dev Phase 12 — 프로덕션 롤백 실행 (L1 Quick / L2 Release / L3 Hotfix Forward)"
model: sonnet
group: deploy
status: "reference only, not active phase"
---

Forge Dev Phase 12 프로덕션 롤백을 실행합니다. 배포 실패 시 아래 레벨 중 선택하세요.

## 롤백 레벨 선택 가이드

| 레벨 | 적용 시점 | 설명 |
|------|----------|------|
| **L1 Quick Revert** | 실패 후 < 30분 | 최근 커밋만 `git revert` — 가장 빠름 |
| **L2 Release Revert** | 실패 후 < 2시간 | 이전 릴리스 태그로 완전 복구 + 재배포 |
| **L3 Hotfix Forward** | 실패 후 > 2시간 | `hotfix/*` 브랜치 생성 → Forge Dev Hotfix 플로우 재진입 |

## Advisor 자문 (advisory-only · non-blocking · Opus)

롤백 실행 결정(장애 대응·비가역) 직전에 `advisor-strategist`(Opus) 조언을 구한다. **advisory-only — 게이트 차단 아님. 미가용·실패 시 기본 흐름 진행(fail-open).**

```
Agent(subagent_type="advisor-strategist", prompt="장애 증상·롤백 대상 버전·현재 배포 상태 맥락 3-5줄. 질문: 이 롤백 자체가 유발할 수 있는 데이터 정합·부분배포 부작용과 대안 2-3개는?")
```

- 트리거: 롤백 명령 실행 직전(장애 대응·비가역)
- 반환 조언은 참고만 — 최종 판단·실행은 커맨드(및 기존 Human 승인 게이트)가 수행.
- **Fable 5 미배선** — Human 수동 에스컬레이션 전용(자동분기는 forge-fix T4 한정). `advisor-model-resolve` 호출 금지.
- 모델 라우팅: 본 커맨드 작업=Sonnet · 탐색=Haiku · advisor/결정=Opus.

## 실행 방법

### L1 Quick Revert

```bash
# TODO: deploy target 미확정 — rollback.yml NOT YET ACTIVE
gh workflow run rollback.yml --ref main \
  -f JOB=rollback \
  -f REASON="<실패 원인 간략 설명>" \
  -f LEVEL=L1-quick-revert
```

### L2 Release Revert

```bash
# TODO: deploy target 미확정 — rollback.yml NOT YET ACTIVE
gh workflow run rollback.yml --ref main \
  -f JOB=rollback \
  -f REASON="<실패 원인 간략 설명>" \
  -f LEVEL=L2-release-revert \
  -f TARGET_VERSION="<복구할 버전, 예: 1.1.0>"
```

### L3 Hotfix Forward

```bash
# TODO: deploy target 미확정 — rollback.yml NOT YET ACTIVE
gh workflow run rollback.yml --ref main \
  -f JOB=rollback \
  -f REASON="<실패 원인 간략 설명>" \
  -f LEVEL=L3-hotfix-forward
```

L3 실행 후 생성된 `hotfix/*` 브랜치를 checkout하고 `/forge-fix` Hotfix 플로우로 진입:

```bash
# L3 실행 후 — Actions run view에서 브랜치명 확인
gh run view --log | grep "Hotfix branch"
git fetch origin
git checkout hotfix/rollback-<timestamp>
```

## 롤백 상태 확인

```bash
gh run list
```
