# Development Workflow Rules

> 이하 `detail` = `rules-on-demand/dev-workflow-detail.md`. 여기엔 **결정·금지·기본값만** 남겼고 경위·실측·사고 사례·운용
> 절차는 전부 그 파일에 있다(2026-09-11 L1 감량 — **삭제 0, 전부 이동**). **절차를 밟기 전에 해당 `§` 를 연다.**

## Git — Forge
- **"dev" 중의어 감지**: "dev" 만 말하면 dev **서버**(실행 환경)와 **develop 브랜치**(git) 둘 다 된다 — 애매하면 어느 쪽인지 확인 후 진행한다.

- **`develop` 에 먼저 커밋/푸시한다. 배포 브랜치 직접 커밋 금지.** 배포 브랜치 머지 후 develop 도 동기화 유지(방치 금지).
  ⚠️ **배포 브랜치는 이름이 아니라 역할이다** — 레포마다 다르다(forge 계열 `main` · pikla 5개 `production`).
- 어느 브랜치가 정본·배포인지는 **그 레포 `CLAUDE.md §브랜치 / 배포`** 가 정한다. ⛔ 위 "배포 브랜치 직접 커밋 금지"를 "정본 브랜치 직접 커밋 금지"로 바꾸지 마라 — forge 계열은 develop 이 정본이라 첫 줄과 충돌한다 → `detail` §정본 판정 근거
- **신규 브랜치는 항상 develop 분기**(예외 `hotfix/*` 만 라이브 브랜치). 훅이 차단한다(kill-switch `FORGE_BRANCH_BASE=off`). ⚠️ 팀원 머신 발효는 `git pull` 에 달린 별개 축 → `detail` §branch-base-develop 실측
- **[Forge 개발 한정] PR 생성은 반드시 `/forge-pr`** (cr-final 검수 + develop 자동 머지 게이트). `gh pr create` 등 우회 금지.
- git push·merge = allow(ask 금지) · CI PASS + 리뷰 완료 시 자동 머지. 그 밖 이관분 → `detail` §Git — L1 감량 이관분
- **develop 머지는 AI 가 한다 — 전 프로젝트 공통 (사람 지시 2026-09-16).** 검수가 통과하면 **사람을 기다리지 않고 AI 가 머지까지 끝낸다.** 무확인 실행의 **머신별 사전조건**은 `gh pr merge` allowlist(`~/.claude/settings.json` `permissions.allow`)이며, 이 전역 설정은 git 으로 팀원에게 전파되지 않는다.
  allowlist 가 없는 머신에서는 도구의 권한 승인 경로로 폴백한다 — 승인 대기 사유를 명시하고, 허용되면 AI 가 머지를 완료한다(설정을 자동으로 완화하지 않는다).
  ⚠️ **머지 실행 권한 ≠ 검수 판정.** `stop_human`·`--allow-extra-round`(라운드 상한)는 "검수가 통과 못 했다"는 뜻이지 "사람이 머지 버튼을 눌러야 한다"가 아니다. 원장이 `merge`(rc=0)를 내면 AI 가 머지한다. **이 둘을 섞어 "사람이 해야 한다"로 읽지 마라** — 2026-09-16 에 세션이 그렇게 읽고 여러 번 멈췄다.
  ⚠️ **develop 한정이다.** `main`·`production` 등 **배포 브랜치는 위 "배포 브랜치 직접 커밋 금지"** 를 그대로 따른다.
  근거: 사람 지시 2026-09-16 "모든 프로젝트에 한해서 develop 머지는 AI 즉 LLM 이 자동으로 하는 거야, forge-pr 호출해도 그렇게 되는 거고" · 폐기조건: 사람이 develop 머지 실행 주체를 변경하면 이 규칙을 갱신한다(머신별 allowlist 부재는 위 폴백으로 처리).

### 작업은 머지까지가 완료다 (Human 지시 2026-08-10)

- 브랜치를 만들었으면 그 세션 안에 **머지 | 아카이브** 중 하나로 끝낸다. push 만 하거나 PR 만 만든 채 세션을 닫지 않는다.
- **보류가 정당한 4사유** = ①검수 FAIL ②`[STOP]` 승인 대기 ③명시적 인계 ④**쿼터 대기**(`cr-budget.sh enqueue` 기록 · TTL 48h · 만료 시 사람 판단). 그 밖은 미완료다. 보류 시 handover `§열린 PR·브랜치` 에 사유를 적는다.
  근거: 사람 승인 2026-09-16(Codex 주간 한도 소진 — 계획서 review-diet A4) · 폐기조건: Codex 한도가 병목이 아니게 되면 ④를 지운다.
