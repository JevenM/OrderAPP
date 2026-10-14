import { useCallback, useEffect, useMemo, useState } from 'react'
import Avatar from '../components/Avatar'
import { useToast } from '../components/Toast'
import { deletePosts, listPostsAdmin, removeComment, updatePostContent } from '../lib/db'
import { exportTableCsv, exportTableJson } from '../lib/export'
import { SLOT_LABEL, type PostWithMeta } from '../lib/types'
import { todayStr } from '../lib/date'
import { useMembers } from '../store/members'

/** 管理员饭圈动态管理：按日期范围 / 成员 / 关键词筛选，支持查看、编辑、删除与批量删除、导出 */
export default function AdminFeed() {
  const toast = useToast()
  const { members, loading: membersLoading } = useMembers()
  const [rows, setRows] = useState<PostWithMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)

  /* 筛选条件 */
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [memberFilter, setMemberFilter] = useState('')
  const [keyword, setKeyword] = useState('')

  /* 多选删除 */
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  /* 行内编辑 */
  const [editId, setEditId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [saving, setSaving] = useState(false)

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const nameOf = useCallback(
    (id: string | null) => (id === null ? '我（管理员）' : memberById.get(id)?.name ?? '未知成员'),
    [memberById]
  )

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await listPostsAdmin({ from: from || undefined, to: to || undefined, memberId: memberFilter || undefined, keyword }))
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setLoading(false)
    }
  }, [from, to, memberFilter, keyword, toast])

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totalLikes = useMemo(() => rows.reduce((sum, row) => sum + row.likes.length, 0), [rows])
  const totalComments = useMemo(() => rows.reduce((sum, row) => sum + row.comments.length, 0), [rows])

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleSelectAll = () =>
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((row) => row.id))))

  const removeSelected = async () => {
    if (!selected.size) return
    if (!window.confirm(`确定删除选中的 ${selected.size} 条动态？其点赞与评论会一并删除，不可恢复。`)) return
    setDeleting(true)
    try {
      await deletePosts([...selected])
      toast.show(`已删除 ${selected.size} 条动态`)
      setSelected(new Set())
      await reload()
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setDeleting(false)
    }
  }

  const dropOne = async (id: string) => {
    if (!window.confirm('确定删除这条动态？其点赞与评论会一并删除。')) return
    try {
      await deletePosts([id])
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      setRows((prev) => prev.filter((row) => row.id !== id))
      toast.show('已删除')
    } catch (error) {
      toast.show((error as Error).message, 'err')
    }
  }

  const saveEdit = async (id: string) => {
    if (!editText.trim()) return toast.show('动态内容不能为空', 'err')
    setSaving(true)
    try {
      await updatePostContent(id, editText)
      setRows((prev) => prev.map((row) => (row.id === id ? { ...row, content: editText.trim() } : row)))
      setEditId(null)
      toast.show('动态内容已更新')
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setSaving(false)
    }
  }

  const dropComment = async (id: string) => {
    if (!window.confirm('确定删除这条评论？')) return
    try {
      await removeComment(id)
      setRows((prev) => prev.map((row) => ({ ...row, comments: row.comments.filter((c) => c.id !== id) })))
      toast.show('评论已删除')
    } catch (error) {
      toast.show((error as Error).message, 'err')
    }
  }

  const applyPreset = (days: number) => {
    const end = todayStr()
    const start = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10)
    setFrom(start)
    setTo(end)
  }

  const exportCsv = () =>
    exportTableCsv(
      `饭圈动态-${from || '全部'}_${to || '全部'}.csv`,
      ['发布时间', '作者', '内容', '餐次', '关联日期', '配图', '点赞数', '评论数'],
      rows.map((row) => [
        new Date(row.created_at).toLocaleString('zh-CN'),
        nameOf(row.member_id),
        row.content,
        row.meal_slot ? SLOT_LABEL[row.meal_slot] : '',
        row.day ?? '',
        row.photo_url || '',
        row.likes.length,
        row.comments.length,
      ])
    )

  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-semibold">📸 饭圈动态管理</h2>
            <p className="mt-1 text-xs text-slate-400">按日期范围、成员或关键词筛选所有人的动态，可查看、编辑、删除与导出。</p>
          </div>
          <span className="chip shrink-0 border-brand-200 bg-brand-50 text-brand-600">管理员</span>
        </div>

        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
          <label className="text-xs text-slate-500">
            开始日期
            <input type="date" className="input mt-1" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="text-xs text-slate-500">
            结束日期
            <input type="date" className="input mt-1" value={to} min={from || undefined} max={todayStr()} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="text-xs text-slate-500">
            成员
            <select className="input mt-1" value={memberFilter} onChange={(e) => setMemberFilter(e.target.value)} disabled={membersLoading}>
              <option value="">全部成员</option>
              <option value="me">我（管理员）</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500">
            内容关键词
            <input className="input mt-1" value={keyword} placeholder="搜索动态文字" onChange={(e) => setKeyword(e.target.value)} />
          </label>
        </div>

        <div className="flex flex-wrap gap-2 text-[11px]">
          <button className="btn-ghost px-2 py-1" onClick={() => applyPreset(7)}>近 7 天</button>
          <button className="btn-ghost px-2 py-1" onClick={() => applyPreset(30)}>近 30 天</button>
          <button className="btn-ghost px-2 py-1" onClick={() => applyPreset(90)}>近 90 天</button>
          <button
            className="btn-ghost px-2 py-1"
            onClick={() => {
              setFrom('')
              setTo('')
              setMemberFilter('')
              setKeyword('')
            }}
          >
            清空条件
          </button>
        </div>

        <div className="flex flex-col gap-2 min-[420px]:flex-row">
          <button className="btn-soft flex-1" onClick={() => void reload()} disabled={loading}>
            {loading ? '加载中…' : '按条件查询'}
          </button>
          <button className="btn-soft flex-1" onClick={exportCsv} disabled={!rows.length}>导出 CSV</button>
          <button className="btn-soft flex-1" onClick={() => exportTableJson(`饭圈动态-${todayStr()}.json`, rows)} disabled={!rows.length}>
            导出 JSON
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            className={`flex-1 rounded-xl border px-3 py-2 text-xs font-semibold ${selectMode ? 'border-brand-400 bg-brand-50 text-brand-600' : 'border-slate-200 text-slate-500'}`}
            onClick={() => {
              setSelectMode((prev) => !prev)
              setSelected(new Set())
            }}
          >
            {selectMode ? '✓ 管理（多选删除）中' : '☑️ 管理（多选删除）'}
          </button>
          {selectMode && (
            <>
              <button className="btn-ghost px-2 py-1 text-xs" onClick={toggleSelectAll}>
                {selected.size === rows.length && rows.length ? '取消全选' : '全选'}
              </button>
              <button className="btn-ghost px-2 py-1 text-xs text-rose-500" disabled={!selected.size || deleting} onClick={() => void removeSelected()}>
                {deleting ? '删除中…' : `🗑 删除选中(${selected.size})`}
              </button>
            </>
          )}
        </div>
      </section>

      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">动态列表</h3>
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            <span className="chip border-slate-200 bg-slate-50 text-slate-500">{rows.length} 条动态</span>
            <span className="chip border-rose-200 bg-rose-50 text-rose-500">{totalLikes} 赞</span>
            <span className="chip border-sky-200 bg-sky-50 text-sky-600">{totalComments} 评论</span>
          </div>
        </div>

        {loading && <p className="py-6 text-center text-sm text-slate-400">加载中…</p>}
        {!loading && !rows.length && <p className="py-6 text-center text-sm text-slate-400">暂无符合条件的动态</p>}

        {!loading &&
          rows.map((post) => {
            const name = nameOf(post.member_id)
            return (
              <article
                key={post.id}
                className={`space-y-2 rounded-2xl border bg-white p-3 ${selected.has(post.id) ? 'border-brand-400 ring-2 ring-brand-300' : 'border-slate-200'}`}
              >
                <div className="flex items-start gap-2">
                  {selectMode && (
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 shrink-0 accent-brand-500"
                      checked={selected.has(post.id)}
                      onChange={() => toggleSelect(post.id)}
                    />
                  )}
                  <Avatar url={members.find((m) => m.id === post.member_id)?.avatar_url ?? ''} emoji={post.member_id ? '👧' : '👨‍🍳'} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="font-semibold text-slate-700">{name}</span>
                      {post.meal_slot && <span className="chip border-amber-200 bg-amber-50 text-[10px] text-amber-600">{SLOT_LABEL[post.meal_slot]}</span>}
                      <span className="text-[11px] text-slate-400">{new Date(post.created_at).toLocaleString('zh-CN')}</span>
                    </div>
                    {editId === post.id ? (
                      <div className="mt-2 space-y-2">
                        <textarea className="input min-h-[64px] resize-y text-xs" maxLength={500} value={editText} onChange={(e) => setEditText(e.target.value)} />
                        <div className="flex gap-2">
                          <button className="btn-primary px-3 py-1 text-xs" disabled={saving} onClick={() => void saveEdit(post.id)}>保存</button>
                          <button className="btn-ghost px-3 py-1 text-xs" onClick={() => setEditId(null)}>取消</button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-1 break-words text-sm text-slate-700">{post.content}</p>
                    )}
                    {post.photo_url && (
                      <img src={post.photo_url} alt="动态配图" className="mt-2 max-h-40 w-full rounded-xl object-cover" loading="lazy" />
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    {editId !== post.id && (
                      <button
                        className="btn-ghost px-2 py-1 text-[11px]"
                        onClick={() => {
                          setEditId(post.id)
                          setEditText(post.content)
                        }}
                      >
                        编辑
                      </button>
                    )}
                    <button className="btn-ghost px-2 py-1 text-[11px] text-rose-500" onClick={() => void dropOne(post.id)}>删除</button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pl-1 text-[11px] text-slate-500">
                  <span className="chip border-slate-200 bg-slate-50">❤️ {post.likes.length}</span>
                  <span className="chip border-slate-200 bg-slate-50">💬 {post.comments.length}</span>
                  {post.likes.slice(0, 6).map((like) => (
                    <span key={like.id} className="text-slate-400">{nameOf(like.member_id)}</span>
                  ))}
                </div>

                {!!post.comments.length && (
                  <div className="space-y-1 rounded-xl bg-slate-50 p-2">
                    {post.comments.map((comment) => (
                      <div key={comment.id} className="flex items-start justify-between gap-2 text-[11px]">
                        <span className="min-w-0 flex-1 break-words text-slate-600">
                          <span className="font-semibold text-slate-700">{nameOf(comment.member_id)}</span>
                          {comment.reply_to && <span className="ml-1 text-slate-400">回复 {nameOf(comment.reply_to)}</span>}：{comment.content}
                          <span className="ml-1 text-slate-400">{new Date(comment.created_at).toLocaleString('zh-CN')}</span>
                        </span>
                        <button className="shrink-0 text-rose-500" onClick={() => void dropComment(comment.id)}>删除</button>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            )
          })}
      </section>
    </div>
  )
}
