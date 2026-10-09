import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listFeedNotifications, markFeedNotificationRead, type FeedNotificationRow } from '../lib/db'
import { timeCn } from '../lib/date'
import { useUnread } from '../store/unread'

const ICON: Record<string, string> = { post: '📸', like: '❤️', comment: '💬', reply: '↩️', quiz: '💞' }
const PAGE_SIZE = 10

type View = 'preview' | 'all'

export default function FeedNotifyPanel({ identity, onClose }: { identity: string; onClose: () => void }) {
  const navigate = useNavigate()
  const { refresh } = useUnread()
  const [items, setItems] = useState<FeedNotificationRow[] | null>(null)
  const [view, setView] = useState<View>('preview')
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)

  const loadPage = useCallback(async (nextPage: number) => {
    setItems(null)
    try {
      const rows = await listFeedNotifications(identity, nextPage === 0 ? PAGE_SIZE : PAGE_SIZE + 1, nextPage * PAGE_SIZE)
      setHasMore(rows.length > PAGE_SIZE)
      setItems(rows.slice(0, PAGE_SIZE))
    } catch {
      setItems([])
      setHasMore(false)
    }
  }, [identity])

  useEffect(() => {
    void loadPage(0)
  }, [loadPage])

  const openNotice = async (notice: FeedNotificationRow) => {
    if (!notice.read_at) {
      setItems((current) => current?.map((item) => item.id === notice.id ? { ...item, read_at: new Date().toISOString() } : item) ?? null)
      try {
        await markFeedNotificationRead(identity, notice.id)
        refresh()
      } catch {
        // Keep the local read state; the unread count refreshes on its next poll.
      }
    }
    onClose()
    navigate(notice.type === 'quiz' ? `/couple${notice.post_id ? `?quiz=${encodeURIComponent(notice.post_id)}` : ''}` : '/feed')
  }

  const changePage = (nextPage: number) => {
    setPage(nextPage)
    void loadPage(nextPage)
  }

  return (
    <div className="absolute right-0 top-full z-40 mt-1.5 flex max-h-[75vh] w-[min(22rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <div className="flex gap-3 text-xs font-semibold">
          <button className={view === 'preview' ? 'text-brand-600' : 'text-slate-400'} onClick={() => { setView('preview'); setPage(0); void loadPage(0) }}>最近消息</button>
          <button className={view === 'all' ? 'text-brand-600' : 'text-slate-400'} onClick={() => { setView('all'); setPage(0); void loadPage(0) }}>全部消息</button>
        </div>
        <button className="text-[11px] text-slate-400 active:text-brand-500" onClick={onClose}>关闭</button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {items === null && <div className="px-3 py-8 text-center text-xs text-slate-300">加载中…</div>}
        {items !== null && items.length === 0 && (
          <div className="px-3 py-8 text-center text-xs leading-relaxed text-slate-400">还没有消息</div>
        )}
        {items !== null && (view === 'all' ? items : items.slice(0, 5)).map((notice) => (
          <button
            key={notice.id}
            className={`flex w-full items-start gap-2 border-b border-slate-50 px-3 py-2.5 text-left last:border-0 active:bg-brand-50 ${notice.read_at ? 'bg-white' : 'bg-brand-50/70'}`}
            onClick={() => void openNotice(notice)}
          >
            <span className="text-base leading-5">{ICON[notice.type] ?? '🔔'}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className={`block min-w-0 flex-1 truncate text-xs font-medium ${notice.read_at ? 'text-slate-500' : 'text-slate-800'}`}>{notice.title}</span>
                {!notice.read_at && <span className="shrink-0 rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] leading-none text-white">未读</span>}
                {notice.read_at && <span className="shrink-0 text-[9px] text-slate-300">已读</span>}
              </span>
              {notice.body && <span className="mt-0.5 block truncate text-[11px] text-slate-400">{notice.body}</span>}
              <span className="mt-0.5 block text-[10px] text-slate-300">{timeCn(notice.created_at)}</span>
            </span>
          </button>
        ))}
      </div>

      {view === 'preview' && items && items.length > 5 && (
        <button className="border-t border-slate-100 py-2 text-xs text-brand-600" onClick={() => { setView('all'); setPage(0); void loadPage(0) }}>展开全部消息</button>
      )}
      {view === 'all' && items && items.length > 0 && (
        <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-xs">
          <button className="text-brand-600 disabled:text-slate-300" disabled={page === 0 || items === null} onClick={() => changePage(page - 1)}>上一页</button>
          <span className="text-slate-400">第 {page + 1} 页</span>
          <button className="text-brand-600 disabled:text-slate-300" disabled={!hasMore || items === null} onClick={() => changePage(page + 1)}>下一页</button>
        </div>
      )}
    </div>
  )
}
