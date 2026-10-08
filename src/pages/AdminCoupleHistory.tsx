import { useCallback, useEffect, useMemo, useState } from 'react'
import { exportCoupleQuizHistoryCsv, exportCoupleQuizHistoryJson, type CoupleQuizHistoryExportRow } from '../lib/export'
import { listAllCoupleQuizHistory, type CoupleQuizHistoryRow } from '../lib/db'
import { useToast } from '../components/Toast'
import { useMembers } from '../store/members'

export default function AdminCoupleHistory() {
  const toast = useToast()
  const { members, loading: membersLoading } = useMembers()
  const [rows, setRows] = useState<CoupleQuizHistoryRow[]>([])
  const [pair, setPair] = useState('all')
  const [status, setStatus] = useState<'all' | 'revealed' | 'answering'>('all')
  const [loading, setLoading] = useState(true)

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const pairs = useMemo(() => {
    const ids = new Set<string>()
    rows.forEach((row) => ids.add(`${row.member_a}|${row.member_b}`))
    return [...ids].map((key) => {
      const [a, b] = key.split('|')
      return { key, label: `${memberById.get(a)?.name ?? '未知成员'} ↔ ${memberById.get(b)?.name ?? '未知成员'}` }
    })
  }, [rows, memberById])
  const filtered = useMemo(
    () => rows.filter((row) => (pair === 'all' || `${row.member_a}|${row.member_b}` === pair) && (status === 'all' || row.status === status)),
    [rows, pair, status]
  )
  const exportRows = useMemo<CoupleQuizHistoryExportRow[]>(
    () => filtered.map((row) => ({
      ...row,
      member_a_name: memberById.get(row.member_a)?.name ?? '未知成员',
      member_b_name: memberById.get(row.member_b)?.name ?? '未知成员',
    })),
    [filtered, memberById]
  )

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await listAllCoupleQuizHistory())
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void reload()
  }, [reload])

  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">💞 情侣答题历史</h2>
            <p className="mt-1 text-xs text-slate-400">查看每对成员共同完成的同步抉择，支持导出当前筛选结果。</p>
          </div>
          <span className="chip shrink-0 border-brand-200 bg-brand-50 text-brand-600">管理员</span>
        </div>
        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
          <select className="input" value={pair} onChange={(e) => setPair(e.target.value)} disabled={membersLoading}>
            <option value="all">全部情侣对</option>
            {pairs.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="all">全部状态</option>
            <option value="revealed">已揭晓</option>
            <option value="answering">进行中</option>
          </select>
        </div>
        <div className="flex flex-col gap-2 min-[420px]:flex-row">
          <button className="btn-ghost flex-1" onClick={() => void reload()} disabled={loading}>刷新历史</button>
          <button className="btn-soft flex-1" onClick={() => exportCoupleQuizHistoryCsv(exportRows, '情侣答题历史.csv')} disabled={!exportRows.length}>导出 CSV</button>
          <button className="btn-soft flex-1" onClick={() => exportCoupleQuizHistoryJson(exportRows, '情侣答题历史.json')} disabled={!exportRows.length}>导出 JSON</button>
        </div>
      </section>

      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">答题记录</h3>
          <span className="chip border-slate-200 bg-slate-50 text-slate-500">{filtered.length} 条</span>
        </div>
        {loading && <p className="py-6 text-center text-sm text-slate-400">加载中…</p>}
        {!loading && !filtered.length && <p className="py-6 text-center text-sm text-slate-400">暂无符合条件的答题记录</p>}
        {!loading && filtered.map((row) => {
          const a = memberById.get(row.member_a)?.name ?? '未知成员'
          const b = memberById.get(row.member_b)?.name ?? '未知成员'
          return (
            <article key={row.id} className="space-y-2 rounded-2xl bg-slate-50 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="break-words text-sm font-semibold text-slate-700">{a} <span className="text-brand-400">↔</span> {b}</div>
                  <div className="mt-1 break-words text-xs text-slate-500">{row.question_title}</div>
                </div>
                <span className={`chip shrink-0 ${row.status === 'revealed' ? 'border-emerald-200 bg-emerald-50 text-emerald-600' : 'border-amber-200 bg-amber-50 text-amber-600'}`}>
                  {row.status === 'revealed' ? row.matched ? '相同答案' : '已揭晓' : '进行中'}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-1 text-xs text-slate-600 min-[420px]:grid-cols-2">
                <div className="break-words rounded-xl bg-white p-2">{a}：{row.choice_a ?? '未回答'}</div>
                <div className="break-words rounded-xl bg-white p-2">{b}：{row.choice_b ?? '未回答'}</div>
              </div>
              <div className="text-[11px] text-slate-400">{new Date(row.created_at).toLocaleString('zh-CN')}</div>
            </article>
          )
        })}
      </section>
    </div>
  )
}
