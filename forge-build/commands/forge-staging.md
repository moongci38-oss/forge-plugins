---
description: "develop → staging 승격 + 배포 (deploy-config.json 어댑터 — 설정 부재 시 PR 기반 브랜치 승격만)"
model: haiku
group: deploy
---

> **⚠️ 실행 모드 확인**: 이 커맨드는 쓰기 모드에서만 정상 동작합니다. Plan mode 감지 시 즉시 [STOP] — "Escape로 plan mode 해제 후 재실행하세요. 내부 [STOP] 게이트가 승인 지점입니다."

# /forge-staging — develop → staging 승격 + 배포

develop 브랜치를 staging으로 승격하고, 프로젝트가 staging 배포 환경을 선언한 경우 서버 배포까지 수행한다. `/forge-deploy` 흐름의 GATE-1 단계.

**두 실행 모드** (프로젝트 루트 `deploy-config.json` 유무로 결정 — 특정 CI·스크립트를 이 커맨드에 하드코딩하지 않는다, 2026-07-18 어댑터 전환):

| 모드 | 조건 | 내용 |
|------|------|------|
| **브랜치 승격만** (기본) | `deploy-config.json` 부재 또는 `staging` 키 부재 | staging = main 직전 CI 게이트 브랜치. GitHub **PR 기반 브랜치 프로모션**만 수행(아래 §승격 실행). 배포 스텝 없음 — 기존 동작 그대로 |
| **승격 + 배포** (어댑터) | `staging.method` 선언 | 프로젝트가 선언한 수단(script/workflow)으로 브랜치 동기화 + 서버 배포 + 헬스체크까지 |

## 사용법

```
/forge-staging                       # GATE-1 → 모드 판정 → 실행
/forge-staging --dry-run             # (어댑터 모드) 전 단계 리허설 — 원격/브랜치 변경 0
/forge-staging --step=<name>         # (method=script) 단계별 실행 인자 passthrough
/forge-staging --rollback [<ts>]     # (method=script) 롤백 passthrough
```

## Step 0 — deploy-config 라우팅 판정 (fail-open)

프로젝트 루트 `deploy-config.json`을 Read:

| 상태 | 행동 |
|------|------|
| 파일 부재 또는 `staging` 키 부재 | **브랜치 승격만 모드** — 아래 §승격 실행(PR 기반)으로 진행. 배포 스텝 없음 (설정 없는 프로젝트 동작 변화 0) |
| `staging.method: "script"` | `staging.script` 경로의 스크립트 실행 (인자 passthrough — 브랜치 동기화 포함 여부는 스크립트 정의를 따름) |
| `staging.method: "workflow"` | `gh workflow run <staging.workflow> --ref <staging.branches.source>` |
| 그 외 method 값 | GUIDE-STOP — 지원 method(`script`/`workflow`) 안내 후 정지 |

어댑터 모드 선언 예시:
```json
{ "staging": { "method": "script", "script": "scripts/deploy-staging.sh",
               "branches": { "source": "develop", "target": "staging" } } }
```

## [HUMAN GATE-1] forge-qa 실행 여부 확인

```
[STOP] staging 승격/배포 전 full forge-qa 진행 여부를 확인해주세요.

  (A) YES — /forge-qa full 실행 후 진행
  (B) NO  — forge-qa 스킵, 직행 (단: P6 QA 미통과 상태 명기)

선택: A 또는 B
```

- **옵션 A 선택 시**: `/forge-qa` 먼저 실행 → PASS 확인 후 진행
- **옵션 B 선택 시**: QA 미통과 상태임을 명기하고 진행 (prod 배포 전 반드시 통과 필요)
- 직전 세션·현 세션에서 동일 스코프 forge-qa/game-qa **PASS 증거(리포트 경로·커밋)** 가 이미 있으면 그 근거를 제시하고 (A) 충족으로 간주할 수 있다 — 근거 없는 스킵 금지.

## 승격 실행 — 브랜치 승격만 모드 (PR 기반, 기본)

> **메커니즘 주의**: 과거 `release-staging.yml` 배포 워크플로는 미구성(deploy target 미확정)이다. staging 승격은 **GitHub PR 브랜치 머지**로 수행한다(실측 검증된 경로). 별도 staging 서버가 생기면 deploy-config.json 어댑터로 배포 스텝을 선언한다.

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
   - `gh` CLI 부재 환경: staging 브랜치가 FF 관계면 `git push origin origin/develop:staging` 직접 승격 허용(프로젝트 브랜치 룰이 허용하는 경우만), 비FF면 [STOP].

## 배포 실행 — 어댑터 모드 (deploy-config 라우팅 결과 실행)

```bash
# method=script 예 (godblade):
bash scripts/deploy-staging.sh [--dry-run] [--step=branch|publish|upload|start|health] [--rollback [<ts>]]

# method=workflow 예:
gh workflow run <staging.workflow> --ref <branches.source>
```

**결과 해석**:
- exit 0 → 성공. 헬스체크 결과를 사용자에게 보고.
- exit ≠ 0 → **[STOP]** Human 에스컬레이션 — 에러 출력 + 롤백 경로 안내 (`--rollback` 지원 스크립트면 명시).
- 시크릿 규약: 배포 스크립트의 자격증명은 프로젝트 `.env` 참조 방식만 허용 — 이 커맨드/대화에 값 출력 금지.

## 다음 단계

- 브랜치 승격만 모드: staging 승격 완료 → `/forge-release`로 staging → main 승격(= 프로덕션 배포) 진행.
- 어댑터 모드: staging 배포 완료 → staging 환경 통합 테스트(E2E/스모크) → `/forge-deploy` 흐름으로 GATE-2(prod 머지 승인) 진행.
