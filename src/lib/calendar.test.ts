import { describe, expect, it } from 'vitest'
import { formatCnDate, inRange, monthMatrix, monthLabel, parseDay, shiftMonth } from './calendar'

describe('monthMatrix', () => {
  it('固定 42 格，周一为首列', () => {
    // 2026-11-01 是周日，周一为首列时应落在第 7 格
    const cells = monthMatrix(2026, 11)
    expect(cells).toHaveLength(42)
    expect(cells[0].iso).toBe('2026-10-26')
    expect(cells[6].iso).toBe('2026-11-01')
    expect(cells[6].inMonth).toBe(true)
  })

  it('闰年二月包含 29 天', () => {
    expect(monthMatrix(2024, 2).filter((c) => c.inMonth)).toHaveLength(29)
    expect(monthMatrix(2025, 2).filter((c) => c.inMonth)).toHaveLength(28)
  })
})

describe('shiftMonth', () => {
  it('跨年自动进位 / 借位', () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 })
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 })
    expect(shiftMonth(2026, 6, 0)).toEqual({ year: 2026, month: 6 })
  })
})

describe('parseDay', () => {
  it('合法与非法日期', () => {
    expect(parseDay('2026-11-25')).toEqual({ year: 2026, month: 11, day: 25 })
    expect(parseDay('')).toBeNull()
    expect(parseDay('2026-13-01')).toBeNull()
    expect(parseDay('2026/11/25')).toBeNull()
  })
})

describe('formatCnDate', () => {
  it('同年省略年份并带星期', () => {
    expect(formatCnDate('2026-11-25', '2026-11-25')).toBe('11月25日 周三')
  })

  it('跨年补上年份', () => {
    expect(formatCnDate('2027-01-01', '2026-11-25')).toBe('2027年1月1日 周五')
  })
})

describe('inRange', () => {
  it('闭区间与空缺省', () => {
    expect(inRange('2026-11-25', '2026-11-25', '2026-11-30')).toBe(true)
    expect(inRange('2026-11-24', '2026-11-25')).toBe(false)
    expect(inRange('2026-12-01', undefined, '2026-11-30')).toBe(false)
    expect(inRange('2026-12-01')).toBe(true)
  })
})

describe('monthLabel', () => {
  it('中文月份标题', () => {
    expect(monthLabel(2026, 11)).toBe('2026年11月')
  })
})
