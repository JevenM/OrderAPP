import { useMemo, useState } from 'react'
import type { CoupleWeddingState } from '../../lib/db'
import {
  TOPIC_OWNER_LABEL,
  TOPIC_PRESETS,
  blankTopic,
  topicSummary,
  type WeddingTopic,
} from '../../lib/keepsake'
import { EmptyState } from '../States'
import DateField from '../DateField'
import { useConfirm } from '../Modal'
import { useToast } from '../Toast'

const LOCK_TTL = 60_000
const lockKey = (id: string) => `topic:${id}`
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

type Draft = Pick<WeddingTopic, 'title' | 'mine' | 'theirs' | 'owner' | 'nextTalk' | 'settled' | 'note'>
const emptyDraft = (): Draft => ({ title: '', mine: '', theirs: '', owner: 'both', nextTalk: '', settled: false, note: '' })

type Props = {
  state: CoupleWeddingState | null
  /** 复用备婚流程的「读最新再写」：两个人在不同议题上同时改，后写的也带着对方刚改的内容 */
  mutate: (change: (draft: CoupleWeddingState) => void) => Promise<void>
  saving: boolean
  memberId: string | null
  myName: string
  friendName: string
}

/** C1 备婚沟通台账：把彩礼 / 定居 / 酒席这些要反复谈的事记成结构化记录 */
export default function WeddingTopics({ state, mutate, saving, memberId, myName, friendName }: Props) {
  const toast = useToast()
  const confirm = useConfirm()
  // 稳定数组/对象引用：state 没变时不要让下游 useMemo 和 memo 组件白跑
  const topics = useMemo(() => state?.topics ?? [], [state?.topics])
  const locks = useMemo(() => state?.locks ?? {}, [state?.locks])
  const [editor, setEditor] = useState<{ mode: 'new' | 'edit'; id?: string } | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [showPresets, setShowPresets] = useState(false)

  const summary = useMemo(() => topicSummary(topics), [topics])
  const percent = summary.total ? Math.round((summary.settled / summary.total) * 100) : 0
  const sorted = useMemo(
    () => [...topics].sort((a, b) => Number(a.settled) - Number(b.settled) || b.updatedAt.localeCompare(a.updatedAt)),
    [topics]
  )

  const lockedByOther = (id: string): boolean => {
    const lock = locks[lockKey(id)]
    return Boolean(lock && lock.who !== memberId && Date.now() - new Date(lock.at).getTime() < LOCK_TTL)
  }

  /** 进入编辑即上锁，通过 realtime 同步给对方 */
  const beginEdit = (topic: WeddingTopic) => {
    if (lockedByOther(topic.id)) return toast.show(`${friendName} 正在改这条，稍等一下`, 'err')
    setDraft({
      title: topic.title, mine: topic.mine, theirs: topic.theirs, owner: topic.owner,
      nextTalk: topic.nextTalk, settled: topic.settled, note: topic.note,
    })
    setEditor({ mode: 'edit', id: topic.id })
    void mutate((d) => {
      d.locks[lockKey(topic.id)] = { who: memberId ?? '', at: new Date().toISOString() }
      d.topics = [...(d.topics ?? [])]
    })
  }

  const beginNew = (title = '') => {
    setDraft({ ...emptyDraft(), title })
    setEditor({ mode: 'new' })
    setShowPresets(false)
  }

  /**
   * 保存内容与释放锁写在同一笔 mutate 里：
   * 拆成两次写入时，对方刚好也在写就会把后一次覆盖掉。
   */
  const commit = () => {
    if (!editor) return
    const title = draft.title.trim()
    if (!title) return toast.show('先给议题起个名字', 'err')
    const patch = { ...draft, title: title.slice(0, 40) }
    const now = new Date().toISOString()
    const editingId = editor.id
    const isNew = editor.mode === 'new'
    if (isNew) {
      const id = uid('topic')
      void mutate((d) => {
        d.topics = [blankTopic(id, patch.title, memberId ?? '', now), ...(d.topics ?? [])]
        Object.assign(d.topics[0], patch)
      })
    } else if (editingId) {
      const id = editingId
      void mutate((d) => {
        d.topics = (d.topics ?? []).map((t) => (t.id === id ? { ...t, ...patch, updatedAt: now } : t))
        delete d.locks[lockKey(id)]
      })
    }
    setEditor(null)
    setShowPresets(false)
    toast.show(isNew ? '议题已加入台账' : '已保存')
  }

  const cancel = () => {
    if (editor?.id) {
      const id = editor.id
      void mutate((d) => {
        d.topics = [...(d.topics ?? [])]
        delete d.locks[lockKey(id)]
      })
    }
    setEditor(null)
    setShowPresets(false)
  }

  const toggleSettled = (topic: WeddingTopic) => {
    void mutate((d) => {
      d.topics = (d.topics ?? []).map((t) =>
        t.id === topic.id ? { ...t, settled: !t.settled, updatedAt: new Date().toISOString() } : t
      )
    })
  }

  const remove = async (topic: WeddingTopic) => {
    if (!(await confirm({ title: '删除这条议题？', message: `「${topic.title}」及双方口径、备注会一并删掉。`, danger: true }))) return
    void mutate((d) => {
      d.topics = (d.topics ?? []).filter((t) => t.id !== topic.id)
      delete d.locks[lockKey(topic.id)]
    })
  }

  const exportText = () => {
    const lines = [
      `🗂️ ${myName} × ${friendName} 的备婚沟通台账`,
      '════════════════════════════════',
      `共 ${summary.total} 项 · 已谈拢 ${summary.settled} 项 · 待沟通 ${summary.pending} 项`,
      '',
    ]
    if (!topics.length) lines.push('  （还没有议题）')
    sorted.forEach((t, i) => {
      lines.push(`${String(i + 1).padStart(2, '0')}. ${t.settled ? '✅' : '⏳'} ${t.title}`)
      lines.push(`    我的口径：${t.mine || '（未填）'}`)
      lines.push(`    ${friendName}的口径：${t.theirs || '（未填）'}`)
      lines.push(`    跟进：${TOPIC_OWNER_LABEL[t.owner]}${t.nextTalk ? ` · 下次再聊 ${t.nextTalk}` : ''}`)
      if (t.note) lines.push(`    备注：${t.note}`)
      lines.push('')
    })
    lines.push(`────────────────────────────────`, `导出时间：${new Date().toLocaleString('zh-CN')}`, '')
    const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `备婚沟通台账-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
    toast.show('台账已导出')
  }

  return (
    <section id="couple-active-module" className="card space-y-4">
      <div>
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold">🗂️ 备婚沟通台账</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              异地最怕「以为说好了」——把要谈的事、双方口径和下次再聊的时间都写下来，两人实时同步。
            </p>
          </div>
          <button type="button" className="btn-ghost shrink-0 px-2 py-1 text-[11px]" onClick={exportText}>⬇ 导出</button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-gradient-to-r from-rose-400 to-orange-400 transition-all duration-500" style={{ width: `${percent}%` }} />
          </div>
          <span className="shrink-0 text-[11px] text-slate-500">谈拢 {summary.settled}/{summary.total} · {percent}%</span>
        </div>
      </div>

      {!editor && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={() => beginNew()} disabled={saving}>＋ 新增议题</button>
          <button type="button" className="btn-ghost" onClick={() => setShowPresets((v) => !v)}>从常见议题里挑</button>
        </div>
      )}
      {showPresets && !editor && (
        <div className="flex flex-wrap gap-1.5 rounded-xl bg-slate-50 p-2">
          {TOPIC_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              className="rounded-full border border-rose-100 bg-white px-2.5 py-1 text-[11px] text-rose-600 transition hover:border-rose-300"
              onClick={() => beginNew(p)}
            >
              ＋ {p}
            </button>
          ))}
        </div>
      )}

      {editor && (
        <div className="space-y-2 rounded-xl border border-rose-100 bg-rose-50/50 p-3">
          <div className="text-xs font-semibold text-rose-700">{editor.mode === 'new' ? '新增议题' : '编辑议题'}</div>
          <input className="input" placeholder="议题名称，如：彩礼与嫁妆" maxLength={40} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="block text-[11px] text-slate-500">
              我的口径
              <textarea className="input mt-1 h-20 resize-y" maxLength={300} placeholder="我这边怎么想、底线在哪" value={draft.mine} onChange={(e) => setDraft({ ...draft, mine: e.target.value })} />
            </label>
            <label className="block text-[11px] text-slate-500">
              {friendName} 的口径
              <textarea className="input mt-1 h-20 resize-y" maxLength={300} placeholder="TA 怎么想、家里有什么要求" value={draft.theirs} onChange={(e) => setDraft({ ...draft, theirs: e.target.value })} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-[11px] text-slate-500">
              谁跟进
              <select className="input mt-1" value={draft.owner} onChange={(e) => setDraft({ ...draft, owner: e.target.value as Draft['owner'] })}>
                <option value="both">一起跟进</option>
                <option value="me">{myName} 跟进</option>
                <option value="ta">{friendName} 跟进</option>
              </select>
            </label>
            <div className="block text-[11px] text-slate-500">
              下次再聊
              <DateField
                className="mt-1"
                value={draft.nextTalk}
                onChange={(v) => setDraft({ ...draft, nextTalk: v })}
                placeholder="选个日子"
                floating
              />
            </div>
          </div>
          <label className="block text-[11px] text-slate-500">
            补充细节
            <textarea className="input mt-1 h-16 resize-y" maxLength={500} placeholder="双方家长意见、算过的账、约定好的细节…" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={draft.settled} onChange={(e) => setDraft({ ...draft, settled: e.target.checked })} />
            这件事已经谈拢了
          </label>
          <div className="flex gap-2">
            <button type="button" className="btn-primary flex-1" disabled={saving} onClick={commit}>{saving ? '保存中…' : '保存'}</button>
            <button type="button" className="btn-ghost flex-1" onClick={cancel}>取消</button>
          </div>
        </div>
      )}

      {sorted.length === 0 && !editor ? (
        <EmptyState
          icon="🗂️"
          title="台账还是空的"
          hint="点上面的常见议题，把彩礼、定居、酒席这些需要提前谈拢的事记下来"
        />
      ) : (
        <div className="space-y-2">
          {sorted.map((topic) => {
            const locked = lockedByOther(topic.id)
            return (
              <div key={topic.id} className={`rounded-xl border p-3 ${topic.settled ? 'border-emerald-100 bg-emerald-50/40' : 'border-slate-100 bg-white'}`}>
                <div className="flex items-start gap-2">
                  <span className="text-lg">{topic.settled ? '✅' : '⏳'}</span>
                  <div className="min-w-0 flex-1">
                    <div className="break-words text-sm font-semibold text-slate-700">{topic.title}</div>
                    <div className="mt-1 text-[11px] text-slate-400">
                      {TOPIC_OWNER_LABEL[topic.owner]}
                      {topic.nextTalk && ` · 下次再聊 ${topic.nextTalk}`}
                      {locked && ' · 🔒 TA 正在编辑'}
                    </div>
                  </div>
                </div>
                {(topic.mine || topic.theirs) && (
                  <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    <div className="rounded-lg bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-600">
                      <span className="font-semibold text-slate-500">我的口径：</span>{topic.mine || '（未填）'}
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-600">
                      <span className="font-semibold text-slate-500">{friendName} 的口径：</span>{topic.theirs || '（未填）'}
                    </div>
                  </div>
                )}
                {topic.note && <p className="mt-2 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-slate-500">📝 {topic.note}</p>}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button type="button" className="btn-ghost px-2 py-0.5 text-[11px]" disabled={locked || saving} onClick={() => beginEdit(topic)}>✎ 编辑</button>
                  <button type="button" className="btn-ghost px-2 py-0.5 text-[11px]" disabled={saving} onClick={() => void toggleSettled(topic)}>
                    {topic.settled ? '↩ 重新讨论' : '✓ 标记谈拢'}
                  </button>
                  <button type="button" className="ml-auto px-2 py-0.5 text-[11px] text-slate-400 hover:text-rose-500" disabled={saving} onClick={() => void remove(topic)}>删除</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
