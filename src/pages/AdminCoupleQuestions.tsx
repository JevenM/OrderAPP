import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from '../components/Toast'
import { deleteCoupleQuizBankQuestion, listAllFriendships, listCoupleQuizBank, listCoupleQuizPairQuestions, saveCoupleQuizBankQuestion, saveCoupleQuizPairQuestions, setCoupleQuizBankQuestionEnabled, type CoupleQuizBankRow } from '../lib/db'
import { ALL_QUESTIONS, type Question, type QuestionKind } from './CouplePage'
import { useMembers } from '../store/members'

const EMPTY: Omit<Question, 'id'> = { title: '', a: '', b: '', kind: '轻松版' }

export default function AdminCoupleQuestions() {
  const toast = useToast()
  const { members, loading: membersLoading } = useMembers()
  const [questions, setQuestions] = useState<CoupleQuizBankRow[]>([])
  const [pairs, setPairs] = useState<{ a: string; b: string; label: string }[]>([])
  const [selectedPair, setSelectedPair] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [usesDefaultPool, setUsesDefaultPool] = useState(true)
  const [editing, setEditing] = useState<(Partial<CoupleQuizBankRow> & { title: string; a: string; b: string; kind: QuestionKind }) | null>(null)
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const memberNames = useMemo(() => new Map(members.map((member) => [member.id, member.name])), [members])
  const pair = pairs.find((item) => `${item.a}|${item.b}` === selectedPair)
  const visibleQuestions = useMemo(() => {
    const normalized = filter.trim().toLocaleLowerCase()
    return questions.filter((question) => !normalized || `${question.title} ${question.a} ${question.b}`.toLocaleLowerCase().includes(normalized))
  }, [questions, filter])

  const reloadQuestions = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await listCoupleQuizBank(ALL_QUESTIONS)
      setQuestions(rows)
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setLoading(false)
    }
  }, [toast])

  const reloadPairs = useCallback(async () => {
    try {
      const relations = await listAllFriendships()
      const acceptedPairs = relations.filter((relation) => relation.status === 'accepted').map((relation) => {
        const [a, b] = [relation.requester_id, relation.addressee_id].sort()
        return { a, b, label: `${memberNames.get(a) ?? '未知成员'} ↔ ${memberNames.get(b) ?? '未知成员'}` }
      })
      setPairs(acceptedPairs)
      setSelectedPair((current) => current || (acceptedPairs[0] ? `${acceptedPairs[0].a}|${acceptedPairs[0].b}` : ''))
    } catch (error) {
      toast.show((error as Error).message, 'err')
    }
  }, [memberNames, toast])

  useEffect(() => { void reloadQuestions() }, [reloadQuestions])
  useEffect(() => { void reloadPairs() }, [reloadPairs])

  useEffect(() => {
    if (!pair) return
    let active = true
    void listCoupleQuizPairQuestions(pair.a, pair.b).then((rows) => {
      if (!active) return
      const configuredIds = rows[0]?.question_ids
      setUsesDefaultPool(!configuredIds?.length || (configuredIds.length === questions.filter((question) => question.enabled).length && questions.filter((question) => question.enabled).every((question) => configuredIds.includes(question.id))))
      setSelectedIds(new Set(configuredIds?.length ? configuredIds : questions.filter((question) => question.enabled).map((question) => question.id)))
    }).catch((error) => toast.show((error as Error).message, 'err'))
    return () => { active = false }
  }, [pair?.a, pair?.b, questions, toast])

  const openNew = () => {
    setEditing({ ...EMPTY })
    window.setTimeout(() => document.querySelector('#couple-question-title')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
  }
  const openEdit = (question: CoupleQuizBankRow) => setEditing({ ...question })

  const saveQuestion = async () => {
    if (!editing) return
    const title = editing.title.trim()
    const a = editing.a.trim()
    const b = editing.b.trim()
    if (!title || !a || !b) return toast.show('题目和两个选项都需要填写', 'err')
    setSaving(true)
    try {
      await saveCoupleQuizBankQuestion({ id: editing.id, title, a, b, kind: editing.kind ?? '轻松版', sort_order: editing.sort_order ?? questions.length })
      setEditing(null)
      toast.show('题目已保存')
      await reloadQuestions()
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setSaving(false)
    }
  }

  const removeQuestion = async (question: CoupleQuizBankRow) => {
    if (!window.confirm(`确定删除「${question.title}」？已保存的答题历史仍会保留。`)) return
    setSaving(true)
    try {
      await deleteCoupleQuizBankQuestion(question.id)
      setSelectedIds((current) => { const next = new Set(current); next.delete(question.id); return next })
      toast.show('题目已删除')
      await reloadQuestions()
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setSaving(false)
    }
  }

  const toggleQuestion = (id: string) => {
    setUsesDefaultPool(false)
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const savePairQuestions = async () => {
    if (!pair) return toast.show('还没有已建立好友关系的情侣对', 'err')
    if (selectedIds.size === 0) return toast.show('至少勾选一道可以随机到的题目', 'err')
    setSaving(true)
    try {
      await saveCoupleQuizPairQuestions(pair.a, pair.b, [...selectedIds])
      setUsesDefaultPool(false)
      toast.show(`已保存「${pair.label}」的 ${selectedIds.size} 道可抽题目`)
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setSaving(false)
    }
  }

  const useGlobalPool = async () => {
    if (!pair) return
    setSaving(true)
    try {
      const enabledIds = questions.filter((question) => question.enabled).map((question) => question.id)
      await saveCoupleQuizPairQuestions(pair.a, pair.b, enabledIds)
      setUsesDefaultPool(true)
      setSelectedIds(new Set(enabledIds))
      toast.show('已恢复使用全部启用题目')
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold">同步抉择题库管理</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">维护全局题库，并为每对情侣指定可随机抽取的题目。停用题目不会删除已有答题历史。</p>
          </div>
          <span className="chip shrink-0 border-brand-200 bg-brand-50 text-brand-600">管理员</span>
        </div>
        <button className="btn-primary w-full" onClick={openNew}>新增题目</button>
      </section>

      <section className="card space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold">每对情侣的可抽题目</h3>
          <span className="text-xs text-slate-400">{pairs.length} 对</span>
        </div>
        <select className="input" value={selectedPair} disabled={membersLoading || !pairs.length} onChange={(event) => setSelectedPair(event.target.value)}>
          {pairs.length ? pairs.map((item) => <option key={`${item.a}|${item.b}`} value={`${item.a}|${item.b}`}>{item.label}</option>) : <option value="">暂无已建立的好友关系</option>}
        </select>
        {pair && <>
          <div className="flex items-center justify-between gap-2 rounded-xl bg-brand-50 px-3 py-2 text-xs text-brand-700">
            <span>{usesDefaultPool ? '当前使用全部启用题目' : `当前自定义题池：${selectedIds.size} 道`}</span>
            {<button className="underline" disabled={saving} onClick={() => void useGlobalPool()}>{usesDefaultPool ? '应用勾选项' : '恢复全部启用题目'}</button>}
          </div>
          <div className="max-h-[45vh] space-y-2 overflow-y-auto">
            {questions.map((question) => (
              <label key={question.id} className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 ${!question.enabled ? 'opacity-50' : ''}`}>
                <input className="mt-1" type="checkbox" checked={selectedIds.has(question.id)} disabled={!question.enabled || saving} onChange={() => toggleQuestion(question.id)} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1 text-sm font-medium"><span>{question.title}</span><span className="chip border-slate-200 bg-slate-50 text-[10px] text-slate-500">{question.kind}</span>{!question.enabled && <span className="text-[10px] text-slate-400">已停用</span>}</span>
                  <span className="mt-1 block text-xs text-slate-500">A. {question.a}　/　B. {question.b}</span>
                </span>
              </label>
            ))}
          </div>
          <button className="btn-primary w-full" disabled={saving || !selectedIds.size} onClick={() => void savePairQuestions()}>保存此情侣题池</button>
        </>}
      </section>

      <section className="card space-y-3">
        <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">题库</h3><span className="chip border-slate-200 bg-slate-50 text-slate-500">{questions.length} 道</span></div>
        <input className="input" placeholder="搜索题目或选项" value={filter} onChange={(event) => setFilter(event.target.value)} />
        {loading && <p className="py-5 text-center text-sm text-slate-400">加载中…</p>}
        {!loading && !visibleQuestions.length && <p className="py-5 text-center text-sm text-slate-400">没有匹配的题目</p>}
        <div className="space-y-2">
          {visibleQuestions.map((question) => (
            <article key={question.id} className="space-y-2 rounded-xl bg-slate-50 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-1"><strong className="text-sm">{question.title}</strong><span className="chip border-slate-200 bg-white text-[10px] text-slate-500">{question.kind}</span><span className={`chip text-[10px] ${question.enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-600' : 'border-slate-200 bg-white text-slate-400'}`}>{question.enabled ? '启用' : '停用'}</span></div><p className="mt-1 text-xs text-slate-500">A. {question.a}　/　B. {question.b}</p></div>
                <div className="flex shrink-0 gap-2"><button className="text-xs text-brand-600" onClick={() => openEdit(question)}>编辑</button><button className="text-xs text-rose-500" disabled={saving} onClick={() => void removeQuestion(question)}>删除</button></div>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-500"><input type="checkbox" checked={question.enabled} disabled={saving} onChange={async (event) => {
                const enabled = event.target.checked
                setSaving(true)
                try {
                  await setCoupleQuizBankQuestionEnabled(question.id, enabled)
                  await reloadQuestions()
                } catch (error) { toast.show((error as Error).message, 'err') }
                finally { setSaving(false) }
              }} />全局启用</label>
            </article>
          ))}
        </div>
      </section>

      {editing && <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" onClick={() => setEditing(null)}>
        <section className="w-full max-w-lg space-y-3 rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between"><h3 className="font-semibold">{editing.id ? '编辑题目' : '新增题目'}</h3><button className="text-slate-400" onClick={() => setEditing(null)}>关闭</button></div>
          <input id="couple-question-title" className="input" maxLength={160} placeholder="题目标题" value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} />
          <input className="input" maxLength={160} placeholder="选项 A" value={editing.a} onChange={(event) => setEditing({ ...editing, a: event.target.value })} />
          <input className="input" maxLength={160} placeholder="选项 B" value={editing.b} onChange={(event) => setEditing({ ...editing, b: event.target.value })} />
          <select className="input" value={editing.kind} onChange={(event) => setEditing({ ...editing, kind: event.target.value as QuestionKind })}><option value="轻松版">轻松版</option><option value="走心版">走心版</option></select>
          <div className="grid grid-cols-2 gap-2"><button className="btn-ghost" disabled={saving} onClick={() => setEditing(null)}>取消</button><button className="btn-primary" disabled={saving} onClick={() => void saveQuestion()}>{saving ? '保存中…' : '保存题目'}</button></div>
        </section>
      </div>}
    </div>
  )
}
