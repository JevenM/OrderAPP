import { shiftDay } from './date'

/**
 * 共建目标（纯计算层）。
 *
 * 一个目标一行存在 couple_goals：打卡/加钱都是针对单个目标的写操作，
 * 逐行更新冲突面最小。习惯型不建第二张表，打卡日期直接存在 checkins 里。
 */

export type GoalKind = 'save' | 'travel' | 'habit' | 'custom'

export type GoalStatus = 'active' | 'done' | 'archived'

export const KIND_LABEL: Record<GoalKind, string> = {
  save: '存钱',
  travel: '旅行',
  habit: '习惯',
  custom: '自定义',
}

export interface GoalTemplate {
  kind: GoalKind
  emoji: string
  title: string
  desc: string
  /** 单位默认值 */
  unit: string
  /** 目标值默认值，null 表示这类目标不需要目标值 */
  defaultTarget: number | null
}

export const GOAL_TEMPLATES: GoalTemplate[] = [
  { kind: 'save', emoji: '💰', title: '存钱', desc: '一起攒一笔钱', unit: '元', defaultTarget: 10000 },
  { kind: 'travel', emoji: '✈️', title: '旅行', desc: '去一个想去的地方', unit: '元', defaultTarget: 5000 },
  { kind: 'habit', emoji: '🌱', title: '习惯', desc: '一起坚持一件事', unit: '次', defaultTarget: null },
  { kind: 'custom', emoji: '🎯', title: '自定义', desc: '别的想一起完成的事', unit: '', defaultTarget: null },
]

/** 目标行的最小结构，方便把 db 行直接传进来 */
export interface GoalLike {
  kind: GoalKind
  target: number | null
  current: number
  checkins: string[]
  deadline: string | null
  /** 自定义单位；存钱/旅行没填时回落到「元」 */
  unit?: string
}

/** 只保留最近 400 天，避免 jsonb 无上限增长 */
const MAX_CHECKINS = 400
const DAY_MS = 86_400_000
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** 把库里读出来的 jsonb（可能是任何东西）归一化成升序去重的日期数组 */
export function normalizeCheckins(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const set = new Set<string>()
  for (const v of raw) {
    if (typeof v === 'string' && DAY_RE.test(v)) set.add(v)
  }
  return [...set].sort().slice(-MAX_CHECKINS)
}

/** 打卡/取消打卡：同一天再点就是取消 */
export function toggleCheckin(checkins: string[], day: string): string[] {
  const set = new Set(normalizeCheckins(checkins))
  if (set.has(day)) set.delete(day)
  else set.add(day)
  return [...set].sort().slice(-MAX_CHECKINS)
}

/**
 * 当前连续天数：今天打过卡就从今天往回数，否则从昨天往回数。
 * 这样「今天还没打卡」不会把连续天数清零，半夜看列表不会突然归零。
 */
export function currentStreak(checkins: string[], today: string): number {
  const set = new Set(normalizeCheckins(checkins))
  let cursor = set.has(today) ? today : shiftDay(today, -1)
  if (!set.has(cursor)) return 0
  let n = 0
  while (set.has(cursor)) {
    n += 1
    cursor = shiftDay(cursor, -1)
  }
  return n
}

/** 近 7 天（含今天）打卡次数 */
export function weeklyCheckins(checkins: string[], today: string): number {
  const set = new Set(normalizeCheckins(checkins))
  let n = 0
  for (let i = 0; i < 7; i += 1) if (set.has(shiftDay(today, -i))) n += 1
  return n
}

/** 进度比例 0~1。习惯按「近 7 天打卡数 / 7」算；没有目标值的只显示累计 */
export function goalRatio(goal: GoalLike, today: string): number {
  if (goal.kind === 'habit') return weeklyCheckins(goal.checkins, today) / 7
  const target = goal.target ?? 0
  if (target <= 0) return 0
  return Math.max(0, Math.min(1, goal.current / target))
}

export function goalPercent(goal: GoalLike, today: string): number {
  return Math.round(goalRatio(goal, today) * 100)
}

/** 千分位，避免 Intl 在不同环境下输出不一致 */
export function formatAmount(n: number): string {
  const rounded = Math.round(n * 100) / 100
  const [int, dec] = `${rounded}`.split('.')
  const withComma = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return dec ? `${withComma}.${dec}` : withComma
}

/** 距离截止日还有几天（负数是已过期，null 表示没设截止日） */
export function daysLeft(deadline: string | null, today: string): number | null {
  if (!deadline) return null
  const [y, m, d] = deadline.split('-').map(Number)
  const [ty, tm, td] = today.split('-').map(Number)
  if (!y || !m || !d || !ty || !tm || !td) return null
  return Math.round((new Date(y, m - 1, d).getTime() - new Date(ty, tm - 1, td).getTime()) / DAY_MS)
}

/** 卡片副标题：类型 · 截止日/连续天数 */
export function goalMetaLine(goal: GoalLike, today: string): string {
  const parts: string[] = [KIND_LABEL[goal.kind]]
  if (goal.kind === 'habit') {
    const streak = currentStreak(goal.checkins, today)
    if (streak > 0) parts.push(`连续 ${streak} 天`)
  } else if (goal.deadline) {
    const left = daysLeft(goal.deadline, today)
    if (left === null) parts.push(goal.deadline)
    else if (left < 0) parts.push('已过截止日')
    else if (left === 0) parts.push('今天截止')
    else parts.push(`剩 ${left} 天`)
  }
  return parts.join(' · ')
}

/** 数值行文案：3,200 / 8,000 元 */
export function goalValueText(goal: GoalLike, today: string): string {
  if (goal.kind === 'habit') return `近 7 天 ${weeklyCheckins(goal.checkins, today)} 次`
  const unit = goal.unit || (goal.kind === 'save' || goal.kind === 'travel' ? '元' : '')
  const suffix = unit ? ` ${unit}` : ''
  if (goal.target && goal.target > 0) {
    return `${formatAmount(goal.current)} / ${formatAmount(goal.target)}${suffix}`
  }
  return `${formatAmount(goal.current)}${suffix}`
}
