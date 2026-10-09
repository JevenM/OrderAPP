import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listFeedNotifications, type FeedNotificationRow } from '../lib/db'
import { timeCn } from '../lib/date'
import { useUnread } from '../store/unread'

const ICON: Record<string, string> = { post: '📸', like: '❤️', comment: '💬', reply: '↩️', quiz: '💞' }

/**
 * 顶栏消息通知面板：
 * - 打开即拉取最近消息并全部标记已读（右上角未读角标随之消失）；
 * - 点任意一条跳转到饭圈查看详情。
 */
export default function FeedNotifyPanel({ identity, onClose }: { identity: string; onClose: () => void }) {
  const navigate = useNavigate()
  const { markFeedRead } = useUnread()
  const [items, setItems] = useState<FeedNotificationRow[] | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const rows = await listFeedNotifications(identity, 50)
        if (!alive) return
        setItems(rows)
        markFeedRead() // 点开查看之后未读自然消失
      } catch {
        if (alive) setItems([])
      }
    })()
    return () => {
      alive = false
    }
  }, [identity, markFeedRead])

  const openNotice = (n: FeedNotificationRow) => {
    onClose()
    navigate(n.type === 'quiz' ? `/couple${n.post_id ? `?quiz=${encodeURIComponent(n.post_id)}` : ''}` : '/feed')
  }

  return (
    <div className="absolute right-0 top-full z-40 mt-1.5 max-h-[70vh] w-72 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
      <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-3 py-2">
        <span className="text-xs font-semibold text-brand-600">🔔 消息通知</span>
        <button className="text-[11px] text-slate-400 active:text-brand-500" onClick={onClose}>
          关闭
        </button>
      </div>

      {items === null && <div className="px-3 py-8 text-center text-xs text-slate-300">加载中…</div>}

      {items !== null && items.length === 0 && (
        <div className="px-3 py-8 text-center text-xs leading-relaxed text-slate-400">
          还没有消息
          <br />
          对方发动态、点赞或评论时会在这里提醒你
        </div>
      )}

      {items !== null &&
        items.map((n) => (
          <button
            key={n.id}
            className="flex w-full items-start gap-2 border-b border-slate-50 px-3 py-2.5 text-left last:border-0 active:bg-brand-50"
            onClick={() => openNotice(n)}
          >
            <span className="text-base leading-5">{ICON[n.type] ?? '🔔'}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium text-slate-700">{n.title}</span>
              {n.body && <span className="mt-0.5 block truncate text-[11px] text-slate-400">{n.body}</span>}
              <span className="mt-0.5 block text-[10px] text-slate-300">{timeCn(n.created_at)}</span>
            </span>
          </button>
        ))}
    </div>
  )
}
