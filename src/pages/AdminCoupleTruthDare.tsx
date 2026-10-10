import { useCallback, useEffect, useMemo, useState } from 'react'
import { listAllCoupleTruthDare, listAllFriendships, type CoupleTruthDareRow } from '../lib/db'
import { useToast } from '../components/Toast'
import { useMembers } from '../store/members'

/** 管理员查看每对情侣玩过的真心话大冒险题目与答案 */
export default function AdminCoupleTruthDare() {
  const toast = useToast()
  const { members, loading: membersLoading } = useMembers()
  const [rows, setRows] = useState<CoupleTruthDareRow[]>([])
  const [friendshipPairs, setFriendshipPairs] = useState<{ key: string; label: string }[]>([])
  const [pair, setPair] = useState('all')
  const [type, setType] = useState<'all' | 'truth' | 'dare'>('all')
  const [loading, setLoading] = useState(true)

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const pairs = useMemo(() => {
    const byKey = new Map<string, string>()
    friendshipPairs.forEach((item) => byKey.set(item.key, item.label))
    rows.forEach((row) => {
      const key = `${row.member_a}|${row.member_b}`
      if (!byKey.has(key)) {
        byKey.set(key, `${memberById.get(row.member_a)?.name ?? '未知成员'} ↔ ${memberById.get(row.member_b)?.name ?? '未知成员'}`)
      }
    })
    return [...byKey].map(([key, label]) => ({ key, label }))
  }, [friendshipPairs, rows, memberById])
  const filtered = useMemo(
    () =>
      rows.filter(
        (row) => (pair === 'all' || `${row.member_a}|${row.member_b}` === pair) && (type === 'all' || row.type === type)
      ),
    [rows, pair, type]
  )

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [records, friendships] = await Promise.all([listAllCoupleTruthDare(), listAllFriendships()])
      setRows(records)
      setFriendshipPairs(
        friendships
          .filter((f) => f.status === 'accepted')
          .map((f) => {
            const [a, b] = [f.requester_id, f.addressee_id].sort()
            return {
              key: `${a}|${b}`,
              label: `${memberById.get(a)?.name ?? '未知成员'} ↔ ${memberById.get(b)?.name ?? '未知成员'}`,
            }
          })
      )
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setLoading(false)
    }
  }, [memberById, toast])

  useEffect(() => {
    void reload()
  }, [reload])

  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">🎲 真心话大冒险记录</h2>
            <p className="mt-1 text-xs text-slate-400">查看每对情侣玩过的真心话 / 大冒险题目和答案。</p>
          </div>
          <span className="chip shrink-0 border-brand-200 bg-brand-50 text-brand-600">管理员</span>
        </div>
        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
          <select className="input" value={pair} onChange={(e) => setPair(e.target.value)} disabled={membersLoading}>
            <option value="all">全部情侣对</option>
            {pairs.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
          <select className="input" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="all">全部类型</option>
            <option value="truth">真心话</option>
            <option value="dare">大冒险</option>
          </select>
        </div>
        <button className="btn-ghost w-full" onClick={() => void reload()} disabled={loading}>
          刷新记录
        </button>
      </section>

      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">游玩记录</h3>
          <span className="chip border-slate-200 bg-slate-50 text-slate-500">{filtered.length} 条</span>
        </div>
        {loading && <p className="py-6 text-center text-sm text-slate-400">加载中…</p>}
        {!loading && !filtered.length && <p className="py-6 text-center text-sm text-slate-400">暂无符合条件的记录</p>}
        {!loading &&
          filtered.map((row) => {
            const a = memberById.get(row.member_a)?.name ?? '未知成员'
            const b = memberById.get(row.member_b)?.name ?? '未知成员'
            const sender = memberById.get(row.sender_id)?.name ?? row.sender_name ?? '未知成员'
            return (
              <article key={row.id} className="space-y-2 rounded-2xl bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="break-words text-sm font-semibold text-slate-700">
                      {a} <span className="text-brand-400">↔</span> {b}
                    </div>
                    <div className="mt-1 break-words text-xs text-slate-500">{sender} 抽到的题目</div>
                  </div>
                  <span
                    className={`chip shrink-0 ${
                      row.type === 'truth' ? 'border-rose-200 bg-rose-50 text-rose-600' : 'border-orange-200 bg-orange-50 text-orange-600'
                    }`}
                  >
                    {row.type === 'truth' ? '真心话' : '大冒险'}
                  </span>
                </div>
                <div className="break-words rounded-xl bg-white p-2 text-xs text-slate-700">{row.prompt}</div>
                {row.type === 'truth' && (
                  <div className="break-words rounded-xl bg-rose-50 p-2 text-xs text-rose-700">
                    答案：{row.answer ?? '（还没作答）'}
                  </div>
                )}
                <div className="text-[11px] text-slate-400">{new Date(row.created_at).toLocaleString('zh-CN')}</div>
              </article>
            )
          })}
      </section>
    </div>
  )
}
