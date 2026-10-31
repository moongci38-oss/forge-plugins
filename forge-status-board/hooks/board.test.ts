import { describe, expect, mock, test } from 'claude-code/testing'

import { DIVIDER, boardLines, ctxBar, ghBudget, ghPerHour, kTok, rateLimited, refreshSec, roomCards, roomLines, roomsArgv, statusSummary, tokenLines, toolLines } from './board'

const ok = (stdout: string) => ({ exitCode: 0, stdout })

describe('상황판 줄(고정 입력)', () => {
  test('다 읽히면 수와 가드 상태', () => {
    const got = boardLines({ prs: ok('[{"number":1},{"number":2}]'), pc: ok('pc:PC-A\n'), issues: ok('[{"number":9}]'), guard: ok('관리 가드 맞음 — x') })
    expect(got[0]).toBe('열린 PR 2')
    expect(got[1]).toBe('이 PC(pc:PC-A) 열린 일감 1')
    expect(got[2]).toBe('관리 가드 맞음')
    expect(got[3]).toContain('읽기 전용')
  })
  test('못 읽으면 0 이 아니라 판정 불가', () => {
    const got = boardLines({ prs: null, pc: ok('엉뚱한 줄'), issues: null, guard: { exitCode: 1, stdout: '' } })
    expect(got[0]).toBe('열린 PR 판정 불가(gh 를 못 읽었다)')
    expect(got[1]).toBe('이 PC 일감 판정 불가(PC 이름을 못 읽었다)')
    expect(got[2]).toBe('관리 가드 판정 불가(rc 1)')
  })
  test('gh 가 JSON 이 아닌 것을 내면 판정 불가 · 가드 없음은 사람 줄을 싣는다', () => {
    const got = boardLines({ prs: ok('oops'), pc: ok('pc:PC-A'), issues: { exitCode: 1, stdout: '' }, guard: { exitCode: 10, stdout: '관리 가드 없음(빠진 것 3개) — /etc/x\n  사람이 ...' } })
    expect(got[0]).toBe('열린 PR 판정 불가(gh 를 못 읽었다)')
    expect(got[1]).toBe('이 PC(pc:PC-A) 열린 일감 판정 불가')
    expect(got[2]).toBe('관리 가드 없음 — 관리 가드 없음(빠진 것 3개) — /etc/x')
  })
})

