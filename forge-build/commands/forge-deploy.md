---
description: "통합 배포 진입점 — dev/stg/prod 단일 커맨드 (머지 감지 + env 라우팅 + 게이트 매트릭스 + --reverse/--dry-run)"
model: sonnet
group: deploy
---

> **⚠️ 실행 모드 확인**: 쓰기 모드에서만 동작. Plan mode 감지 시 즉시 [STOP] — "Escape로 plan mode 해제 후 재실행하세요. 내부 [STOP]·[GATE-1] 게이트가 승인 지점입니다."

# /forge-deploy — 통합 배포 진입점

`/forge-deploy <dev|stg|prod> [프로젝트...] [--reverse] [--dry-run]` — 미머지 감지 → 머지 선행 → env 라우팅 → 게이트 → 배포.

- 프로젝트 생략=전체 / 지정=부분(`targets` 이름 매칭) · `--reverse` = main→(develop|staging) 역머지+배포 · `--dry-run` = 판정만(§보장)

- `dev`: feat(현재 브랜치)→develop · **/forge-pr** CR 게이트(위임, 재구현 금지) → dev 배포(선언 시)
- `stg`: develop→staging · **[GATE-1]** Human forge-qa 확인 → staging 배포 자동
- `prod`: staging→main = **Release MR 생성까지만** · **[STOP]** Human 웹 승인(main 머지) + 배포 [STOP] → production-deploy 자동(bypass 불가)

> **IRON**: prod main 머지는 **Human 웹 전용**(AI 는 Release MR 까지), prod 배포 [STOP] 은 어떤 경로·플래그로도 bypass 불가.

## deploy-config.json (프로젝트 루트)
`{ "<dev|staging|prod>": { "method": "script | workflow", "script": "scripts/deploy-<env>.sh", "workflow": "release-<env>.yml", "branches": { "source": "<src>", "target": "<dst>" }, "targets": { "<name>": { "repos": ["...", "server"] } }, "healthcheck": { "url": "https://...", "assert": "..." } } }`
- `targets` 없으면 env 노드 전체 = 단일 암묵 타깃(기존 `{ "staging": { method, script, repos[], remote } }` 무수정 유효).
- `remote.envFile` 은 프로젝트 루트 기준 경로(멀티 레포는 루트 공유 `"../.env"` + 프로젝트별 키만 `envPrefix`). 머신 전역 단일 .env 통합 금지 · 시크릿 값 출력 금지.

## Step 0 — 파싱 + 라우팅 (fail-open)
1. `stg` → `staging` 정규화 · `--reverse`/`--dry-run` 추출, 나머지 = 프로젝트 목록.
2. `prod --reverse` → 인자 오류 안내 후 정지.
3. config Read:

| 상태 | 행동 |
|------|------|
| 파일 부재 / `<env>` 키 부재 | **GUIDE-STOP**(에러 아님) — "`<env>` 배포 미선언. deploy-config.json 에 노드 추가 필요." 단 dev·stg 브랜치 머지/승격은 Step 2 로 계속 가능 |
| `method: "script"` | `<env>.script` 실행(인자 passthrough) |
| `method: "workflow"` | `gh workflow run <env>.workflow --ref <branches.source>` |
| 그 외 | GUIDE-STOP — 지원 method(`script`/`workflow`) 안내 |

## Step 1 — 스코프 (targets → 레포 합집합)
- 인자 없음 → 전체 타깃 · 있음 → 매칭 타깃만(0건 → GUIDE-STOP, 선언 목록 안내).
- 선택 타깃 `repos[]` 합집합 dedup → 레포당 1회만 머지·배포. Step 2~4 git/gh 는 레포별 반복(`git -C <repo>`, PR 레포별).
- 부분 실행 시 잔여 미실행 타깃을 완료 보고에 경고.

## Step 2 — 머지 상태 감지 (결과 선출력, 이미 머지면 배포로 직행)
- **dev**: `git branch --show-current` 1개만(다수 feat 스캔·암묵 머지 금지). develop/staging/main 이면 "머지 불필요". feat 면 `git fetch --quiet origin && git log --oneline origin/develop..HEAD` — 0줄이면 "머지 불필요", 있으면 **/forge-pr 위임**.
- **stg**: `git fetch --quiet origin && git diff --stat origin/staging origin/develop`. staging 고유 발산 → [STOP] 조사. 델타 0 → 머지 스킵, [GATE-1] 후 배포(빈 PR 생성 금지).
- **prod**: `git fetch --quiet origin && git diff --stat origin/main origin/staging`. main 고유 발산 → [STOP] 조사. 델타 0 → Release MR 스킵, production-deploy 상태 실측만.

## Step 3 — 게이트
**dev**: `/forge-pr` 위임 PASS 후 dev 배포(미선언이면 머지 완료로 종료).

