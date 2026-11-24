import { describe, expect, it } from 'vitest'
import {
  WUFU_PATTERNS,
  generateMines,
  minesAroundOf,
  parseCustomCells,
  shuffleList,
  wufuFormedPatterns,
  wufuMoveTargets,
} from './coupleGameRules'

describe('情侣游戏纯规则', () => {
  it('parseCustomCells 去空去重且上限 100', () => {
    expect(parseCustomCells(' a \n b \na\n\n c')).toEqual(['a', 'b', 'c'])
    expect(parseCustomCells(Array.from({ length: 200 }, (_, i) => `x${i}`).join('\n'))).toHaveLength(100)
  })

  it('shuffleList 不改原数组且元素不丢失', () => {
    const src = [1, 2, 3, 4, 5]
    const out = shuffleList(src)
    expect(src).toEqual([1, 2, 3, 4, 5])
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5])
  })

  it('generateMines 避开首格及一圈，数量不超上限', () => {
    const mines = generateMines(6, 6, 6, 14)
    expect(mines).toHaveLength(6)
    expect(mines).not.toContain(14)
    expect(mines.every((i) => Math.abs(Math.floor(i / 6) - 2) > 1 || Math.abs((i % 6) - 2) > 1)).toBe(true)
    expect(new Set(mines).size).toBe(mines.length)
  })

  it('minesAroundOf 正确统计八邻域', () => {
    const state = { rows: 3, cols: 3, mines: [0, 1], mineTotal: 2, cells: [], log: [], hits: [], turn: 0 as const, reward: '', cleared: false }
    expect(minesAroundOf(state, 4)).toBe(2)
    expect(minesAroundOf(state, 8)).toBe(0)
  })

  it('五福棋棋形判定与走子规则', () => {
    const board = Array(25).fill(0)
    for (const c of [0, 1, 2, 3, 4]) board[c] = 1
    const formed = wufuFormedPatterns(board, 1)
    expect(formed.size).toBeGreaterThan(0)
    const first = [...formed][0]
    expect(first).toBeDefined()
    expect(WUFU_PATTERNS[first!].name).toBe('大棍')
    expect(wufuMoveTargets(board, 0)).toEqual([5])
  })
})