- 가치 없는 브랜치도 `archive/<브랜치>-<YYYYMMDD>` 태그 후 삭제(가역). `/forge-end` 전에 이 세션 브랜치가 전부 (머지|아카이브|4사유 기록) 인지 확인 → `detail` §브랜치 방치 금지 — 근거·재현
- ⚠️ **"충돌 없음" ≠ 안전** — 같은 변경이 다른 줄 위치로 들어와 있으면 양쪽이 삽입돼 깨진다. 머지마다 커밋 전에 구문 검증(`bash -n` · `py_compile` · `node --check` · JSON 파싱) + `.md` 는 **2종 다** ①`grep -E '^#{2,4} ' f | sort | uniq -d` ②`awk 'NF && $0==prev {print FILENAME": "FNR": "$0} {prev=$0}' f`. 실패 시 `git merge --abort`(`reset --hard` 금지).
  ⚠️ ①만으로는 본문 줄 중복을 0건으로 통과시킨다 — 그래서 ②가 있다 → `detail` §머지 후 중복 삽입 검사 — 근거

## Spec 관리

- 구현 진행 중인 Spec(.spec.md) **사후 변경 금지.** 배포 후 낡은 spec 은 Human 승인 하 정정 허용 — **AI 자동 변경은 여전히 금지** → `detail` §스펙 노후 예외 상세
- **부재 주장은 측정 명령 + 관측일 동반 필수**(예: `grep -rc X path/ → 0 (2026-07-31 관측)`). 정본은 수치가 아니라 명령이다.

## SDD 자동 진입

- **3조건 동시 충족** 시 명시 요청 없어도 진입: ①개발 의도("구현/만들어/개발/추가해줘") ②기획서·Spec 존재(`**/docs/planning/active/*.md` · `.specify/specs/*.md` · `--plan|--spec` 중 1+ — **제품 레포 자체 경로도 포함**) ③변경 범위 ≥ 단일 파일(오타·1줄 제외).
- **체인**: `/spec-write` [STOP] → `/forge-implement` [STOP] → `/qa` → `/forge-pr`(cr-final+머지).
- ⚠️ **P2·P3 산출물이 이미 있을 때 전용이다** — 기획서(PRD/GDD)만 있고 P3 패키지(spec-kernel·architecture·roadmap)가 없으면 **`/forge-plan` 먼저**. ②의 "기획서 존재" ≠ "P3 완료".
- 자동 발동 X: 버그수정·hotfix → `/forge-fix`(또는 `/investigate`) · "리서치만/분석만" → 직접 응답 · 명시적 다른 커맨드 → 그대로 → `detail` §SDD 자동 진입 — 경로 확장·P3 선행 근거

## 웹/데이터 버그 검증 강제

- 웹(UI) 버그 = **실브라우저 GREEN 증거**, 데이터 버그 = **실DB 행 실측 증거**(db_query_after) 의무. `/forge-fix` 미경유 직접 수정도 적용(WARN).
- 시각 검증이 안 되면 `시각 검증 미확인(unverified)` 을 적고 **GREEN 주장 금지** — **미확인은 PASS 도 FAIL 도 아니다** → `detail` §시각 검증 폴백 3단

## 전역 무블로킹 롤아웃

- 새 기능·스크립트·규칙은 **전역 적용이 기본**(`~/.claude` 미러 = 전 프로젝트 공통). 어떤 세션에서도 blocking 없이 발효되게 — ①SSoT+전파 ②경로 강건(`${FORGE_ROOT:-$HOME/forge}/...` 절대·변수, **CWD 상대경로 금지**) ③Fail-open(**무단 hard-BLOCK hook 금지** — AD-168) ④무설정 동작 → `detail` §무블로킹 4원칙 상세
- **커밋 = 발효 아님**: SSoT 커밋 후 `forge-sync sync` 까지 마쳐야 발효된다 — "SSoT 에 있음 != 발효 중"(누락 시 전파가 조용히 멈춘다) → `detail` §미러 전파 누락 실측
- ⚠️ 훅에는 sync 로 발효되지 않는 계열이 있다(G-12) — 등록이 `$HOME/forge` 로 해석되면 조건은 **`git -C ~/forge pull`** 이다. 훅이 안 들으면 이걸 먼저 의심한다 → `detail` §훅 발효 경로 이원화

