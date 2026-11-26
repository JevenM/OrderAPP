import { describe, expect, it } from 'vitest'
import { computeWarmth, WARMTH_CAPS, WARMTH_WEIGHTS, type WarmthInput } from './warmth'
import { shiftDay } from './date'
import type { MealSlot } from './types'

const TODAY = '2026-11-26'
const PAIR = ['A', 'B'] as const

/** 用本地时间构造 ISO，避免 UTC+8 跨天漂移 */
const iso = (day: string, hour = 10): string => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d, hour).toISOString()
}

const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner']

/** 造 n 天的三餐打卡（两人 × 3 餐 × 天） */
const filledMeals = (from: string, days: number, who: string[] = ['A', 'B']) => {
  const out: NonNullable<WarmthInput['meals']> = []
  for (let i = 0; i < days; i += 1) {
    const day = shiftDay(from, i)
    for (const member of who) for (const slot of SLOTS) out.push({ day, slot, member_id: member })
  }
  return out
}

describe('关系温度计', () => {
  it('六个信号权重合计 100', () => {
    const sum = Object.values(WARMTH_WEIGHTS).reduce((a, b) => a + b, 0)
    expect(sum).toBe(100)
    // 每个信号都要有满分阈值，否则除以 0 会炸
    for (const key of Object.keys(WARMTH_WEIGHTS) as (keyof typeof WARMTH_CAPS)[]) {
      expect(WARMTH_CAPS[key]).toBeGreaterThan(0)
    }
  })

  it('完全没有数据时温度是 0，不是 NaN，趋势平稳', () => {
    const r = computeWarmth({}, TODAY, PAIR)
    expect(r.temp).toBe(0)
    expect(r.prev).toBe(0)
    expect(r.trend).toBe('flat')
    expect(r.band).toBe('cold')
    expect(Number.isNaN(r.temp)).toBe(false)
    expect(r.parts).toHaveLength(6)
    for (const p of r.parts) expect(p.value).toBe(0)
  })

  it('六路全部拉满时温度到 100', () => {
    const input: WarmthInput = {
      meals: filledMeals(shiftDay(TODAY, -6), 7),
      messages: Array.from({ length: 21 }, (_, i) => ({
        created_at: iso(shiftDay(TODAY, -Math.floor(i / 3)), 12),
        sender_id: i % 2 ? 'A' : 'B',
        receiver_id: i % 2 ? 'B' : 'A',
      })),
      games: Array.from({ length: 2 }, () => ({ finished_at: iso(TODAY), member_a: 'A', member_b: 'B' })),
      hearts: Array.from({ length: 2 }, () => ({ created_at: iso(TODAY), member_a: 'A', member_b: 'B' })),
      orders: Array.from({ length: 3 }, (_, i) => ({
        created_at: iso(TODAY, 8 + i),
        status: 'done',
        member_id: i % 2 ? 'A' : 'B',
      })),
      posts: Array.from({ length: 2 }, () => ({ created_at: iso(TODAY), member_id: 'A' })),
    }
    const r = computeWarmth(input, TODAY, PAIR)
    expect(r.temp).toBe(100)
    for (const p of r.parts) expect(p.value).toBe(1)
  })

  it('同一天同一餐的重复行只算一次', () => {
    const dup: NonNullable<WarmthInput['meals']> = [
      { day: TODAY, slot: 'lunch', member_id: 'A' },
      { day: TODAY, slot: 'lunch', member_id: 'A' },
      { day: TODAY, slot: 'lunch', member_id: 'A' },
    ]
    const r = computeWarmth({ meals: dup }, TODAY, PAIR)
    const part = r.parts.find((p) => p.key === 'meals')
    expect(part?.count).toBe(1)
  })

  it('别对情侣的数据一律不计入，member_id 为空的老记录也不计入', () => {
    const input: WarmthInput = {
      meals: [
        { day: TODAY, slot: 'lunch', member_id: 'B' },
        { day: TODAY, slot: 'lunch', member_id: 'C' }, // 别对
        { day: TODAY, slot: 'dinner', member_id: null }, // 早期无归属
      ],
      messages: [
        { created_at: iso(TODAY), sender_id: 'A', receiver_id: 'B' },
        { created_at: iso(TODAY), sender_id: 'A', receiver_id: 'C' }, // 别对
      ],
      games: [
        { finished_at: iso(TODAY), member_a: 'A', member_b: 'B' },
        { finished_at: iso(TODAY), member_a: 'C', member_b: 'D' }, // 别对
      ],
      orders: [
        { created_at: iso(TODAY), status: 'pending', member_id: 'A' },
        { created_at: iso(TODAY), status: 'cancelled', member_id: 'A' }, // 取消的不算
      ],
      posts: [{ created_at: iso(TODAY), member_id: 'C' }],
    }
    const map = Object.fromEntries(computeWarmth(input, TODAY, PAIR).parts.map((p) => [p.key, p.count]))
    expect(map).toEqual({ meals: 1, chat: 1, play: 1, heart: 0, food: 1, feed: 0 })
  })

  it('窗口外的数据不算进本周，本周明显更热时趋势为升温', () => {
    const input: WarmthInput = {
      meals: filledMeals(shiftDay(TODAY, -6), 7),
      messages: Array.from({ length: 10 }, (_, i) => ({
        created_at: iso(shiftDay(TODAY, -13), 9 + (i % 5)),
        sender_id: 'A',
        receiver_id: 'B',
      })),
    }
    const r = computeWarmth(input, TODAY, PAIR)
    expect(r.delta).toBeGreaterThanOrEqual(4)
    expect(r.trend).toBe('up')
    expect(r.prev).toBeGreaterThan(0)
  })

  it('温度高时给的是肯定，不是继续催', () => {
    const input: WarmthInput = { meals: filledMeals(shiftDay(TODAY, -6), 7) }
    const r = computeWarmth(input, TODAY, PAIR)
    expect(r.temp).toBeGreaterThanOrEqual(20)
    expect(r.advice.length).toBeGreaterThan(0)
  })
})
