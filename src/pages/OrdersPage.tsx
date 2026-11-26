import { useCallback, useEffect, useRef, useState } from 'react'
import { deleteOrder, listDishes, listOrders, setOrderStatus, updateOrder } from '../lib/db'
import Pager, { PAGE_SIZE } from '../components/Pager'
import { browserNotify, ding } from '../lib/notify'
import { timeCn } from '../lib/date'
import { useRealtime } from '../lib/realtime'
import { Modal, useConfirm, type ModalOrigin } from '../components/Modal'
import { EmptyState } from '../components/States'
import { useToast } from '../components/Toast'
import { useSession } from '../store/session'
import { useFriends } from '../store/friends'
import { flowIndex, nextOrderAction, nextOrderStatus, ORDER_FLOW, ORDER_FLOW_LABEL } from '../lib/orderFlow'
import { ORDER_STATUS, SLOTS, SLOT_LABEL, type Dish, type MealSlot, type OrderStatus, type OrderWithItems } from '../lib/types'

/*
 * 「订单」面板：从点菜页拆出来的订单管理。
 * 两区严格区分：📤 我点的单（member_id = 我） / 📥 TA 点给我的单（member_id = 对方）。
 * 每一单都可直接查看详情、编辑、删除；对方的单额外有接单/制作/完成。
 * 点菜页只保留点菜本身，元素不再堆在一屏里。
 */

type EditItem = { dish_id: string | null; dish_name: string; emoji: string; qty: number }

