---
description: "Forge Dev P6 QA phase — qa 스킬 래핑 커맨드 (Check 5.8에서 승격된 독립 phase)"
argument-hint: "[--mode full|smoke] [--app <id|all>] [--domains <id[,id...]|all>] [--accounts <id[,id...]>] [--exhaustive]"
group: implement
---

> **⚠️ 실행 모드 확인**: 이 커맨드는 쓰기 모드에서만 정상 동작합니다. Plan mode 감지 시 즉시 [STOP] — "Escape로 plan mode 해제 후 재실행하세요. 내부 [STOP] 게이트가 승인 지점입니다."

# /forge-qa — Forge Dev QA Phase (P6)

`qa` **스킬**을 래핑한다(qa 스킬 무변경). 흐름: `P5 구현 → /forge-qa (P6) → /forge-pr (P7)`. 파이프라인 밖 직접 호출은 `/qa`.

## Step 0.1 — 라우팅 승격 게이트 (WARN 전용, 비차단)
```bash
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/harness-escalation-check.sh" \
  --cmd forge-qa --fr <시나리오·FR 수> --files <대상 파일 수> --domains <도메인 수>
```
권고가 나오면 `forge-core.md §병렬 실행` 라우팅 4분법으로 레인을 정하고 **반드시 1줄 기록**한다:
```bash
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/harness-escalation-check.sh" \
  decision --rec-id <권고에 찍힌 rec_id> --decision <wave|teams|workflow|main>
```
끄기 `FORGE_ESCALATION_GATE=off` · 스크립트 부재·실패는 무시(fail-open).

**`--decision workflow` 일 때** — 여기서 정하고, 호출은 `## Phase 0` 통과 **후**다(`qa/workflow.js` 는 healer 수정·PR·머지까지 가므로 Readiness 전 호출 금지). 호출 직전 Phase 0 4요소가 전부 ok 가 아니면 **[STOP]**.
```
Workflow({ script: Bash("cat ~/.claude/skills/qa/workflow.js"),
           args: { scope, mode, crMode, app, domains, accounts, exhaustive, loopUntilDry, dryK, prLanes } })
```
- 인자는 전부 optional — `app`·`domains`·`accounts`·`exhaustive` 모두 없으면 기존 단일-scope 순차 경로.
- 반환 `status` 가 계약이다:

  | status | 의미 | 호출측 행동 |
  |---|---|---|
  | `PASS` / `MERGED` / `MATRIX_DONE` | 버그 0 / 수정 PR 머지 / 전 조합 완료 | 다음 Phase 진행 |
  | `PR_OPEN` | PR 만 열림(미머지) | **[STOP]** — 머지는 사람이 |
  | `MATRIX_PARTIAL` | 일부 조합 실패 | **[STOP]** — 실패 조합을 먼저 본다 |
  | 필드 부재 | 레그 사망 | **[STOP]** — PASS 로 읽지 않는다(fail-closed) |

- 승격 안 할 때(`main|wave|teams`·권고 없음)는 아래 단일 패스 그대로.
- ⚠️ `allowedTools` 에 `Workflow` 가 없는 방에서는 도구 거부인데 종료코드 0 — 조용히 아무 일도 안 일어난다.

## Step 0.2 — 소관 팀 + 팀 지식 (WARN 전용, 비차단)
```bash
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/team-route.sh" forge-qa
# → OWNER=<slug>[,<slug>...] — 각 slug 의 ${FORGE_OUTPUTS:-$HOME/forge-outputs}/12-team-ops/members/<slug>/wisdom.md 를 착수 전 읽는다
```
- 소관 2팀 이상이면 접수 순서를 정한다(같은 파일 병렬 수정 금지).
- `wisdom.md` 없음·스크립트 실패·`OWNER=none` → **건너뛴다**(fail-open, AD-168). 이 커맨드가 임의로 팀을 고르지 않는다. 판정 근거는 "커맨드 소유"다 — 파일 소유가 아니다.
- 팀장 경유(버스)를 강제하지 않는다 — 필요 판단 시 `forge-session-bus.sh send <slug>`(판단은 사람·총괄 몫).
- 판정 근거는 "커맨드 소유"이지 파일 소유가 아니다.

