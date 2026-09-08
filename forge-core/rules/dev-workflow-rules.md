# Development Workflow Rules

## Git — Forge
- **"dev" 중의어 감지**: 사용자가 "dev"라고만 말하면 dev 서버(실행 환경)와 develop 브랜치(git) 둘 다 해석 가능하다 — 애매하면 어느 쪽인지 확인 후 진행한다. 근거: "dev에 적용됐어?"를 dev 서버로 해석해 1왕복 낭비(실의도=develop 브랜치). 폐기조건: 없음(경량 행동 가이드, 상시 적용).
- **통합 브랜치(`develop`)에 먼저 커밋/푸시한다. 배포 브랜치에 직접 커밋하지 않는다.**
  ⚠️ **배포 브랜치는 이름이 아니라 역할이다** — 레포마다 이름이 다르다(forge 계열 `main` · pikla 5개 `production`).
  그 레포의 이름이 무엇인지는 아래 §정본 판정 SSoT 가 가리키는 **그 레포 CLAUDE.md** 가 정한다.
  ⛔ 이 문장을 "**정본** 브랜치 직접 커밋 금지"로 바꾸지 마라 — `${FORGE_ROOT:-$HOME/forge}`·`${FORGE_ROOT:-$HOME/forge}-outputs` 는 **develop 이 정본**이라
  그 순간 "develop 커밋 금지"가 되어 바로 윗줄과 충돌한다(2026-08-13 검토에서 걸러낸 오답).
  근거: 전역 지침이 배포 브랜치를 `main` 이라는 **이름**으로 적어서, 그 자리가 `production` 인 pikla 가 자기
  CLAUDE.md 에 예외 선언을 달아 덮어야 했다. 예외가 두 곳에 흩어져 매 세션 어느 쪽이 정본인지 다시 확인했다.
  폐기조건: 모든 레포의 배포 브랜치 이름이 실제로 하나로 통일되면 이 절을 그 이름으로 되돌린다.
- **첫 커밋 전 `git branch -a`로 develop 실존 확인.** 없으면 만들고 시작한다 — "없으니 배포 브랜치에"로 흘러가는 것이 실제 사고 경로였다(2026-07-26 telegram-workspace).
- 배포 브랜치로 머지한 뒤에는 develop도 동기화 유지 (둘 다 최신). develop 방치 금지.
- **레포별 "정본" 판정 SSoT = `CLAUDE.md §브랜치 / 배포`** — `${FORGE_ROOT:-$HOME/forge}`·`${FORGE_ROOT:-$HOME/forge}-outputs` = develop 정본, `${FORGE_ROOT:-$HOME/forge}-plugins-repo` = main 정본. "정본"이라 쓸 때는 항상 레포를 명시한다. 릴리스 흐름·근거 → `rules-on-demand/dev-workflow-detail.md §정본 판정 근거`
- 신규 브랜치는 항상 develop에서 분기(예외: `hotfix/*`만 라이브 브랜치에서 분기). ✅ **차단이 실제로 작동한다(2026-08-29 실측)** — develop 이 아닌 base 로 브랜치를 만들려 하자 훅이 `BLOCKED (branch-base-develop)` 로 **거부**했다(`git worktree add ... -b feat/x <비-develop-sha>` → 브랜치 미생성). 즉 이건 규율이 아니라 **집행선**이다. 전역·프로젝트 레인에 각 1건 등록돼 **팀원 환경에도 도달한다**(git 배포 — `git pull` 후 발효). kill-switch `FORGE_BRANCH_BASE=off`.
  ⚠️ 구 서술 **"등록은 확정, 차단은 미측정 — 차단을 믿지 말고 규율로 지킨다"** 는 **폐기**한다(2026-08-29). 그때는 참이었다 — 등록만 확인됐고 아무도 차단을 재보지 않았다. 이제 재봤다.
  ⚠️ **여전히 참인 것**: 실측한 것은 *이 머신·이 경로*의 1건이다. 팀원 머신에서의 발효는 `git pull` 여부에 달렸고 그건 별개 축이다.
  재현(⚠️ 실제로 브랜치를 만들려 시도한다 — 성공하면 지워라): `git worktree add /tmp/bbd-probe -b probe/base-check <develop 아닌 sha>` → `BLOCKED` 면 집행 중.
  등록 실측치·상세 → `rules-on-demand/dev-workflow-detail.md §branch-base-develop — 등록 실측치` · `§branch-base-develop 실측`
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

