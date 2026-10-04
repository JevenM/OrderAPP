import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { unreadCounts } from '../lib/db'
import { useRealtime } from '../lib/realtime'
import { browserNotify, ding } from '../lib/notify'
import type { DishRequest, Meal, Order } from '../lib/types'

type UnreadValue = {
  orders: number
  meals: number
  requests: number
  refresh: () => void
}

const UnreadContext = createContext<UnreadValue>({
  orders: 0,
  meals: 0,
  requests: 0,
  refresh: () => {},
})

/** 监听 orders / meals / dish_requests 的新增，维护红点未读数并弹通知 */
export function UnreadProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [counts, setCounts] = useState({ orders: 0, meals: 0, requests: 0 })
  const known = useRef<Set<string>>(new Set())

  const refresh = useCallback(async () => {
    try {
      setCounts(await unreadCounts())
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    refresh()
  }, [enabled, refresh])

  useRealtime(
    'unread-watch',
    [
      {
        table: 'orders',
        event: 'INSERT',
        on: (payload) => {
          const o = payload.new as Order
          if (known.current.has(o.id)) return
          known.current.add(o.id)
          browserNotify('🔔 她下单啦', o.note || '快去后台看看她想吃什么')
          ding()
          refresh()
        },
      },
      {
        table: 'meals',
        event: 'INSERT',
        on: (payload) => {
          const m = payload.new as Meal
          if (known.current.has(m.id)) return
          known.current.add(m.id)
          if (m.read_at) return // 我这边自己补全的就餐记录，不弹通知
          browserNotify('🍚 她记录了新的一餐', `${m.day} · ${m.content || '（无内容）'}`)
          ding()
          refresh()
        },
      },
      {
        table: 'dish_requests',
        event: 'INSERT',
        on: (payload) => {
          const r = payload.new as DishRequest
          if (known.current.has(r.id)) return
          known.current.add(r.id)
          browserNotify('🍽️ 她想吃的这道菜菜单里没有', `${r.name} — 去「菜单」审核后就能直接点啦`)
          ding()
          refresh()
        },
      },
      { table: 'orders', event: 'UPDATE', on: refresh },
      { table: 'meals', event: 'UPDATE', on: refresh },
      { table: 'dish_requests', event: 'UPDATE', on: refresh },
    ],
    { enabled, onPoll: refresh }
  )

  const value = useMemo<UnreadValue>(
    () => ({ ...counts, refresh }),
    [counts, refresh]
  )

  return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>
}

export function useUnread(): UnreadValue {
  return useContext(UnreadContext)
}
