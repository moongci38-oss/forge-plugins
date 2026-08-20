# Development Workflow Rules

## Git — Forge
- **"dev" 중의어 감지**: 사용자가 "dev"라고만 말하면 dev 서버(실행 환경)와 develop 브랜치(git) 둘 다 해석 가능하다 — 애매하면 어느 쪽인지 확인 후 진행한다. 근거: "dev에 적용됐어?"를 dev 서버로 해석해 1왕복 낭비(실의도=develop 브랜치). 폐기조건: 없음(경량 행동 가이드, 상시 적용).
- develop 브랜치에 먼저 커밋/푸시. main 직접 커밋 금지.
- **첫 커밋 전 `git branch -a`로 develop 실존 확인.** 없으면 만들고 시작한다 — "없으니 main에"로 흘러가는 것이 실제 사고 경로였다(2026-07-26 telegram-workspace).
- main 머지 시 develop도 동기화 유지 (둘 다 최신). develop 방치 금지.
- **레포별 "정본" 판정 SSoT = `CLAUDE.md §브랜치 / 배포`** — `${FORGE_ROOT:-$HOME/forge}`·`${FORGE_ROOT:-$HOME/forge}-outputs` = develop 정본, `${FORGE_ROOT:-$HOME/forge}-plugins-repo` = main 정본. "정본"이라 쓸 때는 항상 레포를 명시한다. 릴리스 흐름·근거 → `rules-on-demand/dev-workflow-detail.md §정본 판정 근거`
- 신규 브랜치는 항상 develop에서 분기(예외: `hotfix/*`만 라이브 브랜치에서 분기). ⚠️ **등록은 확정, 차단은 미측정 — 차단을 믿지 말고 규율로 지킨다.** `grep -c branch-base-develop $HOME/.claude/settings.json` → **1**(전역) · `grep -c branch-base-develop ${FORGE_ROOT:-$HOME/forge}/.claude/settings.json` → **1**(프로젝트, 2026-08-12 등록). **2026-08-11 까지의 "프로젝트 레인 0" 서술은 폐기한다** — 그때는 참이었고 지금은 아니다. 따라서 **팀원 환경에도 이 가드가 도달한다**(git 배포 — `git pull` 후 발효). 여전히 참인 것은 하나뿐이다: **등록돼 있다는 것과 실제로 `exit 2` 로 막는다는 것은 다른 주장이고, 차단 여부는 아직 아무도 실측하지 않았다.** 재현 방법·kill-switch `FORGE_BRANCH_BASE=off` → `rules-on-demand/dev-workflow-detail.md §branch-base-develop 실측`
  폐기조건: 차단 실효가 실측되면 "미측정" 문구를 그 결과로 교체한다.
- git push / git merge → allow (ask 금지). 파이프라인 흐름 유지.
- **`/dev/null` 은 리다이렉트로만 쓴다 — 인자로 전달 금지**(2026-07-31): Windows/MSYS 에서 인자 위치의 `/dev/null` 은 경로 변환돼 **조용히 실패**한다(`2>/dev/null` 은 안전, `--output /dev/null` 은 아님). 변환 경로·사례 → `rules-on-demand/windows-msys-pitfalls.md`
- CI PASS + 리뷰 완료 시 자동 머지 후 다음 작업 진행.
- **원격 부재 조기 감지**: 커밋을 만드는 프로젝트 레포에 `git remote` 0개면 **첫 커밋 시점에 사용자에게 원격 생성 제안**. 거절 시 세션 내 재제안 금지(1회 제안 원칙). AI 자율 생성 금지 — 외부 노출 행위라 제안까지만. 상세 → `rules-on-demand/dev-workflow-detail.md §원격 부재 기본 명령`
- **병행 세션 dirty tree 가 push(ff)를 막을 때 = 임시 워크트리 cherry-pick 런북**(D-2). `git stash`/`--autostash` **금지**(다른 세션 미커밋을 흡수 — 2026-07-27 실사고 경로), 남의 파일 커밋 금지. 실행 명령 + 9p/UNC 가 느릴 때의 temp-index `commit-tree` 변형 → `rules-on-demand/dev-workflow-detail.md §D-2 런북`
- **[Forge 개발 한정] PR 생성은 반드시 `/forge-pr` 로 진행한다** (cr-final 적대적 검수 + develop 자동 머지 게이트 경유). `gh pr create` 등 게이트 우회 직접 생성 금지.

