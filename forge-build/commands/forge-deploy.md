---
description: "통합 배포 진입점 — dev/stg/prod 단일 커맨드 (머지 감지 + env 라우팅 + 게이트 매트릭스 + --reverse/--dry-run)"
model: sonnet
group: deploy
---

> **⚠️ 실행 모드 확인**: 이 커맨드는 쓰기 모드에서만 정상 동작합니다. Plan mode 감지 시 즉시 [STOP] — "Escape로 plan mode 해제 후 재실행하세요. 내부 [STOP]·[GATE-1] 게이트가 승인 지점입니다."

# /forge-deploy — 통합 배포 진입점

배포 기능 4개 커맨드(forge-staging/forge-release/forge-develop + dev 구간)를 **단일 진입점**으로 통합한다. env 인자 하나로 미머지 감지 → 머지 선행 → env 라우팅 → 게이트 매트릭스 → 배포까지 수행한다.

## 인터페이스

```
/forge-deploy <dev|stg|prod> [프로젝트...] [--reverse] [--dry-run]
```

| 인자 | 의미 |
|------|------|
| `<dev\|stg\|prod>` | **필수**. 대상 env. `stg`는 deploy-config 키 `staging`으로 정규화(§Step 0). |
| `[프로젝트...]` | **생략=전체 / 지정=부분**. deploy-config `targets`의 이름과 매칭. 머지·배포 **동일 스코프**(§Step 1). |
| `--reverse` | main→(develop\|staging) **역머지 + 해당 env 배포** 단일 호출(forge-develop 흡수). `prod --reverse`는 인자 오류로 즉시 거부(§역방향 흐름). |
| `--dry-run` | 판정·라우팅·게이트 도달만 출력. git write 0 · MR 생성 0 · 배포 API 호출 0 보장(§dry-run 계약). |

**게이트 원칙**: 게이트 강도는 env 위험도에 비례하고, 게이트 통과 후 실행은 자동이다(머지=승인 지점, 배포=승인의 기계적 실행).

| env | 머지 방향 | 승인 게이트 | 게이트 후 |
|-----|----------|------------|----------|
| `dev` | feat(현재 브랜치)→develop | **/forge-pr** CR 게이트(위임, 재구현 금지) | dev env 배포(선언 시) |
| `stg` | develop→staging | **[GATE-1]** Human forge-qa 확인 | staging 배포 자동 |
| `prod` | staging→main = **Release MR 생성까지만** | **[STOP]** Human 웹 승인(main 머지) + 배포 [STOP] | production-deploy 자동(bypass 불가) |

> **IRON (불변)**: prod의 main 머지는 **Human 웹 전용**(AI는 Release MR 생성까지), prod 배포 [STOP]은 **bypass 불가**. 이 게이트는 어떤 경로·플래그로도 소멸·약화되지 않는다.

## deploy-config.json 스키마 (다중 env + 하위호환)

프로젝트 루트 `deploy-config.json`이 env별 배포 수단을 선언한다. **선언 없는 env·파일 부재 = GUIDE-STOP**(fail-open, 회귀 0 — 검증 코드 발명 금지, YAGNI).

```json
{
  "<dev|staging|prod>": {
    "method": "script | workflow",
    "script": "scripts/deploy-<env>.sh",          // method=script
    "workflow": "release-<env>.yml",              // method=workflow
    "branches": { "source": "<src>", "target": "<dst>" },
    "targets": {                                   // 타깃별 레포 집합 매핑 (선택)
      "<name>": { "repos": ["...", "server"] }
    },
    "healthcheck": { "url": "https://...", "assert": "..." }  // 선택
  }
}
```

**하위호환 (CRITICAL)**: `targets` 키가 **없으면** 해당 env 노드 전체가 **단일 암묵 타깃**이다 — 기존 godblade `staging` 단일 키 파일(`{ "staging": { method, script, repos[], remote } }`)이 **무수정으로 유효**하다. 신 `targets` 스키마는 멀티 레포 워크스페이스(boardGames 등)의 부분 머지 갭을 해소하는 확장일 뿐, 기존 파일을 깨지 않는다.

