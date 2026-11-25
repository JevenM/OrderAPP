import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createDishRequest, createOrder, listDishes } from '../lib/db'
import { pushEmail } from '../lib/notify'
import { useRealtime } from '../lib/realtime'
import Pager from '../components/Pager'
import { Modal } from '../components/Modal'
import { EmptyState } from '../components/States'
import { useToast } from '../components/Toast'
import { useSession } from '../store/session'
import { bucketByGroup, dishGroupOf, type DishGroupKey } from '../lib/dishGroups'
import { SLOTS, type Dish, type MealSlot } from '../lib/types'

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
  const [wheelOpen, setWheelOpen] = useState(false)
  /** 转盘当前展示的菜品：每次开盘 / 每次随机都从全部在售菜品里重新抽样（必含中奖菜） */
  const [wheelPool, setWheelPool] = useState<Dish[]>([])
  const [spinning, setSpinning] = useState(false)
  const [selectedDish, setSelectedDish] = useState<Dish | null>(null)
  const [wheelRotation, setWheelRotation] = useState(0)
  /* 购物车分页 */
  const [cartPage, setCartPage] = useState(0)
  /* 分类选择：默认只露三个大类，点开才是细分菜系网格 */
  const [openGroup, setOpenGroup] = useState<DishGroupKey | null>(null)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const groupRowRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      setDishes(await listDishes())
    } catch (e) {
      toast.show((e as Error).message, 'err')
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  // 菜单变更实时刷新（订单相关的实时/轮询搬去了「订单」面板 OrdersPage）
  useRealtime('her-dishes', [{ table: 'dishes', on: () => void load() }], {
    onPoll: () => void load(),
  })

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

  const buckets = useMemo(() => bucketByGroup(grouped), [grouped])
  const activeBucket = openGroup ? buckets.find((b) => b.key === openGroup) ?? null : null
  const selectedCount = useMemo(
    () => grouped.find(([c]) => c === activeCategory)?.[1].length ?? 0,
    [grouped, activeCategory]
  )
  /** 搜索后选中的菜系可能已经不在结果里：自动回到「全部」 */
  useEffect(() => {
    if (activeCategory && !grouped.some(([c]) => c === activeCategory)) setActiveCategory(null)
  }, [grouped, activeCategory])

  const visibleEntries = useMemo(() => {
    if (activeCategory) return grouped.filter(([c]) => c === activeCategory)
    if (openGroup) {
      const bucket = buckets.find((b) => b.key === openGroup)
      return bucket ? bucket.categories : []
    }
    return grouped
  }, [activeCategory, openGroup, grouped, buckets])

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
    } catch (e) {
      toast.show((e as Error).message, 'err')
    } finally {
      setSubmitting(false)
    }
  }

  /** 选中细分菜系：面板收起，筛选标签居中显示当前分类 */
  const pickCategory = (category: string | null) => {
    setActiveCategory(category)
    setOpenGroup(null)
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
        <p className="text-2xs text-slate-400">
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
                <button className="btn-soft px-1.5 py-0.5 text-xs leading-none" onClick={() => changeKey(key, -1)} title="减少">
                  −
                </button>
                <button className="btn-primary px-1.5 py-0.5 text-xs leading-none" onClick={() => changeKey(key, 1)} title="增加">
                  +
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <input
          className="input min-w-0 flex-1"
          placeholder="🔍 搜索菜名"
          value={keyword}
          onChange={(e) => {
            setKeyword(e.target.value)
            setOpenGroup(null)
          }}
        />
        <button
          className="btn-soft shrink-0 px-3 text-sm"
          onClick={() => {
            setSelectedDish(null)
            setWheelPool(sampleWheelPool())
            setWheelOpen(true)
          }}
        >
          不知道吃什么
        </button>
      </div>

      {grouped.length === 0 && (
        <EmptyState icon="🍽️" title="还没有可点的菜" hint="让他去「菜单」里加几道，或直接在上面写下想吃的菜" />
      )}

      {/* 菜系选择：默认三个大类，点开是细分菜系的多行网格；选中后收起并把筛选标签居中 */}
      {grouped.length > 0 && (
        <div className="sticky top-[136px] z-[5] -mx-4 border-y border-brand-100 bg-white/95 px-4 py-2 backdrop-blur">
          <div ref={groupRowRef}>
            {activeCategory && !openGroup ? (
              <div className="flex animate-pop-in items-center justify-center gap-2">
                <button
                  type="button"
                  className="chip border-brand-400 bg-brand-50 font-semibold text-brand-600"
                  onClick={() => setOpenGroup(dishGroupOf(activeCategory))}
                >
                  {activeCategory} · {selectedCount} 道
                  <span className="text-2xs text-brand-400">⌄</span>
                </button>
                <button
                  type="button"
                  className="chip border-slate-200 bg-white text-slate-500 active:bg-brand-50"
                  onClick={() => pickCategory(null)}
                >
                  全部菜品
                </button>
              </div>
            ) : (
              <div className="flex gap-1.5">
                {buckets.map((b) => (
                  <button
                    key={b.key}
                    type="button"
                    className={`chip flex-1 justify-center transition-colors duration-200 ${
                      openGroup === b.key
                        ? 'border-brand-400 bg-brand-50 font-semibold text-brand-600'
                        : 'border-brand-200 bg-white text-slate-600 active:bg-brand-50'
                    } ${b.count === 0 ? 'opacity-40' : ''}`}
                    onClick={() => setOpenGroup((g) => (g === b.key ? null : b.key))}
                    aria-expanded={openGroup === b.key}
                  >
                    {b.emoji} {b.label}
                    <span className="text-2xs opacity-70">{b.count}</span>
                  </button>
                ))}
              </div>
            )}

            {/* 细分菜系网格：高度折叠动画（0fr → 1fr），内容多行多列 */}
            <div className={`collapse-grid ${openGroup ? 'is-open' : ''}`}>
              <div>
                <div className="mt-2 rounded-xl border border-brand-100 bg-brand-50/60 p-2">
                  <div className="mb-1.5 flex items-center justify-between px-0.5">
                    <span className="text-2xs text-slate-500">
                      {activeBucket ? `${activeBucket.label} · 选一个细分菜系` : '选一个细分菜系'}
                    </span>
                    <button
                      type="button"
                      className="text-2xs text-slate-400"
                      onClick={() => pickCategory(null)}
                    >
                      显示全部
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(activeBucket?.categories ?? []).map(([cat, list]) => (
                      <button
                        key={cat}
                        type="button"
                        className={`rounded-lg px-2 py-1.5 text-xs transition duration-200 active:scale-95 ${
                          activeCategory === cat
                            ? 'bg-brand-500 font-semibold text-white shadow-sm'
                            : 'bg-white text-slate-600 shadow-sm'
                        }`}
                        onClick={() => pickCategory(cat)}
                      >
                        <span className="block truncate">{cat}</span>
                        <span className={`text-2xs ${activeCategory === cat ? 'text-white/80' : 'text-slate-400'}`}>
                          {list.length} 道
                        </span>
                      </button>
                    ))}
                    {(activeBucket?.categories.length ?? 0) === 0 && (
                      <p className="col-span-3 py-2 text-center text-2xs text-slate-400">这一类还没有菜</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {visibleEntries.map(([category, list]) => (
        <div key={category} id={`cat-${category}`} className="scroll-mt-[180px]">
          <div className="mb-2 flex items-center justify-between px-0.5">
            <span className="text-xs font-medium text-slate-500">
              {category}
              <span className="ml-1 text-2xs text-slate-400">{list.length} 道</span>
            </span>
            {activeCategory !== category && openGroup && (
              <button className="text-2xs text-brand-500" onClick={() => pickCategory(category)}>
                只看这一类
              </button>
            )}
          </div>
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
                    {d.price > 0 && <span className="shrink-0 text-2xs text-brand-500">¥{d.price}</span>}
                  </div>
                  {d.description && <div className="line-clamp-2 text-2xs text-slate-400">{d.description}</div>}
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

      <Modal open={wheelOpen} onClose={() => !spinning && setWheelOpen(false)} title="今天吃点什么？" className="max-w-sm">
        <div className="px-5 pb-5">
          <div className="relative mx-auto my-5 aspect-square w-full max-w-[17rem]">
            <div className="absolute -top-1 left-1/2 z-10 -translate-x-1/2 border-x-[10px] border-t-[18px] border-x-transparent border-t-danger-500" />
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
                    className="absolute left-1/2 top-1/2 w-[46%] truncate pl-7 text-center text-2xs font-semibold text-white drop-shadow"
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
            <button
              className="absolute left-1/2 top-1/2 z-10 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-white bg-slate-800 text-sm font-bold text-white shadow-lg disabled:opacity-60"
              disabled={spinning}
              onClick={spinWheel}
            >
              {spinning ? '转动中' : '随机'}
            </button>
          </div>
          {selectedDish && (
            <div className="animate-pop-in text-center">
              <p className="text-xs text-slate-400">今天就吃</p>
              <p className="mt-1 text-lg font-semibold text-brand-600">
                {selectedDish.emoji} {selectedDish.name}
              </p>
              <button
                className="btn-primary mt-3 w-full"
                onClick={() => {
                  change(selectedDish, 1)
                  setWheelOpen(false)
                }}
              >
                加入购物车
              </button>
            </div>
          )}
        </div>
      </Modal>

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
                <li
                  key={key}
                  className="flex items-center justify-between gap-2 rounded-lg bg-brand-50/70 px-2 py-1.5 text-xs text-slate-700"
                >
                  <span className="min-w-0 break-words">
                    {emoji} {label}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      className="btn-icon"
                      aria-label={`减少${label}`}
                      onClick={() => changeKey(key, -1)}
                    >
                      −
                    </button>
                    <span className="min-w-5 text-center font-semibold text-brand-600">{qty}</span>
                    <button
                      type="button"
                      className="btn-icon"
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
