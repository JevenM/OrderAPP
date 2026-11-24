import { describe, expect, it } from 'vitest'
import { prettyDay, shiftDay, timeCn, toDayStr, weekdayCn } from './date'

describe('date 工具', () => {
  it('toDayStr 补零输出本地日期', () => {
    expect(toDayStr(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('shiftDay 跨月跨年正确', () => {
    expect(shiftDay('2026-01-01', -1)).toBe('2025-12-31')
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftDay('2024-02-28', 1)).toBe('2024-02-29')
  })

  it('prettyDay 今天 / 昨天 / 其他', () => {
    const today = toDayStr(new Date())
    expect(prettyDay(today)).toBe('今天')
    expect(prettyDay(shiftDay(today, -1))).toBe('昨天')
    const future = shiftDay(today, 3)
    expect(prettyDay(future)).toBe(`${Number(future.slice(5, 7))}月${Number(future.slice(8))}日`)
  })

  it('weekdayCn / timeCn 输出中文', () => {
    expect(weekdayCn('2026-11-24')).toMatch(/^周/)
    const t = timeCn('2026-11-24T09:05:00')
    expect(t).toContain('11月24日')
    expect(t).toContain('09:05')
  })
})
