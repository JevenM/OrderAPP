import { todayStr, weekdayCn } from './date'

/**
 * 自绘日历的纯计算层：月份矩阵、月份位移、中文日期文案。
 * 全部用本地时间构造 Date，避免 UTC 偏移把日期挪到前一天。
 */
export type CalCell = { iso: string; day: number; inMonth: boolean }

const pad = (n: number) => `${n}`.padStart(2, '0')

export function isoOf(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`
}

export function parseDay(day: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day ?? '')
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const d = Number(m[3])
  if (month < 1 || month > 12 || d < 1 || d > 31) return null
  return { year, month, day: d }
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/** 月份位移：跨年时自动收进 1–12 */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + delta
  return { year: Math.floor(idx / 12), month: (((idx % 12) + 12) % 12) + 1 }
}

/**
 * 6×7 的月视图矩阵，周一为首列（与国内日历习惯一致）。
 * 前后补足相邻月份的日期，保证面板高度恒定，切月时不跳。
 */
export function monthMatrix(year: number, month: number): CalCell[] {
  const first = new Date(year, month - 1, 1)
  const offset = (first.getDay() + 6) % 7
  const cells: CalCell[] = []
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(year, month - 1, 1 - offset + i)
    cells.push({
      iso: isoOf(d.getFullYear(), d.getMonth() + 1, d.getDate()),
      day: d.getDate(),
      inMonth: d.getMonth() === month - 1,
    })
  }
  return cells
}

export function monthLabel(year: number, month: number): string {
  return `${year}年${month}月`
}

/** 周三 / 周一… */
export function weekdayShort(day: string): string {
  return weekdayCn(day)
}

/** 11月25日 周三；跨年补上年份 */
export function formatCnDate(day: string, refToday: string = todayStr()): string {
  const p = parseDay(day)
  if (!p) return day
  const sameYear = p.year === Number(refToday.slice(0, 4))
  return `${sameYear ? '' : `${p.year}年`}${p.month}月${p.day}日 ${weekdayShort(day)}`
}

/** 是否落在可选区间内（min / max 都是闭区间，空值表示不限制） */
export function inRange(day: string, min?: string, max?: string): boolean {
  if (min && day < min) return false
  if (max && day > max) return false
  return true
}

/** 日历表头：周一 → 周日 */
export const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日']
