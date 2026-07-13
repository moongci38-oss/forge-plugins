---
name: qa
description: QA 전 사이클 오케스트레이터 (AD-93 Phase A~H). spec FR 기반 시나리오 전수→버그 발견(Phase A~C, Lane B) — 발견된 버그는 Lane A(/forge-fix ①~④)로 위임 수정·검수→develop 자동 머지→Wiki 축적. 스코프 지정 가능 (--scope=full|domain|file-pattern) + Phase C.5 spec-code 방향판별 게이트.
role: orchestrator
user-invocable: true
model: sonnet
---

**역할**: QA 전 사이클 오케스트레이터 (AD-93). Phase A~H 전체를 메인 컨텍스트에서 순서대로 실행한다. **spec 기반**(Lane B): 시나리오는 Spec FR 우선 출처(코드 역산 금지) + 기능구현 미비 체크. 발견된 버그의 수정·검수는 Lane A(`/forge-fix`)로 위임한다(plan v1.1).
**컨텍스트**: P5 Check P5.7-X PASS 후 자동 트리거 또는 `/qa` 호출 시. 메인 컨텍스트 직접 실행 (context:fork 폐지 — AD-92-1).
**출력**: `docs/qa/YYYY-MM-DD-final-qa-report.md` + `docs/qa/baseline.json` + PR (develop 자동 머지)

> **plan v1.1 (2026-07-03)**: SSoT = `11-platform/pipelines/forge-dev/2026-07-03-v1-bugfix-pipeline-unification/plan.md`. qa = 발견 전용(Phase A~C, Lane B) — 자체 수정 로직 없음. 발견된 버그는 Lane A 엔진(`/forge-fix` ①~④ + 게이트 R/G)으로 위임한다.

# QA — E2E 자율 QA 파이프라인 (AD-93, Phase A~H)

> **AD-92-1**: 메인 컨텍스트 실행. 서브에이전트 스폰은 메인→1레벨만 (중첩 금지 — Claude Code 공식 제약).
> **AD-92-2**: 기대값 = Spec/Human/레거시. 코드 역산 금지.
> **AD-92-3**: DB 변이 테스트 = 트랜잭션 롤백 or 매 사이클 seed 재주입.

## 사용법

```
/qa                                       # 전체 QA (Phase A~H, --scope=full)
/qa --scope=auth                          # auth 도메인만 (qa-config domains 매칭)
/qa --scope="src/routes/payment/**"       # file-pattern 스코프
/qa --spec auth.md                        # 특정 Spec만
/qa --cycle 1                             # 1사이클만 (Phase B~C)
/qa --migration --legacy http://HOST:PORT # AD-92 P1 migration 패리티 모드
# 단일 알려진 버그 = /forge-fix "<버그>" 사용 (Lane A 4-스테이지 위임, 검증 항상 강제 — hotfix 스킵 모드 폐지, plan v1.1 D1)
/qa --mode=uat --scope={domain}           # UAT 모드: Phase B~D 스킵, E~H 외부 검수자 시나리오 기반
                                          # 전제: docs/qa/uat-scenarios.md 사전 생성 필요 (Phase A/B에서 준비)
                                          # UAT persistent tracking: docs/qa/uat-tracking.md 누적 (severity: CRITICAL/HIGH/MEDIUM/LOW)
                                          # cold-start smoke: UAT 첫 진입 시 /qa --cycle 1 자동 선행 (기본 smoke injection)
                                          # NL severity: bug-report 자연어에서 severity 자동 추론 → uat-tracking.md에 기록
/qa --cr on                               # Phase F Codex cr-final 활성 (기본값)
/qa --cr degrade                          # Phase F Codex cr-final 스킵 (비용 절감·Codex 불가 시)
/qa --cr off                              # Phase F Codex cr-final 스킵 (명시적 비활성)
                                          # crMode='degrade'/'off' → codex-critic 스폰 X, 나머지 cr-* + Ship 정상 진행
                                          # caller: MODE=$(${FORGE_ROOT:-$HOME/forge}/shared/scripts/cr-mode.sh "$CR_ARG") → args.crMode 전달
```

### 4축 확장 — app/domains/accounts/exhaustive (2026-07-06, 전부 optional)

기존 `--scope` 단일축에 3축을 추가한다. **4개 전부 미지정 시 위 기존 동작 그대로**(회귀 0 — 신규 agent 호출 0건).

