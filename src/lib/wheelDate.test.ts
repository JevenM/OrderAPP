import { describe, expect, it } from 'vitest'
import {
  WHEEL_ITEM_HEIGHT,
  clampWheelDate,
  wheelDays,
  wheelIndex,
  wheelIndexFromScroll,
  wheelMonths,
  wheelScrollTop,
  wheelYears,
} from './wheelDate'

describe('滚轮日期候选', () => {
  it('年份以锚点为中心前后各 10 年', () => {
    expect(wheelYears(2026)).toEqual(Array.from({ length: 21 }, (_, i) => 2016 + i))
  })

  it('min/max 收窄年份范围', () => {
    expect(wheelYears(2026, '2025-03-01')).toEqual(Array.from({ length: 12 }, (_, i) => 2025 + i))
    expect(wheelYears(2026, undefined, '2027-01-01')).toEqual([2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027])
  })

  it('月份只在边界年受 min/max 限制', () => {
    expect(wheelMonths(2026)).toHaveLength(12)
    expect(wheelMonths(2026, '2026-03-10')).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(wheelMonths(2026, undefined, '2026-05-02')).toEqual([1, 2, 3, 4, 5])
    expect(wheelMonths(2027, '2026-03-10')).toHaveLength(12)
  })

  it('天数跟随闰年与边界月', () => {
    expect(wheelDays(2024, 2)).toHaveLength(29)
    expect(wheelDays(2026, 2)).toHaveLength(28)
    expect(wheelDays(2026, 4)).toHaveLength(30)
    expect(wheelDays(2026, 5, '2026-05-10')).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31])
  })
})

describe('滚轮日期收敛', () => {
  it('小月没有 31 号，闰日在平年收敛到 28', () => {
    expect(clampWheelDate({ year: 2026, month: 4, day: 31 })).toEqual({ year: 2026, month: 4, day: 30 })
    expect(clampWheelDate({ year: 2025, month: 2, day: 29 })).toEqual({ year: 2025, month: 2, day: 28 })
  })

  it('改年月后不越出 min/max', () => {
    expect(clampWheelDate({ year: 2026, month: 5, day: 20 }, '2026-06-01')).toEqual({ year: 2026, month: 6, day: 1 })
    expect(clampWheelDate({ year: 2026, month: 7, day: 20 }, undefined, '2026-05-02')).toEqual({ year: 2026, month: 5, day: 2 })
  })

  it('空区间不会算出 NaN', () => {
    expect(clampWheelDate({ year: 2026, month: 0, day: 0 })).toEqual({ year: 2026, month: 1, day: 1 })
  })
})

describe('滚轮位置换算', () => {
  it('找不到值时退回锚点下标', () => {
    expect(wheelIndex(2026, [2024, 2025, 2026], 0)).toBe(2)
    expect(wheelIndex(2030, [2024, 2025, 2026], 1)).toBe(1)
    expect(wheelIndex(2030, [], 4)).toBe(0)
  })

  it('scrollTop 与下标可往返，越界时收敛', () => {
    for (let i = 0; i < 12; i += 1) {
      expect(wheelIndexFromScroll(wheelScrollTop(i), 12)).toBe(i)
    }
    expect(wheelIndexFromScroll(wheelScrollTop(99), 12)).toBe(11)
    expect(wheelIndexFromScroll(0, 12)).toBe(0)
    expect(wheelIndexFromScroll(0, 0)).toBe(0)
    expect(wheelScrollTop(0)).toBe(WHEEL_ITEM_HEIGHT)
  })
})
