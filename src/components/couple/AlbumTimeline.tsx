import { useCallback, useEffect, useMemo, useState } from 'react'
import { listAlbumPosts } from '../../lib/db'
import { albumDayIndex, groupAlbumByMonth } from '../../lib/keepsake'
import type { Post } from '../../lib/types'
import { EmptyState, SkeletonList } from '../States'
import { Modal } from '../Modal'
import { useToast } from '../Toast'

type Props = {
  isAdmin: boolean
  memberId: string | null
  friendIds: string[]
  myName: string
  friendName: string
}

const dateCn = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`
}

/** C3 共同相册时间轴：把饭圈里带照片的动态串成「我们的第 N 天」 */
export default function AlbumTimeline({ isAdmin, memberId, friendIds, myName, friendName }: Props) {
  const toast = useToast()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState<number | null>(null)
  const [focus, setFocus] = useState<Post | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await listAlbumPosts({ isAdmin, memberId, friendIds })
      setPosts(rows)
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setLoading(false)
    }
  }, [isAdmin, memberId, friendIds, toast])
  // friendIds 是父级每次渲染新建的数组，用字符串化后的稳定值做依赖，避免反复打网络
  const friendKey = friendIds.join(',')

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, memberId, friendKey])

  const years = useMemo(() => [...new Set(posts.map((p) => new Date(p.created_at).getFullYear()))].sort((a, b) => b - a), [posts])
  const shown = useMemo(() => (year ? posts.filter((p) => new Date(p.created_at).getFullYear() === year) : posts), [posts, year])
  const groups = useMemo(() => groupAlbumByMonth(shown), [shown])
  const firstAt = posts.length ? posts[posts.length - 1].created_at : ''
  const totalDays = useMemo(() => new Set(posts.map((p) => p.created_at.slice(0, 10))).size, [posts])

  return (
    <section id="couple-active-module" className="card space-y-4">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">🖼️ 共同相册</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            把发过照片的动态按时间串起来，看看「我们的第 N 天」都留下了什么。
          </p>
        </div>
        <button type="button" className="btn-ghost shrink-0 px-2 py-1 text-[11px]" disabled={loading} onClick={() => void load()}>↻ 刷新</button>
      </div>

      {posts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-rose-50/60 p-2.5 text-[11px] text-rose-700">
          <span>📷 {posts.length} 张照片</span>
          <span className="text-rose-300">·</span>
          <span>🗓️ 记录了 {totalDays} 天</span>
          {firstAt && (
            <>
              <span className="text-rose-300">·</span>
              <span>从 {dateCn(firstAt)} 开始</span>
            </>
          )}
        </div>
      )}

      {years.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className={`rounded-full px-3 py-1 text-[11px] transition ${year === null ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-500'}`}
            onClick={() => setYear(null)}
          >
            全部
          </button>
          {years.map((y) => (
            <button
              key={y}
              type="button"
              className={`rounded-full px-3 py-1 text-[11px] transition ${year === y ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-500'}`}
              onClick={() => setYear(y)}
            >
              {y} 年
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <SkeletonList rows={4} />
      ) : groups.length === 0 ? (
        <EmptyState
          icon="🖼️"
          title={posts.length ? '这一年还没有照片' : '相册还空空的'}
          hint={posts.length ? '换个年份看看' : '在「饭圈」发一条带照片的动态，这里就会自动收进来'}
        />
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.month} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="h-px flex-1 bg-slate-100" />
                <h4 className="shrink-0 text-xs font-semibold text-slate-500">{group.label} · {group.posts.length} 张</h4>
                <span className="h-px flex-1 bg-slate-100" />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {group.posts.map((post) => {
                  const day = firstAt ? albumDayIndex(post.created_at, firstAt) : 1
                  return (
                    <button
                      key={post.id}
                      type="button"
                      className="group relative aspect-square overflow-hidden rounded-xl bg-slate-100 text-left"
                      onClick={() => setFocus(post)}
                    >
                      <img
                        src={post.photo_url}
                        alt={post.content || '共同相册照片'}
                        loading="lazy"
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                      <span className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-900/70 to-transparent px-2 pb-1.5 pt-5 text-[10px] text-white">
                        第 {day} 天 · {new Date(post.created_at).getMonth() + 1}/{new Date(post.created_at).getDate()}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!focus} onClose={() => setFocus(null)} title={focus ? `我们的第 ${firstAt ? albumDayIndex(focus.created_at, firstAt) : 1} 天` : ''}>
        {focus && (
          <div className="space-y-3 px-4 py-4">
            <img src={focus.photo_url} alt={focus.content || '照片'} className="max-h-[55vh] w-full rounded-xl object-contain" />
            {focus.content && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-600">{focus.content}</p>}
            <p className="text-[11px] text-slate-400">
              {dateCn(focus.created_at)} · {focus.author === 'me' ? myName : friendName}
              {focus.meal_slot ? ` · ${focus.meal_slot === 'breakfast' ? '早餐' : focus.meal_slot === 'lunch' ? '午餐' : focus.meal_slot === 'dinner' ? '晚餐' : '加餐'}` : ''}
            </p>
          </div>
        )}
      </Modal>
    </section>
  )
}
