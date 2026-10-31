// forge-status-board — 총괄 상황판 모드(읽기 전용 · #2663 3/3).
// 하는 일: /forge-board 를 치면 열린 PR 수 · 이 PC 열린 일감 수 · 관리 가드 상태 · 팀장 방(상태·맡은 이슈·CTX)·토큰 합계·도구 상위 5(#3622)를 **읽어서** 패널에 보여 주고,
//   프롬프트 아래 요약 1줄(`$.ui.status` — settings statusLine 과 따로 붙는다)을 둔다. 연 뒤에는 주기마다 다시 읽는다
//   (④ — 기본 120초 · gh 호출 시간당 상한 · 한도 응답이면 멈춤 · `/forge-board stop` 으로 끔).
//   #3796 방은 카드 1장씩(상태 표시·이름 / 지금 하는 일 1개 / 마지막 턴·CTX) · 토큰·도구 표는 `/forge-board tokens` 때만 펼친다.
// 하지 않는 일: 도구 호출을 막거나 바꾸지 않는다(tool.call·prompt 훅 없음) · 파일·이슈·설정을 쓰지 않는다.
//   validate 의 hooks:·calls: 줄이 이것을 보여 준다 — 시험 shared/scripts/tests/forge-status-board-mod.test.sh 가 허용 목록으로 잡는다.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import {
  DIVIDER, boardView, ghBudget, ghPerHour, guardArgv, issueArgv, nameText, pcArgv, pcLabel, prArgv, rateLimited, refreshSec, roomsArgv, statusSummary, viewLines,
} from './board'
import type { Ran, View } from './board'

const PANE = 'forge-status-board'
const view = atom({ plugin: 'forge-status-board', key: 'view' } as const, { head: ['아직 안 읽었다 — /forge-board'], cards: [], tail: [] } as View)
let tokens = false   // `/forge-board tokens` 면 토큰·도구 표를 펼친다(그 뒤 자동 갱신도 펼친 채) · 맨 `/forge-board` 는 접는다

async function run($: EngineInterface, argv: string[]): Promise<Ran> {
  try {
    const r = await $.process.run(argv, { timeoutMs: 20000 })
    return { exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr }
  } catch {
    return null
  }
}

async function collect($: EngineInterface): Promise<{ view: View; status: string; limited: boolean }> {
  const root = (await $.env.get('FORGE_ROOT')) || `${(await $.env.get('HOME')) ?? ''}/forge`
  const sid = (await $.env.get('CLAUDE_SESSION_ID')) || (await $.env.get('CLAUDE_CODE_SESSION_ID'))   // #3753 이 세션 모드·이 세션이 연 방
  const [prs, pc, guard, rooms] = await Promise.all([run($, prArgv()), run($, pcArgv(root)), run($, guardArgv(root)), run($, roomsArgv(root, sid))])
  const label = pcLabel(pc)
  const issues = label ? await run($, issueArgv(label)) : null
  return { view: boardView({ prs, pc, issues, guard, rooms, tokens }), status: statusSummary(rooms), limited: rateLimited([prs, issues]) }
}

// ④ 자동 갱신 — 모듈 변수(다시 읽기·재시작이면 처음부터: 타이머도 엔진이 끊는다)
let timer: { cancel: () => void } | null = null
let ghTimes: number[] = []
let note = '자동 갱신 꺼짐'

function stopAuto(why: string): void {
  timer?.cancel()
  timer = null
  note = why
}

