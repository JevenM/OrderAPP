import { useCallback, useEffect, useMemo, useState } from 'react'
import { exportCoupleWishesCsv, exportCoupleWishesJson, type CoupleWishExportRow } from '../lib/export'
import { listAllCoupleWishes, updateCoupleWish, type CoupleWish } from '../lib/db'
import { useToast } from '../components/Toast'
import { useMembers } from '../store/members'

export default function AdminCoupleWishes() {
  const toast = useToast()
  const { members, loading: membersLoading } = useMembers()
  const [rows, setRows] = useState<CoupleWish[]>([])
  const [pair, setPair] = useState('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members])
  const pairs = useMemo(() => {
    const map = new Map<string, string>()
    rows.forEach((wish) => map.set(`${wish.member_a}|${wish.member_b}`, `${memberById.get(wish.member_a)?.name ?? '未知成员'} ↔ ${memberById.get(wish.member_b)?.name ?? '未知成员'}`))
    return [...map].map(([key, label]) => ({ key, label }))
  }, [rows, memberById])
  const filtered = useMemo(() => rows.filter((wish) => pair === 'all' || `${wish.member_a}|${wish.member_b}` === pair), [rows, pair])
  const exportRows = useMemo<CoupleWishExportRow[]>(() => filtered.map((wish) => ({
    ...wish,
    member_a_name: memberById.get(wish.member_a)?.name ?? '未知成员',
    member_b_name: memberById.get(wish.member_b)?.name ?? '未知成员',
  })), [filtered, memberById])

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await listAllCoupleWishes())
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void reload()
  }, [reload])

  const save = async (wish: CoupleWish) => {
    setSaving(true)
    try {
      await updateCoupleWish(wish.id, editText)
      setRows((current) => current.map((row) => row.id === wish.id ? { ...row, text: editText.trim() } : row))
      setEditingId(null)
      toast.show('秘密心愿已更新')
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">🔐 情侣秘密心愿</h2>
            <p className="mt-1 text-xs text-slate-400">按好友对查看、编辑并导出心愿内容。</p>
          </div>
          <span className="chip shrink-0 border-brand-200 bg-brand-50 text-brand-600">管理员</span>
        </div>
        <select className="input" value={pair} onChange={(event) => setPair(event.target.value)} disabled={membersLoading}>
          <option value="all">全部情侣对</option>
          {pairs.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select>
        <div className="flex flex-col gap-2 min-[420px]:flex-row">
          <button className="btn-ghost flex-1" onClick={() => void reload()} disabled={loading}>刷新心愿</button>
          <button className="btn-soft flex-1" onClick={() => exportCoupleWishesCsv(exportRows, '情侣秘密心愿.csv')} disabled={!exportRows.length}>导出 CSV</button>
          <button className="btn-soft flex-1" onClick={() => exportCoupleWishesJson(exportRows, '情侣秘密心愿.json')} disabled={!exportRows.length}>导出 JSON</button>
        </div>
      </section>

      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">心愿列表</h3>
          <span className="chip border-slate-200 bg-slate-50 text-slate-500">{filtered.length} 条</span>
        </div>
        {loading && <p className="py-6 text-center text-sm text-slate-400">加载中…</p>}
        {!loading && !filtered.length && <p className="py-6 text-center text-sm text-slate-400">暂无秘密心愿</p>}
        {!loading && filtered.map((wish) => {
          const a = memberById.get(wish.member_a)?.name ?? '未知成员'
          const b = memberById.get(wish.member_b)?.name ?? '未知成员'
          return (
            <article key={wish.id} className="space-y-2 rounded-2xl bg-slate-50 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="break-words text-sm font-semibold text-slate-700">{a} <span className="text-brand-400">↔</span> {b}</div>
                  <div className="mt-1 text-[11px] text-slate-400">{wish.owner_name} 的心愿 · {new Date(wish.created_at).toLocaleString('zh-CN')}</div>
                </div>
                {editingId !== wish.id && <button className="shrink-0 text-xs text-brand-600" onClick={() => { setEditingId(wish.id); setEditText(wish.text) }}>编辑</button>}
              </div>
              {editingId === wish.id ? (
                <div className="space-y-2">
                  <textarea className="input min-h-20 resize-y" maxLength={500} value={editText} onChange={(event) => setEditText(event.target.value)} />
                  <div className="flex gap-2">
                    <button className="btn-primary flex-1" disabled={saving || !editText.trim()} onClick={() => void save(wish)}>保存修改</button>
                    <button className="btn-ghost flex-1" disabled={saving} onClick={() => setEditingId(null)}>取消</button>
                  </div>
                </div>
              ) : <p className="whitespace-pre-wrap break-words rounded-xl bg-white p-3 text-sm text-slate-700">{wish.text}</p>}
            </article>
          )
        })}
      </section>
    </div>
  )
}