**접속정보 관례 (`remote.envFile` 공유, 2026-07-18 Human 확정)**: `envFile`은 경로 선언 — **배포 단위가 같은 멀티 레포 워크스페이스는 루트 공유 `.env` 하나**(`"envFile": "../.env"`)를 권장하고, 프로젝트별로 값이 다른 키만 `envPrefix`로 분리한다(예: 공통 `STG_SSH_*` + `MATGO_STG_DB_NAME`). **머신 전역 단일 .env로 배포 단위가 다른 프로젝트까지 통합은 금지**(유출 폭발 반경·키 충돌·이식성). `envFile` 경로는 프로젝트 루트(deploy-config.json 위치) 기준으로 해석하며, 시크릿 값은 어떤 로그·PR·보고에도 출력 금지.

## Step 0 — 인자 파싱 + env 정규화 + config 라우팅 (fail-open)

1. **env 정규화**: `stg` → config 키 `staging`. `dev`/`prod`는 그대로.
2. **플래그 파싱**: `--reverse`·`--dry-run` 추출, 나머지 위치 인자 = 프로젝트 목록.
3. **`prod --reverse` 즉시 거부**: 역머지 대상이 없다(main 위 env 없음). → 인자 오류 안내 후 정지.
4. **config Read → 라우팅 판정**:

| 상태 | 행동 |
|------|------|
| 파일 부재 또는 `<env>` 키 부재 | **GUIDE-STOP** — "이 프로젝트는 `<env>` 배포를 선언하지 않았습니다. deploy-config.json에 `<env>` 노드를 추가하거나, 브랜치 승격만 필요하면 §머지-only 폴백으로 진행합니다." 안내 후 정지(에러 아님). 단 dev·stg의 **브랜치 머지/승격**은 배포 선언과 무관하게 §Step 2로 계속 가능(F1 브랜치 승격만 모드 계승). |
| `<env>.method: "script"` | `<env>.script` 경로 스크립트 실행(인자 passthrough) |
| `<env>.method: "workflow"` | `gh workflow run <env>.workflow --ref <branches.source>` |
| 그 외 method 값 | GUIDE-STOP — 지원 method(`script`/`workflow`) 안내 후 정지 |

## Step 1 — 스코프 해석 (targets → 레포 합집합)

- **프로젝트 인자 없음** → 해당 env의 **전체 타깃**(또는 `targets` 부재 시 단일 암묵 타깃).
- **프로젝트 인자 있음** → 지정 이름과 매칭되는 타깃만. 매칭 0건 → GUIDE-STOP(선언된 타깃 목록 안내).
- **레포 합집합**: 선택된 타깃들의 `repos[]`를 **합집합으로 dedup → 1회만** 머지·배포 처리(타깃 간 레포 중복 시 중복 실행 금지).
- **머지·배포 동일 스코프**: 이 단계에서 확정된 레포/타깃 집합은 머지와 배포 양쪽에 동일하게 적용된다.
- **부분 실행 경고**: 인자로 일부 타깃만 실행한 경우, **잔여 미실행 타깃**을 완료 보고에 경고로 명시(예: "matgo만 처리 — badugi·web-site·admin-renew는 미머지 상태").
- **레포별 반복 실행**: Step 2~4의 git/gh 명령은 여기서 확정된 **레포 합집합의 각 레포에 대해 반복 실행**한다(각 레포 루트 기준 `git -C <repo>`, PR도 레포별 생성). `targets` 부재(단일 암묵 타깃) 시 현재 프로젝트 루트 1회 — 이하 Step의 명령 예시는 단일 레포 표기이며 멀티 레포 시 이 규칙으로 반복한다.

## Step 2 — 머지 상태 감지 (env별 · 스코프 한정 · 감지 결과 선출력)

머지가 필요한 브랜치→대상을 **먼저 출력**한 뒤 진행한다. 이미 머지된 상태면 머지 스텝을 건너뛰고 배포로 직행한다.

### dev — feat → develop (현재 브랜치 1개 한정)
- **감지 스코프**: `git branch --show-current` 결과 **1개 브랜치만**. 임의 다수 feat 브랜치 스캔·암묵 머지 **금지**.
- 현재 브랜치가 develop/staging/main이면 머지 대상 없음(감지 결과 "머지 불필요" 출력 후 배포로).
- feat 브랜치이고 develop에 미머지 커밋 존재 시:
  ```bash
  git fetch --quiet origin
  git log --oneline origin/develop..HEAD   # 미머지 커밋 감지 → 선출력
  ```
