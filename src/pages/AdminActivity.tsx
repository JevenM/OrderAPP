import { useEffect, useMemo, useState } from 'react'
import { analyzePreference, fetchActivityRows, type ActivityRow } from '../lib/activity'
import { EmptyState } from '../components/States'
import { useToast } from '../components/Toast'

/*
 * 管理员端行为统计：数据源是 user_activity_logs（迁移 0048，按天/按人聚合）。
 * 展示登录次数、在线时长、模块使用频率，并给出类别偏好推断。
 */

const RANGES = [7, 30, 90] as const

function durationText(sec: number): string {
  if (sec < 60) return `${sec} 秒`
  if (sec < 3600) return `${Math.round(sec / 60)} 分钟`
  return `${(sec / 3600).toFixed(1)} 小时`
}

type UserStat = {
  id: string
  name: string
  logins: number
  days: number
  duration: number
  hits: Record<string, number>
}

export default function AdminActivity() {
  const toast = useToast()
  const [days, setDays] = useState<number>(30)
  const [rows, setRows] = useState<ActivityRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchActivityRows(days)
      .then((list) => {
        if (alive) setRows(list)
      })
      .catch((e) => {
        if (alive) toast.show(`加载行为统计失败：${(e as Error).message}`, 'err')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [days, toast])

  /** 按人汇总（每天一行 → 每人一行） */
  const users = useMemo(() => {
    const map = new Map<string, UserStat>()
    for (const r of rows) {
      const u =
        map.get(r.actor_id) ?? { id: r.actor_id, name: r.actor_name, logins: 0, days: 0, duration: 0, hits: {} }
      u.name = r.actor_name || u.name
      u.logins += r.login_count
      u.duration += r.duration_sec
      u.days += 1
      for (const [key, n] of Object.entries(r.module_hits ?? {})) u.hits[key] = (u.hits[key] ?? 0) + n
      map.set(r.actor_id, u)
    }
    return [...map.values()].sort((a, b) => b.logins - a.logins || b.duration - a.duration)
  }, [rows])

  /** 按天汇总（最近 14 天，画柱状趋势） */
  const daily = useMemo(() => {
    const map = new Map<string, { logins: number; duration: number }>()
    for (const r of rows) {
      const d = map.get(r.day) ?? { logins: 0, duration: 0 }
      d.logins += r.login_count
      d.duration += r.duration_sec
      map.set(r.day, d)
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14).reverse()
  }, [rows])

  const totalLogins = users.reduce((n, u) => n + u.logins, 0)
  const totalDuration = users.reduce((n, u) => n + u.duration, 0)
  const peakLogins = daily.reduce((n, [, d]) => Math.max(n, d.logins), 0)

  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">📊 用户行为统计</h2>
            <p className="mt-0.5 text-xs text-slate-400">登录次数、在线时长、模块使用频率与偏好（按天聚合）</p>
          </div>
          <div className="seg w-auto">
            {RANGES.map((n) => (
              <button
                key={n}
                type="button"
                className={`seg-btn px-3 ${days === n ? 'bg-white font-semibold text-brand-600 shadow-sm' : 'text-slate-400'}`}
                onClick={() => setDays(n)}
              >
                近 {n} 天
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: '总登录次数', value: String(totalLogins), emoji: '🔑' },
            { label: '活跃人数', value: String(users.length), emoji: '👥' },
            { label: '总在线时长', value: durationText(totalDuration), emoji: '⏱' },
            { label: '单日最高登录', value: String(peakLogins), emoji: '📈' },
          ].map((s) => (
            <div key={s.label} className="rounded-xl bg-slate-50 p-3 text-center">
              <div className="text-lg leading-none">{s.emoji}</div>
              <div className="mt-1.5 text-sm font-bold text-slate-700">{s.value}</div>
              <div className="mt-0.5 text-2xs text-slate-400">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {loading ? (
        <div className="card py-8 text-center text-xs text-slate-400">加载中…</div>
      ) : rows.length === 0 ? (
        <EmptyState icon="📭" title="这段时间还没有行为数据" hint="请确认已执行 supabase/migrations/0048_user_activity.sql，且有人正常登录后产生上报" />
      ) : (
        <>
          <section className="card space-y-2">
            <h3 className="text-sm font-semibold text-slate-500">每日登录趋势</h3>
            {daily.map(([day, d]) => (
              <div key={day} className="flex items-center gap-2 text-2xs">
                <span className="w-16 shrink-0 tabular-nums text-slate-400">{day.slice(5)}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-brand-400 transition-all duration-300"
                    style={{ width: `${peakLogins > 0 ? Math.max(4, (d.logins / peakLogins) * 100) : 0}%` }}
                  />
                </div>
                <span className="w-24 shrink-0 text-right tabular-nums text-slate-500">
                  {d.logins} 次 · {durationText(d.duration)}
                </span>
              </div>
            ))}
          </section>

          <section className="card space-y-3">
            <h3 className="text-sm font-semibold text-slate-500">成员偏好分析</h3>
            {users.map((u) => {
              const pref = analyzePreference(u.hits)
              return (
                <div key={u.id} className="space-y-2 rounded-xl border border-brand-100 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-700">{u.name || '未命名成员'}</span>
                    <span className="chip border-brand-200 bg-brand-50 text-2xs text-brand-600">
                      偏好：{pref.favorite}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-2xs text-slate-500">
                    <span>登录 <b className="tabular-nums text-slate-700">{u.logins}</b> 次</span>
                    <span>活跃 <b className="tabular-nums text-slate-700">{u.days}</b> 天</span>
                    <span>在线 <b className="tabular-nums text-slate-700">{durationText(u.duration)}</b></span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {pref.top.length > 0 ? (
                      pref.top.map((t) => (
                        <span key={t.label} className="rounded-full bg-slate-100 px-2 py-0.5 text-2xs text-slate-600">
                          {t.label} ×{t.count}
                        </span>
                      ))
                    ) : (
                      <span className="text-2xs text-slate-400">暂无模块使用记录</span>
                    )}
                  </div>
                </div>
              )
            })}
          </section>
        </>
      )}
    </div>
  )
}
