// 상황판 줄 만들기 — 순수 함수(읽은 결과 → 사람이 읽는 줄). 실행·쓰기는 하지 않는다(#2663 3/3).
export type Ran = { exitCode: number; stdout: string; stderr?: string } | null

// 읽기 명령만 — gh 는 list, 관리 가드는 --check. 쓰는 인자를 여기에 넣지 않는다(시험 A7 이 본다).
export const prArgv = (): string[] => ['gh', 'pr', 'list', '--state', 'open', '--json', 'number', '--limit', '500']
// #3796 제목·라벨도 받는다 — 방마다 "지금 하는 일"(owner:<방> + status:doing)을 같은 목록에서 고른다(gh 호출 수 그대로)
export const issueArgv = (label: string): string[] => ['gh', 'issue', 'list', '--state', 'open', '--label', label, '--json', 'number,title,labels', '--limit', '500']
export const pcArgv = (root: string): string[] => ['bash', `${root}/shared/scripts/issue-owner.sh`, 'pc']
export const guardArgv = (root: string): string[] => ['bash', `${root}/shared/scripts/managed-guards.sh`, '--check']
// 방·토큰(#3622 ①③) — 읽기 전용 스크립트 1개. 대화 내용은 안 오고 합계 숫자만 온다(스크립트 머리말).
//   세션 id 를 알면 넘긴다(#3753 — 그 세션 모드의 방만 · 그 세션이 연 방 먼저). 모르면 스크립트가 환경 변수로 찾고, 못 찾으면 기준 줄에 판정 불가.
export const roomsArgv = (root: string, sid?: string | null): string[] =>
  ['python3', `${root}/shared/scripts/board-rooms.py`, ...(sid && /^[A-Za-z0-9_-]+$/.test(sid) ? ['--session', sid] : [])]

const NA = '판정 불가'

export function countJson(r: Ran): number | null {
  if (!r || r.exitCode !== 0) return null
  try {
    const v = JSON.parse(r.stdout)
    return Array.isArray(v) ? v.length : null
  } catch {
    return null
  }
}

export function pcLabel(r: Ran): string | null {
  if (!r || r.exitCode !== 0) return null
  const t = r.stdout.trim()
  return /^pc:[A-Za-z0-9._-]+$/.test(t) ? t : null
}

export function guardLine(r: Ran): string {
  const first = (r?.stdout ?? '').split('\n')[0].trim()
  if (!r) return `관리 가드 ${NA} — managed-guards.sh 를 못 돌렸다`
  if (r.exitCode === 0) return '관리 가드 맞음'
  if (r.exitCode === 10) return `관리 가드 없음 — ${first || 'managed-guards.sh --check 가 사람이 칠 줄을 낸다'}`
  if (r.exitCode === 12) return '관리 가드 등록은 있으나 훅 파일 없음 — 가드가 돌지 않는다'
  return `관리 가드 ${NA}(rc ${r.exitCode})`
}

type Room = {
  name: string; axis: string; project: string; mode: string | null; mine?: boolean; state: string | null; issues: number[] | null
  assigned?: number[] | null; last_turn_min?: number | null; idle_min?: number | null   // #3796 — 옛 스크립트엔 없다
  last_turn: string | null; ctx_pct: number | null; ctx_tokens: number | null
  tok_out: number | null; tok_in_new: number | null; calls: number | null
  tools_top?: [string, number][] | null
  icon?: unknown   // #3753 직무 아이콘(이름표 icon: 칸 · 조각 ③) — 없으면 안 그린다
  callname?: unknown   // #3753 조각 ③ 부름 이름(team-callname 규칙) — 없거나 글이 아니면 방 이름
}
// 방 교체 기준(forge-session-bus.sh ROLLOVER_PREEMPT_TOKENS 기본 200000) — 그 숫자 대비 지금 점유
export const ROLLOVER_TOKENS = 200000