- 위 결과 **0줄 = 이미 전부 병합됨** → "머지 불필요" 출력 후 배포로(feat 브랜치 위에서도 동일 판정).
- 머지는 **/forge-pr 위임**(CR 게이트 재구현 금지). forge-pr가 cr-triple 적대적 리뷰 + develop 자동 머지를 담당한다.

### stg — develop → staging (고정 쌍, 모호성 없음)
```bash
git fetch --quiet origin
git diff --stat origin/staging origin/develop   # 승격 델타 선출력
```
- staging이 develop보다 앞선 고유 제품코드 발산 시 2-dot 트리 diff 판별 후 [STOP] 조사.
- **델타 0 = 승격 불필요**: diff가 비면 머지 스텝 스킵 — [GATE-1] 후 배포로 직행. 빈 델타로 `gh pr create` 금지(빈 PR 생성 실패).

### prod — staging → main (고정 쌍, Release MR 생성까지만)
```bash
git fetch --quiet origin
git diff --stat origin/main origin/staging      # 프로덕션 대상 델타 선출력
```
- main이 staging보다 앞선 고유 발산 시 [STOP] 조사.
- **델타 0 = 릴리스 불필요**: diff가 비면 Release MR 생성 스킵 — production-deploy 상태 실측 검증만 수행.

## Step 3 — 게이트 매트릭스 실행

### dev 게이트 — /forge-pr CR 게이트
- 미머지 feat 감지 시 `/forge-pr`로 위임(cr-triple + develop 머지). PASS 후 dev env 배포(선언 시)로 진행.
- 배포 미선언(GUIDE-STOP) 시 머지 완료로 종료.

### stg 게이트 — [HUMAN GATE-1] forge-qa 확인
```
[GATE-1] staging 승격/배포 전 full forge-qa 진행 여부를 확인해주세요.
  (A) YES — /forge-qa full 실행 후 진행
  (B) NO  — forge-qa 스킵, 직행 (P6 QA 미통과 상태 명기, prod 전 반드시 통과 필요)
선택: A 또는 B
```
- 직전/현 세션에 동일 스코프 forge-qa/game-qa **PASS 증거(리포트 경로·커밋)** 가 있으면 근거 제시 후 (A) 충족 간주 가능 — 근거 없는 스킵 금지.
- 통과 후 develop→staging 승격(PR 기반) → staging 배포 자동.

**승격 실행 (PR 기반, deploy target 미확정 프로젝트 폴백)**:
```bash
gh pr create --base staging --head develop \
  --title "chore(release): develop → staging" --body "develop→staging 승격. 델타: <요약>."
gh pr checks <PR#> --watch --interval 20   # 조건 기반 폴링, 임의 sleep 금지
gh pr merge <PR#> --merge                   # merge 커밋(squash 아님 — 브랜치 동기 보존). staging 영구 브랜치 — --delete-branch 금지
```
- CI FAIL → [STOP]. `gh` 부재 + FF 관계면 `git push origin origin/develop:staging` 허용(프로젝트 룰 허용 시), 비FF면 [STOP].

### prod 게이트 — [STOP] Release MR (IRON, bypass 불가)
1. **staging CI green** 확인: `gh run list --branch staging --limit 3`
2. **Codex 적대적 최종 리뷰(blocking)**: 대규모/고위험 시 `/codex-review --stage final --target staging --effort high --blocking`. background/headless → Opus code-reviewer 폴백. develop 단계 cr-final PASS면 생략 가능.
3. **Release MR 생성까지만** (AI 범위):
   ```bash
   gh pr create --base main --head staging \
     --title "release: staging → main" \
     --body "staging→main 승격. 배포 대상 델타: <요약>. main push → production-deploy.yml."
   gh pr checks <PR#> --watch --interval 20
   ```