```
/forge-qa --app=opstool --domains=all --accounts=admin,partner --exhaustive
# starbeginz 운영툴, 전 도메인 × 2계정 병렬 + 요소전수 + 실DB + 자동수정

/forge-qa --app=all --domains=all --accounts=admin,partner --exhaustive
# starbeginz 포탈+운영툴 둘 다 병렬

/forge-qa --app=opstool --domains=settlement-management,sales-management --accounts=partner
# 운영툴의 특정 도메인만(정산+매출)

/forge-qa --domains=all --accounts=admin,editor --exhaustive
# portfolio(단일 앱이라 --app 생략), 전 도메인 × 2역할 병렬
```

- `--app=all|<id>[,<id>...]` — 멀티레포 워크스페이스 앱 계층(포탈/운영툴 등). CWD가 특정 레포면 생략 가능(자동 감지). 단일레포(portfolio)는 항상 생략.
- `--domains=all|<id>[,<id>...]` — LNB/화면군 도메인. `all` = qa-config 또는 프로젝트 실측(dev-spec 디렉토리·App Router 라우트)에서 자동 열거. 미지정 시 기존 `--scope`(콤마 다중 가능) 값을 그대로 사용.
- `--accounts=<id>[,<id>...]` — 계정별 로그인(크레덴셜은 qa-config의 env ref만) 매트릭스. **apps×domains는 독립 브랜치/PR**(각 도메인이 별도로 fix/qa 브랜치 생성), **accounts는 각 도메인의 Phase C(T1/T2) 발견 배율**로 적용된다(같은 도메인을 여러 계정으로 검증한 버그가 하나의 bug-fix-plan·PR로 수렴 — 계정마다 별도 PR을 만들지 않아 중복 머지충돌을 피한다). 계정별 발견 버그는 `account` 필드로 태깅되어 최종 리포트에서 계정별 섹션으로 분리된다.
- `--exhaustive` — 페이지 내 clickable 요소(button/a/input/select/textarea/role=button/onclick/tabindex) 전수 열거·클릭·검증(`playwright-devtools-capture.mjs --crawl`). 삭제·탈퇴·결제·환불 등 파괴적 액션은 내장 스킵리스트로 자동 제외되고 사유가 `crawl-skipped.json`에 남는다(silent skip 금지). Phase B 시나리오에 크롤 결과가 보강 병합된다.
- **false-green 방지(CRITICAL)**: `--app`/`--domains` 입력이 정규화(kebab/공백/대소문자 무시)+alias 매칭 후에도 0건이면 절대 조용히 빈 스코프로 진행하지 않고 **GUIDE-STOP**("매칭 없음. 사용 가능: [목록]") 후 정지한다.
- qa-config 스키마(app 레지스트리·domains·accounts 블록) → `reference.md §qa-config 스키마`. 실DB 검증·healer 자동수정은 이 4축과 무관하게 항상 내장(별도 플래그 불요).

### 커버리지·격리 정밀화 — C1/C2/C3 + H1-3 + D2d (2026-07-07, 전부 config-driven·WARN-우선)

route-centric route_map 시드만으로는 못 잡는 사각지대를 보완한다. 전부 qa-config 설정 기반(앱 특정 테이블·역할·포트 하드코딩 없음), AD-168 WARN-우선(신규 hard-BLOCK 없음, 설정 부재 시 fail-open으로 기존 동작 fallback). 상세 → `reference.md §Coverage & Isolation`.

- **C1 menu-centric 커버리지**: qa-config `menuSource`(BE 메뉴 테이블 쿼리 또는 메뉴 API) 선언 시 활성 메뉴 열거 → `active_menu ∖ implemented_route` = 미구현 메뉴 surface(존재하지 않는 화면 가리키는 메뉴 탐지). 미선언 → route_map 단독 + WARN.
- **C2 404 역참조**: 404를 무조건 isolation-OK로 흡수 금지 — 활성 메뉴(권한 있는 역할)가 그 라우트를 가리키면 BROKEN_LINK 버그로 승격. isolation 판정은 역할이 실제 grant 없을 때만.
- **C3 최소권한**: 각 configured 역할(accounts)이 기대-접근 라우트만 도달하는지 검증 → grant 없는데 2xx = over-exposure/leak 버그. 기대-접근 매트릭스(menuSource roleField / accounts expectedRoutes) 부재 시 WARN.
- **H1-3 오탐 방지(exhaustive/crawl 한정)**: (1) dev-overlay(nextjs-portal/`[data-nextjs-*]`) 열거 제외 (2) 진짜 렌더 에러 = 에러페이지 TEXT 매칭(portal 존재 아님) (3) isolation 마커 = unique 토큰 필수(둥근/generic 값 거부) (4) connection 실패 = INFRA FAIL(pass 아님). 기본 비-crawl 동작 불변.
- **D2d stale-base preflight**: Phase A에서 `git fetch origin develop` + ahead/behind 확인 → 10커밋+ 뒤처지면 WARN(비차단, fail-open).

