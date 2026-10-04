import { useCallback, useEffect, useMemo, useState } from 'react'
import { listMealsRange, markMealRead, removeMeal, updateMeal, uploadMealPhoto } from '../lib/db'
import { sizeText } from '../lib/image'
import { useRealtime } from '../lib/realtime'
import { lastDays, prettyDay, shiftDay, todayStr, weekdayCn } from '../lib/date'
import { useUnread } from '../store/unread'
import { useMembers } from '../store/members'
import { useSession } from '../store/session'
import { useToast } from '../components/Toast'
import { MEAL_STATUS, SLOTS, type Meal, type MealSlot, type MealStatus } from '../lib/types'

export default function AdminMeals() {
  const toast = useToast()
  const { refresh } = useUnread()
  const { members } = useMembers()
  const { memberId: viewMemberId } = useSession() // 顶部下拉切换到某个她时，只显示她的
  const [memberFilter, setMemberFilter] = useState(viewMemberId ?? '')
  const [day, setDay] = useState(todayStr())
  const [records, setRecords] = useState<Meal[]>([])
  const [week, setWeek] = useState<Meal[]>([])

  // 切换查看对象 → 成员筛选跟着变
  useEffect(() => {
    setMemberFilter(viewMemberId ?? '')
  }, [viewMemberId])

  const load = useCallback(async () => {
    try {
      const id = memberFilter || null
      const [today, range] = await Promise.all([listMealsRange([day], id), listMealsRange(lastDays(7), id)])
      setRecords(today)
      setWeek(range)
    } catch (e) {
      toast.show((e as Error).message, 'err')
    }
  }, [day, toast, memberFilter])

  useEffect(() => {
    void load()
  }, [load])

  useRealtime('admin-meals', [{ table: 'meals', on: () => void load() }], { onPoll: () => void load() })

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
    const map: Partial<Record<MealSlot, Meal[]>> = {}
    for (const m of records) {
      const arr = map[m.slot] ?? []
      arr.push(m)
      map[m.slot] = arr
    }
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

  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState<{ status: MealStatus; content: string; note: string; photo_url: string }>({
    status: 'eaten',
    content: '',
    note: '',
    photo_url: '',
  })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const startEdit = (m: Meal) => {
    setEditing(m.id)
    setForm({ status: m.status, content: m.content, note: m.note, photo_url: m.photo_url })
  }

  const saveEdit = async () => {
    if (!editing) return
    setSaving(true)
    try {
      await updateMeal(editing, {
        status: form.status,
        content: form.content,
        note: form.note,
        photo_url: form.photo_url,
      })
      toast.show('已修改她的记录')
      setEditing(null)
      await load()
      refresh()
    } catch (e) {
      toast.show((e as Error).message, 'err')
    } finally {
      setSaving(false)
    }
  }

  const del = async (m: Meal) => {
    const who = members.find((x) => x.id === m.member_id)?.name ?? '她'
    if (!window.confirm(`删除「${who}」的这条就餐记录？删除后不可恢复。`)) return
    try {
      await removeMeal(m.id)
      toast.show('已删除')
      await load()
      refresh()
    } catch (e) {
      toast.show((e as Error).message, 'err')
    }
  }

  const pickPhoto = async (file: File) => {
    setUploading(true)
    try {
      const photo = await uploadMealPhoto(file)
      setForm((f) => ({ ...f, photo_url: photo.url }))
      toast.show(`图片已上传（${sizeText(photo.originalSize)} → ${sizeText(photo.size)}）`)
    } catch (e) {
      toast.show((e as Error).message, 'err')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-4">
      <select
        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-600"
        value={memberFilter}
        onChange={(e) => setMemberFilter(e.target.value)}
      >
        <option value="">全部成员</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>

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
          const list = bySlot[s.key] ?? []
          return (
            <div
              key={s.key}
              className={`card space-y-2 ${list.some((m) => !m.read_at) ? 'ring-2 ring-brand-200' : ''}`}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  {s.emoji} {s.label}
                </h3>
                {list.length === 0 && <span className="chip border-slate-200 text-slate-400">未记录</span>}
              </div>

              {list.length === 0 && <p className="text-xs text-slate-400">还没有人提交这一餐～</p>}

              {list.map((m) => {
                const st = MEAL_STATUS[m.status]
                const who = members.find((x) => x.id === m.member_id)?.name ?? '未归属'
                const isEdit = editing === m.id
                return (
                  <div key={m.id} className="space-y-2 border-t border-slate-100 pt-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-brand-50 px-1.5 py-0.5 text-xs text-brand-600">{who}</span>
                      {!isEdit && (
                        <span className={`chip ${st.cls}`}>
                          {st.emoji} {st.label}
                        </span>
                      )}
                      {!isEdit && !m.read_at && (
                        <span className="chip border-rose-200 bg-rose-500 text-white">NEW</span>
                      )}
                    </div>

                    {isEdit ? (
                      <>
                        <div className="flex gap-2">
                          {(Object.keys(MEAL_STATUS) as MealStatus[]).map((k) => (
                            <button
                              key={k}
                              onClick={() => setForm((f) => ({ ...f, status: k }))}
                              className={`chip flex-1 justify-center ${
                                form.status === k
                                  ? MEAL_STATUS[k].cls + ' ring-1 ring-offset-1 ring-brand-200'
                                  : 'border-slate-200 text-slate-400'
                              }`}
                            >
                              {MEAL_STATUS[k].emoji} {MEAL_STATUS[k].label}
                            </button>
                          ))}
                        </div>
                        <textarea
                          className="input min-h-[64px]"
                          placeholder="吃了什么？"
                          value={form.content}
                          onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                        />
                        <input
                          className="input"
                          placeholder="备注（可留空）"
                          value={form.note}
                          onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                        />
                        <div className="flex items-center gap-2">
                          {form.photo_url ? (
                            <img src={form.photo_url} alt="餐食" className="h-16 w-16 rounded-lg object-cover" />
                          ) : (
                            <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-slate-50 text-xl">
                              📷
                            </div>
                          )}
                          <label className="btn-soft cursor-pointer text-xs">
                            {uploading ? '上传中…' : form.photo_url ? '换张图' : '上传照片'}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (file) void pickPhoto(file)
                                e.target.value = ''
                              }}
                            />
                          </label>
                          {form.photo_url && (
                            <button
                              className="text-xs text-slate-400"
                              onClick={() => setForm((f) => ({ ...f, photo_url: '' }))}
                            >
                              移除
                            </button>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button className="btn-primary flex-1 text-xs" disabled={saving} onClick={saveEdit}>
                            {saving ? '保存中…' : '保存修改'}
                          </button>
                          <button className="btn-ghost flex-1 text-xs" onClick={() => setEditing(null)}>
                            取消
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        {m.content && <p className="whitespace-pre-wrap text-sm">{m.content}</p>}
                        {m.note && <p className="text-xs text-slate-400">备注：{m.note}</p>}
                        {m.photo_url && (
                          <img src={m.photo_url} alt="餐食" className="max-h-56 w-full rounded-xl object-cover" />
                        )}
                        <div className="flex gap-3 pt-1">
                          <button className="text-xs text-brand-600" onClick={() => startEdit(m)}>
                            修改
                          </button>
                          <button className="text-xs text-slate-400" onClick={() => del(m)}>
                            删除
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
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
