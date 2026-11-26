import { interp } from './loveTree'
import { shiftDay, toDayStr } from './date'
import type { MealSlot } from './types'

/**
 * 关系温度计（纯计算层）。
 *
 * 设计原则：**零新增表**。所有信号都来自已经在跑的业务数据，
 * 所以老用户升级后立刻有分数，不需要回填、不需要迁移。
 *
 * 计分口径刻意「按活跃度而不是按总量」：每个信号都在 7 天窗口内设了满分阈值（CAP），
 * 达到阈值即封顶，避免天天点菜把温度顶死、也避免某一天猛刷把曲线拉成尖刺。
 */

export type WarmthKey = 'meals' | 'chat' | 'play' | 'heart' | 'food' | 'feed'

/** 各信号权重，合计 100 */
export const WARMTH_WEIGHTS: Record<WarmthKey, number> = {
  meals: 25,
  chat: 20,
  play: 15,
  heart: 15,
  food: 15,
  feed: 10,
}

/** 各信号在 7 天窗口内的满分阈值 */
export const WARMTH_CAPS: Record<WarmthKey, number> = {
  meals: 42, // 3 餐 × 2 人 × 7 天
  chat: 21, // 平均每天 3 条
  play: 3, // 一周一起玩 2 局就算达标
  heart: 2,
  food: 3, // 一周互相投喂 3 单
  feed: 2,
}

export const WARMTH_LABELS: Record<WarmthKey, string> = {
  meals: '三餐打卡',
  chat: '甜蜜留言',
  play: '一起玩',
  heart: '心意表达',
  food: '投喂',
  feed: '生活分享',
}

/** 弱项对应的建议，用于卡片底部那一行 */
const ADVICE: Record<WarmthKey, string> = {
  meals: '一起吃饭打个卡，温度会立刻升一点',
  chat: '给 TA 留句话吧，一句就够',
  play: '一起玩一局，比什么都管用',
  heart: '写个心愿，或者说句真心话',
  food: '点一道 TA 爱吃的菜',
  feed: '发条动态，让 TA 看到你在想什么',
}

/** 原始权重 → 温度的非线性曲线：低活跃段抬一抬，避免「什么都没做也是 0 分」太刺眼 */
const CURVE: [number, number][] = [
  [0, 0],
  [0.15, 0.22],
  [0.35, 0.5],
  [0.55, 0.7],
  [0.75, 0.85],
  [1, 1],
]

export interface WarmthMealRow {
  day: string
  slot: MealSlot
  member_id: string | null
}
export interface WarmthOrderRow {
  created_at: string
  status: string
  member_id: string | null
}
export interface WarmthPostRow {
  created_at: string
  member_id: string | null
}
export interface WarmthMessageRow {
  created_at: string
  sender_id: string
  receiver_id: string
}
export interface WarmthGameRow {
  finished_at: string
  member_a: string
  member_b: string
}
export interface WarmthHeartRow {
  created_at: string
  member_a: string
  member_b: string
}

/** 各表可能不存在（用户没跑迁移），所以全部按可选处理 */
export interface WarmthInput {
  meals?: WarmthMealRow[]
  messages?: WarmthMessageRow[]
  games?: WarmthGameRow[]
  hearts?: WarmthHeartRow[]
  orders?: WarmthOrderRow[]
  posts?: WarmthPostRow[]
}

export interface WarmthPart {
  key: WarmthKey
  label: string
  weight: number
  /** 窗口内原始次数 */
  count: number
  /** 满分阈值 */
  cap: number
  /** 归一化 0~1 */
  value: number
}

export type WarmthTrend = 'up' | 'flat' | 'down'
export type WarmthBand = 'hot' | 'warm' | 'mild' | 'cold'

export interface WarmthResult {
  /** 近 7 天温度 0~100 */
  temp: number
  /** 前 7 天温度 0~100 */
  prev: number
  delta: number
  trend: WarmthTrend
  band: WarmthBand
  /** 一句话总结 / 建议 */
  advice: string
  parts: WarmthPart[]
}

type Counts = Record<WarmthKey, number>

const EMPTY_COUNTS = (): Counts => ({ meals: 0, chat: 0, play: 0, heart: 0, food: 0, feed: 0 })

/** ISO 时间戳 → 本地日期串。与 meals.day 同一口径，跨时区不会错一天 */
const dayOf = (iso: string): string => toDayStr(new Date(iso))

/** 左闭右闭的日期区间判断 */
const within = (day: string, from: string, to: string): boolean => day >= from && day <= to