자동 트리거: P5 Check P5.7-X PASS → 자동 실행

---

## E2E 자율 시퀀스 (Phase A~H)

> **Human 개입 없이 100% 자율 진행. Human은 develop 머지 후 final-qa-report만 검수.**

```
[User] /qa --scope={domain|full}
   │
   ▼ AI 자율 진행
   ├─ Phase A: branch 생성 (fix/qa-{scope}-{YYYY-MM-DD}) [자동, §A13 idempotency]
   │           develop 브랜치 확인 → 기존 fix/qa-* 브랜치 검사 → resume/신규/v2 분기
   │           LOG_HTTP=1 / LOG_SOCKET=1 / LOG_DB=1 자동 export
   │           dev 서버 기동 시 stdout/stderr를 `> .claude/logs/{app}-dev.log 2>&1`로 리다이렉트 권고
   │           (서버 stdout이 pipe에 갇혀 있으면 "브라우저 200인데 사용자만 에러" 클래스를 원리적으로 못 잡는다)
   │           → 로그 파일 접근 불가(권한/경로 부재) 시 침묵하지 말고 WARN 명시 후 진행
   │
   ├─ Phase B: 시나리오 전수 작성
   │           qa-setup → gitnexus route_map → scenarios.md (전체 API/페이지)
   │           --scope 필터 적용 → scenarios-filtered.md
   │           출처 격리: Spec FR 우선, Spec 없음 → legacy 동작 출처 (코드 역산 금지)
   │           8 카테고리 강제 + Bug-ID Allocator + 카테고리별 병렬/직렬 분류
   │
   ├─ Phase C: 버그 발견 + 아티팩트 수집
   │           T1(API) + T2(UI) + T3(DB) + T6(보안) + T7(성능) 실행
   │           ⚠️ 각 테스트 실행 시 proof 생성: bash ${FORGE_ROOT:-$HOME/forge}/shared/scripts/run-tests-proof.sh "<cmd>"
   │              → TEST_PROOF: SHA256=<hash> CMD=<cmd> LINES=<n> EXIT=<code> (WARN if absent — codex-gate §5.5)
   │           FAIL → artifacts/bug-{N}-{shot|http|server|console}.* 강제 생성
   │           6하원칙 bug-report.md 작성
   │           Phase C UI 발견 + Lane A 검수 **모두 DevTools 증거 번들(F12 전수)** 사용 — 발견=Playwright 헬퍼, 검수(healer)=동일 Playwright 헬퍼(MCP 아님, `playwright-devtools-capture.mjs` 1회 실행), 동일 콘텐츠 스펙(SSoT=`commands/forge-fix.md §DevTools 증거 번들`).
   │           F12 캡처 메커니즘 = `playwright-devtools-capture.mjs` 헬퍼 재사용(수정 단계 healer와 동일 엔진, 자체 리스너 코드 없음 — 로직 단일화, 상세: `reference.md §T2`).
   │           `--exhaustive` 시: 동일 헬퍼 `--crawl` 모드로 clickable 요소 전수 클릭·검증(파괴적 액션 스킵) — 결과가 Phase B scenarios.md를 보강하고 발견 버그는 동일 bugs[]로 흡수된다(신규 시나리오 카테고리 아님, 기존 8카테고리 그대로).
   │           `--accounts` 시: T1/T2가 계정별로 fan-out 실행되며(T3/T6/T7은 계정 무관 1회), 헬퍼 `--accounts <로그인시퀀스json>`으로 로그인 후 캡처 — 발견 버그는 `account` 필드로 태깅.
   │           ⚠️ 대량 동시 FAIL 감지(권장 기본: 동일 도메인/FR군 시나리오의 50%+ 또는 절대 5건+ 동시 FAIL, 튜닝 가능) 시
   │              → 개별 bug-N 파일링·Lane A 위임 전에 advisor-strategist(Opus) 자문:
   │                Agent(subagent_type="advisor-strategist", prompt="<대량 FAIL 패턴 요약 500토큰> 구조적 단일결함 vs 개별버그 판단·접근 재정렬 조언 요청")
   │              구조적 단일결함이면 근본원인 1건으로 수렴(개별 N건 남발 방지). advisory only — 최종 판단 Human/오케스트레이터.
   │
   ├─ Phase C.5: Spec↔Code 불일치 방향 판별 + Reconciliation 게이트 (신규 2026-07-04)
   │           Phase C 각 FAIL(FR 불일치)마다:
   │             bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/spec-code-discriminate.sh" <spec_file> <impl_files>
   │           → classification 라우팅:
   │             • IMPL_GAP (A: 코드가 스펙 못 따라감) → 그대로 Phase D~F Lane A 위임(코드 수정)
   │             • SPEC_STALE_CANDIDATE (B: 코드가 의도적 커밋으로 스펙보다 최신) → Reconciliation 게이트
   │             • AMBIGUOUS (신호부족/판별불가) → Reconciliation 게이트 (안전 기본값)
   │           Reconciliation 게이트:
   │             1) advisor-strategist(Opus) 자문 스폰 (main 컨텍스트 1-level; 중첩 시 [→Lead 위임])
   │             2) Human [STOP]: 판별 신호+advisor 권고 제시 → 2택
   │                - "스펙 노후 확정" → 스펙 정정(Human 승인 = sanctioned 사후 변경): .spec.md FR 갱신 → 시나리오 재생성 → 재검증
   │                - "코드 버그 확정" → Phase D~F Lane A 위임(코드 수정)
   │           ⚠️ AI 자동 (B) 확정 금지 — 코드 의도 단정=실버그 은폐 위험. B후보·AMBIGUOUS=반드시 Human.
   │           판별기 실행 실패/미가용 → AMBIGUOUS 처리(코드 자동되돌림 금지, non-blocking).
   │
   ├─ Phase D~F: 수정·검수 — Lane A(`/forge-fix`) 위임 (plan v1.1 D1/D5, qa 자체 수정 로직 폐지)
   │           Phase C에서 발견된 각 버그(bug-N)는 `docs/qa/{date}-bug-fix-plan.md`(6하원칙 근거)와 함께
   │           `/forge-fix` Lane A 엔진에 위임되어 동일 4-스테이지를 통과한다:
   │             ① 조사·재현(RED, 게이트 R — 축별 실오라클 강제) [Phase C 아티팩트 재사용 가능]
   │             ② 리포트(6하원칙, bug-fix-plan.md)
   │             ③ 수정(healer a1~a3, cr-code blocking)
   │             ④ 검수(GREEN, 게이트 G, healer a4~a7 + cr-bug/cr-code/cr-test/cr-final + Codex cr-final)
   │           UI버그: Vision evaluator(JSON schema) + pixel-diff-gate + forge-check-ui (Lane A 내부 적용)
   │           [UAT 진입점] --mode=uat 시: docs/qa/uat-scenarios.md 로드 → Lane A 수정 비활성 → 수동 검토 플로우
   │           ⚠️ qa는 발견만 담당 — 수정+검수 로직은 Lane A 재사용(로직 단일화). 상세 라우팅·게이트는 `commands/forge-fix.md` 참조.
   │           → 전 버그 게이트 G PASS(PASS/WARN) 시에만 Phase G 진입
   │
   ├─ Phase G: PR 생성 → CI → develop 자동 머지 [자동]
   │           gh pr create --base develop --head fix/qa-{scope}-{date}
   │           bash scripts/ci-wait.sh {branch} (15분 timeout + CI FAIL 패턴 분석)
   │           bash scripts/codex-cr-final.sh {pr-body} → docs/reviews/codex-final/{date}-*.json
   │           9 조건 모두 충족 시 → gh pr merge --squash --delete-branch
   │           (MVP: 수동 머지. auto-merge hook = AD-97 향후)
   │           git checkout develop && git pull && git worktree prune
   │
   └─ Phase H: 지식 축적 + 메트릭 + 정리 (AD-93 W5)
               learnings.jsonl append (healer 종료 시)
               wiki-sync 자동 트리거 (nohup background, Human 승인 유지)
               docs/qa/intervention-log.jsonl append (Human override 발생 시)
               docs/qa/metrics.jsonl append {date, scope, bugs_found, bugs_fixed, cycles, mttr_min, regression_count}
               docs/qa/{date}-final-qa-report.md (Human 검수용)
               git worktree prune (orphan cleanup, §A10)
               $HOME/.claude/worktrees/qa-* 7일+ 자동 삭제
   │
   ▼
[User] final-qa-report 검수 (develop 머지 완료 상태)
```

