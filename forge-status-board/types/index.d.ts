// #3796 패널 한 장 = 머리 줄 · 방 카드 · 꼬리 줄(hooks/board.ts 의 View 와 같은 꼴)
// #3753 icon(직무 아이콘 · 없으면 '') · ctx(교체 기준 대비 막대 · 못 재면 null)
export type BoardCtx = { bar: string; pct: number; tone: 'success' | 'warning' | 'error' }
export type BoardCard = { mark: string; icon: string; name: string; stuck: boolean; head: string; now: string; meta: string; ctx: BoardCtx | null }
export type BoardView = { head: string[]; cards: BoardCard[]; tail: string[] }

declare module 'claude-code' {
  interface PluginState {
    'forge-status-board': { view: BoardView }
  }
}
