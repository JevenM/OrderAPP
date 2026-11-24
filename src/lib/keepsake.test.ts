import { describe, expect, it } from 'vitest'
import {
  albumDayIndex,
  blankTopic,
  buildReviewText,
  capsuleDaysLeft,
  capsuleUnlocked,
  EMPTY_YEAR_REVIEW,
  groupAlbumByMonth,
  localDayStart,
  longestStreak,
  topicSummary,
  type WeddingTopic,
} from './keepsake'
import type { Post } from './types'

/** 用本地时间构造 ISO，避免 UTC 时刻在不同时区跨天导致断言漂移 */
const localIso = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h).toISOString()

const post = (id: string, created_at: string): Post => ({
  id,
  created_at,
  author: 'me',
  member_id: null,
  content: '',
  photo_url: `https://example.com/${id}.jpg`,
  meal_slot: null,
  day: null,
})

describe('日期按本地零点解析', () => {
  it('YYYY-MM-DD 不按 UTC 解析，且能与本地当天零点对齐', () => {
    const at = localDayStart('2026-11-24')
    expect(at).toBe(new Date(2026, 10, 24).getTime())
    expect(new Date(at).getDate()).toBe(24)
  })

  it('非法日期返回 NaN', () => {
    expect(Number.isNaN(localDayStart('2026/11/24'))).toBe(true)
    expect(Number.isNaN(localDayStart(''))).toBe(true)
  })
})

describe('时光胶囊开封规则', () => {
  const today = new Date(2026, 10, 24, 12, 0, 0).getTime()

  it('开封日当天零点起即可读', () => {
    expect(capsuleUnlocked('2026-11-24', today)).toBe(true)
    expect(capsuleUnlocked('2026-11-23', today)).toBe(true)
    expect(capsuleUnlocked('2026-11-25', today)).toBe(false)
  })

  it('非法日期永不解锁', () => {
    expect(capsuleUnlocked('not-a-date', today)).toBe(false)
  })

  it('剩余天数按自然日算，已开封为 0', () => {
    expect(capsuleDaysLeft('2026-11-25', today)).toBe(1)
    expect(capsuleDaysLeft('2026-12-24', today)).toBe(30)
    expect(capsuleDaysLeft('2026-11-24', today)).toBe(0)
    expect(capsuleDaysLeft('2026-11-20', today)).toBe(0)
  })
})

describe('最长连续打卡', () => {
  it('乱序、重复的日期也能算出连续段', () => {
    expect(longestStreak(['2026-01-03', '2026-01-01', '2026-01-02', '2026-01-02'])).toBe(3)
  })

  it('跨月连续不中断', () => {
    expect(longestStreak(['2026-01-31', '2026-02-01', '2026-02-02'])).toBe(3)
  })

  it('断档取最长的一段', () => {
    expect(longestStreak(['2026-01-01', '2026-01-02', '2026-01-10', '2026-01-11', '2026-01-12', '2026-01-13'])).toBe(4)
  })

  it('空列表与非法值为 0', () => {
    expect(longestStreak([])).toBe(0)
    expect(longestStreak(['bad'])).toBe(0)
  })
})

describe('共同相册时间轴', () => {
  it('按年月分组并保持倒序输入顺序', () => {
    const groups = groupAlbumByMonth([
      post('a', localIso(2026, 11, 24)),
      post('b', localIso(2026, 11, 2)),
      post('c', localIso(2026, 10, 30)),
    ])
    expect(groups.map((g) => g.month)).toEqual(['2026-11', '2026-10'])
    expect(groups[0].label).toBe('2026 年 11 月')
    expect(groups[0].posts).toHaveLength(2)
  })

  it('「我们的第 N 天」从第一张照片当天算第 1 天', () => {
    const first = localIso(2026, 1, 1, 20)
    expect(albumDayIndex(localIso(2026, 1, 1, 8), first)).toBe(1)
    expect(albumDayIndex(localIso(2026, 1, 3, 8), first)).toBe(3)
    expect(albumDayIndex(localIso(2026, 1, 1, 8), localIso(2026, 1, 3, 20))).toBe(1)
  })
})

describe('备婚沟通台账', () => {
  it('空白议题默认值正确', () => {
    const t = blankTopic('t1', '彩礼与嫁妆', 'm1')
    expect(t).toMatchObject({ id: 't1', title: '彩礼与嫁妆', owner: 'both', settled: false, createdBy: 'm1' })
    expect(t.mine).toBe('')
    expect(t.theirs).toBe('')
  })

  it('汇总谈拢与待沟通数量', () => {
    const topics = [
      { ...blankTopic('a', 'A', 'm1'), settled: true },
      { ...blankTopic('b', 'B', 'm1') },
      { ...blankTopic('c', 'C', 'm1'), settled: true },
    ] satisfies WeddingTopic[]
    expect(topicSummary(topics)).toEqual({ total: 3, settled: 2, pending: 1 })
    expect(topicSummary([])).toEqual({ total: 0, settled: 0, pending: 0 })
  })
})

describe('年度回顾导出文本', () => {
  it('包含年份、两人名字与关键统计', () => {
    const text = buildReviewText(
      { ...EMPTY_YEAR_REVIEW, year: 2026, meals: 42, longestStreak: 9, weddingDone: 3, weddingTotal: 16 },
      '小明', '小红'
    )
    expect(text).toContain('小明 × 小红 的 2026 年度回顾')
    expect(text).toContain('三餐打卡 42 次')
    expect(text).toContain('最长连着打卡 9 天')
    expect(text).toContain('备婚流程 3/16 步')
    expect(text).toContain('明年继续')
  })
})