test('/forge-board 는 읽기 명령만 돌리고 줄을 돌려준다', async ($, on) => {
  mock.env(on, { FORGE_ROOT: '/f' })
  mock.clock(on, { now: 1_000_000 })
  const ran: string[] = []
  on('process.run', async (_$, e) => {
    const cmd = e.argv.join(' ')
    ran.push(cmd)
    const out = cmd.startsWith('gh pr list') ? '[{"number":1}]'
      : cmd === 'bash /f/shared/scripts/issue-owner.sh pc' ? 'pc:PC-A'
      : cmd.startsWith('gh issue list') ? '[]'
      : ''
    return { value: { exitCode: 0, stdout: out, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('ui.open', async () => ({ value: { isPlaced: true } }))
  const shown: (string | undefined)[] = []
  on('ui.status', async (_$, e) => { shown.push(e.text); return { value: undefined } })
  const r = await $.command.run({ command: 'forge-board' })
  expect(shown).toEqual(['상황판: 방 판정 불가'])
  expect(JSON.stringify(r)).toContain('열린 PR 1')
  expect(JSON.stringify(r)).toContain('이 PC(pc:PC-A) 열린 일감 0')
  expect(ran).toContain('bash /f/shared/scripts/managed-guards.sh --check')
  expect(ran).toContain('gh issue list --state open --label pc:PC-A --json number,title,labels --limit 500')   // #3796 지금 하는 일도 같은 목록에서(gh 호출 수 그대로)
  expect(ran).toContain('python3 /f/shared/scripts/board-rooms.py')
  expect(JSON.stringify(r)).toContain('방 판정 불가')
  expect(ran.length).toBe(5)
  expect(JSON.stringify(r)).toContain('자동 갱신 120초마다')
  await $.command.run({ command: 'forge-board', args: 'stop' })
})

const room = (o: Record<string, unknown>) => ({
  name: 'harness', axis: '공통', project: 'forge', mode: null, state: '쉬는 중', issues: [3614], last_turn: '10-24 05:12',
  ctx_pct: 34, ctx_tokens: 50000, ctx_window: 1000000, tok_out: 12300, tok_in_new: 45600, calls: 120, ...o,
})
const rooms = (list: unknown[]) => ok(JSON.stringify({ project: 'forge', all: false, rooms: list }))

// 이 PC 일감 목록(gh issue list --json number,title,labels) 고정 입력 — [번호, 제목, 라벨…]
const iss = (list: [number, string, string[]][]) =>
  ok(JSON.stringify(list.map(([number, title, labels]) => ({ number, title, labels: labels.map(name => ({ name })) }))))

describe('방·토큰 패널(#3622 ①③)', () => {
  test('방 카드 — 모드 칸이 없으면(#3614 전) 판정 불가 · 마지막 턴·CTX', () => {
    const got = roomLines(rooms([room({}), room({ name: 'dev-forge', axis: '프로젝트', mode: 'write', state: '도는 중', issues: null, last_turn: null, ctx_pct: null, ctx_tokens: null })]), iss([]))
    expect(got[0]).toBe('방 2개(프로젝트 forge · 공통)')
    expect(got.slice(1, 5)).toEqual(['', '● dev-forge · 도는 중', '  대기', '  마지막 턴 없음 · CTX 판정 불가 · 프로젝트 · 쓰기'])
    expect(got.slice(5)).toEqual([DIVIDER, '○ harness · 쉬는 중', '  대기', '  마지막 턴 10-24 05:12 · CTX ██░░░░░░ 25% · 공통 · 모드 판정 불가'])   // #3753 카드 사이 구분선 · CTX 막대(교체 기준 20만 대비)
  })
  test('#3753 머리줄 = 거른 기준 · 이 세션이 연 방 표시 · 모드 판정 불가 방은 따로 줄', () => {
    const r = ok(JSON.stringify({ project: 'forge', all: false, basis: '프로젝트 forge · 쓰기 세션 · 이 세션이 연 방 먼저', mode_unknown: ['dev-old'],
      rooms: [room({ name: 'dev-w', axis: '프로젝트', mode: 'write', mine: true }), room({ mode: 'write' })] }))
    const got = roomLines(r, iss([]))
    expect(got[0]).toBe('방 2개 — 프로젝트 forge · 쓰기 세션 · 이 세션이 연 방 먼저 · 공통 방은 늘')
    expect(got[2]).toBe('○ dev-w · 쉬는 중 · 이 세션이 연 방')
    expect(got[6]).toBe('○ harness · 쉬는 중')
    expect(got[got.length - 1]).toBe('모드 판정 불가 방 1개(모드 기록 없는 옛 방 · 위 목록에서 뺐다): dev-old')
  })
})

// #3796 사람 캡처(2026-10-26)의 틀린 값 4가지 — 지금 하는 일 = 열린 이슈 중 owner:<방> + status:doing
describe('#3796 방 카드 — 지금 하는 일 1개', () => {
  const doing = iss([
    [3746, '조언자(advisor-strategist·cto-advisor)가 쓰기·편집 도구를 들고 있다 — 읽기 전용으로', ['owner:harness-read', 'status:doing', 'pc:PC-A']],
    [3743, '외부 문서 전수 조사는 원문 전체 도구로', ['owner:harness-read', 'status:doing', 'pc:PC-A']],
    [3691, '새 메인 PC develop 기존 실패 시험 11개', ['owner:harness-baseline', 'status:doing']],
    [3720, '맡았지만 아직 시작 전', ['owner:harness-baseline', 'status:todo']],
    [3734, '파이프라인 정리 전 실측', ['owner:harness-pipeline', 'status:doing']],
  ])
  const now = (r: string[], name: string) => r[r.findIndex(l => l.includes(` ${name} · `)) + 1]
  test('① 머지된 이슈(harness-deploy #3686)는 안 나온다 — 열린 doing 목록에 없으면 대기', () => {
    const got = roomLines(rooms([room({ name: 'harness-deploy', issues: [3686], assigned: [3686] })]), doing)
    expect(now(got, 'harness-deploy')).toBe('  대기')
    expect(got.join('\n')).not.toContain('#3686')
  })
  test('② 닫힌 이슈(harness-baseline #3660·#3719)는 빼고 doing 1개만 · todo 는 지금 하는 일이 아니다', () => {
    const got = roomLines(rooms([room({ name: 'harness-baseline', issues: [3691, 3660, 3719, 3720], assigned: [3691, 3660, 3719, 3720] })]), doing)
    expect(now(got, 'harness-baseline')).toBe('  #3691 새 메인 PC develop 기존 실패 시험 11개')
  })
  test('③ 닫힌 이슈만 맡은 방(harness-guard #3723·#3721)은 대기', () => {
    const got = roomLines(rooms([room({ name: 'harness-guard', issues: [3723, 3721], assigned: [3723, 3721] })]), doing)
    expect(now(got, 'harness-guard')).toBe('  대기')
  })
  test('④ 배정 기록이 없어도 doing 이슈가 있는 방(harness-read·pipeline)은 없음이 아니다 · 여럿이면 최근 배정 1개 + 외 N건 · 제목 앞 40자', () => {
    const got = roomLines(rooms([room({ name: 'harness-read', issues: null, assigned: [3743, 3746] }), room({ name: 'harness-pipeline', issues: null, assigned: null })]), doing)
    expect(now(got, 'harness-read')).toBe('  #3743 외부 문서 전수 조사는 원문 전체 도구로 · 외 1건')
    expect(now(got, 'harness-pipeline')).toBe('  #3734 파이프라인 정리 전 실측')
    expect(got.join('\n')).not.toContain('맡은 이슈 없음')
    const r2 = roomLines(rooms([room({ name: 'harness-read', assigned: null })]), doing)
    expect(now(r2, 'harness-read')).toBe('  #3746 조언자(advisor-strategist·cto-advisor)가 쓰기·… · 외 1건')   // 배정 기록 없으면 번호 큰 것 · 40자 넘으면 …
  })
  test('일감 목록을 못 읽으면 대기가 아니라 판정 불가', () => {
    expect(now(roomLines(rooms([room({ name: 'harness-read' })]), null), 'harness-read')).toBe('  지금 하는 일 판정 불가(일감 목록을 못 읽었다)')
  })
  test('카드 구분 · 정렬 — 멈춤(도는 중인데 15분+ 기록 없음) 맨 위 → 도는 중 → 쉬는 중 → 끊김', () => {
    const got = roomLines(rooms([
      room({ name: 'a-rest', state: '쉬는 중' }), room({ name: 'b-cut', state: '끊김' }), room({ name: 'c-run', state: '도는 중', idle_min: 3 }),
      room({ name: 'd-stuck', state: '도는 중', idle_min: 22, last_turn_min: 40 }),
    ]), iss([]))
    const heads = got.filter(l => /^[●○⚠✕?] /.test(l))
    expect(heads).toEqual(['⚠ d-stuck · 멈춤 22분', '● c-run · 도는 중', '○ a-rest · 쉬는 중', '✕ b-cut · 끊김'])
    expect(got.filter(l => l === '').length).toBe(1)   // 첫 카드 앞 빈 줄 1개
    expect(got.filter(l => l === DIVIDER).length).toBe(3)   // #3753 카드 사이 구분선
    expect(got[got.indexOf('⚠ d-stuck · 멈춤 22분') + 2]).toBe('  마지막 턴 40분 전 · CTX ██░░░░░░ 25% · 공통 · 모드 판정 불가')
  })
  test('카드 자료(패널 테두리용) — 멈춤만 강조 표시', () => {
    const c = roomCards(rooms([room({ name: 'x', state: '도는 중', idle_min: 15 }), room({ name: 'y' })]), iss([]))
    expect(c?.map(k => [k.mark, k.name, k.stuck])).toEqual([['⚠', 'x', true], ['○', 'y', false]])
    expect(roomCards(null, iss([]))).toBe(null)
  })
  test('토큰 표는 기본 접기 — 머리 1줄만 · tokens 일 때만 펼친다', () => {
    const base = { prs: ok('[]'), pc: ok('pc:PC-A'), issues: iss([]), guard: ok(''), rooms: rooms([room({})]) }
    const folded = boardLines(base)
    expect(folded).toContain('토큰 합계(방 1개) 출력 12.3K · 새 입력 45.6K · 자세히: /forge-board tokens')
    expect(folded.join('\n')).not.toContain('교체 기준')
    expect(folded.join('\n')).not.toContain('도구·스킬 상위 5')
    const open = boardLines({ ...base, tokens: true })
    expect(open.join('\n')).toContain('  harness 출력 12.3K · 새 입력 45.6K · 호출 120 · 교체 기준 200.0K 대비 25%')
    expect(open.join('\n')).toContain('도구·스킬 상위 5')
  })
})

describe('방·토큰 패널(#3622 ①③) 2', () => {
  test('#3753 세션 id 를 알면 --session 으로 넘긴다 · 꼴이 아니면 안 넘긴다', () => {
    expect(roomsArgv('/f', 'abc-1_2')).toEqual(['python3', '/f/shared/scripts/board-rooms.py', '--session', 'abc-1_2'])
    expect(roomsArgv('/f', 'a b;rm')).toEqual(['python3', '/f/shared/scripts/board-rooms.py'])
    expect(roomsArgv('/f')).toEqual(['python3', '/f/shared/scripts/board-rooms.py'])
  })
  test('방 0개 · 스크립트를 못 읽으면 0 이 아니라 판정 불가', () => {
    expect(roomLines(rooms([]))).toEqual(['방 0개(프로젝트 forge · 공통)'])
    expect(roomLines(null)).toEqual(['방 판정 불가(board-rooms.py 를 못 읽었다)'])
    expect(roomLines(ok('oops'))).toEqual(['방 판정 불가(board-rooms.py 를 못 읽었다)'])
    expect(roomLines({ exitCode: 3, stdout: '' })).toEqual(['방 판정 불가(board-rooms.py 를 못 읽었다)'])
  })
  test('토큰 — 합계는 잰 방만 · 못 잰 방은 판정 불가 · 교체 기준 20만 대비', () => {
    const got = tokenLines(rooms([room({}), room({ name: 'b', tok_out: 700, tok_in_new: 300, calls: 2, ctx_tokens: 150000 }), room({ name: 'c', tok_out: null, tok_in_new: null, calls: null, ctx_tokens: null })]))
    expect(got[0]).toBe('토큰 합계(방 2개) 출력 13.0K · 새 입력 45.9K')
    expect(got[1]).toBe('  harness 출력 12.3K · 새 입력 45.6K · 호출 120 · 교체 기준 200.0K 대비 25%')
    expect(got[2]).toBe('  b 출력 700 · 새 입력 300 · 호출 2 · 교체 기준 200.0K 대비 75%')
    expect(got[3]).toBe('  c 토큰 판정 불가(세션 기록 없음)')
    expect(tokenLines(rooms([]))).toEqual(['토큰 합계 판정 불가(잰 방 0개)'])
    expect(tokenLines(null)).toEqual(['토큰 판정 불가'])
    expect(kTok(2_500_000)).toBe('2.5M')
  })
})

describe('도구 상위 5 · 상태줄 요약(#3622 ②⑤)', () => {
  const r = rooms([room({ tools_top: [['Bash', 3], ['skill:work-plan', 2]] }), room({ name: 'b', state: '도는 중', tools_top: [] }), room({ name: 'c', state: '끊김', tok_out: null, tools_top: null })])
  test('방마다 이름·횟수 · 0회 · 기록 없음', () => {
    expect(toolLines(r)).toEqual(['도구·스킬 상위 5(최근 24시간)', '  harness Bash 3 · skill:work-plan 2', '  b 호출 없음', '  c 판정 불가(세션 기록 없음)'])
    expect(toolLines(null)).toEqual(['도구 판정 불가'])
  })
  test('요약 1줄 — 방·도는 중·끊김·출력 토큰(잰 방만)', () => {
    expect(statusSummary(r)).toBe('상황판: 방 3 · 도는 중 1 · 끊김 1 · 출력 토큰 24.6K · /forge-board')
    expect(statusSummary(rooms([]))).toBe('상황판: 방 0 · 도는 중 0 · 출력 토큰 판정 불가 · /forge-board')
    expect(statusSummary(null)).toBe('상황판: 방 판정 불가')
  })
})

describe('자동 갱신 판정(#3622 ④)', () => {
  test('주기 — 기본 120 · 60 미만은 60 · 숫자 아님은 기본', () => {
    expect([refreshSec(undefined), refreshSec(''), refreshSec('30'), refreshSec('90.7'), refreshSec('x')]).toEqual([120, 120, 60, 90, 120])
  })
  test('gh 상한 — 기본 300 · 1 이상 정수만', () => {
    expect([ghPerHour(undefined), ghPerHour('0'), ghPerHour('2.5'), ghPerHour('40')]).toEqual([300, 300, 300, 40])
  })
  test('최근 1시간만 세고, 이번 2회를 더해 상한 안이면 ok', () => {
    const now = 10_000_000
    expect(ghBudget([now - 3_600_000, now - 10, now - 5], now, 4)).toEqual({ kept: [now - 10, now - 5], ok: true })
    expect(ghBudget([now - 10, now - 5, now - 1], now, 4).ok).toBe(false)
  })
  test('한도 응답 판정 — 실패 + rate limit 문구만', () => {
    expect(rateLimited([{ exitCode: 1, stdout: '', stderr: 'HTTP 403: API rate limit exceeded' }])).toBe(true)
    expect(rateLimited([{ exitCode: 0, stdout: 'rate limit', stderr: '' }, null])).toBe(false)
    expect(rateLimited([{ exitCode: 1, stdout: '', stderr: 'not found' }])).toBe(false)
  })
})

function ghWorld(on: Parameters<Parameters<typeof test>[1]>[1], prOut: () => { exitCode: number; stderr: string }) {
  const gh: string[] = []
  on('process.run', async (_$, e) => {
    const cmd = e.argv.join(' ')
    if (cmd.startsWith('gh ')) gh.push(cmd)
    const pr = cmd.startsWith('gh pr list') ? prOut() : { exitCode: 0, stderr: '' }
    const out = cmd.startsWith('gh pr list') ? '[]' : cmd.endsWith('issue-owner.sh pc') ? 'pc:PC-A' : cmd.startsWith('gh issue list') ? '[]' : ''
    return { value: { exitCode: pr.exitCode, stdout: out, stderr: pr.stderr, isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('ui.open', async () => ({ value: { isPlaced: true } }))
  on('ui.status', async () => ({ value: undefined }))
  return gh
}

test('④ 주기마다 다시 읽고 · stop 이면 멈춘다', async ($, on) => {
  mock.env(on, { FORGE_ROOT: '/f', FORGE_BOARD_REFRESH_SEC: '60' })
  const clock = mock.clock(on, { now: 5_000_000 })
  const gh = ghWorld(on, () => ({ exitCode: 0, stderr: '' }))
  await $.command.run({ command: 'forge-board' })
  expect(gh.length).toBe(2)
  await clock.advance(60_000)
  expect(gh.length).toBe(4)
  await $.command.run({ command: 'forge-board' })   // 다시 쳐도 타이머를 겹쳐 걸지 않는다
  await clock.advance(60_000)
  expect(gh.length).toBe(8)
  const r = await $.command.run({ command: 'forge-board', args: 'stop' })
  expect(JSON.stringify(r)).toContain('자동 갱신 끔')
  await clock.advance(180_000)
  expect(gh.length).toBe(8)
})

test('④ gh 호출 상한에 닿으면 부르지 않고 멈춘다', async ($, on) => {
  mock.env(on, { FORGE_ROOT: '/f', FORGE_BOARD_REFRESH_SEC: '60', FORGE_BOARD_GH_PER_HOUR: '4' })
  const clock = mock.clock(on, { now: 9_000_000 })
  const gh = ghWorld(on, () => ({ exitCode: 0, stderr: '' }))
  await $.command.run({ command: 'forge-board' })
  await clock.advance(60_000)
  await clock.advance(60_000)
  await clock.advance(60_000)
  expect(gh.length).toBe(4)
  const r = await $.command.run({ command: 'forge-board' })   // 상한이 그대로면 다시 쳐도 gh 를 안 부른다
  expect(gh.length).toBe(4)
  expect(JSON.stringify(r)).toContain('gh 호출 상한')
  await $.command.run({ command: 'forge-board', args: 'stop' })
})

test('④ GitHub 한도 응답이면 재시도 없이 멈춘다', async ($, on) => {
  mock.env(on, { FORGE_ROOT: '/f', FORGE_BOARD_REFRESH_SEC: '60' })
  const clock = mock.clock(on, { now: 20_000_000 })
  const gh = ghWorld(on, () => ({ exitCode: 1, stderr: 'HTTP 403: API rate limit exceeded' }))
  const r = await $.command.run({ command: 'forge-board' })
  expect(JSON.stringify(r)).toContain('rate limit')
  const n = gh.length
  await clock.advance(300_000)
  expect(gh.length).toBe(n)
})

// #3753 조각 ② — 컨텍스트 막대 · 머리줄 요약 · 카드 구분선 · 직무 아이콘 자리 · 좁은 패널에서 안 꺾임
describe('#3753 조각 ② 상황판 다듬기', () => {
  test('컨텍스트 막대 — 교체 기준 20만 대비 · 색 단계 초록 <50 · 노랑 50~80 · 빨강 80+ · 넘쳐도 막대는 8칸', () => {
    expect(ctxBar(50000)).toEqual({ bar: '██░░░░░░', pct: 25, tone: 'success' })
    expect(ctxBar(98000)).toEqual({ bar: '████░░░░', pct: 49, tone: 'success' })
    expect(ctxBar(100000)).toEqual({ bar: '████░░░░', pct: 50, tone: 'warning' })
    expect(ctxBar(158000)).toEqual({ bar: '██████░░', pct: 79, tone: 'warning' })
    expect(ctxBar(160000)).toEqual({ bar: '██████░░', pct: 80, tone: 'error' })
    expect(ctxBar(250000)).toEqual({ bar: '████████', pct: 125, tone: 'error' })
    expect(ctxBar(null)).toBe(null)
    const c = roomCards(rooms([room({ ctx_tokens: 170000 }), room({ name: 'b', ctx_tokens: null })]), iss([]))
    expect(c?.map(k => k.ctx?.tone ?? null)).toEqual(['error', null])
    expect(c?.[1].meta).toContain('CTX 판정 불가')
  })
  test('머리줄 1줄 요약 — 도는 중 · 쉬는 중 · 멈춤(도는 중과 따로) · 열린 PR', () => {
    const r = rooms([room({ name: 'a', state: '도는 중', idle_min: 1 }), room({ name: 'b', state: '도는 중', idle_min: 30 }), room({ name: 'c' }), room({ name: 'd' })])
    const got = boardLines({ prs: ok('[{"number":1},{"number":2},{"number":3}]'), pc: ok('pc:PC-A'), issues: iss([]), guard: ok(''), rooms: r })
    expect(got).toContain('도는 중 1 · 쉬는 중 2 · 멈춤 1 · 열린 PR 3')
    expect(got.indexOf('도는 중 1 · 쉬는 중 2 · 멈춤 1 · 열린 PR 3')).toBeLessThan(got.indexOf(''))   // 카드보다 위(머리줄)
    const na = boardLines({ prs: null, pc: ok('pc:PC-A'), issues: iss([]), guard: ok(''), rooms: r })
    expect(na).toContain('도는 중 1 · 쉬는 중 2 · 멈춤 1 · 열린 PR 판정 불가')
  })
  test('직무 아이콘 자리 — icon 칸이 있으면 이름 앞 · 없으면 안 그린다 · 상태 표시(●○⚠)와 같은 글자나 긴 글은 버린다', () => {
    const c = roomCards(rooms([room({ name: 'g', icon: '🔧' }), room({ name: 'h' }), room({ name: 'i', icon: '○' }), room({ name: 'j', icon: 'rm -rf x' })]), iss([]))
    expect(c?.map(k => k.head)).toEqual(['○ 🔧 g · 쉬는 중', '○ h · 쉬는 중', '○ i · 쉬는 중', '○ j · 쉬는 중'])
    expect(c?.map(k => k.icon)).toEqual(['🔧', '', '', ''])
  })
  test('#3753 조각 ③ 첫 줄 = 부름 이름 + 방 이름(작게) · 부름이 방 이름과 같거나 없으면 한 번만', () => {
    const c = roomCards(rooms([
      room({ name: 'harness', callname: '정비장', icon: '🔧' }), room({ name: 'dev-forge', callname: '개발장@forge·쓰기' }),
      room({ name: 'lonely', callname: 'lonely' }), room({ name: 'old' }), room({ name: 'bad', callname: '' }), room({ name: 'odd', callname: 7 }),
    ]), iss([]))
    expect(c?.map(k => k.head)).toEqual([
      '○ 🔧 정비장 harness · 쉬는 중', '○ 개발장@forge·쓰기 dev-forge · 쉬는 중', '○ lonely · 쉬는 중', '○ old · 쉬는 중', '○ bad · 쉬는 중', '○ odd · 쉬는 중',
    ])
    expect(c?.map(k => k.call)).toEqual(['정비장', '개발장@forge·쓰기', 'lonely', 'old', 'bad', 'odd'])
  })
})

test('#3753 패널 — 막대는 색 칠한 글 · 카드 사이 구분선 · 좁은 패널에서 줄을 끝에서 자른다(꺾지 않음)', async ($, on) => {
  mock.env(on, { FORGE_ROOT: '/f' })
  mock.clock(on, { now: 30_000_000 })
  const body = JSON.stringify({ project: 'forge', all: false, rooms: [room({ name: 'p', callname: '검수장', icon: '🔍', ctx_tokens: 180000 }), room({ name: 'q', ctx_tokens: 20000 })] })
  on('process.run', async (_$, e) => {
    const cmd = e.argv.join(' ')
    const out = cmd.startsWith('gh pr list') ? '[]' : cmd.endsWith('issue-owner.sh pc') ? 'pc:PC-A' : cmd.startsWith('gh issue list') ? '[]' : cmd.includes('board-rooms.py') ? body : ''
    return { value: { exitCode: 0, stdout: out, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('ui.open', async () => ({ value: { isPlaced: true } }))
  on('ui.status', async () => ({ value: undefined }))
  await $.command.run({ command: 'forge-board' })
  const ui = await $.ui.mount({
    plugin: 'forge-status-board', component: 'Pane', requestId: 'forge-status-board', surface: 'terminal',
    props: { title: '총괄 상황판', isFocused: false, bodyColumns: 24, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  })
  const texts = await ui.findAll({ type: 'Text' })
  const bars = texts.filter(t => /^[█░]{8}$/.test(t.text))
  expect(bars.map(t => [t.text, t.props.color])).toEqual([['███████░', 'error'], ['█░░░░░░░', 'success']])
  expect(texts.filter(t => t.text === DIVIDER).length).toBe(1)
  const head = texts.find(t => t.text.startsWith('○ 🔍'))
  expect(head?.props.wrap).toBe('truncate-end')
  expect(head?.text).toBe('○ 🔍 검수장 p · 쉬는 중')   // #3753 조각 ③ 부름 굵게 + 방 이름 흐리게
  expect(texts.find(t => t.text === '검수장')?.props.weight).toBe('bold')
  expect(texts.find(t => t.text === ' p')?.props.dimColor).toBe(true)
  expect(texts.find(t => t.text === 'q')?.props.weight).toBe('bold')   // 부름 없음 → 방 이름 한 번만(굵게)
  expect(texts.some(t => t.text === ' q')).toBe(false)
  expect(texts.find(t => t.text.startsWith('마지막 턴'))?.props.wrap).toBe('truncate-end')
  expect(texts.find(t => t.text === '대기')?.props.wrap).toBe('truncate-end')
  await ui.unmount()
  await $.command.run({ command: 'forge-board', args: 'stop' })
})
