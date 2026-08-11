---
name: harness-backlog-loop
description: ⛔ DEPRECATED(2026-08-11) — 유지보수 중단. 하네스 리뷰 백로그(pipelines/backlog/*.jsonl)를 tier 순으로 하나씩 forge SSoT 에 적용하고 항목별 verify 로 판정하는 PEV 루프. 사용자가 /harness-backlog-loop 를 호출할 때만 발동.
disable-model-invocation: true
---
> **⛔ DEPRECATED(2026-08-11) — 유지보수가 중단된 스킬입니다.**
>
> 원본 시스템(forge SSoT)에서 2026-08-11 에 미사용으로 제거됐습니다. 이 플러그인에는
> **기존 설치자를 깨뜨리지 않기 위해 남겨 둡니다** — 계속 동작하지만 더 이상 고쳐지지 않습니다.
>
> **대체 없음** — 같은 일을 하는 다른 스킬이 없습니다. 없는 것을 가리키지 않으려고 비워 둡니다.
>
> 다음 릴리스에서 제거될 수 있습니다. 계속 필요하면 알려 주십시오.


# harness-backlog-loop

리뷰 리포트 감사에서 나온 **잔여 조치 백로그**를 tier 순으로 소화하는 결정론 루프.
executor 가 항목 1건을 적용하고, **별도 프로그램**(`verify-item.sh`)이 통과를 판정한다.

## Goal

**Exit predicate** (프로그램 검사):

```
scripts/verify-all.sh   →  exit 0
  = 백로그에서 gate=="none" 이고 tier!="LOCAL" 인 전 항목이 status=="done"
    이며, 그 항목들의 verify 를 전건 재실행했을 때 실패 0건
```

기본 백로그: `${FORGE_OUTPUTS:-$HOME/forge-outputs}/11-platform/pipelines/backlog/2026-07-30-reviews-backlog.jsonl`
(인자 `--backlog <path>` 로 교체 가능 — 이 루프는 특정 백로그에 묶이지 않는다)

## Conventions

> **이 파일은 runtime read-only.** 카운터·커서·타임스탬프를 여기 쓰지 말 것 — cold-start 시 초기화된다.

| 종류 | 위치 |
|------|------|
| Durable(로직) | 이 파일 |
| Changing(진행 상태) | `{PROJECT_CWD}/loops/harness-backlog-loop/STATE.md` |
| Changing(항목 커서) | 백로그 JSONL 의 `status` 필드 (`pending` / `done` / `skipped` / `manual-verify`) |

---

## 사이클 절차 (PEV)

| Step | 내용 |
|------|------|
| 0. 전제 | `forge-sync sync` 미실행이면 **룰 항목 verify 가 무의미**하다(SSoT에 있음 ≠ 발효 중). 루프 시작 전 1회 실행하고 STATE.md 에 기록 |
| 1. Read state | `STATE.md` + 백로그 로드 |
| 2. Regression | **직전까지 `done` 인 전 항목의 verify 재실행.** FAIL 전환 1건이라도 있으면 즉시 STOP(`regression`) |
| 3. Pick | tier 순(P0→P1→P2→P3)으로 `status=="pending" && gate=="none"` 1건 pop. `gate!="none"` 은 건너뛰고 `skipped` + 사유 기록(G3) |
| 4. Act | 항목의 `action` 을 `target` 에 적용. **오케스트레이터가 직접 구현하지 않고 워커에 위임**(난도별 tier) |
| 5. Verify | `scripts/verify-item.sh <id>` — binary exit code. FAIL 시 gap-closure plan 작성 후 재시도(같은 항목 최대 3회) |
| 6. Commit | PASS → `status=done` + **churn-immune temp-index 커밋**(§제약 1). 명시 경로만 스테이징 |
| 7. Tier 경계 | `forge-sync sync` 실행 + push 는 **G4 게이트**(사람 승인 후) |

---

## 제약 (실측 근거 — 위반 시 사고 재현)

1. **git 조작은 WSL 경유 + churn-immune temp-index 커밋 필수.**
   Windows 측 git 은 mode-churn 유령 diff 592건 + 2분 타임아웃을 낸다. 이 레포는 autosync 레이스로
   대량삭제 near-miss 2회 이력이 있어 naive `git add`/`commit` 은 금지.
   ```
   GIT_INDEX_FILE=$(mktemp) → git read-tree HEAD → git update-index --add <명시 경로>
   → git write-tree → git commit-tree -p HEAD → git update-ref <branch> <new> <old> → git reset -q
   ```
   커밋 전 `git diff-tree -r --name-status <old> <tree>` 로 **담긴 파일이 의도한 것뿐인지 실측**한다.

2. **`gate != "none"` 항목은 자동 적용 금지.**
   `human-settings`(settings.json 은 settings-json-lock 으로 에이전트 도달 불가) / `ad168`(신규 BLOCK 은
   WARN-first + Human 등록) / `human-secret`(.env) / `human-delete` / `human-decision`.
   → `skipped` 로 기록하고 HUMAN-GATES.md 에 누적 보고. **누적 skip 은 정지 사유가 아니다.**

3. **완료 판정은 verify 실행 결과로만.**
   문서의 "조치완료" 표기 신뢰 금지 — 원 감사에서 `DOC_CLAIM_FALSE` 5건, `MIS_APPLIED` 1건이 실적발됐다.
   신규 토글·분기를 추가한 항목은 **역변조로 판별력 실증**: 그 분기를 지웠을 때 verify 가 FAIL 해야 한다.
   FAIL 하지 않으면 그 verify 는 공허하므로 통과로 치지 않는다.

4. **"SSoT에 있음 ≠ 발효 중".** 룰 변경 항목은 `forge-sync sync` 후에야 미러에 반영된다. Step 0 필수.

5. **E-3 지표·기준 분리.** 지표(계측식)를 바꾸는 변경과 기준(임계값)을 바꾸는 변경을 같은 커밋에 넣지 않는다.

6. **병렬 세션 공존.** 같은 레포에서 다른 세션이 동시 작업한다. 커밋은 항상 명시 경로만 스테이징하고,
   `.git/index.lock` 이 잡혀 있으면 **강제 삭제하지 말고** 해제를 대기한다(Windows 측 좀비 git 프로세스가
   락을 잡는 사례가 실측됐다 — `Get-CimInstance Win32_Process -Filter "Name='git.exe'"` 로 확인).

---

## Stop Conditions (loop-kernel §1)

| 조건 | 판정 | 결과 |
|------|------|------|
| all_done | `verify-all.sh` exit 0 | **SUCCESS** |
| max_cycles | ≥ 10 | STOP |
| same_issue | 동일 항목 verify 3연속 FAIL | STOP |
| plateau | `done` 순증 ≤ 0 이 2사이클 연속 | STOP |
| regression | 기존 `done` 항목 verify 가 FAIL 로 전환 | STOP |
| oscillation | 동일 항목 pass→fail 2회 | STOP |
| budget_advisory | 잔여 토큰 < 20,000 | advisory STOP |
| wall_clock | 2시간 초과 | STOP |

진행 지표(plateau 계산용) = **`done` 건수**(0~68). LLM 점수가 아니다.

---

## Budget

| 항목 | 상한 |
|------|------|
| max-iter | 10 |
| call-budget | 600 (Forge hook 은 **WARN-only** — 하드 차단 아님) |
| wall-clock | 2시간 |

---

## How to run

```
/harness-backlog-loop
/harness-backlog-loop --backlog <다른 백로그 경로>
```

첫 실행 전 **HUMAN-GATES.md G1** 완료 필수.

---

## 폐기 조건 (Subtraction)

이 루프는 **백로그 소화 전용**이다. 대상 백로그의 자동 항목이 전부 `done` 이 되고 남은 것이
`skipped`(게이트) 뿐이면 이 스킬은 **폐기 대상**이다 — `forge-sync` allowlist 에서 제거하고
스킬 폴더를 삭제한다. 상시 자산으로 승격하려면 별도 근거가 필요하다.
