import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { createDishRequest, createOrder, deleteOrder, listDishes, listOrders } from '../lib/db'
import { pushEmail } from '../lib/notify'
import { timeCn } from '../lib/date'
import { useRealtime } from '../lib/realtime'
import Pager from '../components/Pager'
import { useToast } from '../components/Toast'
import { useSession } from '../store/session'
import { ORDER_STATUS, SLOTS, SLOT_LABEL, type Dish, type MealSlot, type OrderWithItems } from '../lib/types'

type CartItem = { dish_id: string | null; dish_name: string; emoji: string; qty: number }

/** 购物车里「自定义菜」的 key 前缀（菜单菜直接用 dish.id） */
const CUSTOM_PREFIX = 'custom:'
const CUSTOM_EMOJI = '✨'
/** 转盘扇区配色：按展示池长度循环取色 */
const WHEEL_COLORS = ['#fb7185', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#fb923c']
/** 购物车每页显示的条目数：悬浮面板不高，超出就翻页（内部滚动条在苹果设备上划不动） */
const CART_PAGE_SIZE = 6

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
  /** 历史订单详情：点列表某一条打开，展示完整信息并可删除 */
  const [detailOrder, setDetailOrder] = useState<OrderWithItems | null>(null)
  const [deletingOrder, setDeletingOrder] = useState(false)
  const [wheelOpen, setWheelOpen] = useState(false)
  /** 转盘当前展示的菜品：每次开盘 / 每次随机都从全部在售菜品里重新抽样（必含中奖菜） */
  const [wheelPool, setWheelPool] = useState<Dish[]>([])
  const [spinning, setSpinning] = useState(false)
  const [selectedDish, setSelectedDish] = useState<Dish | null>(null)
  const [wheelRotation, setWheelRotation] = useState(0)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  /* 购物车分页 */
  const [cartPage, setCartPage] = useState(0)

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

  /** 删除历史订单：确认后删云端主表 + 明细，再刷新列表 */
  const removeRecentOrder = useCallback(async () => {
    if (!detailOrder || deletingOrder) return
    setDeletingOrder(true)
    try {
      await deleteOrder(detailOrder.id)
      toast.show('订单已删除')
      setDetailOrder(null)
      await loadRecent()
    } catch (e) {
      toast.show((e as Error).message, 'err')
    } finally {
      setDeletingOrder(false)
    }
  }, [detailOrder, deletingOrder, loadRecent, toast])

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
  /* 数量减到 0 时条目会消失，页码要收敛，否则会停在空白页 */
  const cartPages = Math.max(1, Math.ceil(picked.length / CART_PAGE_SIZE))
  const safeCartPage = Math.min(Math.max(cartPage, 0), cartPages - 1)

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

  /** 从全部在售菜品随机抽样最多 6 道做转盘展示；exceptId（中奖菜）保证在池内随机位置 */
  const sampleWheelPool = (exceptId?: string): Dish[] => {
    const menu = dishes.filter((dish) => dish.available)
    if (!menu.length) return []
    const shuffled = [...menu].sort(() => Math.random() - 0.5)
    const pool = shuffled.slice(0, Math.min(6, menu.length))
    if (exceptId && !pool.some((dish) => dish.id === exceptId)) {
      const winner = menu.find((dish) => dish.id === exceptId)
      if (winner) pool[Math.floor(Math.random() * pool.length)] = winner
    }
    return pool
  }

  const spinWheel = () => {
    const menu = dishes.filter((dish) => dish.available)
    if (!menu.length || spinning) return toast.show('当前菜单没有可抽选的菜品', 'err')
    const pickedDish = menu[Math.floor(Math.random() * menu.length)]
    const pool = sampleWheelPool(pickedDish.id)
    const segment = 360 / pool.length
    const stopAt = pool.findIndex((dish) => dish.id === pickedDish.id)
    const turns = 5 + Math.floor(Math.random() * 3)
    // 用绝对角度落点：累计式「当前角度+目标」在第二次旋转起会转过头，指针停错格子
    setWheelRotation((current) => {
      const base = Math.ceil(current / 360) * 360
      return base + turns * 360 + (360 - (stopAt * segment + segment / 2))
    })
    setSelectedDish(null)
    setSpinning(true)
    setWheelPool(pool)
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
        <button className="btn-soft shrink-0 px-3 text-sm" onClick={() => { setSelectedDish(null); setWheelPool(sampleWheelPool()); setWheelOpen(true) }}>不知道吃什么</button>
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
                style={{
                  transform: `rotate(${wheelRotation}deg)`,
                  // 扇区边界从 12 点钟方向顺时针排，与标签的「中心角-90°」换算保持同一坐标系
                  background: `conic-gradient(${wheelPool
                    .map(
                      (_, i) =>
                        `${WHEEL_COLORS[i % WHEEL_COLORS.length]} ${i * (360 / wheelPool.length)}deg ${(i + 1) * (360 / wheelPool.length)}deg`
                    )
                    .join(', ')})`,
                }}
              >
                {wheelPool.map((dish, index) => {
                  const seg = 360 / wheelPool.length
                  return (
                    <span
                      key={dish.id}
                      className="absolute left-1/2 top-1/2 w-[46%] truncate pl-7 text-center text-[10px] font-semibold text-white drop-shadow"
                      style={{
                        // conic-gradient 从 12 点钟起算，CSS rotate 从 3 点钟起算：中心角要减 90°
                        // translateY(-50%) 让文字沿半径方向垂直居中，落在扇面中央
                        transform: `rotate(${index * seg + seg / 2 - 90}deg) translateY(-50%)`,
                        transformOrigin: '0 50%',
                      }}
                    >
                      {dish.emoji} {dish.name}
                    </span>
                  )
                })}
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
          <h2 className="text-xs font-medium text-slate-400">最近下的单 · 点开看详情</h2>
          {recent.map((o) => (
            <button
              key={o.id}
              type="button"
              className="flex w-full items-start justify-between gap-2 border-t border-slate-100 pt-2 text-left text-xs active:bg-slate-50"
              onClick={() => setDetailOrder(o)}
            >
              <span className="min-w-0">
                <span className="block truncate text-slate-700">
                  {o.items.map((i) => `${i.emoji}${i.dish_name}×${i.qty}`).join('，') || o.note}
                </span>
                <span className="mt-0.5 block text-slate-400">{timeCn(o.created_at)}</span>
              </span>
              <span className={`chip shrink-0 ${ORDER_STATUS[o.status]?.cls ?? ''}`}>{ORDER_STATUS[o.status]?.label ?? o.status}</span>
            </button>
          ))}
        </div>
      )}

      {/* 订单详情：整条订单信息 + 删除。用 Portal 挂到 body，避免 .card 的 :active transform 让 fixed 定位退化 */}
      {detailOrder && createPortal(
        <div
          className="fixed inset-0 z-50 flex touch-none items-end justify-center overscroll-contain bg-slate-900/50 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => !deletingOrder && setDetailOrder(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-sm space-y-3 overflow-y-auto rounded-t-3xl bg-white p-5 pb-safe shadow-2xl sm:rounded-3xl"
            onClick={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-slate-700">订单详情</h4>
              <button type="button" className="btn-ghost px-2 py-1 text-xs" disabled={deletingOrder} onClick={() => setDetailOrder(null)}>关闭</button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex flex-wrap items-center gap-2 text-slate-400">
                <span>{timeCn(detailOrder.created_at)}</span>
                <span className="rounded bg-brand-50 px-1.5 py-0.5 text-brand-600">{SLOT_LABEL[detailOrder.meal_slot] ?? detailOrder.meal_slot}</span>
                <span className={`chip ${ORDER_STATUS[detailOrder.status]?.cls ?? ''}`}>{ORDER_STATUS[detailOrder.status]?.label ?? detailOrder.status}</span>
              </div>

              <div className="space-y-1 rounded-lg bg-slate-50 p-2">
                <div className="text-[11px] font-medium text-slate-400">点的菜</div>
                {detailOrder.items.length > 0 ? (
                  <ul className="space-y-1">
                    {detailOrder.items.map((i) => (
                      <li key={i.id} className="flex items-center justify-between text-sm text-slate-700">
                        <span className="min-w-0 break-words">{i.emoji} {i.dish_name}</span>
                        <span className="shrink-0 text-slate-400">×{i.qty}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-400">（没有选菜，只有留言）</p>
                )}
              </div>

              {detailOrder.hope_time && (
                <p className="text-slate-500">🕒 期望时间：{detailOrder.hope_time}</p>
              )}
              {detailOrder.note && (
                <p className="whitespace-pre-wrap break-words rounded-lg bg-brand-50 px-2 py-1.5 text-brand-700">💬 {detailOrder.note}</p>
              )}
            </div>

            <button
              type="button"
              className="btn-ghost w-full py-2 text-xs text-rose-500"
              disabled={deletingOrder}
              onClick={() => void removeRecentOrder()}
            >
              {deletingOrder ? '删除中…' : '删除这条订单'}
            </button>
          </div>
        </div>,
        document.body
      )}

      {totalQty > 0 && (
        <aside className="fixed bottom-20 right-3 z-20 flex w-56 max-w-[calc(100vw-1.5rem)] flex-col rounded-2xl border border-brand-100 bg-white/95 p-3 shadow-card backdrop-blur sm:right-[max(0.75rem,calc((100vw-28rem)/2))]">
          <div className="mb-2 flex items-center justify-between gap-2 border-b border-brand-100 pb-2">
            <div className="text-xs font-medium text-slate-600">
              已选 <span className="text-base font-semibold text-brand-600">{totalQty}</span> 份
            </div>
            <button className="btn-primary shrink-0 px-3 py-1.5 text-xs" disabled={submitting} onClick={submit}>
              {submitting ? '提交中…' : '提交订单'}
            </button>
          </div>
          <ul className="space-y-1">
            {picked.slice(safeCartPage * CART_PAGE_SIZE, (safeCartPage + 1) * CART_PAGE_SIZE).map(([key, qty]) => {
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
          <Pager page={safeCartPage} total={picked.length} pageSize={CART_PAGE_SIZE} onChange={setCartPage} />
        </aside>
      )}
    </div>
  )
}