/** 订单进度条：待接单 → 已接单 → 制作中 → 已完成 */
function OrderStepper({ status }: { status: OrderStatus }) {
  const index = flowIndex(status)
  if (index < 0) {
    return <p className="text-2xs text-slate-400">这单已取消</p>
  }
  return (
    <div className="flex items-start">
      {ORDER_FLOW.map((step, i) => {
        const reached = index >= i
        return (
          <div key={step} className={`flex items-center ${i === ORDER_FLOW.length - 1 ? '' : 'flex-1'}`}>
            <div className="flex flex-col items-center gap-1">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-2xs font-semibold transition-colors duration-300 ${
                  reached ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-400'
                }`}
              >
                {reached ? '✓' : i + 1}
              </span>
              <span className={`whitespace-nowrap text-2xs ${reached ? 'text-brand-600' : 'text-slate-400'}`}>
                {ORDER_FLOW_LABEL[step]}
              </span>
            </div>
            {i < ORDER_FLOW.length - 1 && (
              <span
                className={`mx-1 mb-4 h-0.5 flex-1 rounded-full transition-colors duration-300 ${
                  index > i ? 'bg-brand-400' : 'bg-slate-200'
                }`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

/** 订单卡片：整卡可点开详情；编辑/删除只在详情弹窗里做，列表保持清爽 */
function OrderCard({
  order,
  mine,
  partnerName,
  onDetail,
}: {
  order: OrderWithItems
  mine: boolean
  partnerName: string
  onDetail: (o: OrderWithItems, e: React.MouseEvent<HTMLElement>) => void
}) {
  return (
    <button
      type="button"
      className={`block w-full space-y-2.5 rounded-xl border p-3 text-left transition active:scale-[0.99] ${
        mine ? 'border-brand-100 bg-white' : 'border-rose-100 bg-white'
      }`}
      onClick={(e) => onDetail(order, e)}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 text-xs leading-relaxed text-slate-700">
          {order.items.map((i) => `${i.emoji}${i.dish_name}×${i.qty}`).join('，') || order.note || '只留了言'}
        </span>
        <span className={`chip shrink-0 text-2xs ${ORDER_STATUS[order.status]?.cls ?? ''}`}>
          {ORDER_STATUS[order.status]?.label ?? order.status}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-slate-400">
        <span className={`rounded px-1.5 py-0.5 ${mine ? 'bg-brand-50 text-brand-600' : 'bg-rose-50 text-rose-500'}`}>
          {mine ? '我点的' : `${partnerName}点的`}
        </span>
        <span>{timeCn(order.created_at)}</span>
        <span>·</span>
        <span>{SLOT_LABEL[order.meal_slot] ?? order.meal_slot}</span>
        {order.hope_time && <span>· 期望 {order.hope_time}</span>}
      </div>
      {order.note && (
        <p className="mt-1.5 break-words rounded-lg bg-brand-50/70 px-2 py-1 text-2xs text-brand-700">💬 {order.note}</p>
      )}
      <div className="rounded-lg bg-slate-50 px-2 py-2">
        <OrderStepper status={order.status} />
      </div>
      {/* <div className="border-t border-slate-100 pt-2 text-center text-2xs text-brand-500">点开管理 · 详情 / 编辑 / 删除</div> */}
    </button>
  )
}

export default function OrdersPage() {
  const toast = useToast()
  const confirm = useConfirm()
  const { memberId } = useSession()
  const { friends } = useFriends()

  const [recent, setRecent] = useState<OrderWithItems[]>([])
  const [incoming, setIncoming] = useState<OrderWithItems[]>([])
  /** 两区各自分页（长列表不内部滚动，苹果手机更好翻） */
  const [incomingPage, setIncomingPage] = useState(0)
  const [myPage, setMyPage] = useState(0)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  /** 最近一次看到的订单状态：用来判断「他接单了 / 做好了」，避免每次拉取都重复提示 */
  const seenStatus = useRef<Map<string, OrderStatus>>(new Map())

  /* 详情弹窗 */
  const [detailOrder, setDetailOrder] = useState<OrderWithItems | null>(null)
  /** 与 detailOrder 分开：关闭时先收起面板（保留内容播放缩回动画），内容不被立刻清空 */
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailOrigin, setDetailOrigin] = useState<ModalOrigin | null>(null)

  /* 编辑弹窗 */
  const [editOrder, setEditOrder] = useState<OrderWithItems | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editItems, setEditItems] = useState<EditItem[]>([])
  const [editSlot, setEditSlot] = useState<MealSlot>('dinner')
  const [editHope, setEditHope] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editPick, setEditPick] = useState('')
  const [editCustom, setEditCustom] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [dishes, setDishes] = useState<Dish[]>([])

  /** 当前绑定的另一方（订单会流向 TA，也接收 TA 点的单） */
  const partner = friends.find((f) => f.memberId !== '__admin__' && f.memberId !== memberId)
  const partnerId = partner?.memberId ?? null
  const partnerName = partner?.shownName || partner?.name || 'TA'

  const loadRecent = useCallback(async () => {
    try {
      const list = (await listOrders(20, memberId)).filter((o) => o.items.length > 0 || o.note)
      // 状态变了就提示一次：他接单 / 开火 / 做好了，下单的人第一时间知道
      for (const o of list) {
        const before = seenStatus.current.get(o.id)
        if (before && before !== o.status) {
          const label = ORDER_STATUS[o.status]?.label ?? o.status
          toast.show(`订单更新：${label}`)
          if (o.status === 'done') {
            browserNotify('✅ 开饭啦', '他做好啦，快去吃饭')
            ding()
          }
        }
        seenStatus.current.set(o.id, o.status)
      }
      setRecent(list)
    } catch {
      // ignore
    }
  }, [memberId, toast])

  const loadIncoming = useCallback(async () => {
    if (!partnerId) {
      setIncoming([])
      return
    }
    try {
      const list = await listOrders(12, partnerId)
      setIncoming(list.filter((o) => o.status !== 'cancelled').slice(0, 8))
    } catch {
      // ignore
    }
  }, [partnerId])

  useEffect(() => {
    void loadRecent()
    void loadIncoming()
  }, [loadRecent, loadIncoming])

  useRealtime(
    'her-orders',
    [
      { table: 'orders', on: () => { void loadRecent(); void loadIncoming() } },
      { table: 'order_items', on: () => { void loadRecent(); void loadIncoming() } },
    ],
    {
      // 只认当前这一对的订单变更，别对情侣的推送不参与刷新（刷了也会被查询条件过滤）
      pair: memberId && partnerId ? [memberId, partnerId] : null,
      onPoll: () => {
        void loadRecent()
        void loadIncoming()
      },
    }
  )

  /** 推进订单状态：接单 → 制作中 → 完成（乐观更新，失败回滚） */
  const advance = async (order: OrderWithItems) => {
    const next = nextOrderStatus(order.status)
    if (!next || updatingId) return
    setUpdatingId(order.id)
    const patch = (o: OrderWithItems) => (o.id === order.id ? { ...o, status: next } : o)
    setIncoming((list) => list.map(patch))
    setDetailOrder((d) => (d && d.id === order.id ? { ...d, status: next } : d))
    try {
      await setOrderStatus(order.id, next)
      toast.show(next === 'done' ? '这一单完成啦，记得喊 TA 吃饭 ❤️' : `已更新为「${ORDER_FLOW_LABEL[next]}」`)
      void loadIncoming()
      void loadRecent()
    } catch (e) {
      toast.show((e as Error).message, 'err')
      void loadIncoming()
      void loadRecent()
    } finally {
      setUpdatingId(null)
    }
  }

  /** 删除任意一张订单（我点的 / 对方点的都支持）：先确认，再删主表 + 明细 */
  const removeOrder = async (order: OrderWithItems) => {
    const ok = await confirm({
      title: '删除订单',
      message: `确定删除这条订单吗？\n${order.items.map((i) => `${i.dish_name}×${i.qty}`).join('，') || order.note}\n删除后无法恢复。`,
      okText: '删除',
      danger: true,
    })
    if (!ok) return
    try {
      await deleteOrder(order.id)
      toast.show('订单已删除')
      setDetailOpen(false)
      await Promise.all([loadRecent(), loadIncoming()])
    } catch (e) {
      toast.show((e as Error).message, 'err')
    }
  }

  const openDetail = (order: OrderWithItems, e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setDetailOrigin({ top: rect.top, left: rect.left, width: rect.width, height: rect.height })
    setDetailOrder(order)
    setDetailOpen(true)
  }

  /* ------------------------------ 编辑 ------------------------------ */

  const openEdit = (order: OrderWithItems) => {
    setDetailOpen(false)
    setEditOrder(order)
    setEditItems(order.items.map((i) => ({ dish_id: i.dish_id, dish_name: i.dish_name, emoji: i.emoji, qty: i.qty })))
    setEditSlot(order.meal_slot)
    setEditHope(order.hope_time)
    setEditNote(order.note)
    setEditPick('')
    setEditCustom('')
    setEditOpen(true)
    if (!dishes.length) {
      void listDishes().then(setDishes).catch(() => {})
    }
  }

  const addPickedDish = () => {
    const d = dishes.find((x) => x.id === editPick)
    if (!d) return
    setEditItems((list) => {
      const idx = list.findIndex((i) => i.dish_id === d.id)
      if (idx < 0) return [...list, { dish_id: d.id, dish_name: d.name, emoji: d.emoji, qty: 1 }]
      const next = [...list]
      next[idx] = { ...next[idx], qty: next[idx].qty + 1 }
      return next
    })
    setEditPick('')
  }

  const addCustomDish = () => {
    const name = editCustom.trim()
    if (!name) return
    setEditItems((list) => [...list, { dish_id: null, dish_name: name, emoji: '✨', qty: 1 }])
    setEditCustom('')
  }

  const saveEdit = async () => {
    if (!editOrder || savingEdit) return
    const items = editItems
      .filter((i) => i.dish_name.trim() && i.qty > 0)
      .map((i) => ({ ...i, dish_name: i.dish_name.trim(), qty: Math.min(99, i.qty) }))
    if (!items.length && !editNote.trim()) {
      toast.show('至少留一道菜或一句备注', 'err')
      return
    }
    setSavingEdit(true)
    try {
      await updateOrder(editOrder.id, {
        items,
        meal_slot: editSlot,
        hope_time: editHope.trim(),
        note: editNote.trim(),
      })
      toast.show('订单已更新')
      setEditOpen(false)
      await Promise.all([loadRecent(), loadIncoming()])
    } catch (e) {
      toast.show((e as Error).message, 'err')
    } finally {
      setSavingEdit(false)
    }
  }

  const detailIsMine = detailOrder ? detailOrder.member_id === memberId : true
  const detailNext = detailOrder ? nextOrderStatus(detailOrder.status) : null

  // 列表被刷新/删除后页码可能越界：收敛到有效页再切片
  const safeIncomingPage = Math.min(incomingPage, Math.max(0, Math.ceil(incoming.length / PAGE_SIZE) - 1))
  const safeMyPage = Math.min(myPage, Math.max(0, Math.ceil(recent.length / PAGE_SIZE) - 1))

  return (
    <div className="space-y-4 pb-2">
      {/* 📥 对方点给我的单：玫红区分，接单/制作在卡片上直接推进 */}
      <section className="card space-y-3 border border-rose-200/70">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="card-title text-sm text-rose-600">📥 {partnerName} 点给我的单</h2>
          <span className="chip border-rose-200 bg-rose-50 text-2xs text-rose-500">
            共 {incoming.length} 单 · 待接 {incoming.filter((o) => o.status === 'pending').length}
          </span>
        </div>
        {incoming.length > 0 ? (
          <>
            {incoming.slice(safeIncomingPage * PAGE_SIZE, (safeIncomingPage + 1) * PAGE_SIZE).map((o) => (
              <OrderCard
                key={o.id}
                order={o}
                mine={o.member_id === memberId}
                partnerName={partnerName}
                onDetail={openDetail}
              />
            ))}
            <Pager page={safeIncomingPage} total={incoming.length} onChange={setIncomingPage} totalLabel={`共 ${incoming.length} 单`} />
          </>
        ) : (
          <p className="py-2 text-center text-2xs text-slate-400">还没有 {partnerName} 点给你的单</p>
        )}
      </section>

      {/* 📤 我点的单：品牌色区分，看进度/改内容/删单都在这区 */}
      <section className="card space-y-3 border border-brand-200/70">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="card-title text-sm text-brand-600">📤 我点的单</h2>
          <span className="chip border-brand-200 bg-brand-50 text-2xs text-brand-600">共 {recent.length} 单</span>
        </div>
        {recent.length > 0 ? (
          <>
            {recent.slice(safeMyPage * PAGE_SIZE, (safeMyPage + 1) * PAGE_SIZE).map((o) => (
              <OrderCard
                key={o.id}
                order={o}
                mine={o.member_id === memberId}
                partnerName={partnerName}
                onDetail={openDetail}
              />
            ))}
            <Pager page={safeMyPage} total={recent.length} onChange={setMyPage} totalLabel={`共 ${recent.length} 单`} />
          </>
        ) : (
          <p className="py-2 text-center text-2xs text-slate-400">你还没下过单，去「点菜」点起来～</p>
        )}
      </section>

      {recent.length === 0 && incoming.length === 0 && (
        <EmptyState icon="📦" title="还没有订单" hint="去「点菜」下一单，或者等 TA 点给你～" />
      )}

      {/* 订单详情：从列表卡片原位放大成居中面板，关闭时缩回原处 */}
      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title="订单详情"
        className="max-w-sm"
        origin={detailOrigin}
      >
        {detailOrder && (
          <div className="space-y-3 px-5 pb-5">
            <div className="space-y-2 text-xs">
              <div className="flex flex-wrap items-center gap-2 text-slate-400">
                <span>{timeCn(detailOrder.created_at)}</span>
                <span className="rounded bg-brand-50 px-1.5 py-0.5 text-brand-600">
                  {SLOT_LABEL[detailOrder.meal_slot] ?? detailOrder.meal_slot}
                </span>
                <span className={`chip ${ORDER_STATUS[detailOrder.status]?.cls ?? ''}`}>
                  {ORDER_STATUS[detailOrder.status]?.label ?? detailOrder.status}
                </span>
                <span className={`rounded px-1.5 py-0.5 ${detailIsMine ? 'bg-brand-50 text-brand-600' : 'bg-rose-50 text-rose-500'}`}>
                  {detailIsMine ? '我点的' : `${partnerName}点的`}
                </span>
              </div>

              <div className="rounded-lg bg-slate-50 p-2">
                <OrderStepper status={detailOrder.status} />
              </div>

              <div className="space-y-1 rounded-lg bg-slate-50 p-2">
                <div className="text-2xs font-medium text-slate-400">
                  {detailIsMine ? '我点的菜' : `${partnerName} 点的菜`}
                </div>
                {detailOrder.items.length > 0 ? (
                  <ul className="space-y-1">
                    {detailOrder.items.map((i) => (
                      <li key={i.id} className="flex items-center justify-between gap-2 text-sm text-slate-700">
                        <span className="min-w-0 break-words">
                          {i.emoji} {i.dish_name}
                        </span>
                        <span className="shrink-0 text-slate-400">×{i.qty}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-400">（没有选菜，只有留言）</p>
                )}
              </div>

              {detailOrder.hope_time && <p className="text-slate-500">🕒 期望时间：{detailOrder.hope_time}</p>}
              {detailOrder.note && (
                <p className="whitespace-pre-wrap break-words rounded-lg bg-brand-50 px-2 py-1.5 text-brand-700">
                  💬 {detailOrder.note}
                </p>
              )}
            </div>

            {/* 管理按钮：flex-wrap 自动换行，永不让按钮叠在内容上 */}
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-ghost btn-sm flex-1" onClick={() => openEdit(detailOrder)}>
                编辑这单
              </button>
              <button type="button" className="btn-danger-soft btn-sm flex-1" onClick={() => void removeOrder(detailOrder)}>
                删除这单
              </button>
              {!detailIsMine && detailNext && (
                <button
                  className="btn-primary btn-sm w-full"
                  disabled={updatingId === detailOrder.id}
                  onClick={() => void advance(detailOrder)}
                >
                  {updatingId === detailOrder.id ? '更新中…' : nextOrderAction(detailOrder.status)}
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* 编辑弹窗：餐次 / 时间 / 备注 / 菜品明细，数量与删除都可直接调 */}
      <Modal open={editOpen} onClose={() => !savingEdit && setEditOpen(false)} title="编辑订单" className="max-w-sm">
        {editOrder && (
          <div className="space-y-3 px-5 pb-5">
            <div>
              <div className="mb-1.5 text-2xs font-medium text-slate-400">这一顿</div>
              <div className="grid grid-cols-4 gap-1.5">
                {SLOTS.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setEditSlot(s.key)}
                    className={`rounded-lg border py-1.5 text-2xs transition ${
                      editSlot === s.key ? 'border-brand-400 bg-brand-50 text-brand-600' : 'border-slate-200 text-slate-500'
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
              value={editHope}
              onChange={(e) => setEditHope(e.target.value)}
            />
            <textarea
              className="input min-h-16 resize-none"
              placeholder="想说点什么？（少辣 / 多加点汤…）"
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
            />

            <div>
              <div className="mb-1.5 text-2xs font-medium text-slate-400">菜品明细（可改数量 / 删除 / 添加）</div>
              <div className="space-y-1.5">
                {editItems.length === 0 && <p className="text-2xs text-slate-400">还没有菜，从下面加一道吧</p>}
                {editItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5">
                    <span className="shrink-0 text-sm">{item.emoji}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-slate-700">{item.dish_name}</span>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-slate-500 active:bg-slate-200"
                        onClick={() =>
                          setEditItems((list) =>
                            list.map((it, i) => (i === idx ? { ...it, qty: Math.max(1, it.qty - 1) } : it))
                          )
                        }
                      >
                        −
                      </button>
                      <span className="w-5 text-center text-xs font-semibold tabular-nums text-slate-600">{item.qty}</span>
                      <button
                        type="button"
                        className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-slate-500 active:bg-slate-200"
                        onClick={() =>
                          setEditItems((list) =>
                            list.map((it, i) => (i === idx ? { ...it, qty: Math.min(99, it.qty + 1) } : it))
                          )
                        }
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 rounded-md px-1.5 py-1 text-2xs text-rose-500 active:bg-rose-50"
                      onClick={() => setEditItems((list) => list.filter((_, i) => i !== idx))}
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <select className="input min-w-0 flex-1" value={editPick} onChange={(e) => setEditPick(e.target.value)}>
                <option value="">从菜单选一道…</option>
                {dishes.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.emoji} {d.name}
                  </option>
                ))}
              </select>
              <button type="button" className="btn-ghost btn-sm shrink-0" onClick={addPickedDish} disabled={!editPick}>
                加入
              </button>
            </div>
            <div className="flex gap-2">
              <input
                className="input min-w-0 flex-1"
                placeholder="或写道菜单里没有的菜"
                value={editCustom}
                onChange={(e) => setEditCustom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addCustomDish()
                  }
                }}
              />
              <button type="button" className="btn-ghost btn-sm shrink-0" onClick={addCustomDish} disabled={!editCustom.trim()}>
                加入
              </button>
            </div>

            <button type="button" className="btn-primary w-full py-2 text-xs" disabled={savingEdit} onClick={() => void saveEdit()}>
              {savingEdit ? '保存中…' : '保存修改'}
            </button>
          </div>
        )}
      </Modal>
    </div>
  )
}
