import { describe, expect, it } from 'vitest'
import {
  currentStreak,
  daysLeft,
  formatAmount,
  goalMetaLine,
  goalPercent,
  goalRatio,
  goalValueText,
  normalizeCheckins,
  toggleCheckin,
  weeklyCheckins,
  type GoalLike,
} from './goals'

const TODAY = '2026-11-26'

const goal = (over: Partial<GoalLike> = {}): GoalLike => ({
  kind: 'save',
  target: 10000,
  current: 2500,
  checkins: [],
  deadline: null,
  ...over,
})

describe('习惯打卡', () => {
  it('归一化：非数组给空数组，过滤非法日期，排序去重', () => {
    expect(normalizeCheckins(null)).toEqual([])
    expect(normalizeCheckins('2026-11-01')).toEqual([])
    expect(normalizeCheckins(['2026-11-02', 'x', 3, '2026-11-01', '2026-11-02'])).toEqual([
      '2026-11-01',
      '2026-11-02',
    ])
  })

  it('打卡是切换式的：再点一次就是取消，重复调用不会重复写', () => {
    const once = toggleCheckin([], TODAY)
    expect(once).toEqual([TODAY])
    expect(toggleCheckin(once, TODAY)).toEqual([])
    expect(toggleCheckin(once, TODAY)).toEqual([])
  })

  it('连续天数：今天打卡从今天数；只有昨天也算连续，不清零；断两天归零', () => {
    expect(currentStreak(['2026-11-24', '2026-11-25', '2026-11-26'], TODAY)).toBe(3)
    // 今天还没打卡，但昨天打了 → 连续 2 天仍成立
    expect(currentStreak(['2026-11-24', '2026-11-25'], TODAY)).toBe(2)
    expect(currentStreak(['2026-11-23', '2026-11-24'], TODAY)).toBe(0)
    expect(currentStreak([], TODAY)).toBe(0)
  })

  it('近 7 天打卡次数只数窗口内的', () => {
    expect(weeklyCheckins(['2026-11-20', '2026-11-25', '2026-11-26', '2026-11-01'], TODAY)).toBe(3)
  })
})

describe('目标进度', () => {
  it('存钱按 当前/目标 计算并封顶 1', () => {
    expect(goalRatio(goal(), TODAY)).toBeCloseTo(0.25, 5)
    expect(goalPercent(goal(), TODAY)).toBe(25)
    expect(goalRatio(goal({ current: 12000 }), TODAY)).toBe(1)
    expect(goalRatio(goal({ target: null }), TODAY)).toBe(0)
  })

  it('习惯按近 7 天打卡数 / 7 计算', () => {
    const habit = goal({ kind: 'habit', target: null, checkins: ['2026-11-25', '2026-11-26'] })
    expect(goalRatio(habit, TODAY)).toBeCloseTo(2 / 7, 5)
    expect(goalPercent(habit, TODAY)).toBe(29)
  })

  it('千分位与截止日天数', () => {
    expect(formatAmount(3200)).toBe('3,200')
    expect(formatAmount(1234567)).toBe('1,234,567')
    expect(formatAmount(12.5)).toBe('12.5')
    expect(daysLeft('2026-12-01', TODAY)).toBe(5)
    expect(daysLeft('2026-11-01', TODAY)).toBe(-25)
    expect(daysLeft(null, TODAY)).toBeNull()
  })

  it('副标题按类型给出截止日或连续天数', () => {
    expect(goalMetaLine(goal({ kind: 'travel', deadline: '2026-12-06' }), TODAY)).toBe('旅行 · 剩 10 天')
    expect(goalMetaLine(goal({ deadline: '2026-11-01' }), TODAY)).toBe('存钱 · 已过截止日')
    expect(
      goalMetaLine(goal({ kind: 'habit', checkins: ['2026-11-25', '2026-11-26'] }), TODAY)
    ).toBe('习惯 · 连续 2 天')
    expect(goalMetaLine(goal({ kind: 'custom' }), TODAY)).toBe('自定义')
  })

  it('数值文案：有目标值显示 当前/目标，没有就只显示累计', () => {
    expect(goalValueText(goal(), TODAY)).toBe('2,500 / 10,000 元')
    expect(goalValueText(goal({ target: null }), TODAY)).toBe('2,500 元')
    expect(goalValueText(goal({ kind: 'custom', target: null, current: 3 }), TODAY)).toBe('3')
    expect(
      goalValueText(goal({ kind: 'habit', target: null, checkins: ['2026-11-26'] }), TODAY)
    ).toBe('近 7 天 1 次')
  })
})
