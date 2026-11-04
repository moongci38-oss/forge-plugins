// board-badge.test.ts — #4717 ③ 카드 머리 배지: 상태(🟢 도는 중 · 💤 쉬는 중 · 🛑 멈춤 · ⚠️ 끊김) · 모드(✍️ 쓰기 · 👀 읽기)
import { describe, expect, test } from 'claude-code/testing'

import { boardLines, roomCards } from './board'

const ok = (stdout: string) => ({ exitCode: 0, stdout })
const room = (o: Record<string, unknown>) => ({
  name: 'harness-4', axis: '공통', project: 'forge', mode: null, state: '쉬는 중', issues: [], last_turn: null,
  ctx_pct: null, ctx_tokens: null, ctx_window: null, tok_out: null, tok_in_new: null, calls: null, ...o,
})
const rooms = (list: unknown[]) => ok(JSON.stringify({ project: 'forge', all: false, rooms: list }))
const none = ok('[]')

describe('#4717 카드 머리 배지', () => {
  test('상태 배지 — 도는 중 🟢 · 쉬는 중 💤 · 멈춤 🛑 · 끊김 ⚠️', () => {
    const c = roomCards(rooms([
      room({ name: 'a', state: '도는 중', idle_min: 1 }), room({ name: 'b', state: '쉬는 중' }),
      room({ name: 'c', state: '도는 중', idle_min: 30 }), room({ name: 'd', state: '끊김' }),
    ]), none)
    expect(c?.map(k => k.head)).toEqual(['🛑 c · 멈춤 30분', '🟢 a · 도는 중', '💤 b · 쉬는 중', '⚠️ d · 끊김'])
  })
  test('모드 배지 — 쓰기 ✍️ · 읽기 👀 · 모드 없음은 안 붙인다 · 이름 뒤 상태 앞', () => {
    const c = roomCards(rooms([
      room({ name: 'harness-4', callname: '폰노이만', icon: '🔩', mode: 'write', state: '도는 중', idle_min: 1 }),
      room({ name: 'r', mode: 'read' }), room({ name: 'n' }),
    ]), none)
    expect(c?.map(k => k.head)).toEqual(['🟢 🔩 폰노이만 harness-4 ✍️ · 도는 중', '💤 r 👀 · 쉬는 중', '💤 n · 쉬는 중'])
  })
  test('요약 줄은 새 배지로도 상태별로 센다', () => {
    const r = rooms([room({ name: 'a', state: '도는 중', idle_min: 1 }), room({ name: 'b', state: '도는 중', idle_min: 30 }), room({ name: 'c' })])
    const got = boardLines({ prs: ok('[]'), pc: ok('pc:PC-A'), issues: none, guard: ok(''), rooms: r })
    expect(got).toContain('도는 중 1 · 쉬는 중 1 · 멈춤 1 · 열린 PR 0')
  })
  test('배지 글자를 직무 아이콘으로 받지 않는다(헷갈림 방지)', () => {
    const c = roomCards(rooms([room({ name: 'x', icon: '🟢' }), room({ name: 'y', icon: '💤' })]), none)
    expect(c?.map(k => k.icon)).toEqual(['', ''])
  })
})
