// harness-backlog-loop/scripts/workflow.js
// 패턴: PEV (Plan-Execute-Verify) — 결정론 verifier 기반
//
// root-cause 1: Workflow 샌드박스는 fs/Node API 접근이 없다 → 스크립트가 직접 verify 를 못 돌린다.
//   그래서 **executor 와 분리된 별도 verifier 에이전트**가 scripts/verify-item.sh 를 실행하고
//   exit code 만 보고한다. 판정 로직은 여전히 셸 스크립트가 소유한다(에이전트는 전달자).
// root-cause 2: scaffold 기본 템플릿은 LLM 루브릭 평가자(0~100점) 본문을 낸다. 이 백로그는
//   항목마다 기계 판정 가능한 verify_cmd 를 가지므로 점수 평가가 아니라 binary 판정이 맞다.
//   (forge-loop-maker 의 --pattern 미반영 결함 = 백로그 P0-8)

export const meta = {
  name: 'harness-backlog-loop',
  description: '하네스 리뷰 백로그를 tier 순으로 적용하고 항목별 verify 로 판정하는 PEV 루프',
  phases: [
    { title: 'Init',   detail: '전제 확인(forge-sync) + 백로그 로드 + 초기 predicate' },
    { title: 'Loop',   detail: '회귀검사 → 항목 pick → verify 작성 → 적용 → 검증 → 커밋' },
    { title: 'Report', detail: '사이클 요약 + 정지 사유 + 게이트 누적' },
  ],
}

// ── Constants (loop-kernel.js §Constants) ─────────────────────────────────────
const BUDGET_RESERVE      = 20000
const SAME_ISSUE_MAX      = 3
const PLATEAU_CONSECUTIVE = 2
const MAX_ITEM_RETRY      = 3

// ── Schemas ───────────────────────────────────────────────────────────────────
const SHELL_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    exit_code: { type: 'number' },
    stdout:    { type: 'string' },
  },
  required: ['exit_code', 'stdout'],
}

const PICK_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    id:             { type: 'string' },   // 없으면 빈 문자열
    tier:           { type: 'string' },
    title:          { type: 'string' },
    target:         { type: 'string' },
    action:         { type: 'string' },
    has_verify_cmd: { type: 'boolean' },
    mutation:       { type: 'string' },
    pending_left:   { type: 'number' },
  },
  required: ['id', 'pending_left', 'has_verify_cmd'],
}

const APPLY_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    changed_files: { type: 'array', items: { type: 'string' } },
    summary:       { type: 'string' },
    blocked:       { type: 'boolean' },
    blocked_reason:{ type: 'string' },
  },
  required: ['changed_files', 'summary', 'blocked'],
}

// ── Args ──────────────────────────────────────────────────────────────────────
const _a = (typeof args === 'string')
  ? (() => { try { return JSON.parse(args) } catch (e) { return {} } })()
  : (args || {})

const BACKLOG   = _a?.backlog || '${FORGE_OUTPUTS:-$HOME/forge-outputs}/11-platform/pipelines/backlog/2026-07-30-reviews-backlog.jsonl'
const SKILLDIR  = '${FORGE_ROOT:-$HOME/forge}/.claude/skills/harness-backlog-loop'
const maxCycles = Number(_a?.maxCycles ?? 10)
const dryRun    = Boolean(_a?.dryRun ?? false)

// 이 레포·이 머신의 실측 제약 — 모든 하위 에이전트 브리프에 동봉한다
const CONSTRAINTS = `
[필수 제약 — 위반 시 실사고 재현]
1. git 조작은 반드시 WSL 경유: wsl.exe -e bash -lc 'git -C ${FORGE_ROOT:-$HOME/forge} ...'
   Windows 측 git 은 mode-churn 유령 diff 592건 + 2분 타임아웃을 낸다.
2. 커밋은 churn-immune temp-index 로만:
   GIT_INDEX_FILE=$(mktemp) → git read-tree HEAD → git update-index --add <명시 경로>
   → git write-tree → git commit-tree -p HEAD → git update-ref <branch> <new> <old> → git reset -q
   커밋 전 git diff-tree -r --name-status <old> <tree> 로 담긴 파일이 의도한 것뿐인지 실측할 것.
   (이 레포는 autosync 레이스로 대량삭제 near-miss 2회 이력이 있다. naive git add/commit 금지)
3. .git/index.lock 이 잡혀 있으면 강제 삭제하지 말고 해제를 대기한다.
4. 파일 편집 후 셸 스크립트의 실행비트가 벗겨질 수 있다 — chmod +x 재확인.
5. 전역룰 SSoT 는 ${FORGE_ROOT:-$HOME/forge}/dev/global-rules/ 다. ${FORGE_ROOT:-$HOME/forge}/.claude/rules/ 는 존재하지 않는다.
`.trim()

