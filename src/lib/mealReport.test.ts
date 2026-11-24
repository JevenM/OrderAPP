import { describe, expect, it } from 'vitest'
import type { Meal } from './types'
import {
  analyzeMeals,
  buildMealReportText,
  buildSuggestions,
  isMealReportDue,
  lastClosedPeriod,
  mealReportPushKey,
  listPeriods,
  longestStreak,
  mealDetailRows,
  reportSummary,
  splitFoods,
} from './mealReport'

let seq = 0
/** 用本地时间构造 ISO，避免 UTC 差一天 */
const meal = (over: Partial<Meal> = {}): Meal => ({
  id: `m-${seq++}`,
  day: '2026-11-05',
  slot: 'breakfast',
  status: 'eaten',
  content: '小米粥 + 鸡蛋',
  photo_url: '',
  note: '',
  created_at: new Date(2026, 10, 5, 8, 0).toISOString(),
  read_at: null,
  member_id: 'A',
  ...over,
})

const PAIR = ['A', 'B'] as const
const NOV = () => listPeriods('month', 1, new Date(2026, 10, 24))[0]

describe('周期计算', () => {
  it('月报给出当前月，并标为未完结', () => {
    const p = listPeriods('month', 3, new Date(2026, 10, 24))
    expect(p.map((x) => x.key)).toEqual(['2026-11', '2026-10', '2026-09'])
    expect(p[0]).toMatchObject({ start: '2026-11-01', end: '2026-12-01', days: 30, closed: false })
    expect(p[1]).toMatchObject({ label: '2026 年 10 月', days: 31, closed: true })
  })

  it('跨年倒推月份与年份都正确', () => {
    const p = listPeriods('month', 3, new Date(2027, 0, 5))
    expect(p.map((x) => x.key)).toEqual(['2027-01', '2026-12', '2026-11'])
  })

  it('半年报按 H1/H2 倒推，天数按自然月累加', () => {
    const p = listPeriods('half', 3, new Date(2026, 10, 24))
    expect(p.map((x) => x.key)).toEqual(['2026-H2', '2026-H1', '2025-H2'])
    expect(p[0].start).toBe('2026-07-01')
    expect(p[0].end).toBe('2027-01-01')
    expect(p[0].days).toBe(184)
  })

  it('年报覆盖闰年时天数是 366', () => {
    const p = listPeriods('year', 5, new Date(2026, 5, 1))
    expect(p[0]).toMatchObject({ key: '2026', start: '2026-01-01', end: '2027-01-01', days: 365 })
    const leap = listPeriods('year', 3, new Date(2024, 5, 1))[0]
    expect(leap.days).toBe(366)
  })

  it('lastClosedPeriod 给刚结束的那一期，跨年不越界', () => {
    expect(lastClosedPeriod('month', new Date(2027, 0, 3)).key).toBe('2026-12')
    expect(lastClosedPeriod('half', new Date(2026, 0, 5)).key).toBe('2025-H2')
    expect(lastClosedPeriod('year', new Date(2026, 0, 5)).key).toBe('2025')
  })
})

describe('最长连续打卡', () => {
  it('去重、乱序、跨月都能算对', () => {
    expect(longestStreak(['2026-11-01', '2026-11-02', '2026-11-02', '2026-11-04'])).toBe(2)
    expect(longestStreak(['2026-12-01', '2026-11-30', '2026-11-29'])).toBe(3)
    expect(longestStreak([])).toBe(0)
  })
})

describe('自由文本拆词', () => {
  it('拆开常见分隔符并去掉数量词', () => {
    expect(splitFoods('番茄炒蛋×1、米饭×2')).toEqual(['番茄炒蛋', '米饭'])
    expect(splitFoods('小米粥 + 鸡蛋 + 半个肉包')).toEqual(['小米粥', '鸡蛋', '肉包'])
  })
  it('空内容 / 状态词不产生食物', () => {
    expect(splitFoods('')).toEqual([])
    expect(splitFoods('没吃')).toEqual([])
  })
})

