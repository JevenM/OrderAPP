import { useEffect, useMemo, useState } from 'react'
import type { CoupleWeddingState } from '../../lib/db'
import { capsuleDaysLeft, capsuleUnlocked, type TimeCapsule } from '../../lib/keepsake'
import { notifyOpenedCapsules } from '../../lib/capsuleNotify'
import { EmptyState } from '../States'
import DateField from '../DateField'
import { useConfirm } from '../Modal'
import { useToast } from '../Toast'

const uid = () => `capsule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
const dayStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const addMonths = (months: number) => {
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return dayStr(d)
}
const dateCn = (value: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return m ? `${m[1]} 年 ${Number(m[2])} 月 ${Number(m[3])} 日` : value
}

type Props = {
  state: CoupleWeddingState | null
  mutate: (change: (draft: CoupleWeddingState) => void) => Promise<void>
  saving: boolean
  memberId: string | null
  myName: string
  friendName: string
}

/** F3 时光胶囊：写给未来的信，到约定那天零点自动开封，两人可见 */
export default function TimeCapsuleBoard({ state, mutate, saving, memberId, myName, friendName }: Props) {
  const toast = useToast()
  const confirm = useConfirm()
  // 引用稳定：realtime 推来同内容时不要反复触发「开封通知」检查
  const capsules = useMemo(() => state?.capsules ?? [], [state?.capsules])
  const [writing, setWriting] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [openAt, setOpenAt] = useState(() => addMonths(12))
  const [expanded, setExpanded] = useState<string | null>(null)

  const { unlocked, waiting } = useMemo(() => {
    const unlockedList: TimeCapsule[] = []
    const waitingList: TimeCapsule[] = []
    for (const c of capsules) (capsuleUnlocked(c.openAt) ? unlockedList : waitingList).push(c)
    unlockedList.sort((a, b) => b.openAt.localeCompare(a.openAt))
    waitingList.sort((a, b) => a.openAt.localeCompare(b.openAt))
    return { unlocked: unlockedList, waiting: waitingList }
  }, [capsules])

  /** 进入页面时补一次开封提醒；全局检查在 CouplePage 顶层也做了一遍，这里靠本地标记保证幂等 */
  useEffect(() => {
    notifyOpenedCapsules(capsules)
  }, [capsules])

  const submit = () => {
    const cleanTitle = title.trim().slice(0, 40)
    const cleanContent = content.trim()
    if (!cleanTitle) return toast.show('先给这封信写个标题', 'err')
    if (!cleanContent) return toast.show('信还没写内容呢', 'err')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(openAt)) return toast.show('选一个开封日期吧', 'err')
    const letter: TimeCapsule = {
      id: uid(), author: memberId ?? '', authorName: myName,
      title: cleanTitle, content: cleanContent.slice(0, 3000), openAt,
      createdAt: new Date().toISOString(),
    }
    void mutate((d) => { d.capsules = [letter, ...(d.capsules ?? [])] })
    setWriting(false)
    setTitle('')
    setContent('')
    toast.show('信已封好，到那天会自动开封 ✨')
  }

  const remove = async (c: TimeCapsule) => {
    if (!(await confirm({ title: '删掉这封信？', message: `「${c.title}」会永久消失。`, danger: true }))) return
    void mutate((d) => { d.capsules = (d.capsules ?? []).filter((x) => x.id !== c.id) })
  }

  const exportOpened = () => {
    const lines = [
      `💌 ${myName} × ${friendName} 的时光胶囊`, '════════════════════════════════',
      `已开封 ${unlocked.length} 封 · 等待开封 ${waiting.length} 封`, '',
    ]
    for (const c of unlocked) {
      lines.push(`【${c.title}】`, `  来自 ${c.authorName} · 约定 ${dateCn(c.openAt)} 开封`, '', c.content, '', '────────────────────────────────')
    }
    lines.push(`导出时间：${new Date().toLocaleString('zh-CN')}`, '')
    const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `时光胶囊-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const renderLetter = (c: TimeCapsule, opened: boolean) => {
    const mine = c.author === memberId
    const canRead = opened || mine
    const days = capsuleDaysLeft(c.openAt)
    const isOpen = expanded === c.id
    return (
      <div key={c.id} className={`rounded-xl border p-3 ${opened ? 'border-rose-100 bg-rose-50/40' : 'border-slate-100 bg-white'}`}>
        <div className="flex items-start gap-2">
          <span className="text-lg">{opened ? '💌' : '🔒'}</span>
          <div className="min-w-0 flex-1">
            <div className="break-words text-sm font-semibold text-slate-700">{c.title}</div>
            <div className="mt-1 text-[11px] text-slate-400">
              {c.authorName} 写 · {dateCn(c.openAt)} 开封
              {!opened && ` · 还有 ${days} 天`}
            </div>
          </div>
          {!opened && !mine && <span className="chip shrink-0 border-slate-200 bg-slate-50 text-slate-400">未开封</span>}
        </div>
        {!canRead ? (
          <p className="mt-2 rounded-lg bg-slate-50 px-2 py-2 text-[11px] leading-relaxed text-slate-400">
            🔐 内容要到约定那天才揭晓，耐心等等吧
          </p>
        ) : (
          <>
            {isOpen ? (
              <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-white/70 px-2 py-2 text-xs leading-relaxed text-slate-600">{c.content}</p>
            ) : (
              <button
                type="button"
                className="mt-2 block w-full truncate rounded-lg bg-white/70 px-2 py-2 text-left text-[11px] text-slate-400"
                onClick={() => setExpanded(c.id)}
              >
                {mine && !opened ? '👀 只有你能预览 · 点击展开' : '点击展开这封信'}
              </button>
            )}
          </>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {canRead && (
            <button type="button" className="btn-ghost px-2 py-0.5 text-[11px]" onClick={() => setExpanded(isOpen ? null : c.id)}>
              {isOpen ? '收起' : '展开'}
            </button>
          )}
          {mine && (
            <button type="button" className="ml-auto px-2 py-0.5 text-[11px] text-slate-400 hover:text-rose-500" disabled={saving} onClick={() => void remove(c)}>删除</button>
          )}
        </div>
      </div>
    )
  }

  return (
    <section id="couple-active-module" className="card space-y-4">
      <div>
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold">💌 时光胶囊</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              写给领证那天、婚礼那天或一年后的你们。到约定日期自动开封，在那之前只有写信的人能预览。
            </p>
          </div>
          {unlocked.length > 0 && (
            <button type="button" className="btn-ghost shrink-0 px-2 py-1 text-[11px]" onClick={exportOpened}>⬇ 导出</button>
          )}
        </div>
      </div>

      {!writing ? (
        <button type="button" className="btn-primary w-full" onClick={() => setWriting(true)} disabled={saving}>✍️ 写一封给未来的信</button>
      ) : (
        <div className="space-y-2 rounded-xl border border-rose-100 bg-rose-50/50 p-3">
          <div className="text-xs font-semibold text-rose-700">写给未来的信</div>
          <input className="input" placeholder="标题，如：领证那天想说的话" maxLength={40} value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea
            className="input h-32 resize-y"
            maxLength={3000}
            placeholder="写点什么给那天的你们吧…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="block text-[11px] text-slate-500">
            开封日期
            <DateField className="mt-1" value={openAt} onChange={setOpenAt} min={dayStr(new Date())} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[3, 6, 12, 24].map((m) => (
              <button key={m} type="button" className="rounded-full border border-rose-100 bg-white px-2.5 py-1 text-[11px] text-rose-600" onClick={() => setOpenAt(addMonths(m))}>
                {m >= 12 ? `${m / 12} 年后` : `${m} 个月后`}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-primary flex-1" disabled={saving} onClick={submit}>{saving ? '封存中…' : '封存这封信'}</button>
            <button type="button" className="btn-ghost flex-1" onClick={() => setWriting(false)}>取消</button>
          </div>
        </div>
      )}

      {capsules.length === 0 && !writing ? (
        <EmptyState icon="💌" title="还没有寄出的信" hint="选一个日子，把现在的心情留给那天的你们" />
      ) : (
        <div className="space-y-4">
          {unlocked.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-500">✨ 已开封 · {unlocked.length} 封</h4>
              {unlocked.map((c) => renderLetter(c, true))}
            </div>
          )}
          {waiting.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-500">⏳ 等待开封 · {waiting.length} 封</h4>
              {waiting.map((c) => renderLetter(c, false))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