// 한 번 읽기 — 상한 안일 때만 gh 를 부른다. 상한이면 자동 갱신을 멈추고, 지난 줄은 두되 맨 끝 상태 줄만 바꾼다.
//   (상한이 풀리면 — 1시간 창이 지나면 — 다음 /forge-board 가 다시 켠다.)
async function refresh($: EngineInterface, cap: number): Promise<string[]> {
  const now = await $.clock.now()
  const b = ghBudget(ghTimes, now, cap)
  ghTimes = b.kept
  if (!b.ok) {   // MUT-BUDGET
    stopAuto(`자동 갱신 멈춤 — gh 호출 상한(최근 1시간 ${ghTimes.length}/${cap}) · 다시: /forge-board`)
    const old = await read($, view)
    const out = { ...old, tail: [...old.tail.filter(l => !l.startsWith('자동 갱신')), note] }
    await update($, view, () => out)
    return viewLines(out)
  }
  ghTimes.push(now, now)
  const got = await collect($)
  if (got.limited) stopAuto('자동 갱신 멈춤 — GitHub 호출 한도(rate limit) · 재시도 안 함 · 다시: /forge-board')
  const out = { ...got.view, tail: [...got.view.tail, `${note} · gh 호출 최근 1시간 ${ghTimes.length}/${cap}`] }
  await update($, view, () => out)
  $.ui.status(got.status)   // ⑤ 프롬프트 아래 요약 1줄
  return viewLines(out)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'forge-board',
      description: '총괄 상황판(읽기 전용) — 열린 PR · 이 PC 일감 · 관리 가드 · 팀장 방 · 토큰 · 자동 갱신(stop 으로 끔)',
    })
    return next(e)
  })

  on('command.run', { command: 'forge-board' }, async ($, e) => {
    const arg = (e.args ?? '').trim()
    if (arg === 'stop') {
      stopAuto('자동 갱신 꺼짐(/forge-board stop)')
      return { text: '자동 갱신 끔 — 다시 켜기: /forge-board' }
    }
    tokens = arg === 'tokens'
    const sec = refreshSec(await $.env.get('FORGE_BOARD_REFRESH_SEC'))
    const cap = ghPerHour(await $.env.get('FORGE_BOARD_GH_PER_HOUR'))
    if (!timer) {   // 이미 돌고 있으면 주기를 겹쳐 걸지 않는다
      note = `자동 갱신 ${sec}초마다 · 끄기: /forge-board stop`
      timer = $.clock.every(sec * 1000, () => { void refresh($, cap) })
    }
    const out = await refresh($, cap)
    await $.ui.open({ id: PANE, title: '총괄 상황판' })
    return { text: out.join('\n') }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const v = await read($, view)
    // #3796 방마다 테두리 카드 — 이름 굵게 · 지금 하는 일 · 작은 줄(흐리게) · 멈춤은 경고 색
    // #3753 카드 사이 구분선 · CTX 막대만 색 칠함(교체 기준 대비) · 직무 아이콘은 이름 앞 · 조각 ③ 부름 굵게 + 방 이름 흐리게 · 좁은 패널은 줄 끝을 자른다(꺾지 않음)
    const cut = 'truncate-end' as const   // MUT-NOWRAP
    return (
      <Box flexDirection="column">
        {v.head.map(line => (
          <Text wrap={cut}>{line}</Text>
        ))}
        {v.cards.map((c, i) => {
          const pre = `${c.mark} ${c.icon ? `${c.icon} ` : ''}`
          const [m0, m1] = c.ctx ? [c.meta.slice(0, c.meta.indexOf(c.ctx.bar)), c.meta.slice(c.meta.indexOf(c.ctx.bar) + c.ctx.bar.length)] : [c.meta, '']
          return (
            <Box flexDirection="column">
              {i > 0 ? <Text dimColor wrap={cut}>{DIVIDER}</Text> : null}
              <Box flexDirection="column" borderStyle="round" paddingX={1} {...(c.stuck ? { borderColor: 'warning' } : {})}>
                <Text wrap={cut} {...(c.stuck ? { color: 'warning' } : {})}>
                  {pre}
                  <Text weight="bold">{c.call}</Text>
                  {c.call !== c.name ? <Text dimColor>{` ${c.name}`}</Text> : null}
                  {c.head.slice(`${pre}${nameText(c.call, c.name)}`.length)}
                </Text>
                <Text wrap={cut}>{c.now}</Text>
                <Text dimColor wrap={cut}>
                  {m0}
                  {c.ctx ? <Text color={c.ctx.tone}>{c.ctx.bar}</Text> : null}
                  {m1}
                </Text>
              </Box>
            </Box>
          )
        })}
        {v.tail.map(line => (
          <Text>{line}</Text>
        ))}
      </Box>
    )
  })
}
