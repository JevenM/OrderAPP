import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listFeedNotifications, markFeedNotificationRead, markFeedNotificationsReadAll, type FeedNotificationRow } from '../lib/db'
import { timeCn } from '../lib/date'
import { useUnread, useUnreadBellCount } from '../store/unread'

const ICON: Record<string, string> = { post: '📸', like: '❤️', comment: '💬', reply: '↩️', quiz: '💞', truth: '🎲', together: '💕', chat: '💌', board: '🎯', mines: '💣', wufu: '♟️', love: '💌' }
const PAGE_SIZE = 10
const PREVIEW_SIZE = 5

type View = 'preview' | 'all'

export default function FeedNotifyPanel({ identity, onClose }: { identity: string; onClose: () => void }) {
  const navigate = useNavigate()
  const { refresh } = useUnread()
  const unread = useUnreadBellCount()
  const [items, setItems] = useState<FeedNotificationRow[] | null>(null)
  const [view, setView] = useState<View>('preview')
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [markingAll, setMarkingAll] = useState(false)

  /**
   * 统一分页加载入口：preview 视图取前 5 条（带 hasMore 用于判断「展开全部」）；
   * all 视图按 PAGE_SIZE 分页。修复了之前「切换到 all 时仍显示 preview 的 5 条、翻页不生效」的 bug。
   */
  const loadPage = useCallback(async (nextPage: number, targetView: View) => {
    setItems(null)
    try {
      if (targetView === 'preview') {
        // preview：拉 PREVIEW_SIZE+1 条用于判断是否还有更多
        const rows = await listFeedNotifications(identity, PREVIEW_SIZE + 1, 0)
        setHasMore(rows.length > PREVIEW_SIZE)
        setItems(rows.slice(0, PREVIEW_SIZE))
      } else {
        const rows = await listFeedNotifications(identity, PAGE_SIZE + 1, nextPage * PAGE_SIZE)
        setHasMore(rows.length > PAGE_SIZE)
        setItems(rows.slice(0, PAGE_SIZE))
      }
    } catch {
      setItems([])
      setHasMore(false)
    }
  }, [identity])

  const switchView = (targetView: View) => {
    setView(targetView)
    setPage(0)
    void loadPage(0, targetView)
  }

  /** 一键把当前身份所有未读消息全部标记已读，并消除铃铛角标 */
  const markAllRead = async () => {
    if (!unread || markingAll) return
    setMarkingAll(true)
    try {
      // 本地先把面板里的未读都标上已读，避免视觉抖动
      setItems((current) => current?.map((item) => (item.read_at ? item : { ...item, read_at: new Date().toISOString() })) ?? null)
      await markFeedNotificationsReadAll(identity)
      await refresh()
    } finally {
      setMarkingAll(false)
    }
  }

  useEffect(() => {
    void loadPage(0, 'preview')
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
    // 按通知类型跳转到对应页面，并带上定位参数：
    // quiz → 互动空间弹出抉择揭晓；truth/chat/board/mines → 互动空间直接打开对应模块；
    // 跳转带上 focus=1，模块打开后高亮 + 滚动定位，提示用户「要看的是这里」；
    // post / like / comment / reply → 饭圈定位到对应动态并高亮
    if (notice.type === 'quiz') {
      navigate(`/couple${notice.post_id ? `?quiz=${encodeURIComponent(notice.post_id)}` : ''}`)
    } else if (notice.type === 'truth') {
      navigate('/couple?module=truth&focus=1')
    } else if (notice.type === 'chat') {
      navigate('/couple?module=chat&focus=1')
    } else if (notice.type === 'board') {
      navigate('/couple?module=board&focus=1')
    } else if (notice.type === 'mines') {
      navigate('/couple?module=mines&focus=1')
    } else if (notice.type === 'wufu') {
      navigate('/couple?module=wufu&focus=1')
    } else if (notice.type === 'gomoku') {
      navigate('/couple?module=gomoku&focus=1')
    } else if (notice.type === 'watermelon') {
      navigate('/couple?module=watermelon&focus=1')
    } else if (notice.type === 'love') {
      navigate('/couple?module=love&focus=1')
    } else if (notice.type === 'together') {
      // 同在检测的入口 💕 就在顶栏，任何页面都有，留在当前页即可
    } else {
      navigate(`/feed${notice.post_id ? `?post=${encodeURIComponent(notice.post_id)}` : ''}`)
    }
  }

  return (
    <div className="absolute right-3 top-full z-40 mt-1.5 flex max-h-[75vh] w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <div className="flex gap-3 text-xs font-semibold">
          <button className={view === 'preview' ? 'text-brand-600' : 'text-slate-400'} onClick={() => switchView('preview')}>最近消息</button>
          <button className={view === 'all' ? 'text-brand-600' : 'text-slate-400'} onClick={() => switchView('all')}>全部消息</button>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="text-[11px] text-brand-500 active:text-brand-600 disabled:text-slate-300"
            disabled={!unread || markingAll}
            onClick={() => void markAllRead()}
          >
            {markingAll ? '标记中…' : '全部已读'}
          </button>
          <button className="text-[11px] text-slate-400 active:text-brand-500" onClick={onClose}>关闭</button>
        </div>
      </div>

      <div className="touch-scroll min-h-0 flex-1 overflow-y-auto">
        {items === null && <div className="px-3 py-8 text-center text-xs text-slate-300">加载中…</div>}
        {items !== null && items.length === 0 && (
          <div className="px-3 py-8 text-center text-xs leading-relaxed text-slate-400">还没有消息</div>
        )}
        {items !== null && items.map((notice) => (
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

      {view === 'preview' && hasMore && (
        <button className="border-t border-slate-100 py-2 text-xs text-brand-600" onClick={() => switchView('all')}>展开全部消息</button>
      )}
      {view === 'all' && items !== null && items.length > 0 && (
        <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-xs">
          <button className="text-brand-600 disabled:text-slate-300" disabled={page === 0} onClick={() => { const p = page - 1; setPage(p); void loadPage(p, 'all') }}>上一页</button>
          <span className="text-slate-400">第 {page + 1} 页</span>
          <button className="text-brand-600 disabled:text-slate-300" disabled={!hasMore} onClick={() => { const p = page + 1; setPage(p); void loadPage(p, 'all') }}>下一页</button>
        </div>
      )}
    </div>
  )
}
