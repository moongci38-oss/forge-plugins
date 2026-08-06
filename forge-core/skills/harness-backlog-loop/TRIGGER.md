# harness-backlog-loop — Trigger Definition

## Verifiable goal

```
scripts/verify-all.sh  →  exit 0
  = 백로그에서 gate=="none" 이고 tier!="LOCAL" 인 전 항목이 status=="done"
    이며 그 항목들의 verify 를 전건 재실행했을 때 실패 0건
```

exit code 규약: `0`=충족 / `1`=미충족(pending 잔존) / `2`=**REGRESSION(즉시 STOP)** / `5`=백로그 파싱 실패

---

## Trigger: manual

`disable-model-invocation: true` — 모델이 자동으로 부르지 않는다. 사람이 호출할 때만 실행된다.

```
/harness-backlog-loop
/harness-backlog-loop --backlog <다른 백로그 경로>
```

Workflow 도구로 결정론 실행:

```
Workflow({ scriptPath: "~/forge/.claude/skills/harness-backlog-loop/scripts/workflow.js",
           args: { maxCycles: 10, dryRun: false } })
```

첫 실행은 `dryRun: true` 로 1사이클 돌려 pick·verify 경로만 확인하는 것을 권장한다.

---

## State file

```
{PROJECT_CWD}/loops/harness-backlog-loop/STATE.md
```

매 실행 시작 시 읽고 종료 전 쓴다. 파일이 없으면 첫 실행으로 간주하고 ledger 를 초기화한다.
**항목 커서는 STATE.md 가 아니라 백로그 JSONL 의 `status` 필드**가 정본이다(두 곳에 쓰면 어긋난다).

---

## 실행 전 체크리스트

1. `HUMAN-GATES.md` **G1** 완료
2. 전제: `node ~/forge/dev/scripts/forge-sync.mjs sync` — SSoT에 있음 ≠ 발효 중
3. `verify-all.sh` 가 **rc=1** 을 반환(= 아직 할 일이 남아 있음)
4. 대상 레포에 `.git/index.lock` 부재 + 다른 세션 커밋 진행 중 아님
5. Budget 확인: max-iter=10 / call-budget=600(WARN-only) / wall-clock=2시간

---

## 정지 후 할 일

| stop_reason | 다음 행동 |
|-------------|----------|
| `all_done` | 백로그 자동분 완료 → **이 스킬은 폐기 대상**(SKILL.md §폐기 조건) |
| `regression` | 되돌아간 항목을 먼저 조사. 루프 재시작 금지 |
| `same_issue` | 해당 항목을 G2 로 올려 사람이 판단 |
| `plateau` | 남은 항목이 전부 게이트/수동인지 확인 — 맞으면 정상 종료다 |
| `max_cycles` / `budget_advisory` / wall-clock | 그대로 재실행하면 이어서 진행된다(커서는 백로그에 있다) |
