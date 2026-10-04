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
import { supabase } from '../lib/supabase'
import { unreadCounts } from '../lib/db'
import { browserNotify, ding } from '../lib/notify'
import type { Meal, Order } from '../lib/types'

type UnreadValue = {
  orders: number
  meals: number
  refresh: () => void
}

const UnreadContext = createContext<UnreadValue>({
  orders: 0,
  meals: 0,
  refresh: () => {},
})

/** 监听 orders / meals 的新增，维护红点未读数并弹通知 */
export function UnreadProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [counts, setCounts] = useState({ orders: 0, meals: 0 })
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

    const channel = supabase
      .channel('unread-watch')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
        const o = payload.new as Order
        if (known.current.has(o.id)) return
        known.current.add(o.id)
        browserNotify('🔔 她下单啦', o.note || '快去后台看看她想吃什么')
        ding()
        refresh()
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'meals' }, (payload) => {
        const m = payload.new as Meal
        if (known.current.has(m.id)) return
        known.current.add(m.id)
        if (m.read_at) return // 我这边自己补全的就餐记录，不弹通知
        browserNotify('🍚 她记录了新的一餐', `${m.day} · ${m.content || '（无内容）'}`)
        ding()
        refresh()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, refresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'meals' }, refresh)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [enabled, refresh])

  const value = useMemo<UnreadValue>(
    () => ({ ...counts, refresh }),
    [counts, refresh]
  )

  return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>
}

export function useUnread(): UnreadValue {
  return useContext(UnreadContext)
}
