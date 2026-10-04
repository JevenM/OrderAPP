import { useCallback, useEffect, useMemo, useState } from 'react'
import { listMealsRange, uploadMealPhoto, upsertMeal } from '../lib/db'
import { pushEmail } from '../lib/notify'
import { prettyDay, shiftDay, todayStr, weekdayCn } from '../lib/date'
import { useToast } from '../components/Toast'
import { useSession } from '../store/session'
import { MEAL_STATUS, SLOTS, type Meal, type MealSlot, type MealStatus } from '../lib/types'

type Form = { status: MealStatus; content: string; note: string; photo_url: string }

const emptyForm = (): Form => ({ status: 'eaten', content: '', note: '', photo_url: '' })

export default function MealLogPage() {
  const toast = useToast()
  const { memberId, memberName } = useSession()
  const [day, setDay] = useState(todayStr())
  const [records, setRecords] = useState<Meal[]>([])
  const [forms, setForms] = useState<Record<string, Form>>({})
  const [saving, setSaving] = useState<MealSlot | null>(null)
  const [uploading, setUploading] = useState<MealSlot | null>(null)

  const load = useCallback(async () => {
    try {
      const list = await listMealsRange([day], memberId)
      setRecords(list)
      setForms(() => {
        const next: Record<string, Form> = {}
        for (const r of list) {
          next[r.slot] = { status: r.status, content: r.content, note: r.note, photo_url: r.photo_url }
        }
        for (const s of SLOTS) if (!next[s.key]) next[s.key] = emptyForm()
        return next
      })
    } catch (e) {
      toast.show((e as Error).message, 'err')
    }
  }, [day, toast, memberId])

  useEffect(() => {
    void load()
  }, [load])

  const recorded = useMemo(() => records.filter((r) => r.slot !== 'snack').length, [records])

  const patch = (slot: MealSlot, p: Partial<Form>) =>
    setForms((f) => ({ ...f, [slot]: { ...(f[slot] ?? emptyForm()), ...p } }))

  const save = async (slot: MealSlot) => {
    const f = forms[slot] ?? emptyForm()
    if (!f.content.trim() && f.status === 'eaten') return toast.show('写点吃了什么吧～', 'err')
    setSaving(slot)
    try {
      await upsertMeal({ day, slot, ...f, member_id: memberId })
      const label = SLOTS.find((s) => s.key === slot)!.label
      const who = memberName || '她'
      await pushEmail(
        `🍚 ${who}记录了${label}：${f.content || MEAL_STATUS[f.status].label}`,
        `<div style="font-family:sans-serif;line-height:1.7">
           <h3>${day} ${label}</h3>
           <p>${MEAL_STATUS[f.status].emoji} ${MEAL_STATUS[f.status].label}</p>
           <p>${f.content || '（没写内容）'}</p>
           ${f.note ? `<p>备注：${f.note}</p>` : ''}
           ${f.photo_url ? `<p><img src="${f.photo_url}" width="240"/></p>` : ''}
         </div>`
      )
      toast.show('已提交，他能看到啦 ❤️')
      void load()
    } catch (e) {
      toast.show((e as Error).message, 'err')
    } finally {
      setSaving(null)
    }
  }

  const pickPhoto = async (slot: MealSlot, file: File) => {
    setUploading(slot)
    try {
      const url = await uploadMealPhoto(file)
      patch(slot, { photo_url: url })
      toast.show('图片已上传')
    } catch (e) {
      toast.show((e as Error).message, 'err')
    } finally {
      setUploading(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="card flex items-center justify-between gap-2">
        <button className="btn-ghost px-3" onClick={() => setDay(shiftDay(day, -1))}>
          ‹
        </button>
        <div className="text-center">
          <div className="text-sm font-medium">{prettyDay(day)}</div>
          <div className="text-[11px] text-slate-400">
            {day} {weekdayCn(day)} · 已记录 {recorded}/3
          </div>
          <input
            type="date"
            className="mt-1 rounded-lg border border-slate-200 px-2 py-0.5 text-[11px] text-slate-500"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        </div>
        <button className="btn-ghost px-3" onClick={() => setDay(shiftDay(day, 1))}>
          ›
        </button>
      </div>

      {SLOTS.map((s) => {
        const f = forms[s.key] ?? emptyForm()
        const saved = records.find((r) => r.slot === s.key)
        return (
          <div key={s.key} className="card space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                {s.emoji} {s.label}
              </h3>
              {saved && <span className="text-[11px] text-slate-400">已保存</span>}
            </div>

            <div className="flex gap-2">
              {(Object.keys(MEAL_STATUS) as MealStatus[]).map((k) => (
                <button
                  key={k}
                  onClick={() => patch(s.key, { status: k })}
                  className={`chip flex-1 justify-center ${
                    f.status === k ? MEAL_STATUS[k].cls + ' ring-1 ring-offset-1 ring-brand-200' : 'border-slate-200 text-slate-400'
                  }`}
                >
                  {MEAL_STATUS[k].emoji} {MEAL_STATUS[k].label}
                </button>
              ))}
            </div>

            <textarea
              className="input min-h-[64px]"
              placeholder={`${s.label}吃了什么？（比如：小米粥 + 鸡蛋 + 半个肉包）`}
              value={f.content}
              onChange={(e) => patch(s.key, { content: e.target.value })}
            />
            <input
              className="input"
              placeholder="备注（可留空：胃口一般 / 外面吃的）"
              value={f.note}
              onChange={(e) => patch(s.key, { note: e.target.value })}
            />

            <div className="flex items-center gap-2">
              {f.photo_url ? (
                <img src={f.photo_url} alt="餐食" className="h-16 w-16 rounded-lg object-cover" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-slate-50 text-xl">📷</div>
              )}
              <label className="btn-soft cursor-pointer text-xs">
                {uploading === s.key ? '上传中…' : f.photo_url ? '换张图' : '上传照片'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void pickPhoto(s.key, file)
                    e.target.value = ''
                  }}
                />
              </label>
              {f.photo_url && (
                <button className="text-xs text-slate-400" onClick={() => patch(s.key, { photo_url: '' })}>
                  移除
                </button>
              )}
            </div>

            <button className="btn-primary w-full" disabled={saving === s.key} onClick={() => save(s.key)}>
              {saving === s.key ? '提交中…' : `提交${s.label}记录`}
            </button>
          </div>
        )
      })}
    </div>
  )
}