⚠️ **"충돌 없음"을 "안전함"으로 읽지 마라.** git 이 clean 이라 해도 같은 변경이 **다른 줄 위치**로
이미 들어와 있으면 양쪽이 다 삽입돼 결과물이 깨진다. **머지마다 커밋 전에 검증**한다 —
`.sh` `bash -n` · `.py` `py_compile` · `.mjs/.js` `node --check` · `.json` 파싱 ·
`.md` **두 검사를 다 돌린다** — ①중복 헤딩 `grep -E '^#{2,4} ' f | sort | uniq -d`
②본문 연속 중복 줄 `awk 'NF && $0==prev {print FILENAME": "FNR": "$0} {prev=$0}' f`.
실패하면 `git merge --abort` (`reset --hard` 금지 — 파괴적 명령 가드에 걸리고 남의 작업을 날린다).
⚠️ **①만으로는 이 절이 경고하는 바로 그 사고를 못 잡는다** — 중복이 헤딩이 아니라 본문 줄이면 ①은 0건으로 통과시킨다. 그래서 ②를 2026-08-12 에 추가했다.
실측 사례·무력화 입력(연속되지 않은 중복은 못 잡는다)·폐기조건 → `rules-on-demand/dev-workflow-detail.md §머지 후 중복 삽입 검사 — 근거`

- 재현(지금 방치분이 몇 개인지)·근거(2026-08-10 실측 — 미머지 134개 중 106개가 이미 반영분이라 "미머지 있음"이 늑대소년이 돼 있었다)·폐기조건 → `rules-on-demand/dev-workflow-detail.md §브랜치 방치 금지 — 근거·재현`

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
①개발 의도("구현해줘/만들어줘/개발해줘/추가해줘") ②기획서·Spec 존재(`**/docs/planning/active/*.md` · `.specify/specs/*.md` · `--plan|--spec` 인자 중 1+ — 플랫폼 레인(`forge-outputs/docs/planning/active/`)뿐 아니라 **제품 레포 자체 경로도 포함**한다, 2026-08-15 확장) ③변경 범위 ≥ 단일 파일(오타·1줄 수정 제외). 경로 확장 근거 → `rules-on-demand/dev-workflow-detail.md §SDD 자동 진입 — 경로 확장·P3 선행 근거`

**체인**: `/spec-write` [STOP] → `/forge-implement` [STOP] → `/qa` → `/forge-pr`(cr-final+머지).

⚠️ **이 체인은 P2·P3 산출물이 이미 있을 때 전용이다.** 기획서(PRD/GDD)만 있고 **P3 기획 패키지
(spec-kernel·architecture·roadmap)가 없으면 `/forge-plan` 을 먼저 거친다** — 위 체인은 Spec 작성부터라
P3 를 건너뛴다. 조건②의 "기획서 존재"가 곧 "P3 완료"를 뜻하지 않는다.
근거·재현·폐기조건 → `rules-on-demand/dev-workflow-detail.md §SDD 자동 진입 — 경로 확장·P3 선행 근거`

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

## 리포트 사이트 — 발행·수정 전 동기화 (Human 지시 2026-09-06)

**`forge-reports.pages.dev` 에 발행하기 전, 그리고 사이트 기능·카테고리를 고치기 전에 `git pull` 로 최신을 받고 내 변경은 커밋한 뒤에 올린다.**

쉽게 말하면 이 사이트는 **매번 통째로 다시 찍어내는 인쇄물**이다. 낡은 원고로 찍으면 그 사이 팀원이 넣은 페이지가 **충돌 없이 조용히 사라진다.**

