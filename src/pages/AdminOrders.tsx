import { useCallback, useEffect, useMemo, useState } from 'react'
import { autoMealFromOrder, listOrders, markOrderRead, setOrderStatus } from '../lib/db'
import { timeCn } from '../lib/date'
import { useRealtime } from '../lib/realtime'
import { useToast } from '../components/Toast'
import { useUnread } from '../store/unread'
import { useMembers } from '../store/members'
import { useSession } from '../store/session'
import { ORDER_STATUS, SLOT_LABEL, type OrderStatus, type OrderWithItems } from '../lib/types'

const FILTERS: { key: 'all' | OrderStatus; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待接单' },
  { key: 'accepted', label: '已接单' },
  { key: 'done', label: '已完成' },
  { key: 'cancelled', label: '已取消' },
]

export default function AdminOrders() {
  const toast = useToast()
  const { refresh } = useUnread()
  const { members } = useMembers()
  const { memberId: viewMemberId } = useSession() // 顶部下拉切换到某个她时，只显示她的
  const [orders, setOrders] = useState<OrderWithItems[]>([])
  const [filter, setFilter] = useState<'all' | OrderStatus>('all')
  const [memberFilter, setMemberFilter] = useState(viewMemberId ?? '')
  const [loading, setLoading] = useState(true)

  // 切换查看对象 → 成员筛选跟着变（回到管理视图时恢复成「全部成员」）
  useEffect(() => {
    setMemberFilter(viewMemberId ?? '')
  }, [viewMemberId])

  const who = (id: string | null) => members.find((m) => m.id === id)?.name ?? '未归属'

  const load = useCallback(async () => {
    try {
      setOrders(await listOrders(60, memberFilter || null))
    } catch (e) {
      toast.show((e as Error).message, 'err')
    } finally {
      setLoading(false)
    }
  }, [toast, memberFilter])

  useEffect(() => {
    void load()
  }, [load])

  useRealtime(
    'admin-orders',
    [
      { table: 'orders', on: () => void load() },
      { table: 'order_items', on: () => void load() },
    ],
    { onPoll: () => void load() }
  )

  // 打开页面即视为已读（1.5 秒后清掉红点）
  useEffect(() => {
    const ids = orders.filter((o) => !o.read_at).map((o) => o.id)
    if (!ids.length) return
    const t = window.setTimeout(() => {
      ids.forEach((id) => void markOrderRead(id))
      setOrders((prev) => prev.map((o) => (ids.includes(o.id) ? { ...o, read_at: new Date().toISOString() } : o)))
      refresh()
    }, 1500)
    return () => window.clearTimeout(t)
  }, [orders, refresh])

  const list = useMemo(
    () => (filter === 'all' ? orders : orders.filter((o) => o.status === filter)),
    [orders, filter]
  )

  const act = async (id: string, status: OrderStatus) => {
    try {
      await setOrderStatus(id, status)
      if (status === 'done') {
        const o = orders.find((x) => x.id === id)
        if (o) {
          await autoMealFromOrder(o)
          toast.show('已同步到她的就餐记录 ❤️')
        }
      } else {
        toast.show('已更新')
      }
      void load()
    } catch (e) {
      toast.show((e as Error).message, 'err')
    }
  }

  return (
    <div className="space-y-3">
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

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`chip whitespace-nowrap ${
              filter === f.key ? 'border-brand-400 bg-brand-50 text-brand-600' : 'border-slate-200 text-slate-400'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && <p className="py-10 text-center text-sm text-slate-400">加载中…</p>}
      {!loading && list.length === 0 && <p className="py-10 text-center text-sm text-slate-400">还没有订单</p>}

      {list.map((o) => (
        <div key={o.id} className={`card space-y-2 ${!o.read_at ? 'ring-2 ring-brand-200' : ''}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>{timeCn(o.created_at)}</span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5">{SLOT_LABEL[o.meal_slot] ?? o.meal_slot}</span>
              <span className="rounded bg-brand-50 px-1.5 py-0.5 text-brand-600">{who(o.member_id)}</span>
              {!o.read_at && <span className="rounded bg-rose-500 px-1.5 py-0.5 text-white">NEW</span>}
            </div>
            <span className={`chip ${ORDER_STATUS[o.status]?.cls ?? ''}`}>{ORDER_STATUS[o.status]?.label ?? o.status}</span>
          </div>

          <ul className="space-y-1">
            {o.items.map((i) => (
              <li key={i.id} className="flex items-center justify-between text-sm">
                <span>
                  {i.emoji} {i.dish_name}
                </span>
                <span className="text-slate-400">×{i.qty}</span>
              </li>
            ))}
            {o.items.length === 0 && <li className="text-sm text-slate-400">（没有选菜，只有留言）</li>}
          </ul>

          {o.hope_time && <p className="text-xs text-slate-500">🕒 期望时间：{o.hope_time}</p>}
          {o.note && (
            <p className="rounded-lg bg-brand-50 px-2 py-1.5 text-xs text-brand-700">💬 {o.note}</p>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            {o.status === 'pending' && (
              <button className="btn-primary text-xs" onClick={() => act(o.id, 'accepted')}>
                接单
              </button>
            )}
            {o.status !== 'done' && o.status !== 'cancelled' && (
              <button className="btn-soft text-xs" onClick={() => act(o.id, 'done')}>
                做好了
              </button>
            )}
            {o.status !== 'cancelled' && o.status !== 'done' && (
              <button className="btn-ghost text-xs" onClick={() => act(o.id, 'cancelled')}>
                取消
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
