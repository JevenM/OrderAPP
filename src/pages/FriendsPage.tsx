import { useState } from 'react'
import {
  acceptFriendRequest,
  dropFriendship,
  searchFriendByName,
  sendFriendRequest,
  setFriendNote,
} from '../lib/db'
import Avatar from '../components/Avatar'
import { useToast } from '../components/Toast'
import { useFriends } from '../store/friends'
import { useSession } from '../store/session'
import { useSettings } from '../store/settings'
import { timeCn } from '../lib/date'
import type { FriendSearchResult } from '../lib/types'

export default function FriendsPage() {
  const toast = useToast()
  const { isAdmin, role, memberId } = useSession()
  const { adminName, viewerAdminName } = useSettings()
  const { friends, incoming, outgoing, loading, reload } = useFriends()
  /** 管理员 自己的视角：默认和所有账户都是好友，不需要申请 */
  const adminView = isAdmin && role === 'me'

  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<FriendSearchResult | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})

  const noteOf = (f: { memberId: string; note: string }) => notes[f.memberId] ?? f.note

  const search = async () => {
    const c = q.trim()
    if (!c) return toast.show('输入对方的昵称', 'err')
    if (!memberId) return toast.show('你和所有人都是好友，不用再加啦～', 'err')
    setBusy(true)
    try {
      const r = await searchFriendByName(memberId, c, viewerAdminName || adminName)
      setResult(r)
      if (!r) toast.show('没找到这个昵称，检查一下输入哦', 'err')
    } catch (e) {
      toast.show((e as Error).message, 'err')
    } finally {
      setBusy(false)
    }
  }

  const addFriend = async (r: FriendSearchResult) => {
    if (!memberId || r.memberId === '__admin__') return
    setBusy(true)
    try {
      await sendFriendRequest(memberId, r.memberId)
      setResult({ ...r, relation: 'outgoing' })
      toast.show('申请已发送，等对方接受 🤝')
      reload()
    } catch (e) {
      toast.show((e as Error).message, 'err')
    } finally {
      setBusy(false)
    }
  }

  const accept = async (friendshipId: string | null, name: string) => {
    if (!friendshipId) return
    setBusy(true)
    try {
      await acceptFriendRequest(friendshipId)
      toast.show(`你和「${name}」成为好友啦 🎉`)
      setResult((r) => (r?.friendshipId === friendshipId ? { ...r, relation: 'accepted' } : r))
      reload()
    } catch (e) {
      toast.show((e as Error).message, 'err')
    } finally {
      setBusy(false)
    }
  }

  /** 拒绝申请 / 撤回申请 / 删除好友，都是删掉那一行关系 */
  const drop = async (friendshipId: string, what: string, confirmText: string) => {
    if (!window.confirm(confirmText)) return
    setBusy(true)
    try {
      await dropFriendship(friendshipId)
      toast.show(what)
      setResult((r) => (r?.friendshipId === friendshipId ? { ...r, relation: 'none', friendshipId: null } : r))
      reload()
    } catch (e) {
      toast.show((e as Error).message, 'err')
    } finally {
      setBusy(false)
    }
  }

  const saveNote = async (f: { memberId: string; note: string; name: string }) => {
    if (!memberId) return toast.show('管理视角不用设备注，直接改她的昵称就行', 'err')
    const next = noteOf(f)
    if (next === f.note) return
    setBusy(true)
    try {
      await setFriendNote(memberId, f.memberId, next)
      toast.show(next ? '备注已保存，只有你自己能看到' : '已清除备注')
      reload()
    } catch (e) {
      toast.show((e as Error).message, 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-600">好友（{friends.length} 位）</h2>
        <span className="text-[11px] text-slate-400">{adminView ? '你和所有人都是好友' : '好友可见'}</span>
      </div>

      {/* ---------- 搜昵称加好友 ---------- */}
      {!adminView && (
        <div className="card space-y-2">
          <h3 className="text-sm font-semibold">🔍 加好友</h3>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder="输入对方的昵称"
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setResult(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void search()
                }
              }}
            />
            <button className="btn-primary shrink-0 text-xs" disabled={busy} onClick={search}>
              {busy ? '查找中…' : '查找'}
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-400">
            输入对方的专属昵称搜索并发送申请，对方接受之后你们才能互相看到饭圈动态、点赞和评论。
          </p>

          {result && result.relation !== 'self' && (
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-2">
              <Avatar url={result.avatarUrl} emoji="👧" size={40} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{result.name}</div>
                <div className="text-[11px] text-slate-400">
                  {result.relation === 'accepted'
                    ? '已经是好友'
                    : result.relation === 'outgoing'
                      ? '申请已发出，等待接受'
                      : result.relation === 'incoming'
                        ? '对方也想加你为好友'
                        : '还不是好友'}
                </div>
              </div>
              {result.relation === 'none' && (
                <button className="btn-primary shrink-0 px-3 text-xs" disabled={busy} onClick={() => addFriend(result)}>
                  加好友
                </button>
              )}
              {result.relation === 'incoming' && result.friendshipId && (
                <button
                  className="btn-primary shrink-0 px-3 text-xs"
                  disabled={busy}
                  onClick={() => accept(result.friendshipId, result.name)}
                >
                  接受
                </button>
              )}
              {result.relation === 'outgoing' && result.friendshipId && (
                <button
                  className="btn-ghost shrink-0 px-3 text-xs"
                  disabled={busy}
                  onClick={() => drop(result.friendshipId!, '已撤回申请', '撤回这条好友申请？')}
                >
                  撤回
                </button>
              )}
              {result.relation === 'accepted' && result.friendshipId && (
                <button
                  className="btn-ghost shrink-0 px-3 text-xs"
                  disabled={busy}
                  onClick={() => drop(result.friendshipId!, '已删除好友', `删除好友「${result.name}」？之后你们互相看不到动态。`)}
                >
                  删除
                </button>
              )}
            </div>
          )}
          {result?.relation === 'self' && (
            <p className="rounded-xl bg-brand-50 px-3 py-2 text-[11px] text-brand-700">
              这是你自己的昵称～不能添加自己为好友哦。
            </p>
          )}
        </div>
      )}

      {/* ---------- 收到的申请 ---------- */}
      {!adminView && incoming.length > 0 && (
        <div className="card space-y-2">
          <h3 className="text-sm font-semibold">📨 好友申请（{incoming.length}）</h3>
          {incoming.map((r) => (
            <div key={r.friendshipId} className="flex items-center gap-3 rounded-xl bg-brand-50/60 p-2">
              <Avatar url={r.avatarUrl} emoji="👧" size={40} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{r.name}</div>
                <div className="text-[11px] text-slate-400">想加你为好友 · {timeCn(r.createdAt)}</div>
              </div>
              <button
                className="btn-primary shrink-0 px-3 text-xs"
                disabled={busy}
                onClick={() => accept(r.friendshipId, r.name)}
              >
                接受
              </button>
              <button
                className="btn-ghost shrink-0 px-3 text-xs"
                disabled={busy}
                onClick={() => drop(r.friendshipId, '已拒绝', `拒绝「${r.name}」的好友申请？`)}
              >
                拒绝
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ---------- 发出的申请 ---------- */}
      {!adminView && outgoing.length > 0 && (
        <div className="card space-y-2">
          <h3 className="text-sm font-semibold">⏳ 等待接受（{outgoing.length}）</h3>
          {outgoing.map((r) => (
            <div key={r.friendshipId} className="flex items-center gap-3 rounded-xl bg-slate-50 p-2">
              <Avatar url={r.avatarUrl} emoji="👧" size={40} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{r.name}</div>
                <div className="text-[11px] text-slate-400">已发送 · {timeCn(r.createdAt)}</div>
              </div>
              <button
                className="btn-ghost shrink-0 px-3 text-xs"
                disabled={busy}
                onClick={() => drop(r.friendshipId, '已撤回申请', '撤回这条好友申请？')}
              >
                撤回
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ---------- 好友列表 ---------- */}
      <div className="space-y-2">
        <h3 className="px-1 text-sm font-semibold text-slate-600">👫 好友列表</h3>
        {loading && friends.length === 0 && <p className="py-6 text-center text-sm text-slate-400">加载中…</p>}
        {!loading && friends.length === 0 && (
          <div className="card text-center text-xs leading-relaxed text-slate-400">
            还没有好友。
            <br />
            把你的昵称告诉朋友，或者在上面搜 TA 的昵称加好友，
            <br />
            对方接受后就能互相看到饭圈动态、点赞和评论啦。
          </div>
        )}

        {friends.map((f) => {
          const note = noteOf(f)
          const dirty = note !== f.note
          const isAdminFriend = f.memberId === '__admin__'
          return (
            <div key={f.memberId} className="card space-y-2">
              <div className="flex items-center gap-3">
                <Avatar url={f.avatarUrl} emoji={isAdminFriend ? '👨‍🍳' : '👧'} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{f.shownName}</div>
                  <div className="truncate text-[11px] text-slate-400">
                    {isAdminFriend ? '管理员 · 默认互为好友' : f.note ? `原昵称：${f.name}` : '好友'}
                  </div>
                </div>
                {!adminView && f.friendshipId && (
                  <button
                    className="shrink-0 text-xs text-slate-300"
                    disabled={busy}
                    onClick={() => drop(f.friendshipId, '已删除好友', `删除好友「${f.shownName}」？之后你们互相看不到动态。`)}
                  >
                    删除
                  </button>
                )}
              </div>

              {!adminView && f.friendshipId && (
                <div className="flex items-center gap-2">
                  <input
                    className="input flex-1 text-xs"
                    placeholder={`备注`}
                    value={note}
                    onChange={(e) => setNotes((n) => ({ ...n, [f.memberId]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void saveNote({ ...f, note })
                      }
                    }}
                  />
                  <button
                    className="btn-primary shrink-0 px-3 text-xs"
                    disabled={busy || !dirty}
                    onClick={() => saveNote({ ...f, note })}
                  >
                    备注
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* <p className="px-1 text-[11px] leading-relaxed text-slate-400">
        账户之间默认完全隔离：不是好友，动态、点赞、评论一条都看不到，也不能互动。
        <br />
        管理员 默认和所有账户都是好友，所以能看到所有人的动态。
      </p> */}
    </div>
  )
}