### 자동 머지 조건 (9개 전부 충족)

- [✓] /cr-bug PASS/WARN
- [✓] /cr-code PASS/WARN
- [✓] /cr-test PASS/WARN
- [✓] /cr-final PASS/WARN (Claude Sonnet, 적대적)
- [✓] Codex /cr-final PASS (third-party LLM — 미충족 시 develop 머지 X)
- [✓] 보안 CRITICAL 0건
- [✓] 회귀 0건 (baseline 대조)
- [✓] GitHub CI PASS
- [✓] 모든 시나리오 PASS

### Iron Laws (전 Phase 공통)

- **main 직접 머지 X** (MERGE-IRON-1 — develop만 자동, main은 Human)
- **test PASS 주장 = TEST_PROOF hash 동반** (WARN if absent — 합성경로 허위보고 방지, AD-161)
- 회귀 감지 / same-issue 3회 (`sha256({file_path}:{symbol}:{error_class})`) / 6사이클 초과 → 즉시 [STOP] (스톱조건 SSoT = `${FORGE_ROOT:-$HOME/forge}/.claude/skills/forge-loop-maker/scripts/loop-kernel.js` — qa 자체 재시도 루프는 없음(Phase D~F는 Lane A `/forge-fix`·healer로 위임, 위 §Hotfix 모드 폐지 참조). 위 수치는 kernel 호출 결과를 healer가 판정한 값을 Iron Law 가시성 목적으로 재기재한 것이며, qa는 same-issue/plateau/oscillation/max_cycles를 독립적으로 재구현하지 않는다 — 판정 로직 원본은 `agents/healer.md §loop-kernel.js SSoT 연동` 참조)
- 보안 CRITICAL → 즉시 [STOP] + Human 알림
- Lethal Trifecta (미신뢰 외부 입력 + DB write + 코드쓰기 동시) → 즉시 [STOP]
- subagent → subagent 중첩 금지 (Claude Code 1-level)
- **Spec-Stale 자동확정 금지** — spec↔code 불일치를 코드버그로 자동 단정 X. SPEC_STALE_CANDIDATE/AMBIGUOUS = Reconciliation 게이트 + Human [STOP] 필수 (spec-code-discriminate.sh)