log(`[harness-backlog-loop] backlog=${BACKLOG} maxCycles=${maxCycles} dryRun=${dryRun}`)

// ── 헬퍼: 셸 실행 전용 에이전트 (판정 로직 없음 — 전달자) ────────────────────
async function sh(cmd, label, phaseName) {
  const r = await agent(
    `아래 명령을 **그대로 1회 실행**하고 결과만 보고하십시오. 해석·수정·재시도 금지.

\`\`\`
wsl.exe -e bash -lc '${cmd.replace(/'/g, "'\\''")}'
\`\`\`

반환: { "exit_code": <정수 exit code>, "stdout": "<출력 앞부분 2000자>" }
⚠️ exit_code 를 추측하지 말 것 — 실제 종료 코드를 그대로 보고하십시오.`,
    { label, phase: phaseName, schema: SHELL_SCHEMA, effort: 'low' }
  )
  return r || { exit_code: -1, stdout: '(agent returned null)' }
}

// ── Init ──────────────────────────────────────────────────────────────────────
phase('Init')

// 전제: 미러 sync (SSoT에 있음 != 발효 중)
const syncRes = await sh(
  'node ${FORGE_ROOT:-$HOME/forge}/dev/scripts/forge-sync.mjs sync 2>&1 | tail -5',
  'prereq-forge-sync', 'Init'
)
log(`[Init] forge-sync exit=${syncRes.exit_code}`)

const initPred = await sh(`bash ${SKILLDIR}/scripts/verify-all.sh --backlog "${BACKLOG}"`, 'predicate-init', 'Init')
log(`[Init] predicate exit=${initPred.exit_code} :: ${(initPred.stdout || '').split('\n')[0]}`)
if (initPred.exit_code === 0) {
  log('[Init] 이미 predicate 충족 — 실행할 항목이 없습니다.')
}

// ── State ─────────────────────────────────────────────────────────────────────
let cycleCount   = 0
let stopReason   = initPred.exit_code === 0 ? 'all_done (SUCCESS — 시작 시점에 이미 충족)' : null
let doneCounts   = []          // plateau 지표 = done 건수 추이
let itemFailures = {}          // same_issue
const applied    = []
const gatedSkips = []
const history    = []

// ── Loop ──────────────────────────────────────────────────────────────────────
phase('Loop')

