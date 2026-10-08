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
import {
  markFeedNotificationsRead,
  unreadCounts,
  unreadFeedNotificationsCount,
  type FeedNotificationRow,
} from '../lib/db'
import { useRealtime } from '../lib/realtime'
import { browserNotify, ding } from '../lib/notify'
import { useSession } from './session'
import { useToast } from '../components/Toast'
import type { DishRequest, Meal, Order } from '../lib/types'

type UnreadValue = {
  orders: number
  meals: number
  requests: number
  /** 饭圈消息未读条数：对方发布动态 / 点赞 / 评论（含定向回复） */
  feedUnread: number
  refresh: () => void
  /** 打开消息面板后清零未读 */
  markFeedRead: () => void
}

const UnreadContext = createContext<UnreadValue>({
  orders: 0,
  meals: 0,
  requests: 0,
  feedUnread: 0,
  refresh: () => {},
  markFeedRead: () => {},
})

/** 监听订单、饮食、以及饭圈的点赞、评论和新动态，触发消息提醒与通知 */
export function UnreadProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const { isAdmin, memberId } = useSession()
  const toast = useToast()
  const [counts, setCounts] = useState({ orders: 0, meals: 0, requests: 0 })
  const [feedUnread, setFeedUnread] = useState(0)
  const known = useRef<Set<string>>(new Set())

  /** 当前身份的消息收件箱 key：管理员固定 'me'，她是自己的成员 id（与 posts.member_id 口径一致） */
  const feedIdentity = isAdmin ? 'me' : memberId ?? ''

  const refresh = useCallback(async () => {
    if (!isAdmin) return
    try {
      setCounts(await unreadCounts())
    } catch {
      // ignore
    }
  }, [isAdmin])

  const refreshFeed = useCallback(async () => {
    if (!feedIdentity) return
    try {
      setFeedUnread(await unreadFeedNotificationsCount(feedIdentity))
    } catch {
      // ignore
    }
  }, [feedIdentity])

  useEffect(() => {
    if (!enabled || !isAdmin) return
    refresh()
  }, [enabled, isAdmin, refresh])

  useEffect(() => {
    if (!enabled || !feedIdentity) return
    void refreshFeed()
  }, [enabled, feedIdentity, refreshFeed])

  /** 打开消息面板：本地立即清零，服务端全部标记已读 */
  const markFeedRead = useCallback(() => {
    if (!feedIdentity) return
    setFeedUnread(0)
    void markFeedNotificationsRead(feedIdentity).catch(() => {
      // 标记失败下次打开还能再标
    })
  }, [feedIdentity])

  useRealtime(
    'unread-watch',
    [
      {
        table: 'orders',
        event: 'INSERT',
        on: (payload) => {
          if (!isAdmin) return
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
          if (!isAdmin) return
          const m = payload.new as Meal
          if (known.current.has(m.id)) return
          known.current.add(m.id)
          if (m.read_at) return // 自己补全的就餐记录不弹通知
          browserNotify('🍚 她记录了新的一餐', `${m.day} · ${m.content || '（无内容）'}`)
          ding()
          refresh()
        },
      },
      {
        table: 'dish_requests',
        event: 'INSERT',
        on: (payload) => {
          if (!isAdmin) return
          const r = payload.new as DishRequest
          if (known.current.has(r.id)) return
          known.current.add(r.id)
          browserNotify('🍽️ 她想吃的这道菜菜单里没有', `${r.name} — 去「菜单」审核后就能直接点啦`)
          ding()
          refresh()
        },
      },
      // 饭圈消息通知：对方发布动态 / 点赞 / 评论时落一条通知（db.ts 动作函数里写入），
      // 这里监听 INSERT 弹提醒并刷新未读角标，离线错过的回来后仍能看到未读数
      {
        table: 'feed_notifications',
        event: 'INSERT',
        on: (payload) => {
          const n = payload.new as FeedNotificationRow
          if (!n || n.recipient !== feedIdentity) return
          if (known.current.has(n.id)) return
          known.current.add(n.id)
          toast.show(`${n.title}${n.body ? `：${n.body}` : ''}`)
          browserNotify(n.title, n.body)
          ding()
          void refreshFeed()
        },
      },
      { table: 'orders', event: 'UPDATE', on: refresh },
      { table: 'meals', event: 'UPDATE', on: refresh },
      { table: 'dish_requests', event: 'UPDATE', on: refresh },
    ],
    {
      enabled,
      onPoll: () => {
        refresh()
        void refreshFeed()
      },
    }
  )

  const value = useMemo<UnreadValue>(
    () => ({ ...counts, feedUnread, refresh, markFeedRead }),
    [counts, feedUnread, refresh, markFeedRead]
  )

  return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>
}

export function useUnread(): UnreadValue {
  return useContext(UnreadContext)
}