### TDD RED-GREEN 게이트 (WI-24)

버그수정·구현 시 RED-GREEN 사이클을 QA 검증 게이트로 적용한다:

**Verify-RED (수정 전 필수)**:
1. 버그 증상을 재현하는 테스트 또는 명령을 실행
2. FAIL(RED) 확인 — 올바른 이유로 실패하는지 확인 (기능 없음, 버그 존재 등)
3. "이미 통과할 것 같으니 생략" 금지 — Verify-RED 없이 수정 착수 금지

**Verify-GREEN (수정 후 필수)**:
1. 동일 테스트/명령 재실행
2. PASS(GREEN) 확인
3. 회귀 테스트 전체 PASS 확인

_QA 맥락 차별_: behavior-core.md의 red-green은 일반 버그수정 룰. 본 게이트는 **Phase C/E 내 healer 수정 사이클**에서 각 Bug-ID별로 Verify-RED→Verify-GREEN 강제 적용 (TEST_PROOF hash 동반 의무). Phase F cr-* 진입 전 전체 Bug-ID RED-GREEN 완료 확인 필수.

---

## Hotfix 모드 폐지 — Lane A(`/forge-fix`)로 통합 (plan v1.1 D1, AD-95 대체)

과거 `--mode=hotfix`(Phase B~C 스킵 + cr-test/cr-final 선택)는 **폐지**한다. 단일 알려진 버그는 `/forge-fix "<버그>"`로 직접 처리하며, 그 파이프라인도 4-스테이지(조사·재현→리포트→수정→검수) 전부와 게이트 R/G를 항상 통과해야 한다 — "가벼운 버그라 검증을 생략한다"는 경로는 더 이상 없다.

`/qa`는 spec 기반 전수 발견(Phase A~C, Lane B) 전용이며, 개별 버그의 경량 수정 진입점 역할은 하지 않는다. 발견된 버그의 수정·검수는 Lane A(`/forge-fix`)로 위임된다.

---

## Phase Gate 호출 표 (AD-96-MVP M14 — dispatcher)

> **호출 방법**: `bash ${FORGE_ROOT:-$HOME/forge}/.claude/hooks/dispatch/phase-gate.sh <gate-name> [bug_id] [artifacts_dir] [scenarios_path]`

