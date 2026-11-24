/**
 * 情侣游戏的纯规则层：五福棋棋形判定、扫雷雷区生成、先手判定等。
 * 从 CouplePage 抽离，函数无副作用、不依赖 React state，便于单测与复用。
 */
import type { CoupleMinesState } from './db'

/** 洗牌（返回新数组，不改原数组） */
export function shuffleList<T>(list: T[]): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** 解析自定义内容池：按行拆分、去空去重，最多 100 条 */
export function parseCustomCells(text: string): string[] {
  const seen = new Set<string>()
  const lines: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || seen.has(line) || lines.length >= 100) continue
    seen.add(line)
    lines.push(line)
  }
  return lines
}

/** 开局先手判定：双方各掷一次骰子，点数大的先走（平局重掷） */
export function rollForFirst(names: [string, string], verb = '先走'): { turn: 0 | 1; logs: string[] } {
  const logs: string[] = []
  let a = 0
  let b = 0
  while (a === b) {
    a = 1 + Math.floor(Math.random() * 6)
    b = 1 + Math.floor(Math.random() * 6)
    logs.push(`🎲先手判定：${names[0]} 掷出 ${a} 点，${names[1]} 掷出 ${b} 点${a === b ? '，平局重掷' : ''}`)
  }
  const turn: 0 | 1 = a > b ? 0 : 1
  logs.push(`✌️${names[turn]}点数更大，由 TA ${verb}`)
  return { turn, logs }
}

/** 五福棋全部成项棋形（吃子规则）：通天 / 大棍 / 四斜 / 三斜 / 小方 */
export const WUFU_PATTERNS: Array<{ name: string; cells: number[] }> = [
  ...Array.from({ length: 5 }, (_, r) => ({ name: '大棍', cells: [0, 1, 2, 3, 4].map((c) => r * 5 + c) })),
  ...Array.from({ length: 5 }, (_, c) => ({ name: '大棍', cells: [0, 1, 2, 3, 4].map((r) => r * 5 + c) })),
  { name: '通天', cells: [0, 6, 12, 18, 24] },
  { name: '通天', cells: [4, 8, 12, 16, 20] },
  { name: '四斜', cells: [1, 7, 13, 19] },
  { name: '四斜', cells: [5, 11, 17, 23] },
  { name: '四斜', cells: [3, 7, 11, 15] },
  { name: '四斜', cells: [9, 13, 17, 21] },
  { name: '三斜', cells: [2, 6, 10] },
  { name: '三斜', cells: [14, 18, 22] },
  { name: '三斜', cells: [2, 8, 14] },
  { name: '三斜', cells: [10, 16, 22] },
  ...Array.from({ length: 16 }, (_, i) => {
    const r = Math.floor(i / 4)
    const c = i % 4
    return { name: '小方', cells: [r * 5 + c, r * 5 + c + 1, (r + 1) * 5 + c, (r + 1) * 5 + c + 1] }
  }),
]

export function wufuFormedPatterns(board: number[], player: number): Set<number> {
  const formed = new Set<number>()
  WUFU_PATTERNS.forEach((pattern, index) => {
    if (pattern.cells.every((cell) => board[cell] === player)) formed.add(index)
  })
  return formed
}

export function wufuProtectedCells(board: number[], player: number): Set<number> {
  const cells = new Set<number>()
  WUFU_PATTERNS.forEach((pattern) => {
    if (pattern.cells.every((cell) => board[cell] === player)) pattern.cells.forEach((cell) => cells.add(cell))
  })
  return cells
}

export function wufuMoveTargets(board: number[], from: number): number[] {
  const r = Math.floor(from / 5)
  const c = from % 5
  const targets: number[] = []
  if (r > 0 && board[from - 5] === 0) targets.push(from - 5)
  if (r < 4 && board[from + 5] === 0) targets.push(from + 5)
  if (c > 0 && board[from - 1] === 0) targets.push(from - 1)
  if (c < 4 && board[from + 1] === 0) targets.push(from + 1)
  return targets
}

export function wufuHasAnyMove(board: number[], player: number): boolean {
  for (let cell = 0; cell < 25; cell += 1) {
    if (board[cell] === player && wufuMoveTargets(board, cell).length) return true
  }
  return false
}

/** 首次点开时才生成雷区：避开首格及其周围一圈，保证第一步一定安全 */
export function generateMines(rows: number, cols: number, count: number, safeIndex: number): number[] {
  const forbidden = new Set<number>()
  const sr = Math.floor(safeIndex / cols)
  const sc = safeIndex % cols
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      const r = sr + dr
      const c = sc + dc
      if (r >= 0 && r < rows && c >= 0 && c < cols) forbidden.add(r * cols + c)
    }
  }
  const pool: number[] = []
  for (let i = 0; i < rows * cols; i += 1) {
    if (!forbidden.has(i)) pool.push(i)
  }
  return shuffleList(pool).slice(0, Math.min(count, pool.length))
}

/** 某格周围一圈的地雷数 */
export function minesAroundOf(state: CoupleMinesState, index: number): number {
  const { rows, cols, mines } = state
  const r = Math.floor(index / cols)
  const c = index % cols
  let count = 0
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue
      const nr = r + dr
      const nc = c + dc
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && mines.includes(nr * cols + nc)) count += 1
    }
  }
  return count
}