**stg — [HUMAN GATE-1]**
```
[GATE-1] staging 승격/배포 전 full forge-qa 진행 여부를 확인해주세요.
  (A) YES — /forge-qa full 실행 후 진행
  (B) NO  — forge-qa 스킵, 직행 (P6 QA 미통과 상태 명기, prod 전 반드시 통과 필요)
선택: A 또는 B
```
- 동일 스코프 forge-qa/game-qa PASS 증거(리포트 경로·커밋) 제시 시 (A) 충족 간주 — 근거 없는 스킵 금지.
- 승격: `gh pr create --base staging --head develop --title "chore(release): develop → staging" --body "develop→staging 승격. 델타: <요약>."` → `gh pr checks <PR#> --watch --interval 20` → `gh pr merge <PR#> --merge`(squash 아님 · `--delete-branch` 금지)
- CI FAIL → [STOP]. `gh` 부재 + FF 면 `git push origin origin/develop:staging`(프로젝트 룰 허용 시), 비FF → [STOP].

**prod — [STOP] Release MR (IRON)**
1. `gh run list --branch staging --limit 3` — staging CI green.
2. 대규모/고위험 시 `/codex-review --stage final --target staging --effort high --blocking`(headless → Opus code-reviewer 폴백 · develop 단계 cr-final PASS 면 생략).
3. `gh pr create --base main --head staging --title "release: staging → main" --body "staging→main 승격. 배포 대상 델타: <요약>. main push → production-deploy.yml."` → `gh pr checks <PR#> --watch --interval 20`
4. 출력 후 정지 — AI 는 `gh pr merge` 금지:
   ```
   [STOP] main 머지 = 프로덕션 자동 배포(비가역)입니다.
     - 배포 대상 제품 델타: <요약>
     - 롤백 경로: git revert <merge-sha> 후 재배포 / 직전 태그 재배포
   Human이 웹에서 검토·승인·머지하세요. AI는 머지하지 않습니다(IRON).
   ```
5. 머지 후 `gh run list --branch main --workflow="Production Deploy" --limit 1` → `gh run watch <run-id>` — Deploy·Smoke Test·Create Release **잡별** 확인, 서버 cron(≤5분) 후 프로덕션 URL assert.
- prod 확정 직전 `advisor-strategist` 자문(advisory-only, 실패 시 진행). 모델 = `advisor-spawn-guard.sh resolve` 출력(건너뛰기 금지 · `claude-fable-5-1`→`model:"fable"` · `claude-opus-5-5`→`model:"opus"` · `gpt-*` 면 `mcp__codex__codex` sandbox=read-only): `Agent(subagent_type="advisor-strategist", prompt="배포 대상·변경범위·CI 상태 3-5줄. 질문: 놓치기 쉬운 비가역 리스크와 즉시 롤백 트리거 2-3개는?")`

## Step 4 — 배포 실행
stg/prod 직전 정적 검증(WARN, kill-switch `FORGE_DEPLOY_LINT=off`, 규칙 미선언 시 skip):
`bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/deploy-workflow-lint.sh" .github/workflows [--rules <project-root>/.claude/deploy-lint-rules.json]`
- ERROR findings 는 Human 에게 명시 후 진행 여부 확인(hard-BLOCK 아님).
- 실행: `bash <env>.script [--dry-run] [--step=<name>] [--rollback [<ts>]]` 또는 `gh workflow run <env>.workflow --ref <branches.source>`
- exit 0 → 성공 + `healthcheck` 결과 보고. 미선언이면 `헬스 미측정(unmeasured)` 명시(성공 집계 금지, [STOP] 아님).
- exit ≠ 0 → [STOP] Human 에스컬레이션 — 에러 + 롤백 경로(`--rollback` 지원 시).
- 자격증명은 프로젝트 `.env` 참조만 — 값 출력 금지.

## `--reverse`
`dev --reverse` = main→develop 역머지 + dev 배포(미선언 = 머지만) · `stg --reverse` = main→staging 역머지 + staging 배포(선언 시) · `prod --reverse` = 즉시 거부
```bash
git checkout <develop|staging>
git merge main --no-ff -m "chore: reverse sync main → <target> (forge-deploy --reverse)"
git rev-list --count <target>..main   # 0 = 완전 동기화 (main..<target> 방향은 오탐)
```
- 충돌 → `git merge --abort` + [STOP](자동 해소 금지). 머지 성공+배포 실패 → 부분 완료 보고, 배포만 재시도(재머지 금지).

## `--dry-run` 보장
git write 0(checkout/merge/push/commit) · `gh pr create` 0 · script/workflow 미실행(`--dry-run` passthrough) · 출력은 판정·라우팅·게이트 도달 지점만.

## 실패 시 롤백
`/forge-rollback` — **L1**(<30분) 최근 커밋 revert · **L2**(<2시간) 이전 태그 재배포 · **L3**(>2시간) hotfix 브랜치 수정 후 재배포.