| Gate | 호출 시점 | 실행 Hook | Exit 2 조건 |
|------|----------|---------|------------|
| `phase-a-to-b` | Phase A 완료 → Phase B 진입 직전 | H26 `scenarios-required.sh` | scenarios.md 없음 |
| `phase-b-entry` | Phase B 실행 시작 직전 | H27 `scenarios-coverage-8.sh` | 8 카테고리 미커버 |
| `phase-e-entry` | Phase E 진입 (healer 스폰 직전) | H1 `qa-6w-validate.sh` (Phase E) | Why_hypothesis 없음 |
| `phase-e-a4-ui` | Phase E a4 완료 (UI 버그) | H2 `qa-artifact-frontend.sh` + H7 `pixel-diff-gate.sh` + H6 `vision-evaluator-required.sh` | 6장 미완성 / diff>1% / vision FAIL |
| `phase-e-a4-backend` | Phase E a4 완료 (API/DB 버그) | H3 `qa-artifact-backend.sh` | 3종 로그 없음 |
| `phase-f-entry` | Phase F 진입 직전 | H1 `qa-6w-validate.sh` (Phase F) | Why_root_cause 미작성 |
| `phase-a-branch` | Phase A (AD-97 예약) | skip (MVP) | - |
| `phase-g-merge` | Phase G (AD-97 예약) | skip (MVP) | - |

```bash
# qa SKILL 구현 예시
bash ${FORGE_ROOT:-$HOME/forge}/.claude/hooks/dispatch/phase-gate.sh phase-a-to-b
bash ${FORGE_ROOT:-$HOME/forge}/.claude/hooks/dispatch/phase-gate.sh phase-e-entry
bash ${FORGE_ROOT:-$HOME/forge}/.claude/hooks/dispatch/phase-gate.sh phase-e-a4-ui "bug-${N}"
bash ${FORGE_ROOT:-$HOME/forge}/.claude/hooks/dispatch/phase-gate.sh phase-f-entry
```

---

## Phase B — 8 카테고리 강제 (요약)

| # | 카테고리 | 병렬 정책 |
|---|---------|---------|
| 1·2·3·8 | Happy Path / Boundary / Negative / A11y | 병렬 가능 |
| 4·6 | Error/Exception / Concurrency | worktree 격리 필수 + 병렬 가능 |
| 5·7 | State Transition / Security | 직렬 의무 |

카테고리 표기 허용 형식(H27 훅 판정 기준, 하위호환): 필드형 `카테고리: N`(reference.md 시나리오 schema) 또는 헤딩형 `카테고리 N`/`### 카테고리 N: <이름>` — 콜론 유무 무관, 숫자 뒤 경계만 확인.
면제 시: `면제 카테고리: [N] / 사유: <1줄>` 명시. 3건 이상 동시 면제 = [STOP].
[STOP] 발동 전 advisor-strategist(Opus) 자문: `Agent(subagent_type="advisor-strategist", prompt="<면제 제안 카테고리 N개+각 사유 요약 500토큰> 테스트 커버리지 축소 리스크·대안 조언 요청")` (중첩 시 [→Lead 위임]). advisor 응답(400~700토큰)을 [STOP] 보고에 포함 — advisory이며 면제 승인·최종결정은 Human. 3건 미만 면제는 스폰하지 않는다(비용).
H28 gate: 카테고리 1·2·3·4·6·8 합산 5+건 직렬 시도 → 차단.
상세 시나리오 schema + 병렬 실행 코드 → `reference.md` §Phase B 상세

---

## Phase E 복잡도 라우팅 — Lane A(`/forge-fix`)로 이관

qa 자체 Phase E는 폐지되었다(Phase D~F 위임, 위 §참조). 복잡도별 healer 라우팅(SIMPLE/MODERATE/HIGH/AMBIGUOUS), worktree 격리, post-wave build+test gate, orchestrator heartbeat는 이제 `/forge-fix`(Lane A) 내부에서 동일하게 적용된다. **PGE는 버그 도메인에서 제외**(D3) — HIGH 복잡도도 Lane A 내 Agent Teams(5 specialist)로 처리하며 PGE로 라우팅하지 않는다.

**개수 자동 라우팅(2026-07-05)**: Lane A(`/forge-fix`)에 위임된 버그들은 개수·도메인 기준 자동 스폰 — 2~9개 독립 버그(SIMPLE/MODERATE)는 Agent Teams 병렬(worktree 격리), 10개+/`--scan` 대량은 Workflow pipeline, 도메인 충돌(같은 테이블/파일)은 순차 그룹핑. SSoT = `agents/healer.md §개수 자동 라우팅`(P1-B 안전장치 그대로 재사용, 여기서 재정의하지 않음).

## qa 자체 advisor 자문 지점 (Q1/Q2 — 2026-07-04)

버그 수정(Lane A)의 advisor T1~T4와 별개로, qa의 **discovery 국면 고위험 판단**에 advisor(Opus)를 자문한다:

