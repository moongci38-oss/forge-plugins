---
description: "Forge Dev platform층 — 프로덕션 롤백 실행 (L1 Quick / L2 Release / L3 Hotfix Forward)"
model: sonnet
group: deploy
status: "per-repo — 대상 레포에 rollback.yml 배선 시 가동(§가동 여부 판정)"
---

## 가동 여부 판정 (Step 0 — 실행 전 필수)

**이 커맨드의 가동 여부는 레포마다 다르다.** 아래 `gh workflow run rollback.yml`은 실행 대상
레포의 `.github/workflows/rollback.yml`을 부르므로, **롤백하려는 그 레포에서** 먼저 확인한다:

```bash
ls .github/workflows/rollback.yml 2>/dev/null && echo "WIRED" || echo "NOT_WIRED"
ls release-config.json 2>/dev/null && echo "redeploy=on" || echo "redeploy=off (L2는 코드 revert까지만)"
```

- `WIRED` → 아래 L1/L2/L3 그대로 실행 가능.
- `NOT_WIRED` → `dev/github-spec-kit/workflows/rollback.yml`(spec-kit 템플릿)을 그 레포의
  `.github/workflows/`에 복사해 배선한 뒤 실행한다. 템플릿 헤더가 명시하는 정규 설치 경로다.
- `redeploy=off` → L2의 "Re-deploy previous version" 스텝이 `release-config.json` 부재로
  **skip**된다(템플릿이 그렇게 설계됨). 코드는 되돌아가지만 재배포는 수동이다 — L2를 쓸 때
  이 사실을 전제하고 재배포를 별도로 수행할 것.

### 실측 현황 (2026-08-03 관측 — 재현: 위 판정 명령을 각 레포에서 실행)

| 레포 | rollback.yml | release-config.json | 판정 |
|---|:--:|:--:|---|
| `${FORGE_ROOT:-$HOME/forge}` (하네스) | 없음 | 없음 | **해당 없음** — 프로덕션 배포 자체가 없다(`.github/workflows/`에 production-deploy 부재). 롤백할 대상이 없으므로 부재가 정상이다. |
| `portfolio-project` (제품) | **있음** | 없음 | **가동** — 단 L2 재배포 스텝은 skip(코드 revert까지만). |

> ⚠️ 2026-08-03 이전 이 문서는 "이 커맨드는 미가동"이라고 **전역 단정**했다. 그 판정은
> `${FORGE_ROOT:-$HOME/forge}`에서 `ls .github/workflows/`를 실행한 결과를 일반화한 것인데, forge는 애초에
> 프로덕션 배포가 없는 하네스 레포라 롤백 대상이 아니다. 정작 롤백이 필요한 제품 레포
> (`portfolio-project`)에는 rollback.yml이 **배선돼 있었다**. 즉 그 단정은 장애 시점에
> "이 커맨드는 죽었다"고 오인하게 만드는 **거짓 음성**이었다 — 부재 주장은 측정 명령과
> 측정 위치를 함께 적어야 한다(`dev-workflow-rules.md §부재 주장은 측정 명령 + 관측일 동반`).

**L1 수동 대안**(rollback.yml 미배선 레포에서 30분 내 긴급 시): `git revert <commit> && git push`.
L2/L3는 `/forge-deploy --reverse`로 대체할 수 없다 — `prod --reverse`는 역머지 대상이 없어
즉시 거부된다(`commands/forge-deploy.md:63`). 이전 릴리스 태그 checkout 후 `/forge-deploy prod`
재배포로 대체한다.

Forge Dev platform층 프로덕션 롤백을 실행합니다. 배포 실패 시 아래 레벨 중 선택하세요.

## 롤백 레벨 선택 가이드

| 레벨 | 적용 시점 | 설명 |
|------|----------|------|
| **L1 Quick Revert** | 실패 후 < 30분 | 최근 커밋만 `git revert` — 가장 빠름 |
| **L2 Release Revert** | 실패 후 < 2시간 | 이전 릴리스 태그로 완전 복구 + 재배포 |
| **L3 Hotfix Forward** | 실패 후 > 2시간 | `hotfix/*` 브랜치 생성 → Forge Dev Hotfix 플로우 재진입 |

## Advisor 자문 (advisory-only · non-blocking · 리졸버 기본 = Fable 5)

롤백 실행 결정(장애 대응·비가역) 직전에 `advisor-strategist` 조언을 구한다(모델 = `advisor-model-resolve.sh` 출력, 기본 Fable 5). **advisory-only — 게이트 차단 아님. 미가용·실패 시 기본 흐름 진행(fail-open).**

> ⚠️ **아래 예시는 리졸버가 `claude-*` 를 냈을 때의 형태다.** 스폰 모델은 항상 `advisor-model-resolve.sh` 가 정한다 — `claude-fable-5`→`model:"fable"`, `claude-opus-5`→`model:"opus"`, **`gpt-5.6-sol`이면 Agent 가 아니라 `mcp__codex__codex`(sandbox=read-only)**. 분기표 → `agents/advisor-strategist.md §비용 특성`. 리졸버를 건너뛰면 kill-switch·일일캡·미가용 폴백이 전부 우회된다.
```
Agent(subagent_type="advisor-strategist", prompt="장애 증상·롤백 대상 버전·현재 배포 상태 맥락 3-5줄. 질문: 이 롤백 자체가 유발할 수 있는 데이터 정합·부분배포 부작용과 대안 2-3개는?")
```