## Phase 0 — Readiness 판정 (P5 구현 완료 확인)
→ 공통 헬퍼: `/readiness-gate` (진입 계약 4요소)
- 4요소: **구현 코드**(P5 소스 존재) · **시나리오 정의**(스펙·FR 기반 기술 가능) · **서버 기동**(앱 실행 가능) · **QA 스코프**(대상 기능·범위 특정 가능)

- 전부 ok → **PASS**(qa 스킬 호출 진행)
- 구현코드·서버기동 absent → **GUIDE-STOP**(`forge-qa-readiness-{date}.md` 출력 후 정지). P5(`forge-implement`) 미완료 → "P5 구현 완료 후 재호출"

## Check 8.7P — 성능 정적 검사 (Phase 0 후 · qa 스킬 전 · WARN 전용)
대상: 변경분에 백엔드(NestJS) 앱 파일이 있을 때만. 없으면 `Check 8.7P: SKIP(백엔드 변경 없음)` 1줄.

1. 기계 축을 **단독 명령**으로(에이전트는 Bash 없음):
   ```bash
   python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/perf-mechanical.py" --root <백엔드 앱 루트> --files <변경 파일...>
   ```
   `<변경 파일...>` = `git diff --name-only --relative=<앱 상대경로> origin/develop...HEAD`(⚠️ `--relative=` 빼면 경로가 겹쳐 조용히 SKIP).
2. stdout JSON(`checkId: "check-8.7P-mechanical"`)을 **원문 그대로** 넣어 스폰:
   ```
   Agent(subagent_type="performance-checker", model="sonnet",
         prompt="<변경 파일 목록>\n\n## 기계 축 판정 JSON\n<위 stdout 원문>")
   ```
   기계 축(`no-max-length`·`no-perf-assertion`)은 에이전트가 다시 보지 않는다(`agents/performance-checker.md §입력`). 스크립트 실패(rc≠0·JSON 불가) → JSON 없이 스폰(fail-open).
3. 결과(`PASS|CONDITIONAL|FAIL`)를 QA 리포트와 `/forge-pr` PR 본문에 그대로 옮긴다. 막지 않는다(WARN 전용).

## 실행
```
/forge-qa              # 기본 full 모드
/forge-qa --mode smoke # 연기 테스트만
/forge-qa --app=opstool --domains=all --accounts=admin,partner --exhaustive   # 확장 4축 예
```
- 확장 4축(전부 optional): `--app` → `--domains` → `--accounts` → `--exhaustive`. 전부 미지정 = 기존 동작. 단일레포는 `--app` 불요(CWD 자동감지).
- `--app`/`--domains` 는 조합마다 독립 브랜치·PR 로 병렬 fan-out · `--accounts` 는 도메인 안 T1/T2 계정별 추가 실행(별도 PR 없음).
- `--app`/`--domains` 매칭 0건 → GUIDE-STOP("매칭 없음. 사용 가능: [목록]").
- 실DB 검증·healer 자동수정은 항상 내장. `--project` 없음 — CWD → forge-workspace.json 매핑.
- qa-config 스키마 → `~/forge/.claude/skills/qa/reference.md §qa-config 스키마`.

## 전역 캡 (변경 금지)
| 캡 | 한도 | 동작 |
|----|------|------|
| 사이클 캡 | 6 사이클 | 초과 시 즉시 STOP + Human 에스컬레이션 |
| same-issue 캡 | 동일 이슈 3회 | 즉시 STOP |
| 회귀 감지 | 기존 통과 케이스 깨짐 | 즉시 STOP |

## 내부 흐름
1. `qa` 스킬 호출(전역 캡 전달) → 2. E2E 검증 → 3. 결과 집계 PASS/FAIL
4. FAIL: healer 에이전트 연계 또는 [STOP] Human 에스컬레이션 · 5. PASS: `/forge-pr` 진입 허용