export function kTok(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${n}`
}

function parseRooms(r: Ran): { project: string; hours?: number; basis?: string; mode_unknown?: string[]; rooms: Room[] } | null {
  if (!r || r.exitCode !== 0) return null
  try {
    const v = JSON.parse(r.stdout)
    return v && typeof v.project === 'string' && Array.isArray(v.rooms) ? v : null
  } catch {
    return null
  }
}

const modeKo = (m: string | null): string => (m === 'read' ? '읽기' : m === 'write' ? '쓰기' : `모드 ${NA}`)

// ── #3796 방 카드 — 방마다 3줄: 상태 표시 + 이름 / 지금 하는 일 1개 / 마지막 턴 · CTX(작게) ──
// 멈춤 = 도는 중(send 락을 쥠)인데 세션 기록이 STUCK_MIN 분 넘게 안 바뀜 — 맨 위 · 강조
export const STUCK_MIN = 15
const TITLE_MAX = 40
export type Ctx = { bar: string; pct: number; tone: 'success' | 'warning' | 'error' }
// call = 굵게 그릴 부름 이름 · 부름이 방 이름과 다르면 방 이름(name)을 뒤에 작게(흐리게) 한 번 더
export type Card = { mark: string; icon: string; call: string; name: string; stuck: boolean; head: string; now: string; meta: string; ctx: Ctx | null }

// #3753 컨텍스트 막대 — 교체 기준(ROLLOVER_TOKENS) 대비 · 8칸 · 색 단계 초록 <50 · 노랑 50~80 · 빨강 80+ (넘쳐도 막대는 8칸 · 숫자는 그대로)
const BAR_W = 8
export function ctxBar(tokens: number | null | undefined): Ctx | null {
  if (typeof tokens !== 'number' || !Number.isFinite(tokens) || tokens < 0) return null
  const pct = Math.floor((tokens * 100) / ROLLOVER_TOKENS)
  const fill = Math.min(BAR_W, Math.round((pct * BAR_W) / 100))
  return { bar: '█'.repeat(fill) + '░'.repeat(BAR_W - fill), pct, tone: pct >= 80 ? 'error' : pct >= 50 ? 'warning' : 'success' }   // MUT-CTX-TONE
}
// 카드 사이 구분선(글 회신·패널 같은 줄)
export const DIVIDER = '─'.repeat(24)
// 직무 아이콘 — 짧은 글자(4자 이하 · 빈칸 없음)만 · 상태 표시와 같은 글자는 버린다(헷갈리지 않게)
const STATE_MARKS = ['●', '○', '⚠', '✕', '?']
const iconOf = (v: unknown): string =>
  typeof v === 'string' && v !== '' && !/\s/.test(v) && Array.from(v).length <= 4 && !STATE_MARKS.includes(v) ? v : ''   // MUT-ICON-GUARD
type Issue = { number: number; title: string; labels: string[] }

function parseIssues(r: Ran | undefined): Issue[] | null {
  if (!r || r.exitCode !== 0) return null
  try {
    const v = JSON.parse(r.stdout)
    if (!Array.isArray(v)) return null
    return v.filter(x => x && typeof x.number === 'number').map(x => ({
      number: x.number, title: typeof x.title === 'string' ? x.title : '',
      labels: Array.isArray(x.labels) ? x.labels.map((l: { name?: unknown }) => String(l?.name ?? '')) : [],
    }))
  } catch {
    return null
  }
}

// 지금 하는 일 = 열린 이슈 중 owner:<방> + status:doing(닫힌 이슈·머지된 PR 은 열린 목록에 없다) ·
//   여럿이면 가장 최근 배정(assigned 앞쪽) 1개 · 배정 기록에 없으면 번호 큰 것
function nowLine(m: Room, list: Issue[] | null): string {
  if (list === null) return `지금 하는 일 ${NA}(일감 목록을 못 읽었다)`
  const mine = list.filter(i => i.labels.includes(`owner:${m.name}`) && i.labels.includes('status:doing'))   // MUT-DOING-FILTER
  if (mine.length === 0) return '대기'
  const rank = (n: number) => { const k = (m.assigned ?? []).indexOf(n); return k < 0 ? Number.MAX_SAFE_INTEGER : k }
  mine.sort((a, b) => rank(a.number) - rank(b.number) || b.number - a.number)   // MUT-RECENT-FIRST
  const ch = Array.from(mine[0].title)
  const t = ch.length > TITLE_MAX ? `${ch.slice(0, TITLE_MAX).join('').trimEnd()}…` : mine[0].title
  return `#${mine[0].number} ${t}${mine.length > 1 ? ` · 외 ${mine.length - 1}건` : ''}`
}