### 팀 전파 판정 의무 (Human 지시 2026-08-10 — 하네스 변경 전량 적용)

- 하네스 자산(훅·룰·스킬·커맨드·에이전트) 추가·수정·삭제 시 **"팀원에게 어떻게 도달하는가"를 판정해 완료 보고에 1줄 남긴다.**
- **전파 레인 4개**: ①레포 파일(`git pull`) ②미러(`forge-sync sync`) ③플러그인(`forge-plugins` **main** — develop 머지만으론 안 감) ④훅 등록 = 프로젝트(`$FORGE_ROOT/.claude/settings.json`, git 배포 → 팀원 자동) / 전역(`$HOME/.claude/settings.json`, git 밖 → **전파 안 됨**).
- **전역 레인에만 가한 변경은 "전파 0"으로 보고한다** — "정리 완료"라고 쓰지 않는다. **삭제도 전파되지 않는다**(`forge-sync sync` 는 복사만).
- ⛔ 훅 등록을 빼거나 "중복"으로 판정하기 전에 `detail` 을 읽는다 — 프로젝트 레인이 팀원의 유일한 자동 보호선이다 → `detail` §팀 전파 판정 의무 상세

## 세션 경계 (CRITICAL — 2026-07-01 Human 명시)

- **플랫폼 세션 ≠ 제품 코드 수정.** `11-platform`·`forge-outputs` 세션은 플랫폼 메타작업(skills·agents·pipelines·rules·hooks·commands) 전용. 제품 코드(admin-renew·portfolio·GodBlade) **편집·커밋·푸시 금지** — read-only 검증·발견까지만(수정은 해당 제품 세션이 한다).
- 제품 repo 에 적용할 것이 생기면 **위임 브리프**를 산출한다 → `detail` §원문 보존 — dev-workflow-rules.md 압축분

## 조건부 규범 — 트리거 때만 `detail` 을 연다

| 트리거 | 지금 지킬 것 | `detail` 전문 |
|---|---|---|
| 리포트 사이트에 **발행**하거나 사이트 코드(`shared/scripts/report-site-build.py` · `.site/functions/`)를 고친다 | **`git pull` → 내 변경 커밋 → 올린다**(통째 재생성이라 낡은 원고는 팀원 페이지를 조용히 지운다) · ⛔ **빌더가 뒤처지면 그 회차 배포를 중단한다(`rc=1` — 2026-09-07 "경고만"에서 승격)**, 우회 `FORGE_PUBLISH_ALLOW_STALE_BUILDER=1` · **발행 머신 = WSL `Ubuntu-C` 1대**(⛔ 타 머신 cron 금지) · ⚠️ **착수 전 필독** — 판정 함정 6개·구획 가드·env 플래그 | §리포트 사이트 — 발행 절차·판정 함정 전문 · §발행 머신 1대 — 근거 실측치 |
| 지표(계산식)와 판정 기준(임계값)을 같이 바꾼다 | **커밋을 분리한다**(E-3) — 착수 전에 쪼갠다 | §E-3 예외·근거 · §E-3 원자적 커밋 충돌 해명 |
| 컨펌 마커(`[STOP] 승인 대기`·`컨펌 필요`·`사인오프`) 문서를 확정한다 | `/forge-share-confirm`(모드 A) 발행 + SSoT 기록 + **같은 URL 재발행** | §컨펌 공유 워크플로 상세 |
| 레포에 **첫 커밋**을 만든다 | `git branch -a` 로 develop 실존 확인(없으면 만들고 시작) · 원격 0개면 생성 **제안까지만**(AI 자율 생성 금지) | §원격 부재 기본 명령 |
| 병행 세션 dirty tree 가 **push(ff)를 막는다** | 임시 워크트리 cherry-pick(D-2) · ⛔ `git stash`/`--autostash` 금지(남의 미커밋 흡수) · ⛔ 남의 파일 커밋 금지 | §D-2 런북 |
| 매직넘버·배포/인프라 계획 문서를 쓴다 | 상수는 테이블화 참조 · 승인 전 `/cr-triple` 검수 권장(WARN) | §Spec 관리 — L1 감량 이관분 |
| 명령줄에 `/dev/null` 을 쓴다 | 리다이렉트로만 — **인자 전달 금지**(MSYS 가 조용히 실패) | `rules-on-demand/windows-msys-pitfalls.md` |
| PPT · GodBlade 경로 · Article 스킬 | — | `rules-on-demand/dev-workflow-detail.md` |
