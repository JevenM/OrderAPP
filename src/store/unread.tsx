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
import { useSession } from './session'
import { useSettings } from './settings'
import { useToast } from '../components/Toast'
import { supabase } from '../lib/supabase'
import type { DishRequest, Meal, Order, Post, PostComment, PostLike } from '../lib/types'

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

/** 监听订单、饮食、以及饭圈的点赞、评论和新动态，触发消息提醒与通知 */
export function UnreadProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const { isAdmin, memberId } = useSession()
  const { adminName, viewerAdminName } = useSettings()
  const toast = useToast()
  const [counts, setCounts] = useState({ orders: 0, meals: 0, requests: 0 })
  const known = useRef<Set<string>>(new Set())

  const refresh = useCallback(async () => {
    if (!isAdmin) return
    try {
      setCounts(await unreadCounts())
    } catch {
      // ignore
    }
  }, [isAdmin])

  useEffect(() => {
    if (!enabled || !isAdmin) return
    refresh()
  }, [enabled, isAdmin, refresh])

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
      // 饭圈新动态通知
      {
        table: 'posts',
        event: 'INSERT',
        on: async (payload) => {
          const p = payload.new as Post
          if (known.current.has(p.id)) return
          known.current.add(p.id)
          // 过滤自己发的
          const isMine = isAdmin ? p.author === 'me' : p.member_id === memberId
          if (isMine) return

          let authorName = '好友'
          if (!p.member_id || p.author === 'me') {
            authorName = viewerAdminName || adminName
          } else {
            const { data } = await supabase.from('members').select('name').eq('id', p.member_id).maybeSingle()
            if (data?.name) authorName = data.name
          }

          const tip = `📸 ${authorName}发了新动态`
          const detail = p.content ? (p.content.length > 25 ? `${p.content.slice(0, 25)}…` : p.content) : '分享了美食'
          toast.show(`${tip}：${detail}`)
          browserNotify(tip, detail)
          ding()
        },
      },
      // 饭圈点赞通知：有人给自己的动态点赞
      {
        table: 'post_likes',
        event: 'INSERT',
        on: async (payload) => {
          const l = payload.new as PostLike
          if (known.current.has(l.id)) return
          known.current.add(l.id)
          // 过滤自己的点赞
          const isMyLike = isAdmin ? l.member_id === null : l.member_id === memberId
          if (isMyLike) return

          // 查询被赞动态的归属
          const { data: post } = await supabase.from('posts').select('author, member_id').eq('id', l.post_id).maybeSingle()
          if (!post) return

          const isTargetMyPost = isAdmin
            ? post.author === 'me' || post.member_id === null
            : post.member_id === memberId

          if (!isTargetMyPost) return

          let likerName = '好友'
          if (!l.member_id) {
            likerName = viewerAdminName || adminName
          } else {
            const { data: member } = await supabase.from('members').select('name').eq('id', l.member_id).maybeSingle()
            if (member?.name) likerName = member.name
          }

          const tip = `❤️ ${likerName}赞了你的动态`
          toast.show(tip)
          browserNotify('❤️ 动态收到新点赞', `${likerName}点赞了你的饭圈动态`)
          ding()
        },
      },
      // 饭圈评论通知：有人评论自己的动态，或针对性回复自己
      {
        table: 'post_comments',
        event: 'INSERT',
        on: async (payload) => {
          const c = payload.new as PostComment
          if (known.current.has(c.id)) return
          known.current.add(c.id)
          // 过滤自己的评论
          const isMyComment = isAdmin ? c.member_id === null : c.member_id === memberId
          if (isMyComment) return

          // 检查是否是被定向回复或者是自己的动态收到评论
          const isDirectedToMe = !!memberId && c.reply_to === memberId
          const { data: post } = await supabase.from('posts').select('author, member_id').eq('id', c.post_id).maybeSingle()
          const isMyPost = post ? (isAdmin ? post.author === 'me' || post.member_id === null : post.member_id === memberId) : false

          if (!isDirectedToMe && !isMyPost) return

          let commenterName = '好友'
          if (!c.member_id) {
            commenterName = viewerAdminName || adminName
          } else {
            const { data: member } = await supabase.from('members').select('name').eq('id', c.member_id).maybeSingle()
            if (member?.name) commenterName = member.name
          }

          const tipTitle = isDirectedToMe ? `💬 ${commenterName}回复了你` : `💬 ${commenterName}评论了你的动态`
          const tipBody = c.content.length > 25 ? `${c.content.slice(0, 25)}…` : c.content
          toast.show(`${tipTitle}：${tipBody}`)
          browserNotify(tipTitle, tipBody)
          ding()
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