### 작업은 머지까지가 완료다 — 브랜치 방치 금지 (Human 지시 2026-08-10)

**작업을 시작했으면 머지까지 끝낸다. "나중에 머지"로 남기지 않는다.**

쉽게 말하면: 빨래를 했으면 개서 서랍에 넣기까지가 빨래다. 널어둔 채로 두면 다음 사람이
그게 마른 건지 젖은 건지 몰라서 다시 만져야 한다.

- **완료 정의**: 브랜치를 만들었으면 그 세션 안에 **머지되거나 아카이브되거나** 둘 중 하나로
  끝난다. `push` 만 하고 PR 을 안 만들거나, PR 만 만들고 머지를 안 하고 세션을 닫지 않는다.
- **보류가 정당한 유일한 경우** = ①검수 FAIL 로 고쳐야 함 ②`[STOP]` Human 승인 대기
  ③명시적으로 다른 사람이 이어받기로 한 인계. 이 셋이 아니면 보류가 아니라 **미완료**다.
  보류할 때는 handover `§열린 PR·브랜치` 에 **왜 못 닫았는지**를 적는다.
- **가치 없는 브랜치도 방치하지 않는다.** 머지할 내용이 없다고 판명되면 **아카이브 태그를
  붙이고 브랜치를 지운다** — 그대로 두면 다음 세션이 "미머지 있음"으로 다시 조사한다.
  태그(`archive/<브랜치>-<YYYYMMDD>`)가 커밋을 보존하므로 삭제는 가역이다.
- **세션 종료 게이트**: `/forge-end` 전에 이 세션이 만든 브랜치가 전부 (머지 | 아카이브 |
  위 3 사유 중 하나로 기록됨) 인지 확인한다.

⚠️ **"충돌 없음"을 "안전함"으로 읽지 마라**(2026-08-10 실사고). git 이 clean 이라 해도
같은 변경이 **다른 줄 위치**로 이미 들어와 있으면 양쪽이 다 삽입돼 결과물이 깨진다.
실측: `forge-sync.mjs` → `SyntaxError: Identifier 'SIBLING_SKIP_ACCOUNTS' has already been
declared` · `dev-workflow-rules.md` → 같은 절 2회 삽입. **머지마다 커밋 전에 검증**한다 —
`.sh` `bash -n` · `.py` `py_compile` · `.mjs/.js` `node --check` · `.json` 파싱 ·
`.md` **두 검사를 다 돌린다** — ①중복 헤딩 `grep -E '^#{2,4} ' f | sort | uniq -d`
②본문 연속 중복 줄 `awk 'NF && $0==prev {print FILENAME": "FNR": "$0} {prev=$0}' f`.
실패하면 `git merge --abort` (`reset --hard` 금지 — 파괴적 명령 가드에 걸리고 남의 작업을 날린다).

