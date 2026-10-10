import { useCallback, useEffect, useMemo, useState } from 'react'
import { createDishRequest, createOrder, listDishes, listOrders } from '../lib/db'
import { pushEmail } from '../lib/notify'
import { timeCn } from '../lib/date'
import { useRealtime } from '../lib/realtime'
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
  const [wheelOpen, setWheelOpen] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const [selectedDish, setSelectedDish] = useState<Dish | null>(null)
  const [wheelRotation, setWheelRotation] = useState(0)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())

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
  }, [load, loadRecent])

  useRealtime(
    'her-orders',
    [
      { table: 'orders', on: () => void loadRecent() },
      { table: 'dishes', on: () => void load() },
    ],
    {
      onPoll: () => {
        void load()
        void loadRecent()
      },
    }
  )

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

  const spinWheel = () => {
    const menu = dishes.filter((dish) => dish.available)
    if (!menu.length || spinning) return toast.show('当前菜单没有可抽选的菜品', 'err')
    const pickedDish = menu[Math.floor(Math.random() * menu.length)]
    const displayMenu = menu.slice(0, 6)
    const segment = displayMenu.length > 0 ? 360 / displayMenu.length : 360
    const turns = 5 + Math.floor(Math.random() * 3)
    const stopAt = displayMenu.findIndex((dish) => dish.id === pickedDish.id)
    const target = turns * 360 + (stopAt < 0 ? Math.random() * 360 : 360 - (stopAt * segment + segment / 2))
    setSelectedDish(null)
    setSpinning(true)
    setWheelRotation((current) => current + target)
    window.setTimeout(() => {
      setSelectedDish(pickedDish)
      setSpinning(false)
    }, 1000)
  }

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
      // 菜单里没有的菜：同步提给他审核，通过后就会出现在菜单里
      const customNames = picked
        .filter(([key]) => key.startsWith(CUSTOM_PREFIX))
        .map(([key]) => key.slice(CUSTOM_PREFIX.length))
      let reviewed = 0
      try {
        for (const n of customNames) {
          if (await createDishRequest(n, memberId)) reviewed += 1
        }
      } catch {
        // 申请失败不影响这次下单
      }

      setCart({})
      setNote('')
      setHopeTime('')
      toast.show(reviewed > 0 ? '下单成功，新菜已发给他审核啦 ❤️' : '下单成功，已经通知他啦 ❤️')
      void loadRecent()
    } catch (e) {
      toast.show((e as Error).message, 'err')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4 pb-48">
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
        <p className="text-[11px] text-slate-400">
          菜单里没有的菜会先写进这顿订单，同时发给他审核；通过之后就能在下面的菜单里直接点啦～
        </p>
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

      <div className="flex gap-2">
        <input className="input min-w-0 flex-1" placeholder="🔍 搜索菜名" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        <button className="btn-soft shrink-0 px-3 text-sm" onClick={() => { setSelectedDish(null); setWheelOpen(true) }}>不知道吃什么</button>
      </div>

      {grouped.length === 0 && (
        <p className="py-8 text-center text-sm text-slate-400">
          还没有可点的菜，让他去「菜单」里加几道～<br />
          也可以直接在上面写下想吃的菜
        </p>
      )}

      {grouped.map(([category, list]) => {
        const expanded = expandedCategories.has(category)
        return (
        <div key={category}>
          <button
            type="button"
            className="mb-2 flex w-full items-center justify-between rounded-xl border border-brand-100 bg-white/80 px-3 py-2 text-left text-xs font-medium text-slate-600"
            onClick={() => setExpandedCategories((current) => {
              const next = new Set(current)
              if (next.has(category)) next.delete(category)
              else next.add(category)
              return next
            })}
            aria-expanded={expanded}
          >
            <span>{category}（{list.length}道）</span>
            <span className="text-brand-500">{expanded ? '收起 ▲' : '展开 ▼'}</span>
          </button>
          {expanded && <div className="grid grid-cols-2 gap-2">
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
          </div>}
        </div>
        )
      })}

      {wheelOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => !spinning && setWheelOpen(false)}>
          <section className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-800">今天吃点什么？</h2>
              <button className="text-slate-400" disabled={spinning} onClick={() => setWheelOpen(false)} title="关闭">✕</button>
            </div>
            <div className="relative mx-auto my-5 aspect-square w-full max-w-[17rem]">
              <div className="absolute -top-1 left-1/2 z-10 -translate-x-1/2 border-x-[10px] border-t-[18px] border-x-transparent border-t-rose-500" />
              <div
                className="absolute inset-0 overflow-hidden rounded-full border-4 border-white shadow-lg transition-transform duration-1000 ease-out"
                style={{ transform: `rotate(${wheelRotation}deg)`, background: 'conic-gradient(#fb7185 0deg 60deg, #fbbf24 60deg 120deg, #34d399 120deg 180deg, #60a5fa 180deg 240deg, #a78bfa 240deg 300deg, #fb923c 300deg 360deg)' }}
              >
                {dishes.filter((dish) => dish.available).slice(0, 6).map((dish, index) => (
                  <span key={dish.id} className="absolute left-1/2 top-1/2 w-[46%] origin-left -translate-y-1/2 truncate pl-7 text-center text-xs font-semibold text-white drop-shadow" style={{ transform: `rotate(${index * 60 + 30}deg)`, transformOrigin: '0 50%' }}>
                    {dish.emoji} {dish.name}
                  </span>
                ))}
              </div>
              <button className="absolute left-1/2 top-1/2 z-10 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-white bg-slate-800 text-sm font-bold text-white shadow-lg disabled:opacity-60" disabled={spinning} onClick={spinWheel}>
                {spinning ? '转动中' : '随机'}
              </button>
            </div>
            {selectedDish && (
              <div className="animate-pop-in text-center">
                <p className="text-xs text-slate-400">今天就吃</p>
                <p className="mt-1 text-lg font-semibold text-brand-600">{selectedDish.emoji} {selectedDish.name}</p>
                <button className="btn-primary mt-3 w-full" onClick={() => { change(selectedDish, 1); setWheelOpen(false) }}>加入购物车</button>
              </div>
            )}
          </section>
        </div>
      )}

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
        <aside className="fixed bottom-20 right-3 z-20 flex max-h-[55vh] w-56 max-w-[calc(100vw-1.5rem)] flex-col rounded-2xl border border-brand-100 bg-white/95 p-3 shadow-card backdrop-blur sm:right-[max(0.75rem,calc((100vw-28rem)/2))]">
          <div className="mb-2 flex items-center justify-between gap-2 border-b border-brand-100 pb-2">
            <div className="text-xs font-medium text-slate-600">
              已选 <span className="text-base font-semibold text-brand-600">{totalQty}</span> 份
            </div>
            <button className="btn-primary shrink-0 px-3 py-1.5 text-xs" disabled={submitting} onClick={submit}>
              {submitting ? '提交中…' : '提交订单'}
            </button>
          </div>
          <ul className="min-h-0 space-y-1 overflow-y-auto">
            {picked.map(([key, qty]) => {
              const dish = dishes.find((entry) => entry.id === key)
              const label = key.startsWith(CUSTOM_PREFIX) ? key.slice(CUSTOM_PREFIX.length) : dish?.name ?? '已下架的菜'
              const emoji = key.startsWith(CUSTOM_PREFIX) ? CUSTOM_EMOJI : dish?.emoji ?? '🍽️'
              return (
                <li key={key} className="flex items-center justify-between gap-2 rounded-lg bg-brand-50/70 px-2 py-1.5 text-xs text-slate-700">
                  <span className="min-w-0 break-words">{emoji} {label}</span>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm font-semibold text-brand-600 shadow-sm disabled:opacity-50"
                      aria-label={`减少${label}`}
                      onClick={() => changeKey(key, -1)}
                    >
                      −
                    </button>
                    <span className="min-w-5 text-center font-semibold text-brand-600">{qty}</span>
                    <button
                      type="button"
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm font-semibold text-brand-600 shadow-sm"
                      aria-label={`增加${label}`}
                      onClick={() => changeKey(key, 1)}
                    >
                      +
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </aside>
      )}
    </div>
  )
}