- **콘텐츠 발행** = `report-site-publish.sh` 의 `_sync_sources()` 가 **자동 집행**한다(2026-09-06 배선). `$FORGE_OUTPUTS` 가 뒤처지면 ff-only pull, 못 당기면 **배포 중단**. 끄기 `FORGE_PUBLISH_ALLOW_STALE=1`.
- **사이트 기능·카테고리 수정**(`shared/scripts/report-site-build.py` · `.site/functions/`) = **사람·에이전트가 지킨다.** 편집 **전에** `git -C "$FORGE_ROOT" pull` — 안 하면 팀원이 추가한 카테고리를 덮어써 없앤다. 실행 중 스크립트 교체는 그 자체가 사고라 스크립트는 경고만 하고 자동 pull 하지 않는다.
- ⚠️ pull 이 막히면 **`git stash` 로 밀어내지 말 것**(남의 미커밋을 흡수한다 — §D-2). 막는 변경을 **커밋**하고 다시 pull 한다. 훅 append 파일(`learnings.jsonl` 등)이 막으면 백업 → `git show HEAD:<경로> > <경로>` → pull → 고유 줄 재append 로 분기 없이 푼다.
- ⚠️ **발행 성공을 HTTP 401 로 판정하지 마라** — 게이트가 모든 경로를 401 로 받아 **없는 페이지도 401** 이다. 정본 증거 = `발행 완료` 로그 + `.site-state/entries.tsv` 갱신 + wrangler `Deployment complete`.
- ⚠️ **`FORGE_SITE_ALLOW_EMPTY=1` 로 뚫지 마라.** 구획이 0 건이면 그 머신의 원본이 불완전하다는 신호다. **비교 기준은 "직전 배포"가 아니라 "마지막 온전한 배포"** — 직전이 이미 깎여 있으면 "차이 없음"이 정상으로 보인다. 2026-09-05 에 그 함정에 빠져(직전 스냅샷만 대조) 이미 깎인 사이트(위키 139→119·아티팩트 24→0)를 override 로 다시 굳혔다. 구획이 비었으면 **원본이 온전한 머신에서 발행**한다.
- **구획 가드는 이름을 모른다(2026-09-07 갱신).** 구판은 `wiki`·`artifact` **두 이름만** 0 인지 봤다 — 팀원이 새 탭을 추가하면(「지원사업」 등) 보호 대상이 아니라 조용히 사라졌다. 지금은 마지막 온전한 배포의 **구획별 최대치**를 `.site-state/section-highwater.tsv` 에 적어두고 그보다 줄면 막는다. **새 카테고리는 한 번 배포되면 그 머신에서 자동으로 보호된다.**
  - ⚠️ **팀 전파는 자동이 아니다** — 기준선 갱신은 로컬 파일에만 쓰인다. 그 파일(`section-highwater.tsv`)을 **사람이 커밋**해야 팀원에게 도달한다. 발행 자동 커밋 레인에 넣지 않는 이유는 그렇게 하면 **성공 배포가 다음 배포의 ff-only pull 을 막기** 때문이다(공유 체크아웃은 dirty 로 남는데 origin 만 바뀐다).
  - 소폭 감소(기본 2건)는 통과 + 경고. 상한 = `FORGE_SITE_SHRINK_TOLERANCE`.
  - 의도적 삭제·리네임은 `FORGE_SITE_ACCEPT_SHRINK=1` 로 승인한다 — ⚠️ **env 라 1회성이 아니다.** 매 회차 로그에 그 경고가 보이면 지우지 않은 것이고, 그대로 두면 기준선이 깎여 **가드가 스스로 풀린다**.
  - ⚠️ **빌더가 뒤처지면 새 카테고리는 애초에 생기지 않는다** — 가드는 "사라지는 것"만 막는다. 발행 전 `git -C "$FORGE_ROOT" pull` 은 여전히 사람 몫이고, 로그의 `빌더(...)가 N 커밋 뒤처짐` 경고를 발행과 무관한 것으로 읽지 마라(2026-09-07 실사고: 25커밋 뒤처진 빌더가 「지원사업」 3건을 통째로 빠뜨렸다).
- **발행 머신은 1대다 — WSL `Ubuntu-C` (2026-09-07 결정).** 사이트는 매 회차 통째로 다시 찍으므로 발행자가 N대면 사이트는 "가장 좋은 쪽"이 아니라 **가장 낡은 쪽으로 수렴**한다. ⛔ 다른 머신에 발행 cron 을 새로 걸지 마라. ⚠️ **`hostname` 으로 발행 머신을 판별하지 마라 — 두 배포판이 같다.** 대수 확인·판별 함정·단일 발행기의 대가 → `rules-on-demand/dev-workflow-detail.md §발행 머신 1대 — 근거·재현`

근거: 2026-09-05 원본 없는 머신이 발행해 위키 139·아티팩트 24건 소실(롤백 복구) · 2026-09-06 실측에서 `forge-outputs` 2커밋·`${FORGE_ROOT:-$HOME/forge}` 24커밋 뒤처진 채 발행 직전이었다 · 2026-09-07 176커밋 뒤처진 `Ubuntu-22.04` 가 매시 :25 에 사이트를 1,873→1,623건으로 덮었다.
폐기조건: 사이트가 증분 발행(전체 재생성 아님)으로 바뀌면 이 절을 재검토한다.

## 컨펌 공유 워크플로

- **트리거(자동)**: 컨펌 게이트 마커(`[STOP] 승인 대기`·`컨펌 필요`·`사인오프`)를 가진 기획·계획서·디자인을 **확정하는 시점**에 `/forge-share-confirm`(모드 A) 발행을 proactively 실행한다 — 모든 `[STOP]` 게이트를 대체하지는 않는다(팀 사인오프 문서 한정).
- 결정은 SSoT(계획서 상태 필드 + confirm-ledger)에 기록 + **같은 URL 재발행**으로 반영. 운용 상세 → `rules-on-demand/dev-workflow-detail.md §컨펌 공유 워크플로 상세`

## 세션 경계 (CRITICAL — 2026-07-01 Human 명시)

- **플랫폼 세션 ≠ 제품 코드 수정.** `11-platform`·`forge-outputs` 세션은 플랫폼 메타작업(skills·agents·pipelines·rules·hooks·commands) 전용. 제품 코드(admin-renew·portfolio·GodBlade) **편집·커밋·푸시 금지** — read-only 검증·발견까지만, 수정은 해당 제품 세션이 한다.
- 제품 repo에 적용할 것이 생기면 **위임 브리프**를 산출한다(선례: `os-v2-briefs/2026-07-27-a16-product-repo-claude-md-brief.md`).

## 도메인 한정 룰 (on-demand)

PPT / GodBlade 경로 / Article 스킬 → `rules-on-demand/dev-workflow-detail.md`