⚠️ **②는 2026-08-12 에 추가했다. ①만으로는 이 절이 경고하는 바로 그 사고를 못 잡는다.**
같은 날 PR #246 이 이 파일에 `폐기조건:` 줄을 한 줄 더 넣었는데, 중복된 것이 헤딩이 아니라
**본문 줄**이라 ①은 0건으로 통과시켰다(PR #247 로 사후 수정). 검사를 건너뛴 게 아니라
**검사가 그 결함을 볼 수 없었다** — 쉽게 말하면 지붕만 보는 점검표로 마루가 꺼진 걸 놓친 것이다.
⚠️ 이 검사가 무력화되는 입력: **연속되지 않은** 중복(같은 문장이 파일의 떨어진 두 위치에)은
못 잡는다. 문단 단위 중복은 여전히 사람이 diff 를 읽어야 보인다.
폐기조건: 머지 후 중복 삽입 사고가 2분기 연속 0건이면 ②를 재검토한다.

- **재현(지금 방치분이 몇 개인지)**:
  ```bash
  for X in forge forge-outputs forge-plugins-repo; do
    git -C ~/$X fetch --prune origin >/dev/null 2>&1
    echo "$X: $(git -C ~/$X for-each-ref --format='%(refname:short)' refs/remotes/origin/ \
      | grep -vE 'origin/(HEAD|develop|main|staging)$' | wc -l)"
  done
  ```
- 근거: 2026-08-10 실측 — 미머지 브랜치 **134개** 누적. 전수 조사해보니 **106개는 내용이
  이미 develop 에 있거나 자동 생성분**이었다. 즉 실제 미반영은 소수인데 방치된 이름표가
  그것을 가려서, 매 세션 "미머지 있음"이 늑대소년이 돼 있었다.
- 폐기조건: 미머지 브랜치가 2분기 연속 상시 10개 미만으로 유지되면 이 절을 재검토한다.

### 지표·기준 분리 게이트 (Metric/Criteria Separation, E-3)

**측정 지표(무엇을 세나·분모·계산식)를 바꾸는 커밋과 판정 기준(임계값·PASS/FAIL 선)을 바꾸는 커밋을 분리한다.**
섞으면 판정이 움직인 원인을 지표·기준으로 분리할 수 없어 "개선했다"가 검증 불가능해진다.
지표 먼저 → 판정 무변경을 테스트로 고정 → 기준은 **후속 커밋**.

- "지표+임계값 동시 변경" 태스크는 **구현 착수 전에 둘로 쪼갠다.** 원자적 커밋과 충돌 아님(분할 지시) → `rules-on-demand/dev-workflow-detail.md §E-3 원자적 커밋 충돌 해명`
- 예외(동치 변환 근거 병기)·혼합 시 재현명령+수치 병기 규약·근거(PR #122) → `rules-on-demand/dev-workflow-detail.md §E-3 예외·근거`

## Spec 관리
- **[개발 프로젝트 한정] 기획의 상수값·수치값은 일반화해 테이블에 저장하고 그 값을 참조한다** (매직넘버 하드코딩 금지).
- 구현 진행 중인 Spec 문서(.spec.md) 사후 변경 금지.
- **구현 완료·배포 후 (B) 스펙 노후 예외**: 위 금지는 *구현 진행 중* 적용. 배포 후 코드 진화로 spec이 낡은 경우(B)는 별개 국면 — **Human 승인 하 spec 정정 허용**. AI 자동 spec 변경은 여전히 금지. 상세 → `rules-on-demand/dev-workflow-detail.md §스펙 노후 예외 상세`
- **배포·인프라 계획 문서 검수 권장**: 배포·인프라 계획 문서는 승인 전 `/cr-triple` 검수 **권장**(WARN 관례 — 자동 배선 아님).
- **부재 주장은 측정 명령 + 관측일 동반 필수**(2026-07-31): 규범·검증 문서에서 "X가 없다·0건이다"라고 쓸 때는 그 근거가 된 **측정 명령**과 **관측일**을 함께 적는다(예: `grep -rc X path/ → 0 (2026-07-31 관측)`). 수치는 그 시점의 **관측치**일 뿐이고 정본은 명령이다 — 명령이 없으면 나중에 재현·반증할 수 없고, 코드가 바뀌어도 문서의 "0건"이 그대로 남아 거짓 근거가 된다.

## SDD 자동 진입

**3조건 동시 충족** → 사용자 명시 요청 없어도 SDD 체인 자동 진입:
①개발 의도("구현해줘/만들어줘/개발해줘/추가해줘") ②기획서·Spec 존재(`**/docs/planning/active/*.md` · `.specify/specs/*.md` · `--plan|--spec` 인자 중 1+ — 2026-08-15 경로 확장: 플랫폼 레인(`forge-outputs/docs/planning/active/`)뿐 아니라 제품 레포 자체 경로도 포함. 근거: `harness-gaps/2026-08-09-sdd-auto-entry-unenforced.md` 조치1 — 제품 레포 기획서가 옛 경로 밖에 있어 조건②가 문자 그대로 불충족으로 오판될 여지가 있었다) ③변경 범위 ≥ 단일 파일(오타·1줄 수정 제외).

**체인**: `/spec-write` [STOP] → `/forge-implement` [STOP] → `/qa` → `/forge-pr`(cr-final+머지).

**예외 — 자동 발동 X**: 버그수정·긴급 hotfix → `/forge-fix`(또는 `/investigate`) · "리서치만/분석만/확인만" → 직접 응답 · 명시적 다른 슬래시 커맨드 → 그대로 따름.

안내 문구·비활성 스위치 → `rules-on-demand/dev-workflow-detail.md §SDD 안내 문구`

## 웹/데이터 버그 검증 강제

- 버그 수정 시 **웹(UI) 버그 = 실브라우저 GREEN 증거**(green screenshot/렌더) + **데이터 버그 = 실DB 행 실측 증거**(db_query_after) 의무.
- **`/forge-fix` 미경유 직접 수정도 이 원칙 적용(WARN)** — 프론트/DB레이어 파일 직접 편집 시 조사·검수 실증거 없이 완료선언 금지.
- **시각 검증 실패 시 3단 폴백**(2026-07-31): ①재시도 2회 ②정적 확인(DOM/aria 스냅샷·단위테스트)으로 대체하고 **대체 수단을 보고에 명시** ③불가 시 `시각 검증 미확인(unverified)` 을 그대로 적고 GREEN 주장 금지. **미확인은 PASS 도 FAIL 도 아니다**(어느 쪽으로도 집계 X). 요점은 순서가 아니라 **침묵으로 통과시키지 않는 것**이다. 근거·금지·도구별 구현 → `rules-on-demand/dev-workflow-detail.md §시각 검증 폴백 3단`

## 전역 무블로킹 롤아웃

새 기능·스크립트·규칙은 **전역 적용이 기본**(`$HOME/.claude` 미러 = 전 프로젝트 세션 공통). 어떤 세션에서도 **blocking 없이** 발효되게 구현한다 — ①**SSoT+전파**(`${FORGE_ROOT:-$HOME/forge}` 커밋 → `forge-sync.mjs sync`) ②**경로 강건**(`${FORGE_ROOT:-$HOME/forge}/...` 절대·변수, CWD 상대경로 금지) ③**Fail-open**(참조 실패 시 안전 기본값 진행, 무단 hard-BLOCK hook 금지 — AD-168 WARN-first) ④**무설정 동작**(env·설정 기본값 graceful). 4원칙 상세·위반 예 → `rules-on-demand/dev-workflow-detail.md §무블로킹 4원칙 상세`

- **커밋 = 발효 아님**: 룰·스킬·훅은 SSoT 커밋 후 `forge-sync sync` 미러 전파까지 마쳐야 발효된다 — **"SSoT 에 있음 != 발효 중"**. sync 누락 시 전파가 조용히 멈춘다 → `rules-on-demand/dev-workflow-detail.md §미러 전파 누락 실측`
  - ⚠️ **훅에는 sync 로 발효되지 않는 계열이 있다**(갭 G-12). 등록이 `$HOME/forge` 로 해석되면 발효 조건은 sync 가 아니라 **`git -C ${FORGE_ROOT:-$HOME/forge} pull`** 이다. 훅을 고쳤는데 안 들으면 이걸 먼저 의심한다. 실측치·경로 이원화 → `rules-on-demand/dev-workflow-detail.md §훅 발효 경로 이원화`

### 팀 전파 판정 의무 (Human 지시 2026-08-10 — 하네스 변경 전량 적용)

**하네스 자산(훅·룰·스킬·커맨드·에이전트)을 추가·수정·삭제할 때는 "팀원에게 어떻게 도달하는가"를 함께 판정하고 완료 보고에 1줄로 남긴다.** 내 머신에서 되는 것과 팀원 머신에서 되는 것은 다르다 — 그 차이를 안 보면 "정리했다"가 나 혼자만의 사실이 된다.

- **전파 레인 4개**: ①**레포 파일**(`git pull`) ②**미러**(`forge-sync sync`) ③**마켓플레이스 플러그인**(`forge-plugins` **main** — develop 머지만으론 사용자에게 안 감) ④**훅 등록**(`settings.json`). ④는 둘로 갈린다: **프로젝트**(`$FORGE_ROOT/.claude/settings.json` = git 배포 → 팀원 자동) / **전역**(`$HOME/.claude/settings.json` = git 밖, 각 머신 → **전파 안 됨**).
- **전역 레인에만 가한 변경은 "전파 0"으로 보고한다** — 그것을 "정리 완료"라고 쓰지 않는다.
- **프로젝트 레인의 보안 훅 등록을 "중복"이라며 빼지 않는다.** 중복 판정의 전제("전역에도 있다")는 내 머신에서만 참이고, 프로젝트 레인이 팀원의 유일한 자동 보호선이다.
- **삭제는 전파되지 않는다**: `forge-sync sync` 는 복사만 하고 지우지 않는다 — 삭제 시 `forge-sync prune` 대상 여부를 명시한다(`prune --apply` 일괄 실행 금지, 선별만).
- **재현(둘 다 읽기 전용)**: `bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/register-forge-hooks.sh" --verify` · `bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/mirror-orphan-triage.sh"`
- 레인별 함정("forge 에 없다"≠"지워도 된다") · 등록 제거 전파법(`DEPRECATED` 목록) · 근거 실측치·정정 이력 → `rules-on-demand/dev-workflow-detail.md §팀 전파 판정 의무 상세`

폐기조건: 훅 등록이 레포 한 곳으로 단일화되고 `forge-sync sync` 가 삭제까지 반영하면 이 절의 ④·삭제 항을 재검토한다.

## 컨펌 공유 워크플로

- **트리거(자동)**: 컨펌 게이트 마커(`[STOP] 승인 대기`·`컨펌 필요`·`사인오프`)를 가진 기획·계획서·디자인을 **확정하는 시점**에 `/forge-share-confirm`(모드 A) 발행을 proactively 실행한다 — 모든 `[STOP]` 게이트를 대체하지는 않는다(팀 사인오프 문서 한정).
- 결정은 SSoT(계획서 상태 필드 + confirm-ledger)에 기록 + **같은 URL 재발행**으로 반영. 운용 상세 → `rules-on-demand/dev-workflow-detail.md §컨펌 공유 워크플로 상세`

## 세션 경계 (CRITICAL — 2026-07-01 Human 명시)

- **플랫폼 세션 ≠ 제품 코드 수정.** `11-platform`·`forge-outputs` 세션은 플랫폼 메타작업(skills·agents·pipelines·rules·hooks·commands) 전용. 제품 코드(admin-renew·portfolio·GodBlade) **편집·커밋·푸시 금지** — read-only 검증·발견까지만, 수정은 해당 제품 세션이 한다.
- 제품 repo에 적용할 것이 생기면 **위임 브리프**를 산출한다(선례: `os-v2-briefs/2026-07-27-a16-product-repo-claude-md-brief.md`).

## 도메인 한정 룰 (on-demand)

PPT / GodBlade 경로 / Article 스킬 → `rules-on-demand/dev-workflow-detail.md`
