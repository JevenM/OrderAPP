import { useCallback, useEffect, useMemo, useState } from 'react'
import { createOrder, listDishes, listOrders } from '../lib/db'
import { pushEmail } from '../lib/notify'
import { supabase } from '../lib/supabase'
import { timeCn } from '../lib/date'
import { useToast } from '../components/Toast'
import { useSession } from '../store/session'
import { ORDER_STATUS, SLOTS, type Dish, type MealSlot, type OrderWithItems } from '../lib/types'

type CartItem = { dish_id: string | null; dish_name: string; emoji: string; qty: number }

/** 购物车里「自定义菜」的 key 前缀（菜单菜直接用 dish.id） */
const CUSTOM_PREFIX = 'custom:'
const CUSTOM_EMOJI = '✨'

export default function OrderPage() {
  const toast = useToast()
  const { memberId, memberName } = useSession()
  const [dishes, setDishes] = useState<Dish[]>([])
  const [cart, setCart] = useState<Record<string, number>>({})
  const [slot, setSlot] = useState<MealSlot>('dinner')
  const [hopeTime, setHopeTime] = useState('')
  const [note, setNote] = useState('')
  const [keyword, setKeyword] = useState('')
  const [customName, setCustomName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [recent, setRecent] = useState<OrderWithItems[]>([])

  const load = useCallback(async () => {
    try {
      setDishes(await listDishes())
    } catch (e) {
      toast.show((e as Error).message, 'err')
    }
  }, [toast])

  const loadRecent = useCallback(async () => {
    try {
      setRecent((await listOrders(5, memberId)).filter((o) => o.items.length > 0 || o.note))
    } catch {
      // ignore
    }
  }, [memberId])

  useEffect(() => {
    void load()
    void loadRecent()
    const channel = supabase
      .channel('her-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, loadRecent)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dishes' }, load)
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [load, loadRecent])

  const grouped = useMemo(() => {
    const kw = keyword.trim()
    const list = dishes.filter(
      (d) => d.available && (!kw || d.name.includes(kw) || d.category.includes(kw) || d.description.includes(kw))
    )
    const map = new Map<string, Dish[]>()
    for (const d of list) {
      const arr = map.get(d.category) ?? []
      arr.push(d)
      map.set(d.category, arr)
    }
    return [...map.entries()]
  }, [dishes, keyword])

  const totalQty = Object.values(cart).reduce((a, b) => a + b, 0)
  const picked = Object.entries(cart).filter(([, q]) => q > 0)
  const customPicked = picked.filter(([key]) => key.startsWith(CUSTOM_PREFIX))

  const changeKey = (key: string, delta: number) => {
    setCart((c) => {
      const next = { ...c }
      const v = (next[key] ?? 0) + delta
      if (v <= 0) delete next[key]
      else next[key] = v
      return next
    })
  }

  const change = (d: Dish, delta: number) => changeKey(d.id, delta)

  const addCustom = () => {
    const name = customName.trim().replace(/\s+/g, ' ')
    if (!name) return toast.show('先写下想吃的菜名～', 'err')
    if (name.length > 30) return toast.show('菜名太长啦，简短一点', 'err')
    changeKey(CUSTOM_PREFIX + name, 1)
    setCustomName('')
  }

  const toItems = (): CartItem[] =>
    picked.map(([key, qty]) => {
      if (key.startsWith(CUSTOM_PREFIX)) {
        return { dish_id: null, dish_name: key.slice(CUSTOM_PREFIX.length), emoji: CUSTOM_EMOJI, qty }
      }
      const d = dishes.find((x) => x.id === key)
      // 菜品可能已被删除，兜底成自定义项，避免下单失败
      return d
        ? { dish_id: d.id, dish_name: d.name, emoji: d.emoji, qty }
        : { dish_id: null, dish_name: '（已下架的菜）', emoji: '🍽️', qty }
    })

  const submit = async () => {
    if (!picked.length) return toast.show('先选几道菜吧～', 'err')
    setSubmitting(true)
    try {
      const items = toItems()
      await createOrder({ items, meal_slot: slot, hope_time: hopeTime, note, member_id: memberId })
      const slotLabel = SLOTS.find((s) => s.key === slot)?.label ?? ''
      const who = memberName || '她'
      const lines = items.map((i) => `${i.emoji} ${i.dish_name} ×${i.qty}`).join('<br/>')
      await pushEmail(
        `🔔 ${who}点了${slotLabel}：${items.map((i) => i.dish_name).join('、')}`,
        `<div style="font-family:sans-serif;line-height:1.7">
           <h3>${who}点了${slotLabel}</h3>
           <p>${lines}</p>
           <p>期望时间：${hopeTime || '随缘'}</p>
           <p>备注：${note || '无'}</p>
         </div>`
      )
      setCart({})
      setNote('')
      setHopeTime('')
      toast.show('下单成功，已经通知他啦 ❤️')
      void loadRecent()
    } catch (e) {
      toast.show((e as Error).message, 'err')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div>
          <div className="mb-1 text-xs text-slate-500">这一顿</div>
          <div className="flex gap-2">
            {SLOTS.map((s) => (
              <button
                key={s.key}
                onClick={() => setSlot(s.key)}
                className={`flex-1 rounded-xl border py-1.5 text-xs transition ${
                  slot === s.key ? 'border-brand-400 bg-brand-50 text-brand-600' : 'border-slate-200 text-slate-500'
                }`}
              >
                {s.emoji} {s.label}
              </button>
            ))}
          </div>
        </div>
        <input
          className="input"
          placeholder="期望开饭时间（可留空，比如 18:30）"
          value={hopeTime}
          onChange={(e) => setHopeTime(e.target.value)}
        />
        <input
          className="input"
          placeholder="想说点什么？（少辣 / 多加点汤…）"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <div className="card space-y-2">
        <div className="text-xs text-slate-500">想吃的菜（菜单里没有就直接写下来）</div>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="比如：妈妈牌红烧肉"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addCustom()
              }
            }}
          />
          <button className="btn-primary shrink-0 px-3 text-sm" onClick={addCustom}>
            加入
          </button>
        </div>
        {customPicked.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {customPicked.map(([key, qty]) => (
              <div
                key={key}
                className="flex items-center gap-1.5 rounded-full border border-brand-300 bg-brand-50 py-1 pl-3 pr-1.5 text-xs"
              >
                <span className="max-w-[10rem] truncate">
                  {CUSTOM_EMOJI} {key.slice(CUSTOM_PREFIX.length)}
                </span>
                <span className="font-semibold text-brand-600">×{qty}</span>
                <button
                  className="btn-soft px-1.5 py-0.5 text-xs leading-none"
                  onClick={() => changeKey(key, -1)}
                  title="减少"
                >
                  −
                </button>
                <button
                  className="btn-primary px-1.5 py-0.5 text-xs leading-none"
                  onClick={() => changeKey(key, 1)}
                  title="增加"
                >
                  +
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <input className="input" placeholder="🔍 搜索菜名" value={keyword} onChange={(e) => setKeyword(e.target.value)} />

      {grouped.length === 0 && (
        <p className="py-8 text-center text-sm text-slate-400">
          还没有可点的菜，让他去「菜单」里加几道～<br />
          也可以直接在上面写下想吃的菜
        </p>
      )}

      {grouped.map(([category, list]) => (
        <div key={category}>
          <h2 className="mb-2 px-1 text-xs font-medium text-slate-400">{category}</h2>
          <div className="grid grid-cols-2 gap-2">
            {list.map((d) => {
              const qty = cart[d.id] ?? 0
              return (
                <div
                  key={d.id}
                  className={`card flex flex-col gap-1 p-3 transition ${qty ? 'ring-2 ring-brand-300' : ''}`}
                  onClick={() => change(d, 1)}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-2xl">{d.emoji}</span>
                    {qty > 0 && (
                      <span className="rounded-full bg-brand-500 px-2 text-xs font-semibold text-white">×{qty}</span>
                    )}
                  </div>
                  <div className="flex items-baseline justify-between gap-1">
                    <span className="text-sm font-medium">{d.name}</span>
                    {d.price > 0 && <span className="shrink-0 text-[11px] text-brand-500">¥{d.price}</span>}
                  </div>
                  {d.description && <div className="line-clamp-2 text-[11px] text-slate-400">{d.description}</div>}
                  <div className="mt-1 flex items-center justify-between">
                    <button
                      className="btn-soft px-2 py-1 text-xs"
                      onClick={(e) => {
                        e.stopPropagation()
                        change(d, -1)
                      }}
                    >
                      −
                    </button>
                    <button
                      className="btn-primary px-2 py-1 text-xs"
                      onClick={(e) => {
                        e.stopPropagation()
                        change(d, 1)
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {recent.length > 0 && (
        <div className="card space-y-2">
          <h2 className="text-xs font-medium text-slate-400">最近下的单</h2>
          {recent.map((o) => (
            <div key={o.id} className="flex items-start justify-between gap-2 border-t border-slate-100 pt-2 text-xs">
              <div className="min-w-0">
                <div className="truncate text-slate-700">
                  {o.items.map((i) => `${i.emoji}${i.dish_name}×${i.qty}`).join('，') || o.note}
                </div>
                <div className="mt-0.5 text-slate-400">{timeCn(o.created_at)}</div>
              </div>
              <span className={`chip ${ORDER_STATUS[o.status].cls}`}>{ORDER_STATUS[o.status].label}</span>
            </div>
          ))}
        </div>
      )}

      {totalQty > 0 && (
        <div className="sticky bottom-2 z-10 flex items-center justify-between gap-3 rounded-2xl bg-white/95 p-3 shadow-card backdrop-blur">
          <div className="text-xs text-slate-500">
            已选 <span className="text-base font-semibold text-brand-600">{totalQty}</span> 份
          </div>
          <button className="btn-primary" disabled={submitting} onClick={submit}>
            {submitting ? '提交中…' : '提交订单'}
          </button>
        </div>
      )}
    </div>
  )
}