describe('报告聚合与情侣对隔离', () => {
  it('只统计本对两人、周期内的记录；别对与无归属记录都被排除', () => {
    const rows = [
      meal({ day: '2026-11-05', content: '小米粥 + 鸡蛋' }),
      meal({ day: '2026-11-06', member_id: 'B', slot: 'lunch', content: '米饭 + 青菜' }),
      meal({ day: '2026-11-07', member_id: 'C', slot: 'dinner', content: '火锅' }), // 别对情侣
      meal({ day: '2026-11-08', member_id: null, content: '面包' }), // 无归属
      meal({ day: '2026-10-31', content: '面条' }), // 周期外
    ]
    const r = analyzeMeals(NOV(), rows, PAIR)
    expect(r.total).toBe(2)
    expect(r.days).toBe(2)
    // 只有 member_id 为空的早期记录算「无归属」；别对情侣与周期外的记录静默排除
    expect(r.unattributed).toBe(1)
    expect(r.bySlot.breakfast).toBe(1)
    expect(r.bySlot.lunch).toBe(1)
    expect(r.topFoods.map((f) => f.name)).not.toContain('火锅')
    expect(r.suggestions.join(' ')).not.toContain('火锅')
  })

  it('状态、餐次、照片、按时率与品类统计正确', () => {
    const rows = [
      meal({ day: '2026-11-01', slot: 'breakfast', status: 'eaten', content: '小米粥 + 鸡蛋', photo_url: 'a.jpg' }),
      meal({ day: '2026-11-02', slot: 'lunch', status: 'little', content: '米饭 + 青菜' }),
      meal({ day: '2026-11-03', slot: 'dinner', status: 'skipped', content: '', created_at: new Date(2026, 10, 3, 23, 0).toISOString() }),
      meal({ day: '2026-11-04', slot: 'snack', status: 'eaten', content: '奶茶' }),
    ]
    const r = analyzeMeals(NOV(), rows, PAIR)
    expect(r.byStatus).toEqual({ eaten: 2, little: 1, skipped: 1 })
    expect(r.photoCount).toBe(1)
    expect(r.breakfastCount).toBe(1)
    // 正餐 3 条：早餐 8 点、午餐 8 点（不在 10-15）、晚餐 23 点（不在 16-21）→ 1/3
    expect(r.onTimeRate).toBeCloseTo(1 / 3, 5)
    expect(r.tastes.find((t) => t.key === 'veg')?.count).toBe(1)
    expect(r.tastes.find((t) => t.key === 'heavy')?.count).toBeGreaterThan(0)
  })

  it('空周期给鼓励性建议，而不是空数组', () => {
    const r = analyzeMeals(NOV(), [], PAIR)
    expect(r.total).toBe(0)
    expect(buildSuggestions(r).length).toBeGreaterThan(0)
    expect(reportSummary(r)).toContain('还没有打卡记录')
  })

  it('没吃 / 早餐少 / 蔬菜少会触发对应建议', () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      meal({ day: `2026-11-${String(i + 1).padStart(2, '0')}`, slot: 'lunch', status: i === 0 ? 'skipped' : 'eaten', content: '炸鸡 + 可乐' })
    )
    const r = analyzeMeals(NOV(), rows, PAIR)
    const joined = r.suggestions.join(' ')
    expect(joined).toContain('早餐')
    expect(joined).toContain('蔬菜水果')
    expect(r.suggestions.length).toBeLessThanOrEqual(6)
  })

  it('导出文本含标题、区间与隔离说明', () => {
    const r = analyzeMeals(NOV(), [meal()], PAIR)
    const text = buildMealReportText(r, '我', '她')
    expect(text).toContain('三餐报告')
    expect(text).toContain('2026-11-01')
    expect(text).toContain('仅统计当前绑定的情侣对')
    expect(text).toContain('给你的建议')
  })

  it('CSV 明细只导出本对记录，且按日期排序', () => {
    const rows = [
      meal({ day: '2026-11-09', member_id: 'B', content: '面条' }),
      meal({ day: '2026-11-02', content: '粥' }),
      meal({ day: '2026-11-03', member_id: 'C', content: '不该出现' }),
    ]
    const csv = mealDetailRows(rows, PAIR)
    expect(csv).toHaveLength(2)
    expect(csv[0][0]).toBe('2026-11-02')
    expect(csv[0][1]).toBe('早餐')
    expect(csv[0][2]).toBe('吃了')
    expect(csv.map((r) => r[3]).join()).not.toContain('不该出现')
  })
})

describe('自动推送去重', () => {
  it('去重键按情侣对隔离，A 推过不影响 B', () => {
    const a = mealReportPushKey('A', 'B', 'month', '2026-10')
    const b = mealReportPushKey('A', 'C', 'month', '2026-10')
    expect(a).not.toBe(b)
    expect(mealReportPushKey('B', 'A', 'month', '2026-10')).toBe(a) // 顺序无关
  })

  it('同一对的月报 / 年报互不冲突', () => {
    expect(mealReportPushKey('A', 'B', 'month', '2026-10')).not.toBe(mealReportPushKey('A', 'B', 'year', '2026-10'))
  })

  it('刚结束的周期需要推，已推过或太久以前不再推', () => {
    const now = new Date(2026, 10, 24) // 11 月 24 日
    const never = () => false
    expect(isMealReportDue('A', 'B', 'month', now, never)).toBe(true) // 上月 11/1 结束，23 天内
    expect(isMealReportDue('A', 'B', 'half', now, never)).toBe(false) // 上半年 7/1 结束，太久
    expect(isMealReportDue('A', 'B', 'year', now, never)).toBe(false)
    const already = (k: string) => k === mealReportPushKey('A', 'B', 'month', '2026-10')
    expect(isMealReportDue('A', 'B', 'month', now, already)).toBe(false)
  })

  it('半年报 / 年报在各自刚结束时才会推', () => {
    const never = () => false
    expect(isMealReportDue('A', 'B', 'half', new Date(2026, 6, 5), never)).toBe(true)
    expect(isMealReportDue('A', 'B', 'year', new Date(2026, 0, 10), never)).toBe(true)
  })
})