| 지점 | 트리거 | 자문 목적 |
|------|--------|----------|
| **Q1** | Phase B 8카테고리 3건+ 동시 면제 | 테스트 커버리지 축소 리스크·대안 |
| **Q2** | Phase C 대량 시나리오 동시 FAIL(구조적 의심) | 구조적 단일결함 vs 개별버그 판단 |
| (Phase C.5) | spec-code 불일치 SPEC_STALE_CANDIDATE/AMBIGUOUS | 스펙정정 vs 코드수정 (기배선) |

- 모델=Opus(비-Fable), advisory only([STOP]·최종판정 Human), 저빈도 고위험만, non-blocking(스폰 실패해도 Human 진행).
- **AMBIGUOUS 복잡도 버그의 advisor는 Lane A T1이 담당** — qa에서 중복 배선하지 않는다.

상세 라우팅 코드 → `commands/forge-fix.md` (레거시 참조: `reference.md` §Phase E 상세)

---

## 소스코드 읽기 금지 원칙 (LN-05)

**QA = 동작 검증, 코드 리뷰 X.** 소스코드를 Read하여 동작을 추론하지 말 것.
- 실제 실행·화면·로그·HTTP 응답으로만 판정
- "코드를 보면 이렇게 동작할 것 같다" = 즉시 중단, 실제 실행으로 검증
- 코드 리뷰 필요 시 `/cr-double` 또는 `/code-review` 별도 실행

## 8축 가중 Health Score Rubric (LN-05)

> **총점 100점. 70점 미만 → FAIL. 기능성 축 즉시 FAIL 시 총점 무관 FAIL.**

| 축 | 가중치 | FAIL 기준 |
|----|:------:|----------|
| 1. 기능성 (Functionality) | 25% | FR 미충족 1건 → 즉시 FAIL |
| 2. 성능 (Performance) | 15% | P95 응답 > 기준치 2× |
| 3. 보안 (Security) | 15% | CRITICAL 취약점 1건 |
| 4. 접근성 (Accessibility) | 10% | WCAG AA 위반 |
| 5. UX/UI 일관성 | 10% | 디자인 시스템 이탈 3건+ |
| 6. 에러 처리 | 10% | 미처리 예외 또는 빈 에러 메시지 |
| 7. 모바일 뷰포트 | 10% | 360px / 390px 레이아웃 깨짐 |
| 8. 문서 | 5% | 주요 변경 미반영 |

### 축 세부 기준 — WCAG 2.2 / Core Web Vitals / 기능·외관 분리 (G6·G10-b)
- **접근성(축4) 세부**: WCAG AA 일반 + **WCAG 2.2 신규** — Focus Not Obscured(sticky/오버레이가 focus된 요소 가림=FAIL), Target Size ≥24px(작은 탭타깃=FAIL), Dragging Movements(드래그 전용 조작에 단일포인터 대체 없음=FAIL).
- **성능(축2) 세부**: P95 외 **Core Web Vitals** — CLS(레이아웃 시프트, 크기 미예약 시 FAIL), INP(상호작용 지연; LCP 정상인데 INP 나쁨=초기 hydration long-task 추적).
- **기능·외관 분리 원칙**: "요소 존재/활성/role/label" 기능 판정은 **a11y-tree(aria snapshot)로 결정론적 확인** — Vision 스크린샷에 맡기지 않는다(disabled/hidden/모달가림 오판 방지). 외관(간격·대비·overflow)은 pixel-diff/Vision. (visual-loop G2와 동일 원칙.)
- **외관 기준 = 프로젝트 DESIGN.md 대조(G10-b)**: 축5(UX/UI 일관성) "디자인 시스템 이탈" 판정 시 `{project-root}/DESIGN.md`(forge-plan Step 3.0 생성) 존재하면 그 committed direction·토큰 계층·anti-slop을 기준으로 대조. 없으면 기존 기준.
- **rubric = 대리지표, 목표 아님(G15 reward-hacking 방어)**: 8축 점수는 품질의 proxy다. 점수 최적화(reward hacking)·무한 폴리싱 금지 — intent(FR·UX 의도) 충족이 목표. 판정 evaluator는 목표 점수를 좇지 말고 결함 유무로 판정.

**증거 2-Tier**:
- Tier 1 (필수): 스크린샷·로그·HTTP 응답 직접 첨부
- Tier 2 (보완): 재현 명령어 or 자동화 스크립트 경로

### 모바일 뷰포트 검증 (축 7 — 필수)

모바일 대상 기능은 다음 2개 뷰포트 강제 검증:
```
- 360×800 (Android 기준)
- 390×844 (iPhone 14 기준)
```
Playwright: `page.setViewportSize({width: 360, height: 800})`

### Diff-Aware 모드

