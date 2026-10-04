import { useCallback, useEffect, useState } from 'react'
import { addComment, createPost, listPosts, removeComment, removePost, toggleLike, uploadMealPhoto } from '../lib/db'
import { sizeText } from '../lib/image'
import { useToast } from '../components/Toast'
import { useRealtime } from '../lib/realtime'
import { timeCn } from '../lib/date'
import { useSession } from '../store/session'
import { useMembers } from '../store/members'
import { useSettings } from '../store/settings'
import { SLOT_LABEL, type PostComment, type PostWithMeta } from '../lib/types'

/** 某条动态正在针对性回复谁（postId → 目标成员） */
type ReplyTarget = Record<string, { id: string | null; label: string }>

export default function FeedPage() {
  const toast = useToast()
  const { isAdmin, role, memberId, memberName } = useSession()
  const { members } = useMembers()
  const { viewerAdminName } = useSettings()
  const [posts, setPosts] = useState<PostWithMeta[]>([])
  const [draft, setDraft] = useState({ content: '', photo_url: '' })
  const [posting, setPosting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [comments, setComments] = useState<Record<string, string>>({})
  const [replyTarget, setReplyTarget] = useState<ReplyTarget>({})

  // 我发的动态 / 点赞 / 评论都记 member_id = null；她用她自己的 member id
  const meKey = isAdmin ? null : memberId

  /**
   * 我切到某个她的视角时，饭圈也要跟着她的身份走：
   * 只看「我发的 + 她发的」动态、「我的 + 她的」点赞评论，别的她的内容不出现。
   */
  const asMemberView = isAdmin && role === 'her'
  const feedIsAdmin = isAdmin && !asMemberView

  const load = useCallback(async () => {
    try {
      setPosts(await listPosts({ isAdmin: feedIsAdmin, memberId, includeSelf: true }))
    } catch (e) {
      toast.show((e as Error).message, 'err')
    }
  }, [feedIsAdmin, memberId, toast])

  useEffect(() => {
    void load()
  }, [load])

  useRealtime(
    'feed',
    [
      { table: 'posts', on: () => void load() },
      { table: 'post_likes', on: () => void load() },
      { table: 'post_comments', on: () => void load() },
    ],
    { onPoll: () => void load() }
  )

  /**
   * 昵称显示：我发的 → 当前视图眼里我叫什么（可在「成员」页按人单独设置，没单独设置就用统一昵称）；
   * 她本人 → 她自己的昵称（登录态里有，不依赖成员列表）；
   * 其他人 → 成员表里的昵称（她看不到别人，所以只有我能用到这条分支）
   */
  const nameOf = (id: string | null): string => {
    if (!id) return viewerAdminName
    if (id === memberId && memberName) return memberName
    return members.find((m) => m.id === id)?.name ?? '她'
  }

  const likedByViewer = (p: PostWithMeta) =>
    isAdmin ? p.likes.some((l) => l.member_id === null) : p.likes.some((l) => l.member_id === memberId)

  const canDeletePost = (p: PostWithMeta) => isAdmin || (!!memberId && p.member_id === memberId)

  const canDeleteComment = (memberIdOfComment: string | null) =>
    isAdmin ? true : !!memberId && memberIdOfComment === memberId

  const publish = async () => {
    if (!draft.content.trim() && !draft.photo_url) return toast.show('写点什么或传张图吧～', 'err')
    setPosting(true)
    try {
      // 她发的动态带上她自己的 member_id，只有她自己和我能看到；我发的对所有人公开
      await createPost({
        author: isAdmin ? 'me' : 'her',
        member_id: meKey,
        content: draft.content,
        photo_url: draft.photo_url,
      })
      setDraft({ content: '', photo_url: '' })
      toast.show(isAdmin ? '已发布' : '发布成功 ❤️')
      await load()
    } catch (e) {
      toast.show((e as Error).message, 'err')
    } finally {
      setPosting(false)
    }
  }

  const pickPhoto = async (file: File) => {
    setUploading(true)
    try {
      const photo = await uploadMealPhoto(file)
      setDraft((d) => ({ ...d, photo_url: photo.url }))
      toast.show(`图片已上传（${sizeText(photo.originalSize)} → ${sizeText(photo.size)}）`)
    } catch (e) {
      toast.show((e as Error).message, 'err')
    } finally {
      setUploading(false)
    }
  }

  const like = async (p: PostWithMeta) => {
    try {
      await toggleLike(p.id, meKey)
      await load()
    } catch (e) {
      toast.show((e as Error).message, 'err')
    }
  }

  /** 点某条评论的「回复」：默认回复这条评论的主人；这条评论是我发的就回复动态的主人 */
  const startReply = (p: PostWithMeta, c: PostComment) => {
    const targetId = c.member_id ?? p.member_id ?? null
    setReplyTarget((t) => ({ ...t, [p.id]: { id: targetId, label: targetId ? nameOf(targetId) : '' } }))
  }

  const cancelReply = (postId: string) => setReplyTarget((t) => ({ ...t, [postId]: { id: null, label: '' } }))

  const send = async (p: PostWithMeta) => {
    const text = (comments[p.id] ?? '').trim()
    if (!text) return
    const target = replyTarget[p.id]
    try {
      // 针对性回复：填了目标成员就只有她能看到；没目标就是公开评论
      await addComment(p.id, meKey, text, target?.id ?? null)
      setComments((c) => ({ ...c, [p.id]: '' }))
      cancelReply(p.id)
      toast.show(target?.id ? `已回复 ${target.label}，只有她能看到 🔒` : '已评论')
      await load()
    } catch (e) {
      toast.show((e as Error).message, 'err')
    }
  }

  const dropPost = async (p: PostWithMeta) => {
    if (!confirm('删除这条动态？下面的点赞和评论也会一起删掉。')) return
    try {
      await removePost(p.id)
      toast.show('已删除')
      await load()
    } catch (e) {
      toast.show((e as Error).message, 'err')
    }
  }

  const dropComment = async (id: string) => {
    try {
      await removeComment(id)
      await load()
    } catch (e) {
      toast.show((e as Error).message, 'err')
    }
  }

  // 我和每个她都能发动态；我切到某个她的视角时不显示（避免发出去的东西和她自己看到的不一样）
  const showComposer = isAdmin ? role === 'me' : true

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-600">饭圈（{posts.length} 条）</h2>
        <span className="text-[11px] text-slate-400">
          {isAdmin
            ? '你能看到所有人的动态、点赞和评论'
            : '你发的动态他也能看到哦~'}
        </span>
      </div>

      {showComposer && (
        <div className="card space-y-2 border-brand-200">
          <textarea
            className="input min-h-[64px]"
            placeholder={
              isAdmin ? '今天想发点什么？（比如：今天做了糖醋排骨）' : '今天想发点什么？'
            }
            value={draft.content}
            onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
          />
          <div className="flex items-center gap-2">
            {draft.photo_url ? (
              <img src={draft.photo_url} alt="配图" className="h-16 w-16 rounded-lg object-cover" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-slate-50 text-xl">📷</div>
            )}
            <label className="btn-soft cursor-pointer text-xs">
              {uploading ? '上传中…' : draft.photo_url ? '换张图' : '上传照片'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void pickPhoto(file)
                  e.target.value = ''
                }}
              />
            </label>
            {draft.photo_url && (
              <button className="text-xs text-slate-400" onClick={() => setDraft((d) => ({ ...d, photo_url: '' }))}>
                移除
              </button>
            )}
          </div>
          {!isAdmin && (
            <p className="text-[11px] text-brand-600">
              🔒 对他可见
            </p>
          )}
          <button className="btn-primary w-full" disabled={posting} onClick={publish}>
            {posting ? '发布中…' : '发布到饭圈'}
          </button>
        </div>
      )}

      {!showComposer && (
        <p className="rounded-xl bg-brand-50 px-3 py-2 text-[11px] text-brand-700">
          🍚 每天记录三餐后会自动发到这里（可带照片），在下面点赞和评论～
        </p>
      )}
      {showComposer && (
        <p className="px-1 text-[11px] text-slate-400">
          🍚 记录三餐时会自动发一条到这里，也可以在这里手动发（可带照片）
        </p>
      )}

      {posts.length === 0 && <p className="py-10 text-center text-sm text-slate-400">还没有动态，先去记一笔三餐吧～</p>}

      {posts.map((p) => {
        const liked = likedByViewer(p)
        const isMine = p.author === 'me'
        const target = replyTarget[p.id]
        return (
          <div key={p.id} className="card space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">{isMine ? '👨‍🍳' : '👧'}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{nameOf(p.member_id)}</div>
                <div className="text-[11px] text-slate-400">
                  {timeCn(p.created_at)}
                  {p.meal_slot ? ` · ${SLOT_LABEL[p.meal_slot]}` : ''}
                  {p.day ? ` · ${p.day}` : ''}
                </div>
              </div>
              {canDeletePost(p) && (
                <button className="text-xs text-slate-300" onClick={() => dropPost(p)}>
                  删除
                </button>
              )}
            </div>

            {p.content && <p className="whitespace-pre-wrap text-sm">{p.content}</p>}

            {p.photo_url && (
              <img src={p.photo_url} alt="饭圈配图" className="max-h-72 w-full rounded-xl object-cover" />
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                className={`text-sm transition active:scale-95 ${liked ? 'text-rose-500' : 'text-slate-400'}`}
                onClick={() => like(p)}
              >
                {liked ? '❤️' : '🤍'} {p.likes.length}
              </button>
              <span className="text-xs text-slate-400">💬 {p.comments.length}</span>
            </div>

            {p.comments.length > 0 && (
              <div className="space-y-1 rounded-xl bg-slate-50 p-2">
                {p.comments.map((c) => (
                  <div key={c.id} className="flex items-start gap-2 text-xs">
                    <span className="min-w-0 flex-1">
                      {c.reply_to && (
                        <span className="mr-1 rounded bg-brand-50 px-1 text-[10px] text-brand-600">
                          {isAdmin ? `🔒 仅${nameOf(c.reply_to)}可见` : '🔒'}
                        </span>
                      )}
                      <span className="font-medium text-slate-600">{nameOf(c.member_id)}：</span>
                      <span className="text-slate-700">{c.content}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {isAdmin && (
                        <button className="text-slate-300" onClick={() => startReply(p, c)}>
                          回复
                        </button>
                      )}
                      {canDeleteComment(c.member_id) && (
                        <button className="text-slate-300" onClick={() => dropComment(c.id)}>
                          删除
                        </button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {target?.id && (
              <div className="flex items-center gap-2 rounded-lg bg-brand-50 px-2 py-1 text-[11px] text-brand-700">
                🔒 正在回复 {target.label}，只有她能看到
                <button className="ml-auto text-brand-400" onClick={() => cancelReply(p.id)}>
                  取消
                </button>
              </div>
            )}

            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder={target?.id ? `回复 ${target.label}…` : '说点什么…'}
                value={comments[p.id] ?? ''}
                onChange={(e) => setComments((c) => ({ ...c, [p.id]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void send(p)
                  }
                }}
              />
              <button className="btn-soft shrink-0 px-3 text-xs" onClick={() => send(p)}>
                发送
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