- 트리거: 롤백 명령 실행 직전(장애 대응·비가역)
- 반환 조언은 참고만 — 최종 판단·실행은 커맨드(및 기존 Human 승인 게이트)가 수행.
- **advisor 모델 = `advisor-model-resolve.sh` 출력**(기본 Fable 5 · 대체 `gpt-5.6-sol` · `FORGE_ADVISOR_MODEL=opus` 로 Opus 고정). 출력이 `gpt-*` 면 Agent 가 아니라 `mcp__codex__codex`(sandbox=read-only)로 스폰한다.
  ⚠️ 2026-08-12 이전 문구 **"Fable 5 미배선 — Human 수동 에스컬레이션 전용 · `advisor-model-resolve` 호출 금지"는 폐기**했다 — 이 커맨드에 advisor 자문 레그가 실재하는데 리졸버 호출을 금지해 라우팅이 서로 어긋났다(cr-final HIGH). 정본 → `rules/model-routing.md §Advisor 전략 상시 가동`
- 모델 라우팅: 본 커맨드 작업=Sonnet · 탐색=Haiku · advisor=`advisor-model-resolve.sh` 출력(기본 Fable 5 · 대체 `gpt-5.6-sol`).

## [STOP] 실행 승인 게이트 (2026-08-22 신설 — 감사 H-2)

**아래 `gh workflow run rollback.yml` 을 실행하기 전에 반드시 멈추고 Human 승인을 받는다.**

쉽게 말하면: **배포에는 문이 달려 있는데 되돌리기에는 없었다.** 그런데 롤백은 이미 장애가 난
상태에서, 급한 마음으로, 프로덕션에 하는 일이다 — 문이 더 필요한 쪽은 이쪽이다.

AI 는 아래 4가지를 **한 화면에 적어 제시하고 대기**한다. 사용자가 명시적으로 승인하기 전에는
`gh workflow run` 을 실행하지 않는다(조사·현황 확인 명령은 게이트 대상이 아니다).

1. **무엇을 되돌리나** — 대상 레포·브랜치·현재 배포 버전
2. **어느 레벨인가** — L1/L2/L3 과 그 선택 이유(§롤백 레벨 선택 가이드 기준)
3. **되돌린 뒤 무엇이 사라지나** — 이 롤백으로 함께 빠지는 커밋·기능. L2 는 `TARGET_VERSION` 명시
4. **데이터 정합** — 스키마 마이그레이션이 그 사이에 있었으면 코드만 되돌리면 **깨진다.**
   있으면 그 사실과 대응(별도 다운 마이그레이션 필요 여부)을 함께 적는다

> ⚠️ **`[STOP]` 은 승인 없이 통과하지 않는다.** "긴급이라서", "이미 승인받은 배포의 되돌리기라서"
> 는 통과 사유가 아니다 — 배포 승인은 롤백 승인이 아니다.
> 단, §Advisor 자문은 이 게이트 **전에** 수행한다(advisory-only, non-blocking).

**근거**: 3회 연속 감사에서 이 커맨드의 `[STOP]` 실측 **0건**(재현: `grep -c '\[STOP\]'
.claude/commands/forge-rollback.md`). 같은 platform 층의 `/forge-deploy` 는 prod 에 bypass 불가
`[STOP]` 을 두고 있어 **배포/롤백 게이트 비대칭**이 지적됐다(2026-08-22 감사 H-2).
⚠️ **이 게이트가 무력화되는 입력**: 사용자가 `gh workflow run` 을 직접 손으로 치면 이 문은
아무것도 막지 못한다 — 이것은 훅이 아니라 **커맨드 절차**다. 기계 차단이 필요하면 별도 훅이 필요하고,
그 판단은 AD-168(WARN-first) 검토를 거쳐야 한다.
**폐기조건**: 롤백 실행 경로가 승인 게이트를 가진 단일 워크플로로 통합되면 이 절을 그 표기로 교체한다.

## 실행 방법

### L1 Quick Revert

```bash
# 실행 전 §가동 여부 판정 Step 0 을 통과했는지 확인할 것.
gh workflow run rollback.yml --ref main \
  -f JOB=rollback \
  -f REASON="<실패 원인 간략 설명>" \
  -f LEVEL=L1-quick-revert
```

### L2 Release Revert

```bash
# 실행 전 §가동 여부 판정 Step 0 을 통과했는지 확인할 것.
gh workflow run rollback.yml --ref main \
  -f JOB=rollback \
  -f REASON="<실패 원인 간략 설명>" \
  -f LEVEL=L2-release-revert \
  -f TARGET_VERSION="<복구할 버전, 예: 1.1.0>"
```

### L3 Hotfix Forward

```bash
# 실행 전 §가동 여부 판정 Step 0 을 통과했는지 확인할 것.
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
