---
description: "Forge Dev P6 QA phase — qa 스킬 래핑 커맨드 (Check 5.8에서 승격된 독립 phase)"
argument-hint: "[--mode full|smoke] [--app <id|all>] [--domains <id[,id...]|all>] [--accounts <id[,id...]>] [--exhaustive]"
group: implement
---

> **⚠️ 실행 모드 확인**: 이 커맨드는 쓰기 모드에서만 정상 동작합니다. Plan mode 감지 시 즉시 [STOP] — "Escape로 plan mode 해제 후 재실행하세요. 내부 [STOP] 게이트가 승인 지점입니다."

# /forge-qa — Forge Dev QA Phase

옛 pipeline Check 5.8에서 승격된 독립 P6 QA phase입니다.
내부적으로 `qa` **스킬**을 호출합니다 (qa 스킬 자체는 무변경).

## Step 0.1 — 라우팅 승격 게이트 (WARN 전용, 비차단)

QA 범위를 한 번 재서 "이거 한 번에 하기엔 큰데요?" 를 최대 1줄 듣는 단계다. **막지 않는다.**

```bash
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/harness-escalation-check.sh" \
  --cmd forge-qa --fr <시나리오·FR 수> --files <대상 파일 수> --domains <도메인 수>
```

권고가 나오면 `forge-core.md §병렬 실행` **라우팅 4분법 표**로 레인을 정하고, **정한 뒤 1줄 기록**한다
(미기록은 skip 이 아니라 **결측** — 이 줄이 없으면 P6 오탐률의 분자를 계산할 수 없다):

```bash
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/harness-escalation-check.sh" \
  decision --rec-id <권고에 찍힌 rec_id> --decision <wave|teams|workflow|main>
```

끄기 `FORGE_ESCALATION_GATE=off` · 스크립트 부재·실패는 무시하고 진행(fail-open).

**`--decision workflow` 를 골랐다면 — 부를 손잡이는 이것이다** (2026-09-13 신설)

레인만 정하고 잡을 손잡이가 없으면 그 게이트는 장식이다. QA 레인의 Workflow 실행체는 `qa` 스킬의
workflow 스크립트이고, **app × domain 조합을 병렬 fan-out** 한다.

⛔ **여기서 정하고, 부르는 것은 나중이다 — 호출 지점은 아래 `## Phase 0` 통과 **후**다.**
이 절이 Step `0.1` 옆에 있는 이유는 **레인 결정이 여기서 나기 때문**이지 여기서 실행하라는 뜻이
아니다. `qa/workflow.js` 는 Phase A~H 전 사이클이라 **Phase E 에서 healer 가 코드를 고치고
Phase G 에서 PR·머지까지 간다** — 그것을 Readiness 판정 앞에서 부르면 **구현이 끝났는지도 확인하지
않은 채 수정·머지가 시작된다.** 쉽게 말하면 **검사도 하기 전에 수리 기사를 부르는 것**이다.

호출 직전 확인한다(아니면 **[STOP]** — 부르지 않는다): `## Phase 0` Readiness 4요소가 **전부 ok**인가.

```
Workflow({ script: Bash("cat ~/.claude/skills/qa/workflow.js"),
           args: { scope, mode, crMode, app, domains, accounts, exhaustive, loopUntilDry, dryK, prLanes } })
```

- **인자는 전부 optional 이다.** `app`·`domains`·`accounts`·`exhaustive` 를 **하나도 주지 않으면**
  기존 단일-scope 순차 경로로 그대로 간다(매트릭스 미진입 — 회귀 0). 승격이란 곧 이 4축 중
  하나 이상을 실제로 채워 주는 일이다.
- **반환값을 반드시 검사한다 — `status` 가 계약이다**:

  | status | 의미 | 호출측 행동 |
  |---|---|---|
  | `PASS` | 버그 0건 | 다음 Phase 진행 |
  | `MERGED` | 수정 PR 머지 완료 | 다음 Phase 진행 |
  | `PR_OPEN` | PR 만 열림(미머지) | **[STOP]** — 머지는 사람이 |
  | `MATRIX_DONE` | 매트릭스 전 조합 완료 | 다음 Phase 진행 |
  | `MATRIX_PARTIAL` | 일부 조합 실패 | **[STOP]** — 실패 조합을 먼저 본다 |
  | 필드 부재 | 레그 사망(결과 없음) | **[STOP]** — 없음을 PASS 로 읽지 않는다(fail-closed) |