/** 统计一个窗口内的六路计数 */
function countWindow(
  input: WarmthInput,
  pair: readonly [string, string],
  from: string,
  to: string
): Counts {
  const owners = new Set([pair[0], pair[1]])
  const out = EMPTY_COUNTS()

  // 三餐：meals 是先查后写的软 upsert，同一天同一餐可能有多行，先按 (人|天|餐) 去重
  const seenMeal = new Set<string>()
  for (const m of input.meals ?? []) {
    if (!m.member_id || !owners.has(m.member_id)) continue
    if (!within(m.day, from, to)) continue
    const key = `${m.member_id}|${m.day}|${m.slot}`
    if (seenMeal.has(key)) continue
    seenMeal.add(key)
    out.meals += 1
  }

  for (const m of input.messages ?? []) {
    if (!owners.has(m.sender_id) || !owners.has(m.receiver_id) || m.sender_id === m.receiver_id) continue
    if (within(dayOf(m.created_at), from, to)) out.chat += 1
  }

  for (const g of input.games ?? []) {
    if (!owners.has(g.member_a) || !owners.has(g.member_b)) continue
    if (within(dayOf(g.finished_at), from, to)) out.play += 1
  }

  for (const h of input.hearts ?? []) {
    if (!owners.has(h.member_a) || !owners.has(h.member_b)) continue
    if (within(dayOf(h.created_at), from, to)) out.heart += 1
  }

  for (const o of input.orders ?? []) {
    if (!o.member_id || !owners.has(o.member_id)) continue
    if (o.status === 'cancelled') continue
    if (within(dayOf(o.created_at), from, to)) out.food += 1
  }

  for (const p of input.posts ?? []) {
    if (!p.member_id || !owners.has(p.member_id)) continue
    if (within(dayOf(p.created_at), from, to)) out.feed += 1
  }

  return out
}

/** 计数 → 温度 0~100 */
function tempOf(counts: Counts): number {
  let raw = 0
  for (const key of Object.keys(WARMTH_WEIGHTS) as WarmthKey[]) {
    const value = Math.min(1, counts[key] / WARMTH_CAPS[key])
    raw += (WARMTH_WEIGHTS[key] / 100) * value
  }
  return Math.round(100 * interp(CURVE, Math.max(0, Math.min(1, raw))))
}

function bandOf(temp: number): WarmthBand {
  if (temp >= 75) return 'hot'
  if (temp >= 50) return 'warm'
  if (temp >= 25) return 'mild'
  return 'cold'
}

/** 找最该补的那一项：权重 × 缺口最大者 */
function weakestPart(parts: WarmthPart[]): WarmthPart {
  let best = parts[0]
  let bestGap = -1
  for (const p of parts) {
    const gap = p.weight * (1 - p.value)
    if (gap > bestGap) {
      bestGap = gap
      best = p
    }
  }
  return best
}

/**
 * 计算关系温度。
 *
 * @param input 六路原始数据（缺表时给空数组即可）
 * @param today 今天（YYYY-MM-DD），显式注入便于单测
 * @param pair  当前情侣对
 */
export function computeWarmth(
  input: WarmthInput,
  today: string,
  pair: readonly [string, string]
): WarmthResult {
  const curFrom = shiftDay(today, -6)
  const prevFrom = shiftDay(today, -13)
  const prevTo = shiftDay(today, -7)

  const cur = countWindow(input, pair, curFrom, today)
  const prev = countWindow(input, pair, prevFrom, prevTo)

  const temp = tempOf(cur)
  const prevTemp = tempOf(prev)
  const delta = temp - prevTemp
  const trend: WarmthTrend = delta >= 4 ? 'up' : delta <= -4 ? 'down' : 'flat'
  const band = bandOf(temp)

  const parts: WarmthPart[] = (Object.keys(WARMTH_WEIGHTS) as WarmthKey[]).map((key) => ({
    key,
    label: WARMTH_LABELS[key],
    weight: WARMTH_WEIGHTS[key],
    count: cur[key],
    cap: WARMTH_CAPS[key],
    value: Math.min(1, cur[key] / WARMTH_CAPS[key]),
  }))

  // 温度够高就不催了，只夸；否则提示最该补的一项
  const advice =
    temp >= 80
      ? '最近很黏糊，保持住'
      : parts.every((p) => p.value === 0)
        ? '这周还没什么互动，从一顿饭开始吧'
        : ADVICE[weakestPart(parts).key]

  return { temp, prev: prevTemp, delta, trend, band, advice, parts }
}
