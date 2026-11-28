import { daysInMonth, isoOf, parseDay } from './calendar'

/** 三行数字轮：中间一行高亮，上下各露一项；行高与 index.css 的 .wheel-item 保持一致 */
export const WHEEL_ITEM_HEIGHT = 44

export type WheelParts = { year: number; month: number; day: number }

/** 年份候选：以锚点年为中心前后各 10 年，再被 min/max 收窄 */
export function wheelYears(anchorYear: number, min?: string, max?: string): number[] {
  const minYear = min ? parseDay(min)?.year ?? anchorYear - 10 : anchorYear - 10
  const maxYear = max ? parseDay(max)?.year ?? anchorYear + 10 : anchorYear + 10
  const from = Math.max(anchorYear - 10, minYear)
  const to = Math.min(anchorYear + 10, maxYear)
  const years: number[] = []
  for (let y = from; y <= to; y += 1) years.push(y)
  return years
}

/** 月份候选：跨年不限制，落在边界年时按 min/max 收窄 */
export function wheelMonths(year: number, min?: string, max?: string): number[] {
  const minMonth = min && parseDay(min)?.year === year ? parseDay(min)!.month : 1
  const maxMonth = max && parseDay(max)?.year === year ? parseDay(max)!.month : 12
  const months: number[] = []
  for (let m = Math.max(1, minMonth); m <= Math.min(12, maxMonth); m += 1) months.push(m)
  return months
}

/** 日期候选：跟随年/月天数，边界月按 min/max 收窄 */
export function wheelDays(year: number, month: number, min?: string, max?: string): number[] {
  const total = daysInMonth(year, month)
  const minDay = min && parseDay(min)?.year === year && parseDay(min)?.month === month ? parseDay(min)!.day : 1
  const maxDay = max && parseDay(max)?.year === year && parseDay(max)?.month === month ? parseDay(max)!.day : total
  const days: number[] = []
  for (let d = Math.max(1, minDay); d <= Math.min(total, maxDay); d += 1) days.push(d)
  return days
}

/** 滚动或改年月后收敛到合法日期：2 月没有 30 号、4 月没有 31 号、且不越界 */
export function clampWheelDate(parts: WheelParts, min?: string, max?: string): WheelParts {
  let { year, month, day } = parts
  month = Math.min(12, Math.max(1, month))
  day = Math.min(daysInMonth(year, month), Math.max(1, day))
  let iso = isoOf(year, month, day)
  if (min && iso < min) {
    const p = parseDay(min)
    if (p) ({ year, month, day } = p)
  }
  iso = isoOf(year, month, day)
  if (max && iso > max) {
    const p = parseDay(max)
    if (p) ({ year, month, day } = p)
  }
  return { year, month, day }
}

/** 值在候选数组里的下标；找不到就退回锚点下标（今日 / 已选日期） */
export function wheelIndex(value: number, options: number[], fallback: number): number {
  const i = options.indexOf(value)
  return i >= 0 ? i : Math.min(Math.max(0, fallback), Math.max(0, options.length - 1))
}

/** 让第 index 项落在三行滚轮正中：上方垫了 2 项 */
export function wheelScrollTop(index: number): number {
  return (index + 1) * WHEEL_ITEM_HEIGHT
}

/** 反向把 scrollTop 还原成选中下标，超出候选范围时收敛 */
export function wheelIndexFromScroll(scrollTop: number, length: number): number {
  if (length <= 0) return 0
  const index = Math.round(scrollTop / WHEEL_ITEM_HEIGHT) - 1
  return Math.min(Math.max(0, index), length - 1)
}
