import { useCallback, useEffect, useMemo, useState } from 'react'
import { listMealsRange, markMealRead } from '../lib/db'
import { supabase } from '../lib/supabase'
import { lastDays, prettyDay, shiftDay, todayStr, weekdayCn } from '../lib/date'
import { useUnread } from '../store/unread'
import { useToast } from '../components/Toast'
import { MEAL_STATUS, SLOTS, type Meal, type MealSlot } from '../lib/types'

export default function AdminMeals() {
  const toast = useToast()
  const { refresh } = useUnread()
  const [day, setDay] = useState(todayStr())
  const [records, setRecords] = useState<Meal[]>([])
  const [week, setWeek] = useState<Meal[]>([])

  const load = useCallback(async () => {
    try {
      const [today, range] = await Promise.all([listMealsRange([day]), listMealsRange(lastDays(7))])
      setRecords(today)
      setWeek(range)
    } catch (e) {
      toast.show((e as Error).message, 'err')
    }
  }, [day, toast])

  useEffect(() => {
    void load()
    const channel = supabase
      .channel('admin-meals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meals' }, load)
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [load])

  // 打开当天即视为已读
  useEffect(() => {
    const ids = records.filter((m) => !m.read_at).map((m) => m.id)
    if (!ids.length) return
    const t = window.setTimeout(() => {
      ids.forEach((id) => void markMealRead(id))
      setRecords((prev) => prev.map((m) => (ids.includes(m.id) ? { ...m, read_at: new Date().toISOString() } : m)))
      refresh()
    }, 1500)
    return () => window.clearTimeout(t)
  }, [records, refresh])

  const bySlot = useMemo(() => {
    const map: Partial<Record<MealSlot, Meal>> = {}
    for (const m of records) map[m.slot] = m
    return map
  }, [records])

  const overview = useMemo(() => {
    return lastDays(7).map((d) => {
      const items = week.filter((m) => m.day === d)
      return {
        day: d,
        eaten: items.filter((m) => m.status === 'eaten').length,
        little: items.filter((m) => m.status === 'little').length,
        skipped: items.filter((m) => m.status === 'skipped').length,
        total: items.length,
      }
    })
  }, [week])

  return (
    <div className="space-y-4">
      <div className="card flex items-center justify-between gap-2">
        <button className="btn-ghost px-3" onClick={() => setDay(shiftDay(day, -1))}>
          ‹
        </button>
        <div className="text-center">
          <div className="text-sm font-medium">{prettyDay(day)}</div>
          <div className="text-[11px] text-slate-400">
            {day} {weekdayCn(day)}
          </div>
          <input
            type="date"
            className="mt-1 rounded-lg border border-slate-200 px-2 py-0.5 text-[11px] text-slate-500"
            value={day}
            max={todayStr()}
            onChange={(e) => setDay(e.target.value)}
          />
        </div>
        <button
          className="btn-ghost px-3"
          onClick={() => setDay((d) => (d >= todayStr() ? d : shiftDay(d, 1)))}
        >
          ›
        </button>
      </div>

      <div className="space-y-3">
        {SLOTS.map((s) => {
          const m = bySlot[s.key]
          const st = m ? MEAL_STATUS[m.status] : null
          return (
            <div key={s.key} className={`card space-y-2 ${m && !m.read_at ? 'ring-2 ring-brand-200' : ''}`}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  {s.emoji} {s.label}
                </h3>
                {st ? (
                  <span className={`chip ${st.cls}`}>
                    {st.emoji} {st.label}
                  </span>
                ) : (
                  <span className="chip border-slate-200 text-slate-400">未记录</span>
                )}
                {m && !m.read_at && <span className="chip border-rose-200 bg-rose-500 text-white">NEW</span>}
              </div>

              {m ? (
                <>
                  {m.content && <p className="whitespace-pre-wrap text-sm">{m.content}</p>}
                  {m.note && <p className="text-xs text-slate-400">备注：{m.note}</p>}
                  {m.photo_url && (
                    <img src={m.photo_url} alt="餐食" className="max-h-56 w-full rounded-xl object-cover" />
                  )}
                </>
              ) : (
                <p className="text-xs text-slate-400">她还没提交这一餐～</p>
              )}
            </div>
          )
        })}
      </div>

      <div className="card space-y-2">
        <h3 className="text-xs font-medium text-slate-400">最近 7 天</h3>
        <div className="flex justify-between gap-1">
          {overview.map((o) => (
            <button
              key={o.day}
              onClick={() => setDay(o.day)}
              className={`flex flex-1 flex-col items-center gap-1 rounded-lg py-1.5 text-[10px] ${
                o.day === day ? 'bg-brand-50 text-brand-600' : 'text-slate-400'
              }`}
            >
              <span>{o.day.slice(8)}</span>
              <span className="text-sm">
                {o.total === 0 ? '·' : `${'✅'.repeat(o.eaten)}${'🫤'.repeat(o.little)}${'❌'.repeat(o.skipped)}`}
              </span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-400">
          {records.filter((m) => m.status === 'skipped').length > 0
            ? '⚠️ 今天有一餐没吃，记得关心一下'
            : records.length === 0
              ? '今天还没有任何记录'
              : '✅ 今天三餐都有记录'}
        </p>
      </div>
    </div>
  )
}