- **승격하지 않을 때(`--decision main|wave|teams`, 또는 권고 자체가 없을 때)는 아래 기존 단일 패스
  그대로다.** 이 절은 WARN·권고이지 강제가 아니다.
- ⚠️ **이 배선이 무력화되는 입력**: `allowedTools` 에 `Workflow` 가 없는 방에서 부르면 **도구 거부인데
  종료코드는 0** 이라 조용히 아무 일도 안 일어난다(`team-room-open.sh` 주석 §개발을 시킬 방).
- 근거: 세 개발 커맨드에 호출 형태가 **0건**이라(실측 2026-09-13) 게이트가 울려도 잡을 손잡이가 없었다.
- 폐기조건: `qa/workflow.js` 가 없어지거나 승격 실행이 다른 단일 진입점으로 통합되면 이 절을 지운다.

## Step 0.2 — 소관 팀 + 팀 지식 (WARN 전용, 비차단)

Step 0.1 이 **"어떤 그릇에 담을까"**(레인)를 물었다면, 여기는 **"누구 일이고 그 팀이 뭘 배웠나"**를 묻는다.
다른 축이다 — 레인을 정해도 그 팀이 쌓아 둔 지식은 여전히 안 읽힌다.

```bash
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/team-route.sh" forge-qa
# → OWNER=<slug>[,<slug>...]
# 각 slug 의 팀 지식을 착수 전에 읽는다:
#   ${FORGE_OUTPUTS:-$HOME/forge-outputs}/12-team-ops/members/<slug>/wisdom.md
```

- **소관이 2팀 이상이면 접수 순서를 정한다** — 병렬로 같은 파일을 고치게 두지 않는다
  (`team-route.sh` 가 그 경고를 직접 낸다).
- `wisdom.md` 가 없거나 스크립트가 실패하면 **건너뛴다**(fail-open, AD-168). 차단하지 않는다.
- ⚠️ **팀장 경유(버스)를 강제하지 않는다.** 방 44/74 가 오류·게이트·타임아웃 이력을 갖고 있어
  무조건 경유는 파이프라인을 세운다. 경유가 필요하다고 판단되면
  `forge-session-bus.sh send <slug>` 로 보내되, 그 판단은 사람·총괄 몫이다.
- ⚠️ **소관이 `OWNER=none` 으로 나올 수 있다** — 이름표(`identity.md`)의 `## 소유 도구` 에
  그 커맨드가 **안 적혀 있다**는 뜻이지 주인이 없다는 뜻이 아니다. 실측(2026-09-13):
  `/forge-fix` 는 18개 이름표 어디에도 없어 `OWNER=none` 이다.
  그때는 **건너뛰고 진행한다**(fail-open). 소관을 정하려면 **이름표를 고치는 것**이 정본 경로다
  — 이 커맨드가 임의로 팀을 고르지 않는다.
- ⚠️ **판정 근거는 "커맨드 소유"다 — 파일 소유가 아니다.** 레포에 파일·경로 소유 정의가
  **없다**(2026-09-13 실측: `find . -iname 'CODEOWNERS*'` → 0건 · 이름표에 경로 필드 0건).
  그래서 "이 파일을 고치면 어느 팀"은 답할 수 없고 "이 커맨드는 어느 팀 소관"만 답한다.
  파일 기반 라우팅을 원하면 **소유 영역 정의가 선행**이다(사람 결정).

## Phase 0 — Readiness 판정 (P5 구현 완료 확인)

→ 공통 헬퍼: `/readiness-gate` 참조 (forge-qa 진입 계약 4요소)