while (!stopReason && cycleCount < maxCycles) {
  if (budget && budget.total && budget.remaining && budget.remaining() < BUDGET_RESERVE) {
    stopReason = `budget_advisory (remaining=${budget.remaining()} < ${BUDGET_RESERVE})`
    log(`[STOP] ${stopReason}`); break
  }

  cycleCount++
  const ph = `Loop/c${cycleCount}`
  log(`\n── Cycle ${cycleCount}/${maxCycles} ──────────────`)

  // (1) 회귀 검사 — done 항목의 verify 가 FAIL 로 전환됐는가
  const reg = await sh(`bash ${SKILLDIR}/scripts/verify-all.sh --backlog "${BACKLOG}" --regression-only`, `regression-c${cycleCount}`, ph)
  if (reg.exit_code === 2) {
    stopReason = `regression (${(reg.stdout || '').match(/REGRESSION_IDS:.*/)?.[0] || 'ids unknown'})`
    log(`[STOP] ${stopReason}`); break
  }

  // (2) 다음 항목 선택 — tier 순, gate=="none", status=="pending"
  const pick = await agent(
    `백로그에서 다음 처리 항목 1건만 고르십시오. **수정 금지, 읽기만.**

백로그: ${BACKLOG}
선택 규칙: tier 우선순위 P0 → P1 → P2 → P3 (LOCAL 제외), 그 안에서 id 오름차순.
조건: status=="pending" && gate=="none".
gate!="none" 인 항목은 고르지 말 것(자동 적용 금지 대상).

반환: { id, tier, title, target, action, has_verify_cmd(bool), mutation(없으면 ""), pending_left(남은 pending 수) }
해당 항목이 없으면 id 를 빈 문자열로 반환.`,
    { label: `pick-c${cycleCount}`, phase: ph, schema: PICK_SCHEMA, effort: 'low' }
  )

  if (!pick || !pick.id) {
    stopReason = 'no_pending_items'
    log(`[STOP] ${stopReason}`); break
  }
  log(`[Pick] ${pick.id} (${pick.tier}) — ${(pick.title || '').slice(0, 70)} | 남은 pending=${pick.pending_left}`)

  // (3) verify_cmd 선작성 — **적용 전에** 써야 self-grading 이 아니다
  if (!pick.has_verify_cmd) {
    log(`[Verify-Author] ${pick.id} — verify_cmd 미작성 → 적용 전 작성`)
    const va = await agent(
      `당신은 **검증 작성자**입니다. 구현자가 아닙니다. 대상 파일을 **수정하지 마십시오**.

항목 ${pick.id}: ${pick.title}
target: ${pick.target}
action(참고): ${pick.action}

할 일: 이 항목이 적용됐는지 판정하는 **셸 1줄 명령**(verify_cmd)을 작성해 백로그 해당 행에 넣으십시오.
- cwd 는 \${FORGE_ROOT:-$HOME/forge} 로 실행된다. 상대경로로 쓸 것.
- 통과=exit 0, 미적용=non-zero 여야 한다.
- ⚠️ **판별력 필수**: 지금(미적용 상태) 실행하면 반드시 non-zero 여야 한다. 작성 후 즉시 실행해
  red 임을 확인하고, red 가 아니면 공허한 검사이므로 다시 쓰십시오.
  (실사례: grep 대상 문자열이 이미 존재해 오탐 PASS 가 난 적이 있다)
- 기계 판정이 불가능하면 verify_cmd 를 "MANUAL: <사람이 확인할 절차>" 로 쓰십시오.
- 역변조가 필요하면 mutation 필드에 "무엇을 되돌리면 FAIL 해야 하는지" 1줄을 함께 넣으십시오.

${CONSTRAINTS}

백로그 수정 후 그 1행 변경만 커밋하십시오.
반환: { "exit_code": 0, "stdout": "작성한 verify_cmd 와 red 확인 결과" }`,
      { label: `verify-author-${pick.id}`, phase: ph, schema: SHELL_SCHEMA }
    )
    log(`[Verify-Author] ${pick.id} → ${(va?.stdout || '').slice(0, 200)}`)

    // W-D: 작성자의 완료 보고를 그대로 믿지 않는다 — 백로그를 재독해 실제로 들어갔는지 실측한다.
    //   root-cause: 이 단계는 원래 있었으나 **반환값을 아무도 검사하지 않아** 미기록이 그대로
    //   통과했고, 적용 사이클을 낭비한 뒤 verify 가 rc=3 을 내고 항목은 pending 에 남아
    //   다음 사이클에 또 뽑혔다(wf_dbba68b4-ca8 사이클 6·7 = P1-10 2연속). W-A 와 같은 실패 클래스.
    const vaChk = await sh(
      `python3 - "${BACKLOG}" "${pick.id}" <<'PY'\nimport json,io,sys\np,i=sys.argv[1],sys.argv[2]\nfor l in io.open(p,encoding="utf-8"):\n    if not l.strip(): continue\n    r=json.loads(l)\n    if r["id"]==i:\n        print("HAS" if (r.get("verify_cmd") or "").strip() else "MISSING"); sys.exit(0)\nprint("NOTFOUND")\nPY`,
      `verify-author-check-${pick.id}`, ph
    )
    if (!/HAS/.test(vaChk.stdout || '')) {
      log(`[NoVerifyCmd] ${pick.id} — 작성자가 verify_cmd 를 남기지 못했다(${(vaChk.stdout || '').trim()}). 적용을 건너뛴다.`)
      await sh(
        `python3 - "${BACKLOG}" "${pick.id}" "no-verify-cmd" <<'PY'\nimport json,io,sys\np,i,s=sys.argv[1],sys.argv[2],sys.argv[3]\nrows=[json.loads(l) for l in io.open(p,encoding="utf-8") if l.strip()]\nfor r in rows:\n    if r["id"]==i: r["status"]=s\nwith io.open(p,"w",encoding="utf-8") as f:\n    for r in rows: f.write(json.dumps(r,ensure_ascii=False)+"\\n")\nprint("status", i, "-> no-verify-cmd")\nPY`,
        `set-status-nvc-${pick.id}`, ph
      )
      gatedSkips.push({ id: pick.id, reason: 'no-verify-cmd (선작성 실패 — 판정 불가라 적용하지 않음)' })
      history.push({ cycle: cycleCount, item: pick.id, verify_exit: 3, done: null, resolved: null })
      continue
    }
  }

  // (4) 적용 — executor (검증 작성자와 분리)
  let applyRes = null
  if (dryRun) {
    log(`[DryRun] ${pick.id} 적용 생략`)
  } else {
    applyRes = await agent(
      `당신은 **구현자**입니다. 아래 백로그 항목 1건만 forge SSoT 에 적용하십시오.

항목 ${pick.id} (${pick.tier}): ${pick.title}
target: ${pick.target}
action: ${pick.action}

규칙:
- **이 항목의 범위만** 건드립니다. 인접 코드 개선·리팩터 금지.
- 백로그의 verify_cmd 를 **수정하지 마십시오**(검증을 구현에 맞추는 것은 self-grading 입니다).
- 지표 변경과 기준(임계값) 변경을 같은 커밋에 넣지 마십시오(E-3).
- 커밋하지 말고 변경만 남기십시오 — 커밋은 검증 통과 후 별도 단계에서 합니다.

${CONSTRAINTS}

반환: { changed_files: [...], summary, blocked(bool), blocked_reason }`,
      { label: `apply-${pick.id}`, phase: ph, schema: APPLY_SCHEMA }
    )
  }

  if (applyRes?.blocked) {
    log(`[Blocked] ${pick.id} — ${applyRes.blocked_reason}`)
    gatedSkips.push({ id: pick.id, reason: applyRes.blocked_reason })
  }

  // (5) 검증 — executor 와 분리된 별도 프로그램의 exit code
  const v = await sh(`bash ${SKILLDIR}/scripts/verify-item.sh "${pick.id}" --backlog "${BACKLOG}"`, `verify-${pick.id}-c${cycleCount}`, ph)
  const vrc = v.exit_code
  log(`[Verify] ${pick.id} exit=${vrc} :: ${(v.stdout || '').split('\n')[0]}`)

  if (vrc === 0) {
    // (5a) 커밋 — 상태 전이보다 **먼저** 한다.
    //   root-cause: 첫 실행(wf_f42bc625-6dc)에서 이 단계가 아예 배선돼 있지 않아
    //   executor 에게 "커밋은 별도 단계에서"라고 지시해놓고 그 단계가 없었다.
    //   P0-1·P0-2 변경이 워킹트리에 미커밋으로 방치됐다(계약 선언 + 소비처 부재).
    const files = (applyRes?.changed_files || []).filter(Boolean)
    if (!dryRun && files.length > 0) {
      const cm = await agent(
        `verify 를 통과한 변경만 커밋하십시오. **명시 경로만** 스테이징합니다.

항목: ${pick.id} — ${pick.title}
변경 파일(구현자 보고): ${files.join(' ')}

절차(churn-immune temp-index — naive git add/commit 금지):
1. 경로를 레포 루트 기준 상대경로로 정규화하고, **이 항목 범위 밖 파일은 제외**하십시오.
   (병행 세션이 같은 레포에 동시 append 하는 파일이 있습니다 — 예: .claude/learnings.jsonl)
2. cd ${FORGE_ROOT:-$HOME/forge} && OLD=\$(git rev-parse HEAD) && BR=\$(git rev-parse --abbrev-ref HEAD)
3. TMP=\$(mktemp); export GIT_INDEX_FILE="\$TMP"; git read-tree HEAD
4. git update-index --add -- <정규화한 경로들>
5. TREE=\$(git write-tree); git diff-tree -r --name-status "\$OLD" "\$TREE"
   → **담긴 파일이 의도한 것뿐인지 확인**. 아니면 중단하고 보고하십시오.
6. C=\$(git commit-tree "\$TREE" -p "\$OLD" -m "<conventional commit 메시지>")
7. git update-ref "refs/heads/\$BR" "\$C" "\$OLD"; unset GIT_INDEX_FILE; rm -f "\$TMP"; git reset -q
8. push 하지 마십시오(G4 게이트).

${CONSTRAINTS}

반환: { "exit_code": 0(성공)/1(실패), "stdout": "커밋 SHA + diff-tree 결과" }`,
        { label: `commit-${pick.id}`, phase: ph, schema: SHELL_SCHEMA }
      )
      log(`[Commit] ${pick.id} exit=${cm?.exit_code} :: ${(cm?.stdout || '').slice(0, 160)}`)
    }

    // (5b) 상태 전이
    //   root-cause: 역변조 요구 항목을 pending 으로 두면 picker 가 같은 항목을 무한 재선택한다.
    //   첫 실행에서 P0-2 가 2사이클 연속 재선택돼 plateau 로 멈췄다 → 별도 상태로 전이한다.
    const nextStatus = (pick.mutation && pick.mutation.trim()) ? 'mutation-pending' : 'done'
    const c = await sh(
      `python3 - "${BACKLOG}" "${pick.id}" "${nextStatus}" <<'PY'\nimport json,io,sys\np,i,s=sys.argv[1],sys.argv[2],sys.argv[3]\nrows=[json.loads(l) for l in io.open(p,encoding="utf-8") if l.strip()]\nfor r in rows:\n    if r["id"]==i: r["status"]=s\nwith io.open(p,"w",encoding="utf-8") as f:\n    for r in rows: f.write(json.dumps(r,ensure_ascii=False)+"\\n")\nprint("status", i, "->", s)\nPY`,
      `set-status-${pick.id}`, ph
    )
    log(`[Status] ${pick.id} → ${nextStatus} (exit=${c.exit_code})`)

    if (nextStatus === 'done') {
      applied.push(pick.id)
    } else {
      log(`[G2] ${pick.id} — 역변조 실증 필요: ${pick.mutation}`)
      gatedSkips.push({ id: pick.id, reason: `mutation-proof-required: ${pick.mutation}` })
    }
  } else if (vrc === 2) {
    // pending 으로 두면 picker 가 무한 재선택한다(P0-7 이 이 케이스) → 별도 상태로 전이
    await sh(
      `python3 - "${BACKLOG}" "${pick.id}" "manual-verify" <<'PY'\nimport json,io,sys\np,i,s=sys.argv[1],sys.argv[2],sys.argv[3]\nrows=[json.loads(l) for l in io.open(p,encoding="utf-8") if l.strip()]\nfor r in rows:\n    if r["id"]==i: r["status"]=s\nwith io.open(p,"w",encoding="utf-8") as f:\n    for r in rows: f.write(json.dumps(r,ensure_ascii=False)+"\\n")\nprint("status", i, "-> manual-verify")\nPY`,
      `set-status-manual-${pick.id}`, ph
    )
    log(`[Manual] ${pick.id} — 사람 판정 필요(G2), status→manual-verify`)
    gatedSkips.push({ id: pick.id, reason: 'manual-verify' })
  } else if (vrc === 3) {
    // W-D 2차 방어: 선작성 실측(위)을 통과했는데도 verify 가 NO_VERIFY_CMD 를 내는 경우
    //   (예: 적용 단계에서 그 행이 덮어써짐). pending 으로 두면 또 뽑히므로 상태를 옮긴다.
    //   적용은 이미 시도됐지만 **판정 불가라 done 으로 올리지 않는다** — 사람이 확인할 대상이다.
    await sh(
      `python3 - "${BACKLOG}" "${pick.id}" "no-verify-cmd" <<'PY'\nimport json,io,sys\np,i,s=sys.argv[1],sys.argv[2],sys.argv[3]\nrows=[json.loads(l) for l in io.open(p,encoding="utf-8") if l.strip()]\nfor r in rows:\n    if r["id"]==i: r["status"]=s\nwith io.open(p,"w",encoding="utf-8") as f:\n    for r in rows: f.write(json.dumps(r,ensure_ascii=False)+"\\n")\nprint("status", i, "-> no-verify-cmd")\nPY`,
      `set-status-nvc2-${pick.id}`, ph
    )
    log(`[NoVerifyCmd] ${pick.id} — verify_cmd 부재로 판정 불가, status→no-verify-cmd`)
    gatedSkips.push({ id: pick.id, reason: 'no-verify-cmd (적용 후 판정 불가)' })
  } else {
    itemFailures[pick.id] = (itemFailures[pick.id] || 0) + 1
    log(`[Fail] ${pick.id} #${itemFailures[pick.id]}`)
    if (itemFailures[pick.id] >= SAME_ISSUE_MAX) {
      stopReason = `same_issue (${pick.id} x${itemFailures[pick.id]})`
      log(`[STOP] ${stopReason}`); break
    }
  }

  // (6) 진행 지표 — plateau 는 **resolved**(done + gated) 추이로 판정한다.
  //   root-cause: done 만으로 재면 게이트로 빠지는 항목이 진행으로 안 잡혀 조기 정지한다.
  //   2차 실행(wf_2ed0fe31-901)에서 P0-3·P0-4 를 적용·커밋했는데 done 순증 0 이라 멈췄다.
  const cnt = await sh(`bash ${SKILLDIR}/scripts/verify-all.sh --backlog "${BACKLOG}" --regression-only`, `count-c${cycleCount}`, ph)
  const mR = (cnt.stdout || '').match(/resolved=(\d+)/)
  const mD = (cnt.stdout || '').match(/done=(\d+)/)
  const resolvedNow = mR ? Number(mR[1]) : (doneCounts[doneCounts.length - 1] ?? 0)
  doneCounts.push(resolvedNow)
  history.push({ cycle: cycleCount, item: pick.id, verify_exit: vrc, done: mD ? Number(mD[1]) : null, resolved: resolvedNow })

  if (doneCounts.length >= PLATEAU_CONSECUTIVE + 1) {
    const w = doneCounts.slice(-(PLATEAU_CONSECUTIVE + 1))
    if (w[w.length - 1] - w[0] <= 0) {
      stopReason = `plateau (done 순증 0, window=[${w}])`
      log(`[STOP] ${stopReason}`); break
    }
  }

  // (7) predicate
  const pred = await sh(`bash ${SKILLDIR}/scripts/verify-all.sh --backlog "${BACKLOG}"`, `predicate-c${cycleCount}`, ph)
  if (pred.exit_code === 0) { stopReason = 'all_done (SUCCESS)'; log(`[STOP] ${stopReason}`); break }
  if (pred.exit_code === 2) { stopReason = 'regression'; log(`[STOP] ${stopReason}`); break }
}

if (!stopReason && cycleCount >= maxCycles) stopReason = `max_cycles (${maxCycles})`

// ── Report ────────────────────────────────────────────────────────────────────
phase('Report')
const ok = (stopReason || '').startsWith('all_done')
log(`
╔══════════════════════════════════════════════════
║ harness-backlog-loop COMPLETE
║ cycles      : ${cycleCount}/${maxCycles}
║ applied     : ${applied.length}  [${applied.join(', ')}]
║ gated/manual: ${gatedSkips.length}
║ stop_reason : ${stopReason}
║ result      : ${ok ? 'SUCCESS' : 'STOP'}
╚══════════════════════════════════════════════════`)

return {
  cycles: cycleCount,
  applied,
  gated: gatedSkips,
  stop_reason: stopReason,
  history,
  next: 'push 는 G4 게이트 — 사람 승인 후 수행. 게이트 항목은 HUMAN-GATES.md 참조.',
}