const ago = (min: number): string => (min < 60 ? `${min}분 전` : min < 1440 ? `${Math.floor(min / 60)}시간 전` : `${Math.floor(min / 1440)}일 전`)
// #3753 조각 ③ 첫 줄 이름 = 부름 + 방 이름 · 같으면(이름표 없음) 한 번만
export const nameText = (call: string, name: string): string => (call === name ? name : `${call} ${name}`)   // MUT-CALL-ONCE
const ORDER: Record<string, number> ={ 멈춤: 0, '도는 중': 1, '쉬는 중': 2, 끊김: 3 }

export function roomCards(r: Ran, issues?: Ran): Card[] | null {
  const got = parseRooms(r)
  if (!got) return null
  const list = parseIssues(issues)
  const cards = got.rooms.map(m => {
    const stuck = m.state === '도는 중' && typeof m.idle_min === 'number' && m.idle_min >= STUCK_MIN   // MUT-STUCK
    const st = stuck ? '멈춤' : (m.state ?? '')
    const mark = stuck ? '⚠' : m.state === '도는 중' ? '●' : m.state === '쉬는 중' ? '○' : m.state === '끊김' ? '✕' : '?'
    const label = stuck ? `멈춤 ${m.idle_min}분` : (m.state ?? `상태 ${NA}`)
    const turn = typeof m.last_turn_min === 'number' ? ago(m.last_turn_min) : (m.last_turn ?? '없음')
    const icon = iconOf(m.icon)
    const call = typeof m.callname === 'string' && m.callname.trim() !== '' && !/\n/.test(m.callname) ? m.callname.trim() : m.name   // MUT-CALL-FALLBACK
    const ctx = ctxBar(m.ctx_tokens)   // #3753 CTX % 자리를 막대로(교체 기준 20만 대비)
    return {
      ord: ORDER[st] ?? 4,
      card: {
        mark, icon, call, name: m.name, stuck, head: `${mark} ${icon ? `${icon} ` : ''}${nameText(call, m.name)} · ${label}${m.mine ? ' · 이 세션이 연 방' : ''}`,
        now: nowLine(m, list), ctx,
        meta: `마지막 턴 ${turn} · CTX ${ctx ? `${ctx.bar} ${ctx.pct}%` : NA} · ${m.axis} · ${modeKo(m.mode)}`,
      },
    }
  })
  return cards.sort((a, b) => a.ord - b.ord).map(x => x.card)   // MUT-CARD-ORDER — 안정 정렬(같은 상태 안은 이 세션이 연 방 먼저 · 원장 순서)
}

function roomHead(r: Ran): { head: string[]; tail: string[] } | null {
  const got = parseRooms(r)
  if (!got) return null
  const n = got.rooms.length
  // #3753 머리줄 = 거른 기준(스크립트 basis) · 옛 스크립트(basis 없음)는 종전 문구
  const head = got.basis ? `방 ${n}개 — ${got.basis} · 공통 방은 늘` : `방 ${n}개(프로젝트 ${got.project} · 공통)`
  const unk = got.mode_unknown && got.mode_unknown.length ? [`모드 ${NA} 방 ${got.mode_unknown.length}개(모드 기록 없는 옛 방 · 위 목록에서 뺐다): ${got.mode_unknown.join(', ')}`] : []
  return { head: [head], tail: unk }
}

// 글로 된 카드(명령 회신·시험용) — 첫 카드 앞 빈 줄 1개 · 카드 사이 구분선(#3753)
const cardLines = (cards: Card[]): string[] => cards.flatMap((c, i) => [i ? DIVIDER : '', c.head, `  ${c.now}`, `  ${c.meta}`])   // MUT-DIVIDER