`--diff-aware` 플래그 or PR/브랜치 컨텍스트 시 자동 활성:
- 변경된 FR/파일만 재검증 (전체 regression 스킵)
- 신규 추가 코드 경로 우선 커버
- 기존 PASS 시나리오 샘플링 20%만 재실행

### Framework별 검증 가이드

| Framework | 추가 검증 항목 |
|-----------|--------------|
| Next.js | SSR 하이드레이션 에러, 404/500 페이지 |
| NestJS | Swagger 스펙 일치, DTO 검증 실패 케이스 |
| Unity | 프레임레이트 60fps 유지, 메모리 누수 |
| FastAPI | 응답 스키마 일치, 오류 코드 표준화 |

## 평가 Rubric (합격/불합격 기준)

> 8축 가중 점수 합산 (LN-05). **70점 미만 → FAIL (재작업 필수)**

| 항목 | 가중치 | 불합격 기준 |
|------|:------:|-----------|
| 기능성 | 25% | FR 미충족 1개라도 있으면 즉시 FAIL |
| 성능 | 15% | P95 응답 기준치 2× 초과 |
| 보안 | 15% | CRITICAL 취약점 1건 이상 |
| 접근성 | 10% | WCAG AA 위반 |
| UX/UI | 10% | 디자인 시스템 이탈 3건+ |
| 에러 처리 | 10% | 미처리 예외·빈 에러 메시지 |
| 모바일 뷰포트 | 10% | 360px/390px 깨짐 |
| 문서 | 5% | 주요 변경 미반영 |

**PASS**: 70점 이상 + 기능성 즉시 FAIL 없음
**FAIL**: 70점 미만 또는 기능성 즉시 FAIL → Cycle 2 재작업
도메인별 불합격 기준 + AI 슬롭 체크리스트 → `reference.md` §Rubric 상세

---

## 산출물

`docs/qa/YYYY-MM-DD-{spec-name}-qa-report.md`

| 항목 | 내용 |
|------|------|
| 시나리오 수 | FR별 시나리오 개수 |
| PASS/FAIL | 각 시나리오 결과 |
| Rubric 점수 | 항목별 점수 + 합산 |
| 이슈 목록 | 발견된 이슈 + 수정 내역 |
| 사이클 수 | 실행된 사이클 수 |

---

## Workflow 통합

병렬/다단계 실행 = Workflow 도구로 컨텍스트 격리 + resume 지원.
패턴: Phase A~D(순차) → Phase C(parallel T1~T7, Agent Teams) → Phase D~F(**Lane A `/forge-fix` 위임** — qa 자체 Phase E는 폐지, healer 엔진 병렬 실행은 Lane A 내부에서 재사용) → Phase G~H(순차).
실행: `Workflow({ script: Bash("cat $HOME/.claude/skills/qa/workflow.js"), args: { scope, mode } })`
`CLAUDE_CODE_DISABLE_WORKFLOWS=1` 시 기존 Phase A~H 메인 컨텍스트 방식 fallback.

**개수 자동 라우팅(AD-114, 2026-07-05)**: 발견 버그 수·도메인에 따라 스폰 방식이 자동 선택된다 — 2~9개 독립 버그(도메인 비충돌) = Agent Teams(Lead가 단일 메시지 병렬 스폰), 10개+/`--scan` 대량 = Workflow pipeline(concurrency cap 관리), 도메인 충돌 = 순차 그룹핑. 판정·안전장치(worktree 격리·HEAD guard·직렬 회귀 게이트) SSoT = `agents/healer.md §개수 자동 라우팅`·`§Worktree 격리 컨텍스트(P1-B)` — 여기서 재정의하지 않는다. Phase C T1~T7 fan-out은 이미 Agent Teams 병렬(위 워크플로 패턴 참조).

## Codex 2차 게이트 (Plan v2-C1, 자동)

QA 시나리오 작성 완료 후 Codex `--stage test` 자동 호출:
- 정책: `test` stage = blocking NO. WARN/FAIL → 사용자 컨펌 후 진행.
- 비활성: `CODEX_REVIEW_AUTO_STAGES=off`

## eval-rubric 통합 (자동)

스킬 산출물 저장 후 자동 `/eval-rubric --target {산출물 경로}` 호출.
결과 → `$HOME/.claude/skills/qa/eval_cases.jsonl` 누적 (EC-qa-{N}).
비활성: `EVAL_RUBRIC_AUTO=off`

> **상세 구현 참조**: `${FORGE_ROOT:-$HOME/forge}/.claude/skills/qa/reference.md`
> (Phase A~H 세부 코드 / T1~T7 검증 상세 / healer 루프 / Phase 입출력 표 / Artifact 보존 정책)
