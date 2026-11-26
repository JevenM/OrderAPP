import { supabase } from './supabase'
import { todayStr, toDayStr } from './date'
import { MODULE_DEFS } from './modules'

/**
 * 用户行为统计（配合迁移 0048）：
 * - 每天每使用者一行：登录次数、可见在线时长、模块/页面打开次数
 * - 上报走数据库 RPC 原子累加，失败完全静默——统计绝不能影响正常使用
 * - 「登录」= 有效登录态进入应用一次（刷新页面/重新打开也算一次）
 * - 时长按可见状态每分钟心跳累加，切后台不计时
 */

export interface ActivityRow {
  actor_id: string
  actor_name: string
  day: string
  login_count: number
  duration_sec: number
  module_hits: Record<string, number>
  updated_at: string
}

let actor: { id: string; name: string } | null = null
let warned = false

/** 由 ActivityTracker 在登录态就绪后设置当前上报身份 */
export function setActivityActor(id: string, name: string): void {
  actor = { id, name }
}

export function reportActivity(opts: { login?: boolean; durationSec?: number; module?: string } = {}): void {
  if (!actor) return
  if (!opts.login && !opts.durationSec && !opts.module) return
  void (async () => {
    try {
      const { error } = await supabase.rpc('report_user_activity', {
        p_actor_id: actor!.id,
        p_actor_name: actor!.name,
        p_day: todayStr(),
        p_login: Boolean(opts.login),
        p_duration_sec: Math.max(0, Math.round(opts.durationSec ?? 0)),
        p_module: opts.module ?? null,
      })
      if (error && !warned) {
        warned = true
        console.warn('[行为统计] 上报失败，请确认已执行迁移 0048_user_activity.sql：', error.message)
      }
    } catch {
      // 断网时静默丢弃这一分钟，下一分钟继续
    }
  })()
}

/** 互动模块打开时打点（CouplePage 的 activeModule effect 调用） */
export function trackModule(key: string): void {
  reportActivity({ module: key })
}

/** 管理端拉取最近 N 天明细 */
export async function fetchActivityRows(days = 30): Promise<ActivityRow[]> {
  const since = new Date()
  since.setDate(since.getDate() - (days - 1))
  const { data, error } = await supabase
    .from('user_activity_logs')
    .select('*')
    .gte('day', toDayStr(since))
    .order('day', { ascending: false })
  if (error) throw error
  return ((data ?? []) as ActivityRow[]).map((r) => ({
    ...r,
    module_hits: r.module_hits && typeof r.module_hits === 'object' ? r.module_hits : {},
  }))
}

/** 模块 key → 展示名：互动模块取定义表，路由打点取路径末段 */
function labelOf(key: string): string {
  if (key.startsWith('path:')) {
    const path = key.slice(5).split('?')[0]
    if (!path || path === '/') return '首页'
    const names: Record<string, string> = {
      '/dining': '干饭',
      '/couple': '互动空间',
      '/admin': '管理后台',
      '/admin/orders': '订单管理',
      '/admin/meals': '饮食管理',
      '/admin/dishes': '菜单管理',
      '/admin/members': '成员管理',
      '/admin/activity': '行为统计',
    }
    return names[path] ?? path.split('/').filter(Boolean).pop() ?? path
  }
  return MODULE_DEFS.find((m) => m.key === key)?.title ?? key
}

/** 偏好分析：次数最多的 3 个入口 + 类别倾向（游戏 / 情侣日常 / 干饭 / 管理） */
export function analyzePreference(hits: Record<string, number>) {
  const entries = Object.entries(hits)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
  const top = entries.slice(0, 3).map(([key, count]) => ({ label: labelOf(key), count }))

  const categories: Record<string, number> = {}
  for (const [key, count] of entries) {
    let cat = '其他'
    if (key.startsWith('path:')) {
      const path = key.slice(5)
      if (path.startsWith('/admin')) cat = '后台管理'
      else if (path.startsWith('/dining')) cat = '干饭日常'
      else if (path.startsWith('/couple')) cat = '情侣互动'
    } else {
      const group = MODULE_DEFS.find((m) => m.key === key)?.group
      cat = group === 'game' ? '互动游戏' : group === 'couple' ? '情侣日常' : group === 'app' ? '应用入口' : '其他'
    }
    categories[cat] = (categories[cat] ?? 0) + count
  }
  const favorite = Object.entries(categories).sort((a, b) => b[1] - a[1])[0]
  return { top, favorite: favorite ? `${favorite[0]} · ${favorite[1]} 次` : '暂无数据' }
}