export function roomLines(r: Ran, issues?: Ran): string[] {
  const h = roomHead(r)
  const cards = roomCards(r, issues)
  if (!h || !cards) return [`방 ${NA}(board-rooms.py 를 못 읽었다)`]
  return [...h.head, ...cardLines(cards), ...h.tail]
}

// #3753 머리줄 1줄 요약 — 멈춤은 도는 중과 따로 센다 · 열린 PR 은 이미 읽은 gh pr list 수
function summaryLine(cards: Card[], prs: number | null): string {
  const n = (mark: string) => cards.filter(c => c.mark === mark).length
  return `도는 중 ${n('●')} · 쉬는 중 ${n('○')} · 멈춤 ${n('⚠')} · 열린 PR ${prs === null ? NA : prs}`   // MUT-SUMMARY-STUCK
}

export function tokenLines(r: Ran): string[] {
  const got = parseRooms(r)
  if (!got) return [`토큰 ${NA}`]
  const known = got.rooms.filter(m => m.tok_out !== null && m.tok_in_new !== null)
  const out: string[] = []
  for (const m of got.rooms) {
    if (m.tok_out === null || m.tok_in_new === null) { out.push(`  ${m.name} 토큰 ${NA}(세션 기록 없음)`); continue }
    const pre = m.ctx_tokens === null ? NA : `${Math.floor((m.ctx_tokens * 100) / ROLLOVER_TOKENS)}%`
    out.push(`  ${m.name} 출력 ${kTok(m.tok_out)} · 새 입력 ${kTok(m.tok_in_new)} · 호출 ${m.calls ?? 0} · 교체 기준 ${kTok(ROLLOVER_TOKENS)} 대비 ${pre}`)
  }
  const sum = (k: 'tok_out' | 'tok_in_new') => known.reduce((a, m) => a + (m[k] ?? 0), 0)
  const head = known.length === 0 ? `토큰 합계 ${NA}(잰 방 0개)` : `토큰 합계(방 ${known.length}개) 출력 ${kTok(sum('tok_out'))} · 새 입력 ${kTok(sum('tok_in_new'))}`
  return [head, ...out]
}

// 도구·스킬 상위 5(#3622 ②) — 이름과 횟수만(인자는 스크립트가 안 꺼낸다)
export function toolLines(r: Ran): string[] {
  const got = parseRooms(r)
  if (!got) return [`도구 ${NA}`]
  const h = got.hours ?? 24
  const out = [`도구·스킬 상위 5(최근 ${h}시간)`]
  for (const m of got.rooms) {
    const t = m.tools_top
    out.push(`  ${m.name} ${t === undefined || t === null ? `${NA}(세션 기록 없음)` : t.length === 0 ? '호출 없음' : t.map(([n, c]) => `${n} ${c}`).join(' · ')}`)
  }
  return out
}

// 상태줄 요약 1줄(#3622 ⑤) — `$.ui.status` 는 플러그인마다 한 줄로 프롬프트 아래 붙는다. settings 의 statusLine(forge-statusline.sh · #2750)을
//   덮지 않는다(API 문서: "this plugin's status line under the prompt, beside the engine's own pinned notices").
export function statusSummary(r: Ran): string {
  const got = parseRooms(r)
  if (!got) return `상황판: 방 ${NA}`
  const run = got.rooms.filter(m => m.state === '도는 중').length
  const cut = got.rooms.filter(m => m.state === '끊김').length
  const known = got.rooms.filter(m => m.tok_out !== null)
  const out = known.reduce((a, m) => a + (m.tok_out ?? 0), 0)
  return `상황판: 방 ${got.rooms.length} · 도는 중 ${run}${cut ? ` · 끊김 ${cut}` : ''} · 출력 토큰 ${known.length ? kTok(out) : NA} · /forge-board`
}

// 패널 한 장 = 머리 줄 · 방 카드 · 꼬리 줄(#3796 — 패널은 카드마다 테두리로 그린다 · 명령 회신은 boardLines 글)
//   토큰·도구 표는 기본 접기(머리 1줄만) — tokens 일 때만 펼친다(`/forge-board tokens`)
export type View = { head: string[]; cards: Card[]; tail: string[] }