4. **[STOP] Human 웹 승인 게이트**:
   ```
   [STOP] main 머지 = 프로덕션 자동 배포(비가역)입니다.
     - 배포 대상 제품 델타: <요약>
     - 롤백 경로: git revert <merge-sha> 후 재배포 / 직전 태그 재배포
   Human이 웹에서 검토·승인·머지하세요. AI는 머지하지 않습니다(IRON).
   ```
   - main 머지는 **Human 웹 전용** — AI는 `gh pr merge` 실행 금지.
5. 머지 후 `production-deploy.yml` 자동 트리거. 실측 검증:
   ```bash
   gh run list --branch main --workflow="Production Deploy" --limit 1
   gh run watch <run-id>
   ```
   - Deploy·Smoke Test·Create Release **잡별 결과** 확인(전체 conclusion만 보면 태깅 실패 오탐). 서버 cron(최대 5분) 후 프로덕션 URL assert.

## Step 4 — 배포 실행 (어댑터 라우팅 결과)

**stg/prod 배포 직전 정적 검증 (WARN-first, Batch 4-3 이관 보존)**:
```bash
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/deploy-workflow-lint.sh" .github/workflows \
  [--rules <project-root>/.claude/deploy-lint-rules.json]
```
- 규칙셋은 프로젝트가 선언(`.claude/deploy-lint-rules.json`) — 미선언 시 skip(fail-open, WARN만). kill-switch `FORGE_DEPLOY_LINT=off`.
- ERROR severity findings는 Human에게 명시 후 게이트 진행 여부 확인 — hard-BLOCK 아님(AD-168).
- 스키마·샘플: `shared/scripts/deploy-workflow-lint.sh` 헤더 + `__fixtures__/deploy-workflow-lint/sample-rules.json`.

**배포 실행 (Step 0 라우팅 결과)**:
```bash
# method=script (godblade 예):
bash <env>.script [--dry-run] [--step=<name>] [--rollback [<ts>]]
# method=workflow 예:
gh workflow run <env>.workflow --ref <branches.source>
```
- exit 0 → 성공. 헬스체크(`healthcheck` 선언 시) 결과 보고.
- exit ≠ 0 → [STOP] Human 에스컬레이션 — 에러 출력 + 롤백 경로(`--rollback` 지원 시 명시).
- 시크릿 규약: 배포 스크립트 자격증명은 프로젝트 `.env` 참조만 — 값 출력 금지.

## 역방향 흐름 — `--reverse` (forge-develop 흡수)

**방향**: main → (develop | staging) 역머지 + 해당 env 배포. prod 머지 후 하위 env 동기화 용도.

| 조합 | 동작 |
|------|------|
| `dev --reverse` | main→develop 역머지 + dev env 배포(선언 시). dev 배포 미선언 = 머지만(forge-develop 원 동작 보존, GUIDE-STOP는 배포 스텝에만 적용) |
| `stg --reverse` | main→staging 역머지 + staging 배포(선언 시) |
| `prod --reverse` | **즉시 거부** — 역머지 대상 없음(Step 0 step 3에서 차단) |

**역머지 실행 (방향 명시 로그)**:
```bash
git checkout <develop|staging>
git merge main --no-ff -m "chore: reverse sync main → <target> (forge-deploy --reverse)"
git rev-list --count <target>..main   # 0이면 main의 전 커밋이 <target>에 반영(완전 동기화)
# ⚠ 방향 주의: main..<target>는 반대 방향 — --no-ff merge 커밋 때문에 정상 병합 직후에도 ≥1로 오탐(샌드박스 실증 2026-07-18)
```

**실패 모드**:
- **역머지 충돌** → `git merge --abort` + [STOP] 보고. **자동 해소 금지**(Human 에스컬레이션).
- **머지 성공 + 배포 실패** → **부분 완료 상태 명시 보고**(머지 완료·배포 실패). 재시도는 **배포 단계만**(머지는 이미 반영됨 — 재머지 금지).

## `--dry-run` 계약 (문서화된 보장)

`--dry-run` 지정 시 다음을 **보장**한다:

