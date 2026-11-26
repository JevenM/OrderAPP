import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { CoupleWeddingState } from '../../lib/db'
import { capsuleDaysLeft, capsuleUnlocked, type TimeCapsule } from '../../lib/keepsake'
import { notifyOpenedCapsules } from '../../lib/capsuleNotify'
import { EmptyState } from '../States'
import Pager, { PAGE_SIZE } from '../Pager'
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
  /** 已开封 / 待开封各自分页 */
  const [openedPage, setOpenedPage] = useState(0)
  const [waitingPage, setWaitingPage] = useState(0)
  /** 编辑中的信（就地展开表单，不改身份/开封人） */
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editOpenAt, setEditOpenAt] = useState('')
  /** 封存动画：整张信纸缩成胶囊后飞入列表，再真正落库 */
  const [sealing, setSealing] = useState(false)
  const [justSealed, setJustSealed] = useState<string | null>(null)
  /** 💊 飞行轨迹：视口中心 → 列表，三次贝塞尔采样出的两个中间点（CSS 变量交给关键帧） */
  const listRef = useRef<HTMLDivElement>(null)
  const [fly, setFly] = useState({ x: 0, y: 60, x1: 0, y1: 12, x2: 0, y2: 24 })

  const { unlocked, waiting } = useMemo(() => {
    const unlockedList: TimeCapsule[] = []
    const waitingList: TimeCapsule[] = []
    for (const c of capsules) (capsuleUnlocked(c.openAt) ? unlockedList : waitingList).push(c)
    unlockedList.sort((a, b) => b.openAt.localeCompare(a.openAt))
    waitingList.sort((a, b) => a.openAt.localeCompare(b.openAt))
    return { unlocked: unlockedList, waiting: waitingList }
  }, [capsules])

  // 开封状态或列表变化后页码可能越界：收敛后再切片
  const safeOpenedPage = Math.min(openedPage, Math.max(0, Math.ceil(unlocked.length / PAGE_SIZE) - 1))
  const safeWaitingPage = Math.min(waitingPage, Math.max(0, Math.ceil(waiting.length / PAGE_SIZE) - 1))

  /** 进入页面时补一次开封提醒；全局检查在 CouplePage 顶层也做了一遍，这里靠本地标记保证幂等 */
  useEffect(() => {
    notifyOpenedCapsules(capsules)
  }, [capsules])

  const submit = () => {
    if (sealing) return
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
    // 先播封存动画：信纸缩成 💊，从视口中心沿三次贝塞尔曲线飞向下方列表。
    // 控制点 P1 贴着起点几乎水平飞出、P2 在终点上方，轨迹是一段自然的弧线而非直线。
    const cx = window.innerWidth / 2
    const cy = window.innerHeight / 2
    const listRect = listRef.current?.getBoundingClientRect()
    const tx = listRect ? listRect.left + listRect.width / 2 : cx
    const ty = listRect ? Math.min(listRect.top + 28, window.innerHeight - 90) : window.innerHeight * 0.78
    const dx = tx - cx
    const dy = ty - cy
    const bez = (t: number) => {
      const u = 1 - t
      return {
        x: 3 * u * u * t * (dx * 0.05) + 3 * u * t * t * (dx * 0.85) + t * t * t * dx,
        y: 3 * u * u * t * (dy * 0.02) + 3 * u * t * t * (dy * 0.45) + t * t * t * dy,
      }
    }
    const b1 = bez(0.3)
    const b2 = bez(0.58)
    setFly({ x: dx, y: dy, x1: b1.x, y1: b1.y, x2: b2.x, y2: b2.y })
    setSealing(true)
    window.setTimeout(() => {
      void mutate((d) => { d.capsules = [letter, ...(d.capsules ?? [])] })
      setWriting(false)
      setSealing(false)
      setTitle('')
      setContent('')
      setOpenedPage(0)
      setWaitingPage(0)
      setJustSealed(letter.id)
      toast.show('信已封好，到那天会自动开封 ✨')
    }, 540)
  }

  /** 打开编辑表单：内容原样带入，只改标题 / 正文 / 开封日期 */
  const startEdit = (c: TimeCapsule) => {
    setEditingId(c.id)
    setEditTitle(c.title)
    setEditContent(c.content)
    setEditOpenAt(c.openAt)
    setExpanded(c.id)
  }

  const saveEdit = () => {
    if (!editingId || saving) return
    const cleanTitle = editTitle.trim().slice(0, 40)
    const cleanContent = editContent.trim()
    if (!cleanTitle) return toast.show('先给这封信写个标题', 'err')
    if (!cleanContent) return toast.show('信还没写内容呢', 'err')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(editOpenAt)) return toast.show('选一个开封日期吧', 'err')
    void mutate((d) => {
      const target = (d.capsules ?? []).find((x) => x.id === editingId)
      if (!target) return
      target.title = cleanTitle
      target.content = cleanContent.slice(0, 3000)
      target.openAt = editOpenAt
    })
    setEditingId(null)
    toast.show('这封信已更新 ✨')
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
      <div
        key={c.id}
        className={`rounded-xl border p-3 ${opened ? 'border-rose-100 bg-rose-50/40' : 'border-slate-100 bg-white'} ${
          justSealed === c.id ? 'animate-pop-in ring-2 ring-rose-300' : ''
        }`}
      >
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
            <>
              <button
                type="button"
                className="px-2 py-0.5 text-[11px] text-slate-400 hover:text-rose-500"
                disabled={saving}
                onClick={() => (editingId === c.id ? setEditingId(null) : startEdit(c))}
              >
                {editingId === c.id ? '取消修改' : '编辑'}
              </button>
              <button
                type="button"
                className="ml-auto px-2 py-0.5 text-[11px] text-slate-400 hover:text-rose-500"
                disabled={saving}
                onClick={() => void remove(c)}
              >
                删除
              </button>
            </>
          )}
        </div>

        {editingId === c.id && (
          <div className="mt-2 space-y-2 rounded-lg border border-rose-100 bg-rose-50/70 p-2.5">
            <div className="text-[11px] font-semibold text-rose-700">修改这封信</div>
            <input
              className="input"
              maxLength={40}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="标题"
            />
            <textarea
              className="input h-28 resize-y"
              maxLength={3000}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="信的内容"
            />
            <div className="block text-[11px] text-slate-500">
              开封日期
              <DateField className="mt-1" value={editOpenAt} onChange={setEditOpenAt} min={dayStr(new Date())} />
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn-primary flex-1 py-1.5 text-[11px]" disabled={saving} onClick={saveEdit}>
                {saving ? '保存中…' : '保存修改'}
              </button>
              <button type="button" className="btn-ghost flex-1 py-1.5 text-[11px]" onClick={() => setEditingId(null)}>
                取消
              </button>
            </div>
          </div>
        )}
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
              写给某天的TA。到约定日期自动开封，在那之前只有写信的人能预览。
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
        <div className="relative">
          {/* 封存时信纸整体缩成小胶囊淡出，💊 从中心飞向列表；动画结束才落库并退出编辑态 */}
          <div
            className={`origin-center space-y-2 rounded-xl border border-rose-100 bg-rose-50/50 p-3 transition-all duration-500 ease-out ${
              sealing ? 'pointer-events-none -translate-y-16 scale-[0.18] opacity-0' : ''
            }`}
          >
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
            <button type="button" className="btn-primary flex-1" disabled={saving || sealing} onClick={submit}>
              {sealing ? '封存中…' : saving ? '保存中…' : '封存这封信'}
            </button>
            <button type="button" className="btn-ghost flex-1" disabled={sealing} onClick={() => setWriting(false)}>取消</button>
          </div>
          </div>
        </div>
      )}

      {/* 💊 从视口中心浮出：Portal 挂 body 避开 .card:active 等祖先 transform 对 fixed 的干扰，
          关键帧按贝塞尔采样点飞行，先放大到 1.35 倍再缩小到 0.3 倍并淡出 */}
      {sealing &&
        createPortal(
          <div className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center">
            <span
              className="capsule-fly text-4xl drop-shadow"
              style={
                {
                  '--fly-x': `${fly.x}px`,
                  '--fly-y': `${fly.y}px`,
                  '--fly-1x': `${fly.x1}px`,
                  '--fly-1y': `${fly.y1}px`,
                  '--fly-2x': `${fly.x2}px`,
                  '--fly-2y': `${fly.y2}px`,
                } as CSSProperties
              }
            >
              💊
            </span>
          </div>,
          document.body
        )}

      {capsules.length === 0 && !writing ? (
        <EmptyState icon="💌" title="还没有寄出的信" hint="选一个日子，把现在的心情留给那天的你们" />
      ) : (
        <div ref={listRef} className="space-y-4">
          {unlocked.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-500">✨ 已开封 · {unlocked.length} 封</h4>
              {unlocked.slice(safeOpenedPage * PAGE_SIZE, (safeOpenedPage + 1) * PAGE_SIZE).map((c) => renderLetter(c, true))}
              <Pager page={safeOpenedPage} total={unlocked.length} onChange={setOpenedPage} totalLabel={`共 ${unlocked.length} 封`} />
            </div>
          )}
          {waiting.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-500">⏳ 等待开封 · {waiting.length} 封</h4>
              {waiting.slice(safeWaitingPage * PAGE_SIZE, (safeWaitingPage + 1) * PAGE_SIZE).map((c) => renderLetter(c, false))}
              <Pager page={safeWaitingPage} total={waiting.length} onChange={setWaitingPage} totalLabel={`共 ${waiting.length} 封`} />
            </div>
          )}
        </div>
      )}
    </section>
  )
}
