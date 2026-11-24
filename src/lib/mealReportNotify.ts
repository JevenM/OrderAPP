import { listMealsForPeriod, notifyMealReport } from './db'
import {
  analyzeMeals,
  isMealReportDue,
  lastClosedPeriod,
  mealReportPushKey,
  reportSummary,
  type ReportKind,
} from './mealReport'
import { browserNotify } from './notify'

/**
 * 周期结束后自动生成并推送三餐报告给自己。
 *
 * 触发时机：进互动页时检查一次（纯前端，无需后台定时任务）。
 * 去重两层：本机 localStorage 避免重复发请求；站内铃铛按「周期 + 情侣对」
 * 在服务端去重，换设备 / 双方同时打开也不会重复打扰。
 * 只补最近两周内刚结束的周期，长时间没打开不会一次性刷出一堆旧报告。
 */

const ALL_KINDS: ReportKind[] = ['month', 'half', 'year']

export async function pushDueMealReports(input: {
  memberId: string
  friendId: string
  myName: string
  now?: Date
  kinds?: ReportKind[]
}): Promise<number> {
  const { memberId, friendId, myName } = input
  if (!memberId || !friendId || memberId === friendId) return 0
  const now = input.now ?? new Date()
  const kinds = input.kinds ?? ALL_KINDS
  const pair = [memberId, friendId] as const

  const hasPushed = (storageKey: string): boolean => {
    try {
      return Boolean(localStorage.getItem(storageKey))
    } catch {
      return true // 隐私模式下读不到就当已推过，避免反复打扰
    }
  }
  const due = kinds.filter((kind) => isMealReportDue(memberId, friendId, kind, now, hasPushed))
  if (!due.length) return 0

  let pushed = 0
  for (const kind of due) {
    const period = lastClosedPeriod(kind, now)
    let meals
    try {
      meals = await listMealsForPeriod(period.start, period.end, pair)
    } catch {
      continue // 拉取失败不标记，下次进页面重试
    }
    const report = analyzeMeals(period, meals, pair)
    const storageKey = mealReportPushKey(memberId, friendId, kind, period.key)
    // 整期没有打卡就不打扰；仍标记为本期已处理，避免每次进页面重复拉取
    if (!report.total) {
      try { localStorage.setItem(storageKey, 'empty') } catch { /* 隐私模式下靠服务端去重兜底 */ }
      continue
    }
    const label = kind === 'month' ? '月报' : kind === 'half' ? '半年报' : '年报'
    const title = `🍚 三餐${label}已生成 · ${period.label}`
    const summary = reportSummary(report)
    try {
      // 服务端去重：post_id 带 kind + 周期 + 情侣对，三种周期互不冲突
      await notifyMealReport([memberId], myName || '点菜小屋', `${kind}:${period.key}`, title, summary)
      try {
        localStorage.setItem(storageKey, '1')
      } catch {
        // localStorage 不可用时靠服务端去重兜底
      }
      browserNotify(title, summary)
      pushed += 1
    } catch {
      // 铃铛写入失败：不标记本机，下次进页面重试
    }
  }
  return pushed
}