| 요소 | ok 조건 |
|------|---------|
| 구현 코드 | P5 구현 결과물(소스코드) 존재 |
| 시나리오 정의 | QA 시나리오 기술 가능 (스펙·FR 기반) |
| 서버 기동 | 앱 실행 가능 (서버 기동 가능 상태) |
| QA 스코프 | 테스트 대상 기능·범위 특정 가능 |

라우팅:
- 전부 ok → **PASS** (qa 스킬 호출 진행)
- 구현코드·서버기동 absent → **GUIDE-STOP** (`forge-qa-readiness-{date}.md` 출력 후 정지)

P5(`forge-implement`) 미완료 상태 진입 → GUIDE-STOP: "P5 구현 완료 후 재호출"

## 실행

```
/forge-qa              # 기본 full 모드
/forge-qa --mode smoke # 연기 테스트만 (빠른 검증)
```

### 확장 4축 — app/domains/accounts/exhaustive (2026-07-06, 전부 optional·회귀 0)

프로젝트 지정 불요 — 해당 워크스페이스/레포 CWD에서 실행. 멀티레포는 `--app`으로 앱 선택(생략 시 CWD 레포 자동감지), 단일레포는 `--app` 불요.

```
# starbeginz — 운영툴만, 전 도메인 × 2계정 병렬 + 요소전수 + 실DB + 자동수정
/forge-qa --app=opstool --domains=all --accounts=admin,partner --exhaustive

# starbeginz — 포탈+운영툴 둘 다 병렬
/forge-qa --app=all --domains=all --accounts=admin,partner --exhaustive

# starbeginz — 운영툴의 특정 도메인만 (정산+매출)
/forge-qa --app=opstool --domains=settlement-management,sales-management --accounts=partner

# portfolio — 단일 앱이라 --app 생략, 전 도메인 × 2역할 병렬
/forge-qa --domains=all --accounts=admin,editor --exhaustive
```

- `--app`(앱) → `--domains`(도메인) → `--accounts`(계정) → `--exhaustive`(요소): 각 축을 `all`↔부분↔단일 자유 조합. 4개 전부 미지정 시 위 §실행의 기존 동작 그대로(회귀 0).
- `--app`/`--domains`은 apps×domains 조합마다 **독립 브랜치·PR**로 병렬 fan-out. `--accounts`는 각 도메인 안에서 T1/T2를 계정별로 추가 실행하는 발견 배율 축(별도 PR을 만들지 않음).
- `--app`/`--domains` 매칭 0건 시 조용히 GREEN 종료하지 않고 GUIDE-STOP("매칭 없음. 사용 가능: [목록]") 후 정지한다.
- 실DB 검증·healer 자동수정은 이 4축과 무관하게 항상 내장 — 별도 플래그 불요.
- **`--project` 플래그 없음** — 프로젝트 식별은 CWD → forge-workspace.json 매핑(기존 qa 동작) 그대로.
- qa-config 스키마(app 레지스트리·domains·accounts) → `~/forge/.claude/skills/qa/reference.md §qa-config 스키마`.

## 전역 캡 (반드시 보존)

qa 스킬 캡을 그대로 적용합니다 — 변경 금지:

| 캡 종류 | 한도 | 동작 |
|---------|------|------|
| **사이클 캡** | 6 사이클 | 초과 시 즉시 STOP + Human 에스컬레이션 |
| **same-issue 캡** | 3회 동일 이슈 반복 | 3회 시 즉시 STOP (무한 루프 방지) |
| **회귀 감지** | 즉시 STOP | 수정이 기존 통과 케이스를 깨뜨리면 즉시 STOP |

## 내부 흐름

1. `qa` 스킬 호출 (전역 캡 그대로 전달)
2. E2E 검증 실행
3. 결과 집계 → PASS/FAIL 판정
4. FAIL 시: healer 에이전트 연계 또는 [STOP] Human 에스컬레이션
5. PASS 시: `/forge-pr` 진입 허용

## 위치

이 커맨드는 Forge Dev 파이프라인 P6 QA phase입니다:

```
P5 구현 → /forge-qa (P6) → /forge-pr (P7)
```

직접 qa 스킬 호출이 필요하면: `/qa` (스킬 직접 호출, 파이프라인 외부)
