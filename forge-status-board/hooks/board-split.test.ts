// board-split.test.ts — #4957 머리 줄에 프로젝트 방·공통 방 나눔 줄(board-rooms.py split.line)을 붙인다 · 옛 스크립트(split 없음)는 종전 그대로
import { describe, expect, test } from 'claude-code/testing'

import { roomLines } from './board'

const ok = (stdout: string) => ({ exitCode: 0, stdout })

describe('#4957 방 개수 나눔', () => {
  test('split 이 있으면 머리 줄에 나눔 줄을 붙인다', () => {
    const r = ok(JSON.stringify({ project: 'ai-hub', all: false, basis: '프로젝트 ai-hub · 쓰기 세션', rooms: [],
      split: { project: 8, common: 3, cap: 10, line: '프로젝트 방(ai-hub) 8/10 · 공통 방 3/10' } }))
    expect(roomLines(r)[0]).toBe('방 0개(프로젝트 방(ai-hub) 8/10 · 공통 방 3/10) — 프로젝트 ai-hub · 쓰기 세션 · 둘 다 쓰는 방(mode=both·기록 없는 공통 방)은 늘')
  })
  test('split 이 없으면(옛 스크립트) 종전 문구', () => {
    const r = ok(JSON.stringify({ project: 'forge', all: false, basis: '프로젝트 forge · 쓰기 세션', rooms: [] }))
    expect(roomLines(r)[0]).toBe('방 0개 — 프로젝트 forge · 쓰기 세션 · 둘 다 쓰는 방(mode=both·기록 없는 공통 방)은 늘')
  })
})
