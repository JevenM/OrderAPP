import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminRemoveFriendship, adminSetFriendship, listAllFriendships } from '../lib/db'
import { useToast } from '../components/Toast'
import { useMembers } from '../store/members'
import type { Friendship } from '../lib/types'

export default function AdminFriendships() {
  const toast = useToast()
  const { members, loading: membersLoading } = useMembers()
  const [relations, setRelations] = useState<Friendship[]>([])
  const [aId, setAId] = useState('')
  const [bId, setBId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setRelations(await listAllFriendships())
    } catch (e) {
      toast.show((e as Error).message, 'err')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void reload()
  }, [reload])

  const setFriend = async () => {
    if (!aId || !bId) return toast.show('请选择两位成员', 'err')
    if (aId === bId) return toast.show('请选择两位不同的成员', 'err')
    setBusy(true)
    try {
      await adminSetFriendship(aId, bId)
      toast.show('已设为好友，双方现在可以互相看到饭圈动态')
      await reload()
    } catch (e) {
      toast.show((e as Error).message, 'err')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (relation: Friendship) => {
    const a = memberById.get(relation.requester_id)?.name ?? '成员'
    const b = memberById.get(relation.addressee_id)?.name ?? '成员'
    if (!window.confirm(`解除「${a}」和「${b}」的好友关系？`)) return
    setBusy(true)
    try {
      await adminRemoveFriendship(relation.requester_id, relation.addressee_id)
      toast.show('已解除好友关系')
      await reload()
    } catch (e) {
      toast.show((e as Error).message, 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">👫 好友关系管理</h2>
          <span className="chip border-brand-200 bg-brand-50 text-brand-600">管理员</span>
        </div>
        <p className="text-xs leading-relaxed text-slate-400">指定两位成员成为好友后，双方可以互相看到饭圈动态并进入各自的互动空间。</p>
        <div className="grid grid-cols-2 gap-2">
          <select className="input" value={aId} onChange={(e) => setAId(e.target.value)}>
            <option value="">选择成员 A</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <select className="input" value={bId} onChange={(e) => setBId(e.target.value)}>
            <option value="">选择成员 B</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <button className="btn-primary w-full" disabled={busy || membersLoading} onClick={setFriend}>设为好友</button>
      </div>

      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">当前关系</h3>
          <span className="chip border-slate-200 bg-slate-50 text-slate-500">{relations.length} 条</span>
        </div>
        {loading && <p className="py-5 text-center text-sm text-slate-400">加载中…</p>}
        {!loading && relations.length === 0 && <p className="py-5 text-center text-sm text-slate-400">还没有成员好友关系</p>}
        {!loading && relations.map((relation) => {
          const a = memberById.get(relation.requester_id)?.name ?? '未知成员'
          const b = memberById.get(relation.addressee_id)?.name ?? '未知成员'
          return (
            <div key={relation.id} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
              <div className="min-w-0 flex-1 truncate text-sm text-slate-700">{a} <span className="text-brand-400">↔</span> {b}</div>
              <span className={`chip shrink-0 ${relation.status === 'accepted' ? 'border-emerald-200 bg-emerald-50 text-emerald-600' : 'border-amber-200 bg-amber-50 text-amber-600'}`}>
                {relation.status === 'accepted' ? '已是好友' : '待接受'}
              </span>
              <button className="shrink-0 text-xs text-rose-500" disabled={busy} onClick={() => remove(relation)}>解除</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