| 항목 | 보장 |
|------|------|
| git write | **0** (checkout/merge/push/commit 미실행) |
| MR/PR 생성 | **0** (`gh pr create` 미실행) |
| 배포 API 호출 | **0** (script/workflow 미실행, 배포 스크립트에 `--dry-run` passthrough) |
| 출력 | 판정(env/스코프/머지상태) · 라우팅(method/script) · **게이트 도달 지점**(어느 게이트가 트리거될지)만 |

dry-run은 실머지 경로를 검증하지 못한다(git write 0). 실머지 검증은 샌드박스 테스트 브랜치 1회 실머지로 별도 수행한다(W1-2 verify).

## Advisor 자문 (advisory-only · non-blocking · Opus)

prod 배포(비가역) 확정 직전 `advisor-strategist`(Opus) 조언을 구한다. **advisory-only — 게이트 차단 아님. 미가용·실패 시 기본 흐름 진행(fail-open).**
```
Agent(subagent_type="advisor-strategist", prompt="배포 대상·변경범위·CI 상태 3-5줄. 질문: 놓치기 쉬운 비가역 리스크와 즉시 롤백 트리거 2-3개는?")
```
- **Fable 5 미배선** — Human 수동 에스컬레이션 전용. `advisor-model-resolve` 호출 금지.
- 모델 라우팅: 본 커맨드=Sonnet · 탐색=Haiku · advisor/결정=Opus.

## 실패 시 롤백

배포 실패 → `/forge-rollback`으로 레벨 선택:
- **L1** (< 30분): Quick Revert — 최근 커밋 revert
- **L2** (< 2시간): Release Revert — 이전 태그로 재배포
- **L3** (> 2시간): Hotfix Forward — hotfix 브랜치 수정 후 재배포

신 `/forge-deploy` 자체 결함 시: forge SSoT revert 커밋 → 재전파(미러 동기화). 래퍼가 구 커맨드 정의를 보존하므로 revert만으로 원복(계획서 §리스크 롤백 경로).

## 검증용 조합 매트릭스 (W1-2 verify 케이스표)

env × 스코프 × 머지상태 × --reverse 조합별 기대 동작. dry-run 케이스표 + 샌드박스 실머지 1회로 검증한다.

| env | 스코프 | 머지상태 | --reverse | 기대 동작 (도달 게이트 / 수행 / 거부) |
|-----|--------|---------|:--------:|------|
| dev | 전체 | 미머지(feat) | — | 감지 선출력 → **/forge-pr 위임**(CR 게이트) → 머지 → dev 배포(선언 시) |
| dev | 전체 | 머지됨 | — | "머지 불필요" 출력 → dev 배포(선언 시) / 미선언 시 GUIDE-STOP(배포만) |
| dev | 부분(matgo) | 미머지 | — | matgo 타깃 레포만 머지+배포 → 잔여 타깃 미머지 경고 |
| dev | 전체 | — | ✓ | main→develop 역머지 + dev 배포(선언 시). 미선언=머지만(forge-develop 원 동작) |
| stg | 전체 | 미머지 | — | 델타 선출력 → **[GATE-1]** forge-qa 확인 → develop→staging 승격 → staging 배포 |
| stg | 전체 | 머지됨 | — | 델타 0 확인 → [GATE-1] → 배포만 |
| stg | 부분 | 미머지 | — | 지정 타깃 레포 합집합 1회 머지+배포 → 잔여 경고 |
| stg | 전체 | — | ✓ | main→staging 역머지 + staging 배포(선언 시) |
| prod | 전체 | 미머지 | — | 델타 선출력 → Codex final → **Release MR 생성까지** → **[STOP]** Human 웹 머지 → production-deploy 자동 |
| prod | 전체 | 머지됨 | — | 델타 0 → 배포 상태(production-deploy) 실측 검증만 |
| prod | 부분 | 미머지 | — | 지정 타깃만 Release MR 대상 → 잔여 경고 + [STOP] 유지 |
| prod | * | * | ✓ | **즉시 거부**(인자 오류 — 역머지 대상 없음) |
| * | * | * | +`--dry-run` | 위 판정·라우팅·게이트 도달만 출력. git write 0 · MR 0 · 배포 API 0 |
| * | * | env 미선언 | — | **GUIDE-STOP**(배포 스텝) — 브랜치 머지/승격은 계속 가능(dev/stg) |