export function boardView(got: { prs: Ran; pc: Ran; issues: Ran; guard: Ran; rooms?: Ran; tokens?: boolean }): View {
  const prs = countJson(got.prs)
  const label = pcLabel(got.pc)
  const issues = label ? countJson(got.issues) : null
  const head = [
    prs === null ? `열린 PR ${NA}(gh 를 못 읽었다)` : `열린 PR ${prs}`,
    label === null ? `이 PC 일감 ${NA}(PC 이름을 못 읽었다)` : issues === null ? `이 PC(${label}) 열린 일감 ${NA}` : `이 PC(${label}) 열린 일감 ${issues}`,
    guardLine(got.guard),
  ]
  const tail: string[] = []
  let cards: Card[] = []
  if (got.rooms !== undefined) {
    const h = roomHead(got.rooms)
    const c = roomCards(got.rooms, label ? got.issues : null)
    if (h && c) { head.push(...h.head, summaryLine(c, prs)); cards = c; tail.push(...h.tail) } else head.push(`방 ${NA}(board-rooms.py 를 못 읽었다)`)
    tail.push(...(got.tokens ? [...tokenLines(got.rooms), ...toolLines(got.rooms)] : [`${tokenLines(got.rooms)[0]} · 자세히: /forge-board tokens`]))   // MUT-TOKENS-FOLD
  }
  tail.push('읽기 전용 — 이 패널은 아무것도 바꾸지 않는다 · 다시 읽기: /forge-board')
  return { head, cards, tail }
}

// 글로 편 패널(명령 회신) — 첫 카드 앞 빈 줄 · 카드 사이 구분선 · 카드 뒤에 빈 줄 1개
export const viewLines = (v: View): string[] =>
  [...v.head, ...cardLines(v.cards), ...(v.cards.length ? [''] : []), ...v.tail]

export function boardLines(got: { prs: Ran; pc: Ran; issues: Ran; guard: Ran; rooms?: Ran; tokens?: boolean }): string[] {
  return viewLines(boardView(got))
}

// ④ 자동 갱신(#3622 3/3) — 주기(초)·gh 호출 상한. 순수 함수(시각·기록을 받아 판정만).
//   주기: FORGE_BOARD_REFRESH_SEC(기본 120 · 60 미만은 60 · 숫자 아님은 기본) — 이슈 권고 "60초 이상".
//   상한: FORGE_BOARD_GH_PER_HOUR(기본 300 · 1 이상 정수) — 최근 1시간 이 모드의 gh 호출 수. 한 번 읽기 = gh 2회(PR·이슈 목록).
//     GitHub REST 한도(시간당 5000)보다 한참 낮게 둔다 — 같은 토큰을 다른 도구도 쓴다. 넘기 전에 멈추고, 재시도하지 않는다.
export const REFRESH_DEFAULT_SEC = 120
export const REFRESH_MIN_SEC = 60
export const GH_PER_HOUR_DEFAULT = 300
export const GH_PER_READ = 2

export function refreshSec(v: string | undefined | null): number {
  const n = Number(v)
  if (v === undefined || v === null || v === '' || !Number.isFinite(n)) return REFRESH_DEFAULT_SEC
  return Math.max(REFRESH_MIN_SEC, Math.floor(n))
}

export function ghPerHour(v: string | undefined | null): number {
  const n = Number(v)
  return v && Number.isInteger(n) && n >= 1 ? n : GH_PER_HOUR_DEFAULT
}

// 최근 1시간 기록만 남기고, 이번 읽기(need 회)를 더해도 상한 안이면 ok
export function ghBudget(times: number[], now: number, cap: number, need = GH_PER_READ): { kept: number[]; ok: boolean } {
  const kept = times.filter(t => now - t < 3_600_000)
  return { kept, ok: kept.length + need <= cap }
}

// gh 가 한도에 걸렸다고 말했나 — 그러면 자동 갱신을 멈춘다(재시도 금지)
export function rateLimited(rs: Ran[]): boolean {
  return rs.some(r => !!r && r.exitCode !== 0 && /rate limit|secondary rate|API rate/i.test(`${r.stderr ?? ''}\n${r.stdout}`))
}
